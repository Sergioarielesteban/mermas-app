/**
 * Coste teórico de fórmulas de Cocina Central (production_recipes):
 * artículos máster, subrecetas CC anidadas (recursivo) y líneas manuales.
 * Consultas directas a Supabase para evitar dependencia circular con production-recipes-supabase.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchArticleOperationalCostHintsByIds } from '@/lib/article-operational-cost';
import { unitsMatchForIngredientCost } from '@/lib/escandallo-ingredient-units';
import type { PurchaseArticle } from '@/lib/purchase-articles-supabase';
import { fetchPurchaseArticles } from '@/lib/purchase-articles-supabase';

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

type RecipeYieldRow = {
  base_yield_quantity: number;
};

type LineCostRow = {
  line_kind: string | null;
  article_id: string | null;
  nested_production_recipe_id: string | null;
  manual_unit_cost_eur: number | null;
  quantity: number;
  unit: string;
};

async function fetchRecipeYieldOnly(
  supabase: SupabaseClient,
  recipeId: string,
  localCentralId: string,
): Promise<RecipeYieldRow | null> {
  const { data, error } = await supabase
    .from('production_recipes')
    .select('base_yield_quantity')
    .eq('id', recipeId)
    .eq('local_central_id', localCentralId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as RecipeYieldRow | null;
}

async function fetchRecipeLinesForCost(
  supabase: SupabaseClient,
  recipeId: string,
): Promise<LineCostRow[]> {
  const { data, error } = await supabase
    .from('production_recipe_lines')
    .select(
      'line_kind,article_id,nested_production_recipe_id,manual_unit_cost_eur,quantity,unit',
    )
    .eq('production_recipe_id', recipeId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LineCostRow[];
}

export type CcRecipeCostBreakdown = {
  totalIngredientsEur: number;
  yieldQty: number;
  costPerYieldUnitEur: number | null;
};

/**
 * Coste total ingredientes y €/ud de salida para una receta CC (sin efectos secundarios).
 */
export async function computeProductionRecipeCostBreakdown(
  supabase: SupabaseClient,
  localCentralId: string,
  recipeId: string,
  visitedRecipeIds: ReadonlySet<string> = new Set(),
): Promise<CcRecipeCostBreakdown> {
  if (visitedRecipeIds.has(recipeId)) {
    throw new Error('La receta tiene una referencia circular a otra subreceta interna.');
  }
  const nextVisited = new Set([...visitedRecipeIds, recipeId]);

  const recipe = await fetchRecipeYieldOnly(supabase, recipeId, localCentralId);
  if (!recipe) throw new Error('Receta de Cocina Central no encontrada.');
  const lines = await fetchRecipeLinesForCost(supabase, recipeId);
  const yq = Number(recipe.base_yield_quantity);
  if (!Number.isFinite(yq) || yq <= 0) {
    return { totalIngredientsEur: 0, yieldQty: yq, costPerYieldUnitEur: null };
  }

  const articles = await fetchPurchaseArticles(supabase, localCentralId);
  const byId = new Map(articles.map((a) => [a.id, a]));

  const masterArticleIds = lines
    .filter((l) => (l.line_kind ?? 'articulo_master') === 'articulo_master' && l.article_id)
    .map((l) => l.article_id as string);
  const hints = await fetchArticleOperationalCostHintsByIds(supabase, localCentralId, masterArticleIds);

  let total = 0;
  for (const l of lines) {
    const lk = l.line_kind ?? 'articulo_master';
    if (lk === 'articulo_master') {
      const art = l.article_id ? byId.get(l.article_id) : undefined;
      const h = l.article_id ? hints.get(l.article_id) : undefined;
      total += ingredientLineCostEur({
        lineQty: l.quantity,
        lineUnit: l.unit,
        article: art,
        costPerUsageUnit: h?.costPerUsageUnit ?? null,
        hintUnidadUso: h?.unidadUso ?? null,
      });
    } else if (lk === 'receta_cc_interna' && l.nested_production_recipe_id) {
      const nested = await computeProductionRecipeCostBreakdown(
        supabase,
        localCentralId,
        l.nested_production_recipe_id,
        nextVisited,
      );
      const nestedUnit = nested.costPerYieldUnitEur;
      if (nestedUnit != null && Number.isFinite(nestedUnit) && nestedUnit > 0) {
        total += Math.round(l.quantity * nestedUnit * 100) / 100;
      }
    } else if (lk === 'manual') {
      const u = l.manual_unit_cost_eur != null ? Number(l.manual_unit_cost_eur) : null;
      if (u != null && Number.isFinite(u) && u > 0) {
        total += Math.round(l.quantity * u * 100) / 100;
      }
    }
  }

  const totalIngredientsEur = Math.round(total * 100) / 100;
  const costPerYieldUnitEur =
    totalIngredientsEur > 0 && Number.isFinite(yq) && yq > 0
      ? Math.round((totalIngredientsEur / yq) * 100000000) / 100000000
      : null;

  return {
    totalIngredientsEur,
    yieldQty: yq,
    costPerYieldUnitEur,
  };
}

