/**
 * Motor de pedido sugerido: hábitos reales + cobertura estimada (PAR / ciclo cuando hay fecha).
 * Sin IA externa. Precios = catálogo actual. Lenguaje prudente (no stock real, no garantías).
 */

import { coverageDaysUntilNextDelivery } from '@/lib/pedidos-coverage';
import { arithmeticMean, medianPositive, roundOrderQtyFromHistory } from '@/lib/pedidos-historial-stats';
import type { PedidoOrder, PedidoSupplierProduct } from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';

const MS_DAY = 86_400_000;

const WEEKDAY_LABEL: Record<number, string> = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
};
const JS_DAY_TO_CONSUMPTION_DAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

export const SUGGESTED_ORDER_WINDOWS_DAYS = [60, 90] as const;

export type SuggestedConfidence = 'alta' | 'media' | 'baja';

const MIN_ORDERS_IN_WINDOW = 2;
const MAX_SUGGESTED_LINES = 18;

export type SuggestedOrderLine = {
  supplierProductId: string;
  productName: string;
  unit: Unit;
  suggestedQty: number;
  unitPrice: number;
  vatRate: number;
  lineSubtotal: number;
  lineTotalWithVat: number;
  /** Texto corto motivo (p. ej. hábito día de la semana). */
  reason: string;
  score: number;
  /** Días orientativos que podría cubrir la cantidad sugerida (estimación, no inventario). */
  estimatedCoverageDays: number | null;
  /** Origen del cálculo de cobertura. */
  estimatedCoverageSource: 'par_semanal' | 'ritmo_pedidos';
  /** Frase lista para UI. */
  estimatedCoverageCaption: string;
  confidence: SuggestedConfidence;
};

export type SuggestedOrderResult =
  | {
      ok: true;
      windowDays: 60 | 90;
      supplierName: string;
      title: string;
      lines: SuggestedOrderLine[];
      estimatedTotalWithVat: number;
      orderCountInWindow: number;
      /** Rango global de días (min–max por línea) o null. */
      coverageGlobalRange: { min: number; max: number } | null;
      /** Ej. "3–4 días" o "≈4 días". */
      coverageGlobalLabel: string | null;
      globalConfidence: SuggestedConfidence;
      /** Si se usó fecha de entrega + ciclo para contexto de cobertura. */
      deliveryCoverageDays: number | null;
      prudentSubtitle: string;
      prudentDisclaimer: string;
    }
  | { ok: false; reason: 'insufficient_history' };

export type ComputeSuggestedOrderOptions = {
  now?: Date;
  /** Si hay fecha de entrega y ciclo del proveedor, enlaza con `pedidos-coverage`. */
  deliveryDateYmd?: string | null;
  deliveryCycleWeekdays?: number[];
  deliveryExceptionDates?: string[];
};

type LineAgg = {
  quantities: number[];
  orderTimes: number[];
  weekdays: number[];
};

