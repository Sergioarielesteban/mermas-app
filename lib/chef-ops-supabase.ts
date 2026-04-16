import type { SupabaseClient } from '@supabase/supabase-js';

export type ChecklistContext = 'opening' | 'shift_change' | 'closing' | 'hygiene_bathroom' | 'custom';

export const CHECKLIST_CONTEXT_LABEL: Record<ChecklistContext, string> = {
  opening: 'Apertura',
  shift_change: 'Cambio de turno',
  closing: 'Cierre',
  hygiene_bathroom: 'Limpieza lavabos',
  custom: 'Personalizado',
};

export type ChefChecklist = {
  id: string;
  localId: string;
  title: string;
  context: ChecklistContext;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChefChecklistSection = {
  id: string;
  checklistId: string;
  title: string;
  sortOrder: number;
};

export type ChefChecklistItem = {
  id: string;
  checklistId: string;
  sectionId: string | null;
  label: string;
  sortOrder: number;
};

export type ChefChecklistRun = {
  id: string;
  localId: string;
  checklistId: string;
  runDate: string;
  shiftLabel: string | null;
  startedAt: string;
  completedAt: string | null;
  createdBy: string | null;
};

export type ChefChecklistRunItem = {
  id: string;
  runId: string;
  itemId: string;
  isDone: boolean;
  doneAt: string | null;
  note: string | null;
};

export type ProductionCadence = 'daily' | 'weekly' | 'monthly' | 'custom';

export const PRODUCTION_CADENCE_LABEL: Record<ProductionCadence, string> = {
  daily: 'Diaria',
  weekly: 'Semanal',
  monthly: 'Mensual',
  custom: 'A medida',
};

export type ChefProductionPlan = {
  id: string;
  localId: string;
  name: string;
  cadence: ProductionCadence;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChefProductionSection = {
  id: string;
  planId: string;
  title: string;
  sortOrder: number;
};

export type ChefProductionTask = {
  id: string;
  sectionId: string;
  label: string;
  sortOrder: number;
  hint: string | null;
  /** Objetivo lunes–jueves (plantilla). */
  stockLunJue: number | null;
  /** Objetivo viernes–domingo (plantilla). */
  stockVieDom: number | null;
};

export type ChefProductionRun = {
  id: string;
  localId: string;
  planId: string;
  periodStart: string;
  periodLabel: string | null;
  startedAt: string;
  completedAt: string | null;
  createdBy: string | null;
};

export type ChefProductionRunTask = {
  id: string;
  runId: string;
  taskId: string;
  isDone: boolean;
  doneAt: string | null;
  qtyNote: string | null;
  qtyOnHand: number | null;
  qtyToMake: number | null;
};

function mapChecklist(r: Record<string, unknown>): ChefChecklist {
  return {
    id: String(r.id),
    localId: String(r.local_id),
    title: String(r.title),
    context: r.context as ChecklistContext,
    sortOrder: Number(r.sort_order ?? 0),
    isActive: Boolean(r.is_active),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapSection(r: Record<string, unknown>): ChefChecklistSection {
  return {
    id: String(r.id),
    checklistId: String(r.checklist_id),
    title: String(r.title),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapItem(r: Record<string, unknown>): ChefChecklistItem {
  return {
    id: String(r.id),
    checklistId: String(r.checklist_id),
    sectionId: r.section_id != null ? String(r.section_id) : null,
    label: String(r.label),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapPlan(r: Record<string, unknown>): ChefProductionPlan {
  return {
    id: String(r.id),
    localId: String(r.local_id),
    name: String(r.name),
    cadence: r.cadence as ProductionCadence,
    sortOrder: Number(r.sort_order ?? 0),
    isActive: Boolean(r.is_active),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapProdSection(r: Record<string, unknown>): ChefProductionSection {
  return {
    id: String(r.id),
    planId: String(r.plan_id),
    title: String(r.title),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapTask(r: Record<string, unknown>): ChefProductionTask {
  return {
    id: String(r.id),
    sectionId: String(r.section_id),
    label: String(r.label),
    sortOrder: Number(r.sort_order ?? 0),
    hint: r.hint != null ? String(r.hint) : null,
    stockLunJue: r.stock_lun_jue != null && r.stock_lun_jue !== '' ? Number(r.stock_lun_jue) : null,
    stockVieDom: r.stock_vie_dom != null && r.stock_vie_dom !== '' ? Number(r.stock_vie_dom) : null,
  };
}

/** Viernes–domingo vs lunes–jueves según la fecha (hora local). */
export function productionStockBandForDate(isoDate: string): 'weekday' | 'weekend' {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  if (dow === 0 || dow === 5 || dow === 6) return 'weekend';
  return 'weekday';
}

export const PRODUCTION_STOCK_BAND_LABEL: Record<'weekday' | 'weekend', string> = {
  weekday: 'Lun–Jue',
  weekend: 'Vie–Dom',
};

export function targetForProductionBand(task: ChefProductionTask, band: 'weekday' | 'weekend'): number {
  const v = band === 'weekend' ? task.stockVieDom : task.stockLunJue;
  return v != null && !Number.isNaN(v) ? v : 0;
}

export function suggestQtyToMake(target: number, onHand: number | null): number {
  const h = onHand != null && !Number.isNaN(onHand) ? onHand : 0;
  const diff = target - h;
  return diff > 0 ? diff : 0;
}

export async function fetchChefChecklist(
  supabase: SupabaseClient,
  localId: string,
  id: string,
): Promise<ChefChecklist | null> {
  const { data, error } = await supabase
    .from('chef_checklists')
    .select('id,local_id,title,context,sort_order,is_active,created_at,updated_at')
    .eq('local_id', localId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapChecklist(data as Record<string, unknown>);
}

export async function fetchChefChecklistRunRow(
  supabase: SupabaseClient,
  runId: string,
): Promise<ChefChecklistRun | null> {
  const { data, error } = await supabase
    .from('chef_checklist_runs')
    .select('id,local_id,checklist_id,run_date,shift_label,started_at,completed_at,created_by')
    .eq('id', runId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: String(data.id),
    localId: String(data.local_id),
    checklistId: String(data.checklist_id),
    runDate: String(data.run_date),
    shiftLabel: data.shift_label != null ? String(data.shift_label) : null,
    startedAt: String(data.started_at),
    completedAt: data.completed_at != null ? String(data.completed_at) : null,
    createdBy: data.created_by != null ? String(data.created_by) : null,
  };
}

export async function fetchChefProductionPlan(
  supabase: SupabaseClient,
  localId: string,
  id: string,
): Promise<ChefProductionPlan | null> {
  const { data, error } = await supabase
    .from('chef_production_plans')
    .select('id,local_id,name,cadence,sort_order,is_active,created_at,updated_at')
    .eq('local_id', localId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapPlan(data as Record<string, unknown>);
}

export async function fetchChefProductionRunRow(
  supabase: SupabaseClient,
  runId: string,
): Promise<ChefProductionRun | null> {
  const { data, error } = await supabase
    .from('chef_production_runs')
    .select('id,local_id,plan_id,period_start,period_label,started_at,completed_at,created_by')
    .eq('id', runId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: String(data.id),
    localId: String(data.local_id),
    planId: String(data.plan_id),
    periodStart: String(data.period_start),
    periodLabel: data.period_label != null ? String(data.period_label) : null,
    startedAt: String(data.started_at),
    completedAt: data.completed_at != null ? String(data.completed_at) : null,
    createdBy: data.created_by != null ? String(data.created_by) : null,
  };
}

export async function fetchChefChecklists(supabase: SupabaseClient, localId: string): Promise<ChefChecklist[]> {
  const { data, error } = await supabase
    .from('chef_checklists')
    .select('id,local_id,title,context,sort_order,is_active,created_at,updated_at')
    .eq('local_id', localId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapChecklist(r as Record<string, unknown>));
}

/** Para historial: incluye listas desactivadas si aún existen en BD. */
export async function fetchChefChecklistsByIds(
  supabase: SupabaseClient,
  localId: string,
  ids: string[],
): Promise<ChefChecklist[]> {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (uniq.length === 0) return [];
  const { data, error } = await supabase
    .from('chef_checklists')
    .select('id,local_id,title,context,sort_order,is_active,created_at,updated_at')
    .eq('local_id', localId)
    .in('id', uniq);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapChecklist(r as Record<string, unknown>));
}

export async function insertChefChecklist(
  supabase: SupabaseClient,
  localId: string,
  input: { title: string; context?: ChecklistContext },
): Promise<ChefChecklist> {
  const { data, error } = await supabase
    .from('chef_checklists')
    .insert({
      local_id: localId,
      title: input.title.trim(),
      context: input.context ?? 'custom',
      sort_order: 0,
      is_active: true,
    })
    .select('id,local_id,title,context,sort_order,is_active,created_at,updated_at')
    .single();
  if (error) throw new Error(error.message);
  return mapChecklist(data as Record<string, unknown>);
}

export async function updateChefChecklist(
  supabase: SupabaseClient,
  localId: string,
  id: string,
  patch: Partial<{ title: string; context: ChecklistContext; sortOrder: number; isActive: boolean }>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.title != null) row.title = patch.title.trim();
  if (patch.context != null) row.context = patch.context;
  if (patch.sortOrder != null) row.sort_order = patch.sortOrder;
  if (patch.isActive != null) row.is_active = patch.isActive;
  const { error } = await supabase.from('chef_checklists').update(row).eq('id', id).eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function deleteChefChecklist(supabase: SupabaseClient, localId: string, id: string): Promise<void> {
  const { error } = await supabase.from('chef_checklists').delete().eq('id', id).eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function fetchChefChecklistSections(
  supabase: SupabaseClient,
  checklistId: string,
): Promise<ChefChecklistSection[]> {
  const { data, error } = await supabase
    .from('chef_checklist_sections')
    .select('id,checklist_id,title,sort_order')
    .eq('checklist_id', checklistId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapSection(r as Record<string, unknown>));
}

export async function insertChefChecklistSection(
  supabase: SupabaseClient,
  checklistId: string,
  title: string,
  sortOrder: number,
): Promise<ChefChecklistSection> {
  const { data, error } = await supabase
    .from('chef_checklist_sections')
    .insert({ checklist_id: checklistId, title: title.trim(), sort_order: sortOrder })
    .select('id,checklist_id,title,sort_order')
    .single();
  if (error) throw new Error(error.message);
  return mapSection(data as Record<string, unknown>);
}

export async function deleteChefChecklistSection(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('chef_checklist_sections').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchChefChecklistItems(
  supabase: SupabaseClient,
  checklistId: string,
): Promise<ChefChecklistItem[]> {
  const { data, error } = await supabase
    .from('chef_checklist_items')
    .select('id,checklist_id,section_id,label,sort_order')
    .eq('checklist_id', checklistId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapItem(r as Record<string, unknown>));
}

export async function insertChefChecklistItem(
  supabase: SupabaseClient,
  checklistId: string,
  input: { label: string; sectionId?: string | null; sortOrder: number },
): Promise<ChefChecklistItem> {
  const { data, error } = await supabase
    .from('chef_checklist_items')
    .insert({
      checklist_id: checklistId,
      section_id: input.sectionId ?? null,
      label: input.label.trim(),
      sort_order: input.sortOrder,
    })
    .select('id,checklist_id,section_id,label,sort_order')
    .single();
  if (error) throw new Error(error.message);
  return mapItem(data as Record<string, unknown>);
}

export async function deleteChefChecklistItem(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('chef_checklist_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchChefChecklistRuns(
  supabase: SupabaseClient,
  localId: string,
  limit = 40,
): Promise<ChefChecklistRun[]> {
  const { data, error } = await supabase
    .from('chef_checklist_runs')
    .select('id,local_id,checklist_id,run_date,shift_label,started_at,completed_at,created_by')
    .eq('local_id', localId)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    localId: String(r.local_id),
    checklistId: String(r.checklist_id),
    runDate: String(r.run_date),
    shiftLabel: r.shift_label != null ? String(r.shift_label) : null,
    startedAt: String(r.started_at),
    completedAt: r.completed_at != null ? String(r.completed_at) : null,
    createdBy: r.created_by != null ? String(r.created_by) : null,
  }));
}

export async function startChefChecklistRun(
  supabase: SupabaseClient,
  localId: string,
  checklistId: string,
  runDate: string,
  shiftLabel: string | null,
  userId: string | null,
): Promise<{ run: ChefChecklistRun; items: ChefChecklistItem[] }> {
  const items = await fetchChefChecklistItems(supabase, checklistId);
  if (items.length === 0) throw new Error('Esta lista no tiene ítems. Añade tareas antes de ejecutarla.');

  const { data: runRow, error: runErr } = await supabase
    .from('chef_checklist_runs')
    .insert({
      local_id: localId,
      checklist_id: checklistId,
      run_date: runDate,
      shift_label: shiftLabel?.trim() || null,
      created_by: userId,
    })
    .select('id,local_id,checklist_id,run_date,shift_label,started_at,completed_at,created_by')
    .single();
  if (runErr) throw new Error(runErr.message);

  const run: ChefChecklistRun = {
    id: String(runRow.id),
    localId: String(runRow.local_id),
    checklistId: String(runRow.checklist_id),
    runDate: String(runRow.run_date),
    shiftLabel: runRow.shift_label != null ? String(runRow.shift_label) : null,
    startedAt: String(runRow.started_at),
    completedAt: runRow.completed_at != null ? String(runRow.completed_at) : null,
    createdBy: runRow.created_by != null ? String(runRow.created_by) : null,
  };

  const rows = items.map((it) => ({
    run_id: run.id,
    item_id: it.id,
    is_done: false,
  }));
  const { error: insErr } = await supabase.from('chef_checklist_run_items').insert(rows);
  if (insErr) throw new Error(insErr.message);

  return { run, items };
}

export async function fetchChefChecklistRunItems(
  supabase: SupabaseClient,
  runId: string,
): Promise<ChefChecklistRunItem[]> {
  const { data, error } = await supabase
    .from('chef_checklist_run_items')
    .select('id,run_id,item_id,is_done,done_at,note')
    .eq('run_id', runId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    runId: String(r.run_id),
    itemId: String(r.item_id),
    isDone: Boolean(r.is_done),
    doneAt: r.done_at != null ? String(r.done_at) : null,
    note: r.note != null ? String(r.note) : null,
  }));
}

export async function setChefChecklistRunItemDone(
  supabase: SupabaseClient,
  runItemId: string,
  isDone: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('chef_checklist_run_items')
    .update({
      is_done: isDone,
      done_at: isDone ? new Date().toISOString() : null,
    })
    .eq('id', runItemId);
  if (error) throw new Error(error.message);
}

export async function completeChefChecklistRun(supabase: SupabaseClient, runId: string): Promise<void> {
  const { error } = await supabase
    .from('chef_checklist_runs')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', runId);
  if (error) throw new Error(error.message);
}

export async function fetchChefProductionPlans(supabase: SupabaseClient, localId: string): Promise<ChefProductionPlan[]> {
  const { data, error } = await supabase
    .from('chef_production_plans')
    .select('id,local_id,name,cadence,sort_order,is_active,created_at,updated_at')
    .eq('local_id', localId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapPlan(r as Record<string, unknown>));
}

export async function fetchChefProductionPlansByIds(
  supabase: SupabaseClient,
  localId: string,
  ids: string[],
): Promise<ChefProductionPlan[]> {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (uniq.length === 0) return [];
  const { data, error } = await supabase
    .from('chef_production_plans')
    .select('id,local_id,name,cadence,sort_order,is_active,created_at,updated_at')
    .eq('local_id', localId)
    .in('id', uniq);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapPlan(r as Record<string, unknown>));
}

export async function insertChefProductionPlan(
  supabase: SupabaseClient,
  localId: string,
  input: { name: string; cadence?: ProductionCadence },
): Promise<ChefProductionPlan> {
  const { data, error } = await supabase
    .from('chef_production_plans')
    .insert({
      local_id: localId,
      name: input.name.trim(),
      cadence: input.cadence ?? 'daily',
      sort_order: 0,
      is_active: true,
    })
    .select('id,local_id,name,cadence,sort_order,is_active,created_at,updated_at')
    .single();
  if (error) throw new Error(error.message);
  return mapPlan(data as Record<string, unknown>);
}

export async function deleteChefProductionPlan(supabase: SupabaseClient, localId: string, id: string): Promise<void> {
  const { error } = await supabase.from('chef_production_plans').delete().eq('id', id).eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function fetchChefProductionSections(
  supabase: SupabaseClient,
  planId: string,
): Promise<ChefProductionSection[]> {
  const { data, error } = await supabase
    .from('chef_production_sections')
    .select('id,plan_id,title,sort_order')
    .eq('plan_id', planId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapProdSection(r as Record<string, unknown>));
}

export async function insertChefProductionSection(
  supabase: SupabaseClient,
  planId: string,
  title: string,
  sortOrder: number,
): Promise<ChefProductionSection> {
  const { data, error } = await supabase
    .from('chef_production_sections')
    .insert({ plan_id: planId, title: title.trim(), sort_order: sortOrder })
    .select('id,plan_id,title,sort_order')
    .single();
  if (error) throw new Error(error.message);
  return mapProdSection(data as Record<string, unknown>);
}

export async function deleteChefProductionSection(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('chef_production_sections').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchChefProductionTasks(supabase: SupabaseClient, sectionId: string): Promise<ChefProductionTask[]> {
  const { data, error } = await supabase
    .from('chef_production_tasks')
    .select('id,section_id,label,sort_order,hint,stock_lun_jue,stock_vie_dom')
    .eq('section_id', sectionId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapTask(r as Record<string, unknown>));
}

export async function insertChefProductionTask(
  supabase: SupabaseClient,
  sectionId: string,
  input: {
    label: string;
    hint?: string | null;
    sortOrder: number;
    stockLunJue?: number | null;
    stockVieDom?: number | null;
  },
): Promise<ChefProductionTask> {
  const { data, error } = await supabase
    .from('chef_production_tasks')
    .insert({
      section_id: sectionId,
      label: input.label.trim(),
      hint: input.hint?.trim() || null,
      sort_order: input.sortOrder,
      stock_lun_jue: input.stockLunJue ?? null,
      stock_vie_dom: input.stockVieDom ?? null,
    })
    .select('id,section_id,label,sort_order,hint,stock_lun_jue,stock_vie_dom')
    .single();
  if (error) throw new Error(error.message);
  return mapTask(data as Record<string, unknown>);
}

export async function updateChefProductionTask(
  supabase: SupabaseClient,
  taskId: string,
  patch: {
    label?: string;
    hint?: string | null;
    stockLunJue?: number | null;
    stockVieDom?: number | null;
  },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) row.label = patch.label.trim();
  if (patch.hint !== undefined) row.hint = patch.hint?.trim() || null;
  if (patch.stockLunJue !== undefined) row.stock_lun_jue = patch.stockLunJue;
  if (patch.stockVieDom !== undefined) row.stock_vie_dom = patch.stockVieDom;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('chef_production_tasks').update(row).eq('id', taskId);
  if (error) throw new Error(error.message);
}

export async function deleteChefProductionTask(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('chef_production_tasks').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchChefProductionRuns(supabase: SupabaseClient, localId: string, limit = 40) {
  const { data, error } = await supabase
    .from('chef_production_runs')
    .select('id,local_id,plan_id,period_start,period_label,started_at,completed_at,created_by')
    .eq('local_id', localId)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    localId: String(r.local_id),
    planId: String(r.plan_id),
    periodStart: String(r.period_start),
    periodLabel: r.period_label != null ? String(r.period_label) : null,
    startedAt: String(r.started_at),
    completedAt: r.completed_at != null ? String(r.completed_at) : null,
    createdBy: r.created_by != null ? String(r.created_by) : null,
  })) as ChefProductionRun[];
}

async function collectAllTasksForPlan(
  supabase: SupabaseClient,
  planId: string,
): Promise<ChefProductionTask[]> {
  const sections = await fetchChefProductionSections(supabase, planId);
  const out: ChefProductionTask[] = [];
  for (const s of sections) {
    const tasks = await fetchChefProductionTasks(supabase, s.id);
    out.push(...tasks);
  }
  return out;
}

export async function startChefProductionRun(
  supabase: SupabaseClient,
  localId: string,
  planId: string,
  periodStart: string,
  periodLabel: string | null,
  userId: string | null,
): Promise<{ run: ChefProductionRun; tasks: ChefProductionTask[] }> {
  const tasks = await collectAllTasksForPlan(supabase, planId);
  if (tasks.length === 0)
    throw new Error('Esta lista no tiene artículos. Añade categorías y artículos en Artículos y stocks antes de abrir el día.');

  const { data: runRow, error: runErr } = await supabase
    .from('chef_production_runs')
    .insert({
      local_id: localId,
      plan_id: planId,
      period_start: periodStart,
      period_label: periodLabel?.trim() || null,
      created_by: userId,
    })
    .select('id,local_id,plan_id,period_start,period_label,started_at,completed_at,created_by')
    .single();
  if (runErr) throw new Error(runErr.message);

  const run = {
    id: String(runRow.id),
    localId: String(runRow.local_id),
    planId: String(runRow.plan_id),
    periodStart: String(runRow.period_start),
    periodLabel: runRow.period_label != null ? String(runRow.period_label) : null,
    startedAt: String(runRow.started_at),
    completedAt: runRow.completed_at != null ? String(runRow.completed_at) : null,
    createdBy: runRow.created_by != null ? String(runRow.created_by) : null,
  } as ChefProductionRun;

  const rows = tasks.map((t) => ({ run_id: run.id, task_id: t.id, is_done: false }));
  const { error: insErr } = await supabase.from('chef_production_run_tasks').insert(rows);
  if (insErr) throw new Error(insErr.message);

  return { run, tasks };
}

export async function fetchChefProductionRunTasks(
  supabase: SupabaseClient,
  runId: string,
): Promise<ChefProductionRunTask[]> {
  const { data, error } = await supabase
    .from('chef_production_run_tasks')
    .select('id,run_id,task_id,is_done,done_at,qty_note,qty_on_hand,qty_to_make')
    .eq('run_id', runId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    runId: String(r.run_id),
    taskId: String(r.task_id),
    isDone: Boolean(r.is_done),
    doneAt: r.done_at != null ? String(r.done_at) : null,
    qtyNote: r.qty_note != null ? String(r.qty_note) : null,
    qtyOnHand: r.qty_on_hand != null && r.qty_on_hand !== '' ? Number(r.qty_on_hand) : null,
    qtyToMake: r.qty_to_make != null && r.qty_to_make !== '' ? Number(r.qty_to_make) : null,
  }));
}

export async function setChefProductionRunTaskDone(
  supabase: SupabaseClient,
  runTaskId: string,
  isDone: boolean,
  qtyNote?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = {
    is_done: isDone,
    done_at: isDone ? new Date().toISOString() : null,
  };
  if (qtyNote !== undefined) patch.qty_note = qtyNote?.trim() || null;
  const { error } = await supabase.from('chef_production_run_tasks').update(patch).eq('id', runTaskId);
  if (error) throw new Error(error.message);
}

export async function updateChefProductionRunTaskQty(
  supabase: SupabaseClient,
  runTaskId: string,
  patch: { qtyOnHand?: number | null; qtyToMake?: number | null },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.qtyOnHand !== undefined) row.qty_on_hand = patch.qtyOnHand;
  if (patch.qtyToMake !== undefined) row.qty_to_make = patch.qtyToMake;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('chef_production_run_tasks').update(row).eq('id', runTaskId);
  if (error) throw new Error(error.message);
}

export async function completeChefProductionRun(supabase: SupabaseClient, runId: string): Promise<void> {
  const { error } = await supabase
    .from('chef_production_runs')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', runId);
  if (error) throw new Error(error.message);
}
