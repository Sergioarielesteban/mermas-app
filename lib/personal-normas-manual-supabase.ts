import type { SupabaseClient } from '@supabase/supabase-js';

export type EmpresaNormaRow = {
  id: string;
  local_id: string;
  titulo: string;
  categoria: string;
  descripcion: string;
  activa: boolean;
  created_at: string;
  updated_at: string;
};

export type ManualCategoriaKey = 'cocina' | 'recepcion' | 'limpieza' | 'produccion';

export type ManualProcedimientoRow = {
  id: string;
  local_id: string;
  titulo: string;
  categoria: ManualCategoriaKey;
  pasos: ManualPasoJson[];
  puntos_criticos: string;
  errores_comunes: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type ManualPasoJson = { text: string };

export const MANUAL_CATEGORIA_LABEL: Record<ManualCategoriaKey, string> = {
  cocina: 'Cocina',
  recepcion: 'Recepción',
  limpieza: 'Limpieza',
  produccion: 'Producción',
};

export const MANUAL_CATEGORIA_ORDER: ManualCategoriaKey[] = ['cocina', 'recepcion', 'limpieza', 'produccion'];

export function parsePasosFromJson(raw: unknown): ManualPasoJson[] {
  if (!Array.isArray(raw)) return [];
  const out: ManualPasoJson[] = [];
  for (const item of raw) {
    if (item && typeof item === 'object' && 'text' in item && typeof (item as { text: unknown }).text === 'string') {
      out.push({ text: (item as { text: string }).text.trim() });
    } else if (typeof item === 'string' && item.trim()) {
      out.push({ text: item.trim() });
    }
  }
  return out;
}

export function pasosFromTextarea(text: string): ManualPasoJson[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ text: line }));
}

export function textareaFromPasos(pasos: ManualPasoJson[]): string {
  return pasos.map((p) => p.text).join('\n');
}

export async function fetchEmpresaNormas(supabase: SupabaseClient, localId: string): Promise<EmpresaNormaRow[]> {
  const { data, error } = await supabase
    .from('empresa_normas')
    .select('id,local_id,titulo,categoria,descripcion,activa,created_at,updated_at')
    .eq('local_id', localId)
    .order('categoria', { ascending: true })
    .order('titulo', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as EmpresaNormaRow[];
}

export async function fetchManualProcedimientos(
  supabase: SupabaseClient,
  localId: string,
): Promise<ManualProcedimientoRow[]> {
  const { data, error } = await supabase
    .from('manual_procedimientos')
    .select('id,local_id,titulo,categoria,pasos,puntos_criticos,errores_comunes,activo,created_at,updated_at')
    .eq('local_id', localId)
    .order('categoria', { ascending: true })
    .order('titulo', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...(row as ManualProcedimientoRow),
    pasos: parsePasosFromJson((row as { pasos: unknown }).pasos),
  }));
}

export async function fetchNormasLecturaNormaIds(
  supabase: SupabaseClient,
  localId: string,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('normas_lectura')
    .select('norma_id')
    .eq('local_id', localId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => String((r as { norma_id: string }).norma_id)));
}

export async function fetchManualLecturaIds(
  supabase: SupabaseClient,
  localId: string,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('manual_lectura')
    .select('manual_id')
    .eq('local_id', localId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => String((r as { manual_id: string }).manual_id)));
}

export async function upsertNormaLectura(
  supabase: SupabaseClient,
  localId: string,
  userId: string,
  normaId: string,
): Promise<void> {
  const { error } = await supabase.from('normas_lectura').upsert(
    {
      local_id: localId,
      user_id: userId,
      norma_id: normaId,
      fecha_lectura: new Date().toISOString(),
    },
    { onConflict: 'user_id,norma_id' },
  );
  if (error) throw new Error(error.message);
}

export async function upsertManualLectura(
  supabase: SupabaseClient,
  localId: string,
  userId: string,
  manualId: string,
): Promise<void> {
  const { error } = await supabase.from('manual_lectura').upsert(
    {
      local_id: localId,
      user_id: userId,
      manual_id: manualId,
      fecha_lectura: new Date().toISOString(),
    },
    { onConflict: 'user_id,manual_id' },
  );
  if (error) throw new Error(error.message);
}

