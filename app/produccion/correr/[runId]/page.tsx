'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  PRODUCTION_STOCK_BAND_LABEL,
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
  productionStockBandForDate,
  suggestQtyToMake,
  targetForProductionBand,
  updateChefProductionRunTaskQty,
} from '@/lib/chef-ops-supabase';

function parseQty(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function fmtQty(n: number | null): string {
  if (n == null || Number.isNaN(n)) return '';
  return String(n);
}

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
  const [band, setBand] = useState<'weekday' | 'weekend'>('weekday');
  const [hechoDraft, setHechoDraft] = useState<Record<string, string>>({});
  const [hacerDraft, setHacerDraft] = useState<Record<string, string>>({});
  /** Si el usuario edita «Hacer», dejamos de sobrescribirlo al cambiar «Hecho». */
  const [hacerManual, setHacerManual] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const hechoRef = useRef(hechoDraft);
  const hacerRef = useRef(hacerDraft);
  hechoRef.current = hechoDraft;
  hacerRef.current = hacerDraft;
  const bandSeededForRunRef = useRef<string | null>(null);

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
      const h: Record<string, string> = {};
      const m: Record<string, string> = {};
      for (const x of rt) {
        h[x.id] = fmtQty(x.qtyOnHand);
        m[x.id] = fmtQty(x.qtyToMake);
      }
      setHechoDraft(h);
      setHacerDraft(m);
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

  useEffect(() => {
    setHacerManual({});
    bandSeededForRunRef.current = null;
  }, [runId]);

  useEffect(() => {
    if (!run?.id || !run.periodStart) return;
    if (bandSeededForRunRef.current === run.id) return;
    bandSeededForRunRef.current = run.id;
    setBand(productionStockBandForDate(run.periodStart));
  }, [run?.id, run?.periodStart]);

  const byTaskId = useMemo(() => {
    const m = new Map<string, ChefProductionRunTask>();
    for (const rt of runTasks) m.set(rt.taskId, rt);
    return m;
  }, [runTasks]);

  const isClosed = Boolean(run?.completedAt);

  const persistRow = async (rt: ChefProductionRunTask, task: ChefProductionTask, syncHacerFromHecho: boolean) => {
    if (!supabaseOk || isClosed) return;
    const supabase = getSupabaseClient()!;
    const hStr = hechoRef.current[rt.id] ?? '';
    const mStr = hacerRef.current[rt.id] ?? '';
    const qtyOnHand = parseQty(hStr);
    let qtyToMake = parseQty(mStr);
    const target = targetForProductionBand(task, band);
    const suggested = suggestQtyToMake(target, qtyOnHand);

    if (syncHacerFromHecho && !hacerManual[rt.id]) {
      qtyToMake = suggested;
      setHacerDraft((prev) => ({ ...prev, [rt.id]: fmtQty(suggested) }));
    }

    setSavingId(rt.id);
    setBanner(null);
    try {
      await updateChefProductionRunTaskQty(supabase, rt.id, { qtyOnHand, qtyToMake });
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSavingId(null);
    }
  };

  const applySuggested = async (rt: ChefProductionRunTask, task: ChefProductionTask) => {
    if (!supabaseOk || isClosed) return;
    const target = targetForProductionBand(task, band);
    const qtyOnHand = parseQty(hechoRef.current[rt.id] ?? '');
    const suggested = suggestQtyToMake(target, qtyOnHand);
    setHacerManual((prev) => ({ ...prev, [rt.id]: false }));
    setHacerDraft((prev) => ({ ...prev, [rt.id]: fmtQty(suggested) }));
    setSavingId(rt.id);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      await updateChefProductionRunTaskQty(supabase, rt.id, { qtyOnHand, qtyToMake: suggested });
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSavingId(null);
    }
  };

  const closeRun = async () => {
    if (!supabaseOk || !run || isClosed) return;
    if (!window.confirm('¿Registrar cierre de esta lista? Podrás verla en el historial.')) return;
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

  return (
    <div className="space-y-4 pb-10">
      <MermasStyleHero eyebrow="Producción" title={plan?.name ?? 'Lista del día'} slim />

      <Link
        href="/produccion/ejecutar"
        className="inline-flex items-center gap-2 text-sm font-bold text-zinc-700 hover:text-[#D32F2F]"
      >
        <ArrowLeft className="h-4 w-4" />
        Otras listas
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
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Fecha de referencia</p>
                <p className="text-sm font-bold text-zinc-900">{run.periodStart}</p>
                {run.periodLabel ? (
                  <p className="mt-1 text-xs font-semibold text-zinc-600">{run.periodLabel}</p>
                ) : null}
              </div>
              <div className="flex flex-col items-stretch gap-1 sm:items-end">
                <span className="text-[10px] font-black uppercase text-zinc-500">Objetivo de stock</span>
                <div className="inline-flex rounded-xl border border-zinc-200 bg-zinc-50 p-0.5">
                  <button
                    type="button"
                    disabled={isClosed}
                    onClick={() => setBand('weekday')}
                    className={[
                      'rounded-lg px-3 py-1.5 text-[11px] font-black uppercase tracking-wide transition',
                      band === 'weekday' ? 'bg-[#D32F2F] text-white shadow-sm' : 'text-zinc-600 hover:text-zinc-900',
                    ].join(' ')}
                  >
                    Lun–Jue
                  </button>
                  <button
                    type="button"
                    disabled={isClosed}
                    onClick={() => setBand('weekend')}
                    className={[
                      'rounded-lg px-3 py-1.5 text-[11px] font-black uppercase tracking-wide transition',
                      band === 'weekend' ? 'bg-[#D32F2F] text-white shadow-sm' : 'text-zinc-600 hover:text-zinc-900',
                    ].join(' ')}
                  >
                    Vie–Dom
                  </button>
                </div>
                <p className="text-[10px] font-medium text-zinc-500">
                  Por defecto según el día; puedes forzar el tramo si hace falta.
                </p>
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
                        const target = targetForProductionBand(t, band);
                        const onHand = parseQty(hechoDraft[rt.id] ?? '');
                        const suggested = suggestQtyToMake(target, onHand);
                        const saving = savingId === rt.id;
                        return (
                          <div
                            key={t.id}
                            className="rounded-xl border border-zinc-200/90 bg-white px-3 py-3 shadow-sm ring-1 ring-zinc-50"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <p className="text-sm font-bold leading-snug text-zinc-900">{t.label}</p>
                              <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-600">
                                {PRODUCTION_STOCK_BAND_LABEL[band]} · obj. {target}
                              </span>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <label className="block sm:col-span-1">
                                <span className="text-[10px] font-bold uppercase text-zinc-400">Hecho</span>
                                <input
                                  disabled={isClosed || saving}
                                  inputMode="decimal"
                                  value={hechoDraft[rt.id] ?? ''}
                                  onChange={(e) =>
                                    setHechoDraft((prev) => ({ ...prev, [rt.id]: e.target.value }))
                                  }
                                  onBlur={() => void persistRow(rt, t, true)}
                                  className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50/80 px-2 text-sm font-semibold tabular-nums outline-none focus:border-[#D32F2F]/40 disabled:opacity-60"
                                  placeholder="0"
                                />
                              </label>
                              <label className="block sm:col-span-1">
                                <span className="text-[10px] font-bold uppercase text-zinc-400">Hacer</span>
                                <input
                                  disabled={isClosed || saving}
                                  inputMode="decimal"
                                  value={hacerDraft[rt.id] ?? ''}
                                  onChange={(e) => {
                                    setHacerManual((prev) => ({ ...prev, [rt.id]: true }));
                                    setHacerDraft((prev) => ({ ...prev, [rt.id]: e.target.value }));
                                  }}
                                  onBlur={() => void persistRow(rt, t, false)}
                                  className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50/80 px-2 text-sm font-semibold tabular-nums outline-none focus:border-[#D32F2F]/40 disabled:opacity-60"
                                  placeholder="0"
                                />
                              </label>
                              <div className="col-span-2 flex flex-col justify-end gap-1 sm:col-span-2">
                                <p className="text-[11px] font-semibold text-zinc-600">
                                  Sugerido:{' '}
                                  <span className="tabular-nums text-zinc-900">{suggested}</span>
                                  <span className="font-normal text-zinc-400"> (= objetivo − hecho)</span>
                                </p>
                                {!isClosed ? (
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => void applySuggested(rt, t)}
                                    className="inline-flex items-center gap-1 self-start rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[10px] font-black uppercase text-zinc-700 hover:border-[#D32F2F]/30"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                    Usar sugerido
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
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
