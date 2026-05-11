/**
 * Llamadas Gemini para el asistente operativo (solo servidor).
 * Usa @google/generative-ai (distinto del stack @google/genai del OCR).
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logSecurityEvent } from '@/lib/server/security-log';

const DEFAULT_MODEL = process.env.ASSISTANT_GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

const BASE_SYSTEM = `Eres el asistente operativo de Chef One, un sistema de gestión para restaurantes.
Tienes acceso al contexto operativo en tiempo real del restaurante (en JSON).
Responde de forma clara, directa y profesional, como lo haría un coordinador operativo experto en hostelería.
No inventes nombres de proveedores, productos, personas, precios, incidencias, tareas ni cantidades. Si no tienes datos reales, dilo claramente.
Cuando una sección del contexto esté vacía (lista vacía o null), responde exactamente: "Todavía no tengo datos reales conectados de este módulo."
No rellenes huecos con ejemplos ni suposiciones. Solo informa de lo que esté explícitamente en el contexto JSON.
Responde siempre en español salvo que el usuario escriba en otro idioma.`;

export type AssistantChatTurn = { role: 'user' | 'model'; text: string };

function toGeminiHistory(turns: AssistantChatTurn[]) {
  const out: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  for (const t of turns) {
    const text = (t.text ?? '').trim();
    if (!text) continue;
    const role = t.role === 'model' ? 'model' : 'user';
    out.push({ role, parts: [{ text }] });
  }
  return out;
}

export async function generateAssistantReply(input: {
  contextJson: string;
  history: AssistantChatTurn[];
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    logSecurityEvent('critical', { route: 'assistant', errType: 'missing_gemini_key' });
    throw new Error('missing_gemini');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: DEFAULT_MODEL,
    systemInstruction: `${BASE_SYSTEM}\n\n--- Contexto operativo (JSON) ---\n${input.contextJson}`,
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 2048,
    },
  });

  const history = toGeminiHistory(input.history.slice(0, -1));
  const last = input.history[input.history.length - 1];
  if (!last || last.role !== 'user') {
    throw new Error('invalid_history');
  }
  const lastText = last.text.trim();
  if (!lastText) throw new Error('empty_message');

  const chat = model.startChat({
    history,
  });

  try {
    const result = await chat.sendMessage(lastText);
    const text = result.response.text();
    return typeof text === 'string' ? text.trim() : '';
  } catch (e) {
    logSecurityEvent('critical', {
      route: 'assistant',
      errType: 'gemini_send_failed',
      msg: e instanceof Error ? e.message.slice(0, 120) : 'unknown',
    });
    throw e;
  }
}
