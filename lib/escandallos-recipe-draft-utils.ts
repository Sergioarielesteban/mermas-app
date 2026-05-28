import {
  ESCANDALLO_USAGE_UNIT_PRESETS,
  sanitizeEscandalloIngredientUnit,
} from '@/lib/escandallo-ingredient-units';
import type { EscandalloYieldUnit } from '@/lib/escandallo-operational-usage';
import {
  escandalloRecipeUnitForRawProduct,
  resolveLineCost,
  type EscandalloLine,
  type EscandalloLineInsertPayload,
  type EscandalloRecipePriceContext,
  type EscandalloProcessedProduct,
  type EscandalloRawProduct,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import type { EscandalloTechnicalSheet } from '@/lib/escandallos-technical-sheet-supabase';
import { parsePriceInput } from '@/lib/money-format';
import type { EscandalloCentralKitchenCatalogItem } from '@/lib/central-kitchen-public-catalog';

/** Opciones compactas para selects legacy; en UI preferir datalist con presets + texto libre. */
export const ESCANDALLO_DRAFT_UNITS: { value: string; label: string }[] = [
  ...ESCANDALLO_USAGE_UNIT_PRESETS.map((u) => ({ value: u, label: u })),
  { value: 'racion', label: 'racion' },
];

export function parseDecimal(raw: string): number | null {
  return parsePriceInput(raw);
}

export function newDraftKey() {
  return `d-${Math.random().toString(36).slice(2, 11)}`;
}

export type IngredientDraftRow = {
  key: string;
  sourceType: 'raw' | 'processed' | 'subrecipe' | 'central_kitchen' | 'manual';
  rawSearch: string;
  rawDropdownOpen: boolean;
  rawId: string;
  rawUsageFormatId: string;
  processedId: string;
  subRecipeId: string;
  centralKitchenId: string;
  manualLabel: string;
  manualPrice: string;
  qty: string;
  unit: string;
  subRecipeUsageMode?: 'custom' | 'standard_portion';
  subRecipeOperationalQuantity?: string;
  subRecipeOperationalUnit?: EscandalloYieldUnit | '';
};

export function emptyIngredientDraft(): IngredientDraftRow {
  return {
    key: newDraftKey(),
    sourceType: 'raw',
    rawSearch: '',
    rawDropdownOpen: false,
    rawId: '',
    rawUsageFormatId: '',
    processedId: '',
    subRecipeId: '',
    centralKitchenId: '',
    manualLabel: '',
    manualPrice: '',
    qty: '1',
    unit: 'kg',
    subRecipeUsageMode: 'custom',
    subRecipeOperationalQuantity: '',
    subRecipeOperationalUnit: '',
  };
}

export function foodCostStatus(pct: number | null): { text: string; className: string } {
  if (pct == null) return { text: 'Sin PVP', className: 'text-zinc-500' };
  if (pct < 28) return { text: 'Food cost contenido', className: 'text-emerald-700' };
  if (pct <= 35) return { text: 'Revisar márgenes', className: 'text-amber-800' };
  return { text: 'Food cost alto', className: 'text-red-700' };
}

export function draftRowsToPayloads(
  rows: IngredientDraftRow[],
  rawById: Map<string, EscandalloRawProduct>,
  processedById: Map<string, EscandalloProcessedProduct>,
  recipesById: Map<string, EscandalloRecipe>,
  centralKitchenById: Map<string, EscandalloCentralKitchenCatalogItem>,
  recipeId: string | null,
): { ok: true; payloads: EscandalloLineInsertPayload[] } | { ok: false; message: string } {
  const payloads: EscandalloLineInsertPayload[] = [];
  for (const row of rows) {
    const qty = parseDecimal(row.qty);
    if (qty == null || qty <= 0) continue;
    const raw = row.rawId ? rawById.get(row.rawId) : undefined;
    const selectedRawUsageFormat =
      row.sourceType === 'raw' && raw && row.rawUsageFormatId && row.rawUsageFormatId !== '__manual_weight__'
        ? raw.usageFormats?.find((f) => f.id === row.rawUsageFormatId)
        : undefined;
    const processed = row.processedId ? processedById.get(row.processedId) : undefined;
    const subRec = row.subRecipeId ? recipesById.get(row.subRecipeId) : undefined;
    const centralItem = row.centralKitchenId ? centralKitchenById.get(row.centralKitchenId) : undefined;
    const label =
      row.sourceType === 'raw'
        ? raw?.name ?? ''
        : row.sourceType === 'processed'
          ? processed?.name ?? ''
          : row.sourceType === 'subrecipe'
            ? subRec?.name ?? ''
            : row.sourceType === 'central_kitchen'
              ? centralItem?.name ?? ''
            : row.manualLabel.trim();
    if (!label) continue;
    let manual: number | null = null;
    if (row.sourceType === 'manual') {
      const m = parseDecimal(row.manualPrice);
      if (m == null || m < 0) return { ok: false, message: 'En filas manuales, precio €/ud debe ser válido.' };
      manual = Math.round(m * 10000) / 10000;
    }
    if (row.sourceType === 'raw' && !raw) return { ok: false, message: 'Selecciona producto crudo en cada fila rellena.' };
    if (row.sourceType === 'processed' && !processed)
      return { ok: false, message: 'Selecciona elaborado en cada fila rellena.' };
    if (row.sourceType === 'subrecipe') {
      if (!subRec) return { ok: false, message: 'Selecciona sub-receta en cada fila rellena.' };
      if (recipeId != null && subRec.id === recipeId)
        return { ok: false, message: 'Una receta no puede referenciarse a sí misma.' };
    }
    if (row.sourceType === 'central_kitchen' && !centralItem) {
      return { ok: false, message: 'Selecciona producto de Cocina Central en cada fila rellena.' };
    }
    const subRecipeUsageMode =
      row.sourceType === 'subrecipe'
        ? row.subRecipeUsageMode === 'standard_portion'
          ? 'standard_portion'
          : 'custom'
        : null;
    const subRecipeOperationalQuantity =
      row.sourceType === 'subrecipe' && subRecipeUsageMode === 'standard_portion'
        ? parseDecimal(row.subRecipeOperationalQuantity ?? '')
        : null;
    const subRecipeOperationalUnit =
      row.sourceType === 'subrecipe' && subRecipeUsageMode === 'standard_portion'
        ? (row.subRecipeOperationalUnit
            ? row.subRecipeOperationalUnit
            : null)
        : null;
    if (row.sourceType === 'subrecipe' && subRecipeUsageMode === 'standard_portion') {
      if (subRecipeOperationalQuantity == null || subRecipeOperationalQuantity <= 0 || !subRecipeOperationalUnit) {
        return {
          ok: false,
          message: 'Configura cantidad y unidad de ración estándar para usar una base/elaboración por ración.',
        };
      }
    }
    payloads.push({
      sourceType: row.sourceType,
      label,
      qty,
      unit:
        row.sourceType === 'raw'
          ? raw
            ? selectedRawUsageFormat
              ? sanitizeEscandalloIngredientUnit(selectedRawUsageFormat.usageUnit)
              : row.rawUsageFormatId === '__manual_weight__'
                ? row.unit
                : escandalloRecipeUnitForRawProduct(raw)
            : row.unit
          : row.sourceType === 'processed'
            ? processed?.outputUnit ?? row.unit
            : row.unit,
      rawSupplierProductId: row.sourceType === 'raw' ? raw?.id ?? null : null,
      articleId: row.sourceType === 'raw' ? raw?.articleId ?? null : null,
      usageFormatId: row.sourceType === 'raw' ? selectedRawUsageFormat?.id ?? null : null,
      processedProductId: row.sourceType === 'processed' ? processed?.id ?? null : null,
      subRecipeId: row.sourceType === 'subrecipe' ? subRec?.id ?? null : null,
      centralProductionRecipeId: row.sourceType === 'central_kitchen' ? centralItem?.id ?? null : null,
      manualPricePerUnit: row.sourceType === 'manual' ? manual : null,
      unitCostSnapshotEur:
        row.sourceType === 'raw' && selectedRawUsageFormat
          ? Math.round(selectedRawUsageFormat.costPerUsageUnit * 1000000) / 1000000
          : null,
      totalCostSnapshotEur:
        row.sourceType === 'raw' && selectedRawUsageFormat
          ? Math.round(qty * selectedRawUsageFormat.costPerUsageUnit * 1000000) / 1000000
          : null,
      subRecipeUsageMode,
      subRecipeOperationalQuantity,
      subRecipeOperationalUnit,
    });
  }
  return { ok: true, payloads };
}

/** Coste estimado de una fila de borrador (misma lógica que líneas guardadas). */
export function estimateDraftRowCostEur(
  row: IngredientDraftRow,
  rawById: Map<string, EscandalloRawProduct>,
  processedById: Map<string, EscandalloProcessedProduct>,
  recipesById: Map<string, EscandalloRecipe>,
  centralKitchenById: Map<string, EscandalloCentralKitchenCatalogItem>,
  linesByRecipe: Record<string, EscandalloLine[]>,
  excludeRecipeId: string | null,
  technicalSheetsByRecipe?: Map<string, EscandalloTechnicalSheet>,
): number | null {
  const qty = parseDecimal(row.qty);
  if (qty == null || qty <= 0) return null;
  const built = draftRowsToPayloads([row], rawById, processedById, recipesById, centralKitchenById, excludeRecipeId);
  if (!built.ok || built.payloads.length === 0) return null;
  const p = built.payloads[0];
  const rid = excludeRecipeId ?? '__draft__';
  const tempLine: EscandalloLine = {
    id: 'estimate',
    localId: 'estimate',
    recipeId: rid,
    sourceType: p.sourceType,
    rawSupplierProductId: p.rawSupplierProductId ?? null,
    articleId: p.articleId ?? null,
    usageFormatId: p.usageFormatId ?? null,
    processedProductId: p.processedProductId ?? null,
    subRecipeId: p.subRecipeId ?? null,
    centralProductionRecipeId: p.centralProductionRecipeId ?? null,
    label: p.label,
    qty: p.qty,
    unit: p.unit,
    manualPricePerUnit: p.manualPricePerUnit ?? null,
    unitCostSnapshotEur: p.unitCostSnapshotEur ?? null,
    totalCostSnapshotEur: p.totalCostSnapshotEur ?? null,
    subRecipeUsageMode: p.subRecipeUsageMode ?? null,
    subRecipeOperationalQuantity: p.subRecipeOperationalQuantity ?? null,
    subRecipeOperationalUnit: p.subRecipeOperationalUnit ?? null,
    sortOrder: 0,
    createdAt: '',
  };
  const priceCtx: EscandalloRecipePriceContext = {
    linesByRecipe,
    recipesById,
    technicalSheetsByRecipe,
    centralKitchenById,
    recipeId: rid,
  };
  const resolved = resolveLineCost(tempLine, rawById, processedById, {
    linesByRecipe: priceCtx.linesByRecipe,
    recipesById: priceCtx.recipesById,
    technicalSheetsByRecipe: priceCtx.technicalSheetsByRecipe,
    centralKitchenById: priceCtx.centralKitchenById,
    expanding: new Set<string>([rid]),
  });
  if (!Number.isFinite(resolved.totalCost)) return null;
  return resolved.totalCost;
}

/** Líneas sintéticas para calcular coste en el asistente (antes de guardar en BD). */
export function insertPayloadsToTempLines(
  recipeId: string,
  payloads: EscandalloLineInsertPayload[],
): EscandalloLine[] {
  return payloads.map((p, i) => ({
    id: `tmp-${i}`,
    localId: 'tmp',
    recipeId,
    sourceType: p.sourceType,
    rawSupplierProductId: p.rawSupplierProductId ?? null,
    articleId: p.articleId ?? null,
    usageFormatId: p.usageFormatId ?? null,
    processedProductId: p.processedProductId ?? null,
    subRecipeId: p.subRecipeId ?? null,
    centralProductionRecipeId: p.centralProductionRecipeId ?? null,
    label: p.label,
    qty: p.qty,
    unit: p.unit,
    manualPricePerUnit: p.manualPricePerUnit ?? null,
    unitCostSnapshotEur: p.unitCostSnapshotEur ?? null,
    totalCostSnapshotEur: p.totalCostSnapshotEur ?? null,
    subRecipeUsageMode: p.subRecipeUsageMode ?? null,
    subRecipeOperationalQuantity: p.subRecipeOperationalQuantity ?? null,
    subRecipeOperationalUnit: p.subRecipeOperationalUnit ?? null,
    sortOrder: i,
    createdAt: '',
  }));
}
