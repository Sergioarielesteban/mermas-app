'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  CHEF_PRODUCTION_WEEKDAY_SHORT,
  type ChefProductionDayBlock,
  type ChefProductionLineTarget,
  type ChefProductionTemplate,
  type ChefProductionTemplateLine,
  type ChefProductionTemplateSection,
  deleteChefProductionDayBlock,
  deleteChefProductionTemplate,
  deleteChefProductionTemplateLine,
  deleteChefProductionTemplateSection,
  duplicateChefProductionTemplate,
  fetchChefProductionDayBlocks,
  fetchChefProductionLineTargetsForLines,
  fetchChefProductionTemplateLines,
  fetchChefProductionTemplates,
  fetchChefProductionTemplateSections,
  insertChefProductionDayBlock,
  insertChefProductionTemplate,
  insertChefProductionTemplateLine,
  insertChefProductionTemplateSection,
  reorderChefProductionTemplateLines,
  reorderChefProductionTemplateSections,
  updateChefProductionDayBlock,
  updateChefProductionTemplateLine,
  updateChefProductionTemplateName,
  upsertChefProductionLineTarget,
  formatProductionMigrationError,
} from '@/lib/chef-ops-supabase';

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function parseTarget(s: string): number {
  const t = s.trim().replace(',', '.');
  if (t === '') return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

export default function ProduccionPlantillasPage() {
  const { localId, profileReady } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const [templates, setTemplates] = useState<ChefProductionTemplate[]>([]);
  const [blocksByTpl, setBlocksByTpl] = useState<Record<string, ChefProductionDayBlock[]>>({});
  const [sectionsByTpl, setSectionsByTpl] = useState<Record<string, ChefProductionTemplateSection[]>>({});
  const [linesBySection, setLinesBySection] = useState<Record<string, ChefProductionTemplateLine[]>>({});
  const [targetsByTpl, setTargetsByTpl] = useState<Record<string, ChefProductionLineTarget[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [targetDraft, setTargetDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setTemplates([]);
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const ts = await fetchChefProductionTemplates(supabase, localId);
      setTemplates(ts);
      const blocks: Record<string, ChefProductionDayBlock[]> = {};
      const secs: Record<string, ChefProductionTemplateSection[]> = {};
      const lines: Record<string, ChefProductionTemplateLine[]> = {};
      const targs: Record<string, ChefProductionLineTarget[]> = {};
      const draft: Record<string, string> = {};
      for (const t of ts) {
        const bl = await fetchChefProductionDayBlocks(supabase, t.id);
        blocks[t.id] = bl;
        const sc = await fetchChefProductionTemplateSections(supabase, t.id);
        secs[t.id] = sc;
        const lineIds: string[] = [];
        for (const s of sc) {
          const ls = await fetchChefProductionTemplateLines(supabase, s.id);
          lines[s.id] = ls;
          lineIds.push(...ls.map((l) => l.id));
        }
        const tt = await fetchChefProductionLineTargetsForLines(supabase, lineIds);
        targs[t.id] = tt;
        for (const x of tt) {
          draft[`${x.lineId}:${x.blockId}`] = String(x.targetQty);
        }
      }
      setBlocksByTpl(blocks);
      setSectionsByTpl(secs);
      setLinesBySection(lines);
      setTargetsByTpl(targs);
      setTargetDraft(draft);
    } catch (e) {
      setBanner(formatProductionMigrationError(e));
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const addTemplate = async () => {
    if (!localId || !supabaseOk || !newName.trim()) return;
    setBusy(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      const tpl = await insertChefProductionTemplate(supabase, localId, { name: newName.trim() });
      const curBlocks = blocksByTpl[tpl.id] ?? [];
      await insertChefProductionDayBlock(supabase, tpl.id, {
        label: 'Lunes a jueves',
        weekdays: [1, 2, 3, 4],
        sortOrder: curBlocks.length,
      });
      await insertChefProductionDayBlock(supabase, tpl.id, {
        label: 'Viernes a domingo',
        weekdays: [5, 6, 0],
        sortOrder: curBlocks.length + 1,
      });
      setNewName('');
      await load();
      setOpenId(tpl.id);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo crear.');
    } finally {
      setBusy(false);
    }
  };

  const removeTemplate = async (id: string) => {
    if (!localId || !supabaseOk) return;
    if (!window.confirm('¿Eliminar esta plantilla y todo su contenido?')) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await deleteChefProductionTemplate(supabase, localId, id);
      await load();
      if (openId === id) setOpenId(null);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo eliminar.');
    } finally {
      setBusy(false);
    }
  };

  const dupTemplate = async (id: string) => {
    if (!localId || !supabaseOk) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await duplicateChefProductionTemplate(supabase, localId, id);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo duplicar.');
    } finally {
      setBusy(false);
    }
  };

  const renameTemplate = async (id: string, name: string) => {
    if (!localId || !supabaseOk || !name.trim()) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await updateChefProductionTemplateName(supabase, localId, id, name);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo renombrar.');
    } finally {
      setBusy(false);
    }
  };

  const addSection = async (templateId: string) => {
    if (!supabaseOk) return;
    const title = window.prompt('Nombre de la sección (ej. Plancha y fritos)');
    if (!title?.trim()) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      const cur = sectionsByTpl[templateId] ?? [];
      await insertChefProductionTemplateSection(supabase, templateId, title.trim(), cur.length);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al añadir sección.');
    } finally {
      setBusy(false);
    }
  };

  const removeSection = async (id: string) => {
    if (!supabaseOk) return;
    if (!window.confirm('¿Eliminar esta sección y sus productos?')) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await deleteChefProductionTemplateSection(supabase, id);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al eliminar.');
    } finally {
      setBusy(false);
    }
  };

  const addBlock = async (templateId: string) => {
    if (!supabaseOk) return;
    const label = window.prompt('Nombre del bloque (ej. Diario, Lun–Mié)');
    if (!label?.trim()) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      const cur = blocksByTpl[templateId] ?? [];
      await insertChefProductionDayBlock(supabase, templateId, {
        label: label.trim(),
        weekdays: [...ALL_WEEKDAYS],
        sortOrder: cur.length,
      });
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al añadir bloque.');
    } finally {
      setBusy(false);
    }
  };

  const removeBlock = async (blockId: string) => {
    if (!supabaseOk) return;
    if (!window.confirm('¿Eliminar este bloque? Se borran los objetivos asociados.')) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await deleteChefProductionDayBlock(supabase, blockId);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al eliminar bloque.');
    } finally {
      setBusy(false);
    }
  };

  const toggleWeekday = async (block: ChefProductionDayBlock, dow: number) => {
    if (!supabaseOk) return;
    const set = new Set(block.weekdays);
    if (set.has(dow)) {
      if (set.size <= 1) return;
      set.delete(dow);
    } else {
      set.add(dow);
    }
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await updateChefProductionDayBlock(supabase, block.id, { weekdays: [...set] });
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo actualizar días.');
    } finally {
      setBusy(false);
    }
  };

  const applyPresetWeekdays = async (block: ChefProductionDayBlock, preset: 'lunjue' | 'viedom' | 'diario') => {
    if (!supabaseOk) return;
    const w =
      preset === 'lunjue'
        ? [1, 2, 3, 4]
        : preset === 'viedom'
          ? [5, 6, 0]
          : [...ALL_WEEKDAYS];
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await updateChefProductionDayBlock(supabase, block.id, { weekdays: w });
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo actualizar.');
    } finally {
      setBusy(false);
    }
  };

  const moveBlock = async (templateId: string, blockId: string, dir: -1 | 1) => {
    const supabase = getSupabaseClient();
    if (!supabaseOk || !supabase) return;
    const list = [...(blocksByTpl[templateId] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    const i = list.findIndex((b) => b.id === blockId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const reordered = [...list];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    setBusy(true);
    try {
      for (let k = 0; k < reordered.length; k++) {
        await updateChefProductionDayBlock(supabase, reordered[k].id, { sortOrder: k });
      }
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo reordenar.');
    } finally {
      setBusy(false);
    }
  };

  const moveSection = async (templateId: string, sectionId: string, dir: -1 | 1) => {
    const supabase = getSupabaseClient();
    if (!supabaseOk || !supabase) return;
    const list = [...(sectionsByTpl[templateId] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    const i = list.findIndex((s) => s.id === sectionId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const nextIds = [...list];
    [nextIds[i], nextIds[j]] = [nextIds[j], nextIds[i]];
    setBusy(true);
    try {
      await reorderChefProductionTemplateSections(
        supabase,
        nextIds.map((s) => s.id),
      );
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo reordenar.');
    } finally {
      setBusy(false);
    }
  };

  const moveLine = async (sectionId: string, lineId: string, dir: -1 | 1) => {
    const supabase = getSupabaseClient();
    if (!supabaseOk || !supabase) return;
    const list = [...(linesBySection[sectionId] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    const i = list.findIndex((l) => l.id === lineId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const nextIds = [...list];
    [nextIds[i], nextIds[j]] = [nextIds[j], nextIds[i]];
    setBusy(true);
    try {
      await reorderChefProductionTemplateLines(
        supabase,
        nextIds.map((l) => l.id),
      );
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo reordenar.');
    } finally {
      setBusy(false);
    }
  };

  const persistTarget = async (lineId: string, blockId: string, raw: string) => {
    if (!supabaseOk) return;
    const q = parseTarget(raw);
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await upsertChefProductionLineTarget(supabase, lineId, blockId, q);
      setTargetDraft((prev) => ({ ...prev, [`${lineId}:${blockId}`]: String(q) }));
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo guardar objetivo.');
    } finally {
      setBusy(false);
    }
  };

  const addLine = async (sectionId: string) => {
    if (!supabaseOk) return;
    const label = window.prompt('Nombre del producto o preparación');
    if (!label?.trim()) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      const cur = linesBySection[sectionId] ?? [];
      await insertChefProductionTemplateLine(supabase, sectionId, {
        label: label.trim(),
        sortOrder: cur.length,
      });
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al añadir producto.');
    } finally {
      setBusy(false);
    }
  };

  const removeLine = async (id: string) => {
    if (!supabaseOk) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await deleteChefProductionTemplateLine(supabase, id);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al eliminar.');
    } finally {
      setBusy(false);
    }
  };

  const persistLineLabel = async (line: ChefProductionTemplateLine, label: string) => {
    if (!supabaseOk || !label.trim()) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await updateChefProductionTemplateLine(supabase, line.id, { label: label.trim() });
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pb-10">
      <MermasStyleHero
        eyebrow="Producción"
        title="Plantillas"
        description="Bloques de días, secciones y productos. Cada producto tiene objetivo por bloque; en el día la app elige el bloque que toca."
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
        <p className="text-center text-sm text-zinc-500">Conecta Supabase y un local para editar plantillas.</p>
      ) : loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : (
        <>
          <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Nueva plantilla</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              Ej. Plancha y fritos, Quesos, Producción cocina. Se crean dos bloques de ejemplo (Lun–Jue y Vie–Dom) que
              puedes cambiar.
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre de la plantilla"
                className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#D32F2F]/50 focus:bg-white focus:ring-2 focus:ring-[#D32F2F]/15"
              />
              <button
                type="button"
                disabled={busy || !newName.trim()}
                onClick={() => void addTemplate()}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#D32F2F] px-4 text-sm font-black uppercase tracking-wide text-white shadow-sm disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Crear
              </button>
            </div>
          </section>

          <div className="space-y-3">
            {templates.map((p) => {
              const open = openId === p.id;
              const sections = sectionsByTpl[p.id] ?? [];
              const blocks = [...(blocksByTpl[p.id] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
              const lineCount = sections.reduce((acc, s) => acc + (linesBySection[s.id]?.length ?? 0), 0);
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
                        {blocks.length} bloques · {sections.length} secciones · {lineCount} productos
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-zinc-400">{open ? '▲' : '▼'}</span>
                  </button>
                  {open ? (
                    <div className="space-y-4 border-t border-zinc-100 px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const n = window.prompt('Nuevo nombre', p.name);
                            if (n?.trim()) void renameTemplate(p.id, n);
                          }}
                          className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-zinc-800"
                        >
                          Renombrar
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void dupTemplate(p.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-zinc-800"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Duplicar
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void addSection(p.id)}
                          className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-zinc-800"
                        >
                          + Sección
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void addBlock(p.id)}
                          className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-zinc-800"
                        >
                          + Bloque de días
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void removeTemplate(p.id)}
                          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-800"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar plantilla
                        </button>
                      </div>

                      <div className="space-y-2">
                        <p className="text-[11px] font-black uppercase text-zinc-500">Bloques de días</p>
                        {blocks.length === 0 ? (
                          <p className="text-xs text-zinc-500">Añade al menos un bloque para definir objetivos por día.</p>
                        ) : (
                          blocks.map((b, bi) => (
                            <div
                              key={b.id}
                              className="rounded-xl border border-zinc-200/80 bg-white/90 p-3 ring-1 ring-zinc-50"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  defaultValue={b.label}
                                  disabled={busy}
                                  onBlur={(e) => {
                                    const v = e.target.value.trim();
                                    if (v && v !== b.label) {
                                      void (async () => {
                                        const supabase = getSupabaseClient()!;
                                        await updateChefProductionDayBlock(supabase, b.id, { label: v });
                                        await load();
                                      })();
                                    }
                                  }}
                                  className="min-w-[8rem] flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-bold text-zinc-900 outline-none focus:border-[#D32F2F]/40"
                                />
                                <div className="flex gap-0.5">
                                  <button
                                    type="button"
                                    disabled={busy || bi === 0}
                                    onClick={() => void moveBlock(p.id, b.id, -1)}
                                    className="rounded-md border border-zinc-200 p-1 text-zinc-600 disabled:opacity-30"
                                    aria-label="Subir bloque"
                                  >
                                    <ChevronUp className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy || bi >= blocks.length - 1}
                                    onClick={() => void moveBlock(p.id, b.id, 1)}
                                    className="rounded-md border border-zinc-200 p-1 text-zinc-600 disabled:opacity-30"
                                    aria-label="Bajar bloque"
                                  >
                                    <ChevronDown className="h-4 w-4" />
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void removeBlock(b.id)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void applyPresetWeekdays(b, 'lunjue')}
                                  className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-700"
                                >
                                  Lun–Jue
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void applyPresetWeekdays(b, 'viedom')}
                                  className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-700"
                                >
                                  Vie–Dom
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void applyPresetWeekdays(b, 'diario')}
                                  className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-700"
                                >
                                  Diario
                                </button>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1">
                                {CHEF_PRODUCTION_WEEKDAY_SHORT.map(({ dow, label }) => {
                                  const on = b.weekdays.includes(dow);
                                  return (
                                    <button
                                      key={dow}
                                      type="button"
                                      disabled={busy}
                                      onClick={() => void toggleWeekday(b, dow)}
                                      className={[
                                        'h-9 min-w-[2rem] rounded-lg text-xs font-black',
                                        on
                                          ? 'bg-[#D32F2F] text-white shadow-sm'
                                          : 'border border-zinc-200 bg-zinc-50 text-zinc-500',
                                      ].join(' ')}
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {sections.map((s, si) => {
                        const lines = [...(linesBySection[s.id] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
                        return (
                          <div
                            key={s.id}
                            className="rounded-xl border border-zinc-200/80 bg-white/90 p-3 ring-1 ring-zinc-50"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-black uppercase tracking-wide text-zinc-700">{s.title}</p>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={busy || si === 0}
                                  onClick={() => void moveSection(p.id, s.id, -1)}
                                  className="rounded-md border border-zinc-200 p-1 text-zinc-600 disabled:opacity-30"
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={busy || si >= sections.length - 1}
                                  onClick={() => void moveSection(p.id, s.id, 1)}
                                  className="rounded-md border border-zinc-200 p-1 text-zinc-600 disabled:opacity-30"
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" onClick={() => void removeSection(s.id)} className="text-red-600">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="mt-3 space-y-2">
                              {lines.map((ln, li) => (
                                <div
                                  key={ln.id}
                                  className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-2.5 ring-1 ring-white"
                                >
                                  <div className="flex flex-wrap items-start gap-2">
                                    <div className="flex gap-0.5 pt-0.5">
                                      <button
                                        type="button"
                                        disabled={busy || li === 0}
                                        onClick={() => void moveLine(s.id, ln.id, -1)}
                                        className="rounded border border-zinc-200 bg-white p-0.5 text-zinc-600 disabled:opacity-30"
                                      >
                                        <ChevronUp className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={busy || li >= lines.length - 1}
                                        onClick={() => void moveLine(s.id, ln.id, 1)}
                                        className="rounded border border-zinc-200 bg-white p-0.5 text-zinc-600 disabled:opacity-30"
                                      >
                                        <ChevronDown className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                    <input
                                      defaultValue={ln.label}
                                      disabled={busy}
                                      onBlur={(e) => {
                                        const v = e.target.value;
                                        if (v.trim() && v.trim() !== ln.label) void persistLineLabel(ln, v);
                                      }}
                                      className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm font-bold text-zinc-900 outline-none focus:border-[#D32F2F]/40"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => void removeLine(ln.id)}
                                      className="text-red-600"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  {blocks.length > 0 ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {blocks.map((bl) => (
                                        <label
                                          key={bl.id}
                                          className="flex min-w-[5.5rem] flex-col rounded-lg border border-zinc-200 bg-white px-2 py-1"
                                        >
                                          <span className="text-[9px] font-bold uppercase text-zinc-400">{bl.label}</span>
                                          <input
                                            inputMode="decimal"
                                            disabled={busy}
                                            value={targetDraft[`${ln.id}:${bl.id}`] ?? ''}
                                            onChange={(e) =>
                                              setTargetDraft((prev) => ({
                                                ...prev,
                                                [`${ln.id}:${bl.id}`]: e.target.value,
                                              }))
                                            }
                                            onBlur={(e) =>
                                              void persistTarget(ln.id, bl.id, e.target.value)
                                            }
                                            className="mt-0.5 w-full border-0 bg-transparent p-0 text-sm font-black tabular-nums text-zinc-900 outline-none"
                                          />
                                        </label>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void addLine(s.id)}
                              className="mt-2 w-full rounded-lg border border-dashed border-zinc-300 py-2 text-[11px] font-bold text-zinc-600"
                            >
                              + Producto en {s.title}
                            </button>
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
