import type { SupabaseClient } from '@supabase/supabase-js';

export type AppccCleaningCategoryRow = {
  id: string;
  local_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type AppccCleaningTaskRow = {
  id: string;
  local_id: string;
  category_id: string;
  title: string;
  instructions: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AppccCleaningSlot = 'manana' | 'noche';

export type AppccCleaningLogRow = {
  id: string;
  local_id: string;
  task_id: string;
  log_date: string;
  slot: AppccCleaningSlot;
  operator_name: string;
  notes: string;
  user_id: string | null;
  recorded_at: string;
  updated_at: string;
};

export const APPCC_CLEANING_SLOT_LABEL: Record<AppccCleaningSlot, string> = {
  manana: 'Mañana',
  noche: 'Noche',
};

export function cleaningLogsByTaskAndSlot(logs: AppccCleaningLogRow[]): Map<string, AppccCleaningLogRow> {
  const m = new Map<string, AppccCleaningLogRow>();
  for (const r of logs) {
    m.set(`${r.task_id}:${r.slot}`, r);
  }
  return m;
}

export async function fetchCleaningCategories(
  supabase: SupabaseClient,
  localId: string,
): Promise<AppccCleaningCategoryRow[]> {
  const { data, error } = await supabase
    .from('appcc_cleaning_categories')
    .select('id,local_id,name,sort_order,created_at,updated_at')
    .eq('local_id', localId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AppccCleaningCategoryRow[];
}

export async function insertCleaningCategory(
  supabase: SupabaseClient,
  localId: string,
  name: string,
): Promise<AppccCleaningCategoryRow> {
  const { data: existing } = await supabase
    .from('appcc_cleaning_categories')
    .select('sort_order')
    .eq('local_id', localId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (existing?.sort_order ?? -1) + 1;
  const { data, error } = await supabase
    .from('appcc_cleaning_categories')
    .insert({
      local_id: localId,
      name: name.trim(),
      sort_order: nextOrder,
    })
    .select('id,local_id,name,sort_order,created_at,updated_at')
    .single();
  if (error) throw new Error(error.message);
  return data as AppccCleaningCategoryRow;
}

export async function deleteCleaningCategory(
  supabase: SupabaseClient,
  localId: string,
  categoryId: string,
): Promise<void> {
  const { error } = await supabase
    .from('appcc_cleaning_categories')
    .delete()
    .eq('id', categoryId)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function fetchCleaningTasks(
  supabase: SupabaseClient,
  localId: string,
  activeOnly = true,
): Promise<AppccCleaningTaskRow[]> {
  let q = supabase
    .from('appcc_cleaning_tasks')
    .select(
      'id,local_id,category_id,title,instructions,sort_order,is_active,created_at,updated_at',
    )
    .eq('local_id', localId)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AppccCleaningTaskRow[];
}

export async function insertCleaningTask(
  supabase: SupabaseClient,
  localId: string,
  categoryId: string,
  payload: { title: string; instructions?: string },
): Promise<AppccCleaningTaskRow> {
  const { data: siblings } = await supabase
    .from('appcc_cleaning_tasks')
    .select('sort_order')
    .eq('local_id', localId)
    .eq('category_id', categoryId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (siblings?.sort_order ?? -1) + 1;
  const { data, error } = await supabase
    .from('appcc_cleaning_tasks')
    .insert({
      local_id: localId,
      category_id: categoryId,
      title: payload.title.trim(),
      instructions: (payload.instructions ?? '').trim(),
      sort_order: nextOrder,
      is_active: true,
    })
    .select(
      'id,local_id,category_id,title,instructions,sort_order,is_active,created_at,updated_at',
    )
    .single();
  if (error) throw new Error(error.message);
  return data as AppccCleaningTaskRow;
}

export async function updateCleaningTask(
  supabase: SupabaseClient,
  localId: string,
  taskId: string,
  patch: { title?: string; instructions?: string; is_active?: boolean },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.instructions !== undefined) row.instructions = patch.instructions.trim();
  if (patch.is_active !== undefined) row.is_active = patch.is_active;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase
    .from('appcc_cleaning_tasks')
    .update(row)
    .eq('id', taskId)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function deleteCleaningTask(
  supabase: SupabaseClient,
  localId: string,
  taskId: string,
): Promise<void> {
  const { error } = await supabase
    .from('appcc_cleaning_tasks')
    .delete()
    .eq('id', taskId)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function fetchCleaningLogsForDate(
  supabase: SupabaseClient,
  localId: string,
  logDate: string,
): Promise<AppccCleaningLogRow[]> {
  const { data, error } = await supabase
    .from('appcc_cleaning_logs')
    .select(
      'id,local_id,task_id,log_date,slot,operator_name,notes,user_id,recorded_at,updated_at',
    )
    .eq('local_id', localId)
    .eq('log_date', logDate);
  if (error) throw new Error(error.message);
  return (data ?? []) as AppccCleaningLogRow[];
}

export async function fetchCleaningLogsInRange(
  supabase: SupabaseClient,
  localId: string,
  dateFrom: string,
  dateTo: string,
): Promise<AppccCleaningLogRow[]> {
  const { data, error } = await supabase
    .from('appcc_cleaning_logs')
    .select(
      'id,local_id,task_id,log_date,slot,operator_name,notes,user_id,recorded_at,updated_at',
    )
    .eq('local_id', localId)
    .gte('log_date', dateFrom)
    .lte('log_date', dateTo)
    .order('log_date', { ascending: false })
    .order('recorded_at', { ascending: false })
    .limit(8000);
  if (error) throw new Error(error.message);
  return (data ?? []) as AppccCleaningLogRow[];
}

export async function upsertCleaningLog(
  supabase: SupabaseClient,
  payload: {
    localId: string;
    taskId: string;
    logDate: string;
    slot: AppccCleaningSlot;
    operatorName: string;
    notes: string;
    userId: string;
  },
): Promise<AppccCleaningLogRow> {
  const { data, error } = await supabase
    .from('appcc_cleaning_logs')
    .upsert(
      {
        local_id: payload.localId,
        task_id: payload.taskId,
        log_date: payload.logDate,
        slot: payload.slot,
        operator_name: payload.operatorName.trim(),
        notes: payload.notes.trim(),
        user_id: payload.userId,
      },
      { onConflict: 'task_id,log_date,slot' },
    )
    .select(
      'id,local_id,task_id,log_date,slot,operator_name,notes,user_id,recorded_at,updated_at',
    )
    .single();
  if (error) throw new Error(error.message);
  return data as AppccCleaningLogRow;
}

export async function deleteCleaningLog(
  supabase: SupabaseClient,
  localId: string,
  logId: string,
): Promise<void> {
  const { error } = await supabase
    .from('appcc_cleaning_logs')
    .delete()
    .eq('id', logId)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}

/** 0 = domingo … 6 = sábado (igual que Date.getDay() en JavaScript). */
export type AppccCleaningWeekdayItemRow = {
  id: string;
  local_id: string;
  weekday: number;
  task_id: string | null;
  cold_unit_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export async function fetchCleaningWeekdayItems(
  supabase: SupabaseClient,
  localId: string,
): Promise<AppccCleaningWeekdayItemRow[]> {
  const { data, error } = await supabase
    .from('appcc_cleaning_weekday_items')
    .select('id,local_id,weekday,task_id,cold_unit_id,sort_order,created_at,updated_at')
    .eq('local_id', localId)
    .order('weekday', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AppccCleaningWeekdayItemRow[];
}

export async function replaceCleaningWeekdayItems(
  supabase: SupabaseClient,
  localId: string,
  weekday: number,
  items: Array<{ taskId?: string | null; coldUnitId?: string | null }>,
): Promise<void> {
  if (weekday < 0 || weekday > 6 || !Number.isInteger(weekday)) {
    throw new Error('weekday debe ser entero 0–6 (Date.getDay).');
  }
  const rows: Array<{
    local_id: string;
    weekday: number;
    task_id: string | null;
    cold_unit_id: string | null;
    sort_order: number;
  }> = [];
  for (let i = 0; i < items.length; i += 1) {
    const x = items[i];
    const tid = (x.taskId ?? '').trim() || null;
    const cid = (x.coldUnitId ?? '').trim() || null;
    if (tid && cid) throw new Error('Cada ítem debe ser solo tarea o solo equipo frío.');
    if (!tid && !cid) continue;
    rows.push({
      local_id: localId,
      weekday,
      task_id: tid,
      cold_unit_id: cid,
      sort_order: rows.length,
    });
  }
  const { error: delErr } = await supabase
    .from('appcc_cleaning_weekday_items')
    .delete()
    .eq('local_id', localId)
    .eq('weekday', weekday);
  if (delErr) throw new Error(delErr.message);
  if (rows.length === 0) return;
  const { error: insErr } = await supabase.from('appcc_cleaning_weekday_items').insert(rows);
  if (insErr) throw new Error(insErr.message);
}