function orderCommitTime(o: PedidoOrder): number {
  const raw = o.sentAt ?? o.createdAt;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function includeOrderInHabits(o: PedidoOrder): boolean {
  if (o.status === 'draft') return false;
  if (!o.items?.length) return false;
  return o.items.some((i) => i.supplierProductId && i.quantity > 0);
}

function consistencyPoints(quantities: number[], med: number): number {
  if (quantities.length < 2 || med <= 0) return 5;
  const devs = quantities.map((q) => Math.abs(q - med) / med);
  const avgDev = arithmeticMean(devs);
  if (avgDev <= 0.15) return 15;
  if (avgDev <= 0.35) return 10;
  return 5;
}

function medianGapDaysBetweenOrders(orderTimesMs: number[]): number | null {
  const dayIdx = [...new Set(orderTimesMs.map((t) => Math.floor(t / MS_DAY)))].sort((a, b) => a - b);
  if (dayIdx.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < dayIdx.length; i++) {
    const d = dayIdx[i]! - dayIdx[i - 1]!;
    if (d > 0) gaps.push(d);
  }
  return medianPositive(gaps);
}

function lineConfidence(n: number, consistencyPts: number): SuggestedConfidence {
  if (n >= 4 && consistencyPts >= 10) return 'alta';
  if (n >= 3) return 'media';
  return 'baja';
}

function computeGlobalConfidenceLevel(
  lines: SuggestedOrderLine[],
  orderCount: number,
  windowDays: 60 | 90,
): SuggestedConfidence {
  if (orderCount < 3 || lines.length === 0) return 'baja';
  const alta = lines.filter((l) => l.confidence === 'alta').length;
  const baja = lines.filter((l) => l.confidence === 'baja').length;
  if (orderCount >= 5 && windowDays === 60 && alta >= Math.ceil(lines.length * 0.35) && baja <= Math.floor(lines.length * 0.35)) {
    return 'alta';
  }
  if (orderCount >= 3 && baja < lines.length * 0.55) return 'media';
  return 'baja';
}

function formatCoverageDays(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(/\.0$/, '');
}

function buildReason(params: {
  n: number;
  sameWeekday: number;
  todayWd: number;
  daysSinceLast: number;
  orderTimes: number[];
}): string {
  const { n, sameWeekday, todayWd, daysSinceLast, orderTimes } = params;
  const label = WEEKDAY_LABEL[todayWd] ?? 'hoy';
  if (sameWeekday >= 2 && sameWeekday / n >= 0.35) {
    return `Habitual los ${label}s`;
  }
  if (n >= 4) return 'Pedido recurrente';
  if (daysSinceLast <= 14) return 'Últimos pedidos similares';
  const sorted = [...orderTimes].sort((a, b) => a - b);
  if (sorted.length >= 3) {
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((sorted[i]! - sorted[i - 1]!) / MS_DAY);
    }
    const mg = medianPositive(gaps);
    if (mg != null && mg >= 5 && mg <= 10) return 'Suele repetirse cada semana';
  }
  return 'Patrón habitual en tus pedidos';
}

function buildTitle(todayWd: number, ordersInWindow: PedidoOrder[]): string {
  const label = WEEKDAY_LABEL[todayWd] ?? '';
  const tot = ordersInWindow.length;
  if (tot < 1) return 'Pedido sugerido';
  let todayCount = 0;
  for (const o of ordersInWindow) {
    const t = orderCommitTime(o);
    if (t <= 0) continue;
    if (new Date(t).getDay() === todayWd) todayCount += 1;
  }
  if (todayCount / tot >= 0.22) {
    return `Pedido habitual ${label}`;
  }
  return 'Pedido sugerido';
}

