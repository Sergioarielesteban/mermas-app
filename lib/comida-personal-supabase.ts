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
  createdAt: string;
  createdBy: string | null;
  voidedAt: string | null;
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
  created_at: string;
  created_by: string | null;
  voided_at: string | null;
};

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
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
    voidedAt: row.voided_at ?? null,
  };
}

export async function fetchStaffMealRecords(
  supabase: SupabaseClient,
  localId: string,
  fromDateYmd: string,
  toDateYmd: string,
): Promise<StaffMealRecord[]> {
  const { data, error } = await supabase
    .from('staff_meal_records')
    .select('id,local_id,service,meal_date,people_count,unit_cost_eur,total_cost_eur,notes,created_at,created_by,voided_at')
    .eq('local_id', localId)
    .gte('meal_date', fromDateYmd)
    .lte('meal_date', toDateYmd)
    .order('meal_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as StaffMealRow[]).map(mapStaffMealRow);
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
  },
): Promise<StaffMealRecord> {
  const peopleCount = Math.max(0, Math.round(input.peopleCount * 100) / 100);
  const unitCostEur = normalizeMoney(input.unitCostEur);
  const totalCostEur = computeStaffMealTotal(peopleCount, unitCostEur);

  const { data, error } = await supabase
    .from('staff_meal_records')
    .insert({
      local_id: localId,
      service: input.service,
      meal_date: input.mealDate,
      people_count: peopleCount,
      unit_cost_eur: unitCostEur,
      total_cost_eur: totalCostEur,
      notes: (input.notes ?? '').trim(),
    })
    .select('id,local_id,service,meal_date,people_count,unit_cost_eur,total_cost_eur,notes,created_at,created_by,voided_at')
    .single();
  if (error) throw new Error(error.message);
  return mapStaffMealRow(data as StaffMealRow);
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
