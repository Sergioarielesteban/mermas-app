import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchInventoryCostConversionFactor,
  normalizeConversionUnit,
} from '@/lib/inventory-cost-conversions-supabase';

export type InventorySupplierProductRow = {
  id: string;
  supplier_id: string;
  name: string;
  unit: string;
  price_per_unit: number;
  billing_unit: string | null;
  billing_qty_per_order_unit: number | null;
  price_per_billing_unit: number | null;
};

/** Precio efectivo por unidad de catálogo (`unit`): último pedido recibido, PMP de pedidos, o precio de catálogo. */
export async function fetchEffectiveSupplierProductUnitPriceEur(
  supabase: SupabaseClient,
  localId: string,
  supplierProductId: string,
): Promise<number | null> {
  const { data: lineRows, error: lErr } = await supabase
    .from('purchase_order_items')
    .select('price_per_unit, created_at, order_id')
    .eq('local_id', localId)
    .eq('supplier_product_id', supplierProductId)
    .order('created_at', { ascending: false })
    .limit(120);
  if (lErr) throw new Error(lErr.message);
  const lines = (lineRows ?? []) as Array<{
    price_per_unit: number | string;
    created_at: string;
    order_id: string;
  }>;
  if (lines.length > 0) {
    const orderIds = [...new Set(lines.map((l) => l.order_id))];
    const { data: ordRows, error: oErr } = await supabase
      .from('purchase_orders')
      .select('id,status')
      .eq('local_id', localId)
      .in('id', orderIds);
    if (oErr) throw new Error(oErr.message);
    const receivedIds = new Set(
      (ordRows ?? [])
        .filter((o: { status: string }) => o.status === 'received')
        .map((o: { id: string }) => o.id),
    );
    const receivedLines = lines.filter((l) => receivedIds.has(l.order_id));
    if (receivedLines.length > 0) {
      const last = Number(receivedLines[0].price_per_unit);
      if (Number.isFinite(last) && last >= 0) return Math.round(last * 10000) / 10000;
    }
    const prices = lines
      .map((x) => Number(x.price_per_unit))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (prices.length > 0) {
      const sum = prices.reduce((a, b) => a + b, 0);
      return Math.round((sum / prices.length) * 10000) / 10000;
    }
  }

  const { data: cat, error: cErr } = await supabase
    .from('pedido_supplier_products')
    .select('price_per_unit')
    .eq('local_id', localId)
    .eq('id', supplierProductId)
    .maybeSingle();
  if (cErr) throw new Error(cErr.message);
  if (cat && cat.price_per_unit != null) {
    const p = Number(cat.price_per_unit);
    if (Number.isFinite(p) && p >= 0) return Math.round(p * 10000) / 10000;
  }
  return null;
}

