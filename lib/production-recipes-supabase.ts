import type { SupabaseClient } from '@supabase/supabase-js';
import type { CcPreparationUnit } from '@/lib/cocina-central-supabase';
import {
  ccInsertProductionOrder,
  ccReplaceProductionOrderLines,
} from '@/lib/cocina-central-supabase';
import { fetchPurchaseArticles, type PurchaseArticle } from '@/lib/purchase-articles-supabase';
import { fetchArticleOperationalCostHintsByIds } from '@/lib/article-operational-cost';
import { unitsMatchForIngredientCost } from '@/lib/escandallo-ingredient-units';
import { mapLabelToCcPreparationUnit } from '@/lib/cocina-central-units';
import { syncInternalRecipeToCentralPreparations, type SyncProductionRecipeLineInput } from '@/lib/internal-production-recipe-sync';
import {
  flattenProductionRecipeLinesForOrder,
  mergeFlattenedOrderLines,
} from '@/lib/production-recipe-cost';

export type ProductionRecipeCategory = 'salsa' | 'base' | 'elaborado' | 'postre' | 'otro';

export type ProductionRecipeLineKind = 'articulo_master' | 'receta_cc_interna' | 'manual';

export type ProductionRecipeRow = {
  id: string;
  local_central_id: string;
  name: string;
  recipe_category?: ProductionRecipeCategory | string;
  operative_format_label?: string | null;
  procedure_notes?: string | null;
  final_unit: string;
  base_yield_quantity: number;
  base_yield_unit: string;
  /** Kg de salida para el bloque "rendimiento base" (p. ej. 4 para 1 bolsa de receta base). */
  weight_kg_per_base_yield?: number | null;
  /** Prefijo de código de lote (p. ej. SALBRAVA). */
  lot_code_prefix?: string | null;
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
  line_kind?: ProductionRecipeLineKind | string;
  article_id: string | null;
  nested_production_recipe_id?: string | null;
  manual_unit_cost_eur?: number | null;
  ingredient_name_snapshot: string;
  quantity: number;
  unit: string;
  sort_order: number;
  created_at: string;
};

const RECIPE_SEL =
  'id,local_central_id,name,recipe_category,operative_format_label,procedure_notes,final_unit,base_yield_quantity,base_yield_unit,weight_kg_per_base_yield,lot_code_prefix,default_expiry_days,is_active,restricted_visibility,output_preparation_id,created_by,created_at,updated_at';

const LINE_SEL =
  'id,production_recipe_id,line_kind,article_id,nested_production_recipe_id,manual_unit_cost_eur,ingredient_name_snapshot,quantity,unit,sort_order,created_at';

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
    recipe_category?: ProductionRecipeCategory | string;
    operative_format_label?: string | null;
    procedure_notes?: string | null;
    final_unit: string;
    base_yield_quantity: number;
    base_yield_unit: string;
    weight_kg_per_base_yield?: number | null;
    lot_code_prefix?: string | null;
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
      recipe_category: row.recipe_category ?? 'otro',
      operative_format_label: row.operative_format_label?.trim() ? row.operative_format_label.trim() : null,
      procedure_notes: row.procedure_notes?.trim() ? row.procedure_notes.trim() : null,
      final_unit: row.final_unit.trim(),
      base_yield_quantity: row.base_yield_quantity,
      base_yield_unit: row.base_yield_unit.trim(),
      weight_kg_per_base_yield: row.weight_kg_per_base_yield ?? null,
      lot_code_prefix: row.lot_code_prefix?.trim() ? row.lot_code_prefix.trim() : null,
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
    recipe_category: ProductionRecipeCategory | string;
    operative_format_label: string | null;
    procedure_notes: string | null;
    final_unit: string;
    base_yield_quantity: number;
    base_yield_unit: string;
    weight_kg_per_base_yield: number | null;
    lot_code_prefix: string | null;
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
    line_kind?: ProductionRecipeLineKind;
    article_id?: string | null;
    nested_production_recipe_id?: string | null;
    manual_unit_cost_eur?: number | null;
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
  const payload = lines.map((l, i) => {
    const kind = l.line_kind ?? 'articulo_master';
    const row: Record<string, unknown> = {
      production_recipe_id: recipeId,
      line_kind: kind,
      ingredient_name_snapshot: l.ingredient_name_snapshot,
      quantity: l.quantity,
      unit: l.unit,
      sort_order: l.sort_order ?? i,
    };
    if (kind === 'articulo_master') {
      row.article_id = l.article_id ?? null;
      row.nested_production_recipe_id = null;
      row.manual_unit_cost_eur = null;
    } else if (kind === 'receta_cc_interna') {
      row.article_id = null;
      row.nested_production_recipe_id = l.nested_production_recipe_id ?? null;
      row.manual_unit_cost_eur = null;
    } else {
      row.article_id = null;
      row.nested_production_recipe_id = null;
      row.manual_unit_cost_eur = l.manual_unit_cost_eur ?? null;
    }
    return row;
  });
  const { error } = await supabase.from('production_recipe_lines').insert(payload);
  if (error) throw new Error(error.message);
}

