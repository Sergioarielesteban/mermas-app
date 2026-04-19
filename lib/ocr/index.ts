/**
 * Punto de entrada servidor: elige proveedor según OCR_PROVIDER y devuelve resultado normalizado.
 */
import { getConfiguredOcrProvider } from '@/lib/ocr/config';
import { extractTextractDocument } from '@/lib/ocr/providers/textract';
import { normalizeTextractRaw } from '@/lib/ocr/normalize';
import type { NormalizedOCRResult } from '@/lib/ocr/types';
import { logSecurityEvent } from '@/lib/server/security-log';

export type { NormalizedOCRResult } from '@/lib/ocr/types';

export async function runOcrFromImageBytes(imageBytes: Buffer): Promise<NormalizedOCRResult> {
  const id = getConfiguredOcrProvider();
  try {
    if (id === 'textract') {
      const raw = await extractTextractDocument(imageBytes);
      return normalizeTextractRaw(raw);
    }
  } catch (e) {
    logSecurityEvent('critical', { ocr: 'extract_failed', provider: id });
    throw e;
  }
  logSecurityEvent('critical', { ocr: 'unsupported_provider', provider: id });
  throw new Error('ocr_provider_unsupported');
}
