import type { Unit } from '@/lib/types';

/**
 * Fila mínima de catálogo proveedor para guardar en `pedido_supplier_product_price_history`
 * valores **comparables** (misma lógica que la recepción: prioridad €/kg, luego €/ud, €/L, etc.).
 * No modifica el precio de catálogo, solo el par que se persiste en el histórico.
 */
export type CatalogRowForPriceEvolution = {
  unit: Unit | string;
  price_per_unit: number;
  estimated_kg_per_unit: number | null;
  billing_unit?: string | null;
  billing_qty_per_order_unit?: number | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * @param newPriceInCatalogUnit — Mismo criterio que hoy para `updateSupplierProductPriceWithHistory` (€ por unidad de catálogo).
 * @returns Par old/new a guardar en historial, en la **unidad comparable** (p. ej. €/kg si se puede, no €/caja).
 */
export function comparablePriceHistoryPair(
  row: CatalogRowForPriceEvolution,
  newPriceInCatalogUnit: number,
): { old: number; new: number } {
  const oldC = r2(Number(row.price_per_unit));
  const newC = r2(newPriceInCatalogUnit);

  const u = String(row.unit) as Unit;

  // 1) Catálogo ya en kg → historial en €/kg
  if (u === 'kg') {
    return { old: r2(oldC), new: r2(newC) };
  }

  // "Precio real €/kg" vía facturación en kg: prioridad sobre estimated_kg
  const bq = row.billing_qty_per_order_unit != null ? Number(row.billing_qty_per_order_unit) : 0;
  if (String(row.billing_unit) === 'kg' && bq > 0) {
    return { old: r2(oldC / bq), new: r2(newC / bq) };
  }

  // Factor kg por unidad de pedido (p. ej. 6 kg/caja) → nunca dejar el histórico solo en €/caja si hay €/kg
  const est = row.estimated_kg_per_unit != null ? Number(row.estimated_kg_per_unit) : 0;
  if (est > 0) {
    return { old: r2(oldC / est), new: r2(newC / est) };
  }

  // Cobro explícito por litro
  if (u === 'litro') {
    return { old: r2(oldC), new: r2(newC) };
  }

  // Unidad (€/ud)
  if (u === 'ud') {
    return { old: r2(oldC), new: r2(newC) };
  }

  // Sin factor a kg: guardar precio de formato (caja, bandeja, etc.) como hasta ahora
  return { old: r2(oldC), new: r2(newC) };
}