export async function deleteNormasLecturaByNorma(
  supabase: SupabaseClient,
  localId: string,
  normaId: string,
): Promise<void> {
  const { error } = await supabase.from('normas_lectura').delete().eq('local_id', localId).eq('norma_id', normaId);
  if (error) throw new Error(error.message);
}

export async function deleteManualLecturaByManual(
  supabase: SupabaseClient,
  localId: string,
  manualId: string,
): Promise<void> {
  const { error } = await supabase.from('manual_lectura').delete().eq('local_id', localId).eq('manual_id', manualId);
  if (error) throw new Error(error.message);
}

export async function insertEmpresaNorma(
  supabase: SupabaseClient,
  localId: string,
  input: { titulo: string; categoria: string; descripcion: string; activa: boolean },
): Promise<EmpresaNormaRow> {
  const { data, error } = await supabase
    .from('empresa_normas')
    .insert({
      local_id: localId,
      titulo: input.titulo.trim(),
      categoria: input.categoria.trim(),
      descripcion: input.descripcion.trim(),
      activa: input.activa,
    })
    .select('id,local_id,titulo,categoria,descripcion,activa,created_at,updated_at')
    .single();
  if (error) throw new Error(error.message);
  return data as EmpresaNormaRow;
}

export async function updateEmpresaNorma(
  supabase: SupabaseClient,
  localId: string,
  id: string,
  input: { titulo: string; categoria: string; descripcion: string; activa: boolean },
): Promise<void> {
  const { error } = await supabase
    .from('empresa_normas')
    .update({
      titulo: input.titulo.trim(),
      categoria: input.categoria.trim(),
      descripcion: input.descripcion.trim(),
      activa: input.activa,
    })
    .eq('id', id)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function deleteEmpresaNorma(supabase: SupabaseClient, localId: string, id: string): Promise<void> {
  const { error } = await supabase.from('empresa_normas').delete().eq('id', id).eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function insertManualProcedimiento(
  supabase: SupabaseClient,
  localId: string,
  input: {
    titulo: string;
    categoria: ManualCategoriaKey;
    pasos: ManualPasoJson[];
    puntos_criticos: string;
    errores_comunes: string;
    activo: boolean;
  },
): Promise<ManualProcedimientoRow> {
  const { data, error } = await supabase
    .from('manual_procedimientos')
    .insert({
      local_id: localId,
      titulo: input.titulo.trim(),
      categoria: input.categoria,
      pasos: input.pasos,
      puntos_criticos: input.puntos_criticos.trim(),
      errores_comunes: input.errores_comunes.trim(),
      activo: input.activo,
    })
    .select('id,local_id,titulo,categoria,pasos,puntos_criticos,errores_comunes,activo,created_at,updated_at')
    .single();
  if (error) throw new Error(error.message);
  return {
    ...(data as ManualProcedimientoRow),
    pasos: parsePasosFromJson((data as { pasos: unknown }).pasos),
  };
}

export async function updateManualProcedimiento(
  supabase: SupabaseClient,
  localId: string,
  id: string,
  input: {
    titulo: string;
    categoria: ManualCategoriaKey;
    pasos: ManualPasoJson[];
    puntos_criticos: string;
    errores_comunes: string;
    activo: boolean;
  },
): Promise<void> {
  const { error } = await supabase
    .from('manual_procedimientos')
    .update({
      titulo: input.titulo.trim(),
      categoria: input.categoria,
      pasos: input.pasos,
      puntos_criticos: input.puntos_criticos.trim(),
      errores_comunes: input.errores_comunes.trim(),
      activo: input.activo,
    })
    .eq('id', id)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function deleteManualProcedimiento(supabase: SupabaseClient, localId: string, id: string): Promise<void> {
  const { error } = await supabase.from('manual_procedimientos').delete().eq('id', id).eq('local_id', localId);
  if (error) throw new Error(error.message);
}
