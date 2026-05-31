import type { EscandalloLine } from '@/lib/escandallos-supabase';

export type EscandalloCostSource =
  | { type: 'raw'; rawSupplierProductId?: string | null; articleId?: string | null; usageFormatId?: string | null }
  | { type: 'processed'; processedProductId: string }
  | { type: 'subrecipe'; recipeId: string }
  | { type: 'central_kitchen'; centralProductionRecipeId: string };

export type AffectedEscandalloRecipes = {
  directRecipeIds: string[];
  indirectRecipeIds: string[];
  allRecipeIds: string[];
};

function lineMatchesSource(line: EscandalloLine, source: EscandalloCostSource): boolean {
  if (source.type === 'raw') {
    return (
      line.sourceType === 'raw' &&
      ((Boolean(source.rawSupplierProductId) && line.rawSupplierProductId === source.rawSupplierProductId) ||
        (Boolean(source.articleId) && line.articleId === source.articleId) ||
        (Boolean(source.usageFormatId) && line.usageFormatId === source.usageFormatId))
    );
  }
  if (source.type === 'processed') {
    return line.sourceType === 'processed' && line.processedProductId === source.processedProductId;
  }
  if (source.type === 'subrecipe') {
    return line.sourceType === 'subrecipe' && line.subRecipeId === source.recipeId;
  }
  return line.sourceType === 'central_kitchen' && line.centralProductionRecipeId === source.centralProductionRecipeId;
}

/**
 * Devuelve recetas afectadas por un origen de coste y dependientes indirectos vía bases/elaboraciones.
 * Es deliberadamente puro: no hace queries ni recalcula, solo resuelve dependencias con las líneas cargadas.
 */
export function getAffectedRecipesByCostSource(
  source: EscandalloCostSource,
  linesByRecipe: Record<string, EscandalloLine[]>,
): AffectedEscandalloRecipes {
  const direct = new Set<string>();
  for (const [recipeId, lines] of Object.entries(linesByRecipe)) {
    if (lines.some((line) => lineMatchesSource(line, source))) direct.add(recipeId);
  }

  const affected = new Set(direct);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [recipeId, lines] of Object.entries(linesByRecipe)) {
      if (affected.has(recipeId)) continue;
      if (lines.some((line) => line.sourceType === 'subrecipe' && line.subRecipeId && affected.has(line.subRecipeId))) {
        affected.add(recipeId);
        changed = true;
      }
    }
  }

  const indirect = [...affected].filter((recipeId) => !direct.has(recipeId));
  return {
    directRecipeIds: [...direct].sort(),
    indirectRecipeIds: indirect.sort(),
    allRecipeIds: [...affected].sort(),
  };
}
