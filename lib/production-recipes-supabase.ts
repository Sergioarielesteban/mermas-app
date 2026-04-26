import type { SupabaseClient } from '@supabase/supabase-js';
import type { CcPreparationUnit } from '@/lib/cocina-central-supabase';
import {
  ccInsertProductionOrder,
  ccReplaceProductionOrderLines,
} from '@/lib/cocina-central-supabase';
import { fetchPurchaseArticleCostHintsByIds, fetchPurchaseArticles, type PurchaseArticle } from '@/lib/purchase-articles-supabase';
import { unitsMatchForIngredientCost } from '@/lib/escandallo-ingredient-units';
import { mapLabelToCcPreparationUnit } from '@/lib/cocina-central-units';
import { syncInternalRecipeToCentralPreparations } from '@/lib/internal-production-recipe-sync';

export type ProductionRecipeRow = {
  id: string;
  local_central_id: string;
  name: string;
  final_unit: string;
  base_yield_quantity: number;
  base_yield_unit: string;
  default_expiry_days: number | null;
  is_active: boolean;
  restricted_visibility: boolean;
  output_preparation_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductionRecipeLineRow = {
  id: string;
  production_recipe_id: string;
  article_id: string;
  ingredient_name_snapshot: string;
  quantity: number;
  unit: string;
  sort_order: number;
  created_at: string;
};

const RECIPE_SEL =
  'id,local_central_id,name,final_unit,base_yield_quantity,base_yield_unit,default_expiry_days,is_active,restricted_visibility,output_preparation_id,created_by,created_at,updated_at';

const LINE_SEL =
  'id,production_recipe_id,article_id,ingredient_name_snapshot,quantity,unit,sort_order,created_at';

export async function prListActiveRecipes(
  supabase: SupabaseClient,
  localCentralId: string,
): Promise<ProductionRecipeRow[]> {
  const { data, error } = await supabase
    .from('production_recipes')
    .select(RECIPE_SEL)
    .eq('local_central_id', localCentralId)
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductionRecipeRow[];
}

export async function prListAllRecipes(
  supabase: SupabaseClient,
  localCentralId: string,
): Promise<ProductionRecipeRow[]> {
  const { data, error } = await supabase
    .from('production_recipes')
    .select(RECIPE_SEL)
    .eq('local_central_id', localCentralId)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductionRecipeRow[];
}

export async function prGetRecipe(
  supabase: SupabaseClient,
  id: string,
  localCentralId: string,
): Promise<ProductionRecipeRow | null> {
  const { data, error } = await supabase
    .from('production_recipes')
    .select(RECIPE_SEL)
    .eq('id', id)
    .eq('local_central_id', localCentralId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as ProductionRecipeRow | null;
}

export async function prGetRecipeLines(
  supabase: SupabaseClient,
  recipeId: string,
): Promise<ProductionRecipeLineRow[]> {
  const { data, error } = await supabase
    .from('production_recipe_lines')
    .select(LINE_SEL)
    .eq('production_recipe_id', recipeId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductionRecipeLineRow[];
}

export async function prInsertRecipe(
  supabase: SupabaseClient,
  row: {
    local_central_id: string;
    name: string;
    final_unit: string;
    base_yield_quantity: number;
    base_yield_unit: string;
    default_expiry_days: number | null;
    is_active?: boolean;
    restricted_visibility?: boolean;
    created_by?: string | null;
  },
): Promise<ProductionRecipeRow> {
  const { data, error } = await supabase
    .from('production_recipes')
    .insert({
      local_central_id: row.local_central_id,
      name: row.name.trim(),
      final_unit: row.final_unit.trim(),
      base_yield_quantity: row.base_yield_quantity,
      base_yield_unit: row.base_yield_unit.trim(),
      default_expiry_days: row.default_expiry_days,
      is_active: row.is_active ?? true,
      restricted_visibility: row.restricted_visibility ?? true,
      created_by: row.created_by ?? null,
    })
    .select(RECIPE_SEL)
    .single();
  if (error) throw new Error(error.message);
  return data as ProductionRecipeRow;
}

export async function prUpdateRecipe(
  supabase: SupabaseClient,
  id: string,
  localCentralId: string,
  patch: Partial<{
    name: string;
    final_unit: string;
    base_yield_quantity: number;
    base_yield_unit: string;
    default_expiry_days: number | null;
    is_active: boolean;
    restricted_visibility: boolean;
    output_preparation_id: string | null;
  }>,
): Promise<void> {
  const { error } = await supabase
    .from('production_recipes')
    .update(patch)
    .eq('id', id)
    .eq('local_central_id', localCentralId);
  if (error) throw new Error(error.message);
}

export async function prReplaceLines(
  supabase: SupabaseClient,
  recipeId: string,
  lines: Array<{
    article_id: string;
    ingredient_name_snapshot: string;
    quantity: number;
    unit: string;
    sort_order?: number;
  }>,
): Promise<void> {
  const { error: delE } = await supabase
    .from('production_recipe_lines')
    .delete()
    .eq('production_recipe_id', recipeId);
  if (delE) throw new Error(delE.message);
  if (lines.length === 0) return;
  const payload = lines.map((l, i) => ({
    production_recipe_id: recipeId,
    article_id: l.article_id,
    ingredient_name_snapshot: l.ingredient_name_snapshot,
    quantity: l.quantity,
    unit: l.unit,
    sort_order: l.sort_order ?? i,
  }));
  const { error } = await supabase.from('production_recipe_lines').insert(payload);
  if (error) throw new Error(error.message);
}

/**
 * Crea una orden de producción a partir de una receta interna: sincroniza elaboraciones, escala
 * cantidades y costes (Artículos Máster al vuelo).
 */
export async function prCreateOrderFromInternalRecipe(
  supabase: SupabaseClient,
  args: {
    localCentralId: string;
    userId: string | null;
    productionRecipeId: string;
    targetQuantity: number;
    fecha: string;
    notes?: string | null;
  },
): Promise<string> {
  const { localCentralId, userId, productionRecipeId, targetQuantity, fecha, notes } = args;
  const recipe = await prGetRecipe(supabase, productionRecipeId, localCentralId);
  if (!recipe) throw new Error('Receta interna no encontrada.');
  if (!recipe.is_active) throw new Error('Receta inactiva.');
  const lines = await prGetRecipeLines(supabase, productionRecipeId);
  if (lines.length === 0) throw new Error('Añade ingredientes a la receta (Artículos Máster).');

  const articles = await fetchPurchaseArticles(supabase, localCentralId);
  const byId = new Map(articles.map((a) => [a.id, a]));
  const { outputPreparationId, articleToPrep } = await syncInternalRecipeToCentralPreparations(
    supabase,
    localCentralId,
    recipe,
    lines,
    byId,
  );

  const yq = Number(recipe.base_yield_quantity);
  if (!Number.isFinite(yq) || yq <= 0) throw new Error('Rendimiento base inválido en la receta.');
  const factor = targetQuantity / yq;
  if (!Number.isFinite(factor) || factor <= 0) throw new Error('Cantidad objetivo inválida.');

  const hints = await fetchPurchaseArticleCostHintsByIds(
    supabase,
    localCentralId,
    lines.map((l) => l.article_id),
  );

  const orderLinePayload: Array<{
    ingredient_preparation_id: string;
    label_snapshot: string;
    theoretical_qty: number;
    unidad: CcPreparationUnit;
    cost_estimated_eur: number | null;
    article_id: string;
    production_recipe_line_id: string;
  }> = [];

  for (const l of lines) {
    const prepId = articleToPrep.get(l.article_id);
    if (!prepId) throw new Error(`Sin elaboración de ingrediente para artículo ${l.article_id}`);
    const theo = Math.round(l.quantity * factor * 10000) / 10000;
    const u = mapLabelToCcPreparationUnit(l.unit) as CcPreparationUnit;
    const art = byId.get(l.article_id);
    const h = hints.get(l.article_id);
    let costEur: number | null = null;
    if (h?.costeUnitarioUso != null && art?.unidadUso) {
      if (unitsMatchForIngredientCost(l.unit, h.unidadUso)) {
        costEur = Math.round(theo * h.costeUnitarioUso * 100) / 100;
      } else {
        costEur = Math.round(l.quantity * factor * h.costeUnitarioUso * 100) / 100;
      }
    }
    orderLinePayload.push({
      ingredient_preparation_id: prepId,
      label_snapshot: l.ingredient_name_snapshot,
      theoretical_qty: theo,
      unidad: u,
      cost_estimated_eur: costEur,
      article_id: l.article_id,
      production_recipe_line_id: l.id,
    });
  }

  const orderId = await ccInsertProductionOrder(supabase, {
    preparation_id: outputPreparationId,
    local_central_id: localCentralId,
    fecha,
    cantidad_objetivo: targetQuantity,
    estado: 'borrador',
    created_by: userId,
    notes: notes?.trim() || null,
    production_recipe_id: productionRecipeId,
  });

  await ccReplaceProductionOrderLines(
    supabase,
    orderId,
    orderLinePayload.map((x) => ({
      ingredient_preparation_id: x.ingredient_preparation_id,
      label_snapshot: x.label_snapshot,
      theoretical_qty: x.theoretical_qty,
      unidad: x.unidad,
      cost_estimated_eur: x.cost_estimated_eur,
      article_id: x.article_id,
      production_recipe_line_id: x.production_recipe_line_id,
    })),
  );

  return orderId;
}
