'use client';

import Link from 'next/link';
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BrushCleaning, ChevronLeft } from 'lucide-react';
import AppccCompactHero from '@/components/AppccCompactHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { requestDeleteSecurityPin } from '@/lib/delete-security';
import {
  APPCC_CLEANING_SLOT_LABEL,
  type AppccCleaningCategoryRow,
  type AppccCleaningLogRow,
  type AppccCleaningSlot,
  type AppccCleaningTaskRow,
  cleaningLogsByTaskAndSlot,
  deleteCleaningLog,
  fetchCleaningCategories,
  fetchCleaningLogsForDate,
  fetchCleaningTasks,
  upsertCleaningLog,
} from '@/lib/appcc-limpieza-supabase';
import { madridDateKey } from '@/lib/appcc-supabase';

const LS_OPERATOR = 'appcc-limpieza-operator-name';

const REGISTRO_SLOTS: AppccCleaningSlot[] = ['manana', 'noche'];

function SlotRow({
  task,
  slot,
  dateKey,
  log,
  operatorName,
  disabled,
  onSaved,
  onDeleted,
}: {
  task: AppccCleaningTaskRow;
  slot: AppccCleaningSlot;
  dateKey: string;
  log: AppccCleaningLogRow | undefined;
  operatorName: string;
  disabled: boolean;
  onSaved: (row: AppccCleaningLogRow) => void;
  onDeleted: (logId: string) => void;
}) {
  const { localId } = useAuth();
  const [notes, setNotes] = useState(log?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setNotes(log?.notes ?? '');
    setErr(null);
  }, [log, dateKey, task.id, slot]);

  const markDone = async () => {
    setErr(null);
    const supabase = getSupabaseClient();
    if (!supabase || !localId) {
      setErr('Sesión o Supabase no disponible.');
      return;
    }
    const op = operatorName.trim();
    if (!op) {
      setErr('Indica arriba quién registra; vale para todas las tareas del día.');
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      setErr('Usuario no identificado.');
      return;
    }
    setSaving(true);
    try {
      const row = await upsertCleaningLog(supabase, {
        localId,
        taskId: task.id,
        logDate: dateKey,
        slot,
        operatorName: op,
        notes: notes.trim(),
        userId: user.id,
      });
      onSaved(row);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const removeMark = async () => {
    if (!log) return;
    setErr(null);
    if (!requestDeleteSecurityPin()) {
      setErr('Clave de seguridad incorrecta.');
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase || !localId) return;
    setSaving(true);
    try {
      await deleteCleaningLog(supabase, localId, log.id);
      onDeleted(log.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al quitar.');
    } finally {
      setSaving(false);
    }
  };

  const short = slot === 'manana' ? 'M' : 'N';

  return (
    <div className="flex flex-wrap items-center gap-1 border-t border-zinc-100/90 py-1 sm:gap-1.5">
      <span
        className="w-[2.75rem] shrink-0 text-[9px] font-bold uppercase leading-tight text-zinc-500"
        title={APPCC_CLEANING_SLOT_LABEL[slot]}
      >
        {short}
      </span>
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={disabled || saving || !!log}
        placeholder="Notas (opc.)"
        className="h-7 min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-1.5 text-[11px] text-zinc-700 outline-none focus:ring-1 focus:ring-[#D32F2F]/30 sm:max-w-[10rem]"
      />
      {log ? (
        <>
          <span className="rounded-md bg-emerald-600/12 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 ring-1 ring-emerald-200">
            Hecho
          </span>
          <button
            type="button"
            disabled={disabled || saving}
            onClick={() => void removeMark()}
            className="h-7 shrink-0 rounded-md border border-zinc-300 bg-white px-2 text-[10px] font-bold text-zinc-700"
          >
            Quitar
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={disabled || saving}
          onClick={() => void markDone()}
          className="h-7 shrink-0 rounded-md bg-[#D32F2F] px-2 text-[10px] font-bold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {saving ? '…' : 'Marcar'}
        </button>
      )}
      {err ? <p className="w-full text-[9px] font-medium text-red-600">{err}</p> : null}
    </div>
  );
}

function TaskCard({
  task,
  dateKey,
  logMap,
  operatorName,
  disabled,
  onSaved,
  onDeleted,
}: {
  task: AppccCleaningTaskRow;
  dateKey: string;
  logMap: Map<string, AppccCleaningLogRow>;
  operatorName: string;
  disabled: boolean;
  onSaved: (row: AppccCleaningLogRow) => void;
  onDeleted: (logId: string) => void;
}) {
  const rM = logMap.get(`${task.id}:manana`);
  const rN = logMap.get(`${task.id}:noche`);
  const hasInstr = task.instructions.trim().length > 0;

  return (
    <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/90 px-2.5 py-2 ring-1 ring-zinc-100">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-zinc-900">{task.title}</p>
          {hasInstr ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-[10px] font-semibold text-[#B91C1C]">
                Cómo se limpia
              </summary>
              <p className="mt-1 whitespace-pre-wrap text-[10px] leading-snug text-zinc-600">{task.instructions}</p>
            </details>
          ) : (
            <p className="mt-0.5 text-[9px] text-zinc-400">Sin método descrito (añádelo en Categorías y tareas)</p>
          )}
        </div>
        <BrushCleaning className="h-4 w-4 shrink-0 text-[#D32F2F]/65" aria-hidden />
      </div>
      <div className="divide-y divide-zinc-100/90">
        {REGISTRO_SLOTS.map((slot) => (
          <SlotRow
            key={slot}
            task={task}
            slot={slot}
            dateKey={dateKey}
            log={slot === 'manana' ? rM : rN}
            operatorName={operatorName}
            onSaved={onSaved}
            onDeleted={onDeleted}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

function AppccLimpiezaRegistroInner() {
  const searchParams = useSearchParams();
  const { localId, profileReady } = useAuth();
  const [dateKey, setDateKey] = useState(() => madridDateKey());
  const [operatorName, setOperatorName] = useState('');
  const [categories, setCategories] = useState<AppccCleaningCategoryRow[]>([]);
  const [tasks, setTasks] = useState<AppccCleaningTaskRow[]>([]);
  const [logs, setLogs] = useState<AppccCleaningLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    const d = searchParams.get('d');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setDateKey(d);
  }, [searchParams]);

  useEffect(() => {
    try {
      const s = localStorage.getItem(LS_OPERATOR);
      if (s) setOperatorName(s);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_OPERATOR, operatorName);
    } catch {
      /* ignore */
    }
  }, [operatorName]);

  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!localId || !supabaseOk) {
        setCategories([]);
        setTasks([]);
        setLogs([]);
        if (!silent) setLoading(false);
        return;
      }
      const supabase = getSupabaseClient()!;
      if (!silent) {
        setLoading(true);
        setBanner(null);
      }
      try {
        const [c, t, l] = await Promise.all([
          fetchCleaningCategories(supabase, localId),
          fetchCleaningTasks(supabase, localId, true),
          fetchCleaningLogsForDate(supabase, localId, dateKey),
        ]);
        setCategories(c);
        setTasks(t);
        setLogs(l);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error al cargar.';
        if (!silent) {
          if (msg.toLowerCase().includes('relation') || msg.includes('does not exist')) {
            setBanner(
              'Faltan las tablas de limpieza APPCC. Ejecuta supabase-appcc-limpieza-schema.sql en Supabase.',
            );
          } else {
            setBanner(msg);
          }
          setCategories([]);
          setTasks([]);
          setLogs([]);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [dateKey, localId, supabaseOk],
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
      .channel(`appcc-cleaning-${localId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appcc_cleaning_logs', filter: `local_id=eq.${localId}` },
        () => void load({ silent: true }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appcc_cleaning_tasks', filter: `local_id=eq.${localId}` },
        () => void load({ silent: true }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appcc_cleaning_categories', filter: `local_id=eq.${localId}` },
        () => void load({ silent: true }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [localId, supabaseOk, load]);

  const logMap = useMemo(() => cleaningLogsByTaskAndSlot(logs), [logs]);

  const tasksByCategory = useMemo(() => {
    const m = new Map<string, AppccCleaningTaskRow[]>();
    for (const t of tasks) {
      const list = m.get(t.category_id) ?? [];
      list.push(t);
      m.set(t.category_id, list);
    }
    for (const list of m.values()) {
      list.sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'es'));
    }
    return m;
  }, [tasks]);

  const mergeLog = useCallback(
    (row: AppccCleaningLogRow) => {
      if (row.log_date !== dateKey) return;
      setLogs((prev) => {
        const rest = prev.filter((x) => !(x.task_id === row.task_id && x.slot === row.slot));
        return [...rest, row];
      });
    },
    [dateKey],
  );

  const dropLog = useCallback((logId: string) => {
    setLogs((prev) => prev.filter((x) => x.id !== logId));
  }, []);

  const disabled = !localId || !profileReady || !supabaseOk || loading;

  return (
    <div className="space-y-3">
      <AppccCompactHero title="Registrar limpieza" />
      <Link
        href="/appcc/limpieza"
        className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-[#D32F2F]"
      >
        <ChevronLeft className="h-4 w-4" />
        Limpieza APPCC
      </Link>

      {banner ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{banner}</div>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 ring-1 ring-zinc-100">
        <label className="text-[10px] font-bold uppercase text-zinc-500">Día</label>
        <input
          type="date"
          value={dateKey}
          onChange={(e) => setDateKey(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm font-semibold"
        />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 ring-1 ring-zinc-100">
        <label className="text-[10px] font-bold uppercase text-zinc-500">Quién registra (todo el día)</label>
        <input
          type="text"
          value={operatorName}
          onChange={(e) => setOperatorName(e.target.value)}
          placeholder="Nombre y apellidos"
          className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
        />
      </div>

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : categories.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-4 text-center text-sm text-zinc-600">
          <p className="font-semibold text-zinc-800">Aún no hay categorías</p>
          <p className="mt-1 text-xs">
            Crea primero grupos y tareas en{' '}
            <Link href="/appcc/limpieza/tareas" className="font-bold text-[#B91C1C] underline">
              Categorías y tareas
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => {
            const list = tasksByCategory.get(cat.id) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={cat.id} className="space-y-2">
                <h2 className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">{cat.name}</h2>
                <div className="space-y-2">
                  {list.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      dateKey={dateKey}
                      logMap={logMap}
                      operatorName={operatorName}
                      disabled={disabled}
                      onSaved={mergeLog}
                      onDeleted={dropLog}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p className="text-center text-[10px] text-zinc-400">
        M = mañana · N = noche. Una marca por tarea y turno.
      </p>
    </div>
  );
}

export default function AppccLimpiezaRegistroPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Cargando…</p>}>
      <AppccLimpiezaRegistroInner />
    </Suspense>
  );
}
