import {
  comparablePriceDisplayUnit,
  comparablePriceHistoryPair,
  type CatalogRowForPriceEvolution,
} from '@/lib/price-evolution-comparable';
import { unitPriceCatalogSuffix } from '@/lib/pedidos-format';
import { getOrderItemCatalogUnitPriceForEvolution, type PedidoOrderItem } from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';

const PCT_THRESHOLD = 0.1;
/** Diferencia mínima en € (0,01 € = 1 céntimo) para mostrar alerta si el % no la supera. */
const EUR_THRESHOLD = 0.01;

export type ReceptionHistoricoComparable = {
  precio: number;
  unidad: string;
};

export type ReceptionPriceAlertUi = {
  direction: 'up' | 'down';
  title: string;
  subtitle: string;
  pctLabel: string;
};

function normalizeUnitKey(u: string): string {
  return u.trim().toLowerCase().replace(/\s+/g, '');
}

/** Misma unidad lógica que en `historico_precios.unidad_comparacion`. */
function catalogRowFromOrderItem(item: PedidoOrderItem): CatalogRowForPriceEvolution {
  return {
    unit: item.unit,
    price_per_unit: item.basePricePerUnit ?? item.pricePerUnit,
    estimated_kg_per_unit: item.estimatedKgPerUnit ?? null,
    billing_unit: item.billingUnit ?? null,
    billing_qty_per_order_unit: item.billingQtyPerOrderUnit ?? null,
  };
}

function displaySuffixForComparableUnit(unitRaw: string): string {
  const u = unitRaw.trim().toLowerCase();
  if (u in unitPriceCatalogSuffix) return unitPriceCatalogSuffix[u as Unit];
  return unitRaw;
}

function formatMoneyEs(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/**
 * Precio actual en unidad comparable (alineado con filas de `historico_precios`).
 */
export function currentComparablePriceForReceptionItem(item: PedidoOrderItem): number | null {
  const catUnit = getOrderItemCatalogUnitPriceForEvolution(item);
  if (catUnit == null) return null;
  const row = catalogRowFromOrderItem(item);
  const pair = comparablePriceHistoryPair(row, catUnit);
  return pair.new;
}

function unitsComparableForAlert(historicoUnit: string, item: PedidoOrderItem): boolean {
  const row = catalogRowFromOrderItem(item);
  const expected = comparablePriceDisplayUnit(row);
  const a = normalizeUnitKey(historicoUnit);
  const b = normalizeUnitKey(expected);
  if (a === b) return true;
  if (a === 'l' && b === 'litro') return true;
  if (a === 'litro' && b === 'l') return true;
  return false;
}

/**
 * Alerta inline si el precio recepcionado difiere del último histórico comparable (misma unidad).
 */
export function receptionPriceAlertFromPreview(
  previewItem: PedidoOrderItem,
  lastHistorico: ReceptionHistoricoComparable | null | undefined,
  options?: { suppress?: boolean },
): ReceptionPriceAlertUi | null {
  if (options?.suppress) return null;
  if (!lastHistorico || !Number.isFinite(lastHistorico.precio) || lastHistorico.precio <= 0) return null;
  if (!previewItem.supplierProductId) return null;
  if (previewItem.excludeFromPriceEvolution) return null;
  if (previewItem.incidentType === 'missing') return null;

  if (!unitsComparableForAlert(lastHistorico.unidad, previewItem)) return null;

  const cur = currentComparablePriceForReceptionItem(previewItem);
  if (cur == null || !Number.isFinite(cur) || cur <= 0) return null;

  const prev = lastHistorico.precio;
  const delta = cur - prev;
  const absDelta = Math.abs(delta);
  const pct = prev > 0 ? (delta / prev) * 100 : 0;
  const absPct = Math.abs(pct);

  if (absPct < PCT_THRESHOLD && absDelta < EUR_THRESHOLD) return null;

  const suf = displaySuffixForComparableUnit(comparablePriceDisplayUnit(catalogRowFromOrderItem(previewItem)));
  const unitBit = `/${suf}`;
  const before = `${formatMoneyEs(prev)}${unitBit}`;
  const now = `${formatMoneyEs(cur)}${unitBit}`;
  const pctRounded = Math.round(pct * 10) / 10;
  const pctLabel = `${pctRounded >= 0 ? '+' : ''}${pctRounded.toLocaleString('es-ES', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;

  if (delta > 0) {
    return {
      direction: 'up',
      title: 'Subida de precio',
      subtitle: `Antes ${before} · Ahora ${now}`,
      pctLabel,
    };
  }
  return {
    direction: 'down',
    title: 'Bajada de precio',
    subtitle: `Antes ${before} · Ahora ${now}`,
    pctLabel,
  };
}
