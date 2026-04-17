import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  StaffEmployee,
  StaffIncident,
  StaffIncidentStatus,
  StaffShift,
  StaffShiftStatus,
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

function mapShift(r: Record<string, unknown>): StaffShift {
  return {
    id: String(r.id),
    localId: String(r.local_id),
    employeeId: String(r.employee_id),
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

export async function fetchStaffEmployees(supabase: SupabaseClient, localId: string): Promise<StaffEmployee[]> {
  const { data, error } = await supabase
    .from('staff_employees')
    .select(
      'id,local_id,user_id,first_name,last_name,alias,phone,email,operational_role,weekly_hours_target,workday_type,color,pin_fichaje,active,created_at,updated_at',
    )
    .eq('local_id', localId)
    .order('first_name');
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

export async function fetchShiftsRange(
  supabase: SupabaseClient,
  localId: string,
  fromYmd: string,
  toYmd: string,
): Promise<StaffShift[]> {
  const { data, error } = await supabase
    .from('staff_shifts')
    .select(
      'id,local_id,employee_id,shift_date,start_time,end_time,ends_next_day,break_minutes,zone,notes,status,color_hint,created_at,updated_at',
    )
    .eq('local_id', localId)
    .gte('shift_date', fromYmd)
    .lte('shift_date', toYmd)
    .order('shift_date')
    .order('start_time');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapShift(r as Record<string, unknown>));
}

export async function upsertStaffShift(
  supabase: SupabaseClient,
  input: {
    id?: string;
    localId: string;
    employeeId: string;
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

export async function fetchTimeEntriesRange(
  supabase: SupabaseClient,
  localId: string,
  fromIso: string,
  toIso: string,
): Promise<StaffTimeEntry[]> {
  const { data, error } = await supabase
    .from('staff_time_entries')
    .select('id,local_id,employee_id,shift_id,event_type,occurred_at,source,note,created_at')
    .eq('local_id', localId)
    .gte('occurred_at', fromIso)
    .lte('occurred_at', toIso)
    .order('occurred_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapTimeEntry(r as Record<string, unknown>));
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
