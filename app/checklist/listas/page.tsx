'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { appConfirm, appPrompt } from '@/lib/app-dialog-bridge';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  CHECKLIST_CONTEXT_LABEL,
  type ChecklistContext,
  type ChefChecklist,
  type ChefChecklistItem,
  type ChefChecklistSection,
  deleteChefChecklist,
  deleteChefChecklistItem,
  deleteChefChecklistSection,
  fetchChefChecklistItems,
  fetchChefChecklists,
  fetchChefChecklistSections,
  insertChefChecklist,
  insertChefChecklistItem,
  insertChefChecklistSection,
} from '@/lib/chef-ops-supabase';

const CONTEXTS: ChecklistContext[] = ['opening', 'shift_change', 'closing', 'hygiene_bathroom', 'custom'];

function formatChecklistMutateError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/foreign key|violates|chef_checklist/i.test(raw)) {
    return 'No se puede borrar: esta lista o ítem tiene ejecuciones guardadas. Un administrador debe ejecutar en Supabase el script supabase-chef-ops-checklist-fk-cascade.sql (incluido en el proyecto); después el borrado funcionará y limpiará esas filas del historial.';
  }
  return raw;
}

export default function ChecklistListasPage() {
  const { localId, profileReady } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const [lists, setLists] = useState<ChefChecklist[]>([]);
  const [sectionsByList, setSectionsByList] = useState<Record<string, ChefChecklistSection[]>>({});
  const [itemsByList, setItemsByList] = useState<Record<string, ChefChecklistItem[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newCtx, setNewCtx] = useState<ChecklistContext>('custom');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setLists([]);
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const ls = await fetchChefChecklists(supabase, localId);
      setLists(ls);
      const sec: Record<string, ChefChecklistSection[]> = {};
      const it: Record<string, ChefChecklistItem[]> = {};
      for (const c of ls) {
        sec[c.id] = await fetchChefChecklistSections(supabase, c.id);
        it[c.id] = await fetchChefChecklistItems(supabase, c.id);
      }
      setSectionsByList(sec);
      setItemsByList(it);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al cargar listas.');
      setLists([]);
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const addList = async () => {
    if (!localId || !supabaseOk || !newTitle.trim()) return;
    setBusy(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      await insertChefChecklist(supabase, localId, { title: newTitle.trim(), context: newCtx });
      setNewTitle('');
      setNewCtx('custom');
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo crear.');
    } finally {
      setBusy(false);
    }
  };

  const quickTemplate = async (title: string, ctx: ChecklistContext) => {
    if (!localId || !supabaseOk) return;
    setBusy(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      const c = await insertChefChecklist(supabase, localId, { title, context: ctx });
      await load();
      setOpenId(c.id);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo crear plantilla.');
    } finally {
      setBusy(false);
    }
  };

  const removeList = async (id: string) => {
    if (!localId || !supabaseOk) return;
    if (
      !(await appConfirm(
        '¿Eliminar esta lista y todo su contenido? También se borrarán las ejecuciones del historial vinculadas a esta lista.',
      ))
    )
      return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await deleteChefChecklist(supabase, localId, id);
      await load();
      if (openId === id) setOpenId(null);
    } catch (e) {
      setBanner(formatChecklistMutateError(e));
    } finally {
      setBusy(false);
    }
  };

  const addSection = async (checklistId: string) => {
    if (!supabaseOk) return;
    const title = await appPrompt('Nombre de la sección (ej. Cocina fría)');
    if (!title?.trim()) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      const cur = sectionsByList[checklistId] ?? [];
      await insertChefChecklistSection(supabase, checklistId, title.trim(), cur.length);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al añadir sección.');
    } finally {
      setBusy(false);
    }
  };

  const addItem = async (checklistId: string, sectionId: string | null) => {
    if (!supabaseOk) return;
    const label = await appPrompt('Texto del ítem');
    if (!label?.trim()) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      const cur = itemsByList[checklistId] ?? [];
      await insertChefChecklistItem(supabase, checklistId, {
        label: label.trim(),
        sectionId,
        sortOrder: cur.length,
      });
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al añadir ítem.');
    } finally {
      setBusy(false);
    }
  };

  const removeSection = async (id: string) => {
    if (!supabaseOk) return;
    if (!(await appConfirm('¿Eliminar sección y sus ítems?'))) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await deleteChefChecklistSection(supabase, id);
      await load();
    } catch (e) {
      setBanner(formatChecklistMutateError(e));
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (id: string) => {
    if (!supabaseOk) return;
    if (
      !(await appConfirm(
        '¿Quitar este ítem? Las marcas de este ítem en ejecuciones antiguas también se eliminarán del historial.',
      ))
    )
      return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await deleteChefChecklistItem(supabase, id);
      await load();
    } catch (e) {
      setBanner(formatChecklistMutateError(e));
    } finally {
      setBusy(false);
    }
  };

  const itemsWithoutSection = useCallback(
    (checklistId: string) => (itemsByList[checklistId] ?? []).filter((i) => !i.sectionId),
    [itemsByList],
  );

  return (
    <div className="space-y-4 pb-10">
      <MermasStyleHero eyebrow="Check list" title="Mis listas" slim />

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
        <p className="text-center text-sm text-zinc-500">Conecta Supabase y un local para editar listas.</p>
      ) : loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : (
        <>
          <section className="rounded-2xl border border-zinc-200/90 bg-white p-3.5 shadow-sm ring-1 ring-zinc-100">
            <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Nueva lista</p>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-end">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Nombre (ej. Apertura cocina)"
                className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#D32F2F]/50 focus:bg-white focus:ring-2 focus:ring-[#D32F2F]/15"
              />
              <select
                value={newCtx}
                onChange={(e) => setNewCtx(e.target.value as ChecklistContext)}
                className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900"
              >
                {CONTEXTS.map((c) => (
                  <option key={c} value={c}>
                    {CHECKLIST_CONTEXT_LABEL[c]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || !newTitle.trim()}
                onClick={() => void addList()}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#D32F2F] px-4 text-sm font-black uppercase tracking-wide text-white shadow-sm disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Crear
              </button>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <span className="w-full text-[10px] font-bold uppercase text-zinc-400">Atajos</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void quickTemplate('Apertura del local', 'opening')}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] font-bold text-zinc-800 hover:bg-white"
              >
                + Apertura
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void quickTemplate('Cambio de turno', 'shift_change')}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] font-bold text-zinc-800 hover:bg-white"
              >
                + Turno
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void quickTemplate('Cierre del local', 'closing')}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] font-bold text-zinc-800 hover:bg-white"
              >
                + Cierre
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void quickTemplate('Limpieza lavabos', 'hygiene_bathroom')}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] font-bold text-zinc-800 hover:bg-white"
              >
                + Lavabos
              </button>
            </div>
          </section>

          <div className="space-y-3">
            {lists.map((c) => {
              const open = openId === c.id;
              const sections = sectionsByList[c.id] ?? [];
              const items = itemsByList[c.id] ?? [];
              return (
                <div
                  key={c.id}
                  className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-white to-zinc-50/80 shadow-sm ring-1 ring-zinc-100"
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : c.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-zinc-900">{c.title}</p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#B91C1C]">
                        {CHECKLIST_CONTEXT_LABEL[c.context]} · {items.length} ítems
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-zinc-400">{open ? '▲' : '▼'}</span>
                  </button>
                  {open ? (
                    <div className="space-y-2.5 border-t border-zinc-100 px-4 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void addSection(c.id)}
                          className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-zinc-800"
                        >
                          + Sección
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void addItem(c.id, null)}
                          className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-zinc-800"
                        >
                          + Ítem (sin sección)
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void removeList(c.id)}
                          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-800"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar lista
                        </button>
                      </div>

                      {itemsWithoutSection(c.id).length > 0 ? (
                        <ul className="space-y-1.5">
                          {itemsWithoutSection(c.id).map((it) => (
                            <li
                              key={it.id}
                              className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-white px-2.5 py-1.5"
                            >
                              <span className="text-xs font-semibold text-zinc-800">{it.label}</span>
                              <button
                                type="button"
                                onClick={() => void removeItem(it.id)}
                                className="shrink-0 text-red-600"
                                aria-label="Quitar"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {sections.map((s) => (
                        <div key={s.id} className="rounded-xl border border-zinc-200/80 bg-white/90 p-2.5 ring-1 ring-zinc-50">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-black uppercase tracking-wide text-zinc-700">{s.title}</p>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => void addItem(c.id, s.id)}
                                className="rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-bold text-white"
                              >
                                + Ítem
                              </button>
                              <button type="button" onClick={() => void removeSection(s.id)} className="text-red-600">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <ul className="mt-1.5 space-y-1">
                            {items
                              .filter((i) => i.sectionId === s.id)
                              .map((it) => (
                                <li
                                  key={it.id}
                                  className="flex items-center justify-between gap-2 rounded-md bg-zinc-50 px-2 py-1"
                                >
                                  <span className="text-xs text-zinc-800">{it.label}</span>
                                  <button type="button" onClick={() => void removeItem(it.id)} className="text-red-600">
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
