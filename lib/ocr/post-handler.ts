/**
 * Handler HTTP para POST /api/pedidos/ocr — solo Google Document AI (texto plano).
 */
import { NextResponse } from 'next/server';
import { requireAllowedSupabaseUser } from '@/lib/require-allowed-supabase-user';
import { logCriticalAndGeneric } from '@/lib/server/api-safe';
import { enforceRateLimitAuth } from '@/lib/server/security-rate-limit';
import { runOcrFromImageBytes } from '@/lib/ocr/index';
import { isDocumentAiConfigured } from '@/lib/ocr/providers/document-ai';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Document AI soporta estos tipos directamente.
const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/tiff',
  'application/pdf',
]);

// Tipos conocidos incompatibles → mensaje claro en lugar de silencio
const KNOWN_UNSUPPORTED: Record<string, string> = {
  'image/heic': 'Formato HEIC no compatible con Document AI. Convierte a JPEG o PNG.',
  'image/heif': 'Formato HEIF no compatible con Document AI. Convierte a JPEG o PNG.',
  'application/octet-stream': 'El archivo llegó como octet-stream (tipo desconocido). Sube un JPEG, PNG o PDF.',
};

/**
 * Devuelve el mime normalizado si está permitido, o lanza un Error con mensaje
 * explícito si el formato no es compatible.
 */
function normaliseMimeStrict(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    // Sin mime declarado: intentar como JPEG (el cliente siempre debería enviarlo)
    return 'image/jpeg';
  }
  const m = raw.trim().toLowerCase();
  if (ALLOWED_MIMES.has(m)) return m;
  const hint = KNOWN_UNSUPPORTED[m];
  if (hint) throw new Error(`mime_not_supported: ${hint}`);
  throw new Error(`mime_not_supported: Formato "${m}" no compatible. Usa JPEG, PNG, WEBP, TIFF o PDF.`);
}

export async function handlePedidosOcrPost(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAllowedSupabaseUser(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: auth.status });
    }

    const rl = enforceRateLimitAuth(request, auth.userId, 'ocr');
    if (rl) return rl;

    if (!isDocumentAiConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error: 'ocr_provider_not_configured',
          reason:
            'Faltan variables OCR: GOOGLE_CLOUD_PROJECT_ID, GOOGLE_DOCUMENT_AI_LOCATION, GOOGLE_DOCUMENT_AI_PROCESSOR_ID y GOOGLE_SERVICE_ACCOUNT_JSON.',
        },
        { status: 503 },
      );
    }

    const form = await request.formData();
    const image = form.get('image');
    if (!(image instanceof Blob)) {
      return NextResponse.json({ ok: false, error: 'Request failed' }, { status: 400 });
    }

    const buf = Buffer.from(await image.arrayBuffer());
    if (buf.length === 0) {
      return NextResponse.json({ ok: false, error: 'Request failed' }, { status: 400 });
    }
    if (buf.length > MAX_IMAGE_BYTES) {
      return NextResponse.json({ ok: false, error: 'Request failed' }, { status: 413 });
    }

    let mimeType: string;
    try {
      mimeType = normaliseMimeStrict(form.get('mimeType'));
    } catch (mimeErr) {
      const reason = mimeErr instanceof Error ? mimeErr.message.replace('mime_not_supported: ', '') : 'Formato no compatible.';
      console.warn('[pedidos/ocr] MIME rechazado:', form.get('mimeType'), '→', reason);
      return NextResponse.json({ ok: false, error: 'invalid_mime_type', reason }, { status: 415 });
    }

    console.info('[pedidos/ocr] request', JSON.stringify({ mimeType, fileSizeKb: Math.round(buf.length / 1024) }));

    const result = await runOcrFromImageBytes(buf, mimeType);
    const text = result.rawText ?? '';
    return NextResponse.json({ ok: true, text, result });
  } catch (err) {
    if (err instanceof Error) {
      const msg = err.message;
      // MIME detectado tarde (desde el provider)
      if (msg.startsWith('document_ai_mime_not_supported') || msg.startsWith('mime_not_supported')) {
        return NextResponse.json(
          { ok: false, error: 'invalid_mime_type', reason: msg.replace(/^[^:]+: /, '') },
          { status: 415 },
        );
      }
      // Config incompleta
      if (msg.startsWith('document_ai_config_missing') || msg.startsWith('document_ai_service_account_invalid')) {
        return NextResponse.json(
          { ok: false, error: 'ocr_provider_not_configured', reason: msg.replace(/^document_ai_\w+: ?/, '') || 'Faltan variables de entorno de Document AI.' },
          { status: 503 },
        );
      }
      // Error real de Google (enriquecido por el provider)
      if (msg.startsWith('document_ai_google_error')) {
        const hint = (err as Error & { googleHint?: string }).googleHint;
        const code = (err as Error & { googleCode?: number | string }).googleCode;
        console.error('[pedidos/ocr] Google error:', { msg, hint, code });
        return NextResponse.json(
          {
            ok: false,
            error: 'document_ai_failed',
            reason: msg,
            ...(hint ? { hint } : {}),
            ...(code !== undefined ? { googleCode: code } : {}),
          },
          { status: 502 },
        );
      }
      // Cualquier otro error con prefijo document_ai_
      if (msg.startsWith('document_ai_')) {
        return NextResponse.json(
          { ok: false, error: msg, reason: msg },
          { status: 502 },
        );
      }
    }
    return logCriticalAndGeneric('POST /api/pedidos/ocr', err);
  }
}
