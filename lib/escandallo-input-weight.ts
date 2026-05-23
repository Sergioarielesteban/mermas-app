import type { EscandalloLine, EscandalloRawProduct } from '@/lib/escandallos-supabase';

export type WeightConversionUnit = 'kg' | 'g';
export type VolumeConversionUnit = 'l' | 'ml';

export type WeightConversionConfig = {
  conversionToWeightEnabled?: boolean | null;
  conversionWeightUnit?: WeightConversionUnit | null;
  conversionVolumeUnit?: VolumeConversionUnit | null;
  conversionFactor?: number | null;
};

export type IngredientWeightResolution =
  | { status: 'weight'; kg: number; detail: string }
  | { status: 'converted'; kg: number; detail: string }
  | { status: 'missing_conversion'; kg: null; detail: string }
  | { status: 'unsupported'; kg: null; detail: string };

function normalizeUnit(unit: string | null | undefined): string {
  return String(unit ?? '').trim().toLowerCase();
}

function roundKg(value: number): number {
  return Math.round(value * 1000000) / 1000000;
}

function formatQty(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
}

function volumeInConfiguredUnit(qty: number, fromUnit: string, toUnit: VolumeConversionUnit): number | null {
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (fromUnit === toUnit) return qty;
  if (fromUnit === 'l' && toUnit === 'ml') return qty * 1000;
  if (fromUnit === 'ml' && toUnit === 'l') return qty / 1000;
  return null;
}

function weightToKg(qty: number, unit: WeightConversionUnit): number | null {
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return unit === 'kg' ? qty : qty / 1000;
}

export function ingredientWeightResolution(
  qty: number,
  unit: string,
  product?: WeightConversionConfig | null,
): IngredientWeightResolution {
  const normalizedUnit = normalizeUnit(unit);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { status: 'unsupported', kg: null, detail: '' };
  }

  if (normalizedUnit === 'kg') {
    return { status: 'weight', kg: roundKg(qty), detail: `${formatQty(qty)} kg` };
  }
  if (normalizedUnit === 'g') {
    return { status: 'weight', kg: roundKg(qty / 1000), detail: `${formatQty(qty)} g` };
  }

  if (normalizedUnit !== 'l' && normalizedUnit !== 'ml') {
    return { status: 'unsupported', kg: null, detail: `${formatQty(qty)} ${unit}` };
  }

  const factor =
    product?.conversionFactor != null && Number.isFinite(product.conversionFactor)
      ? Number(product.conversionFactor)
      : null;
  const volumeUnit = product?.conversionVolumeUnit ?? null;
  const weightUnit = product?.conversionWeightUnit ?? null;
  const enabled = Boolean(product?.conversionToWeightEnabled);

  if (!enabled || factor == null || factor <= 0 || !volumeUnit || !weightUnit) {
    return {
      status: 'missing_conversion',
      kg: null,
      detail: `${formatQty(qty)} ${normalizedUnit} · sin equivalencia kg`,
    };
  }

  const qtyInConfiguredVolume = volumeInConfiguredUnit(qty, normalizedUnit, volumeUnit);
  if (qtyInConfiguredVolume == null) {
    return {
      status: 'missing_conversion',
      kg: null,
      detail: `${formatQty(qty)} ${normalizedUnit} · sin equivalencia kg`,
    };
  }

  const weightQty = qtyInConfiguredVolume * factor;
  const kg = weightToKg(weightQty, weightUnit);
  if (kg == null) {
    return {
      status: 'missing_conversion',
      kg: null,
      detail: `${formatQty(qty)} ${normalizedUnit} · sin equivalencia kg`,
    };
  }

  const equivalent =
    weightUnit === 'kg'
      ? `${formatQty(weightQty)} kg`
      : `${formatQty(weightQty)} g`;
  return {
    status: 'converted',
    kg: roundKg(kg),
    detail: `${formatQty(qty)} ${normalizedUnit} ≈ ${equivalent}`,
  };
}

export function rawLineWeightResolution(
  line: Pick<EscandalloLine, 'qty' | 'unit' | 'sourceType' | 'rawSupplierProductId'>,
  rawById: Map<string, EscandalloRawProduct>,
): IngredientWeightResolution {
  const product = line.rawSupplierProductId ? rawById.get(line.rawSupplierProductId) : null;
  return ingredientWeightResolution(line.qty, line.unit, line.sourceType === 'raw' ? product : null);
}

export function totalInputWeightKg(
  lines: Array<Pick<EscandalloLine, 'qty' | 'unit' | 'sourceType' | 'rawSupplierProductId'>>,
  rawById: Map<string, EscandalloRawProduct>,
): { kg: number; missingConversionLines: EscandalloLine['rawSupplierProductId'][] } {
  let total = 0;
  const missingConversionLines: EscandalloLine['rawSupplierProductId'][] = [];
  for (const line of lines) {
    const resolved = rawLineWeightResolution(line, rawById);
    if (resolved.kg != null) total += resolved.kg;
    if (resolved.status === 'missing_conversion') missingConversionLines.push(line.rawSupplierProductId ?? null);
  }
  return {
    kg: roundKg(total),
    missingConversionLines,
  };
}

export function rawIngredientWeightDetail(
  qty: number,
  unit: string,
  product?: EscandalloRawProduct | null,
): string | null {
  const resolved = ingredientWeightResolution(qty, unit, product);
  if (resolved.status === 'converted' || resolved.status === 'missing_conversion') return resolved.detail;
  return null;
}
