import { NextResponse } from 'next/server';
import { requireOidoChefAccess } from '@/lib/server/oido-chef-access';
import type { OidoChefAiContext } from '@/lib/oido-chef-ai-context';

export const maxDuration = 60;

const SYSTEM_PROMPT = `Eres «Oído Chef», asistente de restaurante. Responde SIEMPRE en español, tono profesional y cercano, como si hablaras por voz (frases cortas, sin markdown ni listas largas).
Solo puedes usar datos del JSON «contexto» que envía el usuario. Si algo no está en el contexto, dilo claramente y no inventes cifras ni proveedores.
Para precios de productos, busca en comprasRecientes.lineas por nombre de producto (coincidencia flexible). Indica proveedor, fecha y precio en euros cuando lo tengas.
Si hay varias compras, resume (media, última, rango) de forma breve.`;

export async function POST(request: Request) {
  const auth = await requireOidoChefAccess(request, 'chat');
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
    return NextResponse.json(
      { ok: false, reason: 'OPENAI_API_KEY no configurada en el servidor.' },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as { message?: string; context?: OidoChefAiContext };
    const message = String(body.message ?? '').trim();
    if (!message || message.length > 2000) {
      return NextResponse.json({ ok: false, reason: 'Mensaje vacío o demasiado largo.' }, { status: 400 });
    }
    const context = body.context;
    if (!context || typeof context !== 'object') {
      return NextResponse.json({ ok: false, reason: 'Falta contexto.' }, { status: 400 });
    }

    const userPayload = JSON.stringify({ pregunta: message, contexto: context });
    if (userPayload.length > 24000) {
      return NextResponse.json({ ok: false, reason: 'Contexto demasiado grande para Oído Chef.' }, { status: 413 });
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
      const errText = await res.text().catch(() => '');
      return NextResponse.json(
        { ok: false, reason: `OpenAI error (${res.status}). ${errText.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return NextResponse.json({ ok: false, reason: 'Respuesta vacía del modelo.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, reply });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al contactar OpenAI.';
    return NextResponse.json({ ok: false, reason: msg }, { status: 500 });
  }
}
