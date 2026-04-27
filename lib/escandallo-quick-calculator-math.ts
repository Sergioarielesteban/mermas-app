import { roundMoney } from '@/lib/money-format';
import type { EscandalloRawProduct } from '@/lib/escandallos-supabase';

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

/**
 * Línea desde Artículo máster: importe = cantidad en unidad de uso × coste unitario de uso (€/u).
 * No usa precio de caja ni PMP; solo el coste de uso almacenado en el artículo máster.
 */
export function masterLineCostEur(cantidadEnUnidadUso: number, costeUnitarioUso: number): number {
  if (!Number.isFinite(cantidadEnUnidadUso) || cantidadEnUnidadUso < 0) return 0;
  if (!Number.isFinite(costeUnitarioUso) || costeUnitarioUso < 0) return 0;
  return roundMoney(cantidadEnUnidadUso * costeUnitarioUso);
}

/**
 * Coste de uso desde Artículo máster (coste_unitario_uso + unidad_uso). No usa precio de caja.
 * Prioriza datos ya fusionados en el producto de escandallo; si faltan, usa el mapa de hints por `article_id`.
 */
export function resolveQuickCalcUsageCost(
  p: EscandalloRawProduct,
  hintsByArticleId: Map<string, { costeUnitarioUso: number | null; unidadUso: string | null }>,
): { costeUnitarioUso: number; unidadUso: string } | null {
  const fromHint = p.articleId ? hintsByArticleId.get(p.articleId) : undefined;
  const costFromProduct =
    p.internalCostPerUsageUnitEur != null && Number.isFinite(p.internalCostPerUsageUnitEur)
      ? p.internalCostPerUsageUnitEur
      : null;
  const costFromHint =
    fromHint?.costeUnitarioUso != null && Number.isFinite(fromHint.costeUnitarioUso)
      ? fromHint.costeUnitarioUso
      : null;
  const cost = costFromProduct ?? costFromHint;
  const unitRaw =
    (p.internalUsageUnitLabel?.trim() || fromHint?.unidadUso?.trim() || '').trim();
  if (cost == null || !Number.isFinite(cost) || cost < 0) return null;
  if (!unitRaw) return null;
  return { costeUnitarioUso: roundMoney(cost), unidadUso: unitRaw };
}