function computeWithWindow(
  orders: PedidoOrder[],
  supplierId: string,
  supplierProducts: PedidoSupplierProduct[],
  supplierName: string,
  now: Date,
  windowDays: 60 | 90,
  options: ComputeSuggestedOrderOptions,
): SuggestedOrderResult {
  const nowMs = now.getTime();
  const cutoff = nowMs - windowDays * MS_DAY;
  const catalog = new Map(supplierProducts.filter((p) => p.isActive).map((p) => [p.id, p]));
  if (catalog.size === 0) return { ok: false, reason: 'insufficient_history' };

  const deliveryYmd = options.deliveryDateYmd?.trim() || '';
  const cycle = options.deliveryCycleWeekdays ?? [];
  const exceptions = options.deliveryExceptionDates ?? [];
  const deliveryCoverageDays =
    deliveryYmd && /^(\d{4})-(\d{2})-(\d{2})$/.test(deliveryYmd)
      ? coverageDaysUntilNextDelivery(deliveryYmd, cycle, exceptions)
      : null;

  const relevant = orders
    .filter(
      (o) =>
        o.supplierId === supplierId &&
        includeOrderInHabits(o) &&
        orderCommitTime(o) >= cutoff &&
        orderCommitTime(o) > 0,
    )
    .sort((a, b) => orderCommitTime(a) - orderCommitTime(b));

  if (relevant.length < MIN_ORDERS_IN_WINDOW) {
    return { ok: false, reason: 'insufficient_history' };
  }

  const aggs = new Map<string, LineAgg>();

  for (const o of relevant) {
    const t = orderCommitTime(o);
    const wd = new Date(t).getDay();
    const perPid = new Map<string, number>();
    for (const it of o.items) {
      const pid = it.supplierProductId;
      if (!pid || !catalog.has(pid)) continue;
      if (it.incidentType === 'missing') continue;
      const q = Number(it.quantity);
      if (!(q > 0) || !Number.isFinite(q)) continue;
      perPid.set(pid, (perPid.get(pid) ?? 0) + q);
    }
    for (const [pid, sumQ] of perPid) {
      const a = aggs.get(pid) ?? { quantities: [], orderTimes: [], weekdays: [] };
      a.quantities.push(sumQ);
      a.orderTimes.push(t);
      a.weekdays.push(wd);
      aggs.set(pid, a);
    }
  }

  const todayWd = now.getDay();
  const todayPlanDay = JS_DAY_TO_CONSUMPTION_DAY[todayWd];
  const scored: SuggestedOrderLine[] = [];

  for (const [pid, agg] of aggs) {
    const prod = catalog.get(pid);
    if (!prod || agg.quantities.length === 0) continue;

    const n = agg.quantities.length;
    const frequencyScore = Math.min(40, n * 6);

    const lastT = Math.max(...agg.orderTimes);
    const daysSince = (nowMs - lastT) / MS_DAY;
    let recencyScore = 0;
    if (daysSince <= 7) recencyScore = 28;
    else if (daysSince <= 15) recencyScore = 18;
    else if (daysSince <= 30) recencyScore = 10;
    else if (daysSince <= 45) recencyScore = 5;

    const sameWd = agg.weekdays.filter((w) => w === todayWd).length;
    const dayOfWeekScore = Math.min(22, (sameWd / n) * 22);

    const rawMed = medianPositive(agg.quantities);
    if (rawMed == null || rawMed <= 0) continue;
    const consist = consistencyPoints(agg.quantities, rawMed);

    const score = frequencyScore + recencyScore + dayOfWeekScore + consist;
    const advancedSegment =
      prod.consumptionPlan?.mode === 'advanced'
        ? (prod.consumptionPlan.segments ?? []).find((segment) => segment.order_day === todayPlanDay)
        : null;
    const advancedQty =
      advancedSegment && Number.isFinite(advancedSegment.target_quantity)
        ? roundOrderQtyFromHistory(prod.unit, Math.max(0, Number(advancedSegment.target_quantity)))
        : null;
    const suggestedQty = advancedQty != null && advancedQty > 0 ? advancedQty : roundOrderQtyFromHistory(prod.unit, rawMed);
    if (suggestedQty <= 0) continue;

    const unitPrice = prod.pricePerUnit;
    const lineSubtotal = Math.round(suggestedQty * unitPrice * 100) / 100;
    const vatRate = prod.vatRate ?? 0;
    const lineTotalWithVat = Math.round(lineSubtotal * (1 + vatRate) * 100) / 100;

    const reason = buildReason({
      n,
      sameWeekday: sameWd,
      todayWd,
      daysSinceLast: daysSince,
      orderTimes: agg.orderTimes,
    });

    const weeklyPar = prod.parStock ?? 0;
    let estimatedCoverageDays: number | null = null;
    let estimatedCoverageSource: 'par_semanal' | 'ritmo_pedidos' = 'ritmo_pedidos';
    let estimatedCoverageCaption: string;

    if (weeklyPar > 0) {
      const dailyNeed = weeklyPar / 7;
      if (dailyNeed > 1e-9) {
        estimatedCoverageDays = suggestedQty / dailyNeed;
        estimatedCoverageSource = 'par_semanal';
      }
    }
    if (estimatedCoverageDays == null || !Number.isFinite(estimatedCoverageDays) || estimatedCoverageDays <= 0) {
      const mg = medianGapDaysBetweenOrders(agg.orderTimes);
      estimatedCoverageDays = mg;
      estimatedCoverageSource = 'ritmo_pedidos';
    }

    if (estimatedCoverageDays != null && Number.isFinite(estimatedCoverageDays)) {
      estimatedCoverageDays = Math.min(21, Math.max(0.5, Math.round(estimatedCoverageDays * 10) / 10));
    } else {
      estimatedCoverageDays = null;
    }

    if (estimatedCoverageSource === 'par_semanal' && estimatedCoverageDays != null) {
      estimatedCoverageCaption = `Cobertura estimada ~${formatCoverageDays(estimatedCoverageDays)} d (según PAR semanal e histórico; no es stock real).`;
    } else if (estimatedCoverageDays != null) {
      estimatedCoverageCaption = `Cobertura estimada ~${formatCoverageDays(estimatedCoverageDays)} d (según ritmo entre pedidos; no es stock real).`;
    } else {
      estimatedCoverageCaption = 'Cobertura estimada no calculable con los datos actuales.';
    }

    const confidence = lineConfidence(n, consist);

    scored.push({
      supplierProductId: pid,
      productName: prod.name.trim() || 'Producto',
      unit: prod.unit,
      suggestedQty,
      unitPrice,
      vatRate,
      lineSubtotal,
      lineTotalWithVat,
      reason,
      score,
      estimatedCoverageDays,
      estimatedCoverageSource,
      estimatedCoverageCaption,
      confidence,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const lines = scored.slice(0, MAX_SUGGESTED_LINES);

  if (lines.length === 0) {
    return { ok: false, reason: 'insufficient_history' };
  }

  const estimatedTotalWithVat = Math.round(lines.reduce((s, l) => s + l.lineTotalWithVat, 0) * 100) / 100;
  const title = buildTitle(todayWd, relevant);

  const covVals = lines.map((l) => l.estimatedCoverageDays).filter((x): x is number => x != null && x > 0);
  let coverageGlobalRange: { min: number; max: number } | null = null;
  let coverageGlobalLabel: string | null = null;
  if (covVals.length > 0) {
    const mn = Math.min(...covVals);
    const mx = Math.max(...covVals);
    coverageGlobalRange = { min: mn, max: mx };
    if (Math.abs(mx - mn) < 0.75) {
      coverageGlobalLabel = `≈${formatCoverageDays((mn + mx) / 2)} días`;
    } else {
      coverageGlobalLabel = `${formatCoverageDays(mn)}–${formatCoverageDays(mx)} días`;
    }
  }

  const globalConfidence = computeGlobalConfidenceLevel(lines, relevant.length, windowDays);

  const prudentSubtitle =
    'Según tu histórico con este proveedor. No sustituye inventario real ni garantiza disponibilidad.';
  const prudentDisclaimer =
    'Estimación orientativa. El equipo sigue teniendo el control: revisa y ajusta antes de enviar.';

  return {
    ok: true,
    windowDays,
    supplierName,
    title,
    lines,
    estimatedTotalWithVat,
    orderCountInWindow: relevant.length,
    coverageGlobalRange,
    coverageGlobalLabel,
    globalConfidence,
    deliveryCoverageDays,
    prudentSubtitle,
    prudentDisclaimer,
  };
}

/**
 * Analiza pedidos ya cargados (local actual implícito en el array).
 */
export function computeSuggestedOrder(
  orders: PedidoOrder[],
  supplierId: string,
  supplierProducts: PedidoSupplierProduct[],
  supplierName: string,
  options: ComputeSuggestedOrderOptions = {},
): SuggestedOrderResult {
  if (!supplierId || supplierProducts.length === 0) {
    return { ok: false, reason: 'insufficient_history' };
  }

  const now = options.now ?? new Date();

  for (const days of SUGGESTED_ORDER_WINDOWS_DAYS) {
    const r = computeWithWindow(orders, supplierId, supplierProducts, supplierName, now, days, options);
    if (r.ok) return r;
  }
  return { ok: false, reason: 'insufficient_history' };
}

/** Etiqueta corta de confianza para UI. */
export function suggestedConfidenceLabel(c: SuggestedConfidence): string {
  switch (c) {
    case 'alta':
      return 'Confianza alta';
    case 'media':
      return 'Confianza media';
    default:
      return 'Confianza baja';
  }
}
