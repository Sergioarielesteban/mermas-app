'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  APPCC_CLEANING_SLOT_LABEL,
  type AppccCleaningLogRow,
  type AppccCleaningTaskRow,
  fetchCleaningLogsInRange,
  fetchCleaningTasks,
} from '@/lib/appcc-limpieza-supabase';
import { dateKeyDaysAgo, formatAppccDateEs, madridDateKey } from '@/lib/appcc-supabase';

const RANGE_DAYS = 120;

function groupByDate(rows: AppccCleaningLogRow[]) {
  const m = new Map<string, AppccCleaningLogRow[]>();
  for (const r of rows) {
    const list = m.get(r.log_date) ?? [];
    list.push(r);
    m.set(r.log_date, list);
  }
  return m;
}

export default function AppccLimpiezaHistorialPage() {
  const { localId, profileReady } = useAuth();
  const [logs, setLogs] = useState<AppccCleaningLogRow[]>([]);
  const [tasks, setTasks] = useState<AppccCleaningTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const to = madridDateKey();
  const from = dateKeyDaysAgo(RANGE_DAYS);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!localId || !supabaseOk) {
        setLogs([]);
        setTasks([]);
        if (!silent) setLoading(false);
        return;
      }
      const supabase = getSupabaseClient()!;
      if (!silent) {
        setLoading(true);
        setErr(null);
      }
      try {
        const [l, t] = await Promise.all([
          fetchCleaningLogsInRange(supabase, localId, from, to),
          fetchCleaningTasks(supabase, localId, false),
        ]);
        setLogs(l);
        setTasks(t);
      } catch (e) {
        if (!silent) {
          setErr(e instanceof Error ? e.message : 'Error al cargar.');
          setLogs([]);
          setTasks([]);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [localId, supabaseOk, from, to],
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === 'visible') void loadRef.current({ silent: true });
    };
    document.addEventListener('visibilitychange', ping);
    window.addEventListener('focus', ping);
    return () => {
      document.removeEventListener('visibilitychange', ping);
      window.removeEventListener('focus', ping);
    };
  }, []);

  useEffect(() => {
    if (!localId || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    const ch = supabase
      .channel(`appcc-cleaning-hist-${localId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appcc_cleaning_logs', filter: `local_id=eq.${localId}` },
        () => void load({ silent: true }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [localId, supabaseOk, load]);

  const taskTitle = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tasks) m.set(t.id, t.title);
    return m;
  }, [tasks]);

  const byDate = useMemo(() => groupByDate(logs), [logs]);
  const sortedDates = useMemo(() => [...byDate.keys()].sort((a, b) => b.localeCompare(a)), [byDate]);

  return (
    <div className="space-y-4">
      <MermasStyleHero
        eyebrow="APPCC"
        title="Historial de limpieza"
        description={`Últimos ${RANGE_DAYS} días · marcas por tarea y turno.`}
        compact
      />

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{err}</div>
      ) : null}

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : logs.length === 0 ? (
        <p className="rounded-xl bg-zinc-50 px-3 py-4 text-center text-sm text-zinc-600 ring-1 ring-zinc-200">
          Sin registros en este periodo.
        </p>
      ) : (
        <div className="space-y-3">
          {sortedDates.map((dk) => {
            const dayRows = byDate.get(dk) ?? [];
            const sorted = [...dayRows].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
            return (
              <section key={dk} className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm ring-1 ring-zinc-100">
                <h2 className="text-sm font-bold text-zinc-900">
                  {formatAppccDateEs(dk)}{' '}
                  <span className="text-xs font-semibold text-zinc-500">({sorted.length})</span>
                </h2>
                <ul className="mt-2 space-y-1.5">
                  {sorted.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-lg bg-zinc-50/90 px-2 py-1.5 text-xs ring-1 ring-zinc-100"
                    >
                      <span className="font-semibold text-zinc-800">{taskTitle.get(r.task_id) ?? r.task_id}</span>
                      <span className="text-zinc-500"> · {APPCC_CLEANING_SLOT_LABEL[r.slot]}</span>
                      {r.operator_name.trim() ? (
                        <span className="text-zinc-500"> · {r.operator_name.trim()}</span>
                      ) : null}
                      {r.notes.trim() ? (
                        <p className="mt-0.5 text-[11px] text-zinc-600">{r.notes.trim()}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {!profileReady ? <p className="text-xs text-zinc-500">Cargando sesión…</p> : null}
    </div>
  );
}
