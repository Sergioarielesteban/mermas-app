import type { SupabaseClient } from '@supabase/supabase-js';
import { sortEntriesByTime } from '@/lib/staff/attendance-logic';
import type {
  StaffEmployee,
  StaffIncident,
  StaffIncidentStatus,
  StaffRequest,
  StaffRequestStatus,
  StaffRequestType,
  StaffScheduleDayMark,
  StaffScheduleDayMarkKind,
  StaffShift,
  StaffShiftStatus,
  StaffTimeAdjustment,
  StaffTimeEntry,
  StaffTimeEventType,
} from '@/lib/staff/types';

function mapEmployee(r: Record<string, unknown>): StaffEmployee {
  return {
    id: String(r.id),
    localId: String(r.local_id),
    userId: r.user_id ? String(r.user_id) : null,
    firstName: String(r.first_name ?? ''),
    lastName: String(r.last_name ?? ''),
    alias: r.alias ? String(r.alias) : null,
    phone: r.phone ? String(r.phone) : null,
    email: r.email ? String(r.email) : null,
    operationalRole: r.operational_role ? String(r.operational_role) : null,
    weeklyHoursTarget:
      r.weekly_hours_target != null && r.weekly_hours_target !== ''
        ? Number(r.weekly_hours_target)
        : null,
    workdayType: r.workday_type ? String(r.workday_type) : null,
    color: r.color ? String(r.color) : null,
    hasPin: Boolean(r.pin_fichaje && String(r.pin_fichaje).length > 0),
    active: Boolean(r.active ?? true),
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

function mapScheduleDayMark(r: Record<string, unknown>): StaffScheduleDayMark {
  return {
    id: String(r.id),
    localId: String(r.local_id),
    employeeId: String(r.employee_id),
    markDate: String(r.mark_date),
    kind: r.kind as StaffScheduleDayMarkKind,
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

function mapShift(r: Record<string, unknown>): StaffShift {
  return {
    id: String(r.id),
    localId: String(r.local_id),
    employeeId: r.employee_id != null && String(r.employee_id).length > 0 ? String(r.employee_id) : null,
    shiftDate: String(r.shift_date),
    startTime: String(r.start_time),
    endTime: String(r.end_time),
    endsNextDay: Boolean(r.ends_next_day),
    breakMinutes: Number(r.break_minutes ?? 0),
    zone: r.zone ? String(r.zone) : null,
    notes: r.notes ? String(r.notes) : null,
    status: r.status as StaffShiftStatus,
    colorHint: r.color_hint ? String(r.color_hint) : null,
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

function mapTimeEntry(r: Record<string, unknown>): StaffTimeEntry {
  return {
    id: String(r.id),
    localId: String(r.local_id),
    employeeId: String(r.employee_id),
    shiftId: r.shift_id ? String(r.shift_id) : null,
    eventType: r.event_type as StaffTimeEventType,
    occurredAt: String(r.occurred_at),
    source: String(r.source ?? 'app'),
    note: r.note ? String(r.note) : null,
    createdAt: String(r.created_at ?? ''),
  };
}

function mapTimeAdjustment(r: Record<string, unknown>): StaffTimeAdjustment {
  return {
    id: String(r.id),
    localId: String(r.local_id),
    employeeId: String(r.employee_id),
    workDate: String(r.work_date),
    clockInOriginal: r.clock_in_original ? String(r.clock_in_original) : null,
    clockOutOriginal: r.clock_out_original ? String(r.clock_out_original) : null,
    clockInAdjusted: r.clock_in_adjusted ? String(r.clock_in_adjusted) : null,
    clockOutAdjusted: r.clock_out_adjusted ? String(r.clock_out_adjusted) : null,
    adjustmentReason: r.adjustment_reason ? String(r.adjustment_reason) : null,
    adjustedByUserId: r.adjusted_by_user_id ? String(r.adjusted_by_user_id) : null,
    adjustedAt: r.adjusted_at ? String(r.adjusted_at) : null,
    isAdjusted: Boolean(r.is_adjusted),
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

function mapRequest(r: Record<string, unknown>): StaffRequest {
  return {
    id: String(r.id),
    localId: String(r.local_id),
    employeeId: String(r.employee_id),
    requestType: r.request_type as StaffRequestType,
    startDate: String(r.start_date),
    endDate: r.end_date ? String(r.end_date) : null,
    notes: r.notes ? String(r.notes) : null,
    status: r.status as StaffRequestStatus,
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
    reviewedBy: r.reviewed_by ? String(r.reviewed_by) : null,
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

function mapIncident(r: Record<string, unknown>): StaffIncident {
  return {
    id: String(r.id),
    localId: String(r.local_id),
    employeeId: String(r.employee_id),
    shiftId: r.shift_id ? String(r.shift_id) : null,
    incidentDate: String(r.incident_date),
    incidentType: r.incident_type as StaffIncident['incidentType'],
    description: r.description ? String(r.description) : null,
    status: r.status as StaffIncident['status'],
    resolutionNote: r.resolution_note ? String(r.resolution_note) : null,
    resolvedBy: r.resolved_by ? String(r.resolved_by) : null,
    resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

export function staffDisplayName(e: Pick<StaffEmployee, 'firstName' | 'lastName' | 'alias'>) {
  const a = e.alias?.trim();
  if (a) return a;
  const n = `${e.firstName} ${e.lastName}`.trim();
  return n || 'Sin nombre';
}

export async function fetchStaffEmployees(
  supabase: SupabaseClient,
  localId: string,
  opts?: { onlyLinkedAuthUserId?: string | null },
): Promise<StaffEmployee[]> {
  let q = supabase
    .from('staff_employees')
    .select(
      'id,local_id,user_id,first_name,last_name,alias,phone,email,operational_role,weekly_hours_target,workday_type,color,pin_fichaje,active,created_at,updated_at',
    )
    .eq('local_id', localId);
  if (opts?.onlyLinkedAuthUserId) {
    q = q.eq('user_id', opts.onlyLinkedAuthUserId);
  }
  const { data, error } = await q.order('first_name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapEmployee(r as Record<string, unknown>));
}

export async function createStaffEmployee(
  supabase: SupabaseClient,
  input: {
    localId: string;
    firstName: string;
    lastName?: string;
    alias?: string | null;
    phone?: string | null;
    email?: string | null;
    operationalRole?: string | null;
    weeklyHoursTarget?: number | null;
    workdayType?: string | null;
    color?: string | null;
    pinFichaje?: string | null;
    userId?: string | null;
  },
): Promise<StaffEmployee> {
  const { data, error } = await supabase
    .from('staff_employees')
    .insert({
      local_id: input.localId,
      first_name: input.firstName.trim(),
      last_name: (input.lastName ?? '').trim(),
      alias: input.alias?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim()?.toLowerCase() || null,
      operational_role: input.operationalRole?.trim() || null,
      weekly_hours_target: input.weeklyHoursTarget ?? null,
      workday_type: input.workdayType?.trim() || null,
      color: input.color?.trim() || null,
      pin_fichaje: input.pinFichaje?.trim() || null,
      user_id: input.userId ?? null,
      active: true,
    })
    .select(
      'id,local_id,user_id,first_name,last_name,alias,phone,email,operational_role,weekly_hours_target,workday_type,color,pin_fichaje,active,created_at,updated_at',
    )
    .single();
  if (error || !data) throw new Error(error?.message ?? 'No se pudo crear el empleado');
  return mapEmployee(data as Record<string, unknown>);
}

export async function updateStaffEmployee(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<{
    firstName: string;
    lastName: string;
    alias: string | null;
    phone: string | null;
    email: string | null;
    operationalRole: string | null;
    weeklyHoursTarget: number | null;
    workdayType: string | null;
    color: string | null;
    pinFichaje: string | null;
    userId: string | null;
    active: boolean;
  }>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.firstName != null) row.first_name = patch.firstName.trim();
  if (patch.lastName != null) row.last_name = patch.lastName.trim();
  if (patch.alias !== undefined) row.alias = patch.alias?.trim() || null;
  if (patch.phone !== undefined) row.phone = patch.phone?.trim() || null;
  if (patch.email !== undefined) row.email = patch.email?.trim()?.toLowerCase() || null;
  if (patch.operationalRole !== undefined) row.operational_role = patch.operationalRole?.trim() || null;
  if (patch.weeklyHoursTarget !== undefined) row.weekly_hours_target = patch.weeklyHoursTarget;
  if (patch.workdayType !== undefined) row.workday_type = patch.workdayType?.trim() || null;
  if (patch.color !== undefined) row.color = patch.color?.trim() || null;
  if (patch.pinFichaje !== undefined) row.pin_fichaje = patch.pinFichaje?.trim() || null;
  if (patch.userId !== undefined) row.user_id = patch.userId;
  if (patch.active !== undefined) row.active = patch.active;
  const { error } = await supabase.from('staff_employees').update(row).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteStaffEmployee(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('staff_employees').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchShiftsRange(
  supabase: SupabaseClient,
  localId: string,
  fromYmd: string,
  toYmd: string,
  /** Si se indica, solo turnos de ese empleado (vista staff / registro personal). */
  employeeId?: string | null,
): Promise<StaffShift[]> {
  let q = supabase
    .from('staff_shifts')
    .select(
      'id,local_id,employee_id,shift_date,start_time,end_time,ends_next_day,break_minutes,zone,notes,status,color_hint,created_at,updated_at',
    )
    .eq('local_id', localId)
    .gte('shift_date', fromYmd)
    .lte('shift_date', toYmd);
  if (employeeId) {
    q = q.eq('employee_id', employeeId);
  }
  const { data, error } = await q.order('shift_date').order('start_time');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapShift(r as Record<string, unknown>));
}

export async function upsertStaffShift(
  supabase: SupabaseClient,
  input: {
    id?: string;
    localId: string;
    employeeId: string | null;
    shiftDate: string;
    startTime: string;
    endTime: string;
    endsNextDay?: boolean;
    breakMinutes?: number;
    zone?: string | null;
    notes?: string | null;
    status?: StaffShiftStatus;
    colorHint?: string | null;
  },
): Promise<StaffShift> {
  const row = {
    local_id: input.localId,
    employee_id: input.employeeId,
    shift_date: input.shiftDate,
    start_time: input.startTime,
    end_time: input.endTime,
    ends_next_day: input.endsNextDay ?? false,
    break_minutes: input.breakMinutes ?? 0,
    zone: input.zone ?? null,
    notes: input.notes ?? null,
    status: input.status ?? 'planned',
    color_hint: input.colorHint ?? null,
  };
  if (input.id) {
    const { data, error } = await supabase
      .from('staff_shifts')
      .update(row)
      .eq('id', input.id)
      .select(
        'id,local_id,employee_id,shift_date,start_time,end_time,ends_next_day,break_minutes,zone,notes,status,color_hint,created_at,updated_at',
      )
      .single();
    if (error || !data) throw new Error(error?.message ?? 'No se pudo actualizar el turno');
    return mapShift(data as Record<string, unknown>);
  }
  const { data, error } = await supabase
    .from('staff_shifts')
    .insert(row)
    .select(
      'id,local_id,employee_id,shift_date,start_time,end_time,ends_next_day,break_minutes,zone,notes,status,color_hint,created_at,updated_at',
    )
    .single();
  if (error || !data) throw new Error(error?.message ?? 'No se pudo crear el turno');
  return mapShift(data as Record<string, unknown>);
}

export async function deleteStaffShift(supabase: SupabaseClient, shiftId: string): Promise<void> {
  const { error } = await supabase.from('staff_shifts').delete().eq('id', shiftId);
  if (error) throw new Error(error.message);
}

/**
 * Traslada todos los turnos del local con zona `fromZoneKey` a `toZoneKey` (normalizadas).
 * Usado al eliminar un puesto del cuadrante (reasignación al puesto por defecto del local).
 */
export async function reassignStaffShiftsZoneForLocalZone(
  supabase: SupabaseClient,
  localId: string,
  fromZoneKey: string,
  toZoneKey: string,
): Promise<number> {
  const from = fromZoneKey.trim().toLowerCase();
  const to = toZoneKey.trim().toLowerCase();
  if (!from || from === '__none__' || !to || from === to) return 0;
  const { data, error } = await supabase
    .from('staff_shifts')
    .select('id, zone')
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
  const ids = (data ?? [])
    .filter((row: { id: string; zone: string | null }) => (row.zone ?? '').trim().toLowerCase() === from)
    .map((row: { id: string }) => row.id);
  const chunk = 200;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    if (slice.length === 0) continue;
    const { error: uerr } = await supabase.from('staff_shifts').update({ zone: to }).in('id', slice);
    if (uerr) throw new Error(uerr.message);
  }
  return ids.length;
}

export async function fetchStaffScheduleDayMarksRange(
  supabase: SupabaseClient,
  localId: string,
  fromYmd: string,
  toYmd: string,
): Promise<StaffScheduleDayMark[]> {
  const { data, error } = await supabase
    .from('staff_schedule_day_marks')
    .select('id,local_id,employee_id,mark_date,kind,created_at,updated_at')
    .eq('local_id', localId)
    .gte('mark_date', fromYmd)
    .lte('mark_date', toYmd)
    .order('mark_date');
  if (error) {
    const msg = error.message?.toLowerCase() ?? '';
    if (msg.includes('relation') && msg.includes('does not exist')) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => mapScheduleDayMark(r as Record<string, unknown>));
}

export async function upsertStaffScheduleDayMark(
  supabase: SupabaseClient,
  input: {
    localId: string;
    employeeId: string;
    markDate: string;
    kind: StaffScheduleDayMarkKind;
  },
): Promise<StaffScheduleDayMark> {
  const { data: existing, error: findErr } = await supabase
    .from('staff_schedule_day_marks')
    .select('id')
    .eq('local_id', input.localId)
    .eq('employee_id', input.employeeId)
    .eq('mark_date', input.markDate)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);
  const row = {
    local_id: input.localId,
    employee_id: input.employeeId,
    mark_date: input.markDate,
    kind: input.kind,
  };
  if (existing?.id) {
    const { data, error } = await supabase
      .from('staff_schedule_day_marks')
      .update(row)
      .eq('id', existing.id)
      .select('id,local_id,employee_id,mark_date,kind,created_at,updated_at')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'No se pudo actualizar la marca de día');
    return mapScheduleDayMark(data as Record<string, unknown>);
  }
  const { data, error } = await supabase
    .from('staff_schedule_day_marks')
    .insert(row)
    .select('id,local_id,employee_id,mark_date,kind,created_at,updated_at')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'No se pudo crear la marca de día');
  return mapScheduleDayMark(data as Record<string, unknown>);
}

export async function deleteStaffScheduleDayMark(supabase: SupabaseClient, markId: string): Promise<void> {
  const { error } = await supabase.from('staff_schedule_day_marks').delete().eq('id', markId);
  if (error) throw new Error(error.message);
}

/** Quita marca de día por empleado + fecha (si existe). */
export async function deleteStaffScheduleDayMarkForCell(
  supabase: SupabaseClient,
  localId: string,
  employeeId: string,
  markDate: string,
): Promise<void> {
  const { error } = await supabase
    .from('staff_schedule_day_marks')
    .delete()
    .eq('local_id', localId)
    .eq('employee_id', employeeId)
    .eq('mark_date', markDate);
  if (error) throw new Error(error.message);
}

export async function fetchTimeEntriesRange(
  supabase: SupabaseClient,
  localId: string,
  fromIso: string,
  toIso: string,
  employeeId?: string | null,
): Promise<StaffTimeEntry[]> {
  let q = supabase
    .from('staff_time_entries')
    .select('id,local_id,employee_id,shift_id,event_type,occurred_at,source,note,created_at')
    .eq('local_id', localId)
    .gte('occurred_at', fromIso)
    .lte('occurred_at', toIso);
  if (employeeId) {
    q = q.eq('employee_id', employeeId);
  }
  const { data, error } = await q.order('occurred_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapTimeEntry(r as Record<string, unknown>));
}

/** Últimos eventos del empleado (misma lógica que la RPC: orden global por fecha). */
export async function fetchRecentStaffTimeEntriesForEmployee(
  supabase: SupabaseClient,
  localId: string,
  employeeId: string,
  limit = 48,
): Promise<StaffTimeEntry[]> {
  const { data, error } = await supabase
    .from('staff_time_entries')
    .select('id,local_id,employee_id,shift_id,event_type,occurred_at,source,note,created_at')
    .eq('local_id', localId)
    .eq('employee_id', employeeId)
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((r) => mapTimeEntry(r as Record<string, unknown>));
  return sortEntriesByTime(rows);
}

export async function fetchTimeAdjustmentsRange(
  supabase: SupabaseClient,
  localId: string,
  fromYmd: string,
  toYmd: string,
  employeeId?: string | null,
): Promise<StaffTimeAdjustment[]> {
  let q = supabase
    .from('staff_time_entry_adjustments')
    .select(
      'id,local_id,employee_id,work_date,clock_in_original,clock_out_original,clock_in_adjusted,clock_out_adjusted,adjustment_reason,adjusted_by_user_id,adjusted_at,is_adjusted,created_at,updated_at',
    )
    .eq('local_id', localId)
    .gte('work_date', fromYmd)
    .lte('work_date', toYmd);
  if (employeeId) {
    q = q.eq('employee_id', employeeId);
  }
  const { data, error } = await q.order('work_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapTimeAdjustment(r as Record<string, unknown>));
}

export async function upsertTimeAdjustment(
  supabase: SupabaseClient,
  input: {
    localId: string;
    employeeId: string;
    workDate: string;
    clockInOriginal: string | null;
    clockOutOriginal: string | null;
    clockInAdjusted: string | null;
    clockOutAdjusted: string | null;
    adjustmentReason: string;
    adjustedByUserId: string | null;
  },
): Promise<StaffTimeAdjustment> {
  const { data: existing, error: existingErr } = await supabase
    .from('staff_time_entry_adjustments')
    .select(
      'id,clock_in_original,clock_out_original,local_id,employee_id,work_date,clock_in_adjusted,clock_out_adjusted,adjustment_reason,adjusted_by_user_id,adjusted_at,is_adjusted,created_at,updated_at',
    )
    .eq('local_id', input.localId)
    .eq('employee_id', input.employeeId)
    .eq('work_date', input.workDate)
    .maybeSingle();
  if (existingErr) throw new Error(existingErr.message);

  const originalIn =
    (existing as { clock_in_original?: string | null } | null)?.clock_in_original ?? input.clockInOriginal ?? null;
  const originalOut =
    (existing as { clock_out_original?: string | null } | null)?.clock_out_original ?? input.clockOutOriginal ?? null;

  const row = {
    local_id: input.localId,
    employee_id: input.employeeId,
    work_date: input.workDate,
    clock_in_original: originalIn,
    clock_out_original: originalOut,
    clock_in_adjusted: input.clockInAdjusted,
    clock_out_adjusted: input.clockOutAdjusted,
    adjustment_reason: input.adjustmentReason.trim(),
    adjusted_by_user_id: input.adjustedByUserId,
    adjusted_at: new Date().toISOString(),
    is_adjusted: true,
  };

  const query = existing
    ? supabase.from('staff_time_entry_adjustments').update(row).eq('id', String((existing as { id: string }).id))
    : supabase.from('staff_time_entry_adjustments').insert(row);

  const { data, error } = await query
    .select(
      'id,local_id,employee_id,work_date,clock_in_original,clock_out_original,clock_in_adjusted,clock_out_adjusted,adjustment_reason,adjusted_by_user_id,adjusted_at,is_adjusted,created_at,updated_at',
    )
    .single();
  if (error || !data) throw new Error(error?.message ?? 'No se pudo guardar el ajuste');
  return mapTimeAdjustment(data as Record<string, unknown>);
}

export type StaffKioskResolveResult =
  | {
      ok: true;
      employeeId: string;
      firstName: string;
      lastName: string;
      alias: string | null;
    }
  | { ok: false; error: string };

/** Solo admin/manager: resuelve ficha por PIN en el local (terminal tablet). */
export async function staffKioskResolveByPin(
  supabase: SupabaseClient,
  pin: string,
): Promise<StaffKioskResolveResult> {
  const { data, error } = await supabase.rpc('staff_kiosk_resolve_by_pin', { p_pin: pin });
  if (error) throw new Error(error.message);
  if (data == null || typeof data !== 'object') {
    return { ok: false, error: 'invalid_response' };
  }
  const o = data as Record<string, unknown>;
  if (o.ok !== true) {
    return { ok: false, error: String(o.error ?? 'unknown') };
  }
  return {
    ok: true,
    employeeId: String(o.employee_id),
    firstName: String(o.first_name ?? ''),
    lastName: String(o.last_name ?? ''),
    alias: o.alias ? String(o.alias) : null,
  };
}

export async function recordStaffTimeEvent(
  supabase: SupabaseClient,
  input: {
    employeeId: string;
    eventType: StaffTimeEventType;
    shiftId?: string | null;
    note?: string | null;
    origin?: string;
    pin?: string | null;
    force?: boolean;
  },
): Promise<string> {
  const { data, error } = await supabase.rpc('staff_record_time_entry', {
    p_employee_id: input.employeeId,
    p_event_type: input.eventType,
    p_shift_id: input.shiftId ?? null,
    p_observacion: input.note ?? null,
    p_origen: input.origin ?? 'app',
    p_pin: input.pin ?? null,
    p_force: input.force ?? false,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== 'string') throw new Error('Respuesta RPC inesperada');
  return data;
}

export async function managerPatchTimeEntry(
  supabase: SupabaseClient,
  entryId: string,
  patch: { occurredAt?: string; note?: string | null },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.occurredAt) row.occurred_at = patch.occurredAt;
  if (patch.note !== undefined) row.note = patch.note;
  const { error } = await supabase.from('staff_time_entries').update(row).eq('id', entryId);
  if (error) throw new Error(error.message);
}

export async function managerDeleteTimeEntry(supabase: SupabaseClient, entryId: string): Promise<void> {
  const { error } = await supabase.from('staff_time_entries').delete().eq('id', entryId);
  if (error) throw new Error(error.message);
}

export async function fetchIncidents(
  supabase: SupabaseClient,
  localId: string,
  fromYmd?: string,
  toYmd?: string,
): Promise<StaffIncident[]> {
  let q = supabase
    .from('staff_attendance_incidents')
    .select(
      'id,local_id,employee_id,shift_id,incident_date,incident_type,description,status,resolution_note,resolved_by,resolved_at,created_at,updated_at',
    )
    .eq('local_id', localId)
    .order('incident_date', { ascending: false });
  if (fromYmd) q = q.gte('incident_date', fromYmd);
  if (toYmd) q = q.lte('incident_date', toYmd);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapIncident(r as Record<string, unknown>));
}

export async function createIncident(
  supabase: SupabaseClient,
  input: {
    localId: string;
    employeeId: string;
    shiftId?: string | null;
    incidentDate: string;
    incidentType: StaffIncident['incidentType'];
    description?: string | null;
  },
): Promise<StaffIncident> {
  const { data, error } = await supabase
    .from('staff_attendance_incidents')
    .insert({
      local_id: input.localId,
      employee_id: input.employeeId,
      shift_id: input.shiftId ?? null,
      incident_date: input.incidentDate,
      incident_type: input.incidentType,
      description: input.description ?? null,
      status: 'open',
    })
    .select(
      'id,local_id,employee_id,shift_id,incident_date,incident_type,description,status,resolution_note,resolved_by,resolved_at,created_at,updated_at',
    )
    .single();
  if (error || !data) throw new Error(error?.message ?? 'No se pudo crear la incidencia');
  return mapIncident(data as Record<string, unknown>);
}

export async function resolveIncident(
  supabase: SupabaseClient,
  incidentId: string,
  input: { status: StaffIncidentStatus; resolutionNote?: string | null },
): Promise<void> {
  const closed = input.status !== 'open';
  const { error } = await supabase
    .from('staff_attendance_incidents')
    .update({
      status: input.status,
      resolution_note: input.resolutionNote ?? null,
      resolved_at: closed ? new Date().toISOString() : null,
    })
    .eq('id', incidentId);
  if (error) throw new Error(error.message);
}

/** Copia turnos de una semana a otra (mismos empleados y horas). */
export async function fetchStaffRequests(
  supabase: SupabaseClient,
  localId: string,
  opts?: { employeeId?: string; status?: StaffRequestStatus },
): Promise<StaffRequest[]> {
  let q = supabase
    .from('staff_requests')
    .select(
      'id,local_id,employee_id,request_type,start_date,end_date,notes,status,reviewed_at,reviewed_by,created_at,updated_at',
    )
    .eq('local_id', localId)
    .order('created_at', { ascending: false });
  if (opts?.employeeId) q = q.eq('employee_id', opts.employeeId);
  if (opts?.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapRequest(r as Record<string, unknown>));
}

export async function createStaffRequest(
  supabase: SupabaseClient,
  input: {
    localId: string;
    employeeId: string;
    requestType?: StaffRequestType;
    startDate: string;
    endDate?: string | null;
    notes?: string | null;
  },
): Promise<StaffRequest> {
  const { data, error } = await supabase
    .from('staff_requests')
    .insert({
      local_id: input.localId,
      employee_id: input.employeeId,
      request_type: input.requestType ?? 'time_off',
      start_date: input.startDate,
      end_date: input.endDate ?? null,
      notes: input.notes?.trim() || null,
      status: 'pending',
    })
    .select(
      'id,local_id,employee_id,request_type,start_date,end_date,notes,status,reviewed_at,reviewed_by,created_at,updated_at',
    )
    .single();
  if (error || !data) throw new Error(error?.message ?? 'No se pudo crear la solicitud');
  return mapRequest(data as Record<string, unknown>);
}

export async function setStaffRequestStatus(
  supabase: SupabaseClient,
  requestId: string,
  status: Extract<StaffRequestStatus, 'approved' | 'rejected'>,
): Promise<void> {
  const { error } = await supabase
    .from('staff_requests')
    .update({
      status,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId);
  if (error) throw new Error(error.message);
}

export async function duplicateShiftsWeek(
  supabase: SupabaseClient,
  localId: string,
  fromWeekStartYmd: string,
  toWeekStartYmd: string,
): Promise<number> {
  const from = new Date(fromWeekStartYmd + 'T12:00:00');
  const to = new Date(toWeekStartYmd + 'T12:00:00');
  const deltaDays = Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  const fromEnd = new Date(from);
  fromEnd.setDate(fromEnd.getDate() + 6);
  const fromEndYmd = `${fromEnd.getFullYear()}-${String(fromEnd.getMonth() + 1).padStart(2, '0')}-${String(fromEnd.getDate()).padStart(2, '0')}`;
  const existing = await fetchShiftsRange(supabase, localId, fromWeekStartYmd, fromEndYmd);
  let n = 0;
  for (const s of existing) {
    const d = new Date(s.shiftDate + 'T12:00:00');
    d.setDate(d.getDate() + deltaDays);
    const newYmd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await upsertStaffShift(supabase, {
      localId,
      employeeId: s.employeeId,
      shiftDate: newYmd,
      startTime: s.startTime,
      endTime: s.endTime,
      endsNextDay: s.endsNextDay,
      breakMinutes: s.breakMinutes,
      zone: s.zone,
      notes: s.notes,
      status: 'planned',
      colorHint: s.colorHint,
    });
    n += 1;
  }
  return n;
}
