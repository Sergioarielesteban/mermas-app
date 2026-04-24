import { ESCANDALLO_USAGE_UNIT_PRESETS } from '@/lib/escandallo-ingredient-units';
import {
  escandalloRecipeUnitForRawProduct,
  lineUnitPriceEur,
  type EscandalloLine,
  type EscandalloLineInsertPayload,
  type EscandalloProcessedProduct,
  type EscandalloRawProduct,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import { parsePriceInput } from '@/lib/money-format';

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
  sourceType: 'raw' | 'processed' | 'subrecipe' | 'manual';
  rawSearch: string;
  rawDropdownOpen: boolean;
  rawId: string;
  processedId: string;
  subRecipeId: string;
  manualLabel: string;
  manualPrice: string;
  qty: string;
  unit: string;
};

export function emptyIngredientDraft(): IngredientDraftRow {
  return {
    key: newDraftKey(),
    sourceType: 'raw',
    rawSearch: '',
    rawDropdownOpen: false,
    rawId: '',
    processedId: '',
    subRecipeId: '',
    manualLabel: '',
    manualPrice: '',
    qty: '1',
    unit: 'kg',
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
  recipeId: string | null,
): { ok: true; payloads: EscandalloLineInsertPayload[] } | { ok: false; message: string } {
  const payloads: EscandalloLineInsertPayload[] = [];
  for (const row of rows) {
    const qty = parseDecimal(row.qty);
    if (qty == null || qty <= 0) continue;
    const raw = row.rawId ? rawById.get(row.rawId) : undefined;
    const processed = row.processedId ? processedById.get(row.processedId) : undefined;
    const subRec = row.subRecipeId ? recipesById.get(row.subRecipeId) : undefined;
    const label =
      row.sourceType === 'raw'
        ? raw?.name ?? ''
        : row.sourceType === 'processed'
          ? processed?.name ?? ''
          : row.sourceType === 'subrecipe'
            ? subRec?.name ?? ''
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
    payloads.push({
      sourceType: row.sourceType,
      label,
      qty,
      unit:
        row.sourceType === 'raw'
          ? raw
            ? escandalloRecipeUnitForRawProduct(raw)
            : row.unit
          : row.sourceType === 'processed'
            ? processed?.outputUnit ?? row.unit
            : row.unit,
      rawSupplierProductId: row.sourceType === 'raw' ? raw?.id ?? null : null,
      processedProductId: row.sourceType === 'processed' ? processed?.id ?? null : null,
      subRecipeId: row.sourceType === 'subrecipe' ? subRec?.id ?? null : null,
      manualPricePerUnit: row.sourceType === 'manual' ? manual : null,
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
  linesByRecipe: Record<string, EscandalloLine[]>,
  excludeRecipeId: string | null,
): number | null {
  const qty = parseDecimal(row.qty);
  if (qty == null || qty <= 0) return null;
  const built = draftRowsToPayloads([row], rawById, processedById, recipesById, excludeRecipeId);
  if (!built.ok || built.payloads.length === 0) return null;
  const p = built.payloads[0];
  const rid = excludeRecipeId ?? '__draft__';
  const tempLine: EscandalloLine = {
    id: 'estimate',
    localId: 'estimate',
    recipeId: rid,
    sourceType: p.sourceType,
    rawSupplierProductId: p.rawSupplierProductId ?? null,
    processedProductId: p.processedProductId ?? null,
    subRecipeId: p.subRecipeId ?? null,
    label: p.label,
    qty: p.qty,
    unit: p.unit,
    manualPricePerUnit: p.manualPricePerUnit ?? null,
    sortOrder: 0,
    createdAt: '',
  };
  const unit = lineUnitPriceEur(tempLine, rawById, processedById, {
    linesByRecipe,
    recipesById,
    expanding: new Set<string>([rid]),
  });
  if (!Number.isFinite(unit)) return null;
  return Math.round(qty * unit * 100) / 100;
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
    processedProductId: p.processedProductId ?? null,
    subRecipeId: p.subRecipeId ?? null,
    label: p.label,
    qty: p.qty,
    unit: p.unit,
    manualPricePerUnit: p.manualPricePerUnit ?? null,
    sortOrder: i,
    createdAt: '',
  }));
}
