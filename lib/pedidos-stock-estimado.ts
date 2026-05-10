/**
 * Estimación de riesgo de falta a partir del histórico de recepciones (no es stock real).
 * Usa pedidos marcados como recibidos y las cantidades registradas en línea.
 */

import { unitAllowsDecimalOrderQuantity } from '@/lib/pedidos-units';
import type { PedidoOrder, PedidoOrderItem, PedidoSupplierProduct } from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';

const MS_DAY = 86_400_000;

export type StockRiskLevel = 'normal' | 'revisar' | 'posible_falta' | 'muy_probable_falta';

export type ProductReceptionHistory = {
  supplierProductId: string;
  productName: string;
  supplierName?: string;
  unit?: string;
  lastReceivedAt: string | null;
  receivedDates: string[];
  receivedQuantities?: number[];
  lastReceivedQuantity?: number | null;
  lastReceivedPrice?: number | null;
};

export type StockEstimate = {
  supplierProductId: string;
  productName: string;
  supplierName?: string;
  unit?: string;
  daysSinceLastReceived: number | null;
  avgPurchaseIntervalDays: number | null;
  stockRiskScore: number | null;
  level: StockRiskLevel;
  suggestedQuantity: number | null;
  label: string;
  description: string;
};

export const STOCK_RISK_LOOKBACK_DAYS = 90;

/** Cantidad a sumar al pedido (catálogo / recepción). */
export function normalizeSuggestedOrderQty(unit: Unit, raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  if (unitAllowsDecimalOrderQuantity(unit)) return Math.max(0.01, Math.round(raw * 100) / 100);
  return Math.max(1, Math.round(raw));
}

function daysBetweenChronological(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / MS_DAY);
}

function average(values: number[]): number | null {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!valid.length) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

function median(values: number[]): number | null {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!valid.length) return null;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 0) {
    return (valid[mid - 1]! + valid[mid]!) / 2;
  }
  return valid[mid]!;
}

function calculateAverageIntervalDays(dates: string[]): number | null {
  const parsedDates = dates
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (parsedDates.length < 2) return null;
  const intervals: number[] = [];
  for (let i = 1; i < parsedDates.length; i++) {
    const diff = daysBetweenChronological(parsedDates[i - 1]!, parsedDates[i]!);
    if (diff > 0) intervals.push(diff);
  }
  if (intervals.length === 0) return null;
  return median(intervals);
}

function getRiskLevel(score: number | null): StockRiskLevel {
  if (score === null) return 'normal';
  if (score >= 1.3) return 'muy_probable_falta';
  if (score >= 1.0) return 'posible_falta';
  if (score >= 0.75) return 'revisar';
  return 'normal';
}

function buildLabel(level: StockRiskLevel): string {
  switch (level) {
    case 'muy_probable_falta':
      return 'Muy probable falta';
    case 'posible_falta':
      return 'Puede faltar pronto';
    case 'revisar':
      return 'Revisar pronto';
    default:
      return 'Sin señal de falta';
  }
}

function buildDescription(
  daysSinceLastReceived: number | null,
  avgPurchaseIntervalDays: number | null,
): string {
  if (daysSinceLastReceived === null || avgPurchaseIntervalDays === null) {
    return 'Aún no hay suficiente historial para estimar.';
  }
  return `Última recepción hace ${daysSinceLastReceived} días · habitual cada ${Math.round(
    avgPurchaseIntervalDays,
  )} días.`;
}

function calculateSuggestedQuantity(history: ProductReceptionHistory): number | null {
  if (history.lastReceivedQuantity != null && history.lastReceivedQuantity > 0) {
    return history.lastReceivedQuantity;
  }
  if (history.receivedQuantities?.length) {
    const a = average(history.receivedQuantities);
    return a != null && a > 0 ? Math.round(a) : null;
  }
  return null;
}

