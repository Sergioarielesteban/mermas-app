import type { PedidoOrder, PedidoOrderItem } from '@/lib/pedidos-supabase';
import { formatQuantityWithUnit } from '@/lib/pedidos-format';
import { orderLineDisplayName } from '@/lib/pedidos-line-display-name';
import type { PurchaseReceiptToInventoryResult } from '@/lib/inventory-pedidos-bridge';

export type InventoryLinkInfo = {
  inventoryItemId: string;
  name: string;
  unit: string;
};

export type PedidosRecepcionInventorySummary = {
  linkedLineCount: number;
  unlinkedLineCount: number;
  stockEntriesApplied: number;
  stockEntriesSkipped: number;
  linkedLines: { label: string; qtyLabel: string; inventoryName: string; applied: boolean }[];
  unlinkedLines: { label: string; qtyLabel: string }[];
};

export function receivedQtyForInventoryLine(item: PedidoOrderItem): number {
  if (item.receivedQuantity > 0) return Math.round(item.receivedQuantity * 1000) / 1000;
  if (item.quantity > 0) return Math.round(item.quantity * 1000) / 1000;
  return 0;
}

export function buildReceptionInventorySummary(params: {
  order: PedidoOrder;
  linkByProductId: ReadonlyMap<string, InventoryLinkInfo>;
  catalogNameByProductId?: ReadonlyMap<string, string> | null;
  applyResult?: PurchaseReceiptToInventoryResult | null;
}): PedidosRecepcionInventorySummary {
  const appliedByItem = new Map(
    (params.applyResult?.details ?? []).map((d) => [d.inventoryItemId, d]),
  );
  const linkedLines: PedidosRecepcionInventorySummary['linkedLines'] = [];
  const unlinkedLines: PedidosRecepcionInventorySummary['unlinkedLines'] = [];

  for (const item of params.order.items) {
    const pid = item.supplierProductId?.trim();
    if (!pid) continue;
    const qty = receivedQtyForInventoryLine(item);
    if (qty <= 0) continue;
    const label = orderLineDisplayName(item, params.catalogNameByProductId ?? null);
    const qtyLabel = formatQuantityWithUnit(qty, item.unit);
    const link = params.linkByProductId.get(pid);
    if (link) {
      const applied = appliedByItem.has(link.inventoryItemId);
      linkedLines.push({
        label,
        qtyLabel,
        inventoryName: link.name,
        applied,
      });
    } else {
      unlinkedLines.push({ label, qtyLabel });
    }
  }

  return {
    linkedLineCount: linkedLines.length,
    unlinkedLineCount: unlinkedLines.length,
    stockEntriesApplied: params.applyResult?.applied ?? 0,
    stockEntriesSkipped: params.applyResult?.skipped ?? 0,
    linkedLines,
    unlinkedLines,
  };
}

/** Vista previa operativa antes de validar (badges y copy en Validar). */
export function previewOrderInventoryImpact(
  order: PedidoOrder,
  linkByProductId: ReadonlyMap<string, InventoryLinkInfo>,
): { linkedLineCount: number; unlinkedLineCount: number } {
  let linkedLineCount = 0;
  let unlinkedLineCount = 0;
  for (const item of order.items) {
    const pid = item.supplierProductId?.trim();
    if (!pid || receivedQtyForInventoryLine(item) <= 0) continue;
    if (linkByProductId.has(pid)) linkedLineCount++;
    else unlinkedLineCount++;
  }
  return { linkedLineCount, unlinkedLineCount };
}
