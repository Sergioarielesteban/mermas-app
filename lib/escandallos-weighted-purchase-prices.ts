import { billingQuantityForLine, type PedidoOrder } from '@/lib/pedidos-supabase';

/** Ventana móvil (días) para PMP en escandallos; alineada con el preset habitual de Pedidos → Precios. */
export const ESCANDALLOS_WEIGHTED_PRICE_WINDOW_DAYS = 90;

function orderBillDate(order: PedidoOrder): string {
  return order.receivedAt ?? order.sentAt ?? order.createdAt;
}

/** Misma regla que Pedidos → Precios (modo unitario): precio efectivo por unidad de catálogo en la línea. */
function unitPriceForPurchaseHistory(item: PedidoOrder['items'][number]): number | null {
  const p = item.pricePerUnit;
  if (Number.isFinite(p) && p > 0) return Math.round(p * 100) / 100;
  const billed = billingQuantityForLine(item);
  if (billed > 0 && item.lineTotal > 0) return Math.round((item.lineTotal / billed) * 100) / 100;
  if (item.quantity > 0 && item.lineTotal > 0) return Math.round((item.lineTotal / item.quantity) * 100) / 100;
  return null;
}

function weightQtyForPurchaseHistory(item: PedidoOrder['items'][number]): number {
  const billed = billingQuantityForLine(item);
  if (billed > 0) return billed;
  if (item.quantity > 0) return item.quantity;
  return 1;
}

/**
 * PMP por `supplier_product_id` (UUID en `pedido_supplier_products`), en €/unidad de catálogo,
 * ponderando cantidades facturadas en líneas de pedido dentro de la ventana temporal.
 */
export function computeWeightedAvgBySupplierProductId(
  orders: PedidoOrder[],
  windowDays: number,
): Map<string, { weightedAvg: number; weightedQty: number }> {
  const endMs = Date.now();
  const startMs = endMs - Math.max(1, windowDays) * 86_400_000;
  const acc = new Map<string, { wSum: number; wQty: number }>();

  for (const order of orders) {
    if (order.status === 'draft') continue;
    const dBill = orderBillDate(order);
    const t = Date.parse(dBill);
    if (!Number.isFinite(t) || t < startMs || t > endMs) continue;

    for (const item of order.items) {
      const pid = item.supplierProductId;
      if (!pid) continue;
      const evPrice = unitPriceForPurchaseHistory(item);
      if (evPrice == null) continue;
      const wq = weightQtyForPurchaseHistory(item);
      if (wq <= 0) continue;
      const cur = acc.get(pid) ?? { wSum: 0, wQty: 0 };
      cur.wSum += evPrice * wq;
      cur.wQty += wq;
      acc.set(pid, cur);
    }
  }

  const out = new Map<string, { weightedAvg: number; weightedQty: number }>();
  for (const [id, { wSum, wQty }] of acc) {
    if (wQty > 0) out.set(id, { weightedAvg: Math.round((wSum / wQty) * 100) / 100, weightedQty: wQty });
  }
  return out;
}
