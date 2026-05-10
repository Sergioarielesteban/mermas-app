/**
 * Estadísticos mínimos compartidos por históricos de pedidos/recepción (mediana, etc.).
 * Evita duplicar implementaciones en motores de sugerencia / stock estimado.
 */

import { unitAllowsDecimalOrderQuantity } from '@/lib/pedidos-units';
import type { Unit } from '@/lib/types';

/** Mediana de valores estrictamente > 0; sin datos útiles → null. */
export function medianPositive(values: number[]): number | null {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!valid.length) return null;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) return valid[mid]!;
  return (valid[mid - 1]! + valid[mid]!) / 2;
}

export function arithmeticMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Redondeo de cantidad sugerida coherente con unidad de pedido (mismo criterio que nuevo pedido). */
export function roundOrderQtyFromHistory(unit: Unit, raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (unitAllowsDecimalOrderQuantity(unit)) return Math.max(0.01, Math.round(raw * 100) / 100);
  return Math.max(1, Math.round(raw));
}
