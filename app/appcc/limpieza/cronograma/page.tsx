'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  fetchCleaningCategories,
  fetchCleaningTasks,
  fetchCleaningWeekdayItems,
  replaceCleaningWeekdayItems,
  type AppccCleaningCategoryRow,
  type AppccCleaningTaskRow,
  type AppccCleaningWeekdayItemRow,
} from '@/lib/appcc-limpieza-supabase';
import {
  APPCC_UNIT_TYPE_LABEL,
  APPCC_ZONE_LABEL,
  fetchAppccColdUnits,
  type AppccColdUnitRow,
} from '@/lib/appcc-supabase';

/** Orden visual: lunes → domingo (Date.getDay: lun=1 … dom=0). */
const WEEKDAY_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0] as const;

const WEEKDAY_LONG: Record<number, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
};

const WEEKDAY_SHORT: Record<number, string> = {
  0: 'Dom',
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
};

type DayDraft = { taskIds: string[]; coldUnitIds: string[] };

function emptyDraft(): Record<number, DayDraft> {
  const d: Record<number, DayDraft> = {};
  for (let w = 0; w <= 6; w += 1) d[w] = { taskIds: [], coldUnitIds: [] };
  return d;
}

function rowsToDraft(rows: AppccCleaningWeekdayItemRow[]): Record<number, DayDraft> {
  const d = emptyDraft();
  for (const r of rows) {
    if (r.task_id) d[r.weekday].taskIds.push(r.task_id);
    else if (r.cold_unit_id) d[r.weekday].coldUnitIds.push(r.cold_unit_id);
  }
  return d;
}

function toggleId(list: string[], id: string, on: boolean): string[] {
  if (on) return list.includes(id) ? list : [...list, id];
  return list.filter((x) => x !== id);
}

