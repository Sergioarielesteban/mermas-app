/**
 * Motor de sugerencias operativas para «Nuevo pedido».
 * Reglas heurísticas sobre historial local de pedidos (sin IA).
 * La UI y la persistencia de feedback viven fuera; esto solo calcula candidatos.
 */

import type { CatalogSignals } from '@/lib/pedidos-nuevo-catalog-stats';
import {
  buildReceptionHistoriesFromPedidoOrders,
  buildStockRiskSuggestions,
  STOCK_RISK_LOOKBACK_DAYS,
} from '@/lib/pedidos-stock-estimado';
import type { PedidoOrder, PedidoSupplierProduct } from '@/lib/pedidos-supabase';
import { arithmeticMean } from '@/lib/pedidos-historial-stats';
import {
  loadSuggestionFeedback,
  suggestionFeedbackMultiplier,
  type SuggestionFeedbackMap,
} from '@/lib/pedidos-suggestion-feedback';

export type OperationalSuggestionKind =
  | 'frequency'
  | 'weekly_pattern'
  | 'rhythm_low'
  | 'stock_risk';

export type OperationalSuggestion = {
  id: string;
  kind: OperationalSuggestionKind;
  title: string;
  subtitle?: string;
  /** Productos a incrementar con el mismo gesto que el stepper (+1). */
  productIds: string[];
  /** Prioridad base antes de feedback (mayor = más relevante). */
  baseScore: number;
  /** Layout riesgo estimado: 2ª y 3ª línea (nombre + descripción), como el mock de stock. */
  riskProductName?: string;
  riskDescription?: string;
};

const HISTORY_MS = 160 * 86_400_000;
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

