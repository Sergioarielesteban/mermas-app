/**
 * Parseo y formato unificado de importes (coma decimal ES, miles 1.234,56).
 * Cálculos internos en number; UI siempre 2 decimales para dinero.
 */

/** Interpreta cadenas de importe tecleadas en cocina. */
export function parsePriceInput(raw: string): number | null {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s/g, '');
  if (s === '') return null;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  let normalized: string;

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = s.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = s.replace(',', '.');
  } else if (hasDot) {
    const parts = s.split('.');
    if (
      parts.length === 2 &&
      /^\d+$/.test(parts[0] ?? '') &&
      /^\d{3}$/.test(parts[1] ?? '')
    ) {
      normalized = (parts[0] ?? '') + (parts[1] ?? '');
    } else if (parts.length > 2) {
      normalized = parts.join('');
    } else {
      normalized = s;
    }
  } else {
    normalized = s;
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Redondeo estándar para importes mostrados (2 decimales). */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** "23,89 €" */
export function formatMoneyEur(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return (
    new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value) + ' €'
  );
}

/** "0,68 €/ud" */
export function formatUnitPriceEur(value: number, unit: string): string {
  if (!Number.isFinite(value)) return '—';
  const u = String(unit || '').trim() || 'ud';
  const num = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${num} €/${u}`;
}

/**
 * Valor para inputs de texto (coma decimal), p. ej. rehidratar 8.15 → "8,15".
 */
export function formatDecimalInputEs(value: number, maxFractionDigits = 4): string {
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}
