import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppccZone } from '@/lib/appcc-supabase';

export type AppccOilEventType = 'cambio' | 'filtrado';

export type AppccFryerRow = {
  id: string;
  local_id: string;
  name: string;
  zone: AppccZone;
  sort_order: number;
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type AppccOilEventRow = {
  id: string;
  local_id: string;
  fryer_id: string;
  event_type: AppccOilEventType;
  event_date: string;
  liters_used: number | null;
  notes: string;
  /** Nombre de quien hizo el filtrado/cambio (mismo para todas las freidoras del día en la UI). */
  operator_name?: string | null;
  recorded_by: string | null;
  recorded_at: string;
  updated_at: string;
};

export type AppccOilEventWithFryer = AppccOilEventRow & {
  fryer: { name: string; zone: AppccZone } | null;
};

export const APPCC_OIL_EVENT_LABEL: Record<AppccOilEventType, string> = {
  cambio: 'Cambio',
  filtrado: 'Filtrado',
};

const FILTRADO_EXTRA_LITERS_TAG = /\[FILTRADO\+(\d+(?:[.,]\d+)?)L\]/i;

export function extractFilteredExtraLitersFromNotes(notes: string | null | undefined): number | null {
  const t = notes?.trim();
  if (!t) return null;
  const m = t.match(FILTRADO_EXTRA_LITERS_TAG);
  if (!m?.[1]) return null;
  const raw = m[1].replace(',', '.');
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function stripFilteredExtraLitersTag(notes: string | null | undefined): string {
  const t = notes?.trim();
  if (!t) return '';
  return t.replace(FILTRADO_EXTRA_LITERS_TAG, '').replace(/\s{2,}/g, ' ').trim();
}

export function withFilteredExtraLitersTag(notes: string | null | undefined, liters: number): string {
  const clean = stripFilteredExtraLitersTag(notes);
  const lit = Math.round(liters * 100) / 100;
  return clean ? `${clean} [FILTRADO+${lit}L]` : `[FILTRADO+${lit}L]`;
}

export function oilEventEffectiveLiters(e: Pick<AppccOilEventRow, 'event_type' | 'liters_used' | 'notes'>): number | null {
  if (e.liters_used != null && Number.isFinite(e.liters_used) && e.liters_used >= 0) {
    return Math.round(e.liters_used * 100) / 100;
  }
  if (e.event_type !== 'filtrado') return null;
  return extractFilteredExtraLitersFromNotes(e.notes);
}

export async function fetchAppccFryers(supabase: SupabaseClient, localId: string, activeOnly = true) {
  let q = supabase
    .from('appcc_fryers')
    .select('id,local_id,name,zone,sort_order,is_active,notes,created_at,updated_at')
    .eq('local_id', localId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AppccFryerRow[];
}

export async function fetchOilEventsForDate(supabase: SupabaseClient, localId: string, eventDate: string) {
  const { data, error } = await supabase
    .from('appcc_oil_events')
    .select(
      'id,local_id,fryer_id,event_type,event_date,liters_used,notes,operator_name,recorded_by,recorded_at,updated_at',
    )
    .eq('local_id', localId)
    .eq('event_date', eventDate)
    .order('recorded_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AppccOilEventRow[];
}

export async function fetchOilEventsInRangeWithFryer(
  supabase: SupabaseClient,
  localId: string,
  dateFrom: string,
  dateTo: string,
  eventType?: AppccOilEventType | 'all',
) {
  let q = supabase
    .from('appcc_oil_events')
    .select(
      'id,local_id,fryer_id,event_type,event_date,liters_used,notes,operator_name,recorded_by,recorded_at,updated_at, fryer:appcc_fryers(name,zone)',
    )
    .eq('local_id', localId)
    .gte('event_date', dateFrom)
    .lte('event_date', dateTo)
    .order('event_date', { ascending: false })
    .order('recorded_at', { ascending: false })
    .limit(4000);
  if (eventType && eventType !== 'all') q = q.eq('event_type', eventType);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const raw = (data ?? []) as (AppccOilEventRow & {
    fryer: { name: string; zone: AppccZone } | { name: string; zone: AppccZone }[] | null;
  })[];
  return raw.map((row) => {
    const f = row.fryer;
    const fryer =
      f == null
        ? null
        : Array.isArray(f)
          ? (f[0] ?? null)
          : f;
    const { fryer: _drop, ...rest } = row;
    return { ...rest, fryer } as AppccOilEventWithFryer;
  });
}

export async function insertOilEvent(
  supabase: SupabaseClient,
  params: {
    localId: string;
    fryerId: string;
    eventType: AppccOilEventType;
    eventDate: string;
    litersUsed: number | null;
    notes?: string;
    operatorName: string;
    userId: string;
  },
) {
  const liters = params.litersUsed;
  if (params.eventType === 'cambio') {
    if (liters == null || liters < 0 || !Number.isFinite(liters)) {
      throw new Error('En un cambio de aceite indica los litros usados (≥ 0).');
    }
  } else if (liters != null && (!Number.isFinite(liters) || liters < 0)) {
    throw new Error('Los litros deben ser un número ≥ 0 o dejar el campo vacío.');
  }
  const { data, error } = await supabase
    .from('appcc_oil_events')
    .insert({
      local_id: params.localId,
      fryer_id: params.fryerId,
      event_type: params.eventType,
      event_date: params.eventDate,
      liters_used: liters,
      notes: params.notes?.trim() ?? '',
      operator_name: params.operatorName.trim(),
      recorded_by: params.userId,
    })
    .select(
      'id,local_id,fryer_id,event_type,event_date,liters_used,notes,operator_name,recorded_by,recorded_at,updated_at',
    )
    .single();
  if (error) throw new Error(error.message);
  return data as AppccOilEventRow;
}

export async function updateOilEvent(
  supabase: SupabaseClient,
  params: {
    eventId: string;
    eventType: AppccOilEventType;
    litersUsed: number | null;
    notes?: string;
    operatorName: string;
    userId: string;
  },
) {
  const liters = params.litersUsed;
  if (params.eventType === 'cambio') {
    if (liters == null || liters < 0 || !Number.isFinite(liters)) {
      throw new Error('En un cambio de aceite indica los litros usados (≥ 0).');
    }
  } else if (liters != null && (!Number.isFinite(liters) || liters < 0)) {
    throw new Error('Los litros deben ser un número ≥ 0 o dejar el campo vacío.');
  }
  const { data, error } = await supabase
    .from('appcc_oil_events')
    .update({
      event_type: params.eventType,
      liters_used: liters,
      notes: params.notes?.trim() ?? '',
      operator_name: params.operatorName.trim(),
      recorded_by: params.userId,
    })
    .eq('id', params.eventId)
    .select(
      'id,local_id,fryer_id,event_type,event_date,liters_used,notes,operator_name,recorded_by,recorded_at,updated_at',
    )
    .single();
  if (error) throw new Error(error.message);
  return data as AppccOilEventRow;
}

export async function insertAppccFryer(
  supabase: SupabaseClient,
  params: {
    localId: string;
    name: string;
    zone: AppccZone;
    sortOrder: number;
    notes?: string;
    userId: string;
  },
) {
  const { data, error } = await supabase
    .from('appcc_fryers')
    .insert({
      local_id: params.localId,
      name: params.name.trim(),
      zone: params.zone,
      sort_order: params.sortOrder,
      is_active: true,
      notes: params.notes?.trim() ?? '',
      created_by: params.userId,
    })
    .select('id,local_id,name,zone,sort_order,is_active,notes,created_at,updated_at')
    .single();
  if (error) throw new Error(error.message);
  return data as AppccFryerRow;
}

export async function updateAppccFryer(
  supabase: SupabaseClient,
  fryerId: string,
  patch: Partial<{ name: string; zone: AppccZone; sort_order: number; is_active: boolean; notes: string }>,
) {
  const { error } = await supabase.from('appcc_fryers').update(patch).eq('id', fryerId);
  if (error) throw new Error(error.message);
}

export async function deleteAppccFryer(supabase: SupabaseClient, fryerId: string) {
  const { error } = await supabase.from('appcc_fryers').delete().eq('id', fryerId);
  if (error) throw new Error(error.message);
}
