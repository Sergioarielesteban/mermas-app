import { unitAllowsDecimalOrderQuantity } from '@/lib/pedidos-units';
import type { Unit } from '@/lib/types';

/** Un tap +/− añade o quita siempre una unidad lógica (1 kg, 1 caja, 1 ud, etc.). */
export function applyQuantityTapDelta(unit: Unit, current: number, deltaSteps: number): number {
  const raw = current + deltaSteps;
  if (unitAllowsDecimalOrderQuantity(unit)) return Math.max(0, Math.round(raw * 100) / 100);
  return Math.max(0, Math.floor(raw));
}

/** Entrada manual: kg/litro/ml/g con decimales; resto enteros. */
export function parseQuantityManualInput(unit: Unit, raw: string): number | null {
  if (raw.trim() === '') return 0;
  const num = Number(raw.replace(',', '.'));
  if (Number.isNaN(num) || num < 0) return null;
  if (unitAllowsDecimalOrderQuantity(unit)) return Math.round(num * 100) / 100;
  return Math.floor(num);
}
