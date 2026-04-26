/**
 * Conecta recetas/escandallo (lectura) con elaboraciones de cocina central.
 * No modifica el módulo de escandallos: solo lee y escribe en `central_preparations` y órdenes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EscandalloLine, EscandalloRecipe } from '@/lib/escandallos-supabase';
import {
  escandalloRecipeUnitForRawProduct,
  fetchEscandalloLines,
  fetchEscandalloRecipes,
  fetchProcessedProductsForEscandallo,
  fetchProductsForEscandallo,
} from '@/lib/escandallos-supabase';
import type { CcPreparationUnit } from '@/lib/cocina-central-supabase';
import { ccInsertPreparation, ccReplacePreparationIngredients, ccUpdateCentralPreparation } from '@/lib/cocina-central-supabase';

export function yieldLabelToCcPreparationUnit(yieldLabel: string): CcPreparationUnit {
  const k = yieldLabel.trim().toLowerCase();
  if (k.includes('kg') || k === 'g') return 'kg';
  if (k.includes('l') && !k.includes('ml')) return 'litros';
  if (k.includes('ml')) return 'litros';
  if (k.includes('ración') || k.includes('racion') || k.includes('raciones')) return 'racion';
  if (k.includes('porción') || k.includes('porcion')) return 'racion';
  if (k === 'ud' || k.includes('unidad') || k.includes('pieza')) return 'unidades';
  if (k.includes('bolsa')) return 'bolsa';
  return 'unidades';
}

function escandalloLineUnitToPreparationUnit(line: EscandalloLine): CcPreparationUnit {
  return yieldLabelToCcPreparationUnit(line.unit);
}

/** Unidades alineadas con lotes y trazas. */
function lineUnitForTrace(line: EscandalloLine): CcPreparationUnit {
  return escandalloLineUnitToPreparationUnit(line);
}

async function getOrCreateIngredientFromRaw(
  supabase: SupabaseClient,
  localId: string,
  line: EscandalloLine,
  rawId: string,
  label: string,
  raws: Awaited<ReturnType<typeof fetchProductsForEscandallo>>,
): Promise<string> {
  const { data: found } = await supabase
    .from('central_preparations')
    .select('id')
    .eq('local_central_id', localId)
    .eq('escandallo_raw_supplier_product_id', rawId)
    .maybeSingle();
  if (found?.id) return found.id as string;

  const p = raws.find((x) => x.id === rawId);
  const u = p ? escandalloRecipeUnitForRawProduct(p) : lineUnitForTrace(line);
  const uBase = yieldLabelToCcPreparationUnit(u);
  const nombre = `${label.trim() || p?.name || 'Ingrediente'} (escandallo)`;
  const created = await ccInsertPreparation(supabase, {
    local_central_id: localId,
    nombre,
    categoria: 'Ingrediente (escandallo)',
    unidad_base: uBase,
    descripcion: p ? `Desde artículo proveedor: ${p.name}` : null,
    activo: true,
    escandallo_raw_supplier_product_id: rawId,
  });
  return created.id;
}

async function getOrCreateIngredientFromProcessed(
  supabase: SupabaseClient,
  localId: string,
  line: EscandalloLine,
  procId: string,
  label: string,
  processed: Awaited<ReturnType<typeof fetchProcessedProductsForEscandallo>>,
): Promise<string> {
  const { data: found } = await supabase
    .from('central_preparations')
    .select('id')
    .eq('local_central_id', localId)
    .eq('escandallo_processed_product_id', procId)
    .maybeSingle();
  if (found?.id) return found.id as string;

  const p = processed.find((x) => x.id === procId);
  const uBase = p ? yieldLabelToCcPreparationUnit(p.outputUnit) : lineUnitForTrace(line);
  const nombre = `${label.trim() || p?.name || 'Elaborado'} (escandallo)`;
  const created = await ccInsertPreparation(supabase, {
    local_central_id: localId,
    nombre,
    categoria: 'Procesado (escandallo)',
    unidad_base: uBase,
    descripcion: p ? p.notes : null,
    activo: true,
    escandallo_processed_product_id: procId,
  });
  return created.id;
}

export type ScaledIngredientForOrder = {
  escandalloLineId: string;
  ingredientPreparationId: string;
  label: string;
  /** Cantidad teórica para el objetivo de producción. */
  theoreticalQty: number;
  unidad: CcPreparationUnit;
};

/**
 * Crea/actualiza la elaboración de salida (receta) y las elaboraciones-ingrediente,
 * reemplaza `central_preparation_ingredients` con cantidades al **rendimiento 1:1
 * respecto a yield del escandallo** (1 “receta base”). Las cantidades de orden
 * se escalan en `scaleIngredientsForTarget`.
 */
