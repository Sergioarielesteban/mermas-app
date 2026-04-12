import type { SupabaseClient } from '@supabase/supabase-js';

export type AppccZone = 'cocina' | 'barra';
export type AppccUnitType = 'nevera' | 'congelador';
export type AppccSlot = 'manana' | 'tarde' | 'noche';

export type AppccColdUnitRow = {
  id: string;
  local_id: string;
  name: string;
  zone: AppccZone;
  unit_type: AppccUnitType;
  sort_order: number;
  is_active: boolean;
  temp_min_c: number | null;
  temp_max_c: number | null;
  created_at: string;
  updated_at: string;
};

export type AppccReadingRow = {
  id: string;
  local_id: string;
  cold_unit_id: string;
  reading_date: string;
  slot: AppccSlot;
  temperature_c: number;
  notes: string;
  recorded_by: string | null;
  recorded_at: string;
  updated_at: string;
};

export const APPCC_SLOT_LABEL: Record<AppccSlot, string> = {
  manana: 'Mañana',
  tarde: 'Tarde',
  noche: 'Noche',
};

export const APPCC_ZONE_LABEL: Record<AppccZone, string> = {
  cocina: 'Cocina',
  barra: 'Barra',
};

export const APPCC_UNIT_TYPE_LABEL: Record<AppccUnitType, string> = {
  nevera: 'Nevera',
  congelador: 'Congelador',
};

/** Día civil en Europe/Madrid (YYYY-MM-DD). */
export function madridDateKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function isTempOutOfRange(
  tempC: number,
  minC: number | null | undefined,
  maxC: number | null | undefined,
): boolean {
  if (minC != null && tempC < minC) return true;
  if (maxC != null && tempC > maxC) return true;
  return false;
}

export async function fetchAppccColdUnits(supabase: SupabaseClient, localId: string, activeOnly = true) {
  let q = supabase
    .from('appcc_cold_units')
    .select(
      'id,local_id,name,zone,unit_type,sort_order,is_active,temp_min_c,temp_max_c,created_at,updated_at',
    )
    .eq('local_id', localId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AppccColdUnitRow[];
}

export async function fetchAppccReadingsForDate(
  supabase: SupabaseClient,
  localId: string,
  readingDate: string,
) {
  const { data, error } = await supabase
    .from('appcc_temperature_readings')
    .select(
      'id,local_id,cold_unit_id,reading_date,slot,temperature_c,notes,recorded_by,recorded_at,updated_at',
    )
    .eq('local_id', localId)
    .eq('reading_date', readingDate);
  if (error) throw new Error(error.message);
  return (data ?? []) as AppccReadingRow[];
}

export function readingsByUnitAndSlot(rows: AppccReadingRow[]) {
  const map = new Map<string, AppccReadingRow>();
  for (const r of rows) {
    map.set(`${r.cold_unit_id}:${r.slot}`, r);
  }
  return map;
}

export async function upsertAppccReading(
  supabase: SupabaseClient,
  params: {
    localId: string;
    coldUnitId: string;
    readingDate: string;
    slot: AppccSlot;
    temperatureC: number;
    notes?: string;
    userId: string;
  },
) {
  const now = new Date().toISOString();
  const { error } = await supabase.from('appcc_temperature_readings').upsert(
    {
      local_id: params.localId,
      cold_unit_id: params.coldUnitId,
      reading_date: params.readingDate,
      slot: params.slot,
      temperature_c: params.temperatureC,
      notes: params.notes ?? '',
      recorded_by: params.userId,
      recorded_at: now,
      updated_at: now,
    },
    { onConflict: 'local_id,cold_unit_id,reading_date,slot' },
  );
  if (error) throw new Error(error.message);
}

export async function deleteAppccReading(supabase: SupabaseClient, readingId: string) {
  const { error } = await supabase.from('appcc_temperature_readings').delete().eq('id', readingId);
  if (error) throw new Error(error.message);
}

export async function insertAppccColdUnit(
  supabase: SupabaseClient,
  params: {
    localId: string;
    name: string;
    zone: AppccZone;
    unitType: AppccUnitType;
    sortOrder: number;
    tempMinC: number | null;
    tempMaxC: number | null;
    userId: string;
  },
) {
  const { error } = await supabase.from('appcc_cold_units').insert({
    local_id: params.localId,
    name: params.name.trim(),
    zone: params.zone,
    unit_type: params.unitType,
    sort_order: params.sortOrder,
    is_active: true,
    temp_min_c: params.tempMinC,
    temp_max_c: params.tempMaxC,
    created_by: params.userId,
  });
  if (error) throw new Error(error.message);
}

export async function updateAppccColdUnit(
  supabase: SupabaseClient,
  unitId: string,
  patch: Partial<{
    name: string;
    zone: AppccZone;
    unit_type: AppccUnitType;
    sort_order: number;
    is_active: boolean;
    temp_min_c: number | null;
    temp_max_c: number | null;
  }>,
) {
  const { error } = await supabase.from('appcc_cold_units').update(patch).eq('id', unitId);
  if (error) throw new Error(error.message);
}
