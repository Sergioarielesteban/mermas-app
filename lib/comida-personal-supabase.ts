import type { SupabaseClient } from '@supabase/supabase-js';

export type StaffMealService = 'desayuno' | 'comida' | 'cena' | 'snack' | 'otro';

export type StaffMealRecord = {
  id: string;
  localId: string;
  service: StaffMealService;
  mealDate: string;
  peopleCount: number;
  unitCostEur: number;
  totalCostEur: number;
  notes: string;
  workerId: string | null;
  workerName: string | null;
  sourceProductId: string | null;
  sourceProductName: string | null;
  createdAt: string;
  createdBy: string | null;
  voidedAt: string | null;
};

export type StaffMealWorker = {
  id: string;
  localId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
};

type StaffMealRow = {
  id: string;
  local_id: string;
  service: StaffMealService;
  meal_date: string;
  people_count: number;
  unit_cost_eur: number;
  total_cost_eur: number;
  notes: string | null;
  worker_id?: string | null;
  worker_name_snapshot?: string | null;
  source_product_id?: string | null;
  source_product_name?: string | null;
  created_at: string;
  created_by: string | null;
  voided_at: string | null;
};

type StaffMealWorkerRow = {
  id: string;
  local_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

function isMissingColumnError(message: string, column: string): boolean {
  const m = message.toLowerCase();
  return m.includes(column.toLowerCase()) && (m.includes('column') || m.includes('schema cache'));
}

function isMissingWorkersTableError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('staff_meal_workers') && (m.includes('does not exist') || m.includes('not found') || m.includes('schema cache'));
}

export function normalizeMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function computeStaffMealTotal(peopleCount: number, unitCostEur: number): number {
  return normalizeMoney(Math.max(0, peopleCount) * Math.max(0, unitCostEur));
}

function mapStaffMealRow(row: StaffMealRow): StaffMealRecord {
  return {
    id: row.id,
    localId: row.local_id,
    service: row.service,
    mealDate: row.meal_date,
    peopleCount: Number(row.people_count ?? 0),
    unitCostEur: Number(row.unit_cost_eur ?? 0),
    totalCostEur: Number(row.total_cost_eur ?? 0),
    notes: row.notes ?? '',
    workerId: row.worker_id ?? null,
    workerName: row.worker_name_snapshot ?? null,
    sourceProductId: row.source_product_id ?? null,
    sourceProductName: row.source_product_name ?? null,
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
    voidedAt: row.voided_at ?? null,
  };
}

function mapWorkerRow(row: StaffMealWorkerRow): StaffMealWorker {
  return {
    id: row.id,
    localId: row.local_id,
    name: row.name,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  };
}

export async function fetchStaffMealWorkers(
  supabase: SupabaseClient,
  localId: string,
): Promise<StaffMealWorker[]> {
  const { data, error } = await supabase
    .from('staff_meal_workers')
    .select('id,local_id,name,is_active,created_at')
    .eq('local_id', localId)
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) {
    if (isMissingWorkersTableError(error.message)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as StaffMealWorkerRow[]).map(mapWorkerRow);
}

export async function createStaffMealWorker(
  supabase: SupabaseClient,
  localId: string,
  name: string,
): Promise<StaffMealWorker> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Nombre de trabajador vacío.');
  const { data, error } = await supabase
    .from('staff_meal_workers')
    .insert({ local_id: localId, name: trimmed, is_active: true })
    .select('id,local_id,name,is_active,created_at')
    .single();
  if (error) {
    if (isMissingWorkersTableError(error.message)) {
      throw new Error('Falta migración de staff_meal_workers en Supabase.');
    }
    throw new Error(error.message);
  }
  return mapWorkerRow(data as StaffMealWorkerRow);
}

