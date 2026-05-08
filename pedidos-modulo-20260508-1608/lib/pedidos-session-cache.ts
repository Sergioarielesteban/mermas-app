import type { PedidoSupplier } from '@/lib/pedidos-supabase';

export function suppliersSessionKey(localId: string) {
  return `chefone_pedidos_suppliers:${localId}`;
}

export function catalogPricesSessionKey(localId: string) {
  return `chefone_pedidos_catalog_prices:${localId}`;
}

export function readSuppliersSessionCache(localId: string): PedidoSupplier[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(suppliersSessionKey(localId));
    if (raw == null) return null;
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return null;
    return data as PedidoSupplier[];
  } catch {
    return null;
  }
}

export function writeSuppliersSessionCache(localId: string, rows: PedidoSupplier[]) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(suppliersSessionKey(localId), JSON.stringify(rows));
  } catch {
    /* modo privado / cuota */
  }
}

/** `null` = aún no hay caché (hay que cargar). Map vacío = catálogo sin precios en caché. */
export function readCatalogPricesSessionCache(localId: string): Map<string, number> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(catalogPricesSessionKey(localId));
    if (raw == null) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const m = new Map<string, number>();
    for (const [k, v] of Object.entries(data)) {
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(n)) m.set(k, n);
    }
    return m;
  } catch {
    return null;
  }
}

export function writeCatalogPricesSessionCache(localId: string, map: Map<string, number>) {
  if (typeof window === 'undefined') return;
  try {
    const o: Record<string, number> = {};
    for (const [k, v] of map) o[k] = v;
    sessionStorage.setItem(catalogPricesSessionKey(localId), JSON.stringify(o));
  } catch {
    /* modo privado / cuota */
  }
}
