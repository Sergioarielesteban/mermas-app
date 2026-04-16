'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Play } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  CHECKLIST_CONTEXT_LABEL,
  type ChefChecklist,
  fetchChefChecklistItems,
  fetchChefChecklists,
  startChefChecklistRun,
} from '@/lib/chef-ops-supabase';

export default function ChecklistEjecutarPage() {
  const router = useRouter();
  const { localId, profileReady, userId } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const [lists, setLists] = useState<ChefChecklist[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [runDate, setRunDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shiftLabel, setShiftLabel] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setLists([]);
      setCounts({});
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const ls = await fetchChefChecklists(supabase, localId);
      setLists(ls);
      const entries = await Promise.all(
        ls.map(async (c) => {
          const items = await fetchChefChecklistItems(supabase, c.id);
          return [c.id, items.length] as const;
        }),
      );
      setCounts(Object.fromEntries(entries));
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al cargar.');
      setLists([]);
      setCounts({});
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const start = async (checklistId: string) => {
    if (!localId || !supabaseOk) return;
    setStartingId(checklistId);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      const { run } = await startChefChecklistRun(
        supabase,
        localId,
        checklistId,
        runDate,
        shiftLabel.trim() || null,
        userId,
      );
      router.push(`/checklist/correr/${run.id}`);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo iniciar.');
    } finally {
      setStartingId(null);
    }
  };

  const sorted = useMemo(
    () => [...lists].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)),
    [lists],
  );

  return (
    <div className="space-y-4 pb-10">
      <MermasStyleHero eyebrow="Check list" title="Ejecutar" compact />

      <Link
        href="/checklist"
        className="inline-flex items-center gap-2 text-sm font-bold text-zinc-700 hover:text-[#D32F2F]"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver
      </Link>

      {banner ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{banner}</div>
      ) : null}

      {!localId || !supabaseOk ? (
        <p className="text-center text-sm text-zinc-500">Conecta Supabase y un local para ejecutar listas.</p>
      ) : loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : (
        <>
          <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Fecha y turno</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] font-bold uppercase text-zinc-500">Día de la ejecución</span>
                <input
                  type="date"
                  value={runDate}
                  onChange={(e) => setRunDate(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#D32F2F]/50 focus:bg-white focus:ring-2 focus:ring-[#D32F2F]/15"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold uppercase text-zinc-500">Nota de turno (opcional)</span>
                <input
                  value={shiftLabel}
                  onChange={(e) => setShiftLabel(e.target.value)}
                  placeholder="Ej. Mañana, Noche…"
                  className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#D32F2F]/50 focus:bg-white focus:ring-2 focus:ring-[#D32F2F]/15"
                />
              </label>
            </div>
          </section>

          <div className="space-y-2">
            {sorted.length === 0 ? (
              <p className="rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-6 text-center text-sm text-zinc-600">
                No hay listas activas. Crea una en{' '}
                <Link href="/checklist/listas" className="font-bold text-[#D32F2F] underline">
                  Mis listas
                </Link>
                .
              </p>
            ) : (
              sorted.map((c) => {
                const n = counts[c.id] ?? 0;
                const disabled = n === 0 || startingId !== null;
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200/90 bg-gradient-to-r from-white to-zinc-50/90 px-4 py-3.5 shadow-sm ring-1 ring-zinc-100"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-zinc-900">{c.title}</p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#B91C1C]">
                        {CHECKLIST_CONTEXT_LABEL[c.context]} · {n} ítems
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void start(c.id)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#D32F2F] px-3 py-2 text-xs font-black uppercase tracking-wide text-white shadow-sm disabled:opacity-45"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {startingId === c.id ? '…' : 'Empezar'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
