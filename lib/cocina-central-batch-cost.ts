import type { SupabaseClient } from '@supabase/supabase-js';
import { unitsMatchForIngredientCost } from '@/lib/escandallo-ingredient-units';
import { fetchPurchaseArticleCostHintsByIds } from '@/lib/purchase-articles-supabase';
import type { IngredientTraceRow, ProductionBatchRow } from '@/lib/cocina-central-supabase';

export type BatchIngredientLineCost = {
  id: string;
  label: string;
  cantidad: number;
  unidad: string;
  lineCostEur: number | null;
  /** Código legible: coste faltante */
  costAvailable: boolean;
};

export type BatchProductionCostResult = {
  lines: BatchIngredientLineCost[];
  totalIngredientsEur: number | null;
  /** coste total / cantidad producida lote */
  costPerOutputUnit: number | null;
  costPerOutputLabel: string;
  cantidadProducida: number;
  unidadLote: string;
  sumOrderEstimated: number | null;
  sumOrderReal: number | null;
  /** Diferencia: coste real en orden vs coste sumado (máster en trazabilidad) */
  diffRealVsCalculated: number | null;
  /** Diferencia: coste real teórico en líneas vs coste real si ambas sumas en orden */
  diffOrderTheoreticalVsReal: number | null;
};

function prepName(r: IngredientTraceRow): string {
  const p = r.central_preparations;
  const n = Array.isArray(p) ? p[0]?.nombre : p?.nombre;
  if (n) return n.trim();
  const pr = r.products;
  const pn = Array.isArray(pr) ? pr[0]?.name : pr?.name;
  return pn?.trim() ?? 'Ingrediente';
}

function purchaseArticleIdFromTrace(r: IngredientTraceRow): string | null {
  const p = r.central_preparations;
  if (Array.isArray(p)) {
    const id = p[0]?.purchase_article_id;
    return id != null && id !== '' ? String(id) : null;
  }
  const id = p && 'purchase_article_id' in p ? (p as { purchase_article_id?: string | null }).purchase_article_id : null;
  return id != null && id !== '' ? String(id) : null;
}

/**
 * coste_ingrediente = cantidad × coste unitario artículo máster (unidad de uso alineada).
 */
export async function computeBatchProductionCost(
  supabase: SupabaseClient,
  localCentralId: string,
  batch: ProductionBatchRow,
  trace: IngredientTraceRow[],
): Promise<BatchProductionCostResult> {
  const articleIds = [...new Set(trace.map(purchaseArticleIdFromTrace).filter(Boolean))] as string[];
  const hints = await fetchPurchaseArticleCostHintsByIds(supabase, localCentralId, articleIds);

  const lines: BatchIngredientLineCost[] = trace.map((r) => {
    const label = prepName(r).toUpperCase();
    const articleId = purchaseArticleIdFromTrace(r);
    const unidad = String(r.unidad);
    const cantidad = Number(r.cantidad);
    let lineCostEur: number | null = null;
    if (articleId) {
      const h = hints.get(articleId);
      if (h?.costeUnitarioUso != null && h.unidadUso) {
        if (unitsMatchForIngredientCost(unidad, h.unidadUso)) {
          lineCostEur = Math.round(cantidad * h.costeUnitarioUso * 100) / 100;
        } else {
          lineCostEur = Math.round(cantidad * h.costeUnitarioUso * 100) / 100;
        }
      }
    }
    return {
      id: r.id,
      label,
      cantidad,
      unidad,
      lineCostEur,
      costAvailable: lineCostEur != null,
    };
  });

  const validLines = lines.filter((l) => l.lineCostEur != null);
  const totalIngredientsEur =
    validLines.length > 0
      ? Math.round(validLines.reduce((a, b) => a + (b.lineCostEur ?? 0), 0) * 100) / 100
      : null;

  const q = batch.cantidad_producida;
  const u = batch.unidad;
  const costPerOutputLabel =
    u === 'litros' ? 'L' : u === 'unidades' ? 'ud' : u === 'racion' ? 'ración' : u === 'bolsa' ? 'bolsa' : u;
  const costPerOutputUnit =
    totalIngredientsEur != null && Number.isFinite(q) && q > 0
      ? Math.round((totalIngredientsEur / q) * 10000) / 10000
      : null;

  let sumOrderEstimated: number | null = null;
  let sumOrderReal: number | null = null;
  if (batch.production_order_id) {
    const { data, error } = await supabase
      .from('production_order_lines')
      .select('cost_estimated_eur, cost_real_eur')
      .eq('production_order_id', batch.production_order_id);
    if (!error && data?.length) {
      let e = 0;
      let r = 0;
      let he = false;
      let hr = false;
      for (const row of data) {
        if (row.cost_estimated_eur != null) {
          he = true;
          e += Number(row.cost_estimated_eur);
        }
        if (row.cost_real_eur != null) {
          hr = true;
          r += Number(row.cost_real_eur);
        }
      }
      sumOrderEstimated = he ? Math.round(e * 100) / 100 : null;
      sumOrderReal = hr ? Math.round(r * 100) / 100 : null;
    }
  }

  let diffRealVsCalculated: number | null = null;
  if (sumOrderReal != null && totalIngredientsEur != null) {
    diffRealVsCalculated = Math.round((sumOrderReal - totalIngredientsEur) * 100) / 100;
  }

  let diffOrderTheoreticalVsReal: number | null = null;
  if (sumOrderEstimated != null && sumOrderReal != null) {
    diffOrderTheoreticalVsReal = Math.round((sumOrderReal - sumOrderEstimated) * 100) / 100;
  }

  return {
    lines,
    totalIngredientsEur,
    costPerOutputUnit,
    costPerOutputLabel,
    cantidadProducida: q,
    unidadLote: u,
    sumOrderEstimated,
    sumOrderReal,
    diffRealVsCalculated,
    diffOrderTheoreticalVsReal,
  };
}
