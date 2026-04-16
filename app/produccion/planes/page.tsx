'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  PRODUCTION_CADENCE_LABEL,
  type ChefProductionPlan,
  type ChefProductionSection,
  type ChefProductionTask,
  type ProductionCadence,
  deleteChefProductionPlan,
  deleteChefProductionSection,
  deleteChefProductionTask,
  fetchChefProductionPlans,
  fetchChefProductionSections,
  fetchChefProductionTasks,
  insertChefProductionPlan,
  insertChefProductionSection,
  insertChefProductionTask,
} from '@/lib/chef-ops-supabase';

const CADENCES: ProductionCadence[] = ['daily', 'weekly', 'monthly', 'custom'];

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
  const [newCadence, setNewCadence] = useState<ProductionCadence>('daily');
  const [busy, setBusy] = useState(false);

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
      setBanner(e instanceof Error ? e.message : 'Error al cargar planes.');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const addPlan = async () => {
    if (!localId || !supabaseOk || !newName.trim()) return;
    setBusy(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      await insertChefProductionPlan(supabase, localId, { name: newName.trim(), cadence: newCadence });
      setNewName('');
      setNewCadence('daily');
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo crear.');
    } finally {
      setBusy(false);
    }
  };

  const removePlan = async (id: string) => {
    if (!localId || !supabaseOk) return;
    if (!window.confirm('¿Eliminar este plan y todo su contenido?')) return;
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
    const title = window.prompt('Nombre de la zona (ej. Verduras, Cuarto frío)');
    if (!title?.trim()) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      const cur = sectionsByPlan[planId] ?? [];
      await insertChefProductionSection(supabase, planId, title.trim(), cur.length);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al añadir zona.');
    } finally {
      setBusy(false);
    }
  };

  const addTask = async (sectionId: string) => {
    if (!supabaseOk) return;
    const label = window.prompt('Tarea / trabajo');
    if (!label?.trim()) return;
    const hint = window.prompt('Pista o cantidad esperada (opcional, puedes dejar vacío)')?.trim() || null;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      const cur = tasksBySection[sectionId] ?? [];
      await insertChefProductionTask(supabase, sectionId, {
        label: label.trim(),
        hint,
        sortOrder: cur.length,
      });
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al añadir tarea.');
    } finally {
      setBusy(false);
    }
  };

  const removeSection = async (id: string) => {
    if (!supabaseOk) return;
    if (!window.confirm('¿Eliminar esta zona y sus tareas?')) return;
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
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al eliminar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pb-10">
      <MermasStyleHero eyebrow="Producción" title="Mis planes" compact />

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
        <p className="text-center text-sm text-zinc-500">Conecta Supabase y un local para editar planes.</p>
      ) : loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : (
        <>
          <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Nuevo plan</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre (ej. Prep frío diario)"
                className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#D32F2F]/50 focus:bg-white focus:ring-2 focus:ring-[#D32F2F]/15"
              />
              <select
                value={newCadence}
                onChange={(e) => setNewCadence(e.target.value as ProductionCadence)}
                className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900"
              >
                {CADENCES.map((c) => (
                  <option key={c} value={c}>
                    {PRODUCTION_CADENCE_LABEL[c]}
                  </option>
                ))}
              </select>
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
                        {PRODUCTION_CADENCE_LABEL[p.cadence]} · {sections.length} zonas · {taskCount} tareas
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
                          + Zona
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void removePlan(p.id)}
                          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-800"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar plan
                        </button>
                      </div>

                      {sections.map((s) => (
                        <div key={s.id} className="rounded-xl border border-zinc-200/80 bg-white/90 p-3 ring-1 ring-zinc-50">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-black uppercase tracking-wide text-zinc-700">{s.title}</p>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => void addTask(s.id)}
                                className="rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-bold text-white"
                              >
                                + Tarea
                              </button>
                              <button type="button" onClick={() => void removeSection(s.id)} className="text-red-600">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <ul className="mt-2 space-y-1.5">
                            {(tasksBySection[s.id] ?? []).map((t) => (
                              <li
                                key={t.id}
                                className="flex items-start justify-between gap-2 rounded-md bg-zinc-50 px-2 py-1.5"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-zinc-800">{t.label}</p>
                                  {t.hint ? (
                                    <p className="mt-0.5 text-[10px] font-medium text-zinc-500">{t.hint}</p>
                                  ) : null}
                                </div>
                                <button type="button" onClick={() => void removeTask(t.id)} className="shrink-0 text-red-600">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
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
