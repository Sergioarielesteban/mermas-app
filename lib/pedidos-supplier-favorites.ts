import type { SupabaseClient } from '@supabase/supabase-js';
import { isDemoMode } from '@/lib/demo-mode';

/** Favoritos por local + usuario + proveedor (flujo real: pedido siempre por proveedor). */
const DEMO_KEY = (localId: string, supplierId: string, userId: string | null) =>
  `chefone_pedidos_favorites:${localId}:${supplierId}:${userId ?? 'anon'}`;

function readDemoSet(localId: string, userId: string | null, supplierId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(DEMO_KEY(localId, supplierId, userId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x) => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function writeDemoSet(localId: string, userId: string | null, supplierId: string, ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(DEMO_KEY(localId, supplierId, userId), JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

export async function fetchSupplierProductFavoriteIds(
  supabase: SupabaseClient,
  localId: string,
  userId: string,
  supplierId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('supplier_product_favorites')
    .select(
      `
      supplier_product_id,
      pedido_supplier_products!inner(supplier_id)
    `,
    )
    .eq('local_id', localId)
    .eq('user_id', userId)
    .eq('pedido_supplier_products.supplier_id', supplierId);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r: { supplier_product_id: string | null }) => r.supplier_product_id)
    .filter((id): id is string => Boolean(id));
}

export async function fetchSupplierProductFavoriteIdSet(
  supabase: SupabaseClient | null,
  localId: string | null,
  userId: string | null,
  supplierId: string | null,
): Promise<Set<string>> {
  if (!localId || !userId || !supplierId) return new Set();
  if (isDemoMode()) return readDemoSet(localId, userId, supplierId);
  if (!supabase) return new Set();
  try {
    const rows = await fetchSupplierProductFavoriteIds(supabase, localId, userId, supplierId);
    return new Set(rows);
  } catch {
    return new Set();
  }
}

export async function setSupplierProductFavorite(
  supabase: SupabaseClient | null,
  localId: string,
  userId: string,
  supplierId: string,
  supplierProductId: string,
  favorited: boolean,
): Promise<void> {
  if (isDemoMode()) {
    const s = readDemoSet(localId, userId, supplierId);
    if (favorited) s.add(supplierProductId);
    else s.delete(supplierProductId);
    writeDemoSet(localId, userId, supplierId, s);
    return;
  }
  if (!supabase) return;
  if (!favorited) {
    const { error } = await supabase
      .from('supplier_product_favorites')
      .delete()
      .eq('local_id', localId)
      .eq('user_id', userId)
      .eq('supplier_product_id', supplierProductId);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase.from('supplier_product_favorites').insert({
    local_id: localId,
    user_id: userId,
    supplier_product_id: supplierProductId,
  });
  if (error) throw new Error(error.message);
}
