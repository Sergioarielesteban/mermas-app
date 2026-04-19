import type { OcrProviderId } from './registry';

/**
 * Proveedor OCR en servidor. Añadir nuevos valores en `registry.ts` y su adaptador.
 * @example OCR_PROVIDER=textract
 */
export function getConfiguredOcrProvider(): OcrProviderId {
  const raw = (process.env.OCR_PROVIDER ?? 'textract').trim().toLowerCase();
  if (raw === 'textract') return 'textract';
  return 'textract';
}
