/**
 * Finanzas — Fase 2: agregados por `local_id` y rango de fechas (egress mínimo vía RPC).
 *
 * ## Auditoría — Comida de personal (implementación actual)
 * - **Tabla:** `public.staff_meal_records` (ver `supabase-comida-personal-migration-phase-1.sql` y migraciones workers/grupos).
 * - **local_id:** columna `local_id` → `public.locals`, RLS con `current_local_id()`.
 * - **Fecha:** `meal_date` (date) — día del consumo.
 * - **Coste:** columna `total_cost_eur` (not null, ≥ 0); coherente con `people_count * unit_cost_eur` al insertar.
 *   Varios artículos del mismo consumo comparten `consumption_group_id`; cada línea tiene su coste (la suma de líneas es el coste del consumo).
 * - **Anulados:** `voided_at` timestamptz; los agregados **excluyen** filas con `voided_at` no nulo.
 * - **Relaciones:** `worker_id` → `staff_meal_workers`, `source_product_id` opcional; no necesarias para agregación monetaria.
 *
 * Requiere ejecutar en Supabase: `supabase-finanzas-phase2-aggregates.sql`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { assertFinanzasEconomicsDateRange } from '@/lib/finanzas-economics-supabase';
import type { TaxEntryType } from '@/lib/finanzas-economics-types';

export type FinanzasDailyAmountPoint = {
  date: string;
  amountEur: number;
};

export type ComidaPersonalCostByDateRangeResult = {
  totalCostEur: number;
  byDate: FinanzasDailyAmountPoint[];
};

export type FinanzasSalesAggregateByRange = {
  totalNetSalesEur: number;
  totalTaxCollectedEur: number;
  totalTicketsCount: number;
  byDate: Array<{
    date: string;
    netSalesEur: number;
    taxCollectedEur: number;
    ticketsCount: number;
  }>;
};

export type FinanzasValidatedDeliveryNotesAggregateByRange = {
  totalNetEur: number;
  totalTaxEur: number;
  totalGrossEur: number;
  validatedNoteCount: number;
  byDate: Array<{
    date: string;
    netEur: number;
    taxEur: number;
    grossEur: number;
    noteCount: number;
  }>;
};

export type FinanzasMermasCostAggregateByRange = {
  totalCostEur: number;
  byDate: FinanzasDailyAmountPoint[];
};

export type FinanzasStaffCostsPeriodAggregateByRange = {
  totalStaffCostEur: number;
  overlappingPeriodCount: number;
  periods: Array<{
    id: string;
    periodType: string;
    periodStart: string;
    periodEnd: string;
    totalStaffCostEur: number;
  }>;
};

export type FinanzasFixedExpensesAggregateByRange = {
  oneOffInRangeEur: number;
  recurringNominalEur: number;
  /** Texto fijo del RPC explicando el tratamiento del recurrente. */
  note: string;
};

export type FinanzasTaxEntriesAggregateByRange = {
  totalAmountEur: number;
  byTaxType: Array<{ taxType: TaxEntryType; amountEur: number }>;
  byDate: FinanzasDailyAmountPoint[];
};

function jsonMoney(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function jsonBigInt(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function parseDailyAmountRows(raw: unknown): FinanzasDailyAmountPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const o = asRecord(row);
    return {
      date: String(o.date ?? ''),
      amountEur: jsonMoney(o.amount_eur),
    };
  });
}

/**
 * Comida de personal: total y serie diaria (RPC `finanzas_agg_staff_meal`).
 * Excluye registros anulados (`voided_at`).
 */
export async function getComidaPersonalCostByDateRange(
  client: SupabaseClient,
  localId: string,
  fromYmd: string,
  toYmd: string,
): Promise<ComidaPersonalCostByDateRangeResult> {
  assertFinanzasEconomicsDateRange(fromYmd, toYmd);
  const { data, error } = await client.rpc('finanzas_agg_staff_meal', {
    p_local_id: localId,
    p_from: fromYmd,
    p_to: toYmd,
  });
  if (error) throw new Error(error.message);
  const j = asRecord(data);
  return {
    totalCostEur: jsonMoney(j.total_cost_eur),
    byDate: parseDailyAmountRows(j.by_date),
  };
}

/** Ventas declaradas (`sales_daily`). */
export async function getFinanzasVentasAggregateByRange(
  client: SupabaseClient,
  localId: string,
  fromYmd: string,
  toYmd: string,
): Promise<FinanzasSalesAggregateByRange> {
  assertFinanzasEconomicsDateRange(fromYmd, toYmd);
  const { data, error } = await client.rpc('finanzas_agg_sales_daily', {
    p_local_id: localId,
    p_from: fromYmd,
    p_to: toYmd,
  });
  if (error) throw new Error(error.message);
  const j = asRecord(data);
  const byRaw = Array.isArray(j.by_date) ? j.by_date : [];
  const byDate = byRaw.map((row) => {
    const o = asRecord(row);
    return {
      date: String(o.date ?? ''),
      netSalesEur: jsonMoney(o.net_sales_eur),
      taxCollectedEur: jsonMoney(o.tax_collected_eur),
      ticketsCount: jsonBigInt(o.tickets_count),
    };
  });
  return {
    totalNetSalesEur: jsonMoney(j.total_net_sales_eur),
    totalTaxCollectedEur: jsonMoney(j.total_tax_collected_eur),
    totalTicketsCount: jsonBigInt(j.total_tickets_count),
    byDate,
  };
}

