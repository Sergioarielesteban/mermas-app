import type { SupabaseClient } from '@supabase/supabase-js';
import { isDemoMode } from '@/lib/demo-mode';

type LastCtxRow = {
  supplier_product_id: string;
  last_at: string | null;
  last_qty: number | string | null;
  last_received_unit_price: number | string | null;
};

type FreqRow = {
  supplier_product_id: string;
  order_count: number | string | null;
};

export type LastReceptionSignal = {
  lastAt: string;
  lastQty: number;
  lastReceivedUnitPrice: number;
};

export type MostOrderedRow = { supplierProductId: string; orderCount: number };

/** Señales para pestañas y ordenación «inteligente» en Todos. */
export type CatalogSignals = {
  /** Por producto: última recepción registrada (cantidad del pedido, precio unitario real en línea). */
  lastReceptionByProductId: Record<string, LastReceptionSignal>;
  /** IDs ordenados por última recepción más reciente primero. */
  recentProductIds: string[];
  /** Frecuencia de pedidos en 30 días (mayor primero en array). */
  mostOrdered30d: MostOrderedRow[];
};

export const EMPTY_CATALOG_SIGNALS: CatalogSignals = {
  lastReceptionByProductId: {},
  recentProductIds: [],
  mostOrdered30d: [],
};

async function fetchLastReceptionContext(
  supabase: SupabaseClient,
  localId: string,
  supplierId: string,
): Promise<{ rows: LastCtxRow[]; byId: Record<string, LastReceptionSignal>; recentIds: string[] }> {
  const { data, error } = await supabase.rpc('pedidos_catalog_last_reception_context', {
    p_local_id: localId,
    p_supplier_id: supplierId,
    p_limit: 80,
  });
  if (error) throw new Error(error.message);
  const rows = (data as LastCtxRow[] | null) ?? [];
  const byId: Record<string, LastReceptionSignal> = {};
  const recentIds: string[] = [];
  for (const r of rows) {
    const id = r.supplier_product_id;
    if (!id) continue;
    const qty = Number(r.last_qty ?? 0);
    const pup = Number(r.last_received_unit_price ?? 0);
    const la = r.last_at ?? '';
    byId[id] = {
      lastAt: la,
      lastQty: Number.isFinite(qty) ? qty : 0,
      lastReceivedUnitPrice: Number.isFinite(pup) ? pup : 0,
    };
    recentIds.push(id);
  }
  return { rows, byId, recentIds };
}

async function fetchOrderFrequency30d(
  supabase: SupabaseClient,
  localId: string,
  supplierId: string,
): Promise<MostOrderedRow[]> {
  const { data, error } = await supabase.rpc('pedidos_catalog_order_frequency_30d', {
    p_local_id: localId,
    p_supplier_id: supplierId,
    p_limit: 60,
  });
  if (error) throw new Error(error.message);
  const rows = (data as FreqRow[] | null) ?? [];
  return rows.map((r) => ({
    supplierProductId: r.supplier_product_id,
    orderCount: Number(r.order_count ?? 0),
  }));
}

export async function fetchCatalogSignals(
  supabase: SupabaseClient | null,
  localId: string | null,
  supplierId: string | null,
): Promise<CatalogSignals> {
  if (!localId || !supplierId || isDemoMode() || !supabase) {
    return EMPTY_CATALOG_SIGNALS;
  }
  try {
    const [last, freq] = await Promise.all([
      fetchLastReceptionContext(supabase, localId, supplierId),
      fetchOrderFrequency30d(supabase, localId, supplierId),
    ]);
    return {
      lastReceptionByProductId: last.byId,
      recentProductIds: last.recentIds,
      mostOrdered30d: freq,
    };
  } catch {
    return EMPTY_CATALOG_SIGNALS;
  }
}
