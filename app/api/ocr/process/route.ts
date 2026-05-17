/**
 * POST /api/ocr/process
 *
 * Pipeline de OCR estructurado para albaranes:
 *   1. Auth (Bearer Supabase) + rate-limit.
 *   2. Document AI → texto + entidades.
 *   3. Gemini → JSON tipado (AlbaranOcrPayload).
 *   4. (opcional) si llega `relatedOrderId` + `localId`: cruce contra el pedido
 *      + catálogo del proveedor → diff report.
 *
 * Devuelve JSON sin lógica de UI. La persistencia (delivery_notes / items) la
 * hace el cliente para mantener el endpoint reutilizable también desde
 * recepción dentro de pedido, scripts batch, etc.
 *
 * Errores:
 *   - 401 sin sesión.
 *   - 413 archivo > 8 MB (margen para PDF multi-página).
 *   - 503 si Document AI o Gemini no están configurados (envs).
 *   - 422 si Gemini no devuelve JSON válido.
 *   - 500 con código sanitizado (sin filtrar credenciales) para errores internos.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAllowedSupabaseUser } from '@/lib/require-allowed-supabase-user';
import { logCriticalAndGeneric } from '@/lib/server/api-safe';
import { enforceRateLimitAuth } from '@/lib/server/security-rate-limit';
import { logSecurityEvent } from '@/lib/server/security-log';
import { isDocumentAiConfigured, processDocumentAi } from '@/lib/ocr/providers/document-ai';
import { interpretAlbaranWithGemini, isGeminiConfigured } from '@/lib/ocr/gemini-interpreter';
import { compareOcrWithOrderAndCatalog, masterProductsFromSupplier } from '@/lib/ocr/compare-with-order';
import { fetchOrderById, fetchSuppliersWithProducts, type PedidoOrder } from '@/lib/pedidos-supabase';
import type {
  AlbaranOcrPayload,
  AlbaranOcrProcessResponse,
  AlbaranDiffReport,
} from '@/lib/ocr/types-document';

export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

// Document AI no soporta heic/heif — los rechazamos aquí con mensaje claro.
const ALLOWED_MIMES = new Set<string>([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/tiff',
  'application/pdf',
]);

// Tipos recibidos habitualmente que NO son soportados → mensaje explícito
const KNOWN_UNSUPPORTED_MIMES: Record<string, string> = {
  'image/heic': 'HEIC no es compatible. Convierte a JPEG o PNG antes de subir.',
  'image/heif': 'HEIF no es compatible. Convierte a JPEG o PNG antes de subir.',
  'application/octet-stream': 'El archivo llegó como octet-stream (formato desconocido). Sube un JPEG, PNG o PDF.',
};

function normaliseMime(raw: string | null | undefined, fileName: string | null): string {
  const m = (raw ?? '').toLowerCase();
  if (ALLOWED_MIMES.has(m)) return m;
  // Inferir por extensión del nombre
  const name = (fileName ?? '').toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.tif') || name.endsWith('.tiff')) return 'image/tiff';
  // Devolver el mime original para que la validación posterior lo rechace con mensaje claro
  return m || 'image/jpeg';
}

function unsupportedMimeReason(mime: string): string | null {
  if (ALLOWED_MIMES.has(mime)) return null;
  return KNOWN_UNSUPPORTED_MIMES[mime] ?? `Formato "${mime}" no compatible. Usa JPEG, PNG, WEBP, TIFF o PDF.`;
}

function bearerJwt(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}

function userScopedSupabaseClient(jwt: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('supabase_env_missing');
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function buildDiffReport(
  payload: AlbaranOcrPayload,
  opts: { jwt: string; localId: string; relatedOrderId: string | null },
): Promise<AlbaranDiffReport | null> {
  if (!opts.relatedOrderId && !opts.localId) return null;
  let order: PedidoOrder | null = null;
  try {
    const supabase = userScopedSupabaseClient(opts.jwt);
    if (opts.relatedOrderId) {
      order = await fetchOrderById(supabase, opts.localId, opts.relatedOrderId);
    }
    const suppliers = await fetchSuppliersWithProducts(supabase, opts.localId);
    const supplier =
      (order && suppliers.find((s) => s.id === order!.supplierId)) ||
      // fallback: match por nombre detectado.
      (payload.supplier.name
        ? suppliers.find(
            (s) => s.name.trim().toLowerCase() === payload.supplier.name!.trim().toLowerCase(),
          )
        : null) ||
      null;
    const catalog = supplier
      ? masterProductsFromSupplier(supplier.id, supplier.name, supplier.products)
      : [];
    return compareOcrWithOrderAndCatalog(payload, order, catalog);
  } catch (e) {
    logSecurityEvent('critical', {
      ocr: 'diff_failed',
      error: e instanceof Error ? e.message : 'unknown',
    });
    return null;
  }
}

export async function POST(request: Request): Promise<NextResponse<AlbaranOcrProcessResponse>> {
  const t0 = Date.now();
  try {
    const auth = await requireAllowedSupabaseUser(request);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' } satisfies AlbaranOcrProcessResponse,
        { status: auth.status },
      );
    }

    const rl = enforceRateLimitAuth(request, auth.userId, 'ocr');
    if (rl) return rl as unknown as NextResponse<AlbaranOcrProcessResponse>;

    if (!isDocumentAiConfigured() || !isGeminiConfigured()) {
      logSecurityEvent('critical', {
        ocr: 'process_not_configured',
        documentAi: isDocumentAiConfigured(),
        gemini: isGeminiConfigured(),
      });
      return NextResponse.json(
        {
          ok: false,
          error: 'ocr_provider_not_configured',
          reason:
            'Faltan variables: GOOGLE_CLOUD_PROJECT_ID, GOOGLE_DOCUMENT_AI_LOCATION, GOOGLE_DOCUMENT_AI_PROCESSOR_ID, GOOGLE_SERVICE_ACCOUNT_JSON y/o GEMINI_API_KEY.',
        } satisfies AlbaranOcrProcessResponse,
        { status: 503 },
      );
    }

    const form = await request.formData();
    const file = form.get('image') ?? form.get('file');
    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { ok: false, error: 'invalid_request', reason: 'Missing file field "image".' },
        { status: 400 },
      );
    }
    const fileName = file instanceof File ? file.name : null;
    const mimeType = normaliseMime(file.type, fileName);
    const mimeError = unsupportedMimeReason(mimeType);
    if (mimeError) {
      console.warn('[ocr/process] MIME rechazado:', { raw: file.type, normalised: mimeType, fileName });
      return NextResponse.json(
        { ok: false, error: 'invalid_mime_type', reason: mimeError },
        { status: 415 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const fileSizeKb = Math.round(buf.length / 1024);
    if (buf.length === 0) {
      return NextResponse.json({ ok: false, error: 'empty_file', reason: 'El archivo está vacío.' }, { status: 400 });
    }
    if (buf.length > MAX_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          error: 'file_too_large',
          reason: `El archivo pesa ${fileSizeKb} KB; el máximo permitido es ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB.`,
        },
        { status: 413 },
      );
    }

    console.info(
      '[ocr/process] request',
      JSON.stringify({ mimeType, fileSizeKb, fileName: fileName ?? '(sin nombre)' }),
    );

    const relatedOrderId =
      typeof form.get('relatedOrderId') === 'string'
        ? String(form.get('relatedOrderId')).trim() || null
        : null;

    // 1) Document AI
    let docAiResult;
    try {
      docAiResult = await processDocumentAi(buf, mimeType);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const hint = (e as Error & { googleHint?: string }).googleHint;
      const code = (e as Error & { googleCode?: number | string }).googleCode;

      logSecurityEvent('critical', {
        ocr: 'document_ai_failed',
        error: errMsg,
        code,
        hint,
      });

      // Detectar errores de MIME dentro del provider (e.g. heic detectado tarde)
      if (errMsg.startsWith('document_ai_mime_not_supported')) {
        return NextResponse.json(
          { ok: false, error: 'invalid_mime_type', reason: errMsg.replace('document_ai_mime_not_supported: ', '') },
          { status: 415 },
        );
      }

      // Errores de config
      if (errMsg.startsWith('document_ai_config_missing') || errMsg.startsWith('document_ai_service_account_invalid')) {
        return NextResponse.json(
          {
            ok: false,
            error: 'ocr_provider_not_configured',
            reason: `Config incompleta: ${errMsg.replace(/^document_ai_\w+: /, '')}`,
          },
          { status: 503 },
        );
      }

      // Error real de Google — exponer detalles sin filtrar
      return NextResponse.json(
        {
          ok: false,
          error: 'document_ai_failed',
          reason: errMsg,
          ...(hint ? { hint } : {}),
          ...(code !== undefined ? { googleCode: code } : {}),
        },
        { status: 502 },
      );
    }

    // 2) Gemini
    let payload: AlbaranOcrPayload;
    try {
      payload = await interpretAlbaranWithGemini({
        ocrText: docAiResult.plainText,
        entities: docAiResult.entities,
        documentAiProcessor: docAiResult.processor,
        documentAiDurationMs: docAiResult.durationMs,
        pageCount: docAiResult.pageCount,
        mimeType,
      });
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown';
      if (code === 'gemini_invalid_response') {
        return NextResponse.json(
          { ok: false, error: 'gemini_invalid_response', reason: 'Gemini no devolvió JSON válido.' },
          { status: 422 },
        );
      }
      logSecurityEvent('critical', { ocr: 'gemini_failed', error: code });
      return NextResponse.json(
        { ok: false, error: 'gemini_failed', reason: 'No se pudo interpretar el albarán.' },
        { status: 502 },
      );
    }

    // 3) Diff opcional
    const jwt = bearerJwt(request);
    const diff =
      jwt && (relatedOrderId || auth.localId)
        ? await buildDiffReport(payload, { jwt, localId: auth.localId, relatedOrderId })
        : null;

    payload.meta.totalDurationMs = Date.now() - t0;

    // Log estructurado de éxito (no usa security-log para no inflar el canal critical).
    try {
      console.info(
        '[ocr/process]',
        JSON.stringify({
          ok: true,
          userId: auth.userId,
          pageCount: payload.meta.pageCount ?? 0,
          lines: payload.lines.length,
          documentAiMs: payload.meta.documentAiDurationMs ?? 0,
          geminiMs: payload.meta.geminiDurationMs ?? 0,
          totalMs: payload.meta.totalDurationMs,
        }),
      );
    } catch {
      // Logging no debe romper la respuesta.
    }

    return NextResponse.json({
      ok: true,
      payload,
      diff: diff ?? undefined,
      durationMs: payload.meta.totalDurationMs,
    } satisfies AlbaranOcrProcessResponse);
  } catch (err) {
    return logCriticalAndGeneric('POST /api/ocr/process', err) as NextResponse<AlbaranOcrProcessResponse>;
  }
}
