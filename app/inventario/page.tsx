'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, CheckCircle2, Package, Plus, RotateCcw, Trash2 } from 'lucide-react';
import ModuleHeader from '@/components/ModuleHeader';
import InventoryResultadoInventario from '@/components/InventoryResultadoInventario';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { downloadInventoryMonthlyPdf, type InventoryPdfRow } from '@/lib/inventory-pdf';
import MasterArticleSearchInput from '@/components/cocina-central/MasterArticleSearchInput';
import {
  type InventoryCatalogCategory,
  type InventoryCatalogItem,
  type InventoryCostOrigen,
  type InventoryItem,
  type InventoryMonthSnapshot,
  currentInventoryYearMonth,
  deleteAllInventoryMonthSnapshots,
  deleteInventoryItemLine,
  fetchInventoryCatalogCategories,
  fetchInventoryCatalogItems,
  fetchInventoryItems,
  fetchInventoryMonthSnapshots,
  insertInventoryHistorySnapshot,
  insertInventoryCatalogCategory,
  insertInventoryCatalogItem,
  insertInventoryLineFromCatalog,
  deactivateInventoryCatalogCategory,
  deactivateInventoryCatalogItem,
  deleteAllInventoryLinesForLocal,
  resolveInventoryItemUnitPriceEur,
  updateInventoryItemLine,
  upsertInventoryMonthSnapshot,
} from '@/lib/inventory-supabase';
import { fetchEscandalloRecipes, type EscandalloRecipe } from '@/lib/escandallos-supabase';
import { fetchPurchaseArticles, type PurchaseArticle } from '@/lib/purchase-articles-supabase';
import { appConfirm } from '@/lib/app-dialog-bridge';
import { confirmDestructiveOperation } from '@/lib/ops-role-confirm';
import { actorLabel, notifyInventarioCerrado } from '@/services/notifications';