/** Intenta extraer kg totales por envase desde el nombre (ej. «1,5KG X4» → 6). */
export function suggestKgPerPackFromProductName(name: string): number | null {
  const n = String(name ?? '').toUpperCase().replace(/\s+/g, ' ');
  const mult = /(\d+(?:[.,]\d+)?)\s*KG\s*[X×]\s*(\d+)/i.exec(n);
  if (mult) {
    const a = Number(mult[1].replace(',', '.'));
    const b = Number(mult[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) return Math.round(a * b * 10000) / 10000;
  }
  const single = /(\d+(?:[.,]\d+)?)\s*KG\b/i.exec(n);
  if (single) {
    const a = Number(single[1].replace(',', '.'));
    if (Number.isFinite(a) && a > 0) return Math.round(a * 10000) / 10000;
  }
  return null;
}

/**
 * Resuelve € por unidad de inventario (`inventoryUnit`), vinculado a un artículo proveedor.
 * `catalogUnit` es pedido_supplier_products.unit; el precio de compra es por esa unidad.
 */
export async function resolveSupplierLinkedInventoryUnitPriceEur(
  supabase: SupabaseClient,
  localId: string,
  params: {
    supplierProductId: string;
    catalogUnit: string;
    effectivePricePerCatalogUnit: number;
    inventoryUnit: string;
    factorConversionManual: number | null;
    productName?: string | null;
  },
): Promise<number | null> {
  const catU = normalizeConversionUnit(params.catalogUnit);
  const invU = normalizeConversionUnit(params.inventoryUnit);
  const price = params.effectivePricePerCatalogUnit;
  if (!Number.isFinite(price) || price < 0) return null;

  const tryConvert = async (): Promise<number | null> => {
    if (catU === invU) return Math.round(price * 10000) / 10000;

    let f = await fetchInventoryCostConversionFactor(
      supabase,
      localId,
      params.supplierProductId,
      catU,
      invU,
    );
    if (f != null && f > 0) return Math.round((price / f) * 10000) / 10000;

    const finv = await fetchInventoryCostConversionFactor(
      supabase,
      localId,
      params.supplierProductId,
      invU,
      catU,
    );
    if (finv != null && finv > 0) return Math.round(price * finv * 10000) / 10000;

    if (catU === 'caja' && invU === 'kg') {
      const hint = suggestKgPerPackFromProductName(params.productName ?? '');
      if (hint != null && hint > 0) return Math.round((price / hint) * 10000) / 10000;
    }

    const manual = params.factorConversionManual;
    if (manual != null && Number.isFinite(manual) && manual > 0) {
      if (invU === catU) return Math.round(price * 10000) / 10000;
      return Math.round((price / manual) * 10000) / 10000;
    }

    return null;
  };

  return tryConvert();
}

export type InventorySupplierProductSearchRow = {
  id: string;
  supplierId: string;
  supplierName: string;
  name: string;
  unit: string;
  pricePerUnit: number;
  category: string | null;
};

export async function fetchInventorySupplierProductsForSearch(
  supabase: SupabaseClient,
  localId: string,
): Promise<InventorySupplierProductSearchRow[]> {
  const { data: products, error: pErr } = await supabase
    .from('pedido_supplier_products')
    .select('id,supplier_id,name,unit,price_per_unit,article_id')
    .eq('local_id', localId)
    .eq('is_active', true)
    .order('name');
  if (pErr) throw new Error(pErr.message);
  const plist = (products ?? []) as Array<{
    id: string;
    supplier_id: string;
    name: string;
    unit: string;
    price_per_unit: number;
    article_id: string | null;
  }>;
  const supIds = [...new Set(plist.map((r) => r.supplier_id))];
  const articleIds = [
    ...new Set(plist.map((r) => r.article_id).filter((x): x is string => Boolean(x))),
  ];
  const [{ data: suppliers }, { data: articles }] = await Promise.all([
    supIds.length
      ? supabase.from('pedido_suppliers').select('id,name').eq('local_id', localId).in('id', supIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    articleIds.length
      ? supabase
          .from('purchase_articles')
          .select('id,categoria')
          .eq('local_id', localId)
          .in('id', articleIds)
      : Promise.resolve({ data: [] as { id: string; categoria: string | null }[] }),
  ]);
  const supMap = new Map((suppliers ?? []).map((s) => [String(s.id), String(s.name ?? '')]));
  const artMap = new Map(
    (articles ?? []).map((a) => [String(a.id), a.categoria != null ? String(a.categoria) : null]),
  );
  return plist.map((r) => ({
    id: String(r.id),
    supplierId: String(r.supplier_id),
    supplierName: supMap.get(String(r.supplier_id)) ?? 'Proveedor',
    name: String(r.name ?? ''),
    unit: String(r.unit ?? ''),
    pricePerUnit: Number(r.price_per_unit),
    category: r.article_id ? artMap.get(String(r.article_id)) ?? null : null,
  }));
}

export function filterInventorySupplierProductsByQuery(
  rows: readonly InventorySupplierProductSearchRow[],
  query: string,
  maxResults = 15,
): InventorySupplierProductSearchRow[] {
  const t = query.trim().toLowerCase();
  if (!t) return [];
  return rows
    .filter((r) => {
      const hay = [r.name, r.supplierName, r.unit, r.category ?? ''].join(' ').toLowerCase();
      return hay.includes(t);
    })
    .slice(0, maxResults);
}

export async function fetchSupplierProductRowForInventory(
  supabase: SupabaseClient,
  localId: string,
  supplierProductId: string,
): Promise<InventorySupplierProductRow | null> {
  const { data, error } = await supabase
    .from('pedido_supplier_products')
    .select('id,supplier_id,name,unit,price_per_unit,billing_unit,billing_qty_per_order_unit,price_per_billing_unit')
    .eq('local_id', localId)
    .eq('id', supplierProductId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: String(data.id),
    supplier_id: String(data.supplier_id),
    name: String(data.name ?? ''),
    unit: String(data.unit ?? ''),
    price_per_unit: Number(data.price_per_unit),
    billing_unit: data.billing_unit != null ? String(data.billing_unit) : null,
    billing_qty_per_order_unit:
      data.billing_qty_per_order_unit != null ? Number(data.billing_qty_per_order_unit) : null,
    price_per_billing_unit:
      data.price_per_billing_unit != null ? Number(data.price_per_billing_unit) : null,
  };
}