export async function fetchStaffMealRecords(
  supabase: SupabaseClient,
  localId: string,
  fromDateYmd: string,
  toDateYmd: string,
): Promise<StaffMealRecord[]> {
  const extendedSelect =
    'id,local_id,service,meal_date,people_count,unit_cost_eur,total_cost_eur,notes,worker_id,worker_name_snapshot,source_product_id,source_product_name,created_at,created_by,voided_at';
  const baseSelect =
    'id,local_id,service,meal_date,people_count,unit_cost_eur,total_cost_eur,notes,created_at,created_by,voided_at';
  const first = await supabase
    .from('staff_meal_records')
    .select(extendedSelect)
    .eq('local_id', localId)
    .gte('meal_date', fromDateYmd)
    .lte('meal_date', toDateYmd)
    .order('meal_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (first.error) {
    const missingExtended =
      isMissingColumnError(first.error.message, 'worker_id') ||
      isMissingColumnError(first.error.message, 'worker_name_snapshot') ||
      isMissingColumnError(first.error.message, 'source_product_id') ||
      isMissingColumnError(first.error.message, 'source_product_name');
    if (!missingExtended) throw new Error(first.error.message);
    const fallback = await supabase
      .from('staff_meal_records')
      .select(baseSelect)
      .eq('local_id', localId)
      .gte('meal_date', fromDateYmd)
      .lte('meal_date', toDateYmd)
      .order('meal_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (fallback.error) throw new Error(fallback.error.message);
    return ((fallback.data ?? []) as StaffMealRow[]).map(mapStaffMealRow);
  }
  return ((first.data ?? []) as StaffMealRow[]).map(mapStaffMealRow);
}

export async function createStaffMealRecord(
  supabase: SupabaseClient,
  localId: string,
  input: {
    service: StaffMealService;
    mealDate: string;
    peopleCount: number;
    unitCostEur: number;
    notes?: string;
    workerId?: string | null;
    workerName?: string | null;
    sourceProductId?: string | null;
    sourceProductName?: string | null;
  },
): Promise<StaffMealRecord> {
  const peopleCount = Math.max(0, Math.round(input.peopleCount * 100) / 100);
  const unitCostEur = normalizeMoney(input.unitCostEur);
  const totalCostEur = computeStaffMealTotal(peopleCount, unitCostEur);

  const extendedSelect =
    'id,local_id,service,meal_date,people_count,unit_cost_eur,total_cost_eur,notes,worker_id,worker_name_snapshot,source_product_id,source_product_name,created_at,created_by,voided_at';
  const baseSelect =
    'id,local_id,service,meal_date,people_count,unit_cost_eur,total_cost_eur,notes,created_at,created_by,voided_at';

  const first = await supabase
    .from('staff_meal_records')
    .insert({
      local_id: localId,
      service: input.service,
      meal_date: input.mealDate,
      people_count: peopleCount,
      unit_cost_eur: unitCostEur,
      total_cost_eur: totalCostEur,
      notes: (input.notes ?? '').trim(),
      worker_id: input.workerId ?? null,
      worker_name_snapshot: input.workerName ?? null,
      source_product_id: input.sourceProductId ?? null,
      source_product_name: input.sourceProductName ?? null,
    })
    .select(extendedSelect)
    .single();
  if (first.error) {
    const missingExtended =
      isMissingColumnError(first.error.message, 'worker_id') ||
      isMissingColumnError(first.error.message, 'worker_name_snapshot') ||
      isMissingColumnError(first.error.message, 'source_product_id') ||
      isMissingColumnError(first.error.message, 'source_product_name');
    if (!missingExtended) throw new Error(first.error.message);
    const fallbackNotes = (input.notes ?? '').trim();
    const composedNotes =
      input.workerName || input.sourceProductName
        ? [input.workerName ? `Trabajador: ${input.workerName}` : '', input.sourceProductName ? `Artículo: ${input.sourceProductName}` : '', fallbackNotes]
            .filter(Boolean)
            .join(' · ')
        : fallbackNotes;
    const fallback = await supabase
      .from('staff_meal_records')
      .insert({
        local_id: localId,
        service: input.service,
        meal_date: input.mealDate,
        people_count: peopleCount,
        unit_cost_eur: unitCostEur,
        total_cost_eur: totalCostEur,
        notes: composedNotes,
      })
      .select(baseSelect)
      .single();
    if (fallback.error) throw new Error(fallback.error.message);
    return mapStaffMealRow(fallback.data as StaffMealRow);
  }
  return mapStaffMealRow(first.data as StaffMealRow);
}

export async function voidStaffMealRecord(
  supabase: SupabaseClient,
  localId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from('staff_meal_records')
    .update({ voided_at: new Date().toISOString() })
    .eq('id', id)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}