function parseDecimal(raw: string): number | null {
  const t = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const UNIT_SUFFIX: Record<string, string> = {
  kg: 'kg',
  ud: 'ud',
  bolsa: 'bolsa',
  racion: 'ración',
  caja: 'caja',
  paquete: 'paquete',
  bandeja: 'bandeja',
};

/** Coincide con el check de `inventory_items.unit` en Supabase. */
const INVENTORY_UNITS = ['kg', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja'] as const;

/** Safari/iOS suele lanzar esto cuando `fetch` no llega a recibir respuesta (red, cambio WiFi/4G, timeout). */
function isLikelyNetworkError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /load failed|failed to fetch|networkerror|network request failed|timed out|timeout|quic/i.test(m);
}

function humanizeClientError(e: unknown, fallback: string): string {
  if (isLikelyNetworkError(e)) {
    return 'No hubo conexión con el servidor (red inestable o Supabase no respondió). En iPhone suele pasar al cambiar de WiFi a datos o con la pantalla apagada; inténtalo de nuevo.';
  }
  return e instanceof Error ? e.message : fallback;
}

type LineDraft = {
  qty: string;
  price: string;
  name: string;
  format_label: string;
  unit: string;
  origenCoste: InventoryCostOrigen;
  masterArticleId: string;
  escandalloRecipeId: string;
};

function labelOrigenInventario(o: InventoryCostOrigen): string {
  if (o === 'master') return 'Artículo máster';
  if (o === 'produccion_propia') return 'Producción propia';
  return 'Manual';
}

function lineDraftFromRow(row: InventoryItem): LineDraft {
  return {
    qty: String(row.quantity_on_hand),
    price: String(row.price_per_unit),
    name: row.name,
    format_label: row.format_label ?? '',
    unit: row.unit,
    origenCoste: row.origenCoste,
    masterArticleId: row.masterArticleId ?? '',
    escandalloRecipeId: row.escandalloRecipeId ?? '',
  };
}

export default function InventarioPage() {
  const { localId, profileReady, localName, localCode, userId, displayName, loginUsername, profileRole } =
    useAuth();
  const [categories, setCategories] = useState<InventoryCatalogCategory[]>([]);
  const [catalogItems, setCatalogItems] = useState<InventoryCatalogItem[]>([]);
  const [lines, setLines] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  /** Cantidades en el catálogo por id de artículo del catálogo (se aplican con OK por categoría). */
  const [catalogQtyDraft, setCatalogQtyDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Mientras se guarda una categoría entera tras pulsar OK. */
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null);
  /** Catálogo: precio, formato y categoría solo al expandir tocando el artículo. */
  const [catalogDetailOpen, setCatalogDetailOpen] = useState<Record<string, boolean>>({});
  const [snapshots, setSnapshots] = useState<InventoryMonthSnapshot[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [chartsResetBusy, setChartsResetBusy] = useState(false);
  const [closingYearMonth, setClosingYearMonth] = useState(() => currentInventoryYearMonth());
  const [formBusy, setFormBusy] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showAddArticle, setShowAddArticle] = useState(false);
  const [newArticleCategoryId, setNewArticleCategoryId] = useState('');
  const [newArticleName, setNewArticleName] = useState('');
  const [newArticleUnit, setNewArticleUnit] = useState<string>('kg');
  const [newArticlePrice, setNewArticlePrice] = useState('0');
  const [newArticleFormat, setNewArticleFormat] = useState('');
  const [resetInventoryBusy, setResetInventoryBusy] = useState(false);
  const [finishInventoryBusy, setFinishInventoryBusy] = useState(false);
  const [busyDeletingCategoryId, setBusyDeletingCategoryId] = useState<string | null>(null);
  const [busyDeletingCatalogItemId, setBusyDeletingCatalogItemId] = useState<string | null>(null);
  const [purchaseArticles, setPurchaseArticles] = useState<PurchaseArticle[]>([]);
  const [escandalloRecipes, setEscandalloRecipes] = useState<EscandalloRecipe[]>([]);
  const [escandalloRecipeQuery, setEscandalloRecipeQuery] = useState<Record<string, string>>({});
  const loadRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setCategories([]);
      setCatalogItems([]);
      setLines([]);
      setCatalogQtyDraft({});
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const [cats, items, inv, snaps] = await Promise.all([
        fetchInventoryCatalogCategories(supabase, localId),
        fetchInventoryCatalogItems(supabase, localId),
        fetchInventoryItems(supabase, localId),
        fetchInventoryMonthSnapshots(supabase, localId).catch(() => [] as InventoryMonthSnapshot[]),
      ]);
      setCategories(cats);
      setCatalogItems(items);
      setLines(inv);
      setSnapshots(snaps);
      const d: Record<string, LineDraft> = {};
      const cq: Record<string, string> = {};
      for (const row of inv) {
        d[row.id] = lineDraftFromRow(row);
        if (row.catalog_item_id) cq[row.catalog_item_id] = String(row.quantity_on_hand);
      }
      setDrafts(d);
      setCatalogQtyDraft(cq);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar inventario.';
      if (msg.toLowerCase().includes('relation') || msg.includes('does not exist')) {
        setBanner(
          'Faltan las tablas de inventario en Supabase. Ejecuta supabase-inventory-schema.sql y el seed si aún no lo hiciste.',
        );
        setCategories([]);
        setCatalogItems([]);
        setLines([]);
        setSnapshots([]);
        setCatalogQtyDraft({});
      } else if (msg.toLowerCase().includes('local_id')) {
        setBanner(
          'El catálogo debe estar migrado por local. Ejecuta supabase-inventory-catalog-per-local.sql en Supabase (SQL Editor).',
        );
        setCategories([]);
        setCatalogItems([]);
        setLines([]);
        setSnapshots([]);
        setCatalogQtyDraft({});
      } else if (msg.toLowerCase().includes('origen_coste') || msg.toLowerCase().includes('master_article_id')) {
        setBanner(
          'Falta la migración de origen de coste en inventario. Ejecuta en Supabase: supabase-inventory-origen-coste.sql',
        );
        setCategories([]);
        setCatalogItems([]);
        setLines([]);
        setSnapshots([]);
        setCatalogQtyDraft({});
      } else if (isLikelyNetworkError(e)) {
        setBanner(
          `${humanizeClientError(e, msg)} Los datos en pantalla son la última carga correcta; desliza hacia abajo para reintentar o recarga la página.`,
        );
      } else {
        setBanner(msg);
        setCategories([]);
        setCatalogItems([]);
        setLines([]);
        setSnapshots([]);
        setCatalogQtyDraft({});
      }
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

  loadRef.current = () => load();

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!localId || !supabaseOk) {
      setPurchaseArticles([]);
      setEscandalloRecipes([]);
      return;
    }
    const supabase = getSupabaseClient()!;
    void (async () => {
      try {
        const [arts, rec] = await Promise.all([
          fetchPurchaseArticles(supabase, localId),
          fetchEscandalloRecipes(supabase, localId).catch(() => [] as EscandalloRecipe[]),
        ]);
        setPurchaseArticles(arts);
        setEscandalloRecipes(rec);
      } catch {
        setPurchaseArticles([]);
        setEscandalloRecipes([]);
      }
    })();
  }, [localId, supabaseOk]);

  useEffect(() => {
    if (!localId || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    const ch = supabase
      .channel(`inventory-${localId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_items', filter: `local_id=eq.${localId}` },
        () => void loadRef.current(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [localId, supabaseOk]);

  const totalValor = useMemo(() => {
    let t = 0;
    for (const row of lines) {
      t += row.quantity_on_hand * row.price_per_unit;
    }
    return Math.round(t * 100) / 100;
  }, [lines]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, InventoryCatalogItem[]>();
    for (const c of categories) map.set(c.id, []);
    for (const it of catalogItems) {
      const list = map.get(it.catalog_category_id) ?? [];
      list.push(it);
      map.set(it.catalog_category_id, list);
    }
    return map;
  }, [categories, catalogItems]);

  const categoryTotals = useMemo(() => {
    const byCatalogItem = new Map(lines.map((l) => [l.catalog_item_id, l] as const));
    const totals: Record<string, number> = {};
    for (const cat of categories) {
      const items = itemsByCategory.get(cat.id) ?? [];
      let acc = 0;
      for (const it of items) {
        const line = byCatalogItem.get(it.id);
        if (!line) continue;
        acc += line.quantity_on_hand * line.price_per_unit;
      }
      totals[cat.id] = Math.round(acc * 100) / 100;
    }
    return totals;
  }, [categories, itemsByCategory, lines]);

  const searchLower = search.trim().toLowerCase();
  const filteredCatalog = useMemo(() => {
    if (!searchLower) return catalogItems;
    return catalogItems.filter(
      (it) =>
        it.name.toLowerCase().includes(searchLower) ||
        (it.format_label ?? '').toLowerCase().includes(searchLower),
    );
  }, [catalogItems, searchLower]);

  /** Valores en pantalla (borradores) → PDF, KPI por categoría y copia de historial. */
  const buildMonthClosureData = useCallback(() => {
    const itemToCat = new Map(catalogItems.map((i) => [i.id, i.catalog_category_id]));
    const breakdown: Record<string, number> = {};
    const pdfRows: InventoryPdfRow[] = [];
    const historyLines: InventoryItem[] = [];
    let total = 0;
    let linesWithStock = 0;
    for (const row of lines) {
      const d = drafts[row.id] ?? lineDraftFromRow(row);
      const q = parseDecimal(d.qty ?? String(row.quantity_on_hand)) ?? row.quantity_on_hand;
      const p = parseDecimal(d.price ?? String(row.price_per_unit)) ?? row.price_per_unit;
      const sub = Math.round(q * p * 100) / 100;
      total += sub;
      if (q > 0) linesWithStock += 1;
      const uKey = d.unit ?? row.unit;
      pdfRows.push({
        name: (d.name ?? row.name).trim() || row.name,
        formatLabel: d.format_label ?? row.format_label ?? '',
        qty: q,
        unit: UNIT_SUFFIX[uKey] ?? uKey,
        price: p,
        sub,
      });
      const cid = row.catalog_item_id ? itemToCat.get(row.catalog_item_id) : undefined;
      const key = cid ?? '__sin_catalogo__';
      breakdown[key] = Math.round(((breakdown[key] ?? 0) + sub) * 100) / 100;
      historyLines.push({
        ...row,
        quantity_on_hand: q,
        price_per_unit: p,
        name: (d.name ?? row.name).trim() || row.name,
        format_label: d.format_label?.trim() ? d.format_label.trim() : row.format_label,
        unit: uKey,
      });
    }
    total = Math.round(total * 100) / 100;
    return { pdfRows, total, breakdown, historyLines, linesWithStock };
  }, [lines, drafts, catalogItems]);

  const saveMonthClosureToSupabase = useCallback(
    async (yearMonth: string, opts: { recordHistory: boolean; userId: string | null }) => {
      if (!localId || !supabaseOk) return;
      const supabase = getSupabaseClient()!;
      const { pdfRows, total, breakdown, historyLines, linesWithStock } = buildMonthClosureData();
      await upsertInventoryMonthSnapshot(supabase, {
        localId,
        yearMonth,
        totalValue: total,
        linesCount: lines.length,
        categoryBreakdown: breakdown,
      });
      const categoryRows = Object.entries(breakdown)
        .map(([id, value]) => ({
          name:
            id === '__sin_catalogo__'
              ? 'Sin categoría'
              : (categories.find((c) => c.id === id)?.name ?? 'Categoría'),
          valueEur: value,
          pct: total > 0 ? Math.round((value / total) * 1000) / 10 : 0,
        }))
        .filter((x) => x.valueEur > 0)
        .sort((a, b) => b.valueEur - a.valueEur);
      downloadInventoryMonthlyPdf({
        localLabel: localName ?? localCode ?? '—',
        yearMonth,
        rows: pdfRows,
        total,
        categoryRows,
        linesCount: lines.length,
        linesWithStock,
      });
      if (opts.recordHistory) {
        await insertInventoryHistorySnapshot(supabase, {
          localId,
          eventType: 'inventory_final',
          summary: `Inventario terminado (${yearMonth}) — ${lines.length} línea(s), ${total.toFixed(2)} €`,
          lines: historyLines,
          userId: opts.userId,
        });
      }
      const refreshed = await fetchInventoryMonthSnapshots(supabase, localId).catch(
        () => [] as InventoryMonthSnapshot[],
      );
      setSnapshots(refreshed);
    },
    [localId, supabaseOk, lines.length, buildMonthClosureData, localName, localCode, categories],
  );

  const saveLine = async (
    row: InventoryItem,
    override?: Partial<LineDraft>,
    opts?: { skipReload?: boolean; skipBusy?: boolean; throwing?: boolean },
  ) => {
    if (!localId || !supabaseOk) return;
    const base = drafts[row.id] ?? lineDraftFromRow(row);
    const d = { ...base, ...override };
    const q = parseDecimal(d.qty);
    const p = parseDecimal(d.price);
    const fail = (msg: string) => {
      if (opts?.throwing) throw new Error(msg);
      setBanner(msg);
    };
    if (q === null || q < 0) {
      fail('Cantidad no válida.');
      return;
    }
    const origen = d.origenCoste ?? 'manual';
    const masterId = d.masterArticleId?.trim() ? d.masterArticleId.trim() : null;
    const escId = d.escandalloRecipeId?.trim() ? d.escandalloRecipeId.trim() : null;
    const nm = d.name.trim();
    if (!nm) {
      fail('El nombre no puede estar vacío.');
      return;
    }
    if (!INVENTORY_UNITS.includes(d.unit as (typeof INVENTORY_UNITS)[number])) {
      fail('Unidad no válida.');
      return;
    }
    const supabase = getSupabaseClient()!;
    if (!opts?.skipBusy) setBusyId(row.id);
    if (!opts?.skipReload && !opts?.throwing) setBanner(null);
    try {
      let priceOut: number;
      let precioManual: number | null = null;
      if (origen === 'manual') {
        if (p === null || p < 0) {
          fail('Precio no válido.');
          return;
        }
        priceOut = p;
        precioManual = p;
      } else {
        if (origen === 'master' && !masterId) {
          fail('Elige un artículo máster.');
          return;
        }
        if (origen === 'produccion_propia' && !escId) {
          fail('Elige una base, subreceta o receta (producción propia).');
          return;
        }
        const resolved = await resolveInventoryItemUnitPriceEur(supabase, localId, {
          origenCoste: origen,
          masterArticleId: origen === 'master' ? masterId : null,
          escandalloRecipeId: origen === 'produccion_propia' ? escId : null,
          price_per_unit: row.price_per_unit,
          precioManual: row.precioManual,
        });
        if (resolved == null) {
          fail(
            origen === 'master'
              ? 'No hay coste de uso (€/ud) para ese artículo máster.'
              : 'No se pudo calcular el coste desde la receta (revisa el escandallo: ingredientes y unidades).',
          );
          return;
        }
        priceOut = resolved;
      }
      await updateInventoryItemLine(supabase, {
        localId,
        itemId: row.id,
        quantity_on_hand: q,
        price_per_unit: priceOut,
        name: nm,
        format_label: d.format_label.trim() ? d.format_label.trim() : null,
        unit: d.unit,
        origenCoste: origen,
        masterArticleId: origen === 'master' ? masterId : null,
        escandalloRecipeId: origen === 'produccion_propia' ? escId : null,
        precioManual: precioManual,
      });
      setDrafts((prev) => ({
        ...prev,
        [row.id]: {
          ...d,
          name: nm,
          price: String(priceOut),
          origenCoste: origen,
          masterArticleId: origen === 'master' ? masterId ?? '' : '',
          escandalloRecipeId: origen === 'produccion_propia' ? escId ?? '' : '',
        },
      }));
      const catalogId = row.catalog_item_id;
      if (catalogId) {
        setCatalogQtyDraft((prev) => ({ ...prev, [catalogId]: String(q) }));
      }
      if (!opts?.skipReload) await load();
    } catch (e) {
      if (opts?.throwing) throw e;
      setBanner(humanizeClientError(e, 'Error al guardar.'));
    } finally {
      if (!opts?.skipBusy) setBusyId(null);
    }
  };

  const applyCategoryBatch = async (catId: string, items: InventoryCatalogItem[]) => {
    if (!localId || !supabaseOk || items.length === 0) return;
    const supabase = getSupabaseClient()!;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setBusyCategoryId(catId);
    setBanner(null);
    try {
      for (const it of items) {
        const line = lines.find((l) => l.catalog_item_id === it.id);
        const raw = (catalogQtyDraft[it.id] ?? '').trim();
        if (line) {
          const q = raw === '' ? 0 : parseDecimal(raw);
          if (q === null || q < 0) {
            throw new Error(`Cantidad no válida: ${it.name}`);
          }
          await saveLine(line, { qty: String(q) }, { skipReload: true, skipBusy: true, throwing: true });
        } else {
          if (raw === '') continue;
          const q = parseDecimal(raw);
          if (q === null || q < 0) {
            throw new Error(`Cantidad no válida: ${it.name}`);
          }
          try {
            await insertInventoryLineFromCatalog(supabase, {
              localId,
              catalogItem: it,
              userId: user?.id ?? null,
              initialQuantity: q,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : '';
            if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('23505')) {
              throw new Error(`«${it.name}» ya está en tu inventario; recarga e inténtalo de nuevo.`);
            }
            throw err;
          }
        }
      }
      await load();
    } catch (e) {
      setBanner(humanizeClientError(e, 'Error al guardar la categoría.'));
      await load();
    } finally {
      setBusyCategoryId(null);
    }
  };

  const submitNewCategory = async () => {
    if (!supabaseOk || !localId) return;
    const name = newCategoryName.trim();
    if (!name) {
      setBanner('Escribe un nombre de categoría.');
      return;
    }
    const supabase = getSupabaseClient()!;
    const nextOrder =
      categories.length > 0 ? Math.max(...categories.map((c) => c.sort_order), 0) + 10 : 10;
    setFormBusy(true);
    setBanner(null);
    try {
      await insertInventoryCatalogCategory(supabase, localId, name, nextOrder);
      setNewCategoryName('');
      setShowAddCategory(false);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo crear la categoría.';
      setBanner(
        msg.includes('unique') || msg.includes('duplicate')
          ? 'Ya existe una categoría con ese nombre en tu catálogo.'
          : humanizeClientError(e, msg),
      );
    } finally {
      setFormBusy(false);
    }
  };

  const submitNewArticle = async () => {
    if (!supabaseOk || !localId) return;
    const cid = newArticleCategoryId.trim();
    const nm = newArticleName.trim();
    if (!cid) {
      setBanner('Elige una categoría.');
      return;
    }
    if (!nm) {
      setBanner('Escribe el nombre del artículo.');
      return;
    }
    if (!INVENTORY_UNITS.includes(newArticleUnit as (typeof INVENTORY_UNITS)[number])) {
      setBanner('Unidad no válida.');
      return;
    }
    const price = parseDecimal(newArticlePrice);
    if (price === null || price < 0) {
      setBanner('Precio no válido.');
      return;
    }
    const inCat = catalogItems.filter((i) => i.catalog_category_id === cid);
    const nextSort = inCat.length > 0 ? Math.max(...inCat.map((i) => i.sort_order), 0) + 1 : 1;
    const supabase = getSupabaseClient()!;
    setFormBusy(true);
    setBanner(null);
    try {
      await insertInventoryCatalogItem(supabase, {
        catalogCategoryId: cid,
        name: nm,
        unit: newArticleUnit,
        defaultPricePerUnit: price,
        formatLabel: newArticleFormat.trim() ? newArticleFormat.trim() : null,
        sortOrder: nextSort,
      });
      setNewArticleName('');
      setNewArticlePrice('0');
      setNewArticleFormat('');
      setShowAddArticle(false);
      await load();
    } catch (e) {
      setBanner(humanizeClientError(e, 'No se pudo crear el artículo.'));
    } finally {
      setFormBusy(false);
    }
  };

  const handleDownloadMonthlyPdf = async () => {
    if (!localId || !supabaseOk || lines.length === 0) return;
    setPdfBusy(true);
    setBanner(null);
    try {
      await saveMonthClosureToSupabase(closingYearMonth, { recordHistory: false, userId: null });
      setBanner(`PDF descargado y cierre ${closingYearMonth} actualizado en los gráficos.`);
    } catch (e) {
      setBanner(humanizeClientError(e, 'Error al generar el PDF o guardar el mes.'));
    } finally {
      setPdfBusy(false);
    }
  };

  const resetInventoryCharts = async () => {
    if (!localId || !supabaseOk || snapshots.length === 0) return;
    if (
      !(await appConfirm(
        'Se borrarán todos los puntos del gráfico «Valor por mes» (cierres mensuales guardados para KPI). No se borran las líneas de inventario, el catálogo ni el historial. ¿Continuar?',
      ))
    ) {
      return;
    }
    const supabase = getSupabaseClient()!;
    setChartsResetBusy(true);
    setBanner(null);
    try {
      await deleteAllInventoryMonthSnapshots(supabase, localId);
      const refreshed = await fetchInventoryMonthSnapshots(supabase, localId).catch(
        () => [] as InventoryMonthSnapshot[],
      );
      setSnapshots(refreshed);
      setBanner('Gráficos de inventario reiniciados.');
    } catch (e) {
      setBanner(humanizeClientError(e, 'Error al reiniciar gráficos.'));
    } finally {
      setChartsResetBusy(false);
    }
  };

  const removeLine = async (row: InventoryItem) => {
    if (!(await confirmDestructiveOperation(profileRole, '¿Confirmar eliminación de esta línea de inventario?'))) {
      return;
    }
    if (!localId || !supabaseOk) return;
    if (
      !(await appConfirm(
        `¿Quitar «${row.name}» del inventario? Se guardará una copia en Historial antes de borrar la línea.`,
      ))
    ) {
      return;
    }
    const supabase = getSupabaseClient()!;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setBusyId(row.id);
    setBanner(null);
    try {
      await insertInventoryHistorySnapshot(supabase, {
        localId,
        eventType: 'before_line_delete',
        summary: `Antes de quitar: ${row.name}`,
        lines,
        userId: user?.id ?? null,
      });
      await deleteInventoryItemLine(supabase, localId, row.id);
      await load();
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      if (raw.includes('inventory_history') || raw.includes('does not exist')) {
        setBanner('Ejecuta supabase-inventory-history.sql en Supabase para usar historial y quitar líneas con seguridad.');
      } else {
        setBanner(humanizeClientError(e, 'Error al eliminar.'));
      }
    } finally {
      setBusyId(null);
    }
  };

  const finishInventoryToHistory = async () => {
    if (!localId || !supabaseOk) return;
    if (lines.length === 0) {
      setBanner('No hay líneas en el inventario para cerrar.');
      return;
    }
    if (
      !(await appConfirm(
        `Se guardará el cierre del mes ${closingYearMonth}: copia en historial, PDF descargado y datos en los gráficos/KPI de abajo. Las líneas en pantalla no se borran (usa «Reiniciar inventario» para empezar de cero). ¿Continuar?`,
      ))
    ) {
      return;
    }
    const supabase = getSupabaseClient()!;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setFinishInventoryBusy(true);
    setBanner(null);
    try {
      await saveMonthClosureToSupabase(closingYearMonth, { recordHistory: true, userId: user?.id ?? null });
      void notifyInventarioCerrado(supabase, {
        localId,
        userId: user?.id ?? userId,
        actorName: actorLabel(displayName, loginUsername),
        yearMonth: closingYearMonth,
      });
      setBanner(`Cierre ${closingYearMonth} guardado: PDF descargado, KPI actualizados e historial registrado.`);
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      if (
        raw.includes('inventory_history') ||
        raw.includes('does not exist') ||
        raw.includes('violates check constraint') ||
        raw.includes('check constraint')
      ) {
        setBanner(
          'Actualiza Supabase: ejecuta supabase-inventory-history.sql o supabase-inventory-history-inventory-final.sql para permitir «Terminar inventario».',
        );
      } else {
        setBanner(humanizeClientError(e, 'Error al cerrar inventario.'));
      }
    } finally {
      setFinishInventoryBusy(false);
    }
  };

  const resetInventoryClearLines = async () => {
    if (!(await confirmDestructiveOperation(profileRole, '¿Confirmar vaciar todas las líneas de inventario?'))) {
      return;
    }
    if (!localId || !supabaseOk) return;
    if (lines.length === 0) {
      setBanner('No hay líneas en el inventario.');
      return;
    }
    const hasSnap = snapshots.some((s) => s.year_month === closingYearMonth);
    if (!hasSnap) {
      const saveFirst = await appConfirm(
        `No hay cierre mensual guardado para ${closingYearMonth} en los gráficos. Pulsa Aceptar para descargar el PDF, guardar ese cierre e historial, y vaciar las líneas. (Si el inventario es de otro mes, cambia primero «Mes del cierre» arriba.)`,
      );
      if (saveFirst) {
        const supabase = getSupabaseClient()!;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setResetInventoryBusy(true);
        setBanner(null);
        try {
          await saveMonthClosureToSupabase(closingYearMonth, { recordHistory: true, userId: user?.id ?? null });
          await deleteAllInventoryLinesForLocal(supabase, localId);
          await load();
          setBanner(`Cierre ${closingYearMonth} guardado y líneas vaciadas.`);
        } catch (e) {
          setBanner(humanizeClientError(e, 'Error al guardar cierre o reiniciar.'));
        } finally {
          setResetInventoryBusy(false);
        }
        return;
      }
      if (
        !(await appConfirm(
          'Vas a vaciar las líneas sin guardar cierre en los informes ni PDF. ¿Continuar de todos modos?',
        ))
      ) {
        return;
      }
    } else if (
      !(await appConfirm(
        'Se borrarán todas las líneas de inventario de este local. El valor total quedará en 0. El catálogo no cambia. ¿Continuar?',
      ))
    ) {
      return;
    }
    const supabase = getSupabaseClient()!;
    setResetInventoryBusy(true);
    setBanner(null);
    try {
      await deleteAllInventoryLinesForLocal(supabase, localId);
      await load();
    } catch (e) {
      setBanner(humanizeClientError(e, 'Error al reiniciar.'));
    } finally {
      setResetInventoryBusy(false);
    }
  };

  const removeCatalogCategory = async (cat: InventoryCatalogCategory) => {
    if (!(await confirmDestructiveOperation(profileRole, '¿Eliminar esta categoría del catálogo?'))) {
      return;
    }
    if (!localId || !supabaseOk) return;
    const nItems = catalogItems.filter((i) => i.catalog_category_id === cat.id).length;
    if (
      !(await appConfirm(
        `¿Ocultar la categoría «${cat.name}» y sus ${nItems} artículo(s) solo en el catálogo de tu local? ` +
          'Dejarán de mostrarse aquí y se borrarán las líneas de inventario vinculadas en tu local. Otros locales no se ven afectados. Esta acción no se puede deshacer desde la app.',
      ))
    ) {
      return;
    }
    const supabase = getSupabaseClient()!;
    setBusyDeletingCategoryId(cat.id);
    setBanner(null);
    try {
      await deactivateInventoryCatalogCategory(supabase, { categoryId: cat.id, localId: localId });
      setCatalogDetailOpen({});
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar la categoría.';
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('42501')) {
        setBanner(
          'Falta permiso en el catálogo. Ejecuta supabase-inventory-catalog-per-local.sql (o las políticas RLS de inventario) en Supabase.',
        );
      } else {
        setBanner(humanizeClientError(e, msg));
      }
    } finally {
      setBusyDeletingCategoryId(null);
    }
  };

  const removeCatalogItem = async (it: InventoryCatalogItem) => {
    if (!(await confirmDestructiveOperation(profileRole, '¿Eliminar este artículo del catálogo de inventario?'))) {
      return;
    }
    if (!localId || !supabaseOk) return;
    if (
      !(await appConfirm(
        `¿Ocultar «${it.name}» solo en el catálogo de tu local? ` +
          'Dejará de mostrarse aquí y se borrará la línea de inventario vinculada en tu local, si existe. Otros locales no se ven afectados. Esta acción no se puede deshacer desde la app.',
      ))
    ) {
      return;
    }
    const supabase = getSupabaseClient()!;
    setBusyDeletingCatalogItemId(it.id);
    setBanner(null);
    try {
      await deactivateInventoryCatalogItem(supabase, { catalogItemId: it.id, localId: localId });
      setCatalogDetailOpen((prev) => {
        const next = { ...prev };
        delete next[it.id];
        return next;
      });
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar el artículo.';
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('42501')) {
        setBanner(
          'Falta permiso en el catálogo. Ejecuta supabase-inventory-catalog-per-local.sql (o las políticas RLS de inventario) en Supabase.',
        );
      } else {
        setBanner(humanizeClientError(e, msg));
      }
    } finally {
      setBusyDeletingCatalogItemId(null);
    }
  };

  const disabled = !localId || !profileReady || !supabaseOk || loading;

  return (
    <div className="space-y-5">
      <ModuleHeader title="Inventario" />

      {!isSupabaseEnabled() || !getSupabaseClient() ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Configura Supabase en la app para usar inventario.
        </div>
      ) : null}

      {!localId && profileReady ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Tu usuario necesita un perfil con <strong>local</strong> en Supabase.
        </div>
      ) : null}

      {banner ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{banner}</div>
      ) : null}

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : (
        <>
          <section className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white px-4 py-4 ring-1 ring-zinc-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#D32F2F]/12 text-[#D32F2F]">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Valor total inventario</p>
                  <p className="text-2xl font-extrabold tabular-nums text-zinc-900">{totalValor.toFixed(2)} €</p>
                  <p className="text-[11px] text-zinc-500">{lines.length} línea(s) activa(s)</p>
                </div>
              </div>
              <div className="flex w-full min-w-0 flex-col gap-2 sm:max-w-md sm:items-end">
                <label className="flex w-full flex-col gap-0.5 sm:items-end">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    Mes
                  </span>
                  <input
                    type="month"
                    value={closingYearMonth}
                    onChange={(e) => setClosingYearMonth(e.target.value)}
                    disabled={disabled}
                    className="h-10 w-full max-w-[11rem] rounded-xl border border-zinc-200 bg-white px-2 text-sm font-semibold text-zinc-900 shadow-sm disabled:opacity-45 sm:text-right"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={disabled || lines.length === 0 || finishInventoryBusy || resetInventoryBusy}
                    onClick={() => void finishInventoryToHistory()}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-xs font-bold text-emerald-950 shadow-sm disabled:opacity-45"
                  >
                    <CheckCircle2 className={`h-4 w-4 ${finishInventoryBusy ? 'animate-pulse' : ''}`} />
                    {finishInventoryBusy ? 'Guardando…' : 'Terminar inventario'}
                  </button>
                  <button
                    type="button"
                    disabled={disabled || lines.length === 0 || resetInventoryBusy || finishInventoryBusy}
                    onClick={() => void resetInventoryClearLines()}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-950 shadow-sm disabled:opacity-45"
                  >
                    <RotateCcw className={`h-4 w-4 ${resetInventoryBusy ? 'animate-spin' : ''}`} />
                    {resetInventoryBusy ? 'Borrando…' : 'Reiniciar inventario'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-zinc-900">Catálogo</h2>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={disabled || formBusy}
                  onClick={() => setShowAddCategory(true)}
                  className="inline-flex h-7 items-center gap-0.5 rounded-md border border-zinc-300 bg-white px-2 text-[10px] font-bold uppercase tracking-wide text-zinc-800 disabled:opacity-45"
                >
                  <Plus className="h-3 w-3" />
                  Categoría
                </button>
                <button
                  type="button"
                  disabled={disabled || formBusy || categories.length === 0}
                  onClick={() => {
                    const first = categories[0];
                    if (first) setNewArticleCategoryId(first.id);
                    setShowAddArticle(true);
                  }}
                  className="inline-flex h-7 items-center gap-0.5 rounded-md border border-zinc-900 bg-zinc-900 px-2 text-[10px] font-bold uppercase tracking-wide text-white disabled:opacity-45"
                >
                  <Plus className="h-3 w-3" />
                  Artículo
                </button>
              </div>
            </div>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar artículo…"
              className="mb-3 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#D32F2F]/20"
            />
            <div className="space-y-2">
              {categories.map((cat) => {
                const allInCat = itemsByCategory.get(cat.id) ?? [];
                const items = allInCat.filter((it) => filteredCatalog.some((f) => f.id === it.id));
                if (searchLower && items.length === 0) return null;
                return (
                  <details
                    key={cat.id}
                    className="rounded-xl border border-zinc-200 bg-zinc-50/80 ring-1 ring-zinc-100"
                  >
                    <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-bold text-zinc-800 [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">{cat.name}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            disabled={
                              disabled ||
                              busyDeletingCategoryId !== null ||
                              busyCategoryId === cat.id ||
                              busyDeletingCatalogItemId !== null
                            }
                            onClick={(e) => {
                              e.preventDefault();
                              void removeCatalogCategory(cat);
                            }}
                            className="inline-flex h-8 min-w-[2rem] items-center justify-center gap-1 rounded-lg border border-red-200/90 bg-white px-2 text-[10px] font-bold uppercase tracking-wide text-red-700 hover:bg-red-50 disabled:opacity-45 sm:px-2.5"
                            aria-label={`Eliminar categoría ${cat.name}`}
                          >
                            {busyDeletingCategoryId === cat.id ? (
                              <span className="px-1">…</span>
                            ) : (
                              <>
                                <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                <span className="hidden sm:inline">Eliminar</span>
                              </>
                            )}
                          </button>
                          <span className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-500 tabular-nums">
                            <span>{items.length}</span>
                            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-bold text-zinc-700">
                              {(categoryTotals[cat.id] ?? 0).toFixed(2)} €
                            </span>
                          </span>
                        </span>
                      </span>
                    </summary>
                    <ul className="space-y-1 border-t border-zinc-100 px-2 py-2">
                      {items.length === 0 ? (
                        <li className="rounded-lg bg-white px-2 py-4 text-center text-[11px] text-zinc-500 ring-1 ring-zinc-100">
                          Sin artículos en esta categoría. Pulsa «+ Artículo».
                        </li>
                      ) : null}
                      {items.map((it) => {
                        const line = lines.find((l) => l.catalog_item_id === it.id);
                        const qtyBusy = busyCategoryId === cat.id;
                        const qtyValue =
                          catalogQtyDraft[it.id] ?? (line ? String(line.quantity_on_hand) : '');
                        const detailsOpen = Boolean(catalogDetailOpen[it.id]);
                        const lineDraft = line
                          ? drafts[line.id] ?? lineDraftFromRow(line)
                          : null;
                        const lineBusy = line ? busyId === line.id : false;
                        const lineSub =
                          line && lineDraft
                            ? Math.round(
                                (parseDecimal(lineDraft.qty) ?? 0) *
                                  (parseDecimal(lineDraft.price) ?? 0) *
                                  100,
                              ) / 100
                            : 0;
                        return (
                          <li
                            key={it.id}
                            className="rounded-lg bg-white px-2 py-2 ring-1 ring-zinc-100"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div
                                role="button"
                                tabIndex={0}
                                aria-expanded={detailsOpen}
                                aria-label={
                                  detailsOpen
                                    ? `Ocultar detalles de ${it.name}`
                                    : `Ver detalles de ${it.name}`
                                }
                                className="min-w-0 flex-1 cursor-pointer rounded-lg py-0.5 pl-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[#D32F2F]/35"
                                onClick={() =>
                                  setCatalogDetailOpen((prev) => ({
                                    ...prev,
                                    [it.id]: !prev[it.id],
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setCatalogDetailOpen((prev) => ({
                                      ...prev,
                                      [it.id]: !prev[it.id],
                                    }));
                                  }
                                }}
                              >
                                <div className="flex items-start gap-1.5">
                                  <ChevronDown
                                    className={`mt-0.5 h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 ${detailsOpen ? 'rotate-180' : ''}`}
                                    aria-hidden
                                  />
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-zinc-900">{it.name}</p>
                                    {line && !detailsOpen ? (
                                      <p className="mt-0.5 text-[10px] text-amber-900/90">
                                        Origen coste: {labelOrigenInventario(line.origenCoste)}
                                      </p>
                                    ) : null}
                                    {detailsOpen ? (
                                      <p className="mt-1 text-[10px] leading-snug text-zinc-500">
                                        Catálogo: {it.default_price_per_unit.toFixed(2)} €/
                                        {UNIT_SUFFIX[it.unit] ?? it.unit}
                                        {it.format_label ? ` · ${it.format_label}` : ''}
                                        <span className="text-zinc-400"> · {cat.name}</span>
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                              <label
                                className="flex shrink-0 flex-col gap-0.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="text-[9px] font-bold uppercase text-zinc-400">Cant.</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  placeholder="0"
                                  aria-label={`Cantidad de ${it.name}`}
                                  value={qtyValue}
                                  disabled={disabled || qtyBusy}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setCatalogQtyDraft((prev) => ({ ...prev, [it.id]: v }));
                                    if (line) {
                                      setDrafts((prev) => {
                                        const cur = prev[line.id] ?? lineDraftFromRow(line);
                                        return { ...prev, [line.id]: { ...cur, qty: v } };
                                      });
                                    }
                                  }}
                                  className="h-9 w-[4.75rem] rounded-lg border border-zinc-200 px-2 text-center text-sm font-semibold tabular-nums"
                                />
                              </label>
                            </div>
                            {detailsOpen ? (
                              <div
                                className="mt-2 space-y-3 border-t border-zinc-100 pt-2"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                {line && lineDraft ? (
                                  <>
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                                      Tu línea en inventario
                                    </p>
                                    <label className="block">
                                  <span className="text-[9px] font-bold uppercase text-zinc-400">Nombre</span>
                                  <input
                                    type="text"
                                    value={lineDraft.name}
                                    disabled={disabled || lineBusy || qtyBusy}
                                    onChange={(e) =>
                                      setDrafts((prev) => ({
                                        ...prev,
                                        [line.id]: { ...lineDraft, name: e.target.value },
                                      }))
                                    }
                                    className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm font-semibold text-zinc-900"
                                  />
                                </label>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                  <label className="min-w-0 flex-1">
                                    <span className="text-[9px] font-bold uppercase text-zinc-400">
                                      Formato
                                    </span>
                                    <input
                                      type="text"
                                      value={lineDraft.format_label}
                                      disabled={disabled || lineBusy || qtyBusy}
                                      placeholder="ej. PAQUETE 11 ud"
                                      onChange={(e) =>
                                        setDrafts((prev) => ({
                                          ...prev,
                                          [line.id]: { ...lineDraft, format_label: e.target.value },
                                        }))
                                      }
                                      className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs text-zinc-800"
                                    />
                                  </label>
                                  <label className="sm:w-36">
                                    <span className="text-[9px] font-bold uppercase text-zinc-400">Unidad</span>
                                    <select
                                      value={lineDraft.unit}
                                      disabled={disabled || lineBusy || qtyBusy}
                                      onChange={(e) =>
                                        setDrafts((prev) => ({
                                          ...prev,
                                          [line.id]: { ...lineDraft, unit: e.target.value },
                                        }))
                                      }
                                      className="mt-0.5 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs font-semibold text-zinc-900"
                                    >
                                      {INVENTORY_UNITS.map((key) => (
                                        <option key={key} value={key}>
                                          {UNIT_SUFFIX[key] ?? key}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                                <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-2 py-2">
                                  <p className="text-[10px] font-bold uppercase text-zinc-600">Origen del coste</p>
                                  <select
                                    value={lineDraft.origenCoste}
                                    disabled={disabled || lineBusy || qtyBusy}
                                    onChange={(e) => {
                                      const v = e.target.value as InventoryCostOrigen;
                                      setDrafts((prev) => {
                                        const cur = prev[line.id] ?? lineDraftFromRow(line);
                                        return {
                                          ...prev,
                                          [line.id]: {
                                            ...cur,
                                            origenCoste: v,
                                            masterArticleId: v === 'master' ? cur.masterArticleId : '',
                                            escandalloRecipeId: v === 'produccion_propia' ? cur.escandalloRecipeId : '',
                                          },
                                        };
                                      });
                                    }}
                                    className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold"
                                  >
                                    <option value="manual">Manual</option>
                                    <option value="master">Artículo máster</option>
                                    <option value="produccion_propia">Producción propia (base / subreceta)</option>
                                  </select>
                                  {lineDraft.origenCoste === 'master' ? (
                                    <div className="mt-2">
                                      <p className="text-[9px] font-bold uppercase text-zinc-500">Artículo máster</p>
                                      <MasterArticleSearchInput
                                        className="mt-0.5"
                                        articles={purchaseArticles}
                                        value={lineDraft.masterArticleId}
                                        onSelect={(a) =>
                                          setDrafts((prev) => ({
                                            ...prev,
                                            [line.id]: { ...(prev[line.id] ?? lineDraftFromRow(line)), masterArticleId: a.id },
                                          }))
                                        }
                                        onClear={() =>
                                          setDrafts((prev) => ({
                                            ...prev,
                                            [line.id]: { ...(prev[line.id] ?? lineDraftFromRow(line)), masterArticleId: '' },
                                          }))
                                        }
                                        disabled={disabled || lineBusy || qtyBusy}
                                      />
                                    </div>
                                  ) : null}
                                  {lineDraft.origenCoste === 'produccion_propia' ? (
                                    <div className="mt-2 space-y-1">
                                      <p className="text-[9px] font-bold uppercase text-zinc-500">
                                        Base / subreceta (escandallo)
                                      </p>
                                      <input
                                        type="search"
                                        placeholder="Filtrar por nombre…"
                                        value={escandalloRecipeQuery[line.id] ?? ''}
                                        disabled={disabled || lineBusy || qtyBusy}
                                        onChange={(e) =>
                                          setEscandalloRecipeQuery((prev) => ({
                                            ...prev,
                                            [line.id]: e.target.value,
                                          }))
                                        }
                                        className="h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs"
                                      />
                                      <select
                                        value={lineDraft.escandalloRecipeId}
                                        disabled={disabled || lineBusy || qtyBusy}
                                        onChange={(e) =>
                                          setDrafts((prev) => ({
                                            ...prev,
                                            [line.id]: {
                                              ...(prev[line.id] ?? lineDraftFromRow(line)),
                                              escandalloRecipeId: e.target.value,
                                            },
                                          }))
                                        }
                                        className="h-10 w-full max-h-40 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold"
                                      >
                                        <option value="">— Elegir receta —</option>
                                        {escandalloRecipes
                                          .filter((r) => {
                                            const t = (escandalloRecipeQuery[line.id] ?? '').trim().toLowerCase();
                                            if (!t) return true;
                                            return r.name.toLowerCase().includes(t);
                                          })
                                          .map((r) => (
                                            <option key={r.id} value={r.id}>
                                              {r.isSubRecipe ? '[Base] ' : '[Plato] '}
                                              {r.name}
                                            </option>
                                          ))}
                                      </select>
                                      <p className="text-[10px] leading-snug text-zinc-500">
                                        Coste teórico del escandallo (ingredientes, rendimiento, subrecetas). Aquí no se
                                        muestra la receta.
                                      </p>
                                    </div>
                                  ) : null}
                                </div>
                                <label className="block sm:max-w-[10rem]">
                                  <span className="text-[9px] font-bold uppercase text-zinc-400">
                                    € / {UNIT_SUFFIX[lineDraft.unit] ?? lineDraft.unit}
                                    {lineDraft.origenCoste !== 'manual' ? ' (auto. al guardar)' : ''}
                                  </span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={lineDraft.price}
                                    disabled={disabled || lineBusy || qtyBusy || lineDraft.origenCoste !== 'manual'}
                                    onChange={(e) =>
                                      setDrafts((prev) => ({
                                        ...prev,
                                        [line.id]: { ...lineDraft, price: e.target.value },
                                      }))
                                    }
                                    className="mt-0.5 h-9 w-full rounded-lg border border-zinc-200 px-2 text-sm font-semibold tabular-nums disabled:bg-zinc-100"
                                  />
                                </label>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-xs font-bold text-zinc-700">
                                    Subtotal: {lineSub.toFixed(2)} €
                                  </span>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      disabled={disabled || lineBusy || qtyBusy}
                                      onClick={() => void saveLine(line)}
                                      className="h-9 rounded-lg bg-[#D32F2F] px-3 text-xs font-bold text-white disabled:opacity-45"
                                    >
                                      {lineBusy ? '…' : 'Guardar línea'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={disabled || lineBusy || qtyBusy}
                                      onClick={() => void removeLine(line)}
                                      className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-800 disabled:opacity-45"
                                    >
                                      Quitar del inventario
                                    </button>
                                  </div>
                                </div>
                                  </>
                                ) : null}
                                <div className="rounded-lg border border-red-100 bg-red-50/50 px-3 py-2.5">
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-red-800/90">
                                    Catálogo de tu local
                                  </p>
                                  <button
                                    type="button"
                                    disabled={
                                      disabled ||
                                      qtyBusy ||
                                      busyDeletingCatalogItemId !== null ||
                                      busyDeletingCategoryId !== null
                                    }
                                    onClick={() => void removeCatalogItem(it)}
                                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white py-2 text-xs font-bold text-red-800 hover:bg-red-50 disabled:opacity-45 sm:w-auto sm:px-3"
                                  >
                                    <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    {busyDeletingCatalogItemId === it.id
                                      ? 'Eliminando…'
                                      : 'Eliminar artículo del catálogo'}
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                      {items.length > 0 ? (
                        <li className="px-1 pt-2">
                          <button
                            type="button"
                            disabled={disabled || busyCategoryId === cat.id}
                            onClick={() => void applyCategoryBatch(cat.id, items)}
                            className="h-10 w-full rounded-xl bg-[#D32F2F] text-sm font-bold text-white shadow-sm disabled:opacity-45"
                          >
                            {busyCategoryId === cat.id ? 'Guardando…' : 'OK'}
                          </button>
                        </li>
                      ) : null}
                    </ul>
                  </details>
                );
              })}
            </div>
          </section>

          <InventoryResultadoInventario
            snapshots={snapshots}
            totalValor={totalValor}
            lines={lines}
            catalogItems={catalogItems}
            categories={categories}
            yearMonth={closingYearMonth}
            onDownloadPdf={handleDownloadMonthlyPdf}
            pdfBusy={pdfBusy}
            disabled={disabled}
            onResetCharts={resetInventoryCharts}
            chartsResetBusy={chartsResetBusy}
          />
        </>
      )}

      {showAddCategory ? (
        <div className="fixed inset-0 z-[130] flex items-end justify-center p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="inv-add-cat-title">
          <button type="button" className="absolute inset-0 bg-black/45" aria-label="Cerrar" onClick={() => !formBusy && setShowAddCategory(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl">
            <h3 id="inv-add-cat-title" className="text-sm font-bold text-zinc-900">
              Nueva categoría
            </h3>
            <p className="mt-1 text-[11px] text-zinc-500">Solo se añade al catálogo de este local.</p>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Nombre"
              className="mt-3 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm"
              disabled={formBusy}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                disabled={formBusy}
                onClick={() => setShowAddCategory(false)}
                className="h-9 rounded-lg px-3 text-xs font-semibold text-zinc-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={formBusy}
                onClick={() => void submitNewCategory()}
                className="h-9 rounded-lg bg-[#D32F2F] px-3 text-xs font-bold text-white disabled:opacity-45"
              >
                {formBusy ? '…' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAddArticle ? (
        <div className="fixed inset-0 z-[130] flex items-end justify-center p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="inv-add-art-title">
          <button type="button" className="absolute inset-0 bg-black/45" aria-label="Cerrar" onClick={() => !formBusy && setShowAddArticle(false)} />
          <div className="relative max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl">
            <h3 id="inv-add-art-title" className="text-sm font-bold text-zinc-900">
              Nuevo artículo en catálogo
            </h3>
            <label className="mt-3 block text-[10px] font-bold uppercase text-zinc-500">Categoría</label>
            <select
              value={newArticleCategoryId}
              onChange={(e) => setNewArticleCategoryId(e.target.value)}
              disabled={formBusy}
              className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-2 text-sm"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="mt-2 block text-[10px] font-bold uppercase text-zinc-500">Nombre</label>
            <input
              type="text"
              value={newArticleName}
              onChange={(e) => setNewArticleName(e.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm"
              disabled={formBusy}
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold uppercase text-zinc-500">Unidad</label>
                <select
                  value={newArticleUnit}
                  onChange={(e) => setNewArticleUnit(e.target.value)}
                  disabled={formBusy}
                  className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-2 text-xs font-semibold"
                >
                  {INVENTORY_UNITS.map((key) => (
                    <option key={key} value={key}>
                      {UNIT_SUFFIX[key] ?? key}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-zinc-500">Precio €</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={newArticlePrice}
                  onChange={(e) => setNewArticlePrice(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-2 text-sm font-semibold tabular-nums"
                  disabled={formBusy}
                />
              </div>
            </div>
            <label className="mt-2 block text-[10px] font-bold uppercase text-zinc-500">Formato (opcional)</label>
            <input
              type="text"
              value={newArticleFormat}
              onChange={(e) => setNewArticleFormat(e.target.value)}
              placeholder="ej. PAQUETE 11 ud"
              className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm"
              disabled={formBusy}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                disabled={formBusy}
                onClick={() => setShowAddArticle(false)}
                className="h-9 rounded-lg px-3 text-xs font-semibold text-zinc-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={formBusy}
                onClick={() => void submitNewArticle()}
                className="h-9 rounded-lg bg-[#D32F2F] px-3 text-xs font-bold text-white disabled:opacity-45"
              >
                {formBusy ? '…' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
