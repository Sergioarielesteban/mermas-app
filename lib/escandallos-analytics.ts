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