/**
 * Compras reconocidas: albaranes con `status = 'validated'`, misma fecha de imputación que en `deliveryNoteImputationYmd`.
 */
export async function getFinanzasValidatedDeliveryNotesAggregateByRange(
  client: SupabaseClient,
  localId: string,
  fromYmd: string,
  toYmd: string,
): Promise<FinanzasValidatedDeliveryNotesAggregateByRange> {
  assertFinanzasEconomicsDateRange(fromYmd, toYmd);
  const { data, error } = await client.rpc('finanzas_agg_validated_delivery_notes', {
    p_local_id: localId,
    p_from: fromYmd,
    p_to: toYmd,
  });
  if (error) throw new Error(error.message);
  const j = asRecord(data);
  const byRaw = Array.isArray(j.by_date) ? j.by_date : [];
  const byDate = byRaw.map((row) => {
    const o = asRecord(row);
    return {
      date: String(o.date ?? ''),
      netEur: jsonMoney(o.net_eur),
      taxEur: jsonMoney(o.tax_eur),
      grossEur: jsonMoney(o.gross_eur),
      noteCount: jsonBigInt(o.note_count),
    };
  });
  return {
    totalNetEur: jsonMoney(j.total_net_eur),
    totalTaxEur: jsonMoney(j.total_tax_eur),
    totalGrossEur: jsonMoney(j.total_gross_eur),
    validatedNoteCount: jsonBigInt(j.validated_note_count),
    byDate,
  };
}

/** Mermas: `cost_eur` agrupado por día (UTC) de `occurred_at`. */
export async function getFinanzasMermasCostAggregateByRange(
  client: SupabaseClient,
  localId: string,
  fromYmd: string,
  toYmd: string,
): Promise<FinanzasMermasCostAggregateByRange> {
  assertFinanzasEconomicsDateRange(fromYmd, toYmd);
  const { data, error } = await client.rpc('finanzas_agg_mermas', {
    p_local_id: localId,
    p_from: fromYmd,
    p_to: toYmd,
  });
  if (error) throw new Error(error.message);
  const j = asRecord(data);
  return {
    totalCostEur: jsonMoney(j.total_cost_eur),
    byDate: parseDailyAmountRows(j.by_date),
  };
}

/**
 * Coste de personal (`staff_costs_period`): suma de periodos que solapan [from,to].
 * Cada fila aporta su `total_staff_cost_eur` completo (sin reparto proporcional por días).
 */
export async function getFinanzasStaffCostsPeriodAggregateByRange(
  client: SupabaseClient,
  localId: string,
  fromYmd: string,
  toYmd: string,
): Promise<FinanzasStaffCostsPeriodAggregateByRange> {
  assertFinanzasEconomicsDateRange(fromYmd, toYmd);
  const { data, error } = await client.rpc('finanzas_agg_staff_costs_period', {
    p_local_id: localId,
    p_from: fromYmd,
    p_to: toYmd,
  });
  if (error) throw new Error(error.message);
  const j = asRecord(data);
  const pRaw = Array.isArray(j.periods) ? j.periods : [];
  const periods = pRaw.map((row) => {
    const o = asRecord(row);
    return {
      id: String(o.id ?? ''),
      periodType: String(o.period_type ?? ''),
      periodStart: String(o.period_start ?? ''),
      periodEnd: String(o.period_end ?? ''),
      totalStaffCostEur: jsonMoney(o.total_staff_cost_eur),
    };
  });
  return {
    totalStaffCostEur: jsonMoney(j.total_staff_cost_eur),
    overlappingPeriodCount: jsonBigInt(j.overlapping_period_count),
    periods,
  };
}

/**
 * Gastos fijos: one-off que cortan el rango + suma de importes recurrentes activos (sin prorrateo temporal).
 */
export async function getFinanzasFixedExpensesAggregateByRange(
  client: SupabaseClient,
  localId: string,
  fromYmd: string,
  toYmd: string,
): Promise<FinanzasFixedExpensesAggregateByRange> {
  assertFinanzasEconomicsDateRange(fromYmd, toYmd);
  const { data, error } = await client.rpc('finanzas_agg_fixed_expenses', {
    p_local_id: localId,
    p_from: fromYmd,
    p_to: toYmd,
  });
  if (error) throw new Error(error.message);
  const j = asRecord(data);
  return {
    oneOffInRangeEur: jsonMoney(j.one_off_in_range_eur),
    recurringNominalEur: jsonMoney(j.recurring_nominal_eur),
    note: String(j.note ?? ''),
  };
}

/** Asientos fiscales manuales (`tax_entries`). */
export async function getFinanzasTaxEntriesAggregateByRange(
  client: SupabaseClient,
  localId: string,
  fromYmd: string,
  toYmd: string,
): Promise<FinanzasTaxEntriesAggregateByRange> {
  assertFinanzasEconomicsDateRange(fromYmd, toYmd);
  const { data, error } = await client.rpc('finanzas_agg_tax_entries', {
    p_local_id: localId,
    p_from: fromYmd,
    p_to: toYmd,
  });
  if (error) throw new Error(error.message);
  const j = asRecord(data);
  const tRaw = Array.isArray(j.by_tax_type) ? j.by_tax_type : [];
  const byTaxType = tRaw.map((row) => {
    const o = asRecord(row);
    return {
      taxType: String(o.tax_type ?? '') as TaxEntryType,
      amountEur: jsonMoney(o.amount_eur),
    };
  });
  return {
    totalAmountEur: jsonMoney(j.total_amount_eur),
    byTaxType,
    byDate: parseDailyAmountRows(j.by_date),
  };
}
