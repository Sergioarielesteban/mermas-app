import type { NormalizedOCRResult } from '@/lib/ocr/types';
import type { DocumentAiResult } from '@/lib/ocr/providers/document-ai';

/** Mapea salida de Document AI al contrato normalizado (líneas estructuradas = fase Gemini en /api/ocr/process). */
export function normalizeDocumentAiRaw(raw: DocumentAiResult): NormalizedOCRResult {
  return {
    provider: 'document-ai',
    rawText: raw.plainText,
    supplierHint: null,
    documentDate: null,
    invoiceNumber: null,
    items: [],
    totals: undefined,
    warnings: [],
  };
}
