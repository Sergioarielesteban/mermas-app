'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { appConfirm, appPrompt } from '@/lib/app-dialog-bridge';
import {
  CHEF_PRODUCTION_WEEKDAY_SHORT,
  type ChefProductionBlockItem,
  type ChefProductionDayBlock,
  type ChefProductionTemplate,
  deleteChefProductionBlockItem,
  deleteChefProductionDayBlock,
  deleteChefProductionTemplate,
  duplicateChefProductionTemplate,
  fetchChefProductionBlockItems,
  fetchChefProductionDayBlocks,
  fetchChefProductionTemplates,
  insertChefProductionBlockItem,
  insertChefProductionDayBlock,
  insertChefProductionTemplate,
  reorderChefProductionBlockItems,
  updateChefProductionBlockItem,
  updateChefProductionDayBlock,
  updateChefProductionTemplateName,
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
  const [itemsByBlock, setItemsByBlock] = useState<Record<string, ChefProductionBlockItem[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

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
      const items: Record<string, ChefProductionBlockItem[]> = {};
      for (const t of ts) {
        const bl = await fetchChefProductionDayBlocks(supabase, t.id);
        blocks[t.id] = bl;
        for (const b of bl) {
          items[b.id] = await fetchChefProductionBlockItems(supabase, b.id);
        }
      }
      setBlocksByTpl(blocks);
      setItemsByBlock(items);
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
    if (!(await appConfirm('¿Eliminar esta plantilla y todo su contenido?'))) return;
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

  const addBlock = async (templateId: string) => {
    if (!supabaseOk) return;
    const label = await appPrompt('Nombre del bloque (ej. Diario, Lun–Mié)');
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
    if (!(await appConfirm('¿Eliminar este bloque y todos sus productos?'))) return;
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

  const addProductToBlock = async (blockId: string) => {
    if (!supabaseOk) return;
    const label = await appPrompt('Nombre del producto o preparación');
    if (!label?.trim()) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      const cur = itemsByBlock[blockId] ?? [];
      await insertChefProductionBlockItem(supabase, blockId, {
        label: label.trim(),
        targetQty: 0,
        sortOrder: cur.length,
      });
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al añadir producto.');
    } finally {
      setBusy(false);
    }
  };

  const removeProduct = async (itemId: string) => {
    if (!supabaseOk) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await deleteChefProductionBlockItem(supabase, itemId);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al eliminar.');
    } finally {
      setBusy(false);
    }
  };

  const persistProduct = async (item: ChefProductionBlockItem, label: string, targetRaw: string) => {
    if (!supabaseOk || !label.trim()) return;
    const targetQty = parseTarget(targetRaw);
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await updateChefProductionBlockItem(supabase, item.id, {
        label: label.trim(),
        targetQty,
      });
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  const moveProduct = async (blockId: string, itemId: string, dir: -1 | 1) => {
    const supabase = getSupabaseClient();
    if (!supabaseOk || !supabase) return;
    const list = [...(itemsByBlock[blockId] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    const i = list.findIndex((x) => x.id === itemId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setBusy(true);
    try {
      await reorderChefProductionBlockItems(
        supabase,
        next.map((x) => x.id),
      );
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo reordenar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pb-10">
      <MermasStyleHero
        eyebrow="Producción"
        title="Plantillas"
        description="Cada bloque son solo días. Dentro de cada bloque añades productos y la cantidad objetivo para ese periodo."
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
        <p className="text-center text-sm font-medium text-zinc-700">Conecta Supabase y un local para editar plantillas.</p>
      ) : loading ? (
        <p className="text-center text-sm font-medium text-zinc-700">Cargando…</p>
      ) : (
        <>
          <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-700">Nueva plantilla</p>
            <p className="mt-1 text-[11px] font-medium text-zinc-700">
              Se crean dos bloques de ejemplo (Lun–Jue y Vie–Dom). Añade productos dentro de cada uno.
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre (ej. Producción cocina)"
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
              const blocks = [...(blocksByTpl[p.id] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
              const productCount = blocks.reduce((acc, b) => acc + (itemsByBlock[b.id]?.length ?? 0), 0);
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
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-800">
                        {blocks.length} bloques · {productCount} productos
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-zinc-600">{open ? '▲' : '▼'}</span>
                  </button>
                  {open ? (
                    <div className="space-y-4 border-t border-zinc-100 px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            void (async () => {
                              const n = await appPrompt('Nuevo nombre de la plantilla', p.name);
                              if (n?.trim()) void renameTemplate(p.id, n);
                            })();
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

                      <div className="space-y-3">
                        <p className="text-[11px] font-black uppercase text-zinc-700">Bloques y productos</p>
                        {blocks.length === 0 ? (
                          <p className="text-xs font-medium text-zinc-700">Añade un bloque para definir días y productos.</p>
                        ) : (
                          blocks.map((b, bi) => {
                            const products = [...(itemsByBlock[b.id] ?? [])].sort(
                              (a, c) => a.sortOrder - c.sortOrder || a.label.localeCompare(c.label),
                            );
                            return (
                              <div
                                key={b.id}
                                className="rounded-xl border border-zinc-200/80 bg-white/90 p-3 ring-1 ring-zinc-50"
                              >
                                <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 pb-2">
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
                                    className="min-w-[8rem] flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-black text-zinc-900 outline-none focus:border-[#D32F2F]/40"
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

                                <p className="mt-2 text-[10px] font-bold uppercase text-zinc-700">Días del bloque</p>
                                <div className="mt-1 flex flex-wrap gap-1">
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
                                            : 'border border-zinc-200 bg-zinc-50 text-zinc-700',
                                        ].join(' ')}
                                      >
                                        {label}
                                      </button>
                                    );
                                  })}
                                </div>

                                <p className="mt-3 text-[10px] font-bold uppercase text-zinc-700">
                                  Productos en este bloque
                                </p>
                                <div className="mt-2 space-y-2">
                                  {products.length === 0 ? (
                                    <p className="rounded-lg bg-zinc-50/80 px-3 py-2 text-[11px] font-medium text-zinc-800">
                                      Aún no hay productos. Usa el botón de abajo.
                                    </p>
                                  ) : (
                                    products.map((it, pi) => (
                                      <div
                                        key={it.id}
                                        className="flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/50 p-2.5 sm:flex-row sm:items-center"
                                      >
                                        <div className="flex gap-0.5 sm:pt-0.5">
                                          <button
                                            type="button"
                                            disabled={busy || pi === 0}
                                            onClick={() => void moveProduct(b.id, it.id, -1)}
                                            className="rounded border border-zinc-200 bg-white p-0.5 text-zinc-600 disabled:opacity-30"
                                          >
                                            <ChevronUp className="h-3.5 w-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={busy || pi >= products.length - 1}
                                            onClick={() => void moveProduct(b.id, it.id, 1)}
                                            className="rounded border border-zinc-200 bg-white p-0.5 text-zinc-600 disabled:opacity-30"
                                          >
                                            <ChevronDown className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                        <input
                                          id={`lbl-${it.id}`}
                                          defaultValue={it.label}
                                          disabled={busy}
                                          onBlur={() => {
                                            const lbl = (
                                              document.getElementById(`lbl-${it.id}`) as HTMLInputElement
                                            ).value;
                                            const tgt = (
                                              document.getElementById(`tgt-${it.id}`) as HTMLInputElement
                                            ).value;
                                            if (lbl.trim()) void persistProduct(it, lbl, tgt);
                                          }}
                                          className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm font-bold text-zinc-900 outline-none focus:border-[#D32F2F]/40"
                                          placeholder="Producto"
                                        />
                                        <div className="flex items-center gap-2">
                                          <label className="flex flex-col">
                                            <span className="text-[9px] font-bold uppercase text-zinc-700">
                                              Obj.
                                            </span>
                                            <input
                                              id={`tgt-${it.id}`}
                                              inputMode="decimal"
                                              defaultValue={String(it.targetQty)}
                                              disabled={busy}
                                              onBlur={() => {
                                                const lbl = (
                                                  document.getElementById(`lbl-${it.id}`) as HTMLInputElement
                                                ).value;
                                                const tgt = (
                                                  document.getElementById(`tgt-${it.id}`) as HTMLInputElement
                                                ).value;
                                                if (lbl.trim()) void persistProduct(it, lbl, tgt);
                                              }}
                                              className="h-9 w-[4.5rem] rounded-lg border border-zinc-200 bg-white px-2 text-sm font-black tabular-nums text-zinc-900 outline-none focus:border-[#D32F2F]/40"
                                            />
                                          </label>
                                          <button
                                            type="button"
                                            onClick={() => void removeProduct(it.id)}
                                            className="text-red-600"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>

                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void addProductToBlock(b.id)}
                                  className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 py-2 text-[11px] font-bold text-zinc-800"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  Añadir producto
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
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