/** Duplica una receta CC y sus líneas (copia independiente). */
export async function prDuplicateRecipe(
  supabase: SupabaseClient,
  localCentralId: string,
  sourceRecipeId: string,
  createdBy: string | null,
): Promise<ProductionRecipeRow> {
  const src = await prGetRecipe(supabase, sourceRecipeId, localCentralId);
  if (!src) throw new Error('Receta origen no encontrada.');
  const srcLines = await prGetRecipeLines(supabase, sourceRecipeId);
  const baseName = `${src.name.trim()} (copia)`;
  const created = await prInsertRecipe(supabase, {
    local_central_id: localCentralId,
    name: baseName,
    recipe_category: src.recipe_category ?? 'otro',
    operative_format_label: src.operative_format_label ?? null,
    procedure_notes: src.procedure_notes ?? null,
    final_unit: src.final_unit,
    base_yield_quantity: src.base_yield_quantity,
    base_yield_unit: src.base_yield_unit,
    weight_kg_per_base_yield: src.weight_kg_per_base_yield ?? null,
    lot_code_prefix: src.lot_code_prefix ? `${src.lot_code_prefix}CP` : null,
    default_expiry_days: src.default_expiry_days,
    is_active: src.is_active,
    restricted_visibility: src.restricted_visibility,
    created_by: createdBy,
  });
  const mapped = srcLines.map((l, i) => {
    const kind = (l.line_kind ?? 'articulo_master') as ProductionRecipeLineKind;
    if (kind === 'articulo_master') {
      return {
        line_kind: 'articulo_master' as const,
        article_id: l.article_id ?? '',
        ingredient_name_snapshot: l.ingredient_name_snapshot,
        quantity: l.quantity,
        unit: l.unit,
        sort_order: i,
      };
    }
    if (kind === 'receta_cc_interna') {
      return {
        line_kind: 'receta_cc_interna' as const,
        nested_production_recipe_id: l.nested_production_recipe_id ?? '',
        ingredient_name_snapshot: l.ingredient_name_snapshot,
        quantity: l.quantity,
        unit: l.unit,
        sort_order: i,
      };
    }
    return {
      line_kind: 'manual' as const,
      ingredient_name_snapshot: l.ingredient_name_snapshot,
      quantity: l.quantity,
      unit: l.unit,
      manual_unit_cost_eur: l.manual_unit_cost_eur ?? null,
      sort_order: i,
    };
  });
  await prReplaceLines(supabase, created.id, mapped);
  return created;
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

  const yq = Number(recipe.base_yield_quantity);
  if (!Number.isFinite(yq) || yq <= 0) throw new Error('Rendimiento base inválido en la receta.');
  if (!Number.isFinite(targetQuantity) || targetQuantity <= 0) throw new Error('Cantidad objetivo inválida.');

  const batchFlat = mergeFlattenedOrderLines(
    await flattenProductionRecipeLinesForOrder(supabase, localCentralId, productionRecipeId, yq),
  );
  if (batchFlat.length === 0) {
    throw new Error(
      'Para generar la orden hace falta al menos un ingrediente desde Artículos Máster (las líneas solo manuales no consumen stock automático).',
    );
  }

  const syncLines: SyncProductionRecipeLineInput[] = batchFlat.map((x, i) => ({
    id: `flat-${i}`,
    article_id: x.article_id,
    ingredient_name_snapshot: x.ingredient_name_snapshot,
    quantity: x.quantity,
    unit: x.unit,
  }));

  const articles = await fetchPurchaseArticles(supabase, localCentralId);
  const byId = new Map(articles.map((a) => [a.id, a]));
  const { outputPreparationId, articleToPrep } = await syncInternalRecipeToCentralPreparations(
    supabase,
    localCentralId,
    recipe,
    syncLines,
    byId,
  );

  const orderFlat = mergeFlattenedOrderLines(
    await flattenProductionRecipeLinesForOrder(supabase, localCentralId, productionRecipeId, targetQuantity),
  );
  if (orderFlat.length === 0) {
    throw new Error('No se pudieron calcular líneas de consumo para esta orden.');
  }

  const hints = await fetchArticleOperationalCostHintsByIds(
    supabase,
    localCentralId,
    orderFlat.map((l) => l.article_id),
  );

  const orderLinePayload: Array<{
    ingredient_preparation_id: string;
    label_snapshot: string;
    theoretical_qty: number;
    unidad: CcPreparationUnit;
    cost_estimated_eur: number | null;
    article_id: string;
    production_recipe_line_id: string | null;
  }> = [];

  for (const l of orderFlat) {
    const prepId = articleToPrep.get(l.article_id);
    if (!prepId) throw new Error(`Sin elaboración de ingrediente para artículo ${l.article_id}`);
    const theo = Math.round(l.quantity * 10000) / 10000;
    const u = mapLabelToCcPreparationUnit(l.unit) as CcPreparationUnit;
    const art = byId.get(l.article_id);
    const h = hints.get(l.article_id);
    let costEur: number | null = null;
    if (h?.costPerUsageUnit != null && art?.unidadUso) {
      if (h.unidadUso && unitsMatchForIngredientCost(l.unit, h.unidadUso)) {
        costEur = Math.round(theo * h.costPerUsageUnit * 100) / 100;
      } else {
        costEur = Math.round(theo * h.costPerUsageUnit * 100) / 100;
      }
    }
    orderLinePayload.push({
      ingredient_preparation_id: prepId,
      label_snapshot: l.ingredient_name_snapshot,
      theoretical_qty: theo,
      unidad: u,
      cost_estimated_eur: costEur,
      article_id: l.article_id,
      production_recipe_line_id: null,
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
