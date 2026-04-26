/**
 * Sincroniza recetas internas de producción con `central_preparations` (salida e ingredientes)
 * para reutilizar el RPC de registro de lotes. No toca escandallos.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CcPreparationUnit } from '@/lib/cocina-central-supabase';
import {
  ccInsertPreparation,
  ccReplacePreparationIngredients,
  ccUpdateCentralPreparation,
} from '@/lib/cocina-central-supabase';
import { mapLabelToCcPreparationUnit } from '@/lib/cocina-central-units';
import type { PurchaseArticle } from '@/lib/purchase-articles-supabase';

export type SyncProductionRecipeInput = {
  id: string;
  name: string;
  final_unit: string;
  base_yield_quantity: number;
  default_expiry_days: number | null;
  is_active: boolean;
  output_preparation_id: string | null;
};

export type SyncProductionRecipeLineInput = {
  id: string;
  article_id: string;
  quantity: number;
  unit: string;
  ingredient_name_snapshot: string;
};

function lineUnitToPreparationBase(u: string): CcPreparationUnit {
  return mapLabelToCcPreparationUnit(u);
}

function finalUnitStringToPreparationBase(u: string): CcPreparationUnit {
  return mapLabelToCcPreparationUnit(u);
}

async function ensureIngredientPrepForArticle(
  supabase: SupabaseClient,
  localCentralId: string,
  article: PurchaseArticle,
): Promise<string> {
  const { data: found } = await supabase
    .from('central_preparations')
    .select('id')
    .eq('local_central_id', localCentralId)
    .eq('purchase_article_id', article.id)
    .maybeSingle();
  if (found?.id) return found.id as string;

  const uBase = lineUnitToPreparationBase(article.unidadUso ?? 'ud');
  const created = await ccInsertPreparation(supabase, {
    local_central_id: localCentralId,
    nombre: `${article.nombre} (art. máster)`,
    categoria: 'Ingrediente (art. máster)',
    unidad_base: uBase,
    descripcion: 'Generado para producción central; artículo máster de solo lectura.',
    activo: true,
    purchase_article_id: article.id,
  });
  return created.id;
}

export async function syncInternalRecipeToCentralPreparations(
  supabase: SupabaseClient,
  localCentralId: string,
  recipe: SyncProductionRecipeInput,
  lines: SyncProductionRecipeLineInput[],
  articlesById: Map<string, PurchaseArticle>,
): Promise<{ outputPreparationId: string; articleToPrep: Map<string, string> }> {
  const outUnidad = finalUnitStringToPreparationBase(recipe.final_unit);

  let outputId = recipe.output_preparation_id;
  if (outputId) {
    await ccUpdateCentralPreparation(supabase, outputId, {
      nombre: recipe.name,
      unidad_base: outUnidad,
      rendimiento: recipe.base_yield_quantity,
      caducidad_dias: recipe.default_expiry_days ?? null,
    });
  } else {
    const { data: byRecipe } = await supabase
      .from('central_preparations')
      .select('id')
      .eq('local_central_id', localCentralId)
      .eq('production_recipe_id', recipe.id)
      .maybeSingle();
    if (byRecipe?.id) {
      outputId = byRecipe.id as string;
    }
  }

  if (!outputId) {
    const pre = await ccInsertPreparation(supabase, {
      local_central_id: localCentralId,
      nombre: recipe.name,
      categoria: 'Receta interna producción',
      unidad_base: outUnidad,
      rendimiento: recipe.base_yield_quantity,
      caducidad_dias: recipe.default_expiry_days ?? null,
      descripcion: 'Salida de receta interna (cocina central).',
      activo: recipe.is_active,
      production_recipe_id: recipe.id,
    });
    outputId = pre.id;
    const { error: upErr } = await supabase
      .from('production_recipes')
      .update({ output_preparation_id: outputId })
      .eq('id', recipe.id);
    if (upErr) throw new Error(upErr.message);
  } else {
    await supabase
      .from('central_preparations')
      .update({ production_recipe_id: recipe.id, activo: recipe.is_active })
      .eq('id', outputId);
  }

  const articleToPrep = new Map<string, string>();
  const withPreps: Array<{ prepId: string; qty: number; unidad: CcPreparationUnit }> = [];

  for (const line of lines) {
    const art = articlesById.get(line.article_id);
    if (!art) throw new Error(`Artículo máster no encontrado: ${line.article_id}`);
    const prepId = await ensureIngredientPrepForArticle(supabase, localCentralId, art);
    articleToPrep.set(line.article_id, prepId);
    withPreps.push({
      prepId,
      qty: line.quantity,
      unidad: lineUnitToPreparationBase(line.unit),
    });
  }

  const forReplace = withPreps.map((x) => ({
    ingredient_preparation_id: x.prepId,
    cantidad: x.qty,
    unidad: x.unidad,
  }));
  await ccReplacePreparationIngredients(supabase, outputId, forReplace);

  return { outputPreparationId: outputId, articleToPrep };
}
