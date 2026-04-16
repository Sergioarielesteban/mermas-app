import type { PedidoOrderItem } from '@/lib/pedidos-supabase';

export type AlbaranOcrLineSuggestion = {
  itemId: string;
  productName: string;
  unit: PedidoOrderItem['unit'];
  /** Línea del OCR usada (recorte) */
  matchedSnippet: string;
  confidence: 'baja' | 'media' | 'alta';
  receivedQuantity?: number;
  pricePerUnit?: number;
  receivedWeightKg?: number;
  receivedPricePerKg?: number;
};

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

function significantTokens(name: string): string[] {
  return stripAccents(name.toUpperCase())
    .split(/[^A-ZÁÉÍÓÚÜÑ0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

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

function lineScore(line: string, productName: string): number {
  const L = stripAccents(line.toUpperCase());
  let s = 0;
  for (const t of significantTokens(productName)) {
    if (L.includes(t)) s += 1;
  }
  return s;
}

function pickBestLine(ocrText: string, productName: string): { line: string; score: number } | null {
  const lines = ocrText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  let best: { line: string; score: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const combined = [lines[i], lines[i + 1]].filter(Boolean).join(' ');
    for (const candidate of [lines[i], combined]) {
      const sc = lineScore(candidate, productName);
      const nums = extractNumbers(candidate);
      if (nums.length === 0) continue;
      if (!best || sc > best.score || (sc === best.score && nums.length > extractNumbers(best.line).length)) {
        best = { line: candidate.slice(0, 220), score: sc };
      }
    }
  }
  return best;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Heurística sobre texto OCR + líneas del pedido. Siempre revisar en UI antes de aplicar.
 */
export function buildAlbaranSuggestionsFromOcr(ocrText: string, items: PedidoOrderItem[]): AlbaranOcrLineSuggestion[] {
  const full = ocrText.trim();
  if (!full) return [];

  const out: AlbaranOcrLineSuggestion[] = [];

  for (const item of items) {
    const picked = pickBestLine(full, item.productName);
    if (!picked || picked.score < 1) continue;

    const nums = extractNumbers(picked.line);
    if (nums.length === 0) continue;

    const snippet = picked.line.replace(/\s+/g, ' ').trim();
    let confidence: AlbaranOcrLineSuggestion['confidence'] = picked.score >= 2 ? 'alta' : picked.score >= 1 ? 'media' : 'baja';

    const sug: AlbaranOcrLineSuggestion = {
      itemId: item.id,
      productName: item.productName,
      unit: item.unit,
      matchedSnippet: snippet,
      confidence,
    };

    const isKgUnit = item.unit === 'kg';
    const supportsScale = item.unit === 'kg' || item.unit === 'bandeja' || item.unit === 'caja';

    let ppk: number | undefined;
    const ppkMatch = picked.line.match(/(\d+[.,]\d+)\s*(?:€|eur)?\s*\/\s*kg/i);
    if (ppkMatch) {
      const v = Number(ppkMatch[1].replace(',', '.'));
      if (Number.isFinite(v) && v > 0.01 && v < 200) ppk = round4(v);
    }

    let kgFromLine: number | undefined;
    const kgMatch = picked.line.match(/(\d+[.,]\d+)\s*kg\b/i);
    if (kgMatch) {
      const v = Number(kgMatch[1].replace(',', '.'));
      if (Number.isFinite(v) && v > 0 && v < 5000) kgFromLine = round2(v);
    }

    if (supportsScale && (kgFromLine != null || ppk != null)) {
      if (kgFromLine != null) sug.receivedWeightKg = kgFromLine;
      if (ppk != null) sug.receivedPricePerKg = ppk;
      if (nums.length >= 1 && ppk == null && nums[0] > 0 && nums[0] < 5000) {
        const maybePrice = nums.find((n) => n > 0.05 && n < 200 && n !== kgFromLine);
        if (maybePrice != null) sug.pricePerUnit = round2(maybePrice);
      }
      if (!isKgUnit && nums.length >= 1) {
        const maybeBoxes = nums.find((n) => n > 0 && n < 500 && (kgFromLine == null || Math.abs(n - kgFromLine) > 0.01));
        if (maybeBoxes != null && Number.isInteger(Math.round(maybeBoxes)) && maybeBoxes <= 200) {
          sug.receivedQuantity = round2(maybeBoxes);
        }
      }
      if (isKgUnit && kgFromLine != null) {
        sug.receivedQuantity = kgFromLine;
      }
      if (isKgUnit && kgFromLine == null && nums.length >= 2) {
        const a = nums[0];
        const b = nums[1];
        if (a > 0 && a < 5000 && b > 0.01 && b < 200) {
          sug.receivedWeightKg = round2(a);
          sug.receivedQuantity = round2(a);
          sug.pricePerUnit = round2(b);
        }
      }
    } else {
      if (nums.length >= 2) {
        const a = nums[0];
        const b = nums[1];
        if (a > 0 && a < 10000 && b > 0.005 && b < 5000) {
          sug.receivedQuantity = round2(a);
          sug.pricePerUnit = round2(b);
        }
      } else if (nums.length === 1) {
        const a = nums[0];
        if (a > 0.01 && a < 5000) {
          sug.pricePerUnit = round2(a);
        }
      }
    }

    const hasAny =
      sug.receivedQuantity != null ||
      sug.pricePerUnit != null ||
      sug.receivedWeightKg != null ||
      sug.receivedPricePerKg != null;
    if (hasAny) out.push(sug);
  }

  return out;
}
