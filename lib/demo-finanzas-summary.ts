import type { FinanzasPeriodPreset } from '@/lib/finanzas-supabase';
import type { FinanzasEconomicSummary, FinanzasComparativaMetrica } from '@/lib/finanzas-economic-summary';
import type { FinanzasExecutiveRankings } from '@/lib/finanzas-supabase';
import type { FixedExpense } from '@/lib/finanzas-economics-types';
import { DEMO_LOCAL_ID } from '@/lib/demo-mode';

function daysInclusive(fromYmd: string, toYmd: string): number {
  const [yf, mf, df] = fromYmd.split('-').map(Number);
  const [yt, mt, dt] = toYmd.split('-').map(Number);
  const a = Date.UTC(yf!, mf! - 1, df!);
  const b = Date.UTC(yt!, mt! - 1, dt!);
  return Math.floor((b - a) / 86400000) + 1;
}

function addDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yr = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const da = String(dt.getUTCDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
}

function cmp(actual: number, prev: number): FinanzasComparativaMetrica {
  return {
    anterior_eur: Math.round(prev * 100) / 100,
    actual_eur: Math.round(actual * 100) / 100,
    delta_abs_eur: Math.round((actual - prev) * 100) / 100,
    delta_pct: prev !== 0 ? Math.round(((actual - prev) / prev) * 1000) / 10 : null,
  };
}

