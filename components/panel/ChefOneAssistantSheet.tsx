'use client';

/**
 * Centro operativo inteligente: preguntas libres con contexto Chef One (servidor + Gemini).
 * Historial solo en memoria de la sesión del sheet.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, Sparkles, X } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase-client';

type Props = {
  open: boolean;
  onClose: () => void;
};

type ChatMsg = { id: string; role: 'user' | 'model'; text: string };

const SUGGESTION_POOL = [
  '¿Qué tenemos pendiente hoy?',
  '¿Qué pedidos vienen hoy?',
  '¿Qué proveedores hay que revisar?',
  '¿A qué precio recibimos hoy la lechuga?',
  '¿Qué incidencias siguen abiertas?',
  '¿Qué productos han subido más de precio este mes?',
  '¿Qué cámaras están pendientes de temperatura?',
  '¿Quién no ha fichado?',
  '¿Qué tareas de limpieza faltan?',
  '¿Qué albaranes están pendientes de revisar?',
  '¿Qué productos tienen más merma?',
  '¿Qué pedidos hay sin recibir?',
  '¿Qué proveedor nos salió más caro este mes?',
];

function pickSuggestions(seed: number): string[] {
  const n = SUGGESTION_POOL.length;
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    out.push(SUGGESTION_POOL[(seed + i * 3) % n]);
  }
  return out;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function ChefOneAssistantSheet({ open, onClose }: Props) {
  const [mounted, setMounted] = React.useState(false);
  const [input, setInput] = React.useState('');
  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [errorBanner, setErrorBanner] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const [suggestions] = React.useState(() => pickSuggestions(Math.floor(Date.now() / 3600000) % 13));

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 200);
    return () => window.clearTimeout(t);
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      setInput('');
      setLoading(false);
      setErrorBanner(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading, open]);

  const send = React.useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || loading) return;
      setErrorBanner(null);
      setLoading(true);
      const userMsg: ChatMsg = { id: uid(), role: 'user', text };
      setMessages((m) => [...m, userMsg]);
      setInput('');

      const supabase = getSupabaseClient();
      if (!supabase) {
        setLoading(false);
        setErrorBanner('Sesión no disponible.');
        return;
      }
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) {
        setLoading(false);
        setErrorBanner('Sesión no válida. Vuelve a iniciar sesión.');
        return;
      }

      const historyPayload = [...messages.slice(-20), userMsg].map(({ role, text: t }) => ({
        role,
        text: t,
      }));

      try {
        const res = await fetch('/api/ai/assistant', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
          body: JSON.stringify({ message: text, history: historyPayload.slice(0, -1) }),
        });
        let body: { ok?: boolean; reply?: string; userMessage?: string } = {};
        try {
          body = (await res.json()) as typeof body;
        } catch {
          body = {};
        }
        if (!res.ok || !body.ok || typeof body.reply !== 'string') {
          setErrorBanner(
            typeof body.userMessage === 'string' && body.userMessage
              ? body.userMessage
              : 'Asistente temporalmente no disponible.',
          );
          return;
        }
        setMessages((m) => [...m, { id: uid(), role: 'model', text: body.reply! }]);
      } catch {
        setErrorBanner('Asistente temporalmente no disponible.');
      } finally {
        setLoading(false);
      }
    },
    [loading, messages],
  );

  const onSubmit = React.useCallback(() => {
    void send(input);
  }, [input, send]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[125] flex flex-col sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="chef-assistant-title">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />

      <div className="relative mt-auto flex max-h-[min(92vh,720px)] w-full flex-col overflow-hidden rounded-t-3xl bg-[#f5f5f7] shadow-2xl ring-1 ring-black/5 sm:mt-0 sm:max-h-[85vh] sm:max-w-lg sm:rounded-3xl">
        <div className="flex justify-center pt-2 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-zinc-300" aria-hidden />
        </div>

        <header className="flex shrink-0 items-start gap-2 border-b border-zinc-200/80 bg-white/90 px-4 pb-3 pt-3 backdrop-blur-sm sm:rounded-t-3xl">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#D32F2F]/10 text-[#D32F2F] ring-1 ring-[#D32F2F]/12">
            <Sparkles className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="chef-assistant-title" className="font-serif text-[18px] font-normal text-zinc-900">
              Asistente Chef One
            </h2>
            <p className="text-[11.5px] leading-snug text-zinc-500">Operación del restaurante · respuestas con datos de contexto</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200/80 active:scale-[0.96]"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {errorBanner ? (
          <div className="shrink-0 border-b border-amber-200/80 bg-amber-50 px-4 py-2.5 text-[12.5px] font-medium text-amber-900">
            {errorBanner}
          </div>
        ) : null}

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
          {messages.length === 0 && !loading ? (
            <div className="space-y-3">
              <p className="text-[12.5px] font-medium text-zinc-500">Pregunta lo que necesites, en lenguaje natural:</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-full border border-zinc-200/90 bg-white px-3 py-2 text-left text-[12px] font-medium leading-snug text-zinc-800 shadow-sm ring-zinc-100 transition active:scale-[0.98]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((m) => (
            <div
              key={m.id}
              className={['flex', m.role === 'user' ? 'justify-end' : 'justify-start'].join(' ')}
            >
              <div
                className={[
                  'max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed shadow-sm',
                  m.role === 'user'
                    ? 'bg-[#D32F2F] text-white'
                    : 'border border-zinc-200/90 bg-white text-zinc-900',
                ].join(' ')}
              >
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
              </div>
            </div>
          ))}

          {loading ? (
            <div className="flex justify-start">
              <div className="max-w-[92%] rounded-2xl border border-zinc-200/90 bg-white px-4 py-3 shadow-sm">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Analizando</p>
                <div className="flex items-center gap-1.5" aria-hidden>
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[#D32F2F]/70 [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[#D32F2F]/50 [animation-delay:120ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[#D32F2F]/35 [animation-delay:240ms]" />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="shrink-0 border-t border-zinc-200/80 bg-white/95 px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 backdrop-blur-sm">
          <div className="flex items-end gap-2 rounded-2xl bg-zinc-100/90 p-1.5 ring-1 ring-zinc-200/80">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              rows={2}
              placeholder="Escribe tu consulta operativa…"
              disabled={loading}
              className="max-h-28 min-h-[44px] flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] leading-snug text-zinc-900 outline-none placeholder:text-zinc-400 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={onSubmit}
              disabled={loading || !input.trim()}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#D32F2F] text-white shadow-md ring-1 ring-[#D32F2F]/30 transition enabled:active:scale-[0.95] disabled:opacity-40"
              aria-label="Enviar"
            >
              <ArrowUp className="h-5 w-5" strokeWidth={2.2} />
            </button>
          </div>
          <p className="mt-1.5 px-1 text-center text-[10px] text-zinc-400">Los datos de contexto pueden ser parciales mientras se conectan módulos.</p>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