export function estimateProductStockRisk(history: ProductReceptionHistory, now: Date = new Date()): StockEstimate {
  const lastReceivedDate = history.lastReceivedAt ? new Date(history.lastReceivedAt) : null;
  const daysSinceLastReceived =
    lastReceivedDate && !Number.isNaN(lastReceivedDate.getTime())
      ? daysBetweenChronological(lastReceivedDate, now)
      : null;
  const avgPurchaseIntervalDays = calculateAverageIntervalDays(history.receivedDates);
  const stockRiskScore =
    daysSinceLastReceived !== null && avgPurchaseIntervalDays !== null && avgPurchaseIntervalDays > 0
      ? daysSinceLastReceived / avgPurchaseIntervalDays
      : null;
  const level = getRiskLevel(stockRiskScore);
  return {
    supplierProductId: history.supplierProductId,
    productName: history.productName,
    supplierName: history.supplierName,
    unit: history.unit,
    daysSinceLastReceived,
    avgPurchaseIntervalDays,
    stockRiskScore,
    level,
    suggestedQuantity: calculateSuggestedQuantity(history),
    label: buildLabel(level),
    description: buildDescription(daysSinceLastReceived, avgPurchaseIntervalDays),
  };
}

export function buildStockRiskSuggestions(
  histories: ProductReceptionHistory[],
  options?: {
    minScore?: number;
    maxSuggestions?: number;
  },
): StockEstimate[] {
  const minScore = options?.minScore ?? 0.9;
  const maxSuggestions = options?.maxSuggestions ?? 3;
  return histories
    .map((history) => estimateProductStockRisk(history))
    .filter((estimate) => estimate.stockRiskScore !== null && estimate.stockRiskScore >= minScore)
    .sort((a, b) => (b.stockRiskScore ?? 0) - (a.stockRiskScore ?? 0))
    .slice(0, maxSuggestions);
}

function receptionInstantMs(order: PedidoOrder): number | null {
  if (order.status !== 'received') return null;
  const raw = order.receivedAt ?? order.updatedAt;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

function effectiveLineReceivedQty(item: PedidoOrderItem): number | null {
  if (!item.supplierProductId) return null;
  if (item.incidentType === 'missing') return null;
  const q = item.receivedQuantity > 0 ? item.receivedQuantity : item.quantity;
  if (!(q > 0) || !Number.isFinite(q)) return null;
  return q;
}

type ReceptionEvent = { at: number; iso: string; qty: number };

/**
 * Agrupa recepciones reales (pedidos `received`) por producto, ventana `lookbackDays`.
 * Requiere al menos 2 días-distinto con recepción tras fusionar el mismo día.
 */
export function buildReceptionHistoriesFromPedidoOrders(
  orders: PedidoOrder[],
  supplierId: string,
  supplierProducts: PedidoSupplierProduct[],
  now: Date,
  lookbackDays: number = STOCK_RISK_LOOKBACK_DAYS,
): ProductReceptionHistory[] {
  const catalogIds = new Set(supplierProducts.map((p) => p.id));
  const productById = new Map(supplierProducts.map((p) => [p.id, p]));
  const cutoff = now.getTime() - lookbackDays * MS_DAY;

  const rawByProduct = new Map<string, ReceptionEvent[]>();

  for (const o of orders) {
    if (o.supplierId !== supplierId) continue;
    const t = receptionInstantMs(o);
    if (t == null || t < cutoff) continue;

    for (const item of o.items) {
      const pid = item.supplierProductId;
      if (!pid || !catalogIds.has(pid)) continue;
      const qty = effectiveLineReceivedQty(item);
      if (qty == null) continue;
      const iso = new Date(t).toISOString();
      const arr = rawByProduct.get(pid) ?? [];
      arr.push({ at: t, iso, qty });
      rawByProduct.set(pid, arr);
    }
  }

  const histories: ProductReceptionHistory[] = [];

  for (const p of supplierProducts) {
    const raw = rawByProduct.get(p.id);
    if (!raw || raw.length < 1) continue;

    raw.sort((a, b) => a.at - b.at);

    const merged: ReceptionEvent[] = [];
    for (const e of raw) {
      const day = Math.floor(e.at / MS_DAY);
      const prev = merged[merged.length - 1];
      if (prev && Math.floor(prev.at / MS_DAY) === day) {
        prev.qty += e.qty;
      } else {
        merged.push({ at: e.at, iso: e.iso, qty: e.qty });
      }
    }

    if (merged.length < 2) continue;

    const last = merged[merged.length - 1]!;
    const prod = productById.get(p.id);
    histories.push({
      supplierProductId: p.id,
      productName: prod?.name?.trim() || 'Producto',
      unit: prod?.unit,
      lastReceivedAt: last.iso,
      receivedDates: merged.map((m) => m.iso),
      receivedQuantities: merged.map((m) => m.qty),
      lastReceivedQuantity: last.qty,
      lastReceivedPrice: null,
    });
  }

  return histories;
}
