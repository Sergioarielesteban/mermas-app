import type { SupabaseClient } from '@supabase/supabase-js';
import type { AllergenKey, ServicioCourse, ServicioDish, ServicioIngredient, ServicioStep } from '@/lib/servicio/types';
import type { ServicioDbCategoria, ServicioDificultad, ServicioPlanEstado, ServicioProduccionOrigen } from '@/lib/servicio/constants';
import { isAllergenKey } from '@/lib/servicio/constants';
import { compressImageToWebpBlob } from '@/lib/servicio/image-upload';

const BUCKET = 'servicio-media';

export type ServicioPlatoRow = {
  id: string;
  local_id: string;
  nombre: string;
  slug: string | null;
  categoria: ServicioDbCategoria;
  descripcion_corta: string;
  imagen_url: string | null;
  raciones_base: number;
  tiempo_total_min: number;
  dificultad: ServicioDificultad;
  coste_por_racion: number | null;
  pvp_sugerido: number | null;
  margen_bruto: number | null;
  activo: boolean;
  favorito: boolean;
  orden_visual: number;
};

export type ServicioPlanDiaRow = {
  id: string;
  local_id: string;
  fecha: string;
  plato_id: string;
  categoria: ServicioDbCategoria;
  raciones_previstas: number;
  estado: ServicioPlanEstado;
  orden: number;
};

export type ServicioProduccionRow = {
  id: string;
  local_id: string;
  fecha: string;
  texto_tarea: string;
  cantidad: number | null;
  unidad: string;
  completado: boolean;
  orden: number;
  origen: ServicioProduccionOrigen;
};

export type ServicioPasoInput = {
  id?: string;
  orden: number;
  titulo: string;
  descripcion_corta: string;
  imagen_url: string | null;
  tiempo_min: number | null;
};

export type ServicioIngredienteInput = {
  id?: string;
  orden: number;
  nombre_ingrediente: string;
  cantidad: number;
  unidad: string;
  observaciones: string | null;
};

function mapEstadoToCard(estado: ServicioPlanEstado): ServicioDish['status'] {
  if (estado === 'listo') return 'listo';
  return 'preparacion';
}

function mapDificultadToCard(d: ServicioDificultad): ServicioDish['difficulty'] {
  return d;
}

export function tabMatchesPlanCategoria(tab: ServicioCourse, categoria: ServicioDbCategoria): boolean {
  if (tab === 'entrantes') return categoria === 'entrante' || categoria === 'otros';
  if (tab === 'principales') return categoria === 'principal';
  return categoria === 'postre';
}

export async function fetchAlergenosForPlatos(
  supabase: SupabaseClient,
  platoIds: string[],
): Promise<Map<string, AllergenKey[]>> {
  const map = new Map<string, AllergenKey[]>();
  if (!platoIds.length) return map;
  const { data, error } = await supabase
    .from('servicio_plato_alergenos')
    .select('plato_id, alergeno_key')
    .in('plato_id', platoIds);
  if (error || !data) return map;
  for (const row of data as { plato_id: string; alergeno_key: string }[]) {
    if (!isAllergenKey(row.alergeno_key)) continue;
    const cur = map.get(row.plato_id) ?? [];
    cur.push(row.alergeno_key);
    map.set(row.plato_id, cur);
  }
  return map;
}

export async function fetchPlanDiaRows(
  supabase: SupabaseClient,
  localId: string,
  fecha: string,
): Promise<{ plan: ServicioPlanDiaRow[]; platos: Map<string, ServicioPlatoRow>; error?: string }> {
  const { data: planRows, error: e1 } = await supabase
    .from('servicio_plan_dia')
    .select('id, local_id, fecha, plato_id, categoria, raciones_previstas, estado, orden')
    .eq('local_id', localId)
    .eq('fecha', fecha)
    .order('categoria', { ascending: true })
    .order('orden', { ascending: true });
  if (e1) return { plan: [], platos: new Map(), error: e1.message };
  const plan = (planRows ?? []) as ServicioPlanDiaRow[];
  const ids = [...new Set(plan.map((p) => p.plato_id))];
  const platos = new Map<string, ServicioPlatoRow>();
  if (!ids.length) return { plan, platos };
  const { data: platoRows, error: e2 } = await supabase
    .from('servicio_platos')
    .select(
      'id, local_id, nombre, slug, categoria, descripcion_corta, imagen_url, raciones_base, tiempo_total_min, dificultad, coste_por_racion, pvp_sugerido, margen_bruto, activo, favorito, orden_visual',
    )
    .eq('local_id', localId)
    .in('id', ids);
  if (e2) return { plan, platos, error: e2.message };
  for (const r of (platoRows ?? []) as ServicioPlatoRow[]) {
    platos.set(r.id, r);
  }
  return { plan, platos };
}

