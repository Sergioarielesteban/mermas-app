import type { SupabaseClient } from '@supabase/supabase-js';
import { applyInventoryStockMovement } from '@/lib/inventory-operations-supabase';

/**
 * Puente conceptual Pedidos → Inventario (Fase 1: API preparada, sin cableado en recepción).
 * Fase 2: invocar desde recepción al marcar pedido recibido.
 */
export type PurchaseReceiptLineInput = {
  supplierProductId: string;
  productName: string;
  receivedQuantity: number;
  unit: string;
  pricePerUnit?: number | null;
};

export type PurchaseReceiptToInventoryResult = {
  applied: number;
  skipped: number;
  details: { inventoryItemId: string; name: string; delta: number }[];
};

/**
 * Busca líneas de inventario enlazadas por `supplier_product_id` y registra entradas.
 * No crea líneas nuevas automáticamente (evita catálogos duplicados sin revisión).
 */
export async function applyPurchaseReceiptToInventory(
  supabase: SupabaseClient,
  params: {
    localId: string;
    orderId: string;
    lines: PurchaseReceiptLineInput[];
    userId?: string | null;
  },
): Promise<PurchaseReceiptToInventoryResult> {
  const result: PurchaseReceiptToInventoryResult = { applied: 0, skipped: 0, details: [] };
  if (params.lines.length === 0) return result;

  const productIds = [...new Set(params.lines.map((l) => l.supplierProductId).filter(Boolean))];
  if (productIds.length === 0) {
    result.skipped = params.lines.length;
    return result;
  }

  const { data: items, error } = await supabase
    .from('inventory_items')
    .select('id,name,supplier_product_id,unit')
    .eq('local_id', params.localId)
    .eq('is_active', true)
    .in('supplier_product_id', productIds);
  if (error) throw new Error(error.message);

  const byProduct = new Map<string, { id: string; name: string; unit: string }>();
  for (const row of items ?? []) {
    const pid = row.supplier_product_id != null ? String(row.supplier_product_id) : '';
    if (pid) byProduct.set(pid, { id: String(row.id), name: String(row.name), unit: String(row.unit) });
  }

  for (const line of params.lines) {
    const item = byProduct.get(line.supplierProductId);
    const qty = Math.round(line.receivedQuantity * 1000) / 1000;
    if (!item || qty <= 0) {
      result.skipped += 1;
      continue;
    }
    await applyInventoryStockMovement(supabase, {
      localId: params.localId,
      inventoryItemId: item.id,
      movementType: 'purchase_receipt',
      quantityDelta: qty,
      unit: line.unit || item.unit,
      reason: `Recepción pedido · ${line.productName}`,
      sourceModule: 'pedidos',
      sourceId: params.orderId,
      userId: params.userId ?? null,
    });
    result.applied += 1;
    result.details.push({ inventoryItemId: item.id, name: item.name, delta: qty });
  }

  return result;
}

/** Indica si la recepción de pedidos puede generar stock (hay ítems enlazados). */
export async function countInventoryLinksForSupplierProducts(
  supabase: SupabaseClient,
  localId: string,
  supplierProductIds: string[],
): Promise<number> {
  if (supplierProductIds.length === 0) return 0;
  const { count, error } = await supabase
    .from('inventory_items')
    .select('id', { count: 'exact', head: true })
    .eq('local_id', localId)
    .eq('is_active', true)
    .in('supplier_product_id', supplierProductIds);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
