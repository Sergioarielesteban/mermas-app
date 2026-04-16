'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  type ChefProductionPlan,
  type ChefProductionSection,
  type ChefProductionTask,
  deleteChefProductionPlan,
  deleteChefProductionSection,
  deleteChefProductionTask,
  fetchChefProductionPlans,
  fetchChefProductionSections,
  fetchChefProductionTasks,
  insertChefProductionPlan,
  insertChefProductionSection,
  insertChefProductionTask,
  updateChefProductionTask,
} from '@/lib/chef-ops-supabase';

function parseStock(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function ProduccionPlanesPage() {
  const { localId, profileReady } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const [plans, setPlans] = useState<ChefProductionPlan[]>([]);
  const [sectionsByPlan, setSectionsByPlan] = useState<Record<string, ChefProductionSection[]>>({});
  const [tasksBySection, setTasksBySection] = useState<Record<string, ChefProductionTask[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const [draftByTask, setDraftByTask] = useState<
    Record<string, { label: string; lj: string; vd: string }>
  >({});
  const [addDraft, setAddDraft] = useState<Record<string, { label: string; lj: string; vd: string }>>({});
  const draftRef = useRef(draftByTask);
  draftRef.current = draftByTask;

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setPlans([]);
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const ps = await fetchChefProductionPlans(supabase, localId);
      setPlans(ps);
      const sec: Record<string, ChefProductionSection[]> = {};
      const tasks: Record<string, ChefProductionTask[]> = {};
      for (const p of ps) {
        const secs = await fetchChefProductionSections(supabase, p.id);
        sec[p.id] = secs;
        for (const s of secs) {
          tasks[s.id] = await fetchChefProductionTasks(supabase, s.id);
        }
      }
      setSectionsByPlan(sec);
      setTasksBySection(tasks);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al cargar listas.');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const syncDraftsForTasks = useCallback((tasks: ChefProductionTask[]) => {
    setDraftByTask((prev) => {
      const next = { ...prev };
      for (const t of tasks) {
        if (!next[t.id]) {
          next[t.id] = {
            label: t.label,
            lj: t.stockLunJue != null ? String(t.stockLunJue) : '',
            vd: t.stockVieDom != null ? String(t.stockVieDom) : '',
          };
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    for (const sid of Object.keys(tasksBySection)) {
      syncDraftsForTasks(tasksBySection[sid] ?? []);
    }
  }, [tasksBySection, syncDraftsForTasks]);

  const addPlan = async () => {
    if (!localId || !supabaseOk || !newName.trim()) return;
    setBusy(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      await insertChefProductionPlan(supabase, localId, { name: newName.trim(), cadence: 'daily' });
      setNewName('');
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo crear.');
    } finally {
      setBusy(false);
    }
  };

  const removePlan = async (id: string) => {
    if (!localId || !supabaseOk) return;
    if (!window.confirm('¿Eliminar esta lista y todo su contenido?')) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await deleteChefProductionPlan(supabase, localId, id);
      await load();
      if (openId === id) setOpenId(null);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo eliminar.');
    } finally {
      setBusy(false);
    }
  };

  const addSection = async (planId: string) => {
    if (!supabaseOk) return;
    const title = window.prompt('Nombre de categoría (ej. Plancha y fritos, Quesos)');
    if (!title?.trim()) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      const cur = sectionsByPlan[planId] ?? [];
      await insertChefProductionSection(supabase, planId, title.trim(), cur.length);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al añadir categoría.');
    } finally {
      setBusy(false);
    }
  };

  const persistTask = async (task: ChefProductionTask, d: { label: string; lj: string; vd: string }) => {
    if (!supabaseOk) return;
    const label = d.label.trim();
    const stockLunJue = parseStock(d.lj);
    const stockVieDom = parseStock(d.vd);
    if (!label) return;
    try {
      const supabase = getSupabaseClient()!;
      await updateChefProductionTask(supabase, task.id, {
        label,
        stockLunJue,
        stockVieDom,
      });
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo guardar el artículo.');
    }
  };

  const addTask = async (sectionId: string) => {
    if (!supabaseOk) return;
    const d = addDraft[sectionId] ?? { label: '', lj: '', vd: '' };
    if (!d.label.trim()) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      const cur = tasksBySection[sectionId] ?? [];
      await insertChefProductionTask(supabase, sectionId, {
        label: d.label.trim(),
        hint: null,
        sortOrder: cur.length,
        stockLunJue: parseStock(d.lj),
        stockVieDom: parseStock(d.vd),
      });
      setAddDraft((prev) => ({ ...prev, [sectionId]: { label: '', lj: '', vd: '' } }));
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al añadir artículo.');
    } finally {
      setBusy(false);
    }
  };

  const removeSection = async (id: string) => {
    if (!supabaseOk) return;
    if (!window.confirm('¿Eliminar esta categoría y sus artículos?')) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await deleteChefProductionSection(supabase, id);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al eliminar.');
    } finally {
      setBusy(false);
    }
  };

  const removeTask = async (id: string) => {
    if (!supabaseOk) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await deleteChefProductionTask(supabase, id);
      setDraftByTask((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al eliminar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pb-10">
      <MermasStyleHero
        eyebrow="Producción"
        title="Artículos y stocks"
        description="Define categorías y artículos. Ajusta el objetivo Lun–Jue y Vie–Dom según temporada; en el día indicas lo que hay y cuánto hacer."
        slim
      />

      <Link
        href="/produccion"
        className="inline-flex items-center gap-2 text-sm font-bold text-zinc-700 hover:text-[#D32F2F]"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver
      </Link>

      {banner ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{banner}</div>
      ) : null}

      {!localId || !supabaseOk ? (
        <p className="text-center text-sm text-zinc-500">Conecta Supabase y un local para editar la lista.</p>
      ) : loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : (
        <>
          <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Nueva lista</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              Puedes tener varias (ej. cocina, bar). Dentro añades categorías y artículos.
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre (ej. Lista producción cocina)"
                className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#D32F2F]/50 focus:bg-white focus:ring-2 focus:ring-[#D32F2F]/15"
              />
              <button
                type="button"
                disabled={busy || !newName.trim()}
                onClick={() => void addPlan()}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#D32F2F] px-4 text-sm font-black uppercase tracking-wide text-white shadow-sm disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Crear
              </button>
            </div>
          </section>

          <div className="space-y-3">
            {plans.map((p) => {
              const open = openId === p.id;
              const sections = sectionsByPlan[p.id] ?? [];
              const taskCount = sections.reduce((acc, s) => acc + (tasksBySection[s.id]?.length ?? 0), 0);
              return (
                <div
                  key={p.id}
                  className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-white to-zinc-50/80 shadow-sm ring-1 ring-zinc-100"
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : p.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-zinc-900">{p.name}</p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#B91C1C]">
                        {sections.length} categorías · {taskCount} artículos
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-zinc-400">{open ? '▲' : '▼'}</span>
                  </button>
                  {open ? (
                    <div className="space-y-3 border-t border-zinc-100 px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void addSection(p.id)}
                          className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-zinc-800"
                        >
                          + Categoría
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void removePlan(p.id)}
                          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-800"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar lista
                        </button>
                      </div>

                      {sections.map((s) => {
                        const add = addDraft[s.id] ?? { label: '', lj: '', vd: '' };
                        return (
                          <div
                            key={s.id}
                            className="rounded-xl border border-zinc-200/80 bg-white/90 p-3 ring-1 ring-zinc-50"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-black uppercase tracking-wide text-zinc-700">{s.title}</p>
                              <div className="flex gap-1">
                                <button type="button" onClick={() => void removeSection(s.id)} className="text-red-600">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-100">
                              <table className="w-full min-w-[320px] text-left text-[11px]">
                                <thead>
                                  <tr className="border-b border-zinc-100 bg-zinc-50/90 text-[10px] font-black uppercase text-zinc-500">
                                    <th className="px-2 py-2">Artículo</th>
                                    <th className="px-2 py-2 w-20">Lun–Jue</th>
                                    <th className="px-2 py-2 w-20">Vie–Dom</th>
                                    <th className="w-8" />
                                  </tr>
                                </thead>
                                <tbody>
                                  {(tasksBySection[s.id] ?? []).map((t) => {
                                    const d =
                                      draftByTask[t.id] ?? {
                                        label: t.label,
                                        lj: t.stockLunJue != null ? String(t.stockLunJue) : '',
                                        vd: t.stockVieDom != null ? String(t.stockVieDom) : '',
                                      };
                                    return (
                                      <tr key={t.id} className="border-b border-zinc-50 align-top">
                                        <td className="px-2 py-1.5">
                                          <input
                                            value={d.label}
                                            onChange={(e) =>
                                              setDraftByTask((prev) => ({
                                                ...prev,
                                                [t.id]: { ...d, label: e.target.value },
                                              }))
                                            }
                                            onBlur={() => {
                                              const cur = draftRef.current[t.id] ?? d;
                                              void persistTask(t, cur);
                                            }}
                                            className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-900 outline-none focus:border-[#D32F2F]/40"
                                          />
                                        </td>
                                        <td className="px-2 py-1.5">
                                          <input
                                            inputMode="decimal"
                                            value={d.lj}
                                            onChange={(e) =>
                                              setDraftByTask((prev) => ({
                                                ...prev,
                                                [t.id]: { ...d, lj: e.target.value },
                                              }))
                                            }
                                            onBlur={() => {
                                              const cur = draftRef.current[t.id] ?? d;
                                              void persistTask(t, cur);
                                            }}
                                            className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold tabular-nums outline-none focus:border-[#D32F2F]/40"
                                          />
                                        </td>
                                        <td className="px-2 py-1.5">
                                          <input
                                            inputMode="decimal"
                                            value={d.vd}
                                            onChange={(e) =>
                                              setDraftByTask((prev) => ({
                                                ...prev,
                                                [t.id]: { ...d, vd: e.target.value },
                                              }))
                                            }
                                            onBlur={() => {
                                              const cur = draftRef.current[t.id] ?? d;
                                              void persistTask(t, cur);
                                            }}
                                            className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold tabular-nums outline-none focus:border-[#D32F2F]/40"
                                          />
                                        </td>
                                        <td className="px-1 py-1.5 text-center">
                                          <button
                                            type="button"
                                            onClick={() => void removeTask(t.id)}
                                            className="text-red-600"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>

                            <div className="mt-2 flex flex-col gap-2 rounded-lg bg-zinc-50/80 p-2 sm:flex-row sm:items-end">
                              <input
                                value={add.label}
                                onChange={(e) =>
                                  setAddDraft((prev) => ({
                                    ...prev,
                                    [s.id]: { ...add, label: e.target.value },
                                  }))
                                }
                                placeholder="Nuevo artículo"
                                className="h-9 flex-1 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold outline-none focus:border-[#D32F2F]/40"
                              />
                              <input
                                inputMode="decimal"
                                value={add.lj}
                                onChange={(e) =>
                                  setAddDraft((prev) => ({
                                    ...prev,
                                    [s.id]: { ...add, lj: e.target.value },
                                  }))
                                }
                                placeholder="Lun–Jue"
                                className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold tabular-nums outline-none focus:border-[#D32F2F]/40 sm:w-20"
                              />
                              <input
                                inputMode="decimal"
                                value={add.vd}
                                onChange={(e) =>
                                  setAddDraft((prev) => ({
                                    ...prev,
                                    [s.id]: { ...add, vd: e.target.value },
                                  }))
                                }
                                placeholder="Vie–Dom"
                                className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold tabular-nums outline-none focus:border-[#D32F2F]/40 sm:w-20"
                              />
                              <button
                                type="button"
                                disabled={busy || !add.label.trim()}
                                onClick={() => void addTask(s.id)}
                                className="h-9 shrink-0 rounded-lg bg-zinc-900 px-3 text-[11px] font-black uppercase text-white disabled:opacity-45"
                              >
                                Añadir
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
