'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Circle } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  PRODUCTION_CADENCE_LABEL,
  type ChefProductionPlan,
  type ChefProductionRun,
  type ChefProductionRunTask,
  type ChefProductionSection,
  type ChefProductionTask,
  completeChefProductionRun,
  fetchChefProductionPlan,
  fetchChefProductionRunRow,
  fetchChefProductionRunTasks,
  fetchChefProductionSections,
  fetchChefProductionTasks,
  setChefProductionRunTaskDone,
} from '@/lib/chef-ops-supabase';

export default function ProduccionCorrerPage() {
  const params = useParams();
  const runId = typeof params.runId === 'string' ? params.runId : '';
  const { localId, profileReady } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<ChefProductionRun | null>(null);
  const [plan, setPlan] = useState<ChefProductionPlan | null>(null);
  const [sections, setSections] = useState<ChefProductionSection[]>([]);
  const [tasksBySection, setTasksBySection] = useState<Record<string, ChefProductionTask[]>>({});
  const [runTasks, setRunTasks] = useState<ChefProductionRunTask[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    if (!runId || !localId || !supabaseOk) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const r = await fetchChefProductionRunRow(supabase, runId);
      if (!r || r.localId !== localId) {
        setRun(null);
        setPlan(null);
        setBanner('Ejecución no encontrada o de otro local.');
        return;
      }
      setRun(r);
      const pl = await fetchChefProductionPlan(supabase, localId, r.planId);
      setPlan(pl);
      const secs = await fetchChefProductionSections(supabase, r.planId);
      setSections(secs);
      const tb: Record<string, ChefProductionTask[]> = {};
      for (const s of secs) {
        tb[s.id] = await fetchChefProductionTasks(supabase, s.id);
      }
      setTasksBySection(tb);
      const rt = await fetchChefProductionRunTasks(supabase, runId);
      setRunTasks(rt);
      const noteMap: Record<string, string> = {};
      for (const x of rt) {
        if (x.qtyNote) noteMap[x.id] = x.qtyNote;
      }
      setNotes(noteMap);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al cargar.');
    } finally {
      setLoading(false);
    }
  }, [runId, localId, supabaseOk]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const byTaskId = useMemo(() => {
    const m = new Map<string, ChefProductionRunTask>();
    for (const rt of runTasks) m.set(rt.taskId, rt);
    return m;
  }, [runTasks]);

  const total = runTasks.length;
  const doneCount = runTasks.filter((x) => x.isDone).length;
  const allDone = total > 0 && doneCount === total;
  const isClosed = Boolean(run?.completedAt);

  const toggle = async (rt: ChefProductionRunTask) => {
    if (!supabaseOk || isClosed) return;
    setBusyId(rt.id);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      const next = !rt.isDone;
      const note = next ? notes[rt.id]?.trim() || null : null;
      await setChefProductionRunTaskDone(supabase, rt.id, next, note);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo actualizar.');
    } finally {
      setBusyId(null);
    }
  };

  const closeRun = async () => {
    if (!supabaseOk || !run || isClosed) return;
    if (!allDone) {
      if (!window.confirm('Aún faltan tareas. ¿Registrar cierre igualmente?')) return;
    }
    setClosing(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      await completeChefProductionRun(supabase, run.id);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo cerrar.');
    } finally {
      setClosing(false);
    }
  };

  const Row = ({ rt, task }: { rt: ChefProductionRunTask; task: ChefProductionTask }) => {
    const loadingRow = busyId === rt.id;
    return (
      <div
        className={[
          'rounded-xl border px-3 py-3 ring-1 transition',
          rt.isDone
            ? 'border-emerald-200/90 bg-emerald-50/60 ring-emerald-100'
            : 'border-zinc-200/90 bg-white ring-zinc-50',
        ].join(' ')}
      >
        <button
          type="button"
          disabled={isClosed || loadingRow}
          onClick={() => void toggle(rt)}
          className={['flex w-full items-start gap-3 text-left', isClosed ? 'opacity-80' : ''].join(' ')}
        >
          {rt.isDone ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" strokeWidth={2.2} />
          ) : (
            <Circle className="mt-0.5 h-5 w-5 shrink-0 text-zinc-300" strokeWidth={2.2} />
          )}
          <div className="min-w-0 flex-1">
            <p
              className={`text-sm font-semibold leading-snug ${rt.isDone ? 'text-emerald-950 line-through decoration-emerald-700/50' : 'text-zinc-900'}`}
            >
              {task.label}
            </p>
            {task.hint ? <p className="mt-1 text-[11px] font-medium text-zinc-500">{task.hint}</p> : null}
          </div>
        </button>
        {!isClosed && !rt.isDone ? (
          <label className="mt-2 block pl-8">
            <span className="text-[10px] font-bold uppercase text-zinc-400">Nota / cantidad (opcional)</span>
            <input
              value={notes[rt.id] ?? ''}
              onChange={(e) => setNotes((prev) => ({ ...prev, [rt.id]: e.target.value }))}
              className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50/80 px-2 text-xs font-semibold text-zinc-900 outline-none focus:border-[#D32F2F]/40"
              placeholder="Ej. 6 kg, 2 bandejas…"
            />
          </label>
        ) : null}
        {rt.isDone && rt.qtyNote ? (
          <p className="mt-2 pl-8 text-[11px] font-semibold text-emerald-900">Nota: {rt.qtyNote}</p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-10">
      <MermasStyleHero eyebrow="Producción" title={plan?.name ?? 'Ejecución'} compact />

      <Link
        href="/produccion/ejecutar"
        className="inline-flex items-center gap-2 text-sm font-bold text-zinc-700 hover:text-[#D32F2F]"
      >
        <ArrowLeft className="h-4 w-4" />
        Otros planes
      </Link>

      {banner ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{banner}</div>
      ) : null}

      {!localId || !supabaseOk ? (
        <p className="text-center text-sm text-zinc-500">Sesión o Supabase no disponibles.</p>
      ) : loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : !run ? null : (
        <>
          <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Cadencia</p>
                <p className="text-sm font-bold text-zinc-900">{plan ? PRODUCTION_CADENCE_LABEL[plan.cadence] : '—'}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Inicio periodo</p>
                <p className="text-sm font-bold text-zinc-900">{run.periodStart}</p>
              </div>
            </div>
            {run.periodLabel ? (
              <p className="mt-2 text-xs font-semibold text-zinc-600">
                Etiqueta: <span className="text-zinc-900">{run.periodLabel}</span>
              </p>
            ) : null}
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-[11px] font-bold uppercase text-zinc-500">
                <span>Progreso</span>
                <span>
                  {doneCount}/{total}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-[#D32F2F] transition-all duration-300"
                  style={{ width: `${total ? Math.round((doneCount / total) * 100) : 0}%` }}
                />
              </div>
            </div>
            {isClosed ? (
              <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-bold text-emerald-900 ring-1 ring-emerald-100">
                Cerrada · {new Date(run.completedAt!).toLocaleString()}
              </p>
            ) : (
              <button
                type="button"
                disabled={closing}
                onClick={() => void closeRun()}
                className="mt-4 w-full rounded-xl border border-zinc-300 bg-zinc-900 py-3 text-sm font-black uppercase tracking-wide text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50"
              >
                {closing ? 'Guardando…' : 'Registrar cierre'}
              </button>
            )}
          </div>

          <div className="space-y-5">
            {sections
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((s) => {
                const tasks = (tasksBySection[s.id] ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
                if (tasks.length === 0) return null;
                return (
                  <div key={s.id} className="space-y-2">
                    <p className="px-1 text-[11px] font-black uppercase tracking-wider text-zinc-500">{s.title}</p>
                    <div className="space-y-2">
                      {tasks.map((t) => {
                        const rt = byTaskId.get(t.id);
                        if (!rt) return null;
                        return <Row key={t.id} rt={rt} task={t} />;
                      })}
                    </div>
                  </div>
                );
              })}
          </div>

          <Link href="/produccion/historial" className="block text-center text-xs font-bold text-[#D32F2F] underline">
            Ver historial
          </Link>
        </>
      )}
    </div>
  );
}
