import { NextResponse } from 'next/server';
import { requireOidoChefAccess } from '@/lib/server/oido-chef-access';

export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireOidoChefAccess(request, 'tts');
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, reason: auth.message },
      {
        status: auth.status,
        headers: auth.rateLimitRetryAfterSec ? { 'Retry-After': String(auth.rateLimitRetryAfterSec) } : undefined,
      },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json({ ok: false, reason: 'OPENAI_API_KEY no configurada.' }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { text?: string };
    const text = String(body.text ?? '').trim();
    if (!text) {
      return NextResponse.json({ ok: false, reason: 'Texto vacío.' }, { status: 400 });
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
      const errText = await res.text().catch(() => '');
      return NextResponse.json(
        { ok: false, reason: `TTS error (${res.status}). ${errText.slice(0, 160)}` },
        { status: 502 },
      );
    }

    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error TTS.';
    return NextResponse.json({ ok: false, reason: msg }, { status: 500 });
  }
}
