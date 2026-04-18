import type { SupabaseClient } from '@supabase/supabase-js';

export type EscandalloTechnicalSheet = {
  id: string;
  localId: string;
  recipeId: string;
  categoria: string;
  codigoInterno: string;
  fotoUrl: string | null;
  activa: boolean;
  rendimientoTotal: string;
  numeroRaciones: number | null;
  gramajePorRacionG: number | null;
  tiempoPreparacionMin: number | null;
  tiempoCoccionMin: number | null;
  tiempoReposoMin: number | null;
  temperaturaServicio: string;
  emplatadoDescripcion: string;
  emplatadoDecoracion: string;
  emplatadoMenaje: string;
  emplatadoFotoUrl: string | null;
  tipoConservacion: string;
  temperaturaConservacion: string;
  vidaUtil: string;
  regeneracion: string;
  alergenosManual: string[];
  notasChef: string;
  puntosCriticos: string;
  erroresComunes: string;
  recomendaciones: string;
  createdAt: string;
  updatedAt: string;
};

export type EscandalloTechnicalSheetStep = {
  id: string;
  localId: string;
  technicalSheetId: string;
  orden: number;
  titulo: string | null;
  descripcion: string;
  createdAt: string;
};

export type EscandalloTechnicalSheetUpdate = Partial<{
  categoria: string;
  codigoInterno: string;
  fotoUrl: string | null;
  activa: boolean;
  rendimientoTotal: string;
  numeroRaciones: number | null;
  gramajePorRacionG: number | null;
  tiempoPreparacionMin: number | null;
  tiempoCoccionMin: number | null;
  tiempoReposoMin: number | null;
  temperaturaServicio: string;
  emplatadoDescripcion: string;
  emplatadoDecoracion: string;
  emplatadoMenaje: string;
  emplatadoFotoUrl: string | null;
  tipoConservacion: string;
  temperaturaConservacion: string;
  vidaUtil: string;
  regeneracion: string;
  alergenosManual: string[];
  notasChef: string;
  puntosCriticos: string;
  erroresComunes: string;
  recomendaciones: string;
}>;

type SheetRow = {
  id: string;
  local_id: string;
  recipe_id: string;
  categoria: string;
  codigo_interno: string;
  foto_url: string | null;
  activa: boolean;
  rendimiento_total: string;
  numero_raciones: number | null;
  gramaje_por_racion_g: number | null;
  tiempo_preparacion_min: number | null;
  tiempo_coccion_min: number | null;
  tiempo_reposo_min: number | null;
  temperatura_servicio: string;
  emplatado_descripcion: string;
  emplatado_decoracion: string;
  emplatado_menaje: string;
  emplatado_foto_url: string | null;
  tipo_conservacion: string;
  temperatura_conservacion: string;
  vida_util: string;
  regeneracion: string;
  alergenos_manual: string[] | null;
  notas_chef: string;
  puntos_criticos: string;
  errores_comunes: string;
  recomendaciones: string;
  created_at: string;
  updated_at: string;
};

type StepRow = {
  id: string;
  local_id: string;
  technical_sheet_id: string;
  orden: number;
  titulo: string | null;
  descripcion: string;
  created_at: string;
};

