import type { EscandalloLine, EscandalloProcessedProduct, EscandalloRawProduct, EscandalloRecipe } from '@/lib/escandallos-supabase';
import {
  foodCostPercentOfNetSale,
  recipeTotalCostEur,
  saleNetPerUnitFromGross,
} from '@/lib/escandallos-supabase';

export type EscandalloFoodCostBucket = 'optimal' | 'watch' | 'high' | 'no_pvp' | 'no_lines';

export type EscandalloRecipeDashboardRow = {
  id: string;
  name: string;
  isSubRecipe: boolean;
  yieldQty: number;
  yieldLabel: string;
  totalCostEur: number;
  costPerYieldEur: number;
  saleGrossEur: number | null;
  saleVatPct: number | null;
  saleNetEur: number | null;
  foodCostPct: number | null;
  lineCount: number;
  bucket: EscandalloFoodCostBucket | 'sub';
};

function bucketForMain(
  lineCount: number,
  foodCostPct: number | null,
  hasPvp: boolean,
): EscandalloFoodCostBucket | 'sub' {
  if (lineCount === 0) return 'no_lines';
  if (!hasPvp || foodCostPct == null) return 'no_pvp';
  if (foodCostPct < 28) return 'optimal';
  if (foodCostPct <= 35) return 'watch';
  return 'high';
}

export function buildEscandalloDashboardRows(
  recipes: EscandalloRecipe[],
  linesByRecipe: Record<string, EscandalloLine[]>,
  rawById: Map<string, EscandalloRawProduct>,
  processedById: Map<string, EscandalloProcessedProduct>,
): EscandalloRecipeDashboardRow[] {
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  return recipes.map((recipe) => {
    const lines = linesByRecipe[recipe.id] ?? [];
    const totalCostEur = recipeTotalCostEur(lines, rawById, processedById, {
      linesByRecipe,
      recipesById,
      recipeId: recipe.id,
    });
    const y = recipe.yieldQty > 0 ? recipe.yieldQty : 1;
    const costPerYieldEur = Math.round((totalCostEur / y) * 100) / 100;
    const gross = recipe.salePriceGrossEur;
    const vat = recipe.saleVatRatePct;
    const hasPvp = gross != null && gross > 0;
    const vatEffective = vat != null && vat >= 0 ? vat : 10;
    const saleNetEur = hasPvp && gross != null ? saleNetPerUnitFromGross(gross, vatEffective) : null;
    const foodCostPct =
      !recipe.isSubRecipe && hasPvp && saleNetEur != null && saleNetEur > 0
        ? foodCostPercentOfNetSale(totalCostEur, recipe.yieldQty, saleNetEur)
        : null;
    const lineCount = lines.length;
    const bucket: EscandalloRecipeDashboardRow['bucket'] = recipe.isSubRecipe
      ? 'sub'
      : bucketForMain(lineCount, foodCostPct, hasPvp);

    return {
      id: recipe.id,
      name: recipe.name,
      isSubRecipe: recipe.isSubRecipe,
      yieldQty: recipe.yieldQty,
      yieldLabel: recipe.yieldLabel,
      totalCostEur,
      costPerYieldEur,
      saleGrossEur: gross,
      saleVatPct: vat,
      saleNetEur,
      foodCostPct,
      lineCount,
      bucket,
    };
  });
}

export function bucketLabel(bucket: EscandalloRecipeDashboardRow['bucket']): string {
  switch (bucket) {
    case 'optimal':
      return 'Óptimo';
    case 'watch':
      return 'Atención';
    case 'high':
      return 'Alto';
    case 'no_pvp':
      return 'Sin PVP';
    case 'no_lines':
      return 'Sin ingredientes';
    case 'sub':
      return 'Base';
    default:
      return bucket;
  }
}

/** Resultado de comparar ventas reales del mes con escandallos teóricos. */
export type MonthlyMixFoodCostResult = {
  totalUnitsSold: number;
  totalCostEur: number;
  totalNetRevenueEur: number;
  totalGrossRevenueEur: number;
  /** Σ(q×coste) / Σ(q×neto) × 100 con el mix declarado. */
  realFoodCostPct: number | null;
  /** Media simple de food cost por plato (carte); la pasas desde KPIs. */
  theoreticalAvgFoodCostPct: number | null;
  /** real − teórico (puntos porcentuales). Positivo = peor que la media de carta. */
  deltaVsTheoreticalPct: number | null;
  recipesInMix: number;
  /** Unidades vendidas en platos sin PVP (no entran en el denominador neto). */
  skippedNoPvpUnits: number;
  skippedNoPvpRecipeNames: string[];
};

/**
 * Calcula food cost del mix mensual: mismas fórmulas que plato a plato, ponderadas por unidades vendidas.
 */
export function computeMonthlyMixFoodCost(
  mainRows: EscandalloRecipeDashboardRow[],
  quantityByRecipeId: Record<string, number>,
  theoreticalAvgFoodCostPct: number | null,
): MonthlyMixFoodCostResult {
  let totalCost = 0;
  let totalNet = 0;
  let totalGross = 0;
  let totalUnits = 0;
  let recipesInMix = 0;
  let skippedNoPvpUnits = 0;
  const skippedNames: string[] = [];

  for (const r of mainRows) {
    const q = quantityByRecipeId[r.id] ?? 0;
    if (q <= 0) continue;
    recipesInMix += 1;
    totalUnits += q;
    totalCost += q * r.costPerYieldEur;
    if (r.saleNetEur != null && r.saleNetEur > 0) {
      totalNet += q * r.saleNetEur;
    } else {
      skippedNoPvpUnits += q;
      if (!skippedNames.includes(r.name)) skippedNames.push(r.name);
    }
    if (r.saleGrossEur != null && r.saleGrossEur > 0) {
      totalGross += q * r.saleGrossEur;
    }
  }

  const totalCostR = Math.round(totalCost * 100) / 100;
  const totalNetR = Math.round(totalNet * 100) / 100;
  const totalGrossR = Math.round(totalGross * 100) / 100;
  const realFoodCostPct =
    totalNetR > 0 ? Math.round((totalCostR / totalNetR) * 10000) / 100 : null;
  const deltaVsTheoreticalPct =
    realFoodCostPct != null && theoreticalAvgFoodCostPct != null
      ? Math.round((realFoodCostPct - theoreticalAvgFoodCostPct) * 10) / 10
      : null;

  return {
    totalUnitsSold: Math.round(totalUnits * 100) / 100,
    totalCostEur: totalCostR,
    totalNetRevenueEur: totalNetR,
    totalGrossRevenueEur: totalGrossR,
    realFoodCostPct,
    theoreticalAvgFoodCostPct,
    deltaVsTheoreticalPct,
    recipesInMix,
    skippedNoPvpUnits: Math.round(skippedNoPvpUnits * 100) / 100,
    skippedNoPvpRecipeNames: skippedNames,
  };
}
