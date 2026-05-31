import type {
  EscandalloLine,
  EscandalloProcessedProduct,
  EscandalloRawProduct,
  EscandalloRecipePriceContext,
  ResolvedEscandalloLineCost,
} from '@/lib/escandallos-supabase';
import { recipeTotalCostEur, resolveLineCost } from '@/lib/escandallos-supabase';

export type ResolveEscandalloLineCostParams = {
  line: EscandalloLine;
  rawProductById: Map<string, EscandalloRawProduct>;
  processedById: Map<string, EscandalloProcessedProduct>;
  context?: EscandalloRecipePriceContext;
};

export type RecalculateRecipeCostParams = {
  lines: EscandalloLine[];
  rawProductById: Map<string, EscandalloRawProduct>;
  processedById: Map<string, EscandalloProcessedProduct>;
  context?: EscandalloRecipePriceContext;
};

/**
 * API oficial para resolver el coste activo de una línea de escandallo.
 * Mantiene la lógica existente, pero evita que nuevas pantallas llamen a helpers parciales.
 */
export function resolveEscandalloLineCost(params: ResolveEscandalloLineCostParams): ResolvedEscandalloLineCost {
  const innerContext = params.context
    ? {
        linesByRecipe: params.context.linesByRecipe,
        recipesById: params.context.recipesById,
        technicalSheetsByRecipe: params.context.technicalSheetsByRecipe,
        centralKitchenById: params.context.centralKitchenById,
        expanding: new Set<string>([params.context.recipeId]),
      }
    : undefined;
  return resolveLineCost(params.line, params.rawProductById, params.processedById, innerContext);
}

/**
 * API oficial para recalcular el coste total de receta con el mismo motor de líneas.
 */
export function recalculateRecipeCost(params: RecalculateRecipeCostParams): number {
  return recipeTotalCostEur(params.lines, params.rawProductById, params.processedById, params.context);
}
