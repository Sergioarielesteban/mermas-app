import type { Unit } from '@/lib/types';

/** Un tap +/− añade o quita siempre una unidad lógica (1 kg, 1 caja, 1 ud, etc.). */
export function applyQuantityTapDelta(unit: Unit, current: number, deltaSteps: number): number {
  const raw = current + deltaSteps;
  const u = String(unit).toLowerCase();
  if (u === 'kg') return Math.max(0, Math.round(raw * 100) / 100);
  return Math.max(0, Math.floor(raw));
}

/** Entrada manual: kg con decimales; resto enteros. */
export function parseQuantityManualInput(unit: Unit, raw: string): number | null {
  if (raw.trim() === '') return 0;
  const num = Number(raw.replace(',', '.'));
  if (Number.isNaN(num) || num < 0) return null;
  const u = String(unit).toLowerCase();
  if (u === 'kg') return Math.round(num * 100) / 100;
  return Math.floor(num);
}
