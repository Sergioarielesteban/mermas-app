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

/**
 * Suma días a una clave YYYY-MM-DD (calendario gregoriano puro; sin ambigüedad DST).
 */
export function appccCalendarAddDays(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map((n) => Number(n));
  if (!y || !m || !d) return dateKey;
  const t = Date.UTC(y, m - 1, d + deltaDays);
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Día operativo del módulo APPCC **temperaturas** (Europe/Madrid):
 * de 00:00 a 01:59 cuenta el día civil **anterior**; a partir de las 02:00, el día civil actual.
 */
export function appccTemperaturasOperationalDateKey(from: Date = new Date()): string {
  const civilMadrid = madridDateKey(from);
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(from);
  const hourRaw = parts.find((p) => p.type === 'hour')?.value ?? '12';
  const hour = Number(hourRaw);
  if (Number.isFinite(hour) && hour < 2) {
    return appccCalendarAddDays(civilMadrid, -1);
  }
  return civilMadrid;
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

/** Lecturas entre dos fechas (YYYY-MM-DD), más recientes primero. */
export async function fetchAppccReadingsInRange(
  supabase: SupabaseClient,
  localId: string,
  dateFrom: string,
  dateTo: string,
) {
  const { data, error } = await supabase
    .from('appcc_temperature_readings')
    .select(
      'id,local_id,cold_unit_id,reading_date,slot,temperature_c,notes,recorded_by,recorded_at,updated_at',
    )
    .eq('local_id', localId)
    .gte('reading_date', dateFrom)
    .lte('reading_date', dateTo)
    .order('reading_date', { ascending: false })
    .limit(4000);
  if (error) throw new Error(error.message);
  return (data ?? []) as AppccReadingRow[];
}

export function formatAppccDateEs(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map((n) => Number(n));
  if (!y || !m || !d) return dateKey;
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** YYYY-MM-DD de hace `days` días (calendario local JS; para historial basta). */
export function dateKeyDaysAgo(days: number, from: Date = new Date()) {
  const t = new Date(from);
  t.setDate(t.getDate() - days);
  return madridDateKey(t);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Días civiles entre dos claves YYYY-MM-DD (inclusive), orden corregido si hace falta. */
export function enumerateDateKeysInclusive(dateFrom: string, dateTo: string): string[] {
  if (!ISO_DATE_RE.test(dateFrom) || !ISO_DATE_RE.test(dateTo)) return [];
  let a = dateFrom;
  let b = dateTo;
  if (a > b) [a, b] = [b, a];
  const out: string[] = [];
  let cur = a;
  for (;;) {
    out.push(cur);
    if (cur === b) break;
    const [y, mo, d] = cur.split('-').map((n) => Number(n));
    const next = new Date(y, mo - 1, d + 1);
    const y2 = next.getFullYear();
    const m2 = String(next.getMonth() + 1).padStart(2, '0');
    const d2 = String(next.getDate()).padStart(2, '0');
    cur = `${y2}-${m2}-${d2}`;
    if (out.length > 400) break;
  }
  return out;
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
  const { data, error } = await supabase
    .from('appcc_temperature_readings')
    .upsert(
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
    )
    .select(
      'id,local_id,cold_unit_id,reading_date,slot,temperature_c,notes,recorded_by,recorded_at,updated_at',
    )
    .single();
  if (error) throw new Error(error.message);
  return data as AppccReadingRow;
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
  const { data, error } = await supabase
    .from('appcc_cold_units')
    .insert({
      local_id: params.localId,
      name: params.name.trim(),
      zone: params.zone,
      unit_type: params.unitType,
      sort_order: params.sortOrder,
      is_active: true,
      temp_min_c: params.tempMinC,
      temp_max_c: params.tempMaxC,
      created_by: params.userId,
    })
    .select(
      'id,local_id,name,zone,unit_type,sort_order,is_active,temp_min_c,temp_max_c,created_at,updated_at',
    )
    .single();
  if (error) throw new Error(error.message);
  return data as AppccColdUnitRow;
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

/** Borra el equipo; las lecturas asociadas se eliminan en cascada (FK en BD). */
export async function deleteAppccColdUnit(supabase: SupabaseClient, unitId: string) {
  const { error } = await supabase.from('appcc_cold_units').delete().eq('id', unitId);
  if (error) throw new Error(error.message);
}
