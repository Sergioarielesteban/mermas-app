/**
 * Handler HTTP para POST /api/pedidos/ocr — solo Google Document AI (texto plano).
 */
import { NextResponse } from 'next/server';
import { requireAllowedSupabaseUser } from '@/lib/require-allowed-supabase-user';
import { logCriticalAndGeneric } from '@/lib/server/api-safe';
import { enforceRateLimitAuth } from '@/lib/server/security-rate-limit';
import { runOcrFromImageBytes } from '@/lib/ocr/index';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

function normaliseMime(raw: unknown): string {
  if (typeof raw !== 'string') return 'image/jpeg';
  const m = raw.trim().toLowerCase();
  return ALLOWED_MIMES.has(m) ? m : 'image/jpeg';
}

export async function handlePedidosOcrPost(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAllowedSupabaseUser(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: auth.status });
    }

    const rl = enforceRateLimitAuth(request, auth.userId, 'ocr');
    if (rl) return rl;

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

    const mimeType = normaliseMime(form.get('mimeType'));
    const result = await runOcrFromImageBytes(buf, mimeType);
    const text = result.rawText ?? '';
    return NextResponse.json({ ok: true, text, result });
  } catch (err) {
    return logCriticalAndGeneric('POST /api/pedidos/ocr', err);
  }
}
