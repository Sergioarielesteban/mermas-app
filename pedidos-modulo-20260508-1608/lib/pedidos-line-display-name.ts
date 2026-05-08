import type { PedidoOrderItem } from '@/lib/pedidos-supabase';

/**
 * Nombre de línea de pedido para UI operativa: prioriza el catálogo vivo del `supplier_product_id`
 * (albarán / proveedor) y usa `product_name` de la línea como copia fijada en BD si aún no hay catálogo en memoria.
 * No afecta a costes ni a escandallos; solo capa de presentación.
 */
export function orderLineDisplayName(
  line: Pick<PedidoOrderItem, 'productName' | 'supplierProductId'>,
  catalogNameByProductId: ReadonlyMap<string, string> | null | undefined,
): string {
  if (line.supplierProductId && catalogNameByProductId?.has(line.supplierProductId)) {
    const live = catalogNameByProductId.get(line.supplierProductId)?.trim();
    if (live) return live;
  }
  const snap = line.productName?.trim();
  return snap || '—';
}

/** Texto extra para búsquedas: nombre catálogo + artículo máster enlazado (no sustituye al visor). */
export function orderLineSearchBubble(
  line: Pick<PedidoOrderItem, 'productName' | 'supplierProductId'>,
  catalogNameByProductId: ReadonlyMap<string, string> | null | undefined,
  articleNombreByProductId: ReadonlyMap<string, string> | null | undefined,
): string {
  const parts = [line.productName?.trim() ?? ''];
  if (line.supplierProductId) {
    const cn = catalogNameByProductId?.get(line.supplierProductId);
    if (cn?.trim()) parts.push(cn.trim());
    const an = articleNombreByProductId?.get(line.supplierProductId);
    if (an?.trim()) parts.push(an.trim());
  }
  return parts.filter(Boolean).join(' ');
}

export function catalogNameByProductIdFromSuppliers(
  suppliers: Array<{ products: Array<{ id: string; name: string }> }>,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of suppliers) {
    for (const p of s.products) {
      m.set(p.id, p.name);
    }
  }
  return m;
}

export function articleNombreByProductIdFromSuppliers(
  suppliers: Array<{ products: Array<{ id: string; articleMasterName?: string | null }> }>,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of suppliers) {
    for (const p of s.products) {
      const t = p.articleMasterName?.trim();
      if (t) m.set(p.id, t);
    }
  }
  return m;
}
