/**
 * Normalizador inteligente OCR ↔ catálogo master.
 *
 * Reglas clave (impuestas por el negocio):
 *   - Si el artículo master se compra por CAJA, se compara por CAJA. El OCR puede
 *     traer "12 kg" y precio "€/kg", pero NO convertimos cajas a kg ni viceversa.
 *   - Si el artículo se compra por KG, se compara por KG.
 *   - Si el artículo se compra por UD (unidad), se compara por UD.
 *   - Una línea OCR con `weightKg` solo se usa para validar consistencia (señal
 *     de "peso real recibido"), no para reemplazar la cantidad de compra.
 *
 * El normalizador devuelve, por cada línea OCR, el "candidato" matched más probable
 * dentro del catálogo del proveedor, junto a un score de confianza.
 */

import type { Unit } from '@/lib/types';
import type { AlbaranOcrLine, AlbaranMasterProduct } from '@/lib/ocr/types-document';

export type LineMatchCandidate = {
  product: AlbaranMasterProduct;
  /** Score [0..1] basado en tokens, código y unidad. */
  score: number;
  reason: string;
};

export type LineMatchResult = {
  ocrLineIndex: number;
  best: LineMatchCandidate | null;
  alternatives: LineMatchCandidate[];
};

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

function tokenize(s: string): string[] {
  return stripAccents(s.toLowerCase())
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const uni = A.size + B.size - inter;
  if (uni === 0) return 0;
  return inter / uni;
}

/** Compatibilidad de unidad OCR ↔ unidad master. */
export function unitsCompatible(ocrUnit: string | null, masterUnit: Unit): boolean {
  if (!ocrUnit) return true; // sin unidad, no penaliza
  const o = ocrUnit.toLowerCase();
  if (o === masterUnit) return true;
  // g ↔ kg: el OCR puede traer gramos cuando el master compra kg. Compatible.
  if (masterUnit === 'kg' && (o === 'g' || o === 'kg')) return true;
  // ml ↔ l: idem.
  if (masterUnit === 'ud' && (o === 'ud' || o === 'paquete' || o === 'bandeja' || o === 'bolsa'))
    return true;
  // En caja/bandeja/paquete/bolsa: si master es uno y OCR otro de los envases,
  // marcamos como NO compatibles para forzar diff "unit_diff" si no coincide.
  return false;
}

function scoreCandidate(line: AlbaranOcrLine, product: AlbaranMasterProduct): LineMatchCandidate | null {
  const descTokens = tokenize(line.description);
  const productTokens = tokenize(product.name);
  const aliasTokens = product.aliases.flatMap(tokenize);
  const allProductTokens = Array.from(new Set([...productTokens, ...aliasTokens]));

  if (descTokens.length === 0 || allProductTokens.length === 0) return null;

  let score = jaccard(descTokens, allProductTokens);
  let reason = `tokens(${score.toFixed(2)})`;

  // Bonus por coincidencia exacta de código.
  if (line.supplierProductCode && product.id === line.supplierProductCode) {
    score = Math.min(1, score + 0.45);
    reason += '+code_match';
  }

  // Bonus si unidad compatible.
  if (unitsCompatible(line.unit, product.purchaseUnit)) {
    score = Math.min(1, score + 0.05);
  } else {
    score = Math.max(0, score - 0.15);
    reason += '-unit_mismatch';
  }

  if (score <= 0.05) return null;
  return { product, score, reason };
}

/**
 * Para cada línea del OCR busca el mejor producto del catálogo del proveedor.
 * Devuelve hasta 3 alternativas ordenadas por score.
 */
export function matchOcrLinesAgainstCatalog(
  ocrLines: AlbaranOcrLine[],
  catalog: AlbaranMasterProduct[],
): LineMatchResult[] {
  return ocrLines.map((line, i) => {
    const scored = catalog
      .map((p) => scoreCandidate(line, p))
      .filter((x): x is LineMatchCandidate => x !== null)
      .sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 3);
    return {
      ocrLineIndex: i,
      best: top[0] ?? null,
      alternatives: top.slice(1),
    };
  });
}