function mapSheet(row: SheetRow): EscandalloTechnicalSheet {
  return {
    id: row.id,
    localId: row.local_id,
    recipeId: row.recipe_id,
    categoria: row.categoria ?? '',
    codigoInterno: row.codigo_interno ?? '',
    fotoUrl: row.foto_url,
    activa: Boolean(row.activa),
    rendimientoTotal: row.rendimiento_total ?? '',
    numeroRaciones:
      row.numero_raciones != null && Number.isFinite(Number(row.numero_raciones))
        ? Number(row.numero_raciones)
        : null,
    gramajePorRacionG:
      row.gramaje_por_racion_g != null && Number.isFinite(Number(row.gramaje_por_racion_g))
        ? Number(row.gramaje_por_racion_g)
        : null,
    tiempoPreparacionMin:
      row.tiempo_preparacion_min != null ? Math.round(Number(row.tiempo_preparacion_min)) : null,
    tiempoCoccionMin: row.tiempo_coccion_min != null ? Math.round(Number(row.tiempo_coccion_min)) : null,
    tiempoReposoMin: row.tiempo_reposo_min != null ? Math.round(Number(row.tiempo_reposo_min)) : null,
    temperaturaServicio: row.temperatura_servicio ?? '',
    emplatadoDescripcion: row.emplatado_descripcion ?? '',
    emplatadoDecoracion: row.emplatado_decoracion ?? '',
    emplatadoMenaje: row.emplatado_menaje ?? '',
    emplatadoFotoUrl: row.emplatado_foto_url,
    tipoConservacion: row.tipo_conservacion ?? '',
    temperaturaConservacion: row.temperatura_conservacion ?? '',
    vidaUtil: row.vida_util ?? '',
    regeneracion: row.regeneracion ?? '',
    alergenosManual: Array.isArray(row.alergenos_manual) ? row.alergenos_manual.filter(Boolean) : [],
    notasChef: row.notas_chef ?? '',
    puntosCriticos: row.puntos_criticos ?? '',
    erroresComunes: row.errores_comunes ?? '',
    recomendaciones: row.recomendaciones ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStep(row: StepRow): EscandalloTechnicalSheetStep {
  return {
    id: row.id,
    localId: row.local_id,
    technicalSheetId: row.technical_sheet_id,
    orden: Number(row.orden ?? 0),
    titulo: row.titulo,
    descripcion: row.descripcion ?? '',
    createdAt: row.created_at,
  };
}

function sheetToRowPatch(patch: EscandalloTechnicalSheetUpdate): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.categoria !== undefined) out.categoria = patch.categoria;
  if (patch.codigoInterno !== undefined) out.codigo_interno = patch.codigoInterno;
  if (patch.fotoUrl !== undefined) out.foto_url = patch.fotoUrl;
  if (patch.activa !== undefined) out.activa = patch.activa;
  if (patch.rendimientoTotal !== undefined) out.rendimiento_total = patch.rendimientoTotal;
  if (patch.numeroRaciones !== undefined) out.numero_raciones = patch.numeroRaciones;
  if (patch.gramajePorRacionG !== undefined) out.gramaje_por_racion_g = patch.gramajePorRacionG;
  if (patch.tiempoPreparacionMin !== undefined) out.tiempo_preparacion_min = patch.tiempoPreparacionMin;
  if (patch.tiempoCoccionMin !== undefined) out.tiempo_coccion_min = patch.tiempoCoccionMin;
  if (patch.tiempoReposoMin !== undefined) out.tiempo_reposo_min = patch.tiempoReposoMin;
  if (patch.temperaturaServicio !== undefined) out.temperatura_servicio = patch.temperaturaServicio;
  if (patch.emplatadoDescripcion !== undefined) out.emplatado_descripcion = patch.emplatadoDescripcion;
  if (patch.emplatadoDecoracion !== undefined) out.emplatado_decoracion = patch.emplatadoDecoracion;
  if (patch.emplatadoMenaje !== undefined) out.emplatado_menaje = patch.emplatadoMenaje;
  if (patch.emplatadoFotoUrl !== undefined) out.emplatado_foto_url = patch.emplatadoFotoUrl;
  if (patch.tipoConservacion !== undefined) out.tipo_conservacion = patch.tipoConservacion;
  if (patch.temperaturaConservacion !== undefined) out.temperatura_conservacion = patch.temperaturaConservacion;
  if (patch.vidaUtil !== undefined) out.vida_util = patch.vidaUtil;
  if (patch.regeneracion !== undefined) out.regeneracion = patch.regeneracion;
  if (patch.alergenosManual !== undefined) out.alergenos_manual = patch.alergenosManual;
  if (patch.notasChef !== undefined) out.notas_chef = patch.notasChef;
  if (patch.puntosCriticos !== undefined) out.puntos_criticos = patch.puntosCriticos;
  if (patch.erroresComunes !== undefined) out.errores_comunes = patch.erroresComunes;
  if (patch.recomendaciones !== undefined) out.recomendaciones = patch.recomendaciones;
  return out;
}

const SHEET_SELECT =
  'id,local_id,recipe_id,categoria,codigo_interno,foto_url,activa,rendimiento_total,numero_raciones,gramaje_por_racion_g,tiempo_preparacion_min,tiempo_coccion_min,tiempo_reposo_min,temperatura_servicio,emplatado_descripcion,emplatado_decoracion,emplatado_menaje,emplatado_foto_url,tipo_conservacion,temperatura_conservacion,vida_util,regeneracion,alergenos_manual,notas_chef,puntos_criticos,errores_comunes,recomendaciones,created_at,updated_at';

