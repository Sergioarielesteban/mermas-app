/**
 * POST /api/ai/assistant
 *
 * Asistente operativo Chef One (lenguaje natural + contexto modular).
 * - Auth obligatoria (Supabase Bearer).
 * - GEMINI_API_KEY solo en servidor (@google/generative-ai).
 * - Sin streaming en v1 (respuesta JSON estable en Vercel); la capa Gemini
 *   admite ampliar a stream sin cambiar el contrato del cliente.
 */

import { NextResponse } from 'next/server';
import { buildAssistantContext } from '@/lib/ai/assistant-context';
import { generateAssistantReply, type AssistantChatTurn } from '@/lib/ai/assistant-gemini';
import { requireAllowedSupabaseUser } from '@/lib/require-allowed-supabase-user';
import { readJsonBodyLimitedEx } from '@/lib/server/read-json-limited';
import { logCriticalAndGeneric } from '@/lib/server/api-safe';
import { enforceRateLimitAuth } from '@/lib/server/security-rate-limit';
import { logSecurityEvent } from '@/lib/server/security-log';

export const maxDuration = 60;

const MAX_BODY = 96 * 1024;
const MAX_MESSAGE = 8000;
const MAX_HISTORY = 24;
const MAX_TURN_TEXT = 12000;

type AssistantRequestBody = {
  message?: unknown;
  history?: unknown;
  /** Reservado: streaming SSE en una fase posterior. */
  stream?: unknown;
};

function asTrimmedString(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function normalizeHistory(raw: unknown): AssistantChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistantChatTurn[] = [];
  for (const item of raw.slice(-MAX_HISTORY)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const role = rec.role === 'model' ? 'model' : rec.role === 'user' ? 'user' : null;
    const text = asTrimmedString(rec.text, MAX_TURN_TEXT);
    if (!role || !text) continue;
    out.push({ role, text });
  }
  return out;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAllowedSupabaseUser(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: auth.status });
    }

    const rl = enforceRateLimitAuth(request, auth.userId, 'ai');
    if (rl) return rl;

    const parsed = await readJsonBodyLimitedEx(request, MAX_BODY);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: 'Request failed' }, { status: 400 });
    }

    const body = parsed.data as AssistantRequestBody;
    const message = asTrimmedString(body.message, MAX_MESSAGE);
    if (!message) {
      return NextResponse.json({ ok: false, error: 'Request failed' }, { status: 400 });
    }

    const prev = normalizeHistory(body.history);
    const history: AssistantChatTurn[] = [...prev, { role: 'user', text: message }];

    const context = buildAssistantContext(auth.localId);
    const contextJson = JSON.stringify(context);

    let reply = '';
    try {
      reply = await generateAssistantReply({ contextJson, history });
    } catch {
      logSecurityEvent('critical', { route: 'POST /api/ai/assistant', errType: 'assistant_gemini_failed' });
      return NextResponse.json(
        {
          ok: false,
          error: 'assistant_unavailable',
          userMessage: 'Asistente temporalmente no disponible.',
        },
        { status: 503 },
      );
    }

    if (!reply) {
      return NextResponse.json(
        {
          ok: false,
          error: 'assistant_unavailable',
          userMessage: 'Asistente temporalmente no disponible.',
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      reply,
      meta: { dataSource: context.meta.dataSource, operationalDayYmd: context.meta.operationalDayYmd },
    });
  } catch (err) {
    return logCriticalAndGeneric('POST /api/ai/assistant', err);
  }
}