export function planRowsToDisplayDishes(
  plan: ServicioPlanDiaRow[],
  platos: Map<string, ServicioPlatoRow>,
  allergens: Map<string, AllergenKey[]>,
  tab: ServicioCourse,
): ServicioDish[] {
  const out: ServicioDish[] = [];
  for (const line of plan) {
    if (!tabMatchesPlanCategoria(tab, line.categoria)) continue;
    const p = platos.get(line.plato_id);
    if (!p) continue;
    const img = (p.imagen_url ?? '').trim() || '/logo-chef-one.svg';
    const allergensList = allergens.get(p.id) ?? [];
    const course: ServicioCourse =
      line.categoria === 'principal'
        ? 'principales'
        : line.categoria === 'postre'
          ? 'postres'
          : 'entrantes';
    out.push({
      id: p.id,
      platoId: p.id,
      planLineId: line.id,
      name: p.nombre,
      shortDesc: p.descripcion_corta || '—',
      course,
      portions: line.raciones_previstas,
      allergens: allergensList,
      status: mapEstadoToCard(line.estado),
      imageUrl: img,
      totalTimeMin: p.tiempo_total_min,
      difficulty: mapDificultadToCard(p.dificultad),
      costeRacionEuro: p.coste_por_racion != null ? Number(p.coste_por_racion) : undefined,
      pvpEuro: p.pvp_sugerido != null ? Number(p.pvp_sugerido) : undefined,
      steps: [],
      ingredients: [],
    });
  }
  return out;
}

export async function fetchPlatoDetail(
  supabase: SupabaseClient,
  localId: string,
  platoId: string,
): Promise<ServicioDish | null> {
  const { data: p, error } = await supabase
    .from('servicio_platos')
    .select(
      'id, local_id, nombre, slug, categoria, descripcion_corta, imagen_url, raciones_base, tiempo_total_min, dificultad, coste_por_racion, pvp_sugerido, margen_bruto, activo, favorito, orden_visual',
    )
    .eq('local_id', localId)
    .eq('id', platoId)
    .maybeSingle();
  if (error || !p) return null;
  const plato = p as ServicioPlatoRow;
  const [{ data: pasos }, { data: ings }, { data: algs }] = await Promise.all([
    supabase
      .from('servicio_plato_pasos')
      .select('id, orden, titulo, descripcion_corta, imagen_url, tiempo_min')
      .eq('plato_id', platoId)
      .order('orden', { ascending: true }),
    supabase
      .from('servicio_plato_ingredientes')
      .select('id, orden, nombre_ingrediente, cantidad, unidad, observaciones')
      .eq('plato_id', platoId)
      .order('orden', { ascending: true }),
    supabase.from('servicio_plato_alergenos').select('alergeno_key').eq('plato_id', platoId),
  ]);
  const allergens: AllergenKey[] = [];
  for (const row of (algs ?? []) as { alergeno_key: string }[]) {
    if (isAllergenKey(row.alergeno_key)) allergens.push(row.alergeno_key);
  }
  const steps: ServicioStep[] = (pasos ?? []).map((row: Record<string, unknown>, idx: number) => ({
    n: typeof row.orden === 'number' ? row.orden + 1 : idx + 1,
    text: [String(row.titulo ?? ''), String(row.descripcion_corta ?? '')].filter(Boolean).join(' — ') || '—',
    imageUrl: row.imagen_url ? String(row.imagen_url) : undefined,
  }));
  const ingredients: ServicioIngredient[] = (ings ?? []).map((row: Record<string, unknown>) => ({
    name: String(row.nombre_ingrediente ?? ''),
    qty: `${row.cantidad ?? ''} ${row.unidad ?? ''}`.trim(),
  }));
  const course: ServicioCourse =
    plato.categoria === 'principal' ? 'principales' : plato.categoria === 'postre' ? 'postres' : 'entrantes';
  const img = (plato.imagen_url ?? '').trim() || '/logo-chef-one.svg';
  return {
    id: plato.id,
    platoId: plato.id,
    name: plato.nombre,
    shortDesc: plato.descripcion_corta || '—',
    course,
    portions: plato.raciones_base,
    allergens,
    status: plato.activo ? 'listo' : 'preparacion',
    imageUrl: img,
    totalTimeMin: plato.tiempo_total_min,
    difficulty: mapDificultadToCard(plato.dificultad),
    costeRacionEuro: plato.coste_por_racion != null ? Number(plato.coste_por_racion) : undefined,
    pvpEuro: plato.pvp_sugerido != null ? Number(plato.pvp_sugerido) : undefined,
    steps,
    ingredients,
    activo: plato.activo,
  };
}

