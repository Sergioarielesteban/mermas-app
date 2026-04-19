/**
 * TTS Oído Chef: misma política de límites que /api/ai/oido-chef.
 */
import { NextResponse } from 'next/server';
import { requireOidoChefAccess } from '@/lib/server/oido-chef-access';
import { jsonGenericError, logCriticalAndGeneric } from '@/lib/server/api-safe';
import { enforceRateLimitAuth } from '@/lib/server/security-rate-limit';
import { readJsonBodyLimitedEx } from '@/lib/server/read-json-limited';

export const maxDuration = 60;

const MAX_BODY_BYTES = 16 * 1024;

export async function POST(request: Request) {
  const auth = await requireOidoChefAccess(request, 'tts');
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.message, reason: auth.message },
      {
        status: auth.status,
        headers: auth.rateLimitRetryAfterSec ? { 'Retry-After': String(auth.rateLimitRetryAfterSec) } : undefined,
      },
    );
  }

  const rl = enforceRateLimitAuth(request, auth.userId, 'ai');
  if (rl) return rl;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    return jsonGenericError(503);
  }

  try {
    const raw = await readJsonBodyLimitedEx(request, MAX_BODY_BYTES);
    if (!raw.ok) {
      return NextResponse.json(
        { ok: false, error: 'Request failed' },
        { status: raw.kind === 'too_large' ? 413 : 400 },
      );
    }
    const body = raw.data as { text?: string };
    const text = String(body.text ?? '').trim();
    if (!text) {
      return NextResponse.json({ ok: false, error: 'Request failed' }, { status: 400 });
    }
    const maxCharsRaw = Number(process.env.OPENAI_TTS_MAX_CHARS ?? 3800);
    const maxChars = Number.isFinite(maxCharsRaw) ? Math.max(200, Math.min(5000, Math.floor(maxCharsRaw))) : 3800;
    const input = text.slice(0, maxChars);

    const voice = process.env.OPENAI_TTS_VOICE?.trim() || 'nova';

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice,
        input,
        response_format: 'mp3',
      }),
    });

    if (!res.ok) {
      await res.text().catch(() => undefined);
      return jsonGenericError(502);
    }

    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return logCriticalAndGeneric('POST /api/ai/oido-chef/tts', err);
  }
}