export async function ensureCentralPreparationFromEscandalloRecipe(
  supabase: SupabaseClient,
  localId: string,
  recipeId: string,
): Promise<{
  recipe: EscandalloRecipe;
  outputPreparationId: string;
  /** Cada fila alineada con su línea de escandallo (misma tanda). */
  baseRows: Array<{
    preparationId: string;
    cantidad: number;
    unidad: CcPreparationUnit;
    label: string;
    escandalloLineId: string;
  }>;
  skippedSubrecipes: number;
  skippedManual: number;
}> {
  const recipes = await fetchEscandalloRecipes(supabase, localId);
  const recipe = recipes.find((r) => r.id === recipeId);
  if (!recipe) throw new Error('Receta no encontrada en el local actual.');

  const [lines, raws, processed] = await Promise.all([
    fetchEscandalloLines(supabase, localId, recipeId),
    fetchProductsForEscandallo(supabase, localId),
    fetchProcessedProductsForEscandallo(supabase, localId),
  ]);

  const { data: existingOut } = await supabase
    .from('central_preparations')
    .select('id')
    .eq('local_central_id', localId)
    .eq('escandallo_recipe_id', recipeId)
    .maybeSingle();

  const outUnidad = yieldLabelToCcPreparationUnit(recipe.yieldLabel);
  let outputPreparationId: string;
  if (existingOut?.id) {
    outputPreparationId = existingOut.id as string;
    await ccUpdateCentralPreparation(supabase, outputPreparationId, {
      nombre: recipe.name,
      unidad_base: outUnidad,
      rendimiento: recipe.yieldQty,
      descripcion: recipe.notes?.trim() || null,
    });
  } else {
    const created = await ccInsertPreparation(supabase, {
      local_central_id: localId,
      nombre: recipe.name,
      categoria: 'Receta (escandallo)',
      unidad_base: outUnidad,
      rendimiento: recipe.yieldQty,
      descripcion: recipe.notes?.trim() || null,
      activo: true,
      escandallo_recipe_id: recipeId,
    });
    outputPreparationId = created.id;
  }

  const baseRows: Array<{
    preparationId: string;
    cantidad: number;
    unidad: CcPreparationUnit;
    label: string;
    escandalloLineId: string;
  }> = [];
  const forReplace: Array<{ ingredient_preparation_id: string; cantidad: number; unidad: CcPreparationUnit }> = [];
  let skippedSubrecipes = 0;
  let skippedManual = 0;

  for (const line of lines) {
    if (line.sourceType === 'subrecipe') {
      skippedSubrecipes += 1;
      continue;
    }
    if (line.sourceType === 'manual') {
      skippedManual += 1;
      continue;
    }
    let ingId: string;
    if (line.sourceType === 'raw' && line.rawSupplierProductId) {
      ingId = await getOrCreateIngredientFromRaw(
        supabase,
        localId,
        line,
        line.rawSupplierProductId,
        line.label,
        raws,
      );
    } else if (line.sourceType === 'processed' && line.processedProductId) {
      ingId = await getOrCreateIngredientFromProcessed(
        supabase,
        localId,
        line,
        line.processedProductId,
        line.label,
        processed,
      );
    } else {
      continue;
    }
    const u = lineUnitForTrace(line);
    const qty = line.qty > 0 ? line.qty : 0;
    if (qty <= 0) continue;
    const label = line.label?.trim() || 'Ingrediente';
    forReplace.push({ ingredient_preparation_id: ingId, cantidad: qty, unidad: u });
    baseRows.push({
      preparationId: ingId,
      cantidad: qty,
      unidad: u,
      label,
      escandalloLineId: line.id,
    });
  }

  if (forReplace.length > 0) {
    await ccReplacePreparationIngredients(supabase, outputPreparationId, forReplace);
  } else {
    await ccReplacePreparationIngredients(supabase, outputPreparationId, []);
  }

  return {
    recipe,
    outputPreparationId,
    baseRows,
    skippedSubrecipes,
    skippedManual,
  };
}

/**
 * Escala teóricos: factor = targetQty / receta.yieldQty (misma unidad lógica que el escandallo).
 */
export function scaleIngredientsForTarget(
  recipe: EscandalloRecipe,
  base: Array<{
    preparationId: string;
    cantidad: number;
    unidad: CcPreparationUnit;
    label: string;
    escandalloLineId: string;
  }>,
  targetQty: number,
): ScaledIngredientForOrder[] {
  if (!Number.isFinite(targetQty) || targetQty <= 0 || !Number.isFinite(recipe.yieldQty) || recipe.yieldQty <= 0) {
    return base.map((b) => ({
      escandalloLineId: b.escandalloLineId,
      ingredientPreparationId: b.preparationId,
      label: b.label,
      theoreticalQty: 0,
      unidad: b.unidad,
    }));
  }
  const factor = targetQty / recipe.yieldQty;
  return base.map((b) => ({
    escandalloLineId: b.escandalloLineId,
    ingredientPreparationId: b.preparationId,
    label: b.label,
    theoreticalQty: Math.round(b.cantidad * factor * 10000) / 10000,
    unidad: b.unidad,
  }));
}

/** Recupera filas con etiqueta correcta (tras sync, las líneas de escandallo pueden no alinearse con índice). */
export async function listEscandalloRecipesForProduction(
  supabase: SupabaseClient,
  localId: string,
): Promise<EscandalloRecipe[]> {
  return fetchEscandalloRecipes(supabase, localId);
}

/**
 * Sincroniza y devuelve escalado listo para insertar en `production_order_lines`.
 * Úsalo al crear una orden desde la receta.
 */
export async function buildProductionOrderLinePayloadFromEscandallo(
  supabase: SupabaseClient,
  localId: string,
  recipeId: string,
  targetQty: number,
): Promise<{
  recipe: EscandalloRecipe;
  outputPreparationId: string;
  lines: ScaledIngredientForOrder[];
  skippedSubrecipes: number;
  skippedManual: number;
}> {
  const built = await ensureCentralPreparationFromEscandalloRecipe(supabase, localId, recipeId);
  const scaled = scaleIngredientsForTarget(built.recipe, built.baseRows, targetQty);
  return {
    recipe: built.recipe,
    outputPreparationId: built.outputPreparationId,
    lines: scaled,
    skippedSubrecipes: built.skippedSubrecipes,
    skippedManual: built.skippedManual,
  };
}
