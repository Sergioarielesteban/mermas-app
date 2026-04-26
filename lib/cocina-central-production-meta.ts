import type { ProductionRecipeRow } from '@/lib/production-recipes-supabase';

/** Almacenado en production_batches.lote_produccion_meta (JSON) al confirmar. */
export type LoteProduccionMetaV1 = {
  version?: 1;
  production_recipe_id?: string | null;
  recipe_name?: string | null;
  target_output_qty: number;
  target_output_unit?: string | null;
  total_kg?: number | null;
  total_cost_eur?: number | null;
  cost_per_output_unit_eur?: number | null;
  cost_per_kg_eur?: number | null;
};

/**
 * Múltiplo: cantidad a producir respecto a la receta base (p. ej. 12 bolsas / 1 bolsa de rendimiento).
 */
export function productionScaleFactor(
  targetQty: number,
  baseYieldQuantity: number,
): number {
  if (!Number.isFinite(targetQty) || targetQty <= 0) return 0;
  if (!Number.isFinite(baseYieldQuantity) || baseYieldQuantity <= 0) return 0;
  return targetQty / baseYieldQuantity;
}

/**
 * Kg totales de salida estimados: (objetivo / rendimiento base) × kg por bloque de rendimiento base.
 */
export function estimateTotalOutputKg(
  targetQty: number,
  recipe: Pick<ProductionRecipeRow, 'base_yield_quantity' | 'weight_kg_per_base_yield'>,
): number | null {
  const w = recipe.weight_kg_per_base_yield;
  if (w == null || !Number.isFinite(w) || w <= 0) return null;
  const f = productionScaleFactor(targetQty, Number(recipe.base_yield_quantity));
  if (f <= 0) return null;
  return Math.round(f * w * 10000) / 10000;
}

const NON_ALNUM = /[^a-zA-Z0-9\u00C0-\u024F]/g;

/** Prefijo alfanumérico para códigos de lote (máx. 8 caracteres). */
export function suggestLotCodePrefixFromName(name: string): string {
  const s = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(NON_ALNUM, '')
    .toUpperCase();
  return s.slice(0, 8) || 'LOTE';
}

export function isNonEmptyString(s: string | null | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}
