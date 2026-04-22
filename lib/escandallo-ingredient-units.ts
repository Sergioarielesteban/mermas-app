/**
 * Unidades de ingrediente en escandallo (líneas de receta).
 * Deben coincidir con `purchase_articles.unidad_uso` para aplicar coste_unitario_uso.
 */
export type EscandalloIngredientUnit = string;

const MAX_LEN = 48;

/** Sugerencias en UI (también se admite texto libre válido). */
export const ESCANDALLO_USAGE_UNIT_PRESETS = [
  'kg',
  'g',
  'l',
  'ml',
  'ud',
  'ración',
  'porción',
  'loncha',
  'pieza',
  'bandeja',
  'caja',
  'bote',
  'bolsa',
  'servicio',
  'paquete',
] as const;

const UNIT_PATTERN = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9 _\-.]+$/u;

export function validateEscandalloUsageUnitInput(raw: string | null | undefined): string | null {
  const t = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!t) return 'La unidad de uso no puede estar vacía.';
  if (t.length > MAX_LEN) return `Máximo ${MAX_LEN} caracteres.`;
  if (!UNIT_PATTERN.test(t)) return 'Unidad no válida: usa letras, números, espacio, guión, punto o guion bajo.';
  return null;
}

/** Normaliza para persistir en escandallo / comparar con master; valores inválidos → "ud". */
export function sanitizeEscandalloIngredientUnit(raw: string): EscandalloIngredientUnit {
  const t = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_LEN);
  if (!t || !UNIT_PATTERN.test(t)) return 'ud';
  return t;
}

function compareKey(u: string): string {
  return u
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');
}

/** Comparación insensible a mayúsculas / acentos (p. ej. ración vs racion). */
export function unitsMatchForIngredientCost(a: string, b: string | null | undefined): boolean {
  if (b == null || String(b).trim() === '') return false;
  return compareKey(a) === compareKey(b);
}
