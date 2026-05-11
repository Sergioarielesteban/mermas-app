/**
 * Punto de entrada servidor: OCR de albaranes solo con Google Document AI.
 */
import { isDocumentAiConfigured, processDocumentAi } from '@/lib/ocr/providers/document-ai';
import { normalizeDocumentAiRaw } from '@/lib/ocr/normalize';
import type { NormalizedOCRResult } from '@/lib/ocr/types';
import { logSecurityEvent } from '@/lib/server/security-log';

export type { NormalizedOCRResult } from '@/lib/ocr/types';

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/tiff',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

function normaliseMime(raw: string | undefined): string {
  const m = (raw ?? '').toLowerCase().trim();
  if (ALLOWED_MIMES.has(m)) return m;
  return 'image/jpeg';
}

export async function runOcrFromImageBytes(
  imageBytes: Buffer,
  mimeType?: string,
): Promise<NormalizedOCRResult> {
  if (!isDocumentAiConfigured()) {
    logSecurityEvent('critical', { ocr: 'document_ai_not_configured' });
    throw new Error('document_ai_config_missing');
  }
  const mime = normaliseMime(mimeType);
  try {
    const raw = await processDocumentAi(imageBytes, mime);
    return normalizeDocumentAiRaw(raw);
  } catch (e) {
    logSecurityEvent('critical', {
      ocr: 'extract_failed',
      provider: 'document-ai',
      error: e instanceof Error ? e.message : 'unknown',
    });
    throw e;
  }
}