/** €/ud de salida (misma unidad que base_yield / final_unit). */
export async function fetchProductionRecipeUnitCostEur(
  supabase: SupabaseClient,
  localCentralId: string,
  recipeId: string,
): Promise<number | null> {
  const b = await computeProductionRecipeCostBreakdown(supabase, localCentralId, recipeId);
  return b.costPerYieldUnitEur;
}

export type FlattenedOrderLine = {
  article_id: string;
  ingredient_name_snapshot: string;
  quantity: number;
  unit: string;
  sort_order: number;
};

type LineFlattenRow = LineCostRow & { ingredient_name_snapshot: string };

async function fetchRecipeLinesForFlatten(supabase: SupabaseClient, recipeId: string): Promise<LineFlattenRow[]> {
  const { data, error } = await supabase
    .from('production_recipe_lines')
    .select(
      'line_kind,article_id,nested_production_recipe_id,manual_unit_cost_eur,quantity,unit,ingredient_name_snapshot',
    )
    .eq('production_recipe_id', recipeId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LineFlattenRow[];
}

/**
 * Expande subrecetas CC a líneas de artículo máster para órdenes de producción.
 * `parentOutputQty` = cantidad deseada de salida de esta receta (unidades de rendimiento base).
 */
export async function flattenProductionRecipeLinesForOrder(
  supabase: SupabaseClient,
  localCentralId: string,
  recipeId: string,
  parentOutputQty: number,
  visitedRecipeIds: ReadonlySet<string> = new Set(),
): Promise<FlattenedOrderLine[]> {
  if (visitedRecipeIds.has(recipeId)) {
    throw new Error('Referencia circular entre recetas internas.');
  }
  const nextVisited = new Set([...visitedRecipeIds, recipeId]);

  const recipe = await fetchRecipeYieldOnly(supabase, recipeId, localCentralId);
  if (!recipe) throw new Error('Receta interna no encontrada.');
  const yq = Number(recipe.base_yield_quantity);
  if (!Number.isFinite(yq) || yq <= 0) throw new Error('Rendimiento base inválido.');
  const factor = parentOutputQty / yq;

  const lines = await fetchRecipeLinesForFlatten(supabase, recipeId);
  const out: FlattenedOrderLine[] = [];
  let sortOrder = 0;

  for (const l of lines) {
    const lk = l.line_kind ?? 'articulo_master';
    if (lk === 'articulo_master' && l.article_id) {
      const q = Math.round(l.quantity * factor * 10000) / 10000;
      out.push({
        article_id: l.article_id,
        ingredient_name_snapshot: l.ingredient_name_snapshot,
        quantity: q,
        unit: l.unit.trim(),
        sort_order: sortOrder++,
      });
    } else if (lk === 'receta_cc_interna' && l.nested_production_recipe_id) {
      const nestedOutputQty = l.quantity * factor;
      const nestedLines = await flattenProductionRecipeLinesForOrder(
        supabase,
        localCentralId,
        l.nested_production_recipe_id,
        nestedOutputQty,
        nextVisited,
      );
      for (const nl of nestedLines) {
        out.push({ ...nl, sort_order: sortOrder++ });
      }
    }
  }

  return out;
}

/** Une líneas aplanadas con mismo artículo y misma unidad para sync de elaboraciones. */
export function mergeFlattenedOrderLines(lines: FlattenedOrderLine[]): FlattenedOrderLine[] {
  const map = new Map<string, FlattenedOrderLine>();
  let sortOrder = 0;
  for (const l of lines) {
    const key = `${l.article_id}\u0000${l.unit.trim().toLowerCase()}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...l, sort_order: sortOrder++ });
    } else {
      prev.quantity = Math.round((prev.quantity + l.quantity) * 10000) / 10000;
    }
  }
  return [...map.values()].sort((a, b) => a.sort_order - b.sort_order);
}