export async function fetchPlatoForEditor(
  supabase: SupabaseClient,
  localId: string,
  platoId: string,
): Promise<{
  plato: ServicioPlatoRow;
  pasos: ServicioPasoInput[];
  ingredientes: ServicioIngredienteInput[];
  alergenos: AllergenKey[];
} | null> {
  const { data: p, error } = await supabase
    .from('servicio_platos')
    .select(
      'id, local_id, nombre, slug, categoria, descripcion_corta, imagen_url, raciones_base, tiempo_total_min, dificultad, coste_por_racion, pvp_sugerido, margen_bruto, activo, favorito, orden_visual',
    )
    .eq('local_id', localId)
    .eq('id', platoId)
    .maybeSingle();
  if (error || !p) return null;
  const plato = p as ServicioPlatoRow;
  const [{ data: pasos }, { data: ings }, { data: algs }] = await Promise.all([
    supabase
      .from('servicio_plato_pasos')
      .select('id, orden, titulo, descripcion_corta, imagen_url, tiempo_min')
      .eq('plato_id', platoId)
      .order('orden', { ascending: true }),
    supabase
      .from('servicio_plato_ingredientes')
      .select('id, orden, nombre_ingrediente, cantidad, unidad, observaciones')
      .eq('plato_id', platoId)
      .order('orden', { ascending: true }),
    supabase.from('servicio_plato_alergenos').select('alergeno_key').eq('plato_id', platoId),
  ]);
  const alergenos: AllergenKey[] = [];
  for (const row of (algs ?? []) as { alergeno_key: string }[]) {
    if (isAllergenKey(row.alergeno_key)) alergenos.push(row.alergeno_key);
  }
  return {
    plato,
    pasos: (pasos ?? []) as ServicioPasoInput[],
    ingredientes: (ings ?? []) as ServicioIngredienteInput[],
    alergenos,
  };
}

export async function listPlatosActivosPick(
  supabase: SupabaseClient,
  localId: string,
): Promise<ServicioPlatoRow[]> {
  const { data, error } = await supabase
    .from('servicio_platos')
    .select(
      'id, local_id, nombre, slug, categoria, descripcion_corta, imagen_url, raciones_base, tiempo_total_min, dificultad, coste_por_racion, pvp_sugerido, margen_bruto, activo, favorito, orden_visual',
    )
    .eq('local_id', localId)
    .eq('activo', true)
    .order('nombre', { ascending: true });
  if (error || !data) return [];
  return data as ServicioPlatoRow[];
}

export async function countPlanFromDate(
  supabase: SupabaseClient,
  localId: string,
  platoId: string,
  fromIsoDate: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('servicio_plan_dia')
    .select('id', { count: 'exact', head: true })
    .eq('local_id', localId)
    .eq('plato_id', platoId)
    .gte('fecha', fromIsoDate);
  if (error) return 999;
  return count ?? 0;
}

