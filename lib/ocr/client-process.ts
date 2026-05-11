/**
 * Cliente tipado del endpoint /api/ocr/process.
 *
 * Pensado para el componente `AlbaranOcrLauncher` y para cualquier otro flujo
 * (recepción dentro de pedido, scripts) que quiera el payload estructurado.
 */

import type {
  AlbaranOcrPayload,
  AlbaranDiffReport,
  AlbaranOcrProcessResponse,
} from '@/lib/ocr/types-document';

export type RunAlbaranOcrProcessInput = {
  blobOrFile: Blob | File;
  accessToken: string;
  /** Si se pasa, el servidor cruzará el albarán contra ese pedido. */
  relatedOrderId?: string | null;
  /** Filename opcional para que el server tenga pistas de MIME (PDF / imagen). */
  fileName?: string;
};

export type RunAlbaranOcrProcessOk = {
  ok: true;
  payload: AlbaranOcrPayload;
  diff: AlbaranDiffReport | null;
  durationMs: number;
};

export type RunAlbaranOcrProcessErr = {
  ok: false;
  status: number;
  error: string;
  reason?: string;
};

export type RunAlbaranOcrProcessResult = RunAlbaranOcrProcessOk | RunAlbaranOcrProcessErr;

/**
 * Llama al endpoint y devuelve un resultado tipado.
 *
 * No lanza excepciones: el llamante debe inspeccionar `result.ok`. Esto facilita
 * encadenar fallbacks (p. ej. caer al OCR legacy si el endpoint no está configurado).
 */
export async function runAlbaranOcrProcess(
  input: RunAlbaranOcrProcessInput,
): Promise<RunAlbaranOcrProcessResult> {
  const form = new FormData();
  form.append('image', input.blobOrFile, input.fileName ?? 'albaran');
  if (input.relatedOrderId) form.append('relatedOrderId', input.relatedOrderId);

  let res: Response;
  try {
    res = await fetch('/api/ocr/process', {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.accessToken}` },
      body: form,
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: 'network_error',
      reason: e instanceof Error ? e.message : 'unknown',
    };
  }

  let body: AlbaranOcrProcessResponse | null = null;
  try {
    body = (await res.json()) as AlbaranOcrProcessResponse;
  } catch {
    body = null;
  }

  if (!res.ok || !body || body.ok !== true) {
    return {
      ok: false,
      status: res.status,
      error: body && 'error' in body ? body.error : `http_${res.status}`,
      reason: body && 'reason' in body ? body.reason : undefined,
    };
  }

  return {
    ok: true,
    payload: body.payload,
    diff: body.diff ?? null,
    durationMs: body.durationMs,
  };
}
