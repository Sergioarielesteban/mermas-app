/**
 * Oído Chef: requireOidoChefAccess + rate limit capa /api/ai; respuestas sin filtrar upstream.
 */
import { NextResponse } from 'next/server';
import { requireOidoChefAccess } from '@/lib/server/oido-chef-access';
import type { OidoChefAiContext } from '@/lib/oido-chef-ai-context';
import { jsonGenericError, logCriticalAndGeneric } from '@/lib/server/api-safe';
import { enforceRateLimitAuth } from '@/lib/server/security-rate-limit';
import { readJsonBodyLimitedEx } from '@/lib/server/read-json-limited';

export const maxDuration = 60;

const MAX_BODY_BYTES = 256 * 1024;

const SYSTEM_PROMPT = `Eres «Oído Chef», asistente de restaurante. Responde SIEMPRE en español, tono profesional y cercano, como si hablaras por voz (frases cortas, sin markdown ni listas largas).
Solo puedes usar datos del JSON «contexto» que envía el usuario. Si algo no está en el contexto, dilo claramente y no inventes cifras ni proveedores.
Para precios de productos, busca en comprasRecientes.lineas por nombre de producto (coincidencia flexible). Indica proveedor, fecha y precio en euros cuando lo tengas.
Si hay varias compras, resume (media, última, rango) de forma breve.`;

export async function POST(request: Request) {
  const auth = await requireOidoChefAccess(request, 'chat');
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
    const body = raw.data as { message?: string; context?: OidoChefAiContext };
    const message = String(body.message ?? '').trim();
    if (!message || message.length > 2000) {
      return NextResponse.json({ ok: false, error: 'Request failed' }, { status: 400 });
    }
    const context = body.context;
    if (!context || typeof context !== 'object') {
      return NextResponse.json({ ok: false, error: 'Request failed' }, { status: 400 });
    }

    const userPayload = JSON.stringify({ pregunta: message, contexto: context });
    if (userPayload.length > 24000) {
      return NextResponse.json({ ok: false, error: 'Request failed' }, { status: 413 });
    }
    const maxTokensRaw = Number(process.env.OPENAI_OIDO_MAX_TOKENS ?? 500);
    const maxTokens = Number.isFinite(maxTokensRaw) ? Math.max(120, Math.min(700, Math.floor(maxTokensRaw))) : 500;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_OIDO_MODEL?.trim() || 'gpt-4o-mini',
        temperature: 0.35,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: userPayload,
          },
        ],
      }),
    });

    if (!res.ok) {
      await res.text().catch(() => undefined);
      return jsonGenericError(502);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return jsonGenericError(502);
    }

    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    return logCriticalAndGeneric('POST /api/ai/oido-chef', err);
  }
}