/** Resumen coherente con ratios tipo restaurante (ventas, compras ~40%, mermas ~5%, personal ~30%). */
export function buildDemoFinanzasEconomicSummary(
  fromYmd: string,
  toYmd: string,
  _preset: FinanzasPeriodPreset,
): FinanzasEconomicSummary {
  const days = Math.max(1, daysInclusive(fromYmd, toYmd));
  const baseDailyVentas = 2400 + ((fromYmd.length + toYmd.length) % 5) * 80;
  const ventasC = Math.round(baseDailyVentas * days * 100) / 100;
  const comprasC = Math.round(ventasC * 0.405 * 100) / 100;
  const mermasC = Math.round(ventasC * 0.052 * 100) / 100;
  const comidaPersonalC = Math.round(ventasC * 0.06 * 100) / 100;
  const costePersonalC = Math.round(ventasC * 0.295 * 100) / 100;
  const gastosFijosC = Math.round(ventasC * 0.115 * 100) / 100;

  const op =
    ventasC -
    comprasC -
    mermasC -
    comidaPersonalC -
    costePersonalC -
    gastosFijosC;
  const resultadoOperativo = Math.round(op * 100) / 100;
  const resultadoAntesImpuestos = Math.round((resultadoOperativo - 180) * 100) / 100;
  const beneficioNeto = Math.round((resultadoAntesImpuestos - 95) * 100) / 100;

  const prevFactor = 0.94;
  const vPrev = ventasC * prevFactor;
  const cPrev = comprasC * 0.96;
  const mPrev = mermasC * 0.9;
  const prevPeriodTo = addDaysYmd(fromYmd, -1);
  const prevPeriodFrom = addDaysYmd(fromYmd, -days);

  const by_day = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(`${fromYmd}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const da = String(d.getUTCDate()).padStart(2, '0');
    const date = `${y}-${mo}-${da}`;
    const jitter = 0.85 + ((i * 7) % 10) / 40;
    const v = Math.round(baseDailyVentas * jitter * 100) / 100;
    const c = Math.round(v * 0.42 * 100) / 100;
    const m = Math.round(v * 0.048 * 100) / 100;
    const cp = Math.round(v * 0.055 * 100) / 100;
    by_day.push({
      date,
      ventas_net: v,
      compras_net: c,
      mermas: m,
      comida_personal: cp,
      resultado_operativo_diario_aprox: Math.round((v - c - m - cp) * 100) / 100,
    });
  }

  return {
    period: { from: fromYmd, to: toYmd, days },
    ingresos: { ventas_c: ventasC },
    costes_operativos: {
      compras_c: comprasC,
      mermas_c: mermasC,
      comida_personal_c: comidaPersonalC,
      coste_personal_c: costePersonalC,
    },
    gastos_fijos: {
      gastos_fijos_c: gastosFijosC,
      detalle: {
        one_off_en_ventana_eur: 0,
        recurrentes_nominales_eur: gastosFijosC,
        nota_recurrentes: 'Demo: gastos recurrentes simulados.',
      },
    },
    impuestos: {
      iva_repercutido_eur: Math.round(ventasC * 0.1 * 100) / 100,
      iva_soportado_eur: Math.round(comprasC * 0.1 * 100) / 100,
      saldo_iva_eur: Math.round((ventasC - comprasC) * 0.02 * 100) / 100,
      impuesto_sociedades_eur: 0,
      nota: 'Demo: cifras orientativas.',
    },
    resultados: {
      resultado_operativo: resultadoOperativo,
      resultado_antes_impuestos: resultadoAntesImpuestos,
      beneficio_neto_estimado: beneficioNeto,
    },
    ratios: {
      compras_sobre_ventas: Math.round((comprasC / ventasC) * 10000) / 100,
      mermas_sobre_compras: comprasC > 0 ? Math.round((mermasC / comprasC) * 10000) / 100 : null,
      comida_personal_sobre_ventas: Math.round((comidaPersonalC / ventasC) * 10000) / 100,
      coste_personal_sobre_ventas: Math.round((costePersonalC / ventasC) * 10000) / 100,
      gastos_fijos_sobre_ventas: Math.round((gastosFijosC / ventasC) * 10000) / 100,
      beneficio_neto_sobre_ventas: Math.round((beneficioNeto / ventasC) * 10000) / 100,
    },
    comparativa: {
      periodo_anterior: { from: prevPeriodFrom, to: prevPeriodTo, days },
      ventas_c: cmp(ventasC, vPrev),
      compras_c: cmp(comprasC, cPrev),
      mermas_c: cmp(mermasC, mPrev),
      comida_personal_c: cmp(comidaPersonalC, comidaPersonalC * 0.92),
      coste_personal_c: cmp(costePersonalC, costePersonalC * 0.97),
      gastos_fijos_c: cmp(gastosFijosC, gastosFijosC * 0.99),
      resultado_operativo: cmp(resultadoOperativo, resultadoOperativo * 0.88),
      resultado_antes_impuestos: cmp(resultadoAntesImpuestos, resultadoAntesImpuestos * 0.87),
      beneficio_neto_estimado: cmp(beneficioNeto, beneficioNeto * 0.85),
    },
    viz: {
      by_day,
      coste_personal_diario_equiv: Math.round((costePersonalC / days) * 100) / 100,
    },
  };
}

export function buildDemoFinanzasRankings(): FinanzasExecutiveRankings {
  const spend = 8420.5;
  return {
    spendValidatedNet: spend,
    topSuppliers: [
      {
        supplierId: 'demo-sup-1',
        supplierName: 'Cárnicas del Vallès',
        net: 3120.4,
        count: 14,
        pctOfTotal: 37.1,
        deltaVsPrev: 4.2,
      },
      {
        supplierId: 'demo-sup-2',
        supplierName: 'Frutas García',
        net: 2280.0,
        count: 22,
        pctOfTotal: 27.1,
        deltaVsPrev: -2.1,
      },
      {
        supplierId: 'demo-sup-3',
        supplierName: 'Lácteos Costa',
        net: 1560.2,
        count: 11,
        pctOfTotal: 18.5,
        deltaVsPrev: 0.8,
      },
    ],
    topArticles: [
      { key: 'a1', label: 'PECHUGA POLLO KG', net: 890.2, lines: 8, mainSupplierName: 'Cárnicas del Vallès' },
      { key: 'a2', label: 'TOMATE PERA', net: 412.5, lines: 12, mainSupplierName: 'Frutas García' },
      { key: 'a3', label: 'ACEITE GIRASOL 5L', net: 380.0, lines: 6, mainSupplierName: 'Aceites Sol' },
    ],
    topMermas: [
      { key: 'm1', label: 'Hamburguesa smash', eur: 142.3, pctOfSpend: 1.7 },
      { key: 'm2', label: 'Patatas bravas', eur: 98.1, pctOfSpend: 1.2 },
    ],
    topPriceIncreases: [
      { label: 'BACON LONCHAS', supplierName: 'Cárnicas del Vallès', prevAvg: 8.2, last: 8.95, deltaPct: 9.1 },
    ],
    hasDeliveryNotesTable: true,
  };
}

export function buildDemoFixedExpensesForChart(): FixedExpense[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'demo-fx-1',
      localId: DEMO_LOCAL_ID,
      name: 'Alquiler local',
      category: 'rent',
      amountEur: 3200,
      frequency: 'monthly',
      active: true,
      periodStart: null,
      periodEnd: null,
      notes: '',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-fx-2',
      localId: DEMO_LOCAL_ID,
      name: 'Suministro luz',
      category: 'utilities',
      amountEur: 890,
      frequency: 'monthly',
      active: true,
      periodStart: null,
      periodEnd: null,
      notes: '',
      createdAt: now,
      updatedAt: now,
    },
  ];
}
