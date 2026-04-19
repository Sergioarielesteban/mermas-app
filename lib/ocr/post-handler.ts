/**
 * Handler HTTP compartido para POST /api/pedidos/ocr y alias /api/pedidos/textract.
 */
import { NextResponse } from 'next/server';
import { requireAllowedSupabaseUser } from '@/lib/require-allowed-supabase-user';
import { logCriticalAndGeneric } from '@/lib/server/api-safe';
import { enforceRateLimitAuth } from '@/lib/server/security-rate-limit';
import { runOcrFromImageBytes } from '@/lib/ocr/index';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

    const result = await runOcrFromImageBytes(buf);
    const text = result.rawText ?? '';
    return NextResponse.json({ ok: true, text, result });
  } catch (err) {
    return logCriticalAndGeneric('POST /api/pedidos/ocr', err);
  }
}
