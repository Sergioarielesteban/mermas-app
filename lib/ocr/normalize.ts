import type { NormalizedOCRResult } from '@/lib/ocr/types';
import type { TextractRawOutput } from '@/lib/ocr/providers/textract';

/** Mapea salida cruda de Textract al contrato normalizado (heurísticas de líneas = fase posterior si aplica). */
export function normalizeTextractRaw(raw: TextractRawOutput): NormalizedOCRResult {
  return {
    provider: 'textract',
    rawText: raw.plainText,
    supplierHint: null,
    documentDate: null,
    invoiceNumber: null,
    items: [],
    totals: undefined,
    warnings: [],
  };
}
