/**
 * Artículos Máster de salida para fórmulas internas de Cocina Central:
 * sincroniza nombre, unidad de uso y coste (sin exponer ingredientes en purchase_articles).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchArticleOperationalCostHintsByIds } from '@/lib/article-operational-cost';
import { unitsMatchForIngredientCost } from '@/lib/escandallo-ingredient-units';
import { prGetRecipe, prGetRecipeLines } from '@/lib/production-recipes-supabase';
import { fetchPurchaseArticles, type PurchaseArticle } from '@/lib/purchase-articles-supabase';

export function filterArticlesForInternalRecipeIngredients(articles: readonly PurchaseArticle[]): PurchaseArticle[] {
  return articles.filter((a) => a.origenArticulo !== 'cocina_central');
}

function mapFinalUnitToUnidadBase(finalUnit: string): string | null {
  const raw = finalUnit.trim().toLowerCase();
  if (['kg', 'ud', 'bolsa', 'caja', 'paquete', 'bandeja'].includes(raw)) return raw;
  if (raw === 'ración' || raw === 'racion' || raw === 'porción' || raw === 'porcion') return 'racion';
  return null;
}

function roundCost8(n: number): number {
  return Math.round(n * 100000000) / 100000000;
}

function ingredientLineCostEur(input: {
  lineQty: number;
  lineUnit: string;
  article: PurchaseArticle | undefined;
  costPerUsageUnit: number | null;
  hintUnidadUso: string | null;
}): number {
  const { lineQty, lineUnit, article, costPerUsageUnit, hintUnidadUso } = input;
  if (costPerUsageUnit == null || !Number.isFinite(costPerUsageUnit) || costPerUsageUnit <= 0) return 0;
  if (!article?.unidadUso?.trim()) return 0;
  const theo = Math.round(lineQty * 10000) / 10000;
  if (hintUnidadUso && unitsMatchForIngredientCost(lineUnit, hintUnidadUso)) {
    return Math.round(theo * costPerUsageUnit * 100) / 100;
  }
  return Math.round(lineQty * costPerUsageUnit * 100) / 100;
}

/**
 * Recalcula y guarda el artículo máster enlazado a la fórmula (crea la fila si no existe).
 */
export async function syncPurchaseArticleFromProductionRecipe(
  supabase: SupabaseClient,
  localCentralId: string,
  productionRecipeId: string,
): Promise<void> {
  const recipe = await prGetRecipe(supabase, productionRecipeId, localCentralId);
  if (!recipe) throw new Error('Fórmula de producción no encontrada.');
  const lines = await prGetRecipeLines(supabase, productionRecipeId);
  const yq = Number(recipe.base_yield_quantity);
  if (!Number.isFinite(yq) || yq <= 0) throw new Error('Rendimiento base inválido en la fórmula.');

  const articles = await fetchPurchaseArticles(supabase, localCentralId);
  const byId = new Map(articles.map((a) => [a.id, a]));

  let totalCost = 0;
  if (lines.length > 0) {
    const hints = await fetchArticleOperationalCostHintsByIds(
      supabase,
      localCentralId,
      lines.map((l) => l.article_id),
    );
    for (const l of lines) {
      const art = byId.get(l.article_id);
      const h = hints.get(l.article_id);
      totalCost += ingredientLineCostEur({
        lineQty: l.quantity,
        lineUnit: l.unit,
        article: art,
        costPerUsageUnit: h?.costPerUsageUnit ?? null,
        hintUnidadUso: h?.unidadUso ?? null,
      });
    }
  }

  const costPerOutput =
    lines.length > 0 && totalCost > 0 && Number.isFinite(totalCost) ? roundCost8(totalCost / yq) : null;
  const nowIso = new Date().toISOString();
  const unidadUso = recipe.final_unit.trim();
  const unidadBase = mapFinalUnitToUnidadBase(recipe.final_unit);

  const { data: existing, error: selErr } = await supabase
    .from('purchase_articles')
    .select('id')
    .eq('local_id', localCentralId)
    .eq('central_production_recipe_id', productionRecipeId)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);

  const common = {
    nombre: recipe.name.trim(),
    nombre_corto: recipe.name.trim().length > 48 ? recipe.name.trim().slice(0, 48) : null,
    unidad_base: unidadBase,
    activo: recipe.is_active,
    coste_master: costPerOutput,
    metodo_coste_master: 'cocina_central',
    coste_master_fijado_en: nowIso,
    proveedor_preferido_id: null,
    created_from_supplier_product_id: null,
    observaciones:
      'Producto elaborado en Cocina Central. Coste sincronizado desde fórmula interna; receta no expuesta en Artículos Máster.',
    referencia_principal_supplier_product_id: null,
    unidad_compra: null,
    coste_compra_actual: null,
    iva_compra_pct: null,
    unidad_uso: unidadUso,
    unidades_uso_por_unidad_compra: 1,
    rendimiento_pct: 100,
    coste_unitario_uso: costPerOutput,
    origen_coste: 'cocina_central',
    origen_articulo: 'cocina_central',
    central_production_recipe_id: productionRecipeId,
    central_cost_synced_at: nowIso,
    updated_at: nowIso,
  };

  if (existing?.id) {
    const { error: upErr } = await supabase.from('purchase_articles').update(common).eq('id', existing.id);
    if (upErr) throw new Error(upErr.message);
    return;
  }

  const { error: insErr } = await supabase.from('purchase_articles').insert({
    local_id: localCentralId,
    ...common,
  });
  if (insErr) throw new Error(insErr.message);
}