export async function softDeletePlato(
  supabase: SupabaseClient,
  localId: string,
  platoId: string,
  fromIsoDate: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const n = await countPlanFromDate(supabase, localId, platoId, fromIsoDate);
  if (n > 0) {
    return {
      ok: false,
      message: `Este plato está en ${n} servicio(s) desde ${fromIsoDate}. Qúitalo del plan o cambia las fechas antes de archivarlo.`,
    };
  }
  const { error } = await supabase.from('servicio_platos').update({ activo: false }).eq('id', platoId).eq('local_id', localId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export type PlatoUpsertPayload = {
  nombre: string;
  slug: string | null;
  categoria: ServicioDbCategoria;
  descripcion_corta: string;
  imagen_url: string | null;
  raciones_base: number;
  tiempo_total_min: number;
  dificultad: ServicioDificultad;
  coste_por_racion: number | null;
  pvp_sugerido: number | null;
  margen_bruto: number | null;
  activo: boolean;
  favorito?: boolean;
  orden_visual?: number;
};

export function platoRowToUpsertPayload(p: ServicioPlatoRow): PlatoUpsertPayload {
  return {
    nombre: p.nombre,
    slug: p.slug,
    categoria: p.categoria,
    descripcion_corta: p.descripcion_corta,
    imagen_url: p.imagen_url,
    raciones_base: p.raciones_base,
    tiempo_total_min: p.tiempo_total_min,
    dificultad: p.dificultad,
    coste_por_racion: p.coste_por_racion != null ? Number(p.coste_por_racion) : null,
    pvp_sugerido: p.pvp_sugerido != null ? Number(p.pvp_sugerido) : null,
    margen_bruto: p.margen_bruto != null ? Number(p.margen_bruto) : null,
    activo: p.activo,
    favorito: p.favorito,
    orden_visual: p.orden_visual,
  };
}

export async function savePlatoFull(input: {
  supabase: SupabaseClient;
  localId: string;
  platoId?: string;
  plato: PlatoUpsertPayload;
  pasos: ServicioPasoInput[];
  ingredientes: ServicioIngredienteInput[];
  alergenos: AllergenKey[];
}): Promise<{ ok: true; platoId: string } | { ok: false; message: string }> {
  const { supabase, localId, pasos, ingredientes, alergenos } = input;
  const row = {
    local_id: localId,
    nombre: input.plato.nombre.trim(),
    slug: input.plato.slug?.trim() || null,
    categoria: input.plato.categoria,
    descripcion_corta: input.plato.descripcion_corta.trim(),
    imagen_url: input.plato.imagen_url,
    raciones_base: input.plato.raciones_base,
    tiempo_total_min: input.plato.tiempo_total_min,
    dificultad: input.plato.dificultad,
    coste_por_racion: input.plato.coste_por_racion,
    pvp_sugerido: input.plato.pvp_sugerido,
    margen_bruto: input.plato.margen_bruto,
    activo: input.plato.activo,
    favorito: input.plato.favorito ?? false,
    orden_visual: input.plato.orden_visual ?? 0,
  };

  let platoId = input.platoId ?? '';
  if (platoId) {
    const { error } = await supabase.from('servicio_platos').update(row).eq('id', platoId).eq('local_id', localId);
    if (error) return { ok: false, message: error.message };
  } else {
    const { data, error } = await supabase.from('servicio_platos').insert(row).select('id').single();
    if (error || !data?.id) return { ok: false, message: error?.message ?? 'No se pudo crear' };
    platoId = String(data.id);
  }

  await supabase.from('servicio_plato_pasos').delete().eq('plato_id', platoId);
  await supabase.from('servicio_plato_ingredientes').delete().eq('plato_id', platoId);
  await supabase.from('servicio_plato_alergenos').delete().eq('plato_id', platoId);

  if (pasos.length) {
    const { error } = await supabase.from('servicio_plato_pasos').insert(
      pasos.map((s, i) => ({
        plato_id: platoId,
        orden: s.orden ?? i,
        titulo: s.titulo.trim(),
        descripcion_corta: s.descripcion_corta.trim(),
        imagen_url: s.imagen_url,
        tiempo_min: s.tiempo_min,
      })),
    );
    if (error) return { ok: false, message: error.message };
  }
  if (ingredientes.length) {
    const { error } = await supabase.from('servicio_plato_ingredientes').insert(
      ingredientes.map((g, i) => ({
        plato_id: platoId,
        orden: g.orden ?? i,
        nombre_ingrediente: g.nombre_ingrediente.trim(),
        cantidad: g.cantidad,
        unidad: (g.unidad ?? '').trim(),
        observaciones: g.observaciones?.trim() || null,
      })),
    );
    if (error) return { ok: false, message: error.message };
  }
  if (alergenos.length) {
    const { error } = await supabase.from('servicio_plato_alergenos').insert(
      alergenos.map((k) => ({
        plato_id: platoId,
        alergeno_key: k,
      })),
    );
    if (error) return { ok: false, message: error.message };
  }

  return { ok: true, platoId };
}

export async function addPlatoToPlanDia(input: {
  supabase: SupabaseClient;
  localId: string;
  fecha: string;
  platoId: string;
  categoria: ServicioDbCategoria;
  raciones: number;
  estado?: ServicioPlanEstado;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const sb = input.supabase;
  const { data: existing } = await sb
    .from('servicio_plan_dia')
    .select('id')
    .eq('local_id', input.localId)
    .eq('fecha', input.fecha)
    .eq('plato_id', input.platoId)
    .maybeSingle();
  if (existing?.id) {
    return { ok: false, message: 'Ese plato ya está en el servicio de ese día.' };
  }
  const { data: maxRow } = await sb
    .from('servicio_plan_dia')
    .select('orden')
    .eq('local_id', input.localId)
    .eq('fecha', input.fecha)
    .eq('categoria', input.categoria)
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();
  const orden = maxRow != null && maxRow.orden != null ? Number(maxRow.orden) + 1 : 0;
  const { error } = await sb.from('servicio_plan_dia').insert({
    local_id: input.localId,
    fecha: input.fecha,
    plato_id: input.platoId,
    categoria: input.categoria,
    raciones_previstas: input.raciones,
    estado: input.estado ?? 'pendiente',
    orden,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function updatePlanLine(
  supabase: SupabaseClient,
  localId: string,
  lineId: string,
  patch: Partial<Pick<ServicioPlanDiaRow, 'raciones_previstas' | 'estado' | 'orden' | 'categoria'>>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase
    .from('servicio_plan_dia')
    .update(patch)
    .eq('id', lineId)
    .eq('local_id', localId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function removePlatoFromPlanDia(
  supabase: SupabaseClient,
  localId: string,
  lineId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.from('servicio_plan_dia').delete().eq('id', lineId).eq('local_id', localId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function fetchProduccionDia(
  supabase: SupabaseClient,
  localId: string,
  fecha: string,
): Promise<ServicioProduccionRow[]> {
  const { data, error } = await supabase
    .from('servicio_produccion')
    .select('id, local_id, fecha, texto_tarea, cantidad, unidad, completado, orden, origen')
    .eq('local_id', localId)
    .eq('fecha', fecha)
    .order('orden', { ascending: true });
  if (error || !data) return [];
  return data as ServicioProduccionRow[];
}

export async function insertProduccionTask(input: {
  supabase: SupabaseClient;
  localId: string;
  fecha: string;
  texto_tarea: string;
  cantidad: number | null;
  unidad: string;
  origen?: ServicioProduccionOrigen;
  orden?: number;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const sb = input.supabase;
  let orden = input.orden;
  if (orden === undefined) {
    const { data: maxRow } = await sb
      .from('servicio_produccion')
      .select('orden')
      .eq('local_id', input.localId)
      .eq('fecha', input.fecha)
      .order('orden', { ascending: false })
      .limit(1)
      .maybeSingle();
    orden = maxRow != null && maxRow.orden != null ? Number(maxRow.orden) + 1 : 0;
  }
  const { data, error } = await sb
    .from('servicio_produccion')
    .insert({
      local_id: input.localId,
      fecha: input.fecha,
      texto_tarea: input.texto_tarea.trim(),
      cantidad: input.cantidad,
      unidad: (input.unidad ?? '').trim(),
      completado: false,
      orden,
      origen: input.origen ?? 'manual',
    })
    .select('id')
    .single();
  if (error || !data?.id) return { ok: false, message: error?.message ?? 'Error' };
  return { ok: true, id: String(data.id) };
}

export async function updateProduccionTask(
  supabase: SupabaseClient,
  localId: string,
  id: string,
  patch: Partial<Pick<ServicioProduccionRow, 'texto_tarea' | 'cantidad' | 'unidad' | 'completado' | 'orden'>>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.from('servicio_produccion').update(patch).eq('id', id).eq('local_id', localId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function deleteProduccionTask(
  supabase: SupabaseClient,
  localId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.from('servicio_produccion').delete().eq('id', id).eq('local_id', localId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export function estimateMinutesFromPlan(
  platos: Map<string, ServicioPlatoRow>,
  plan: ServicioPlanDiaRow[],
): number {
  if (!plan.length) return 0;
  const sum = plan.reduce((acc, line) => acc + (platos.get(line.plato_id)?.tiempo_total_min ?? 0), 0);
  return Math.max(30, Math.round(sum * 0.32));
}

export async function generateProduccionFromPlan(
  supabase: SupabaseClient,
  localId: string,
  fecha: string,
): Promise<{ ok: true; inserted: number } | { ok: false; message: string }> {
  const { plan, platos, error } = await fetchPlanDiaRows(supabase, localId, fecha);
  if (error) return { ok: false, message: error };
  const platoIds = [...new Set(plan.map((p) => p.plato_id))];
  if (!platoIds.length) return { ok: false, message: 'No hay platos en el plan del día.' };
  const { data: ings, error: e2 } = await supabase
    .from('servicio_plato_ingredientes')
    .select('plato_id, nombre_ingrediente, cantidad, unidad, orden')
    .in('plato_id', platoIds)
    .order('orden', { ascending: true });
  if (e2) return { ok: false, message: e2.message };
  const existing = await fetchProduccionDia(supabase, localId, fecha);
  let baseOrden = existing.reduce((m, r) => Math.max(m, r.orden), -1) + 1;
  let inserted = 0;
  for (const row of ings ?? []) {
    const platoId = String((row as { plato_id: string }).plato_id);
    const p = platos.get(platoId);
    const nombrePlato = p?.nombre ?? 'Plato';
    const nombreIng = String((row as { nombre_ingrediente: string }).nombre_ingrediente);
    const cant = (row as { cantidad: number | string }).cantidad;
    const unidad = String((row as { unidad: string }).unidad ?? '');
    const texto = `${nombrePlato}: preparar ${nombreIng}`;
    const r = await insertProduccionTask({
      supabase,
      localId,
      fecha,
      texto_tarea: texto,
      cantidad: typeof cant === 'number' ? cant : Number(cant) || null,
      unidad,
      origen: 'plato',
      orden: baseOrden,
    });
    if (!r.ok) return { ok: false, message: r.message };
    baseOrden += 1;
    inserted += 1;
  }
  return { ok: true, inserted };
}

export async function uploadServicioImage(
  supabase: SupabaseClient,
  localId: string,
  segment: 'platos' | 'pasos',
  file: File,
): Promise<{ ok: true; publicUrl: string } | { ok: false; message: string }> {
  try {
    const blob = await compressImageToWebpBlob(file);
    const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
    const name = `${crypto.randomUUID()}.${ext}`;
    const path = `${localId}/${segment}/${name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: false,
    });
    if (error) return { ok: false, message: error.message };
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) return { ok: false, message: 'Sin URL pública' };
    return { ok: true, publicUrl: data.publicUrl };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Error al subir' };
  }
}
