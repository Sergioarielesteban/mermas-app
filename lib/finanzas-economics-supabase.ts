import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  FixedExpense,
  FixedExpenseInsert,
  FixedExpenseUpdate,
  SalesDaily,
  SalesDailyInsert,
  SalesDailyUpdate,
  StaffCostsPeriod,
  StaffCostsPeriodInsert,
  StaffCostsPeriodUpdate,
  TaxEntry,
  TaxEntryInsert,
  TaxEntryUpdate,
} from '@/lib/finanzas-economics-types';

/** Máximo de días (inclusive) entre from y to en consultas por rango; evita lecturas descontroladas. */
export const FINANZAS_ECONOMICS_MAX_RANGE_DAYS = 400;

const SALES_DAILY_COLUMNS =
  'id,local_id,date,net_sales_eur,tax_collected_eur,tickets_count,avg_ticket_eur,notes,created_at,updated_at';

const STAFF_COLUMNS =
  'id,local_id,period_type,period_start,period_end,labor_hours,labor_cost_eur,ss_cost_eur,other_staff_cost_eur,total_staff_cost_eur,notes,created_at,updated_at';

const FIXED_COLUMNS =
  'id,local_id,name,category,amount_eur,frequency,active,period_start,period_end,notes,created_at,updated_at';

const TAX_COLUMNS = 'id,local_id,date,tax_type,amount_eur,notes,created_at';

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function utcDayStartMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function daysInclusive(fromYmd: string, toYmd: string): number {
  const a = utcDayStartMs(fromYmd);
  const b = utcDayStartMs(toYmd);
  return Math.floor((b - a) / 86400000) + 1;
}

/**
 * Valida YYYY-MM-DD, from <= to y tamaño del rango; usar antes de listados por fechas.
 */
