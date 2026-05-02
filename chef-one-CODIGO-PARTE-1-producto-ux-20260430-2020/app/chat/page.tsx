'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { appConfirm } from '@/lib/app-dialog-bridge';
import {
  deleteAllLocalChatMessages,
  fetchLocalChatMessages,
  insertLocalChatMessage,
  type LocalChatMessage,
} from '@/lib/local-chat-supabase';
import { actorLabel, notifyMensajeEquipo } from '@/services/notifications';

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function ChatPage() {
  const { localId, userId, profileReady, displayName, loginUsername } = useAuth();
  /** Respaldo si el contexto aún no tiene userId (evita tratar todos los mensajes como “ajenos” o “propios” mal). */
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSessionUserId(data.session?.user?.id ?? null);
    });
  }, []);

  const effectiveUserId = userId ?? sessionUserId;

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setMessages([]);
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const rows = await fetchLocalChatMessages(supabase, localId);
      setMessages(rows);
      queueMicrotask(scrollToBottom);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar el chat.';
      if (msg.toLowerCase().includes('relation') || msg.includes('does not exist')) {
        setBanner(
          'Falta la tabla de chat en Supabase. Ejecuta supabase-local-chat.sql y añade local_chat_messages a la publicación Realtime.',
        );
      } else {
        setBanner(msg);
      }
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk, scrollToBottom]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!localId || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    const ch = supabase
      .channel(`local-chat-${localId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'local_chat_messages',
          filter: `local_id=eq.${localId}`,
        },
        (payload) => {
          const row = payload.new as LocalChatMessage;
          if (!row?.id) return;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [localId, supabaseOk]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  const send = async () => {
    if (!supabaseOk || sending) return;
    const text = draft.trim();
    if (!text) return;
    const supabase = getSupabaseClient()!;
    setSending(true);
    setBanner(null);
    try {
      const row = await insertLocalChatMessage(supabase, text);
      if (localId) {
        void notifyMensajeEquipo(supabase, {
          localId,
          userId: row.user_id ?? effectiveUserId ?? null,
          actorName: row.author_label?.trim() || actorLabel(displayName, loginUsername),
          messageId: row.id,
          preview: text,
        });
      }
      setDraft('');
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo enviar.');
    } finally {
      setSending(false);
    }
  };

  const clearChat = async () => {
    if (!localId || !supabaseOk || deleting) return;
    if (
      !(await appConfirm(
        'Se eliminarán todos los mensajes del chat de este local. Esta acción no se puede deshacer. ¿Continuar?',
      ))
    ) {
      return;
    }
    const supabase = getSupabaseClient()!;
    setDeleting(true);
    setBanner(null);
    try {
      await deleteAllLocalChatMessages(supabase, localId);
      setMessages([]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo vaciar el chat.';
      if (msg.includes('permission') || msg.includes('policy') || msg.includes('42501')) {
        setBanner('Falta permiso de borrado. Ejecuta supabase-local-chat-delete-policy.sql en Supabase.');
      } else {
        setBanner(msg);
      }
    } finally {
      setDeleting(false);
    }
  };

  const disabled = !localId || !profileReady || !supabaseOk || loading;

  return (
    <div className="space-y-4">
      <MermasStyleHero slim compactTitle eyebrow="Equipo" title="Chat del local" />

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={disabled || deleting || messages.length === 0}
          onClick={() => void clearChat()}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-800 disabled:opacity-45"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          {deleting ? 'Eliminando…' : 'Eliminar chat'}
        </button>
      </div>

      {banner ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {banner}
        </div>
      ) : null}

      <section
        className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm ring-1 ring-zinc-100"
        aria-label="Mensajes"
      >
        <div
          ref={listRef}
          className="max-h-[min(520px,calc(100dvh-18rem))] min-h-[200px] space-y-3 overflow-y-auto px-3 py-4"
        >
          {loading ? (
            <p className="py-8 text-center text-sm text-zinc-500">Cargando…</p>
          ) : messages.length === 0 ? (
            <p className="py-8 text-center text-sm leading-relaxed text-zinc-600">
              Aún no hay mensajes. Escribe el primero para avisar al equipo.
            </p>
          ) : (
                       messages.map((m) => {
              const mine = effectiveUserId !== null && m.user_id === effectiveUserId;
              const label = (m.author_label ?? '').trim() || 'Sin nombre';
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={[
                      'max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                      mine
                        ? 'rounded-br-md bg-[#D32F2F] text-white'
                        : 'rounded-bl-md bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200/80',
                    ].join(' ')}
                  >
                    <p
                      className={[
                        'text-[11px] font-bold leading-tight',
                        mine ? 'text-white/95' : 'uppercase tracking-wide text-zinc-600',
                      ].join(' ')}
                    >
                      {mine ? `Tú · ${label}` : label}
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
                    <p
                      className={`mt-1 text-[10px] tabular-nums ${mine ? 'text-white/75' : 'text-zinc-400'}`}
                    >
                      {formatTime(m.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-zinc-100 bg-zinc-50/80 p-3">
          <label htmlFor="chat-input" className="sr-only">
            Escribir mensaje
          </label>
          <div className="flex gap-2">
            <textarea
              id="chat-input"
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={disabled || sending}
              placeholder="Escribe un mensaje al equipo…"
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#D32F2F]/40 focus:outline-none focus:ring-2 focus:ring-[#D32F2F]/20 disabled:opacity-50"
            />
            <button
              type="button"
              disabled={disabled || sending || !draft.trim()}
              onClick={() => void send()}
              className="grid h-11 w-11 shrink-0 place-items-center self-end rounded-xl bg-[#D32F2F] text-white shadow-md transition hover:brightness-105 disabled:opacity-45"
              aria-label="Enviar"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-2 text-[10px] text-zinc-500">Enter envía · Mayús+Enter nueva línea</p>
        </div>
      </section>
    </div>
  );
}
