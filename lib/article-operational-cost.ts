import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeWeightedAvgBySupplierProductId,
  ESCANDALLOS_WEIGHTED_PRICE_WINDOW_DAYS,
} from '@/lib/escandallos-weighted-purchase-prices';
import { resolveOperationalPrice, type OperationalPriceSource } from '@/lib/operational-price';
import { fetchOrders } from '@/lib/pedidos-supabase';
import { fetchPurchaseArticleCostHintsByIds, fetchPurchaseArticles } from '@/lib/purchase-articles-supabase';

type SupplierProductRow = {
  id: string;
  article_id: string | null;
  price_per_unit: number | null;
};

export type ArticleOperationalCostHint = {
  costPerUsageUnit: number | null;
  unidadUso: string | null;
  source: OperationalPriceSource;
};

function valid(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v) && v > 0;
}

function toUsageUnitCost(pricePerPurchaseUnit: number | null, unitsUsoPorCompra: number | null, rendimientoPct: number | null): number | null {
  if (!valid(pricePerPurchaseUnit)) return null;
  if (!valid(unitsUsoPorCompra)) return null;
  const r = valid(rendimientoPct) ? rendimientoPct / 100 : 1;
  if (!Number.isFinite(r) || r <= 0) return null;
  const usageQty = unitsUsoPorCompra * r;
  if (!Number.isFinite(usageQty) || usageQty <= 0) return null;
  return Math.round((pricePerPurchaseUnit / usageQty) * 1000000) / 1000000;
}

/**
 * Coste operativo de Artículo Máster con prioridad:
 * pmp (sobre referencia principal) > último precio proveedor > coste_unitario_uso (artículo) > sin precio.
 */
export async function fetchArticleOperationalCostHintsByIds(
  supabase: SupabaseClient,
  localId: string,
  articleIds: string[],
): Promise<Map<string, ArticleOperationalCostHint>> {
  const out = new Map<string, ArticleOperationalCostHint>();
  const ids = [...new Set(articleIds)].filter(Boolean);
  if (!ids.length) return out;

  const [articlesAll, masterHints, orders] = await Promise.all([
    fetchPurchaseArticles(supabase, localId),
    fetchPurchaseArticleCostHintsByIds(supabase, localId, ids),
    fetchOrders(supabase, localId, { recentDays: 120 }),
  ]);
  const articles = articlesAll.filter((a) => ids.includes(a.id));
  const refProductIds = articles
    .map((a) => a.referenciaPrincipalSupplierProductId)
    .filter((x): x is string => Boolean(x));

  let supplierRows: SupplierProductRow[] = [];
  if (refProductIds.length) {
    const { data } = await supabase
      .from('pedido_supplier_products')
      .select('id,article_id,price_per_unit')
      .eq('local_id', localId)
      .in('id', refProductIds);
    supplierRows = (data ?? []) as SupplierProductRow[];
  }
  const supplierById = new Map(supplierRows.map((r) => [r.id, r]));

  const weighted = computeWeightedAvgBySupplierProductId(
    orders.filter((o) => o.status !== 'draft'),
    ESCANDALLOS_WEIGHTED_PRICE_WINDOW_DAYS,
  );

  for (const a of articles) {
    const master = masterHints.get(a.id);
    if (a.origenArticulo === 'cocina_central') {
      const cu = master?.costeUnitarioUso ?? null;
      out.set(a.id, {
        costPerUsageUnit: cu != null && Number.isFinite(cu) && cu > 0 ? cu : null,
        unidadUso: (master?.unidadUso ?? a.unidadUso ?? null)?.trim() || null,
        source: 'articulo_master',
      });
      continue;
    }
    const refId = a.referenciaPrincipalSupplierProductId ?? null;
    const sp = refId ? supplierById.get(refId) : undefined;
    const weightedPurchase = refId ? weighted.get(refId)?.weightedAvg ?? null : null;
    const pmpUsage = toUsageUnitCost(weightedPurchase, a.unidadesUsoPorUnidadCompra, a.rendimientoPct);
    const lastUsage = toUsageUnitCost(sp?.price_per_unit ?? null, a.unidadesUsoPorUnidadCompra, a.rendimientoPct);
    const masterUsage = master?.costeUnitarioUso ?? null;
    const resolved = resolveOperationalPrice({
      pmpPrice: pmpUsage,
      supplierLastPrice: lastUsage,
      articleMasterPrice: masterUsage,
    });
    out.set(a.id, {
      costPerUsageUnit: resolved.price,
      unidadUso: (master?.unidadUso ?? a.unidadUso ?? null)?.trim() || null,
      source: resolved.source,
    });
  }

  return out;
}