export function assertFinanzasEconomicsDateRange(
  fromYmd: string,
  toYmd: string,
  maxDays: number = FINANZAS_ECONOMICS_MAX_RANGE_DAYS,
): void {
  if (!isYmd(fromYmd) || !isYmd(toYmd)) {
    throw new Error('Rango de fechas inválido: use YYYY-MM-DD.');
  }
  if (fromYmd > toYmd) {
    throw new Error('La fecha inicio no puede ser posterior a la fecha fin.');
  }
  if (daysInclusive(fromYmd, toYmd) > maxDays) {
    throw new Error(
      `El rango supera ${maxDays} días; acote el periodo para limitar datos transferidos.`,
    );
  }
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapSalesDaily(row: Record<string, unknown>): SalesDaily {
  return {
    id: String(row.id),
    localId: String(row.local_id),
    date: String(row.date),
    netSalesEur: numOrNull(row.net_sales_eur),
    taxCollectedEur: numOrNull(row.tax_collected_eur),
    ticketsCount: row.tickets_count == null ? null : Number(row.tickets_count),
    avgTicketEur: numOrNull(row.avg_ticket_eur),
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapStaff(row: Record<string, unknown>): StaffCostsPeriod {
  return {
    id: String(row.id),
    localId: String(row.local_id),
    periodType: row.period_type as StaffCostsPeriod['periodType'],
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    laborHours: numOrNull(row.labor_hours),
    laborCostEur: numOrNull(row.labor_cost_eur),
    ssCostEur: numOrNull(row.ss_cost_eur),
    otherStaffCostEur: numOrNull(row.other_staff_cost_eur),
    totalStaffCostEur: numOrNull(row.total_staff_cost_eur),
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapFixed(row: Record<string, unknown>): FixedExpense {
  return {
    id: String(row.id),
    localId: String(row.local_id),
    name: String(row.name),
    category: row.category as FixedExpense['category'],
    amountEur: Number(row.amount_eur),
    frequency: row.frequency as FixedExpense['frequency'],
    active: Boolean(row.active),
    periodStart: row.period_start == null ? null : String(row.period_start),
    periodEnd: row.period_end == null ? null : String(row.period_end),
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapTax(row: Record<string, unknown>): TaxEntry {
  return {
    id: String(row.id),
    localId: String(row.local_id),
    date: String(row.date),
    taxType: row.tax_type as TaxEntry['taxType'],
    amountEur: Number(row.amount_eur),
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at),
  };
}

function toSalesDailyRowInsert(i: SalesDailyInsert): Record<string, unknown> {
  return {
    local_id: i.localId,
    date: i.date,
    net_sales_eur: i.netSalesEur ?? null,
    tax_collected_eur: i.taxCollectedEur ?? null,
    tickets_count: i.ticketsCount ?? null,
    notes: i.notes ?? '',
  };
}

function toSalesDailyRowPatch(u: SalesDailyUpdate): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (u.date !== undefined) p.date = u.date;
  if (u.netSalesEur !== undefined) p.net_sales_eur = u.netSalesEur;
  if (u.taxCollectedEur !== undefined) p.tax_collected_eur = u.taxCollectedEur;
  if (u.ticketsCount !== undefined) p.tickets_count = u.ticketsCount;
  if (u.notes !== undefined) p.notes = u.notes;
  return p;
}

function toStaffInsert(i: StaffCostsPeriodInsert): Record<string, unknown> {
  return {
    local_id: i.localId,
    period_type: i.periodType,
    period_start: i.periodStart,
    period_end: i.periodEnd,
    labor_hours: i.laborHours ?? null,
    labor_cost_eur: i.laborCostEur ?? null,
    ss_cost_eur: i.ssCostEur ?? null,
    other_staff_cost_eur: i.otherStaffCostEur ?? null,
    notes: i.notes ?? '',
  };
}

function toStaffPatch(u: StaffCostsPeriodUpdate): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (u.periodType !== undefined) p.period_type = u.periodType;
  if (u.periodStart !== undefined) p.period_start = u.periodStart;
  if (u.periodEnd !== undefined) p.period_end = u.periodEnd;
  if (u.laborHours !== undefined) p.labor_hours = u.laborHours;
  if (u.laborCostEur !== undefined) p.labor_cost_eur = u.laborCostEur;
  if (u.ssCostEur !== undefined) p.ss_cost_eur = u.ssCostEur;
  if (u.otherStaffCostEur !== undefined) p.other_staff_cost_eur = u.otherStaffCostEur;
  if (u.notes !== undefined) p.notes = u.notes;
  return p;
}

function toFixedInsert(i: FixedExpenseInsert): Record<string, unknown> {
  return {
    local_id: i.localId,
    name: i.name,
    category: i.category,
    amount_eur: i.amountEur,
    frequency: i.frequency,
    active: i.active ?? true,
    period_start: i.periodStart ?? null,
    period_end: i.periodEnd ?? null,
    notes: i.notes ?? '',
  };
}

function toFixedPatch(u: FixedExpenseUpdate): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (u.name !== undefined) p.name = u.name;
  if (u.category !== undefined) p.category = u.category;
  if (u.amountEur !== undefined) p.amount_eur = u.amountEur;
  if (u.frequency !== undefined) p.frequency = u.frequency;
  if (u.active !== undefined) p.active = u.active;
  if (u.periodStart !== undefined) p.period_start = u.periodStart;
  if (u.periodEnd !== undefined) p.period_end = u.periodEnd;
  if (u.notes !== undefined) p.notes = u.notes;
  return p;
}

function toTaxInsert(i: TaxEntryInsert): Record<string, unknown> {
  return {
    local_id: i.localId,
    date: i.date,
    tax_type: i.taxType,
    amount_eur: i.amountEur,
    notes: i.notes ?? '',
  };
}

function toTaxPatch(u: TaxEntryUpdate): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (u.date !== undefined) p.date = u.date;
  if (u.taxType !== undefined) p.tax_type = u.taxType;
  if (u.amountEur !== undefined) p.amount_eur = u.amountEur;
  if (u.notes !== undefined) p.notes = u.notes;
  return p;
}

// --- sales_daily ---

export async function fetchSalesDailyInRange(
  client: SupabaseClient,
  localId: string,
  fromYmd: string,
  toYmd: string,
): Promise<SalesDaily[]> {
  assertFinanzasEconomicsDateRange(fromYmd, toYmd);
  const { data, error } = await client
    .from('sales_daily')
    .select(SALES_DAILY_COLUMNS)
    .eq('local_id', localId)
    .gte('date', fromYmd)
    .lte('date', toYmd)
    .order('date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapSalesDaily(r as Record<string, unknown>));
}

export async function getSalesDailyById(
  client: SupabaseClient,
  localId: string,
  id: string,
): Promise<SalesDaily | null> {
  const { data, error } = await client
    .from('sales_daily')
    .select(SALES_DAILY_COLUMNS)
    .eq('local_id', localId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSalesDaily(data as Record<string, unknown>) : null;
}

export async function getSalesDailyByDate(
  client: SupabaseClient,
  localId: string,
  dateYmd: string,
): Promise<SalesDaily | null> {
  if (!isYmd(dateYmd)) throw new Error('Fecha inválida: use YYYY-MM-DD.');
  const { data, error } = await client
    .from('sales_daily')
    .select(SALES_DAILY_COLUMNS)
    .eq('local_id', localId)
    .eq('date', dateYmd)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSalesDaily(data as Record<string, unknown>) : null;
}

export async function insertSalesDaily(
  client: SupabaseClient,
  row: SalesDailyInsert,
): Promise<SalesDaily> {
  const { data, error } = await client
    .from('sales_daily')
    .insert(toSalesDailyRowInsert(row))
    .select(SALES_DAILY_COLUMNS)
    .single();
  if (error) throw error;
  return mapSalesDaily(data as Record<string, unknown>);
}

export type SalesDailyUpsertRow = {
  dateYmd: string;
  netSalesEur: number | null;
  ticketsCount: number | null;
};

/** Inserta o actualiza por (local_id, date); no descarga filas de vuelta (menos egress). */
export async function upsertSalesDailyMany(
  client: SupabaseClient,
  localId: string,
  rows: SalesDailyUpsertRow[],
): Promise<void> {
  if (rows.length === 0) return;
  for (const r of rows) {
    if (!isYmd(r.dateYmd)) throw new Error(`Fecha inválida en importación: ${r.dateYmd}`);
  }
  const payloads = rows.map((r) => ({
    local_id: localId,
    date: r.dateYmd,
    net_sales_eur: r.netSalesEur,
    tax_collected_eur: null as number | null,
    tickets_count: r.ticketsCount,
    notes: '',
  }));
  const { error } = await client.from('sales_daily').upsert(payloads, { onConflict: 'local_id,date' });
  if (error) throw error;
}

export async function updateSalesDaily(
  client: SupabaseClient,
  localId: string,
  id: string,
  patch: SalesDailyUpdate,
): Promise<SalesDaily> {
  const { data, error } = await client
    .from('sales_daily')
    .update(toSalesDailyRowPatch(patch))
    .eq('local_id', localId)
    .eq('id', id)
    .select(SALES_DAILY_COLUMNS)
    .single();
  if (error) throw error;
  return mapSalesDaily(data as Record<string, unknown>);
}

export async function deleteSalesDaily(
  client: SupabaseClient,
  localId: string,
  id: string,
): Promise<void> {
  const { error } = await client.from('sales_daily').delete().eq('local_id', localId).eq('id', id);
  if (error) throw error;
}

// --- staff_costs_period ---

export async function fetchStaffCostsPeriodOverlappingRange(
  client: SupabaseClient,
  localId: string,
  fromYmd: string,
  toYmd: string,
): Promise<StaffCostsPeriod[]> {
  assertFinanzasEconomicsDateRange(fromYmd, toYmd);
  const { data, error } = await client
    .from('staff_costs_period')
    .select(STAFF_COLUMNS)
    .eq('local_id', localId)
    .lte('period_start', toYmd)
    .gte('period_end', fromYmd)
    .order('period_start', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapStaff(r as Record<string, unknown>));
}

export async function getStaffCostsPeriodById(
  client: SupabaseClient,
  localId: string,
  id: string,
): Promise<StaffCostsPeriod | null> {
  const { data, error } = await client
    .from('staff_costs_period')
    .select(STAFF_COLUMNS)
    .eq('local_id', localId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapStaff(data as Record<string, unknown>) : null;
}

export async function insertStaffCostsPeriod(
  client: SupabaseClient,
  row: StaffCostsPeriodInsert,
): Promise<StaffCostsPeriod> {
  const { data, error } = await client
    .from('staff_costs_period')
    .insert(toStaffInsert(row))
    .select(STAFF_COLUMNS)
    .single();
  if (error) throw error;
  return mapStaff(data as Record<string, unknown>);
}

export async function updateStaffCostsPeriod(
  client: SupabaseClient,
  localId: string,
  id: string,
  patch: StaffCostsPeriodUpdate,
): Promise<StaffCostsPeriod> {
  const { data, error } = await client
    .from('staff_costs_period')
    .update(toStaffPatch(patch))
    .eq('local_id', localId)
    .eq('id', id)
    .select(STAFF_COLUMNS)
    .single();
  if (error) throw error;
  return mapStaff(data as Record<string, unknown>);
}

export async function deleteStaffCostsPeriod(
  client: SupabaseClient,
  localId: string,
  id: string,
): Promise<void> {
  const { error } = await client
    .from('staff_costs_period')
    .delete()
    .eq('local_id', localId)
    .eq('id', id);
  if (error) throw error;
}

// --- fixed_expenses ---

const FIXED_LIST_CAP = 500;

export async function fetchFixedExpensesForLocal(
  client: SupabaseClient,
  localId: string,
  options?: { activeOnly?: boolean; limit?: number },
): Promise<FixedExpense[]> {
  const limit = Math.min(options?.limit ?? FIXED_LIST_CAP, FIXED_LIST_CAP);
  let q = client.from('fixed_expenses').select(FIXED_COLUMNS).eq('local_id', localId);
  if (options?.activeOnly !== false) {
    q = q.eq('active', true);
  }
  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => mapFixed(r as Record<string, unknown>));
}

/**
 * Gastos fijos relevantes para un rango: recurrentes activos + one_off cuya ventana corta [from,to].
 * Acotado por límite fijo para no descargar tablas enteras.
 */
export async function fetchFixedExpensesForRangeContext(
  client: SupabaseClient,
  localId: string,
  fromYmd: string,
  toYmd: string,
  options?: { limit?: number },
): Promise<FixedExpense[]> {
  assertFinanzasEconomicsDateRange(fromYmd, toYmd);
  const limit = Math.min(options?.limit ?? FIXED_LIST_CAP, FIXED_LIST_CAP);

  const recurring = client
    .from('fixed_expenses')
    .select(FIXED_COLUMNS)
    .eq('local_id', localId)
    .eq('active', true)
    .neq('frequency', 'one_off')
    .order('name', { ascending: true })
    .limit(limit);

  const oneOff = client
    .from('fixed_expenses')
    .select(FIXED_COLUMNS)
    .eq('local_id', localId)
    .eq('active', true)
    .eq('frequency', 'one_off')
    .lte('period_start', toYmd)
    .or(`period_end.is.null,period_end.gte.${fromYmd}`)
    .order('period_start', { ascending: true })
    .limit(limit);

  const [r1, r2] = await Promise.all([recurring, oneOff]);
  if (r1.error) throw r1.error;
  if (r2.error) throw r2.error;

  const byId = new Map<string, FixedExpense>();
  for (const row of [...(r1.data ?? []), ...(r2.data ?? [])]) {
    const m = mapFixed(row as Record<string, unknown>);
    byId.set(m.id, m);
  }
  return [...byId.values()].slice(0, limit);
}

export async function getFixedExpenseById(
  client: SupabaseClient,
  localId: string,
  id: string,
): Promise<FixedExpense | null> {
  const { data, error } = await client
    .from('fixed_expenses')
    .select(FIXED_COLUMNS)
    .eq('local_id', localId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapFixed(data as Record<string, unknown>) : null;
}

export async function insertFixedExpense(
  client: SupabaseClient,
  row: FixedExpenseInsert,
): Promise<FixedExpense> {
  const { data, error } = await client
    .from('fixed_expenses')
    .insert(toFixedInsert(row))
    .select(FIXED_COLUMNS)
    .single();
  if (error) throw error;
  return mapFixed(data as Record<string, unknown>);
}

export async function updateFixedExpense(
  client: SupabaseClient,
  localId: string,
  id: string,
  patch: FixedExpenseUpdate,
): Promise<FixedExpense> {
  const { data, error } = await client
    .from('fixed_expenses')
    .update(toFixedPatch(patch))
    .eq('local_id', localId)
    .eq('id', id)
    .select(FIXED_COLUMNS)
    .single();
  if (error) throw error;
  return mapFixed(data as Record<string, unknown>);
}

export async function deleteFixedExpense(
  client: SupabaseClient,
  localId: string,
  id: string,
): Promise<void> {
  const { error } = await client.from('fixed_expenses').delete().eq('local_id', localId).eq('id', id);
  if (error) throw error;
}

// --- tax_entries ---

export async function fetchTaxEntriesInRange(
  client: SupabaseClient,
  localId: string,
  fromYmd: string,
  toYmd: string,
): Promise<TaxEntry[]> {
  assertFinanzasEconomicsDateRange(fromYmd, toYmd);
  const { data, error } = await client
    .from('tax_entries')
    .select(TAX_COLUMNS)
    .eq('local_id', localId)
    .gte('date', fromYmd)
    .lte('date', toYmd)
    .order('date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapTax(r as Record<string, unknown>));
}

export async function getTaxEntryById(
  client: SupabaseClient,
  localId: string,
  id: string,
): Promise<TaxEntry | null> {
  const { data, error } = await client
    .from('tax_entries')
    .select(TAX_COLUMNS)
    .eq('local_id', localId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapTax(data as Record<string, unknown>) : null;
}

export async function insertTaxEntry(client: SupabaseClient, row: TaxEntryInsert): Promise<TaxEntry> {
  const { data, error } = await client
    .from('tax_entries')
    .insert(toTaxInsert(row))
    .select(TAX_COLUMNS)
    .single();
  if (error) throw error;
  return mapTax(data as Record<string, unknown>);
}

export async function updateTaxEntry(
  client: SupabaseClient,
  localId: string,
  id: string,
  patch: TaxEntryUpdate,
): Promise<TaxEntry> {
  const { data, error } = await client
    .from('tax_entries')
    .update(toTaxPatch(patch))
    .eq('local_id', localId)
    .eq('id', id)
    .select(TAX_COLUMNS)
    .single();
  if (error) throw error;
  return mapTax(data as Record<string, unknown>);
}

export async function deleteTaxEntry(
  client: SupabaseClient,
  localId: string,
  id: string,
): Promise<void> {
  const { error } = await client.from('tax_entries').delete().eq('local_id', localId).eq('id', id);
  if (error) throw error;
}