function orderTimestamp(o: PedidoOrder): number {
  const raw = o.sentAt ?? o.createdAt;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function includeOrderInHabits(o: PedidoOrder): boolean {
  if (o.status === 'draft') return false;
  if (!o.items?.length) return false;
  return o.items.some((i) => i.supplierProductId && i.quantity > 0);
}

function productName(map: Map<string, PedidoSupplierProduct>, id: string): string {
  return map.get(id)?.name?.trim() || 'Producto';
}

export type ComputeOperationalSuggestionsInput = {
  localId: string | null;
  supplierId: string;
  orders: PedidoOrder[];
  supplierProducts: PedidoSupplierProduct[];
  qtyByProductId: Record<string, number>;
  catalogSignals: CatalogSignals;
  /** Si true, no devolver sugerencias (usuario buscando). */
  searchActive: boolean;
  now: Date;
  /** Mapa opcional; si se omite se carga con localId. */
  feedback?: SuggestionFeedbackMap;
};

/**
 * Devuelve hasta `maxCount` sugerencias ordenadas por prioridad final (base × feedback).
 */
export function computeOperationalSuggestions(
  input: ComputeOperationalSuggestionsInput,
  maxCount = 3,
): OperationalSuggestion[] {
  const {
    localId,
    supplierId,
    orders,
    supplierProducts,
    qtyByProductId,
    catalogSignals,
    searchActive,
    now,
  } = input;

  if (searchActive || !supplierId || supplierProducts.length === 0) return [];

  const feedback = input.feedback ?? loadSuggestionFeedback(localId);

  const productById = new Map(supplierProducts.map((p) => [p.id, p]));
  const cutoff = now.getTime() - HISTORY_MS;

  const relevant = orders
    .filter(
      (o) =>
        o.supplierId === supplierId &&
        includeOrderInHabits(o) &&
        orderTimestamp(o) >= cutoff &&
        orderTimestamp(o) > 0,
    )
    .sort((a, b) => orderTimestamp(a) - orderTimestamp(b));

  if (relevant.length < 1) return [];

  const candidates: OperationalSuggestion[] = [];

  // ── Fechas de compra por producto (una por pedido) ───────────────────────
  const purchaseDatesByProduct = new Map<string, number[]>();
  for (const o of relevant) {
    const t = orderTimestamp(o);
    const seen = new Set<string>();
    for (const it of o.items) {
      const pid = it.supplierProductId;
      if (!pid || !(it.quantity > 0) || !productById.has(pid)) continue;
      if (seen.has(pid)) continue;
      seen.add(pid);
      const arr = purchaseDatesByProduct.get(pid) ?? [];
      arr.push(t);
      purchaseDatesByProduct.set(pid, arr);
    }
  }

  const nowMs = now.getTime();

  for (const [pid, dates] of purchaseDatesByProduct) {
    if (dates.length < 2) continue;
    dates.sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) gaps.push(dates[i]! - dates[i - 1]!);
    const avgGapDays = arithmeticMean(gaps) / MS_DAY;
    const last = dates[dates.length - 1]!;
    const daysSince = (nowMs - last) / MS_DAY;
    const q = qtyByProductId[pid] ?? 0;
    if (q > 0) continue;

    const threshold = Math.max(7, Math.min(28, avgGapDays * 1.25));
    if (daysSince < threshold || daysSince < 5) continue;

    const nm = productName(productById, pid);
    const lowRhythm = daysSince >= avgGapDays * 1.75;

    if (lowRhythm) {
      candidates.push({
        id: `rhythm:${supplierId}:${pid}`,
        kind: 'rhythm_low',
        title: `Revisa ${nm}`,
        subtitle: `Lleváis ~${Math.round(daysSince)} días sin pedirlo; suele repetirse cada ~${Math.round(avgGapDays)} días.`,
        productIds: [pid],
        baseScore: 72,
      });
    } else {
      candidates.push({
        id: `freq:${supplierId}:${pid}`,
        kind: 'frequency',
        title: `Hace ${Math.round(daysSince)} días que no pides ${nm}`,
        subtitle:
          avgGapDays >= 3
            ? `Sueles repetirlo cada ~${Math.round(avgGapDays)} días.`
            : 'Producto habitual en tus pedidos.',
        productIds: [pid],
        baseScore: 58,
      });
    }
  }

  // ── Patrón día de la semana ───────────────────────────────────────────────
  const weekdayOrderCount = new Array(7).fill(0);
  const weekdayProductHits: Array<Map<string, number>> = Array.from({ length: 7 }, () => new Map());

  for (const o of relevant) {
    const d = new Date(orderTimestamp(o));
    const wd = d.getDay();
    weekdayOrderCount[wd] += 1;
    const seen = new Set<string>();
    for (const it of o.items) {
      const pid = it.supplierProductId;
      if (!pid || !(it.quantity > 0) || !productById.has(pid)) continue;
      if (seen.has(pid)) continue;
      seen.add(pid);
      const m = weekdayProductHits[wd]!;
      m.set(pid, (m.get(pid) ?? 0) + 1);
    }
  }

  const totalWdOrders = weekdayOrderCount.reduce((s, n) => s + n, 0);
  const todayWd = now.getDay();
  if (totalWdOrders >= 4 && weekdayOrderCount[todayWd] >= 2) {
    const hitMap = weekdayProductHits[todayWd]!;
    let bestPid: string | null = null;
    let bestHits = 0;
    for (const [pid, hits] of hitMap) {
      if ((qtyByProductId[pid] ?? 0) > 0) continue;
      if (hits > bestHits) {
        bestHits = hits;
        bestPid = pid;
      }
    }
    if (bestPid && bestHits >= 2) {
      const nm = productName(productById, bestPid);
      const label = WEEKDAY_LABEL[todayWd] ?? 'hoy';
      candidates.push({
        id: `week:${supplierId}:${todayWd}:${bestPid}`,
        kind: 'weekly_pattern',
        title: `Los ${label}s sueles incluir ${nm}`,
        subtitle: 'Basado en tus pedidos a este proveedor.',
        productIds: [bestPid],
        baseScore: 52,
      });
    }
  }

  // ── Habitual en top 30d pero lleva sin pedirse (sin hablar de «stock real») ─
  const topIds = new Set(catalogSignals.mostOrdered30d.slice(0, 12).map((r) => r.supplierProductId));
  for (const pid of topIds) {
    if (!productById.has(pid)) continue;
    if ((qtyByProductId[pid] ?? 0) > 0) continue;
    const dates = purchaseDatesByProduct.get(pid);
    if (!dates?.length) continue;
    const last = Math.max(...dates);
    const daysSince = (nowMs - last) / MS_DAY;
    if (daysSince < 10) continue;
    if (candidates.some((c) => c.productIds.includes(pid))) continue;

    const nm = productName(productById, pid);
    candidates.push({
      id: `low:${supplierId}:${pid}`,
      kind: 'rhythm_low',
      title: `Revisa ${nm}`,
      subtitle: `Muy pedido últimamente; hace ~${Math.round(daysSince)} días que no lo incluyes.`,
      productIds: [pid],
      baseScore: 48,
    });
  }

  // ── Riesgo de falta estimado (recepciones reales, mismo proveedor) ────────
  const receptionHistories = buildReceptionHistoriesFromPedidoOrders(
    orders,
    supplierId,
    supplierProducts,
    now,
    STOCK_RISK_LOOKBACK_DAYS,
  );
  const stockEstimates = buildStockRiskSuggestions(receptionHistories, {
    minScore: 0.9,
    maxSuggestions: 3,
  });
  for (const e of stockEstimates) {
    const pid = e.supplierProductId;
    if (!productById.has(pid)) continue;
    if ((qtyByProductId[pid] ?? 0) > 0) continue;

    const baseScore =
      e.level === 'muy_probable_falta' ? 96 : e.level === 'posible_falta' ? 84 : 73;

    candidates.push({
      id: `stock:${supplierId}:${pid}`,
      kind: 'stock_risk',
      title: e.label,
      riskProductName: e.productName,
      riskDescription: e.description,
      productIds: [pid],
      baseScore,
    });
  }

  const scored = candidates.map((c) => ({
    c,
    final: c.baseScore * suggestionFeedbackMultiplier(feedback[c.id]),
  }));

  scored.sort((x, y) => y.final - x.final);

  const seenKey = new Set<string>();
  const out: OperationalSuggestion[] = [];
  for (const { c } of scored) {
    const dedupeKey = c.productIds.slice().sort().join('|');
    if (seenKey.has(dedupeKey)) continue;
    seenKey.add(dedupeKey);
    out.push(c);
    if (out.length >= maxCount) break;
  }

  return out;
}
