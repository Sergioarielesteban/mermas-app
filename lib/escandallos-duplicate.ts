import type { SupabaseClient } from '@supabase/supabase-js';
import { refreshRecipeAllergens } from '@/lib/appcc-allergens-supabase';
import {
  fetchEscandalloTechnicalSheetWithSteps,
  insertEscandalloTechnicalSheet,
  replaceEscandalloTechnicalSheetSteps,
  updateEscandalloTechnicalSheet,
  type EscandalloTechnicalSheet,
  type EscandalloTechnicalSheetUpdate,
} from '@/lib/escandallos-technical-sheet-supabase';
import {
  deleteEscandalloRecipe,
  fetchEscandalloLines,
  fetchEscandalloRecipes,
  fetchProcessedProductsForEscandallo,
  insertEscandalloLinesBatch,
  insertEscandalloRecipe,
  insertProcessedProductForEscandallo,
  type EscandalloLine,
  type EscandalloLineInsertPayload,
  type EscandalloProcessedProduct,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';

function normalizeRecipeCopyBaseName(name: string): string {
  return name.trim().replace(/\s+\(Copia(?:\s+\d+)?\)$/i, '').trim() || name.trim();
}

function nextCopyName(currentName: string, existingNames: string[]): string {
  const baseName = normalizeRecipeCopyBaseName(currentName);
  const used = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase('es')));
  const first = `${baseName} (Copia)`;
  if (!used.has(first.toLocaleLowerCase('es'))) return first;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${baseName} (Copia ${n})`;
    if (!used.has(candidate.toLocaleLowerCase('es'))) return candidate;
  }
  return `${baseName} (Copia ${Date.now()})`;
}

function lineToDuplicatePayload(line: EscandalloLine): EscandalloLineInsertPayload {
  return {
    sourceType: line.sourceType,
    label: line.label,
    qty: line.qty,
    unit: line.unit,
    rawSupplierProductId: line.rawSupplierProductId,
    articleId: line.articleId ?? null,
    usageFormatId: line.usageFormatId ?? null,
    processedProductId: line.processedProductId,
    subRecipeId: line.subRecipeId,
    centralProductionRecipeId: line.centralProductionRecipeId,
    manualPricePerUnit: line.manualPricePerUnit,
    unitCostSnapshotEur: line.unitCostSnapshotEur ?? null,
    totalCostSnapshotEur: line.totalCostSnapshotEur ?? null,
    subRecipeUsageMode: line.subRecipeUsageMode,
    subRecipeOperationalQuantity: line.subRecipeOperationalQuantity,
    subRecipeOperationalUnit: line.subRecipeOperationalUnit,
  };
}

function sheetToDuplicatePatch(sheet: EscandalloTechnicalSheet): EscandalloTechnicalSheetUpdate {
  return {
    categoria: sheet.categoria,
    fotoUrl: sheet.fotoUrl,
    activa: sheet.activa,
    rendimientoTotal: sheet.rendimientoTotal,
    numeroRaciones: sheet.numeroRaciones,
    gramajePorRacionG: sheet.gramajePorRacionG,
    tiempoPreparacionMin: sheet.tiempoPreparacionMin,
    tiempoCoccionMin: sheet.tiempoCoccionMin,
    tiempoReposoMin: sheet.tiempoReposoMin,
    temperaturaServicio: sheet.temperaturaServicio,
    emplatadoDescripcion: sheet.emplatadoDescripcion,
    emplatadoDecoracion: sheet.emplatadoDecoracion,
    emplatadoMenaje: sheet.emplatadoMenaje,
    emplatadoFotoUrl: sheet.emplatadoFotoUrl,
    tipoConservacion: sheet.tipoConservacion,
    temperaturaConservacion: sheet.temperaturaConservacion,
    vidaUtil: sheet.vidaUtil,
    regeneracion: sheet.regeneracion,
    alergenosManual: [...sheet.alergenosManual],
    notasChef: sheet.notasChef,
    puntosCriticos: sheet.puntosCriticos,
    erroresComunes: sheet.erroresComunes,
    recomendaciones: sheet.recomendaciones,
    yieldQuantity: sheet.yieldQuantity,
    yieldUnit: sheet.yieldUnit,
    yieldMermaPct: sheet.yieldMermaPct,
    yieldCostTotal: sheet.yieldCostTotal,
    yieldCostPerUnit: sheet.yieldCostPerUnit,
    operationalUsageType: sheet.operationalUsageType,
    operationalQuantity: sheet.operationalQuantity,
    operationalUnit: sheet.operationalUnit,
    operationalCost: sheet.operationalCost,
  };
}

export async function duplicateEscandalloRecipe(
  supabase: SupabaseClient,
  localId: string,
  recipeId: string,
): Promise<EscandalloRecipe> {
  const recipes = await fetchEscandalloRecipes(supabase, localId);
  const source = recipes.find((recipe) => recipe.id === recipeId);
  if (!source) throw new Error('No se encontró la receta para duplicar.');

  const newName = nextCopyName(source.name, recipes.map((recipe) => recipe.name));
  let created: EscandalloRecipe | null = null;

  try {
    created = await insertEscandalloRecipe(supabase, localId, newName, {
      notes: source.notes,
      yieldQty: source.yieldQty,
      yieldLabel: source.yieldLabel,
      isSubRecipe: source.isSubRecipe,
      saleVatRatePct: source.saleVatRatePct,
      salePriceGrossEur: source.salePriceGrossEur,
      posArticleCode: null,
      finalWeightQty: source.finalWeightQty,
      finalWeightUnit: source.finalWeightUnit,
    });

    const sourceLines = await fetchEscandalloLines(supabase, localId, source.id);
    const linePayloads = [...sourceLines]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(lineToDuplicatePayload);
    await insertEscandalloLinesBatch(supabase, localId, created.id, linePayloads, 0);

    const sourceSheet = await fetchEscandalloTechnicalSheetWithSteps(supabase, localId, source.id).catch(() => ({
      sheet: null,
      steps: [],
    }));
    if (sourceSheet.sheet) {
      const createdSheet = await insertEscandalloTechnicalSheet(supabase, localId, created.id);
      await updateEscandalloTechnicalSheet(supabase, localId, createdSheet.id, sheetToDuplicatePatch(sourceSheet.sheet));
      await replaceEscandalloTechnicalSheetSteps(
        supabase,
        localId,
        createdSheet.id,
        sourceSheet.steps.map((step) => ({
          titulo: step.titulo ?? '',
          descripcion: step.descripcion,
        })),
      );
    }

    await refreshRecipeAllergens(supabase, created.id).catch(() => undefined);
    return created;
  } catch (error) {
    if (created) {
      await deleteEscandalloRecipe(supabase, localId, created.id).catch(() => undefined);
    }
    throw error instanceof Error ? error : new Error('No se pudo duplicar la receta.');
  }
}

export async function duplicateProcessedProductForEscandallo(
  supabase: SupabaseClient,
  localId: string,
  processedId: string,
): Promise<EscandalloProcessedProduct> {
  const processed = await fetchProcessedProductsForEscandallo(supabase, localId);
  const source = processed.find((item) => item.id === processedId);
  if (!source) throw new Error('No se encontró el elaborado para duplicar.');

  return insertProcessedProductForEscandallo(supabase, localId, {
    name: nextCopyName(source.name, processed.map((item) => item.name)),
    sourceSupplierProductId: source.sourceSupplierProductId,
    inputQty: source.inputQty,
    outputQty: source.outputQty,
    outputUnit: source.outputUnit,
    extraCostEur: source.extraCostEur,
    notes: source.notes,
  });
}
