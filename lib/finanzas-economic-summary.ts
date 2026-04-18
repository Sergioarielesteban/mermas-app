/**
 * Finanzas — Fase 3: cuenta de resultados simplificada a partir de los agregadores (fase 2).
 * No resta IVA en resultados operativos; bloque IVA solo informativo.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TaxEntryType } from '@/lib/finanzas-economics-types';
import { assertFinanzasEconomicsDateRange } from '@/lib/finanzas-economics-supabase';
import {
  getComidaPersonalCostByDateRange,
  getFinanzasFixedExpensesAggregateByRange,
  getFinanzasMermasCostAggregateByRange,
  getFinanzasStaffCostsPeriodAggregateByRange,
  getFinanzasTaxEntriesAggregateByRange,
  getFinanzasValidatedDeliveryNotesAggregateByRange,
  getFinanzasVentasAggregateByRange,
} from '@/lib/finanzas-range-aggregates';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysInclusive(fromYmd: string, toYmd: string): number {
  const [yf, mf, df] = fromYmd.split('-').map(Number);
  const [yt, mt, dt] = toYmd.split('-').map(Number);
  const a = Date.UTC(yf, mf - 1, df);
  const b = Date.UTC(yt, mt - 1, dt);
  return Math.floor((b - a) / 86400000) + 1;
}

/** Periodo previo inmediato con el mismo número de días (inclusive): [from−L, from−1]. */
function previousPeriodSameLength(fromYmd: string, toYmd: string): { from: string; to: string } {
  const L = daysInclusive(fromYmd, toYmd);
  const [y, m, d] = fromYmd.split('-').map(Number);
  const fromMs = Date.UTC(y, m - 1, d);
  const prevToMs = fromMs - 86400000;
  const prevFromMs = fromMs - L * 86400000;
  const fmt = (ms: number) => {
    const dt = new Date(ms);
    const yr = dt.getUTCFullYear();
    const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const da = String(dt.getUTCDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  };
  return { from: fmt(prevFromMs), to: fmt(prevToMs) };
}

function taxAmountByType(
  byTaxType: Array<{ taxType: TaxEntryType; amountEur: number }>,
  type: TaxEntryType,
): number {
  const row = byTaxType.find((x) => x.taxType === type);
  return row ? row.amountEur : 0;
}

function ratioOrNull(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return round2(numerator / denominator);
}

export type FinanzasComparativaMetrica = {
  anterior_eur: number;
  actual_eur: number;
  delta_abs_eur: number;
  /** Porcentaje respecto al periodo anterior; `null` si no es definido (p. ej. anterior = 0). */
  delta_pct: number | null;
};

export type FinanzasEconomicSummary = {
  period: { from: string; to: string; days: number };
  ingresos: {
    ventas_c: number;
  };
  costes_operativos: {
    compras_c: number;
    mermas_c: number;
    comida_personal_c: number;
    coste_personal_c: number;
  };
  gastos_fijos: {
    gastos_fijos_c: number;
    detalle: {
      one_off_en_ventana_eur: number;
      recurrentes_nominales_eur: number;
      nota_recurrentes: string;
    };
  };
  impuestos: {
    iva_repercutido_eur: number;
    iva_soportado_eur: number;
    saldo_iva_eur: number;
    impuesto_sociedades_eur: number;
    /** IVA de ventas y compras proviene de agregadores; asientos manuales suman en repercutido/soportado. */
    nota: string;
  };
  resultados: {
    resultado_operativo: number;
    resultado_antes_impuestos: number;
    beneficio_neto_estimado: number;
  };
  ratios: {
    compras_sobre_ventas: number | null;
    mermas_sobre_compras: number | null;
    comida_personal_sobre_ventas: number | null;
    coste_personal_sobre_ventas: number | null;
    gastos_fijos_sobre_ventas: number | null;
    beneficio_neto_sobre_ventas: number | null;
  };
  comparativa: {
    periodo_anterior: { from: string; to: string; days: number };
    ventas_c: FinanzasComparativaMetrica;
    compras_c: FinanzasComparativaMetrica;
    mermas_c: FinanzasComparativaMetrica;
    comida_personal_c: FinanzasComparativaMetrica;
    coste_personal_c: FinanzasComparativaMetrica;
    gastos_fijos_c: FinanzasComparativaMetrica;
    resultado_operativo: FinanzasComparativaMetrica;
    resultado_antes_impuestos: FinanzasComparativaMetrica;
    beneficio_neto_estimado: FinanzasComparativaMetrica;
  };
};

type Bundle = {
  sales: Awaited<ReturnType<typeof getFinanzasVentasAggregateByRange>>;
  deliveryNotes: Awaited<ReturnType<typeof getFinanzasValidatedDeliveryNotesAggregateByRange>>;
  mermas: Awaited<ReturnType<typeof getFinanzasMermasCostAggregateByRange>>;
  staffMeal: Awaited<ReturnType<typeof getComidaPersonalCostByDateRange>>;
  staffCosts: Awaited<ReturnType<typeof getFinanzasStaffCostsPeriodAggregateByRange>>;
  fixed: Awaited<ReturnType<typeof getFinanzasFixedExpensesAggregateByRange>>;
  tax: Awaited<ReturnType<typeof getFinanzasTaxEntriesAggregateByRange>>;
};

async function fetchAggregatesBundle(
  client: SupabaseClient,
  localId: string,
  fromYmd: string,
  toYmd: string,
): Promise<Bundle> {
  const [
    sales,
    deliveryNotes,
    mermas,
    staffMeal,
    staffCosts,
    fixed,
    tax,
  ] = await Promise.all([
    getFinanzasVentasAggregateByRange(client, localId, fromYmd, toYmd),
    getFinanzasValidatedDeliveryNotesAggregateByRange(client, localId, fromYmd, toYmd),
    getFinanzasMermasCostAggregateByRange(client, localId, fromYmd, toYmd),
    getComidaPersonalCostByDateRange(client, localId, fromYmd, toYmd),
    getFinanzasStaffCostsPeriodAggregateByRange(client, localId, fromYmd, toYmd),
    getFinanzasFixedExpensesAggregateByRange(client, localId, fromYmd, toYmd),
    getFinanzasTaxEntriesAggregateByRange(client, localId, fromYmd, toYmd),
  ]);
  return { sales, deliveryNotes, mermas, staffMeal, staffCosts, fixed, tax };
}

function buildCoreFromBundle(b: Bundle): {
  ventasC: number;
  comprasC: number;
  mermasC: number;
  comidaPersonalC: number;
  costePersonalC: number;
  gastosFijosC: number;
  ivaRepercutido: number;
  ivaSoportado: number;
  impuestoSociedades: number;
} {
  const ventasC = round2(b.sales.totalNetSalesEur);
  const comprasC = round2(b.deliveryNotes.totalNetEur);
  const mermasC = round2(b.mermas.totalCostEur);
  const comidaPersonalC = round2(b.staffMeal.totalCostEur);
  const costePersonalC = round2(b.staffCosts.totalStaffCostEur);
  const gastosFijosC = round2(b.fixed.oneOffInRangeEur + b.fixed.recurringNominalEur);

  const ivaRepercutido = round2(
    b.sales.totalTaxCollectedEur + taxAmountByType(b.tax.byTaxType, 'iva_repercutido'),
  );
  const ivaSoportado = round2(
    b.deliveryNotes.totalTaxEur + taxAmountByType(b.tax.byTaxType, 'iva_soportado'),
  );
  const impuestoSociedades = round2(taxAmountByType(b.tax.byTaxType, 'impuesto_sociedades'));

  return {
    ventasC,
    comprasC,
    mermasC,
    comidaPersonalC,
    costePersonalC,
    gastosFijosC,
    ivaRepercutido,
    ivaSoportado,
    impuestoSociedades,
  };
}

function comparativaMetrica(anterior: number, actual: number): FinanzasComparativaMetrica {
  const a = round2(anterior);
  const c = round2(actual);
  const deltaAbs = round2(c - a);
  let deltaPct: number | null = null;
  if (a !== 0 && Number.isFinite(a)) {
    deltaPct = round2(((c - a) / a) * 100);
  }
  return {
    anterior_eur: a,
    actual_eur: c,
    delta_abs_eur: deltaAbs,
    delta_pct: deltaPct,
  };
}

/**
 * Cuenta de resultados (lógica) para un local y rango. Usa las siete RPC de fase 2 vía `finanzas-range-aggregates`.
 *
 * - **Ventas_C:** neto `sales_daily` (`total_net_sales_eur`).
 * - **Compras_C:** neto albaranes validados (`total_net_eur`).
 * - **Mermas_C:** `total_cost_eur` mermas.
 * - **ComidaPersonal_C:** `finanzas_agg_staff_meal` total.
 * - **CostePersonal_C:** `staff_costs_period` solapando el rango.
 * - **GastosFijos_C:** one-off en ventana + recurrentes nominales (sin prorrateo; ver `gastos_fijos.detalle`).
 * - **Resultado operativo:** Ventas − Compras − Mermas − Comida − CostePersonal (sin IVA).
 * - **Resultado antes impuestos:** Resultado operativo − GastosFijos.
 * - **Beneficio neto estimado:** Resultado antes impuestos − Impuesto sociedades (solo `tax_entries` tipo `impuesto_sociedades`).
 * - **IVA informativo:** repercutido = IVA cobrado en ventas + asientos `iva_repercutido`; soportado = IVA albaranes + `iva_soportado`; saldo = repercutido − soportado.
 */
export async function getFinanzasEconomicSummary(
  client: SupabaseClient,
  localId: string,
  fromYmd: string,
  toYmd: string,
): Promise<FinanzasEconomicSummary> {
  assertFinanzasEconomicsDateRange(fromYmd, toYmd);
  const days = daysInclusive(fromYmd, toYmd);
  const prev = previousPeriodSameLength(fromYmd, toYmd);
  assertFinanzasEconomicsDateRange(prev.from, prev.to);

  const [current, prevBundle] = await Promise.all([
    fetchAggregatesBundle(client, localId, fromYmd, toYmd),
    fetchAggregatesBundle(client, localId, prev.from, prev.to),
  ]);

  const cur = buildCoreFromBundle(current);
  const pre = buildCoreFromBundle(prevBundle);

  const resultadoOperativo = round2(
    cur.ventasC -
      cur.comprasC -
      cur.mermasC -
      cur.comidaPersonalC -
      cur.costePersonalC,
  );
  const resultadoAntesImpuestos = round2(resultadoOperativo - cur.gastosFijosC);
  const beneficioNetoEstimado = round2(resultadoAntesImpuestos - cur.impuestoSociedades);

  const resultadoOperativoPrev = round2(
    pre.ventasC -
      pre.comprasC -
      pre.mermasC -
      pre.comidaPersonalC -
      pre.costePersonalC,
  );
  const resultadoAntesImpuestosPrev = round2(resultadoOperativoPrev - pre.gastosFijosC);
  const beneficioNetoPrev = round2(resultadoAntesImpuestosPrev - pre.impuestoSociedades);

  const ventas = cur.ventasC;

  return {
    period: { from: fromYmd, to: toYmd, days },
    ingresos: {
      ventas_c: cur.ventasC,
    },
    costes_operativos: {
      compras_c: cur.comprasC,
      mermas_c: cur.mermasC,
      comida_personal_c: cur.comidaPersonalC,
      coste_personal_c: cur.costePersonalC,
    },
    gastos_fijos: {
      gastos_fijos_c: cur.gastosFijosC,
      detalle: {
        one_off_en_ventana_eur: round2(current.fixed.oneOffInRangeEur),
        recurrentes_nominales_eur: round2(current.fixed.recurringNominalEur),
        nota_recurrentes: current.fixed.note,
      },
    },
    impuestos: {
      iva_repercutido_eur: cur.ivaRepercutido,
      iva_soportado_eur: cur.ivaSoportado,
      saldo_iva_eur: round2(cur.ivaRepercutido - cur.ivaSoportado),
      impuesto_sociedades_eur: cur.impuestoSociedades,
      nota: 'IVA no forma parte del resultado operativo; solo informativo. Saldo = repercutido − soportado.',
    },
    resultados: {
      resultado_operativo: resultadoOperativo,
      resultado_antes_impuestos: resultadoAntesImpuestos,
      beneficio_neto_estimado: beneficioNetoEstimado,
    },
    ratios: {
      compras_sobre_ventas: ratioOrNull(cur.comprasC, ventas),
      mermas_sobre_compras: ratioOrNull(cur.mermasC, cur.comprasC),
      comida_personal_sobre_ventas: ratioOrNull(cur.comidaPersonalC, ventas),
      coste_personal_sobre_ventas: ratioOrNull(cur.costePersonalC, ventas),
      gastos_fijos_sobre_ventas: ratioOrNull(cur.gastosFijosC, ventas),
      beneficio_neto_sobre_ventas: ratioOrNull(beneficioNetoEstimado, ventas),
    },
    comparativa: {
      periodo_anterior: { ...prev, days },
      ventas_c: comparativaMetrica(pre.ventasC, cur.ventasC),
      compras_c: comparativaMetrica(pre.comprasC, cur.comprasC),
      mermas_c: comparativaMetrica(pre.mermasC, cur.mermasC),
      comida_personal_c: comparativaMetrica(pre.comidaPersonalC, cur.comidaPersonalC),
      coste_personal_c: comparativaMetrica(pre.costePersonalC, cur.costePersonalC),
      gastos_fijos_c: comparativaMetrica(pre.gastosFijosC, cur.gastosFijosC),
      resultado_operativo: comparativaMetrica(resultadoOperativoPrev, resultadoOperativo),
      resultado_antes_impuestos: comparativaMetrica(resultadoAntesImpuestosPrev, resultadoAntesImpuestos),
      beneficio_neto_estimado: comparativaMetrica(beneficioNetoPrev, beneficioNetoEstimado),
    },
  };
}