export default function AppccLimpiezaCronogramaPage() {
  const { localId } = useAuth();
  const [categories, setCategories] = useState<AppccCleaningCategoryRow[]>([]);
  const [tasks, setTasks] = useState<AppccCleaningTaskRow[]>([]);
  const [coldUnits, setColdUnits] = useState<AppccColdUnitRow[]>([]);
  const [scheduleRows, setScheduleRows] = useState<AppccCleaningWeekdayItemRow[]>([]);
  const [draft, setDraft] = useState<Record<number, DayDraft>>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [savingWeekday, setSavingWeekday] = useState<number | null>(null);

  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!localId || !supabaseOk) {
        setCategories([]);
        setTasks([]);
        setColdUnits([]);
        setScheduleRows([]);
        setDraft(emptyDraft());
        if (!silent) setLoading(false);
        return;
      }
      const supabase = getSupabaseClient()!;
      if (!silent) {
        setLoading(true);
        setBanner(null);
      }
      try {
        const [c, t, u, sched] = await Promise.all([
          fetchCleaningCategories(supabase, localId),
          fetchCleaningTasks(supabase, localId, false),
          fetchAppccColdUnits(supabase, localId, true),
          fetchCleaningWeekdayItems(supabase, localId),
        ]);
        setCategories(c);
        setTasks(t);
        setColdUnits(u);
        setScheduleRows(sched);
        setDraft(rowsToDraft(sched));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error al cargar.';
        if (!silent) {
          if (msg.toLowerCase().includes('appcc_cleaning_weekday_items') || msg.includes('does not exist')) {
            setBanner(
              'Falta la tabla del cronograma. Ejecuta supabase-appcc-limpieza-migration-weekday-schedule.sql en Supabase.',
            );
          } else {
            setBanner(msg);
          }
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [localId, supabaseOk],
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
    return () => document.removeEventListener('visibilitychange', ping);
  }, []);

  const tasksByCat = useMemo(() => {
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

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const todayWd = new Date().getDay();
  const todayLabel = (() => {
    try {
      return new Date().toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    } catch {
      return WEEKDAY_LONG[todayWd];
    }
  })();

  const resolveLines = useCallback(
    (wd: number) => {
      const d = draft[wd] ?? { taskIds: [], coldUnitIds: [] };
      const lines: { key: string; text: string; sub?: string }[] = [];
      for (const tid of d.taskIds) {
        const task = tasks.find((x) => x.id === tid);
        if (!task) continue;
        const cat = catById.get(task.category_id)?.name;
        lines.push({
          key: `t-${tid}`,
          text: task.title,
          sub: cat,
        });
      }
      for (const cid of d.coldUnitIds) {
        const u = coldUnits.find((x) => x.id === cid);
        if (!u) continue;
        lines.push({
          key: `c-${cid}`,
          text: u.name,
          sub: `${APPCC_UNIT_TYPE_LABEL[u.unit_type]} · ${APPCC_ZONE_LABEL[u.zone]}`,
        });
      }
      return lines;
    },
    [draft, tasks, coldUnits, catById],
  );

  const todayLines = useMemo(() => resolveLines(todayWd), [resolveLines, todayWd]);

  const saveDay = async (wd: number) => {
    if (!localId || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    const d = draft[wd] ?? { taskIds: [], coldUnitIds: [] };
    const payload = [
      ...d.taskIds.map((taskId) => ({ taskId })),
      ...d.coldUnitIds.map((coldUnitId) => ({ coldUnitId })),
    ];
    setSavingWeekday(wd);
    setBanner(null);
    try {
      await replaceCleaningWeekdayItems(supabase, localId, wd, payload);
      const sched = await fetchCleaningWeekdayItems(supabase, localId);
      setScheduleRows(sched);
      setDraft(rowsToDraft(sched));
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSavingWeekday(null);
    }
  };

  return (
    <div className="space-y-4">
      <MermasStyleHero
        eyebrow="APPCC · Limpieza"
        title="Cronograma semanal"
        description="Asigna tareas de limpieza y equipos frío a cada día. El equipo ve al llegar qué toca hoy."
      />

      <Link
        href="/appcc/limpieza"
        className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-[#D32F2F]"
      >
        <ChevronLeft className="h-4 w-4" />
        Limpieza y mantenimiento
      </Link>

      {loading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}
      {banner ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{banner}</p>
      ) : null}

      <section className="rounded-2xl border-2 border-[#D32F2F]/35 bg-gradient-to-br from-[#D32F2F]/8 to-white p-4 ring-1 ring-[#D32F2F]/15">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#D32F2F]/15 text-[#D32F2F]">
            <CalendarDays className="h-5 w-5" strokeWidth={2.1} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#D32F2F]">Hoy toca</p>
            <p className="mt-0.5 text-base font-black capitalize leading-tight text-zinc-900">{todayLabel}</p>
            {todayLines.length === 0 ? (
              <p className="mt-2 text-sm leading-snug text-zinc-600">
                Nada programado para hoy. Marca tareas y equipos abajo y pulsa <strong>Guardar</strong> en ese día.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {todayLines.map((line) => (
                  <li
                    key={line.key}
                    className="rounded-lg bg-white/90 px-2.5 py-1.5 text-sm ring-1 ring-zinc-200/80"
                  >
                    <span className="font-semibold text-zinc-900">{line.text}</span>
                    {line.sub ? (
                      <span className="mt-0.5 block text-xs text-zinc-500">{line.sub}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200/90 bg-white p-3 shadow-sm ring-1 ring-zinc-100 sm:p-4">
        <p className="text-center text-xs font-bold uppercase tracking-wide text-zinc-500">Vista rápida · semana</p>
        <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-1.5">
          {WEEKDAY_ORDER.map((wd) => {
            const n = (draft[wd]?.taskIds.length ?? 0) + (draft[wd]?.coldUnitIds.length ?? 0);
            const isToday = wd === todayWd;
            return (
              <div
                key={wd}
                className={[
                  'rounded-lg px-1 py-2 text-center ring-1 sm:py-2.5',
                  isToday ? 'bg-[#D32F2F]/10 ring-[#D32F2F]/30' : 'bg-zinc-50 ring-zinc-200/80',
                ].join(' ')}
              >
                <p className={`text-[9px] font-bold uppercase sm:text-[10px] ${isToday ? 'text-[#D32F2F]' : 'text-zinc-500'}`}>
                  {WEEKDAY_SHORT[wd]}
                </p>
                <p className="mt-0.5 text-sm font-black tabular-nums text-zinc-900">{n}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-center text-[10px] text-zinc-400">Número de ítems programados por día</p>
      </section>

      <section className="space-y-3">
        <p className="text-sm font-bold text-zinc-800">Organizar por día</p>
        <p className="text-xs leading-snug text-zinc-500">
          Marca tareas (de «Categorías y tareas») y equipos frío (de «Gestionar equipos»). Pulsa <strong>Guardar</strong> en
          cada día al terminar los cambios.
        </p>

        {WEEKDAY_ORDER.map((wd) => {
          const d = draft[wd] ?? { taskIds: [], coldUnitIds: [] };
          const busy = savingWeekday === wd;
          return (
            <details
              key={wd}
              className="group rounded-2xl border border-zinc-200/90 bg-white ring-1 ring-zinc-100 open:shadow-sm"
            >
              <summary className="cursor-pointer list-none px-3 py-3 [&::-webkit-details-marker]:hidden sm:px-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-zinc-900">
                      {WEEKDAY_LONG[wd]}
                      {wd === todayWd ? (
                        <span className="ml-2 rounded-md bg-[#D32F2F]/12 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#D32F2F]">
                          Hoy
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {d.taskIds.length + d.coldUnitIds.length} ítem
                      {d.taskIds.length + d.coldUnitIds.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-[#D32F2F] group-open:hidden">Abrir</span>
                  <span className="hidden text-[11px] font-bold text-zinc-400 group-open:inline">Cerrar</span>
                </div>
              </summary>

              <div className="border-t border-zinc-100 px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Tareas de limpieza</p>
                {categories.length === 0 ? (
                  <p className="mb-3 text-xs text-zinc-500">
                    Sin categorías. Créalas en{' '}
                    <Link href="/appcc/limpieza/tareas" className="font-semibold text-[#D32F2F] underline">
                      Categorías y tareas
                    </Link>
                    .
                  </p>
                ) : (
                  <div className="mb-4 space-y-3">
                    {categories.map((cat) => {
                      const list = tasksByCat.get(cat.id) ?? [];
                      if (list.length === 0) return null;
                      return (
                        <div key={cat.id}>
                          <p className="mb-1.5 text-xs font-semibold text-zinc-700">{cat.name}</p>
                          <ul className="space-y-1">
                            {list.map((task) => {
                              const on = d.taskIds.includes(task.id);
                              return (
                                <li key={task.id}>
                                  <label className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 hover:bg-zinc-50">
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      disabled={!task.is_active}
                                      onChange={(e) => {
                                        setDraft((prev) => ({
                                          ...prev,
                                          [wd]: {
                                            ...prev[wd],
                                            taskIds: toggleId(prev[wd].taskIds, task.id, e.target.checked),
                                          },
                                        }));
                                      }}
                                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-[#D32F2F] focus:ring-[#D32F2F]/40"
                                    />
                                    <span className="min-w-0 text-sm leading-snug text-zinc-800">
                                      {task.title}
                                      {!task.is_active ? (
                                        <span className="ml-1 text-xs text-zinc-400">(inactiva)</span>
                                      ) : null}
                                    </span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}

                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Equipos frío</p>
                {coldUnits.length === 0 ? (
                  <p className="mb-3 text-xs text-zinc-500">
                    Sin equipos. Alta en{' '}
                    <Link href="/appcc/equipos" className="font-semibold text-[#D32F2F] underline">
                      Gestionar equipos
                    </Link>
                    .
                  </p>
                ) : (
                  <ul className="mb-4 space-y-1">
                    {coldUnits.map((u) => {
                      const on = d.coldUnitIds.includes(u.id);
                      return (
                        <li key={u.id}>
                          <label className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 hover:bg-zinc-50">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={(e) => {
                                setDraft((prev) => ({
                                  ...prev,
                                  [wd]: {
                                    ...prev[wd],
                                    coldUnitIds: toggleId(prev[wd].coldUnitIds, u.id, e.target.checked),
                                  },
                                }));
                              }}
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-[#D32F2F] focus:ring-[#D32F2F]/40"
                            />
                            <span className="min-w-0 text-sm leading-snug text-zinc-800">
                              {u.name}
                              <span className="block text-xs text-zinc-500">
                                {APPCC_UNIT_TYPE_LABEL[u.unit_type]} · {APPCC_ZONE_LABEL[u.zone]}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveDay(wd)}
                  className="h-10 w-full rounded-xl bg-[#D32F2F] text-sm font-bold text-white shadow-sm disabled:opacity-60"
                >
                  {busy ? 'Guardando…' : `Guardar ${WEEKDAY_LONG[wd]}`}
                </button>
              </div>
            </details>
          );
        })}
      </section>

      {scheduleRows.length > 0 && !loading ? (
        <p className="text-center text-[10px] text-zinc-400">
          {scheduleRows.length} línea{scheduleRows.length === 1 ? '' : 's'} en cronograma guardadas en servidor.
        </p>
      ) : null}
    </div>
  );
}
