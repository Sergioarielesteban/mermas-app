import { roundMoney } from '@/lib/money-format';

export type EscandalloYieldUnit = 'kg' | 'g' | 'l' | 'ml' | 'ud';
export type EscandalloOperationalUsageType =
  | 'weight'
  | 'volume'
  | 'unit'
  | 'standard_portion';

type UnitFamily = 'weight' | 'volume' | 'unit' | null;

export function isEscandalloYieldUnit(value: string | null | undefined): value is EscandalloYieldUnit {
  return value === 'kg' || value === 'g' || value === 'l' || value === 'ml' || value === 'ud';
}

export function unitFamily(unit: string | null | undefined): UnitFamily {
  const u = String(unit ?? '').trim().toLowerCase();
  if (u === 'kg' || u === 'g') return 'weight';
  if (u === 'l' || u === 'ml') return 'volume';
  if (u === 'ud') return 'unit';
  return null;
}

export function unitCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const fa = unitFamily(a);
  const fb = unitFamily(b);
  return fa != null && fb != null && fa === fb;
}

export function toCanonicalQuantity(qty: number, unit: string | null | undefined): number | null {
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const u = String(unit ?? '').trim().toLowerCase();
  if (u === 'kg') return qty * 1000;
  if (u === 'g') return qty;
  if (u === 'l') return qty * 1000;
  if (u === 'ml') return qty;
  if (u === 'ud') return qty;
  return null;
}

export function fromCanonicalQuantity(qty: number, unit: EscandalloYieldUnit): number | null {
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (unit === 'kg') return qty / 1000;
  if (unit === 'g') return qty;
  if (unit === 'l') return qty / 1000;
  if (unit === 'ml') return qty;
  if (unit === 'ud') return qty;
  return null;
}

export function convertQuantity(
  qty: number,
  fromUnit: string | null | undefined,
  toUnit: EscandalloYieldUnit | string | null | undefined,
): number | null {
  if (!unitCompatible(fromUnit, toUnit)) return null;
  const canonical = toCanonicalQuantity(qty, fromUnit);
  if (canonical == null) return null;
  return fromCanonicalQuantity(canonical, String(toUnit).trim().toLowerCase() as EscandalloYieldUnit);
}

export function computeMermaPct(
  inputQty: number | null | undefined,
  inputUnit: string | null | undefined,
  outputQty: number | null | undefined,
  outputUnit: string | null | undefined,
): number | null {
  if (inputQty == null || outputQty == null || !Number.isFinite(inputQty) || !Number.isFinite(outputQty)) return null;
  if (inputQty <= 0 || outputQty <= 0) return null;
  const outputInInputUnit = convertQuantity(outputQty, outputUnit, String(inputUnit ?? '').trim().toLowerCase());
  if (outputInInputUnit == null || outputInInputUnit > inputQty) return null;
  return Math.round(((1 - outputInInputUnit / inputQty) * 100) * 100) / 100;
}

export function computeYieldCostPerUnit(
  costTotal: number | null | undefined,
  yieldQty: number | null | undefined,
): number | null {
  if (
    costTotal == null ||
    yieldQty == null ||
    !Number.isFinite(costTotal) ||
    !Number.isFinite(yieldQty) ||
    costTotal < 0 ||
    yieldQty <= 0
  ) {
    return null;
  }
  return Math.round((costTotal / yieldQty) * 1000000) / 1000000;
}

export function computeOperationalCost(
  yieldCostPerUnit: number | null | undefined,
  yieldUnit: string | null | undefined,
  quantity: number | null | undefined,
  unit: string | null | undefined,
): number | null {
  if (
    yieldCostPerUnit == null ||
    quantity == null ||
    !Number.isFinite(yieldCostPerUnit) ||
    !Number.isFinite(quantity) ||
    yieldCostPerUnit < 0 ||
    quantity <= 0
  ) {
    return null;
  }
  if (!unitCompatible(yieldUnit, unit)) return null;
  const inYieldUnit = convertQuantity(quantity, unit, String(yieldUnit ?? '').trim().toLowerCase());
  if (inYieldUnit == null) return null;
  return Math.round(yieldCostPerUnit * inYieldUnit * 1000000) / 1000000;
}

export function inferUsageTypeFromUnit(unit: string | null | undefined): EscandalloOperationalUsageType | null {
  const family = unitFamily(unit);
  if (family === 'weight') return 'weight';
  if (family === 'volume') return 'volume';
  if (family === 'unit') return 'unit';
  return null;
}

export function formatOperationalSummary(quantity: number | null | undefined, unit: string | null | undefined): string {
  if (quantity == null || !Number.isFinite(quantity) || quantity <= 0 || !unit) return 'Pendiente de configurar';
  return `${quantity} ${unit}`;
}

export function roundDisplayOperationalCost(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return roundMoney(value);
}
