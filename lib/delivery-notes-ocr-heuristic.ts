/**
 * Extracción heurística desde texto OCR (Textract) sin pedido asociado.
 * Siempre revisar en UI; no sustituye validación humana.
 */

import type { Unit } from '@/lib/types';

export type ParsedDeliveryNoteHeader = {
  supplierGuess: string;
  numberGuess: string;
  dateGuess: string | null;
  totalGuess: number | null;
  taxGuess: number | null;
};

export type ParsedDeliveryNoteLine = {
  supplierProductName: string;
  quantity: number;
  unit: Unit;
  unitPrice: number | null;
  lineSubtotal: number | null;
};

function extractNumbers(line: string): number[] {
  const raw = line.replace(/\s+/g, ' ');
  const re = /(\d+(?:[.,]\d+)?)/g;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const n = Number(m[1].replace(',', '.'));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function detectUnitInLine(line: string): Unit {
  const L = line.toLowerCase();
  if (/\bkg\b|kilos?/i.test(L)) return 'kg';
  if (/\bcaj/i.test(L)) return 'caja';
  if (/\bbols/i.test(L)) return 'bolsa';
  if (/\brac/i.test(L)) return 'racion';
  if (/\bpaq/i.test(L)) return 'paquete';
  if (/\bband/i.test(L)) return 'bandeja';
  return 'ud';
}

export function parseDeliveryNoteHeaderFromOcr(text: string): ParsedDeliveryNoteHeader {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const full = text.trim();

  let numberGuess = '';
  const numM = full.match(/\b(?:alb|albar[aá]n|n[º°]|núm|num|fact)\.?\s*[:\s]?\s*([A-Z0-9/\-]{4,})/i);
  if (numM) numberGuess = numM[1] ?? '';

  let dateGuess: string | null = null;
  const dM = full.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (dM) dateGuess = `${dM[1]}/${dM[2]}/${dM[3]}`;

  let totalGuess: number | null = null;
  const totM = full.match(/\b(?:total|importe)\s*[:\s]?\s*(\d+[.,]\d{2})\b/i);
  if (totM) {
    const v = Number(totM[1].replace(',', '.'));
    if (Number.isFinite(v)) totalGuess = Math.round(v * 100) / 100;
  }

  let taxGuess: number | null = null;
  const ivaM = full.match(/\b(?:iva|i\.v\.a\.)\s*[:\s]?\s*(\d+[.,]\d{2})\b/i);
  if (ivaM) {
    const v = Number(ivaM[1].replace(',', '.'));
    if (Number.isFinite(v)) taxGuess = Math.round(v * 100) / 100;
  }

  let supplierGuess = '';
  for (const line of lines.slice(0, 8)) {
    if (/^total\b|^importe\b|^fecha\b|^alb/i.test(line)) continue;
    if (line.length >= 4 && line.length < 120 && extractNumbers(line).length <= 1) {
      supplierGuess = line;
      break;
    }
  }

  return { supplierGuess, numberGuess, dateGuess, totalGuess, taxGuess };
}

/**
 * Líneas tipo detalle: busca filas con al menos dos números (cantidad / precio o importe).
 */
export function parseDeliveryNoteLinesFromOcr(text: string): ParsedDeliveryNoteLine[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: ParsedDeliveryNoteLine[] = [];

  for (const line of lines) {
    if (/^total\b|^subtotal\b|^iva\b|^base\b|^albar/i.test(line)) continue;
    if (line.length < 4) continue;
    const nums = extractNumbers(line);
    if (nums.length < 2) continue;

    const unit = detectUnitInLine(line);
    let quantity = nums[0];
    let unitPrice: number | null = nums[1];
    let lineSubtotal: number | null = null;

    if (nums.length >= 3) {
      const a = nums[0];
      const b = nums[1];
      const c = nums[2];
      if (a > 0 && a < 10000 && b > 0.005 && b < 500 && c > 0.01 && c < 100000) {
        quantity = a;
        unitPrice = b;
        lineSubtotal = Math.round(c * 100) / 100;
      }
    }

    if (quantity <= 0 || quantity > 100000) continue;
    if (unitPrice != null && (unitPrice <= 0 || unitPrice > 50000)) unitPrice = null;

    const namePart = line
      .replace(/\d+[.,]\d+|\d+/g, ' ')
      .replace(/[€$]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (namePart.length < 2) continue;

    out.push({
      supplierProductName: namePart.slice(0, 200),
      quantity: Math.round(quantity * 10000) / 10000,
      unit,
      unitPrice: unitPrice != null ? Math.round(unitPrice * 10000) / 10000 : null,
      lineSubtotal,
    });
  }

  return out.slice(0, 80);
}

export function parseYmdFromGuess(dateGuess: string | null): string | null {
  if (!dateGuess) return null;
  const m = dateGuess.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return null;
  let d = Number(m[1]);
  let mo = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const mm = String(mo).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}