export async function fetchEscandalloTechnicalSheetWithSteps(
  supabase: SupabaseClient,
  localId: string,
  recipeId: string,
): Promise<{ sheet: EscandalloTechnicalSheet | null; steps: EscandalloTechnicalSheetStep[] }> {
  const { data: sheetRow, error: sheetErr } = await supabase
    .from('escandallo_recipe_technical_sheets')
    .select(SHEET_SELECT)
    .eq('local_id', localId)
    .eq('recipe_id', recipeId)
    .maybeSingle();
  if (sheetErr) throw new Error(sheetErr.message);
  if (!sheetRow) return { sheet: null, steps: [] };
  const sheet = mapSheet(sheetRow as SheetRow);
  const { data: stepRows, error: stepErr } = await supabase
    .from('escandallo_recipe_technical_sheet_steps')
    .select('id,local_id,technical_sheet_id,orden,titulo,descripcion,created_at')
    .eq('local_id', localId)
    .eq('technical_sheet_id', sheet.id)
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });
  if (stepErr) throw new Error(stepErr.message);
  const steps = ((stepRows ?? []) as StepRow[]).map(mapStep);
  return { sheet, steps };
}

export async function insertEscandalloTechnicalSheet(
  supabase: SupabaseClient,
  localId: string,
  recipeId: string,
): Promise<EscandalloTechnicalSheet> {
  const { data, error } = await supabase
    .from('escandallo_recipe_technical_sheets')
    .insert({ local_id: localId, recipe_id: recipeId })
    .select(SHEET_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapSheet(data as SheetRow);
}

export async function updateEscandalloTechnicalSheet(
  supabase: SupabaseClient,
  localId: string,
  sheetId: string,
  patch: EscandalloTechnicalSheetUpdate,
): Promise<EscandalloTechnicalSheet> {
  const row = sheetToRowPatch(patch);
  if (Object.keys(row).length === 0) {
    const { data, error } = await supabase
      .from('escandallo_recipe_technical_sheets')
      .select(SHEET_SELECT)
      .eq('local_id', localId)
      .eq('id', sheetId)
      .single();
    if (error) throw new Error(error.message);
    return mapSheet(data as SheetRow);
  }
  const { data, error } = await supabase
    .from('escandallo_recipe_technical_sheets')
    .update(row)
    .eq('local_id', localId)
    .eq('id', sheetId)
    .select(SHEET_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapSheet(data as SheetRow);
}

export type TechnicalSheetStepDraft = {
  titulo: string;
  descripcion: string;
};

export async function replaceEscandalloTechnicalSheetSteps(
  supabase: SupabaseClient,
  localId: string,
  technicalSheetId: string,
  drafts: TechnicalSheetStepDraft[],
): Promise<EscandalloTechnicalSheetStep[]> {
  const { error: delErr } = await supabase
    .from('escandallo_recipe_technical_sheet_steps')
    .delete()
    .eq('local_id', localId)
    .eq('technical_sheet_id', technicalSheetId);
  if (delErr) throw new Error(delErr.message);
  if (drafts.length === 0) return [];
  const payload = drafts.map((d, idx) => ({
    local_id: localId,
    technical_sheet_id: technicalSheetId,
    orden: idx,
    titulo: d.titulo.trim() === '' ? null : d.titulo.trim(),
    descripcion: d.descripcion.trim(),
  }));
  const { data, error } = await supabase
    .from('escandallo_recipe_technical_sheet_steps')
    .insert(payload)
    .select('id,local_id,technical_sheet_id,orden,titulo,descripcion,created_at');
  if (error) throw new Error(error.message);
  return ((data ?? []) as StepRow[]).map(mapStep);
}

export async function deleteEscandalloTechnicalSheet(
  supabase: SupabaseClient,
  localId: string,
  sheetId: string,
): Promise<void> {
  const { error } = await supabase
    .from('escandallo_recipe_technical_sheets')
    .delete()
    .eq('local_id', localId)
    .eq('id', sheetId);
  if (error) throw new Error(error.message);
}
