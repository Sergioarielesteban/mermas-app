/**
 * Coste €/unidad de yield para escandallos (bases / subrecetas / platos) — solo consumo
 * de funciones ya exportadas en `escandallos-supabase` (no edita recetas).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { sanitizeEscandalloIngredientUnit } from '@/lib/escandallo-ingredient-units';
import {
  effectiveRecipeYieldQtyForCost,
  fetchEscandalloRawProductsWithWeightedPurchasePrices,
  fetchEscandalloRecipes,
  fetchProcessedProductsForEscandallo,
  recipeTotalCostEur,
  type EscandalloLine,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import { roundMoney } from '@/lib/money-format';

type LineRow = {
  id: string;
  local_id: string;
  recipe_id: string;
  source_type: string | null;
  raw_supplier_product_id: string | null;
  processed_product_id: string | null;
  sub_recipe_id: string | null;
  label: string;
  qty: number;
  unit: string;
  manual_price_per_unit: number | null;
  sort_order: number;
  created_at: string;
};

function mapLine(row: LineRow): EscandalloLine {
  const rawSt = row.source_type ?? 'manual';
  const sourceType: EscandalloLine['sourceType'] =
    rawSt === 'raw' || rawSt === 'processed' || rawSt === 'manual' || rawSt === 'subrecipe' ? rawSt : 'manual';
  return {
    id: row.id,
    localId: row.local_id,
    recipeId: row.recipe_id,
    sourceType,
    rawSupplierProductId: row.raw_supplier_product_id,
    processedProductId: row.processed_product_id,
    subRecipeId: row.sub_recipe_id ?? null,
    label: row.label,
    qty: Number(row.qty),
    unit: sanitizeEscandalloIngredientUnit(String(row.unit)),
    manualPricePerUnit:
      row.manual_price_per_unit != null && Number.isFinite(Number(row.manual_price_per_unit))
        ? Number(row.manual_price_per_unit)
        : null,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at,
  };
}

function yieldDivisorForInventoryUnitCost(recipe: EscandalloRecipe): number {
  if (recipe.isSubRecipe) {
    return effectiveRecipeYieldQtyForCost(recipe);
  }
  return recipe.yieldQty > 0 ? recipe.yieldQty : 1;
}

/**
 * Coste teórico por unidad de rendimiento (misma lógica que el editor de escandallo).
 * null si no hay receta o el coste no se puede calcular.
 */
export async function fetchEscandalloRecipeUnitCostEur(
  supabase: SupabaseClient,
  localId: string,
  recipeId: string,
): Promise<{ costPerUnit: number | null; recipeName: string } | null> {
  const [recipes, raws, processed, linesRes] = await Promise.all([
    fetchEscandalloRecipes(supabase, localId),
    fetchEscandalloRawProductsWithWeightedPurchasePrices(supabase, localId),
    fetchProcessedProductsForEscandallo(supabase, localId),
    supabase
      .from('escandallo_recipe_lines')
      .select(
        'id,local_id,recipe_id,source_type,raw_supplier_product_id,processed_product_id,sub_recipe_id,label,qty,unit,manual_price_per_unit,sort_order,created_at',
      )
      .eq('local_id', localId),
  ]);

  if (linesRes.error) throw new Error(linesRes.error.message);

  const recipe = recipes.find((r) => r.id === recipeId);
  if (!recipe) return null;

  const byRecipe: Record<string, EscandalloLine[]> = {};
  for (const raw of (linesRes.data ?? []) as LineRow[]) {
    const L = mapLine(raw);
    const k = L.recipeId;
    if (!byRecipe[k]) byRecipe[k] = [];
    byRecipe[k]!.push(L);
  }
  for (const k of Object.keys(byRecipe)) {
    byRecipe[k]!.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  }

  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  const rawById = new Map(raws.map((r) => [r.id, r]));
  const processedById = new Map(processed.map((p) => [p.id, p]));

  const lines = byRecipe[recipeId] ?? [];
  const total = recipeTotalCostEur(lines, rawById, processedById, {
    linesByRecipe: byRecipe,
    recipesById,
    recipeId: recipe.id,
  });
  const div = yieldDivisorForInventoryUnitCost(recipe);
  if (div <= 0 || !Number.isFinite(total)) {
    return { costPerUnit: null, recipeName: recipe.name };
  }
  const costPerUnit = roundMoney(total / div);
  return { costPerUnit: costPerUnit > 0 ? costPerUnit : null, recipeName: recipe.name };
}
