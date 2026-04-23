'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  CHECKLIST_CONTEXT_LABEL,
  type ChefChecklist,
  type ChefChecklistRun,
  fetchChefChecklistRuns,
  fetchChefChecklistsByIds,
} from '@/lib/chef-ops-supabase';

export default function ChecklistHistorialPage() {
  const { localId, profileReady } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const [runs, setRuns] = useState<ChefChecklistRun[]>([]);
  const [metaById, setMetaById] = useState<Record<string, ChefChecklist>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setRuns([]);
      setMetaById({});
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const rs = await fetchChefChecklistRuns(supabase, localId, 60);
      setRuns(rs);
      const ids = rs.map((r) => r.checklistId);
      const metas = await fetchChefChecklistsByIds(supabase, localId, ids);
      setMetaById(Object.fromEntries(metas.map((c) => [c.id, c])));
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al cargar.');
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const rows = useMemo(
    () =>
      [...runs].sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0)),
    [runs],
  );

  return (
    <div className="space-y-4 pb-10">
      <MermasStyleHero eyebrow="Check list" title="Historial" compact />

      {banner ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{banner}</div>
      ) : null}

      {!localId || !supabaseOk ? (
        <p className="text-center text-sm text-zinc-500">Conecta Supabase y un local.</p>
      ) : loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
          Aún no hay ejecuciones.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const m = metaById[r.checklistId];
            const title = m?.title ?? 'Lista (desconocida o eliminada)';
            const ctx = m ? CHECKLIST_CONTEXT_LABEL[m.context] : '—';
            const closed = Boolean(r.completedAt);
            return (
              <li key={r.id}>
                <Link
                  href={`/checklist/correr/${r.id}`}
                  className="block rounded-2xl border border-zinc-200/90 bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-100 transition hover:border-[#D32F2F]/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-zinc-900">{title}</p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                        {ctx} · {r.runDate}
                        {r.shiftLabel ? ` · ${r.shiftLabel}` : ''}
                      </p>
                      <p className="mt-1 text-[11px] font-medium text-zinc-400">
                        {new Date(r.startedAt).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={[
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase',
                        closed ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-950',
                      ].join(' ')}
                    >
                      {closed ? 'Cerrada' : 'Abierta'}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
