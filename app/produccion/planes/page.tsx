'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { appConfirm, appPrompt } from '@/lib/app-dialog-bridge';
import {
  CHEF_PRODUCTION_WEEKDAY_SHORT,
  buildChefProductionBoardRows,
  type ChefProductionBlockItem,
  type ChefProductionBoardRow,
  type ChefProductionDayBlock,
  type ChefProductionTemplate,
  type ChefProductionZone,
  deleteChefProductionBlockItem,
  deleteChefProductionDayBlock,
  deleteChefProductionZone,
  deleteChefProductionTemplate,
  duplicateChefProductionTemplate,
  fetchChefProductionBlockItems,
  fetchChefProductionDayBlocks,
  fetchChefProductionTemplates,
  fetchChefProductionZones,
  insertChefProductionBlockItem,
  insertChefProductionDayBlock,
  insertChefProductionTemplate,
  insertChefProductionZone,
  reorderChefProductionBlockItems,
  resolveLjAndVdBlocks,
  updateChefProductionBlockItem,
  updateChefProductionDayBlock,
  updateChefProductionTemplateName,
  formatProductionMigrationError,
} from '@/lib/chef-ops-supabase';

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const DEBOUNCE_SAVE_MS = 500;

function parseTarget(s: string): number {
  const t = s.trim().replace(',', '.');
  if (t === '') return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/** Valor mostrado en Obj. a partir del número guardado (sin forzar decimales). */
function formatQtyDraftFromSaved(n: number): string {
  if (!Number.isFinite(n) || Number.isNaN(n)) return '0';
  return String(n);
}

function patchItemInBlocks(
  prev: Record<string, ChefProductionBlockItem[]>,
  blockId: string,
  itemId: string,
  patch: Partial<ChefProductionBlockItem>,
): Record<string, ChefProductionBlockItem[]> {
  const list = prev[blockId];
  if (!list) return prev;
  return {
    ...prev,
    [blockId]: list.map((row) => (row.id === itemId ? ({ ...row, ...patch } as ChefProductionBlockItem) : row)),
  };
}

function removeItemFromBlock(
  prev: Record<string, ChefProductionBlockItem[]>,
  blockId: string,
  itemId: string,
): Record<string, ChefProductionBlockItem[]> {
  const list = prev[blockId];
  if (!list) return prev;
  return {
    ...prev,
    [blockId]: list.filter((x) => x.id !== itemId),
  };
}

export default function ProduccionPlantillasPage() {
  const { localId, profileReady } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const [templates, setTemplates] = useState<ChefProductionTemplate[]>([]);
  const [blocksByTpl, setBlocksByTpl] = useState<Record<string, ChefProductionDayBlock[]>>({});
  const [itemsByBlock, setItemsByBlock] = useState<Record<string, ChefProductionBlockItem[]>>({});
  const itemsByBlockRef = useRef(itemsByBlock);
  useEffect(() => {
    itemsByBlockRef.current = itemsByBlock;
  }, [itemsByBlock]);

  const [zonesByTpl, setZonesByTpl] = useState<Record<string, ChefProductionZone[]>>({});

  const [openId, setOpenId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  /** Solo operaciones estructurales (crear plantilla, eliminar, duplicar…), no edición de celdas. */
  const [busy, setBusy] = useState(false);

  const debounceTimersRef = useRef<Record<string, number>>({});

  const clearItemDebounce = useCallback((itemId: string) => {
    const t = debounceTimersRef.current[itemId];
    if (t != null) {
      window.clearTimeout(t);
      delete debounceTimersRef.current[itemId];
    }
  }, []);

  useEffect(
    () => () => {
      for (const k of Object.keys(debounceTimersRef.current)) {
        clearItemDebounce(k);
      }
    },
    [clearItemDebounce],
  );

  const fetchDataset = useCallback(async () => {
    if (!localId || !supabaseOk) {
      return { ts: [] as ChefProductionTemplate[], blocks: {}, items: {}, zones: {} } as {
        ts: ChefProductionTemplate[];
        blocks: Record<string, ChefProductionDayBlock[]>;
        items: Record<string, ChefProductionBlockItem[]>;
        zones: Record<string, ChefProductionZone[]>;
      };
    }
    const supabase = getSupabaseClient()!;
    const ts = await fetchChefProductionTemplates(supabase, localId);
    const blocks: Record<string, ChefProductionDayBlock[]> = {};
    const items: Record<string, ChefProductionBlockItem[]> = {};
    const zones: Record<string, ChefProductionZone[]> = {};
    for (const t of ts) {
      const bl = await fetchChefProductionDayBlocks(supabase, t.id);
      blocks[t.id] = bl;
      for (const b of bl) {
        items[b.id] = await fetchChefProductionBlockItems(supabase, b.id);
      }
      try {
        zones[t.id] = await fetchChefProductionZones(supabase, t.id);
      } catch {
        zones[t.id] = [];
      }
    }
    return { ts, blocks, items, zones };
  }, [localId, supabaseOk]);

  const applyDataset = useCallback(
    (
      ds: {
        ts: ChefProductionTemplate[];
        blocks: Record<string, ChefProductionDayBlock[]>;
        items: Record<string, ChefProductionBlockItem[]>;
        zones: Record<string, ChefProductionZone[]>;
      },
      opts?: { clearBanner?: boolean },
    ) => {
      setTemplates(ds.ts);
      setBlocksByTpl(ds.blocks);
      setItemsByBlock(ds.items);
      setZonesByTpl(ds.zones);
      if (opts?.clearBanner) setBanner(null);
    },
    [],
  );

  /** Recarga desde servidor sin pantalla «Cargando…» ni perder scroll/acordeón. */
  const reloadSilent = useCallback(async () => {
    if (!localId || !supabaseOk) return;
    try {
      const ds = await fetchDataset();
      applyDataset(ds, { clearBanner: true });
    } catch (e) {
      setBanner(formatProductionMigrationError(e));
    }
  }, [localId, supabaseOk, fetchDataset, applyDataset]);

  const load = useCallback(
    async (opts?: { showSpinner?: boolean }) => {
      if (!localId || !supabaseOk) {
        setTemplates([]);
        setBlocksByTpl({});
        setItemsByBlock({});
        setZonesByTpl({});
        setLoading(false);
        return;
      }
      const showSpinner = opts?.showSpinner ?? false;
      if (showSpinner) setLoading(true);
      try {
        setBanner(null);
        const ds = await fetchDataset();
        applyDataset(ds, { clearBanner: true });
      } catch (e) {
        setBanner(formatProductionMigrationError(e));
        setTemplates([]);
        setBlocksByTpl({});
        setItemsByBlock({});
        setZonesByTpl({});
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [localId, supabaseOk, fetchDataset, applyDataset],
  );

  useEffect(() => {
    if (!profileReady) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap de datos cuando el perfil está listo
    void load({ showSpinner: true });
  }, [profileReady, load]);

  const flushItemToSupabase = useCallback(
    async (blockId: string, item: ChefProductionBlockItem) => {
      if (!supabaseOk) return;
      const supabase = getSupabaseClient()!;
      try {
        await updateChefProductionBlockItem(supabase, item.id, {
          label: item.label.trim(),
          targetQty: item.targetQty,
          kitchenSection: item.kitchenSection ?? '',
          shelfLifeDays: item.shelfLifeDays,
          productionZoneId: item.productionZoneId,
        });
      } catch (e) {
        setBanner(e instanceof Error ? e.message : 'No se pudo guardar.');
        await reloadSilent();
      }
    },
    [supabaseOk, reloadSilent],
  );

  const persistItemRowAfterQtyPatch = useCallback(
    async (blockId: string, itemId: string, qty: number) => {
      let merged: ChefProductionBlockItem | undefined;
      setItemsByBlock((prev) => {
        const list = prev[blockId];
        if (!list) return prev;
        const idx = list.findIndex((x) => x.id === itemId);
        if (idx < 0) return prev;
        const row = list[idx]!;
        merged = { ...row, targetQty: qty };
        const nextList = [...list];
        nextList[idx] = merged;
        return { ...prev, [blockId]: nextList };
      });
      if (!merged?.label.trim()) return;
      await flushItemToSupabase(blockId, merged);
    },
    [flushItemToSupabase],
  );

  const scheduleItemPersist = useCallback(
    (blockId: string, itemId: string) => {
      clearItemDebounce(itemId);
      debounceTimersRef.current[itemId] = window.setTimeout(() => {
        delete debounceTimersRef.current[itemId];
        const list = itemsByBlockRef.current[blockId] ?? [];
        const item = list.find((x) => x.id === itemId);
        if (!item || !item.label.trim()) return;
        void flushItemToSupabase(blockId, item);
      }, DEBOUNCE_SAVE_MS);
    },
    [clearItemDebounce, flushItemToSupabase],
  );

  const updateItemField = useCallback(
    (blockId: string, itemId: string, patch: Partial<ChefProductionBlockItem>, persist: boolean) => {
      setItemsByBlock((prev) => patchItemInBlocks(prev, blockId, itemId, patch));
      if (persist) scheduleItemPersist(blockId, itemId);
    },
    [scheduleItemPersist],
  );

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
      await reloadSilent();
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
      await reloadSilent();
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
      const copy = await duplicateChefProductionTemplate(supabase, localId, id);
      await reloadSilent();
      setOpenId(copy.id);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo duplicar.');
    } finally {
      setBusy(false);
    }
  };

  const addProductionZoneToTemplate = async (templateId: string) => {
    if (!supabaseOk) return;
    const label = await appPrompt('Nombre de la zona', 'Cuarto frío');
    if (!label?.trim()) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      const cur = zonesByTpl[templateId] ?? [];
      const z = await insertChefProductionZone(supabase, templateId, {
        label: label.trim(),
        sortOrder: cur.length,
      });
      setZonesByTpl((prev) => ({ ...prev, [templateId]: [...(prev[templateId] ?? []), z] }));
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo crear la zona.');
      await reloadSilent();
    } finally {
      setBusy(false);
    }
  };

  const removeProductionZone = async (templateId: string, zoneId: string) => {
    if (!supabaseOk) return;
    if (!(await appConfirm('¿Eliminar esta zona? Los productos pasarán a «sin zona».'))) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await deleteChefProductionZone(supabase, zoneId);
      setZonesByTpl((prev) => ({
        ...prev,
        [templateId]: (prev[templateId] ?? []).filter((z) => z.id !== zoneId),
      }));
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo eliminar la zona.');
      await reloadSilent();
    } finally {
      setBusy(false);
    }
  };

  const renameTemplate = async (id: string, name: string) => {
    if (!localId || !supabaseOk || !name.trim()) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await updateChefProductionTemplateName(supabase, localId, id, name.trim());
      setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, name: name.trim() } : t)));
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo renombrar.');
      await reloadSilent();
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
      await reloadSilent();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al añadir bloque.');
    } finally {
      setBusy(false);
    }
  };

  const removeBlock = async (templateId: string, blockId: string) => {
    if (!supabaseOk) return;
    if (!(await appConfirm('¿Eliminar este bloque y todos sus productos?'))) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await deleteChefProductionDayBlock(supabase, blockId);
      setBlocksByTpl((prev) => ({
        ...prev,
        [templateId]: (prev[templateId] ?? []).filter((b) => b.id !== blockId),
      }));
      setItemsByBlock((prev) => {
        const next = { ...prev };
        delete next[blockId];
        return next;
      });
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al eliminar bloque.');
      await reloadSilent();
    } finally {
      setBusy(false);
    }
  };

  const toggleWeekday = async (templateId: string, block: ChefProductionDayBlock, dow: number) => {
    if (!supabaseOk) return;
    const set = new Set(block.weekdays);
    if (set.has(dow)) {
      if (set.size <= 1) return;
      set.delete(dow);
    } else {
      set.add(dow);
    }
    const nextWd = [...set];
    setBlocksByTpl((prev) => ({
      ...prev,
      [templateId]: (prev[templateId] ?? []).map((b) => (b.id === block.id ? { ...b, weekdays: nextWd } : b)),
    }));
    try {
      const supabase = getSupabaseClient()!;
      await updateChefProductionDayBlock(supabase, block.id, { weekdays: nextWd });
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo actualizar días.');
      await reloadSilent();
    }
  };

  const applyPresetWeekdays = async (
    templateId: string,
    block: ChefProductionDayBlock,
    preset: 'lunjue' | 'viedom' | 'diario',
  ) => {
    if (!supabaseOk) return;
    const w =
      preset === 'lunjue'
        ? [1, 2, 3, 4]
        : preset === 'viedom'
          ? [5, 6, 0]
          : [...ALL_WEEKDAYS];
    setBlocksByTpl((prev) => ({
      ...prev,
      [templateId]: (prev[templateId] ?? []).map((b) => (b.id === block.id ? { ...b, weekdays: w } : b)),
    }));
    try {
      const supabase = getSupabaseClient()!;
      await updateChefProductionDayBlock(supabase, block.id, { weekdays: w });
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo actualizar.');
      await reloadSilent();
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
    const withOrder = reordered.map((b, idx) => ({ ...b, sortOrder: idx }));
    setBlocksByTpl((prev) => ({ ...prev, [templateId]: withOrder }));
    try {
      for (let k = 0; k < withOrder.length; k++) {
        await updateChefProductionDayBlock(supabase, withOrder[k]!.id, { sortOrder: k });
      }
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo reordenar.');
      await reloadSilent();
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
      const inserted = await insertChefProductionBlockItem(supabase, blockId, {
        label: label.trim(),
        targetQty: 0,
        sortOrder: cur.length,
      });
      setItemsByBlock((prev) => ({
        ...prev,
        [blockId]: [...(prev[blockId] ?? []), inserted].sort(
          (a, c) => a.sortOrder - c.sortOrder || a.label.localeCompare(c.label),
        ),
      }));
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al añadir producto.');
      await reloadSilent();
    } finally {
      setBusy(false);
    }
  };

  const removeProduct = async (blockId: string, itemId: string) => {
    if (!supabaseOk) return;
    clearItemDebounce(itemId);
    const prevItems = itemsByBlock[blockId] ?? [];
    setItemsByBlock((p) => removeItemFromBlock(p, blockId, itemId));
    try {
      const supabase = getSupabaseClient()!;
      await deleteChefProductionBlockItem(supabase, itemId);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al eliminar.');
      setItemsByBlock((p) => ({ ...p, [blockId]: prevItems }));
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
    [next[i], next[j]] = [next[j]!, next[i]!];
    const reordered = next.map((x, idx) => ({ ...x, sortOrder: idx }));
    setItemsByBlock((prev) => ({ ...prev, [blockId]: reordered }));
    try {
      await reorderChefProductionBlockItems(
        supabase,
        reordered.map((x) => x.id),
      );
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo reordenar.');
      await reloadSilent();
    }
  };

  const updateBlockLabel = async (templateId: string, block: ChefProductionDayBlock, raw: string) => {
    if (!supabaseOk) return;
    const v = raw.trim();
    if (!v || v === block.label) return;
    setBlocksByTpl((prev) => ({
      ...prev,
      [templateId]: (prev[templateId] ?? []).map((b) => (b.id === block.id ? { ...b, label: v } : b)),
    }));
    try {
      const supabase = getSupabaseClient()!;
      await updateChefProductionDayBlock(supabase, block.id, { label: v });
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo guardar el bloque.');
      await reloadSilent();
    }
  };

  return (
    <div className="space-y-3 pb-8 sm:space-y-4 sm:pb-10">
      <MermasStyleHero
        eyebrow="Producción"
        title="Plantillas"
        description="Bloques Lun–Jue y Vie–Dom, objetivos por periodo y vida útil (etiquetas). Zona opcional para agrupar en la pizarra. Producción operativa está en Producción del día."
        slim
      />

      {banner ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{banner}</div>
      ) : null}

      {!localId || !supabaseOk ? (
        <p className="text-center text-sm font-medium text-zinc-700">Conecta Supabase y un local para editar plantillas.</p>
      ) : loading ? (
        <p className="text-center text-sm font-medium text-zinc-700">Cargando…</p>
      ) : (
        <>
          <section className="rounded-xl border border-zinc-200/90 bg-white p-3 shadow-sm ring-1 ring-zinc-100 sm:p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-zinc-700 sm:text-xs">
              Nueva plantilla
            </p>
            <p className="mt-0.5 text-[10px] font-medium leading-snug text-zinc-700 sm:text-[11px]">
              Dos bloques de ejemplo. Añade productos en cada bloque.
            </p>
            <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre (ej. Producción cocina)"
                className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50/50 px-2.5 text-sm font-semibold text-zinc-900 outline-none focus:border-[#D32F2F]/50 focus:bg-white focus:ring-2 focus:ring-[#D32F2F]/15 sm:h-11 sm:rounded-xl sm:px-3"
              />
              <button
                type="button"
                disabled={busy || !newName.trim()}
                onClick={() => void addTemplate()}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-lg bg-[#D32F2F] px-3 text-xs font-black uppercase tracking-wide text-white shadow-sm disabled:opacity-50 sm:h-11 sm:rounded-xl sm:px-4 sm:text-sm"
              >
                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Crear
              </button>
            </div>
          </section>

          <div className="space-y-2 sm:space-y-3">
            {templates.map((p) => {
              const open = openId === p.id;
              const blocks = [...(blocksByTpl[p.id] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
              const productCount = blocks.reduce((acc, b) => acc + (itemsByBlock[b.id]?.length ?? 0), 0);
              return (
                <div
                  key={p.id}
                  className="overflow-hidden rounded-xl border border-zinc-200/90 bg-gradient-to-b from-white to-zinc-50/80 shadow-sm ring-1 ring-zinc-100 sm:rounded-2xl"
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : p.id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left sm:px-4 sm:py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-zinc-900">{p.name}</p>
                      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-800 sm:text-[10px]">
                        {blocks.length} bloq. · {productCount} prod.
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-bold text-zinc-600 sm:text-xs">
                      {open ? '▲' : '▼'}
                    </span>
                  </button>
                  {open ? (
                    <div className="space-y-3 border-t border-zinc-100 px-3 py-2 sm:space-y-4 sm:px-4 sm:py-3">
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

                      <div className="space-y-2 rounded-lg border border-zinc-200/80 bg-zinc-50/40 px-3 py-2 sm:px-3 sm:py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[10px] font-black uppercase tracking-wide text-zinc-700">Zonas de producción</p>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void addProductionZoneToTemplate(p.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-[10px] font-bold text-zinc-800"
                          >
                            <Plus className="h-3 w-3" /> Zona de producción
                          </button>
                        </div>
                        {(zonesByTpl[p.id] ?? []).length === 0 ? (
                          <p className="text-[10px] font-medium text-zinc-600">
                            Opcional. Ej.: Cuarto frío · Plancha y fritos · Quesos. Cada producto puede elegir zona o quedar sin
                            zona.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {[...(zonesByTpl[p.id] ?? [])]
                              .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
                              .map((z) => (
                                <span
                                  key={z.id}
                                  className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-1 text-[10px] font-bold text-zinc-900"
                                >
                                  {z.label}
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void removeProductionZone(p.id, z.id)}
                                    className="rounded p-0.5 text-red-600 hover:bg-red-50"
                                    aria-label={`Eliminar zona ${z.label}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                          </div>
                        )}
                      </div>

                      {(() => {
                        const { ljBlock, vdBlock } = resolveLjAndVdBlocks(blocks);
                        const useMerged = Boolean(ljBlock && vdBlock);
                        const tplZones = zonesByTpl[p.id] ?? [];
                        return (
                          <>
                            {useMerged && ljBlock && vdBlock ? (
                              <MergedTemplateProductTable
                                ljBlock={ljBlock}
                                vdBlock={vdBlock}
                                zones={tplZones}
                                busy={busy}
                                supabaseOk={Boolean(supabaseOk)}
                                clearItemDebounce={clearItemDebounce}
                                updateItemField={updateItemField}
                                persistItemRowAfterQtyPatch={persistItemRowAfterQtyPatch}
                                reloadSilent={reloadSilent}
                                setBanner={setBanner}
                                ljItems={itemsByBlock[ljBlock.id] ?? []}
                                vdItems={itemsByBlock[vdBlock.id] ?? []}
                              />
                            ) : null}

                            <div className="space-y-3">
                              <p className="text-[11px] font-black uppercase text-zinc-700">Bloques y productos</p>
                              {blocks.length === 0 ? (
                                <p className="text-xs font-medium text-zinc-700">
                                  Añade un bloque para definir días y productos.
                                </p>
                              ) : (
                                blocks.map((b, bi) => (
                                  <BlockCard
                                    key={b.id}
                                    block={b}
                                    blockIndex={bi}
                                    blocksLength={blocks.length}
                                    products={[...(itemsByBlock[b.id] ?? [])].sort(
                                      (a, c) =>
                                        a.sortOrder - c.sortOrder || a.label.localeCompare(c.label),
                                    )}
                                    zones={tplZones}
                                    hideProducts={
                                      Boolean(
                                        useMerged &&
                                          ljBlock &&
                                          vdBlock &&
                                          (b.id === ljBlock.id || b.id === vdBlock.id),
                                      )
                                    }
                                    busy={busy}
                                    onBlockLabelBlur={(v) => void updateBlockLabel(p.id, b, v)}
                                    onMoveBlock={(dir) => void moveBlock(p.id, b.id, dir)}
                                    onRemoveBlock={() => void removeBlock(p.id, b.id)}
                                    onToggleWeekday={(dow) => void toggleWeekday(p.id, b, dow)}
                                    onPresetWeekdays={(preset) => void applyPresetWeekdays(p.id, b, preset)}
                                    onAddProduct={() => void addProductToBlock(b.id)}
                                    onMoveProduct={(itemId, dir) => void moveProduct(b.id, itemId, dir)}
                                    onRemoveProduct={(itemId) => void removeProduct(b.id, itemId)}
                                    onUpdateItem={(itemId, patch, persist) =>
                                      updateItemField(b.id, itemId, patch, persist)
                                    }
                                    onPersistTargetQty={(bid, itemId, qty) =>
                                      void persistItemRowAfterQtyPatch(bid, itemId, qty)
                                    }
                                  />
                                ))
                              )}
                            </div>
                          </>
                        );
                      })()}
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

/** Tabla fusionada Lun–Jue / Vie–Dom: un producto, dos objetivos, misma vida útil y zona. */
function MergedTemplateProductTable({
  ljBlock,
  vdBlock,
  zones,
  busy,
  supabaseOk,
  clearItemDebounce,
  updateItemField,
  persistItemRowAfterQtyPatch,
  reloadSilent,
  setBanner,
  ljItems,
  vdItems,
}: {
  ljBlock: ChefProductionDayBlock;
  vdBlock: ChefProductionDayBlock;
  zones: ChefProductionZone[];
  busy: boolean;
  supabaseOk: boolean;
  clearItemDebounce: (itemId: string) => void;
  updateItemField: (
    blockId: string,
    itemId: string,
    patch: Partial<ChefProductionBlockItem>,
    persist: boolean,
  ) => void;
  persistItemRowAfterQtyPatch: (blockId: string, itemId: string, qty: number) => Promise<void>;
  reloadSilent: () => Promise<void>;
  setBanner: React.Dispatch<React.SetStateAction<string | null>>;
  ljItems: ChefProductionBlockItem[];
  vdItems: ChefProductionBlockItem[];
}) {
  const mergedRows = useMemo(() => {
    const zm = new Map(zones.map((z) => [z.id, z.label]));
    const ljS = [...ljItems].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
    const vdS = [...vdItems].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
    return buildChefProductionBoardRows(ljS, vdS, {
      zoneLabel: (zid) => (zid ? zm.get(zid) ?? '' : ''),
    });
  }, [ljItems, vdItems, zones]);

  const syncPair = (
    row: ChefProductionBoardRow,
    patch: Partial<ChefProductionBlockItem>,
    persist: boolean,
  ) => {
    if (row.ljItem) updateItemField(ljBlock.id, row.ljItem.id, patch, persist);
    if (row.vdItem) updateItemField(vdBlock.id, row.vdItem.id, patch, persist);
  };

  const addMergedRows = async () => {
    if (!supabaseOk) return;
    const label = await appPrompt('Nombre del producto o preparación');
    if (!label?.trim()) return;
    const supabase = getSupabaseClient()!;
    try {
      const ord = Math.max(ljItems.length, vdItems.length);
      await insertChefProductionBlockItem(supabase, ljBlock.id, {
        label: label.trim(),
        targetQty: 0,
        sortOrder: ord,
      });
      await insertChefProductionBlockItem(supabase, vdBlock.id, {
        label: label.trim(),
        targetQty: 0,
        sortOrder: ord,
      });
      await reloadSilent();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al añadir producto.');
      await reloadSilent();
    }
  };

  const removeMergedRow = async (row: ChefProductionBoardRow) => {
    if (!supabaseOk) return;
    const supabase = getSupabaseClient()!;
    try {
      if (row.ljItem) {
        clearItemDebounce(row.ljItem.id);
        await deleteChefProductionBlockItem(supabase, row.ljItem.id);
      }
      if (row.vdItem) {
        clearItemDebounce(row.vdItem.id);
        await deleteChefProductionBlockItem(supabase, row.vdItem.id);
      }
      await reloadSilent();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al eliminar.');
      await reloadSilent();
    }
  };

  const reorderMergedRows = async (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (!supabaseOk || idx < 0 || j < 0 || j >= mergedRows.length) return;
    const copy = [...mergedRows];
    [copy[idx], copy[j]] = [copy[j]!, copy[idx]!];
    const supabase = getSupabaseClient()!;
    setBanner(null);
    try {
      for (let o = 0; o < copy.length; o++) {
        const r = copy[o];
        if (r?.ljItem)
          await updateChefProductionBlockItem(supabase, r.ljItem.id, { sortOrder: o });
        if (r?.vdItem)
          await updateChefProductionBlockItem(supabase, r.vdItem.id, { sortOrder: o });
      }
      await reloadSilent();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo reordenar.');
      await reloadSilent();
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-zinc-200/90 bg-white/90 p-3 ring-1 ring-zinc-100 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-2">
        <p className="text-[11px] font-black uppercase text-zinc-700">
          Productos (L–J · V–D)
        </p>
        <p className="text-[9px] font-semibold uppercase text-zinc-500">
          Objetivos y orden se guardan solo (debounce ~{DEBOUNCE_SAVE_MS}&nbsp;ms)
        </p>
      </div>
      <p className="text-[10px] font-medium leading-snug text-zinc-600">
        Misma línea enlaza Lun–jueves y Vie–domingo por nombre normalizado en pizarra. Usa etiquetas coherentes si quieres
        que cuenten como un solo producto.
      </p>
      {mergedRows.length === 0 ? (
        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-[11px] font-medium text-zinc-700">
          Aún no hay productos en estos bloques.
        </p>
      ) : (
        mergedRows.map((row, mi) => {
          const sid = row.ljItem?.shelfLifeDays ?? row.vdItem?.shelfLifeDays ?? null;
          const zid =
            row.ljItem?.productionZoneId ??
            row.vdItem?.productionZoneId ??
            null;
          return (
            <div
              key={row.labelKey}
              className="flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/50 p-2.5 sm:grid sm:grid-cols-[auto_1fr_5rem_minmax(0,7rem)_4.25rem_4.25rem_auto] sm:items-end sm:gap-2 sm:p-3"
            >
              <div className="flex gap-0.5 sm:flex-col">
                <button
                  type="button"
                  disabled={busy || mi === 0}
                  onClick={() => void reorderMergedRows(mi, -1)}
                  className="rounded border border-zinc-200 bg-white p-0.5 text-zinc-600 disabled:opacity-30"
                  aria-label="Subir"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={busy || mi >= mergedRows.length - 1}
                  onClick={() => void reorderMergedRows(mi, 1)}
                  className="rounded border border-zinc-200 bg-white p-0.5 text-zinc-600 disabled:opacity-30"
                  aria-label="Bajar"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <label className="flex min-w-0 flex-col sm:contents">
                <span className="text-[9px] font-bold uppercase text-zinc-700 sm:hidden">Producto</span>
                <input
                  value={row.displayLabel}
                  disabled={busy}
                  onChange={(e) => syncPair(row, { label: e.target.value }, true)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm font-bold text-zinc-900 outline-none focus:border-[#D32F2F]/40"
                  placeholder="Producto"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold uppercase text-zinc-700">Vida útil</span>
                <input
                  inputMode="numeric"
                  value={sid != null ? String(sid) : ''}
                  disabled={busy}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    let shelfLifeDays: number | null = null;
                    if (raw !== '') {
                      const n = Math.floor(Number(raw.replace(',', '.')));
                      shelfLifeDays = Number.isFinite(n) && n >= 0 ? n : null;
                    }
                    syncPair(row, { shelfLifeDays }, true);
                  }}
                  placeholder="Días"
                  className="h-9 min-w-[3.75rem] rounded-lg border border-zinc-200 bg-white px-2 text-xs font-black tabular-nums outline-none focus:border-[#D32F2F]/40 sm:w-full"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-0.5 sm:col-span-1">
                <span className="text-[9px] font-bold uppercase text-zinc-700">Zona</span>
                <select
                  value={zid ?? ''}
                  disabled={busy}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    syncPair(row, { productionZoneId: v === '' ? null : v }, true);
                  }}
                  className="h-9 min-w-0 max-w-[10rem] rounded-lg border border-zinc-200 bg-white px-1.5 text-[11px] font-semibold outline-none focus:border-[#D32F2F]/40 sm:max-w-none"
                >
                  <option value="">Sin zona</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold uppercase text-zinc-700">Obj L–J</span>
                {row.ljItem ? (
                  <TargetQtyInput
                    blockId={ljBlock.id}
                    itemId={row.ljItem.id}
                    savedQty={row.ljItem.targetQty}
                    disabled={busy}
                    onPersistQty={persistItemRowAfterQtyPatch}
                  />
                ) : (
                  <span className="text-[10px] text-zinc-400">—</span>
                )}
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold uppercase text-zinc-700">Obj V–D</span>
                {row.vdItem ? (
                  <TargetQtyInput
                    blockId={vdBlock.id}
                    itemId={row.vdItem.id}
                    savedQty={row.vdItem.targetQty}
                    disabled={busy}
                    onPersistQty={persistItemRowAfterQtyPatch}
                  />
                ) : (
                  <span className="text-[10px] text-zinc-400">—</span>
                )}
              </label>
              <div className="flex justify-end sm:items-end sm:justify-center">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeMergedRow(row)}
                  className="p-2 text-red-600"
                  aria-label="Eliminar línea fusionada"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void addMergedRows()}
        className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 py-2 text-[11px] font-bold text-zinc-800"
      >
        <Plus className="h-3.5 w-3.5" />
        Añadir producto en L–J y V–D
      </button>
    </div>
  );
}

/** Inputs controlados por props; no depende de getElementById ni de recargas. */
function BlockCard({
  block,
  blockIndex,
  blocksLength,
  products,
  zones = [],
  hideProducts = false,
  busy,
  onBlockLabelBlur,
  onMoveBlock,
  onRemoveBlock,
  onToggleWeekday,
  onPresetWeekdays,
  onAddProduct,
  onMoveProduct,
  onRemoveProduct,
  onUpdateItem,
  onPersistTargetQty,
}: {
  block: ChefProductionDayBlock;
  blockIndex: number;
  blocksLength: number;
  products: ChefProductionBlockItem[];
  zones?: ChefProductionZone[];
  hideProducts?: boolean;
  busy: boolean;
  onBlockLabelBlur: (value: string) => void;
  onMoveBlock: (dir: -1 | 1) => void;
  onRemoveBlock: () => void;
  onToggleWeekday: (dow: number) => void;
  onPresetWeekdays: (preset: 'lunjue' | 'viedom' | 'diario') => void;
  onAddProduct: () => void;
  onMoveProduct: (itemId: string, dir: -1 | 1) => void;
  onRemoveProduct: (itemId: string) => void;
  onUpdateItem: (itemId: string, patch: Partial<ChefProductionBlockItem>, persist: boolean) => void;
  onPersistTargetQty: (blockId: string, itemId: string, qty: number) => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-200/80 bg-white/90 p-2 ring-1 ring-zinc-50 sm:rounded-xl sm:p-3">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-100 pb-1.5 sm:gap-2 sm:pb-2">
        <BlockLabelInput
          key={block.id}
          blockId={block.id}
          initialLabel={block.label}
          disabled={busy}
          onCommit={onBlockLabelBlur}
        />
        <div className="flex gap-0.5">
          <button
            type="button"
            disabled={busy || blockIndex === 0}
            onClick={() => onMoveBlock(-1)}
            className="rounded-md border border-zinc-200 p-1 text-zinc-600 disabled:opacity-30"
            aria-label="Subir bloque"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={busy || blockIndex >= blocksLength - 1}
            onClick={() => onMoveBlock(1)}
            className="rounded-md border border-zinc-200 p-1 text-zinc-600 disabled:opacity-30"
            aria-label="Bajar bloque"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
        <button type="button" disabled={busy} onClick={() => void onRemoveBlock()} className="text-red-600">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-2 text-[10px] font-bold uppercase text-zinc-700">Días del bloque</p>
      <div className="mt-1 flex flex-wrap gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => onPresetWeekdays('lunjue')}
          className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-700"
        >
          Lun–Jue
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onPresetWeekdays('viedom')}
          className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-700"
        >
          Vie–Dom
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onPresetWeekdays('diario')}
          className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-700"
        >
          Diario
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {CHEF_PRODUCTION_WEEKDAY_SHORT.map(({ dow, label }) => {
          const on = block.weekdays.includes(dow);
          return (
            <button
              key={dow}
              type="button"
              disabled={busy}
              onClick={() => onToggleWeekday(dow)}
              className={[
                'h-9 min-w-[2rem] rounded-lg text-xs font-black',
                on ? 'bg-[#D32F2F] text-white shadow-sm' : 'border border-zinc-200 bg-zinc-50 text-zinc-700',
              ].join(' ')}
            >
              {label}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] font-bold uppercase text-zinc-700">Productos en este bloque</p>
      {hideProducts ? (
        <p className="mt-2 rounded-lg bg-zinc-50/80 px-3 py-2 text-[11px] font-medium text-zinc-700">
          Lun–jueves y Vie–domingo se editan en la tabla fusionada superior.
        </p>
      ) : (
      <div className="mt-2 space-y-2">
        {products.length === 0 ? (
          <p className="rounded-lg bg-zinc-50/80 px-3 py-2 text-[11px] font-medium text-zinc-800">
            Aún no hay productos. Usa el botón de abajo.
          </p>
        ) : (
          products.map((it, pi) => (
            <div
              key={it.id}
              className="flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/50 p-2.5 sm:flex-row sm:flex-wrap sm:items-end"
            >
              <div className="flex gap-0.5 sm:pt-0.5">
                <button
                  type="button"
                  disabled={busy || pi === 0}
                  onClick={() => onMoveProduct(it.id, -1)}
                  className="rounded border border-zinc-200 bg-white p-0.5 text-zinc-600 disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={busy || pi >= products.length - 1}
                  onClick={() => onMoveProduct(it.id, 1)}
                  className="rounded border border-zinc-200 bg-white p-0.5 text-zinc-600 disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                value={it.label}
                disabled={busy}
                onChange={(e) => onUpdateItem(it.id, { label: e.target.value }, true)}
                className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm font-bold text-zinc-900 outline-none focus:border-[#D32F2F]/40 sm:min-w-[8rem]"
                placeholder="Producto"
              />
              <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,12rem)_4.5rem] sm:gap-3">
                <label className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[9px] font-bold uppercase text-zinc-700">Zona</span>
                  <select
                    value={it.productionZoneId ?? ''}
                    disabled={busy}
                    onChange={(e) =>
                      onUpdateItem(
                        it.id,
                        {
                          productionZoneId: e.target.value.trim() === '' ? null : e.target.value,
                        },
                        true,
                      )
                    }
                    className="h-9 max-w-[14rem] rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-semibold text-zinc-900 outline-none focus:border-[#D32F2F]/40"
                  >
                    <option value="">Sin zona</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold uppercase text-zinc-700">Vida útil (días)</span>
                  <input
                    inputMode="numeric"
                    value={it.shelfLifeDays != null ? String(it.shelfLifeDays) : ''}
                    disabled={busy}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      let shelfLifeDays: number | null = null;
                      if (raw !== '') {
                        const n = Math.floor(Number(raw.replace(',', '.')));
                        shelfLifeDays = Number.isFinite(n) && n >= 0 ? n : null;
                      }
                      onUpdateItem(it.id, { shelfLifeDays }, true);
                    }}
                    placeholder="Etiquetas"
                    className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs font-black tabular-nums text-zinc-900 outline-none focus:border-[#D32F2F]/40 sm:w-auto"
                  />
                </label>
              </div>
              <div className="flex items-center gap-2 sm:ml-auto">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold uppercase text-zinc-700">Obj.</span>
                  <TargetQtyInput
                    blockId={block.id}
                    itemId={it.id}
                    savedQty={it.targetQty}
                    disabled={busy}
                    onPersistQty={onPersistTargetQty}
                  />
                </label>
                <button type="button" onClick={() => void onRemoveProduct(it.id)} className="text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      )}

      {!hideProducts ? (
      <button
        type="button"
        disabled={busy}
        onClick={() => void onAddProduct()}
        className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 py-2 text-[11px] font-bold text-zinc-800"
      >
        <Plus className="h-3.5 w-3.5" />
        Añadir producto
      </button>
      ) : null}
    </div>
  );
}

/** Obj.: texto libre en pantalla + debounce a Supabase sin perder foco ni intermedios ("2.", etc.). */
function TargetQtyInput({
  blockId,
  itemId,
  savedQty,
  disabled,
  onPersistQty,
}: {
  blockId: string;
  itemId: string;
  savedQty: number;
  disabled: boolean;
  onPersistQty: (blockId: string, itemId: string, qty: number) => void;
}) {
  const [draft, setDraft] = useState(() => formatQtyDraftFromSaved(savedQty));
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // sync draft from persisted value / server
    // eslint-disable-next-line react-hooks/set-state-in-effect -- borrador editable vs prop numérica
    setDraft(formatQtyDraftFromSaved(savedQty));
  }, [itemId, savedQty]);

  useEffect(
    () => () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  const flush = useCallback(
    (raw: string) => {
      const qty = parseTarget(raw);
      onPersistQty(blockId, itemId, qty);
    },
    [blockId, itemId, onPersistQty],
  );

  const scheduleFlush = useCallback(
    (raw: string) => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        flush(raw);
      }, DEBOUNCE_SAVE_MS);
    },
    [flush],
  );

  return (
    <input
      inputMode="decimal"
      value={draft}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        scheduleFlush(v);
      }}
      onBlur={() => {
        if (timerRef.current != null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        const qty = parseTarget(draft);
        setDraft(formatQtyDraftFromSaved(qty));
        flush(draft);
      }}
      className="h-9 w-[4.5rem] rounded-lg border border-zinc-200 bg-white px-2 text-sm font-black tabular-nums text-zinc-900 outline-none focus:border-[#D32F2F]/40"
    />
  );
}

/** Título del bloque: estado local hasta commit; resetea si cambia id o etiqueta desde el padre. */
function BlockLabelInput({
  blockId,
  initialLabel,
  disabled,
  onCommit,
}: {
  blockId: string;
  initialLabel: string;
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
  const [value, setValue] = useState(initialLabel);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza borrador cuando el padre cambia la etiqueta
    setValue(initialLabel);
  }, [blockId, initialLabel]);
  return (
    <input
      value={value}
      disabled={disabled}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      className="min-w-[8rem] flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-black text-zinc-900 outline-none focus:border-[#D32F2F]/40"
    />
  );
}
