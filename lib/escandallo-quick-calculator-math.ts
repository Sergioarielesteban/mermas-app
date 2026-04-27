import { sanitizeEscandalloIngredientUnit } from '@/lib/escandallo-ingredient-units';
import { roundMoney } from '@/lib/money-format';
import { rawSupplierLineUnitPriceEur, type EscandalloLine, type EscandalloRawProduct } from '@/lib/escandallos-supabase';

export type QuickCalcResult = {
  costeTotal: number;
  foodCostObjetivoPct: number;
  ivaVentaPct: number;
  precioVentaNeto: number;
  ivaImporte: number;
  pvpIvaIncluido: number;
  margenBruto: number;
  margenBrutoPorcentaje: number;
};

/**
 * Cálculos según fórmulas de la calculadora rápida (PVP y margen orientativos).
 * Si foodCostObjetivoPct ≤ 0 o coste total ≤ 0, los derivados quedan en 0 salvo el total.
 */
export function computeQuickCalc(
  costeTotal: number,
  foodCostObjetivoPct: number,
  ivaVentaPct: number,
): QuickCalcResult {
  const ct = roundMoney(costeTotal);
  const fc = foodCostObjetivoPct;
  const iva = ivaVentaPct;

  if (!Number.isFinite(ct) || ct < 0 || !Number.isFinite(fc) || fc <= 0) {
    return {
      costeTotal: Math.max(0, ct),
      foodCostObjetivoPct: fc,
      ivaVentaPct: iva,
      precioVentaNeto: 0,
      ivaImporte: 0,
      pvpIvaIncluido: 0,
      margenBruto: 0,
      margenBrutoPorcentaje: 0,
    };
  }

  const precioVentaNetoBruto = ct / (fc / 100);
  const precioVentaNeto = roundMoney(precioVentaNetoBruto);
  const ivaImporte = roundMoney(precioVentaNetoBruto * (iva / 100));
  const pvpIvaIncluido = roundMoney(precioVentaNetoBruto * (1 + iva / 100));
  const margenBruto = roundMoney(precioVentaNetoBruto - ct);
  const margenBrutoPorcentaje =
    precioVentaNetoBruto > 0
      ? roundMoney((margenBruto / precioVentaNetoBruto) * 100)
      : 0;

  return {
    costeTotal: ct,
    foodCostObjetivoPct: fc,
    ivaVentaPct: iva,
    precioVentaNeto,
    ivaImporte,
    pvpIvaIncluido,
    margenBruto,
    margenBrutoPorcentaje,
  };
}

function tempLine(p: EscandalloRawProduct, usageUnit: string): EscandalloLine {
  const u = sanitizeEscandalloIngredientUnit(usageUnit);
  return {
    id: 'quick-calc',
    localId: 'quick-calc',
    recipeId: 'quick-calc',
    sourceType: 'raw',
    rawSupplierProductId: p.id,
    processedProductId: null,
    subRecipeId: null,
    label: p.name,
    qty: 1,
    unit: u,
    manualPricePerUnit: null,
    sortOrder: 0,
    createdAt: new Date().toISOString(),
  };
}

/** Coste de una línea desde catálogo (Artículo máster / proveedor) y cantidad en unidad de uso. */
export function computeMasterLineCostEur(
  p: EscandalloRawProduct,
  qty: number,
  usageUnit: string,
): number {
  if (!Number.isFinite(qty) || qty < 0) return 0;
  const line = tempLine(p, usageUnit);
  const perUnit = rawSupplierLineUnitPriceEur(line, p);
  return roundMoney(qty * perUnit);
}
