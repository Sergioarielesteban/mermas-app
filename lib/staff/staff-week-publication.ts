import type { SupabaseClient } from '@supabase/supabase-js';
import type { StaffEmployee, StaffShift } from './types';

export type StaffWeekPublicationStatus = 'published' | 'updated_after_publish';

export type StaffWeekPublication = {
  id: string;
  localId: string;
  weekStartMonday: string;
  status: StaffWeekPublicationStatus;
  publishedAt: string;
  publishedBy: string | null;
};

function mapRow(r: Record<string, unknown>): StaffWeekPublication {
  const w = r.week_start_monday;
  const weekStr =
    typeof w === 'string'
      ? w.slice(0, 10)
      : w instanceof Date
        ? w.toISOString().slice(0, 10)
        : String(w).slice(0, 10);
  return {
    id: String(r.id),
    localId: String(r.local_id),
    weekStartMonday: weekStr,
    status: r.status === 'updated_after_publish' ? 'updated_after_publish' : 'published',
    publishedAt: String(r.published_at ?? ''),
    publishedBy: r.published_by != null ? String(r.published_by) : null,
  };
}

export async function fetchStaffWeekPublication(
  supabase: SupabaseClient,
  localId: string,
  weekStartMondayYmd: string,
): Promise<StaffWeekPublication | null> {
  const { data, error } = await supabase
    .from('staff_week_publications')
    .select('id, local_id, week_start_monday, status, published_at, published_by')
    .eq('local_id', localId)
    .eq('week_start_monday', weekStartMondayYmd)
    .maybeSingle();
  if (error) {
    if (error.message?.includes('does not exist') || error.code === '42P01') return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}

/** Tras guardar cambios en turnos: si la semana estaba publicada, pasa a «modificada». */
export async function markStaffWeekDirtyIfPublished(
  supabase: SupabaseClient,
  localId: string,
  weekStartMondayYmd: string,
): Promise<void> {
  const { error } = await supabase
    .from('staff_week_publications')
    .update({ status: 'updated_after_publish' })
    .eq('local_id', localId)
    .eq('week_start_monday', weekStartMondayYmd)
    .eq('status', 'published');
  if (error && !error.message?.includes('does not exist')) {
    console.warn('[staff_week_publications] mark dirty:', error.message);
  }
}

/** Usuarios (auth) con al menos un turno asignado en el rango de fechas. */
export function collectUserIdsWithShiftsInWeek(
  shifts: StaffShift[],
  employees: StaffEmployee[],
  weekStartYmd: string,
  weekEndYmd: string,
): string[] {
  const empById = new Map(employees.map((e) => [e.id, e] as const));
  const ids = new Set<string>();
  for (const s of shifts) {
    if (s.shiftDate < weekStartYmd || s.shiftDate > weekEndYmd) continue;
    if (!s.employeeId) continue;
    const e = empById.get(s.employeeId);
    const uid = e?.userId;
    if (uid) ids.add(uid);
  }
  return [...ids];
}

export async function upsertPublishStaffWeek(
  supabase: SupabaseClient,
  input: {
    localId: string;
    weekStartMondayYmd: string;
    publishedBy: string;
  },
): Promise<StaffWeekPublication> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('staff_week_publications')
    .upsert(
      {
        local_id: input.localId,
        week_start_monday: input.weekStartMondayYmd,
        status: 'published',
        published_at: now,
        published_by: input.publishedBy,
      },
      { onConflict: 'local_id,week_start_monday' },
    )
    .select('id, local_id, week_start_monday, status, published_at, published_by')
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}
