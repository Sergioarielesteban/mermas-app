'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart2,
  ChevronDown,
  CheckCircle2,
  FileDown,
  Minus,
  Package,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import ModuleHeader from '@/components/ModuleHeader';
import InventoryResultadoInventario from '@/components/InventoryResultadoInventario';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { downloadInventoryMonthlyPdf, type InventoryPdfRow } from '@/lib/inventory-pdf';
import SupplierProductSearchInput from '@/components/inventory/SupplierProductSearchInput';
import {
  type InventoryCatalogCategory,
  type InventoryCatalogItem,
  type InventoryCostOrigen,
  type InventoryItem,
  type InventoryMonthSnapshot,
  type InventoryUnidadCoste,
  currentInventoryYearMonth,
  deleteInventoryMonthSnapshot,
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
  resolveInventoryItemUnitPriceEur,
  updateInventoryItemLine,
  upsertInventoryMonthSnapshot,
  normalizeInventoryUnidadCoste,
  defaultInventoryUnidadCosteFromStockUnit,
  hydrateInventoryItemsPricingFromOrigin,
} from '@/lib/inventory-supabase';
import { upsertInventoryCostConversion, normalizeConversionUnit } from '@/lib/inventory-cost-conversions-supabase';
import {
  fetchInventorySupplierProductsForSearch,
  fetchSupplierProductRowForInventory,
  suggestKgPerPackFromProductName,
  type InventorySupplierProductSearchRow,
} from '@/lib/inventory-supplier-pricing';
import { fetchEscandalloRecipes, type EscandalloRecipe } from '@/lib/escandallos-supabase';
import { prListActiveRecipes, type ProductionRecipeRow } from '@/lib/production-recipes-supabase';
import { appConfirm } from '@/lib/app-dialog-bridge';
import { confirmDestructiveOperation } from '@/lib/ops-role-confirm';
import { actorLabel, notifyInventarioCerrado } from '@/services/notifications';
import { usePersistedViewState } from '@/hooks/usePersistedViewState';

function parseDecimal(raw: string): number | null {
  const t = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const UNIT_SUFFIX: Record<string, string> = {
  kg: 'kg',
  l: 'L',
  ud: 'ud',
  bolsa: 'bolsa',
  racion: 'ración',
  caja: 'caja',
  paquete: 'paquete',
  bandeja: 'bandeja',
};

/** Coincide con el check de `inventory_items.unit` en Supabase (cantidad en stock). */
const INVENTORY_UNITS = ['kg', 'l', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja'] as const;

const UNIDAD_COSTE_OPTIONS: { value: InventoryUnidadCoste; label: string }[] = [
  { value: 'kg', label: 'kg — precio por kilogramo' },
  { value: 'l', label: 'L — precio por litro' },
  { value: 'ud', label: 'ud — precio por unidad' },
];

/** Presentación; no interviene en el cálculo de € (solo etiqueta). */
const FORMATO_OPERATIVO_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— Sin formato —' },
  { value: 'bandeja', label: 'Bandeja' },
  { value: 'caja', label: 'Caja' },
  { value: 'bolsa', label: 'Bolsa' },
  { value: 'paquete', label: 'Paquete' },
  { value: 'racion', label: 'Ración' },
];

function precioEtiquetaUnidadCoste(uc: InventoryUnidadCoste): string {
  return uc === 'l' ? 'L' : uc;
}

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
  /** Cantidad en esta unidad (bandeja, kg…). */
  unit: string;
  /** Unidad del precio / vínculo con máster (€/kg, €/L, €/ud). */
  unidadCoste: InventoryUnidadCoste;
  /** Presentación informativa (bandeja, caja…). Vacío = null en BD. */
  formatoOperativo: string;
  /** Equivalencia manual: 1 unidad inventario (caja/bandeja/bolsa...) = X unidadCoste. */
  factorConversionManual: string;
  origenCoste: InventoryCostOrigen;
  /** `pedido_supplier_products.id` cuando origen = artículo proveedor. */
  supplierProductId: string;
  escandalloRecipeId: string;
  /** Recetario Cocina Central (solo cocina central). */
  centralProductionRecipeId: string;
  /** Cantidad de salida de la receta por unidad de inventario (ej. 4 para bolsa 4 kg si la receta es €/kg). */
  ccRecipeFormatQty: string;
};

type InventoryViewState = {
  localId: string | null;
  scrollY: number;
  search: string;
  openCategoryIds: string[];
  openItemIds: string[];
  draftByKey: Record<string, LineDraft>;
  catalogQtyDraft: Record<string, string>;
};

function labelOrigenInventario(o: InventoryCostOrigen): string {
  if (o === 'articulo_proveedor') return 'Artículo proveedor';
  if (o === 'produccion_propia') return 'Producción propia (Escandallos)';
  if (o === 'recetario_cc') return 'Producción propia (Recetario Central)';
  return 'Manual';
}

function lineDraftFromRow(row: InventoryItem): LineDraft {
  return {
    qty: String(row.quantity_on_hand),
    price: String(row.price_per_unit),
    name: row.name,
    format_label: row.format_label ?? '',
    unit: row.unit,
    unidadCoste: row.unidadCoste,
    formatoOperativo: row.formatoOperativo ?? '',
    factorConversionManual:
      row.factorConversionManual != null && Number.isFinite(row.factorConversionManual)
        ? String(row.factorConversionManual)
        : '',
    origenCoste: row.origenCoste,
    supplierProductId: row.supplierProductId ?? '',
    escandalloRecipeId: row.escandalloRecipeId ?? '',
    centralProductionRecipeId: row.centralProductionRecipeId ?? '',
    ccRecipeFormatQty:
      row.ccRecipeFormatQty != null && Number.isFinite(row.ccRecipeFormatQty)
        ? String(row.ccRecipeFormatQty)
        : '1',
  };
}

/** Mismo criterio que `fetchInventoryItems`: sort_order, luego nombre. */
function compareInventoryLines(a: InventoryItem, b: InventoryItem): number {
  const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
  if (so !== 0) return so;
  return a.name.localeCompare(b.name, 'es');
}

function lineDraftFromCatalogItem(it: InventoryCatalogItem, qty = '0'): LineDraft {
  return {
    qty,
    price: String(it.default_price_per_unit),
    name: it.name,
    format_label: it.format_label ?? '',
    unit: it.unit,
    unidadCoste: defaultInventoryUnidadCosteFromStockUnit(it.unit),
    formatoOperativo: '',
    factorConversionManual: '',
    origenCoste: 'manual',
    supplierProductId: '',
    escandalloRecipeId: '',
    centralProductionRecipeId: '',
    ccRecipeFormatQty: '1',
  };
}

type MonthClosureComputed = {
  pdfRows: InventoryPdfRow[];
  total: number;
  breakdown: Record<string, number>;
  historyLines: InventoryItem[];
  linesWithStock: number;
};

/** Misma lógica que el PDF/cierre: borradores + filas; detalle PDF solo con cantidad &gt; 0. */
function computeMonthClosurePayload(
  invLines: InventoryItem[],
  draftMap: Record<string, LineDraft>,
  catalogItems: InventoryCatalogItem[],
): MonthClosureComputed {
  const itemToCat = new Map(catalogItems.map((i) => [i.id, i.catalog_category_id]));
  const breakdown: Record<string, number> = {};
  const pdfRows: InventoryPdfRow[] = [];
  const historyLines: InventoryItem[] = [];
  let total = 0;
  let linesWithStock = 0;
  for (const row of invLines) {
    const d = draftMap[row.id] ?? lineDraftFromRow(row);
    const q = parseDecimal(d.qty ?? String(row.quantity_on_hand)) ?? row.quantity_on_hand;
    const p = parseDecimal(d.price ?? String(row.price_per_unit)) ?? row.price_per_unit;
    const sub = Math.round(q * p * 100) / 100;
    total += sub;
    if (q > 0) linesWithStock += 1;
    const uKey = d.unit ?? row.unit;
    const fo = (d.formatoOperativo ?? '').trim();
    const factorConvDraft = parseDecimal(d.factorConversionManual ?? '');
    const flBase = (d.format_label ?? row.format_label ?? '').trim();
    const formatLabelPdf = fo && flBase ? `${flBase} · ${fo}` : fo || flBase;
    if (q > 0) {
      pdfRows.push({
        name: (d.name ?? row.name).trim() || row.name,
        formatLabel: formatLabelPdf,
        qty: q,
        unit: UNIT_SUFFIX[uKey] ?? uKey,
        price: p,
        sub,
      });
    }
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
      unidadCoste: normalizeInventoryUnidadCoste(d.unidadCoste),
      formatoOperativo: fo ? fo : null,
      factorConversionManual:
        factorConvDraft != null && Number.isFinite(factorConvDraft) && factorConvDraft > 0
          ? factorConvDraft
          : null,
    });
  }
  total = Math.round(total * 100) / 100;
  return { pdfRows, total, breakdown, historyLines, linesWithStock };
}

export default function InventarioPage() {
  const {
    localId,
    profileReady,
    localName,
    localCode,
    userId,
    displayName,
    loginUsername,
    profileRole,
    isCentralKitchen,
  } = useAuth();
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
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
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
  const [inventoryEditLocked, setInventoryEditLocked] = useState(false);
  const [busyDeletingCategoryId, setBusyDeletingCategoryId] = useState<string | null>(null);
  const [busyDeletingCatalogItemId, setBusyDeletingCatalogItemId] = useState<string | null>(null);
  const [supplierSearchProducts, setSupplierSearchProducts] = useState<InventorySupplierProductSearchRow[]>([]);
  const [escandalloRecipes, setEscandalloRecipes] = useState<EscandalloRecipe[]>([]);
  const [ccRecipes, setCcRecipes] = useState<ProductionRecipeRow[]>([]);
  const [escandalloRecipeQuery, setEscandalloRecipeQuery] = useState<Record<string, string>>({});
  const loadRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const linesRef = useRef<InventoryItem[]>([]);
  const draftsRef = useRef<Record<string, LineDraft>>({});
  const catalogQtyDraftRef = useRef<Record<string, string>>({});
  const realtimeIgnoreUntilRef = useRef(0);
  const realtimeDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qtyDebounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inventorySaveFlash, setInventorySaveFlash] = useState<string | null>(null);
  const restoreOnceRef = useRef<InventoryViewState | null>(null);
  const didApplyRestoreRef = useRef(false);
  const scrollPersistRafRef = useRef<number | null>(null);
  const { load: loadPersistedViewState, save: savePersistedViewState } =
    usePersistedViewState<InventoryViewState>('inventory', {
      storage: 'local',
      ttlMs: 12 * 60 * 60 * 1000,
    });

  const showInventorySaveFlash = useCallback((msg = 'Guardado') => {
    if (saveFlashTimerRef.current) clearTimeout(saveFlashTimerRef.current);
    setInventorySaveFlash(msg);
    saveFlashTimerRef.current = setTimeout(() => {
      setInventorySaveFlash(null);
      saveFlashTimerRef.current = null;
    }, 2600);
  }, []);

  const buildCurrentViewState = useCallback((): InventoryViewState => {
    const safeScrollY = typeof window !== 'undefined' ? Math.max(0, window.scrollY || 0) : 0;
    return {
      localId: localId ?? null,
      scrollY: safeScrollY,
      search,
      openCategoryIds: Object.keys(openCategories).filter((id) => openCategories[id]),
      openItemIds: Object.keys(catalogDetailOpen).filter((id) => catalogDetailOpen[id]),
      draftByKey: drafts,
      catalogQtyDraft,
    };
  }, [localId, search, openCategories, catalogDetailOpen, drafts, catalogQtyDraft]);

  const persistViewStateNow = useCallback(() => {
    if (!localId) return;
    savePersistedViewState(buildCurrentViewState());
  }, [localId, savePersistedViewState, buildCurrentViewState]);

  linesRef.current = lines;
  draftsRef.current = drafts;
  catalogQtyDraftRef.current = catalogQtyDraft;

  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const scheduleRealtimeReload = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (Date.now() < realtimeIgnoreUntilRef.current) return;
    if (realtimeDebounceTimerRef.current) clearTimeout(realtimeDebounceTimerRef.current);
    realtimeDebounceTimerRef.current = setTimeout(() => {
      realtimeDebounceTimerRef.current = null;
      if (Date.now() < realtimeIgnoreUntilRef.current) return;
      void loadRef.current();
    }, 1100);
  }, []);

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setCategories([]);
      setCatalogItems([]);
      setLines([]);
      setCatalogQtyDraft({});
      setCatalogDetailOpen({});
      setOpenCategories({});
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const [cats, items, invRaw, snaps] = await Promise.all([
        fetchInventoryCatalogCategories(supabase, localId),
        fetchInventoryCatalogItems(supabase, localId),
        fetchInventoryItems(supabase, localId),
        fetchInventoryMonthSnapshots(supabase, localId).catch(() => [] as InventoryMonthSnapshot[]),
      ]);
      const inv = await hydrateInventoryItemsPricingFromOrigin(supabase, localId, invRaw);
      const d: Record<string, LineDraft> = {};
      const cq: Record<string, string> = {};
      for (const row of inv) {
        d[row.id] = lineDraftFromRow(row);
        if (row.catalog_item_id) cq[row.catalog_item_id] = String(row.quantity_on_hand);
      }
      let nextSearch = '';
      let nextOpenItems: Record<string, boolean> = {};
      let nextOpenCategories: Record<string, boolean> = {};
      let nextDrafts = d;
      let nextCatalogQty = cq;
      const pendingRestore = restoreOnceRef.current;
      if (pendingRestore && pendingRestore.localId === localId) {
        nextSearch = pendingRestore.search ?? '';
        const validCategoryIds = new Set(cats.map((c) => c.id));
        const validItemIds = new Set(items.map((it) => it.id));
        nextOpenItems = Object.fromEntries(
          (pendingRestore.openItemIds ?? [])
            .filter((id) => validItemIds.has(id))
            .map((id) => [id, true] as const),
        );
        nextOpenCategories = Object.fromEntries(
          (pendingRestore.openCategoryIds ?? [])
            .filter((id) => validCategoryIds.has(id))
            .map((id) => [id, true] as const),
        );
        const validLineKeys = new Set(inv.map((row) => row.id));
        const mergedDrafts: Record<string, LineDraft> = { ...d };
        for (const [k, v] of Object.entries(pendingRestore.draftByKey ?? {})) {
          if (!v || typeof v !== 'object') continue;
          if (k.startsWith('cat-') || validLineKeys.has(k)) mergedDrafts[k] = v;
        }
        nextDrafts = mergedDrafts;
        nextCatalogQty = { ...cq, ...(pendingRestore.catalogQtyDraft ?? {}) };
      }
      setCategories(cats);
      setCatalogItems(items);
      setLines(inv);
      setSnapshots(snaps);
      setSearch(nextSearch);
      setCatalogDetailOpen(nextOpenItems);
      setOpenCategories(nextOpenCategories);
      setDrafts(nextDrafts);
      setCatalogQtyDraft(nextCatalogQty);
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
      } else if (msg.toLowerCase().includes('unidad_coste') || msg.toLowerCase().includes('formato_operativo')) {
        setBanner(
          'Falta la migración de unidad de coste / formato operativo. Ejecuta en Supabase: supabase-inventory-unidad-coste-formato.sql',
        );
        setCategories([]);
        setCatalogItems([]);
        setLines([]);
        setSnapshots([]);
        setCatalogQtyDraft({});
      } else if (
        msg.toLowerCase().includes('supplier_product_id') ||
        msg.toLowerCase().includes('inventory_cost_conversions')
      ) {
        setBanner(
          'Falta la migración de coste por artículo proveedor. Ejecuta en Supabase: supabase-inventory-supplier-article-cost.sql',
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
    if (!localId) {
      restoreOnceRef.current = null;
      didApplyRestoreRef.current = true;
      return;
    }
    restoreOnceRef.current = loadPersistedViewState();
    didApplyRestoreRef.current = false;
  }, [localId, loadPersistedViewState]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!localId) return;
    persistViewStateNow();
  }, [localId, search, openCategories, catalogDetailOpen, drafts, catalogQtyDraft, persistViewStateNow]);

  useEffect(() => {
    if (typeof window === 'undefined' || !localId) return;
    const onScroll = () => {
      if (scrollPersistRafRef.current != null) return;
      scrollPersistRafRef.current = window.requestAnimationFrame(() => {
        scrollPersistRafRef.current = null;
        persistViewStateNow();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (scrollPersistRafRef.current != null) {
        window.cancelAnimationFrame(scrollPersistRafRef.current);
        scrollPersistRafRef.current = null;
      }
    };
  }, [localId, persistViewStateNow]);

  useEffect(() => {
    if (typeof window === 'undefined' || !localId) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') persistViewStateNow();
    };
    const onPageHide = () => persistViewStateNow();
    const onBeforeUnload = () => persistViewStateNow();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [localId, persistViewStateNow]);

  useEffect(() => {
    if (loading || didApplyRestoreRef.current) return;
    const st = restoreOnceRef.current;
    if (!st || st.localId !== localId || typeof window === 'undefined') {
      didApplyRestoreRef.current = true;
      return;
    }
    didApplyRestoreRef.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: Math.max(0, st.scrollY || 0), behavior: 'auto' });
      });
    });
  }, [loading, localId, categories.length, catalogItems.length, lines.length]);

  useEffect(() => {
    if (!localId || !supabaseOk) {
      setSupplierSearchProducts([]);
      setEscandalloRecipes([]);
      setCcRecipes([]);
      return;
    }
    const supabase = getSupabaseClient()!;
    void (async () => {
      try {
        const [supProds, rec] = await Promise.all([
          fetchInventorySupplierProductsForSearch(supabase, localId),
          fetchEscandalloRecipes(supabase, localId).catch(() => [] as EscandalloRecipe[]),
        ]);
        setSupplierSearchProducts(supProds);
        setEscandalloRecipes(rec);
        if (isCentralKitchen) {
          const cc = await prListActiveRecipes(supabase, localId).catch(() => [] as ProductionRecipeRow[]);
          setCcRecipes(cc);
        } else {
          setCcRecipes([]);
        }
      } catch {
        setSupplierSearchProducts([]);
        setEscandalloRecipes([]);
        setCcRecipes([]);
      }
    })();
  }, [localId, supabaseOk, isCentralKitchen]);

  useEffect(() => {
    if (!localId || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    const ch = supabase
      .channel(`inventory-${localId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_items', filter: `local_id=eq.${localId}` },
        () => scheduleRealtimeReload(),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pedido_supplier_products',
          filter: `local_id=eq.${localId}`,
        },
        () => scheduleRealtimeReload(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [localId, supabaseOk, scheduleRealtimeReload]);

  useEffect(() => {
    return () => {
      for (const t of Object.values(qtyDebounceTimersRef.current)) {
        if (t) clearTimeout(t);
      }
      if (realtimeDebounceTimerRef.current) clearTimeout(realtimeDebounceTimerRef.current);
    };
  }, []);

  const totalValor = useMemo(() => {
    let t = 0;
    for (const row of lines) {
      const d = drafts[row.id] ?? lineDraftFromRow(row);
      const q = parseDecimal(d.qty ?? String(row.quantity_on_hand)) ?? row.quantity_on_hand;
      const p = parseDecimal(d.price ?? String(row.price_per_unit)) ?? row.price_per_unit;
      t += q * p;
    }
    for (const it of catalogItems) {
      if (lines.some((l) => l.catalog_item_id === it.id)) continue;
      const dk = `cat-${it.id}`;
      const d = drafts[dk];
      if (!d) continue;
      const q = parseDecimal(d.qty) ?? 0;
      const p = parseDecimal(d.price) ?? it.default_price_per_unit;
      t += q * p;
    }
    return Math.round(t * 100) / 100;
  }, [lines, drafts, catalogItems]);

  const mergedLinesForCharts = useMemo((): InventoryItem[] => {
    return lines.map((row) => {
      const d = drafts[row.id] ?? lineDraftFromRow(row);
      const q = parseDecimal(d.qty ?? String(row.quantity_on_hand)) ?? row.quantity_on_hand;
      const p = parseDecimal(d.price ?? String(row.price_per_unit)) ?? row.price_per_unit;
      const qR = Math.round(q * 1000) / 1000;
      const pR = Math.round(p * 100) / 100;
      return { ...row, quantity_on_hand: qR, price_per_unit: pR };
    });
  }, [lines, drafts]);

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
    const byCatalogItem = new Map(
      lines.filter((l) => l.catalog_item_id).map((l) => [l.catalog_item_id!, l] as const),
    );
    const totals: Record<string, number> = {};
    const lineSubForCatalogItem = (it: InventoryCatalogItem): number => {
      const line = byCatalogItem.get(it.id);
      if (line) {
        const d = drafts[line.id] ?? lineDraftFromRow(line);
        const q = parseDecimal(d.qty ?? String(line.quantity_on_hand)) ?? line.quantity_on_hand;
        const p = parseDecimal(d.price ?? String(line.price_per_unit)) ?? line.price_per_unit;
        return Math.round(q * p * 100) / 100;
      }
      const dk = `cat-${it.id}`;
      const d = drafts[dk];
      if (!d) return 0;
      const q = parseDecimal(d.qty) ?? 0;
      const p = parseDecimal(d.price) ?? it.default_price_per_unit;
      return Math.round(q * p * 100) / 100;
    };
    for (const cat of categories) {
      const items = itemsByCategory.get(cat.id) ?? [];
      let acc = 0;
      for (const it of items) acc += lineSubForCatalogItem(it);
      totals[cat.id] = Math.round(acc * 100) / 100;
    }
    return totals;
  }, [categories, itemsByCategory, lines, drafts]);

  const searchLower = search.trim().toLowerCase();
  const filteredCatalog = useMemo(() => {
    if (!searchLower) return catalogItems;
    return catalogItems.filter(
      (it) =>
        it.name.toLowerCase().includes(searchLower) ||
        (it.format_label ?? '').toLowerCase().includes(searchLower),
    );
  }, [catalogItems, searchLower]);

  const persistMonthClosure = useCallback(
    async (
      yearMonth: string,
      opts: { recordHistory: boolean; userId: string | null },
      data: MonthClosureComputed,
      linesCountForMeta: number,
      closedAt: Date,
    ) => {
      if (!localId || !supabaseOk) return;
      const supabase = getSupabaseClient()!;
      const { pdfRows, total, breakdown, historyLines, linesWithStock } = data;
      await upsertInventoryMonthSnapshot(supabase, {
        localId,
        yearMonth,
        totalValue: total,
        linesCount: linesCountForMeta,
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
      const closedAtLabel = closedAt.toLocaleString('es-ES', {
        timeZone: 'Europe/Madrid',
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      downloadInventoryMonthlyPdf({
        localLabel: localName ?? localCode ?? '—',
        yearMonth,
        rows: pdfRows,
        total,
        categoryRows,
        linesCount: linesCountForMeta,
        linesWithStock,
        closedAtLabel,
      });
      if (opts.recordHistory) {
        await insertInventoryHistorySnapshot(supabase, {
          localId,
          eventType: 'inventory_final',
          summary: `Inventario terminado (${yearMonth}) — ${linesCountForMeta} línea(s), ${total.toFixed(2)} €`,
          lines: historyLines,
          userId: opts.userId,
        });
      }
      const refreshed = await fetchInventoryMonthSnapshots(supabase, localId).catch(
        () => [] as InventoryMonthSnapshot[],
      );
      setSnapshots(refreshed);
    },
    [localId, supabaseOk, localName, localCode, categories],
  );

  const applyLocalInventoryZero = (inv: InventoryItem[]) => {
    const cleared = inv.map((r) => ({ ...r, quantity_on_hand: 0 }));
    setLines(cleared);
    linesRef.current = cleared;
    const dC: Record<string, LineDraft> = {};
    for (const row of cleared) dC[row.id] = lineDraftFromRow(row);
    setDrafts(dC);
    draftsRef.current = dC;
    const cqC: Record<string, string> = {};
    for (const row of cleared) {
      if (row.catalog_item_id) cqC[row.catalog_item_id] = '0';
    }
    setCatalogQtyDraft(cqC);
    catalogQtyDraftRef.current = cqC;
  };

  const saveLine = async (
    row: InventoryItem,
    override?: Partial<LineDraft>,
    opts?: { skipBusy?: boolean; throwing?: boolean; silent?: boolean },
  ) => {
    if (!localId || !supabaseOk) return;
    const base = draftsRef.current[row.id] ?? lineDraftFromRow(row);
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
    const origen = (d.origenCoste ?? row.origenCoste) ?? 'manual';
    const supplierProductIdRaw =
      origen === 'articulo_proveedor'
        ? (d.supplierProductId?.trim() || row.supplierProductId?.trim() || null)
        : null;
    const factorConvParsed = parseDecimal(d.factorConversionManual ?? '');
    const factorConversionManual =
      factorConvParsed != null && Number.isFinite(factorConvParsed) && factorConvParsed > 0
        ? factorConvParsed
        : null;
    const escId = d.escandalloRecipeId?.trim() ? d.escandalloRecipeId.trim() : null;
    const ccRecipeId = d.centralProductionRecipeId?.trim() ? d.centralProductionRecipeId.trim() : null;
    let ccFormatQty: number | null = null;
    if (origen === 'recetario_cc') {
      const fq = parseDecimal(d.ccRecipeFormatQty ?? '1');
      ccFormatQty = fq != null && fq > 0 ? fq : 1;
    }
    const nm = d.name.trim();
    if (!nm) {
      fail('El nombre no puede estar vacío.');
      return;
    }
    if (!INVENTORY_UNITS.includes(d.unit as (typeof INVENTORY_UNITS)[number])) {
      fail('Unidad no válida.');
      return;
    }
    const uc = normalizeInventoryUnidadCoste(d.unidadCoste);
    const supabase = getSupabaseClient()!;
    if (!opts?.skipBusy) setBusyId(row.id);
    if (!opts?.throwing) setBanner(null);
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
        if (origen === 'articulo_proveedor' && !supplierProductIdRaw) {
          fail('Elige un artículo proveedor.');
          return;
        }
        if (origen === 'produccion_propia' && !escId) {
          fail('Elige una base o subreceta de Escandallos.');
          return;
        }
        if (origen === 'recetario_cc') {
          if (!isCentralKitchen) {
            fail('El Recetario Cocina Central solo aplica en el local de cocina central.');
            return;
          }
          if (!ccRecipeId) {
            fail('Elige una receta del Recetario Cocina Central.');
            return;
          }
        }
        const resolved = await resolveInventoryItemUnitPriceEur(supabase, localId, {
          origenCoste: origen,
          supplierProductId: origen === 'articulo_proveedor' ? supplierProductIdRaw : null,
          escandalloRecipeId: origen === 'produccion_propia' ? escId : null,
          centralProductionRecipeId: origen === 'recetario_cc' ? ccRecipeId : null,
          ccRecipeFormatQty: origen === 'recetario_cc' ? ccFormatQty : null,
          unit: d.unit,
          factorConversionManual: origen === 'articulo_proveedor' ? factorConversionManual : null,
          price_per_unit: row.price_per_unit,
          precioManual: row.precioManual,
        });
        if (resolved == null) {
          fail(
            origen === 'articulo_proveedor'
              ? 'Falta equivalencia: indica cuántos kg/L/ud contiene este formato.'
              : origen === 'recetario_cc'
                ? 'No se pudo obtener el coste de la receta (¿ejecutaste la migración recetario y guardaste la fórmula en CC?).'
                : 'No se pudo calcular el coste desde la receta (revisa el escandallo: ingredientes y unidades).',
          );
          return;
        }
        priceOut = resolved;
        if (!Number.isFinite(priceOut) || priceOut < 0) {
          fail(origen === 'articulo_proveedor' ? 'No se pudo calcular el precio del proveedor.' : 'Precio calculado no válido.');
          return;
        }
      }
      let supplierIdForRow: string | null = null;
      if (origen === 'articulo_proveedor' && supplierProductIdRaw) {
        const spRow = await fetchSupplierProductRowForInventory(supabase, localId, supplierProductIdRaw);
        supplierIdForRow = spRow?.supplier_id ?? row.supplierId ?? null;
        const catU = spRow ? normalizeConversionUnit(spRow.unit) : '';
        const invU = normalizeConversionUnit(d.unit);
        if (
          spRow &&
          catU &&
          invU &&
          catU !== invU &&
          factorConversionManual != null &&
          factorConversionManual > 0
        ) {
          await upsertInventoryCostConversion(supabase, {
            localId,
            supplierProductId: supplierProductIdRaw,
            unidadOrigen: catU,
            unidadDestino: invU,
            factor: factorConversionManual,
          });
        }
      }
      await updateInventoryItemLine(supabase, {
        localId,
        itemId: row.id,
        quantity_on_hand: q,
        price_per_unit: priceOut,
        name: nm,
        format_label: d.format_label.trim() ? d.format_label.trim() : null,
        unit: d.unit,
        unidadCoste: uc,
        formatoOperativo: (d.formatoOperativo ?? '').trim() ? (d.formatoOperativo ?? '').trim() : null,
        factorConversionManual: origen === 'articulo_proveedor' ? factorConversionManual : null,
        origenCoste: origen,
        masterCostSource: 'uso',
        supplierProductId: origen === 'articulo_proveedor' ? supplierProductIdRaw : null,
        supplierId: origen === 'articulo_proveedor' ? supplierIdForRow : null,
        precioUnitarioCalculado: origen === 'articulo_proveedor' ? priceOut : null,
        escandalloRecipeId: origen === 'produccion_propia' ? escId : null,
        centralProductionRecipeId: origen === 'recetario_cc' ? ccRecipeId : null,
        ccRecipeFormatQty: origen === 'recetario_cc' ? ccFormatQty : null,
        precioManual: origen === 'manual' ? precioManual : null,
      });
      const qRounded = Math.round(q * 1000) / 1000;
      const priceRounded = Math.round(priceOut * 100) / 100;
      const fmtOp = (d.formatoOperativo ?? '').trim() ? (d.formatoOperativo ?? '').trim() : null;
      const mergedRow: InventoryItem = {
        ...row,
        quantity_on_hand: qRounded,
        price_per_unit: priceRounded,
        name: nm,
        format_label: d.format_label.trim() ? d.format_label.trim() : null,
        unit: d.unit,
        unidadCoste: uc,
        formatoOperativo: fmtOp,
        factorConversionManual: origen === 'articulo_proveedor' ? factorConversionManual : null,
        origenCoste: origen,
        masterCostSource: 'uso',
        masterArticleId: null,
        supplierProductId: origen === 'articulo_proveedor' ? supplierProductIdRaw : null,
        supplierId: origen === 'articulo_proveedor' ? supplierIdForRow : null,
        precioUnitarioCalculado: origen === 'articulo_proveedor' ? priceRounded : null,
        escandalloRecipeId: origen === 'produccion_propia' ? escId : null,
        centralProductionRecipeId: origen === 'recetario_cc' ? ccRecipeId : null,
        ccRecipeFormatQty: origen === 'recetario_cc' ? ccFormatQty : null,
        precioManual: origen === 'manual' ? priceRounded : null,
      };
      realtimeIgnoreUntilRef.current = Date.now() + 2800;
      setLines((prev) => {
        const next = prev.map((item) => (item.id === row.id ? mergedRow : item));
        linesRef.current = next;
        return next;
      });
      if (!opts?.silent) showInventorySaveFlash();
      setDrafts((prev) => {
        const next = {
          ...prev,
          [row.id]: {
            ...d,
            name: nm,
            price: String(priceOut),
            origenCoste: origen,
            supplierProductId: origen === 'articulo_proveedor' ? supplierProductIdRaw ?? '' : '',
            escandalloRecipeId: origen === 'produccion_propia' ? escId ?? '' : '',
            centralProductionRecipeId: origen === 'recetario_cc' ? ccRecipeId ?? '' : '',
            ccRecipeFormatQty:
              origen === 'recetario_cc' ? String(ccFormatQty ?? 1) : '1',
            unidadCoste: uc,
            formatoOperativo: (d.formatoOperativo ?? '').trim(),
            factorConversionManual:
              origen === 'articulo_proveedor' && factorConversionManual != null
                ? String(factorConversionManual)
                : '',
          },
        };
        draftsRef.current = next;
        return next;
      });
      const catalogId = row.catalog_item_id;
      if (catalogId) {
        setCatalogQtyDraft((prev) => {
          const next = { ...prev, [catalogId]: String(qRounded) };
          catalogQtyDraftRef.current = next;
          return next;
        });
      }
      return mergedRow;
    } catch (e) {
      if (opts?.throwing) throw e;
      setBanner(humanizeClientError(e, 'Error al guardar.'));
      return undefined;
    } finally {
      if (!opts?.skipBusy) setBusyId(null);
    }
  };

  const saveCatalogItemDraft = async (
    it: InventoryCatalogItem,
    line: InventoryItem | null,
    draftKey: string,
    draft: LineDraft,
    opts?: { silent?: boolean },
  ): Promise<InventoryItem | undefined> => {
    if (!localId || !supabaseOk) return undefined;
    if (line) {
      return saveLine(line, draft, { silent: opts?.silent });
    }
    const q = parseDecimal(draft.qty);
    if (q === null || q < 0) {
      setBanner('Cantidad no válida.');
      return undefined;
    }
    const supabase = getSupabaseClient()!;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setBusyId(draftKey);
    setBanner(null);
    try {
      const origen = draft.origenCoste;
      const supplierPid =
        origen === 'articulo_proveedor' && draft.supplierProductId?.trim()
          ? draft.supplierProductId.trim()
          : null;
      const escId = draft.escandalloRecipeId?.trim() ? draft.escandalloRecipeId.trim() : null;
      const ccId = draft.centralProductionRecipeId?.trim() ? draft.centralProductionRecipeId.trim() : null;
      const factorConvParsed = parseDecimal(draft.factorConversionManual ?? '');
      const factorConversionManual =
        factorConvParsed != null && Number.isFinite(factorConvParsed) && factorConvParsed > 0
          ? factorConvParsed
          : null;
      let ccFormatQty: number | null = null;
      if (origen === 'recetario_cc') {
        const fq = parseDecimal(draft.ccRecipeFormatQty ?? '1');
        ccFormatQty = fq != null && fq > 0 ? fq : 1;
      }
      let unitPrice = parseDecimal(draft.price) ?? it.default_price_per_unit;
      const uc = normalizeInventoryUnidadCoste(draft.unidadCoste);
      let precioManual: number | null = null;
      let supplierIdIns: string | null = null;
      if (origen === 'manual') {
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          setBanner('Precio no válido.');
          return undefined;
        }
        precioManual = unitPrice;
      } else {
        if (origen === 'articulo_proveedor' && !supplierPid) {
          setBanner('Elige un artículo proveedor.');
          return undefined;
        }
        if (origen === 'produccion_propia' && !escId) {
          setBanner('Elige una base o subreceta de Escandallos.');
          return undefined;
        }
        if (origen === 'recetario_cc') {
          if (!isCentralKitchen) {
            setBanner('El Recetario Cocina Central solo aplica en cocina central.');
            return undefined;
          }
          if (!ccId) {
            setBanner('Elige una receta del Recetario Cocina Central.');
            return undefined;
          }
        }
        const resolved = await resolveInventoryItemUnitPriceEur(supabase, localId, {
          origenCoste: origen,
          supplierProductId: origen === 'articulo_proveedor' ? supplierPid : null,
          escandalloRecipeId: origen === 'produccion_propia' ? escId : null,
          centralProductionRecipeId: origen === 'recetario_cc' ? ccId : null,
          ccRecipeFormatQty: origen === 'recetario_cc' ? ccFormatQty : null,
          unit: draft.unit,
          factorConversionManual: origen === 'articulo_proveedor' ? factorConversionManual : null,
          price_per_unit: unitPrice,
          precioManual: null,
        });
        if (resolved == null) {
          setBanner(
            origen === 'articulo_proveedor'
              ? 'Falta equivalencia: indica cuántos kg/L/ud contiene este formato.'
              : origen === 'recetario_cc'
                ? 'No se pudo obtener el coste de la receta CC.'
                : 'No se pudo calcular coste desde la receta seleccionada.',
          );
          return undefined;
        }
        unitPrice = resolved;
      }
      if (origen === 'articulo_proveedor' && supplierPid) {
        const spRow = await fetchSupplierProductRowForInventory(supabase, localId, supplierPid);
        supplierIdIns = spRow?.supplier_id ?? null;
        const catU = spRow ? normalizeConversionUnit(spRow.unit) : '';
        const invU = normalizeConversionUnit(draft.unit);
        if (
          spRow &&
          catU &&
          invU &&
          catU !== invU &&
          factorConversionManual != null &&
          factorConversionManual > 0
        ) {
          await upsertInventoryCostConversion(supabase, {
            localId,
            supplierProductId: supplierPid,
            unidadOrigen: catU,
            unidadDestino: invU,
            factor: factorConversionManual,
          });
        }
      }
      const inserted = await insertInventoryLineFromCatalog(supabase, {
        localId,
        catalogItem: it,
        userId: user?.id ?? null,
        initialQuantity: q,
        initialCostConfig: {
          origenCoste: origen,
          masterCostSource: 'uso',
          supplierProductId: origen === 'articulo_proveedor' ? supplierPid : null,
          supplierId: origen === 'articulo_proveedor' ? supplierIdIns : null,
          escandalloRecipeId: origen === 'produccion_propia' ? escId : null,
          centralProductionRecipeId: origen === 'recetario_cc' ? ccId : null,
          ccRecipeFormatQty: origen === 'recetario_cc' ? ccFormatQty : null,
          precioManual,
          pricePerUnit: unitPrice,
          precioUnitarioCalculado: origen === 'articulo_proveedor' ? unitPrice : null,
          name: draft.name,
          unit: draft.unit,
          formatLabel: draft.format_label,
          unidadCoste: uc,
          formatoOperativo: (draft.formatoOperativo ?? '').trim() ? draft.formatoOperativo.trim() : null,
          factorConversionManual: origen === 'articulo_proveedor' ? factorConversionManual : null,
        },
      });
      realtimeIgnoreUntilRef.current = Date.now() + 2800;
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[draftKey];
        next[inserted.id] = lineDraftFromRow(inserted);
        draftsRef.current = next;
        return next;
      });
      setLines((prev) => {
        const next = [...prev, inserted].sort(compareInventoryLines);
        linesRef.current = next;
        return next;
      });
      setCatalogQtyDraft((prev) => {
        const next = { ...prev, [it.id]: String(inserted.quantity_on_hand) };
        catalogQtyDraftRef.current = next;
        return next;
      });
      if (!opts?.silent) showInventorySaveFlash();
      return inserted;
    } catch (e) {
      setBanner(humanizeClientError(e, 'Error al guardar la línea.'));
      return undefined;
    } finally {
      setBusyId(null);
    }
  };

  const flushPendingAndReloadLines = async () => {
    if (!localId || !supabaseOk) throw new Error('Sin conexión.');
    const supabase = getSupabaseClient()!;
    realtimeIgnoreUntilRef.current = Date.now() + 120_000;
    try {
      const snapshotLines = [...linesRef.current];
      for (const row of snapshotLines) {
        const saved = await saveLine(row, undefined, {
          silent: true,
          skipBusy: true,
          throwing: true,
        });
        if (saved) {
          linesRef.current = linesRef.current.map((x) => (x.id === saved.id ? saved : x));
        }
      }
      const lineByCatalog = new Map(
        linesRef.current.filter((l) => l.catalog_item_id).map((l) => [l.catalog_item_id!, l] as const),
      );
      for (const it of catalogItems) {
        if (lineByCatalog.has(it.id)) continue;
        const dk = `cat-${it.id}`;
        const rawQty = (catalogQtyDraftRef.current[it.id] ?? '').trim();
        const draft =
          draftsRef.current[dk] ?? lineDraftFromCatalogItem(it, rawQty || '0');
        const q = parseDecimal(rawQty || draft.qty) ?? 0;
        if (q <= 0) continue;
        const inserted = await saveCatalogItemDraft(it, null, dk, { ...draft, qty: String(q) }, { silent: true });
        if (inserted) lineByCatalog.set(it.id, inserted);
      }
      const invRaw = await fetchInventoryItems(supabase, localId);
      const inv = await hydrateInventoryItemsPricingFromOrigin(supabase, localId, invRaw);
      const d: Record<string, LineDraft> = {};
      const cq: Record<string, string> = {};
      for (const row of inv) {
        d[row.id] = lineDraftFromRow(row);
        if (row.catalog_item_id) cq[row.catalog_item_id] = String(row.quantity_on_hand);
      }
      setLines(inv);
      setDrafts(d);
      setCatalogQtyDraft(cq);
      linesRef.current = inv;
      draftsRef.current = d;
      catalogQtyDraftRef.current = cq;
      return { inv, drafts: d, catalogQty: cq };
    } finally {
      realtimeIgnoreUntilRef.current = Date.now() + 3500;
    }
  };

  const scheduleDebouncedQtySave = (it: InventoryCatalogItem) => {
    if (inventoryEditLocked || !localId || !supabaseOk) return;
    const tkey = it.id;
    const existing = qtyDebounceTimersRef.current[tkey];
    if (existing) clearTimeout(existing);
    qtyDebounceTimersRef.current[tkey] = setTimeout(() => {
      delete qtyDebounceTimersRef.current[tkey];
      const curLine = linesRef.current.find((l) => l.catalog_item_id === it.id) ?? null;
      const dk = curLine ? curLine.id : `cat-${it.id}`;
      const baseDraft =
        draftsRef.current[dk] ??
        (curLine ? lineDraftFromRow(curLine) : lineDraftFromCatalogItem(it, '0'));
      const raw = (catalogQtyDraftRef.current[it.id] ?? '').trim();
      const merged: LineDraft = { ...baseDraft, qty: raw !== '' ? raw : baseDraft.qty };
      void saveCatalogItemDraft(it, curLine, dk, merged, { silent: true });
    }, 700);
  };

  const refreshDraftAutoPrice = async (draftKey: string, draft: LineDraft) => {
    if (!localId || !supabaseOk) return;
    if (draft.origenCoste === 'manual') return;
    const supabase = getSupabaseClient()!;
    let ccFq: number | null = null;
    if (draft.origenCoste === 'recetario_cc') {
      const fq = parseDecimal(draft.ccRecipeFormatQty ?? '1');
      ccFq = fq != null && fq > 0 ? fq : 1;
    }
    const resolved = await resolveInventoryItemUnitPriceEur(supabase, localId, {
      origenCoste: draft.origenCoste,
      supplierProductId:
        draft.origenCoste === 'articulo_proveedor' ? (draft.supplierProductId?.trim() || null) : null,
      escandalloRecipeId: draft.origenCoste === 'produccion_propia' ? (draft.escandalloRecipeId || null) : null,
      centralProductionRecipeId:
        draft.origenCoste === 'recetario_cc' ? (draft.centralProductionRecipeId || null) : null,
      ccRecipeFormatQty: draft.origenCoste === 'recetario_cc' ? ccFq : null,
      unit: draft.unit,
      factorConversionManual:
        draft.origenCoste === 'articulo_proveedor'
          ? (() => {
              const x = parseDecimal(draft.factorConversionManual ?? '');
              return x != null && Number.isFinite(x) && x > 0 ? x : null;
            })()
          : null,
      price_per_unit: parseDecimal(draft.price) ?? 0,
      precioManual: null,
    });
    if (resolved != null) {
      setDrafts((prev) => {
        const next = {
          ...prev,
          [draftKey]: { ...(prev[draftKey] ?? draft), price: String(resolved) },
        };
        draftsRef.current = next;
        return next;
      });
    }
  };

  const applyCategoryBatch = async (catId: string, items: InventoryCatalogItem[]) => {
    if (!localId || !supabaseOk || items.length === 0) return;
    setBusyCategoryId(catId);
    setBanner(null);
    try {
      let workingLines: InventoryItem[] = [...lines];
      let workingDrafts: Record<string, LineDraft> = { ...drafts };
      let savedAny = false;
      for (const it of items) {
        const line = workingLines.find((l) => l.catalog_item_id === it.id) ?? null;
        const draftKey = line ? line.id : `cat-${it.id}`;
        const currentDraft =
          workingDrafts[draftKey] ?? (line ? lineDraftFromRow(line) : lineDraftFromCatalogItem(it, '0'));
        const raw = (catalogQtyDraft[it.id] ?? '').trim();
        const q = raw === '' ? 0 : parseDecimal(raw);
        if (q === null || q < 0) {
          throw new Error(`Cantidad no válida: ${it.name}`);
        }
        const isDefaultDraft =
          currentDraft.origenCoste === 'manual' &&
          !currentDraft.supplierProductId &&
          !currentDraft.escandalloRecipeId &&
          !currentDraft.centralProductionRecipeId &&
          (currentDraft.name.trim() || it.name) === it.name &&
          (currentDraft.format_label ?? '') === (it.format_label ?? '') &&
          (currentDraft.unit || it.unit) === it.unit &&
          normalizeInventoryUnidadCoste(currentDraft.unidadCoste) ===
            defaultInventoryUnidadCosteFromStockUnit(it.unit) &&
          !(currentDraft.formatoOperativo ?? '').trim() &&
          !(currentDraft.factorConversionManual ?? '').trim();
        if (!line && q === 0 && raw === '' && isDefaultDraft) continue;
        const saved = await saveCatalogItemDraft(it, line, draftKey, { ...currentDraft, qty: String(q) }, {
          silent: true,
        });
        if (saved) {
          workingLines = [...workingLines.filter((l) => l.id !== saved.id), saved].sort(compareInventoryLines);
          delete workingDrafts[`cat-${it.id}`];
          workingDrafts[saved.id] = lineDraftFromRow(saved);
          savedAny = true;
        }
      }
      if (savedAny) {
        realtimeIgnoreUntilRef.current = Date.now() + 3500;
        showInventorySaveFlash('Categoría guardada');
      }
    } catch (e) {
      setBanner(humanizeClientError(e, 'Error al guardar la categoría.'));
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
      await flushPendingAndReloadLines();
      const inv = linesRef.current;
      const d = draftsRef.current;
      const data = computeMonthClosurePayload(inv, d, catalogItems);
      await persistMonthClosure(
        closingYearMonth,
        { recordHistory: false, userId: null },
        data,
        inv.length,
        new Date(),
      );
      setBanner(`PDF generado: ${data.total.toFixed(2)} € (mismo total que en pantalla tras guardar pendientes).`);
    } catch (e) {
      setBanner(humanizeClientError(e, 'Error al generar el PDF o guardar el mes.'));
    } finally {
      setPdfBusy(false);
    }
  };

  const resetInventoryCharts = async () => {
    if (!localId || !supabaseOk) return;
    const hasSnap = snapshots.some((s) => s.year_month === closingYearMonth);
    if (!hasSnap) {
      setBanner(`No hay punto guardado en «Valor por mes» para ${closingYearMonth}.`);
      return;
    }
    if (
      !(await appConfirm(
        `¿Quitar solo del gráfico «Valor por mes» el cierre de ${closingYearMonth}? No se borran otros meses ni las líneas de inventario.`,
      ))
    ) {
      return;
    }
    const supabase = getSupabaseClient()!;
    setChartsResetBusy(true);
    setBanner(null);
    try {
      await deleteInventoryMonthSnapshot(supabase, localId, closingYearMonth);
      const refreshed = await fetchInventoryMonthSnapshots(supabase, localId).catch(
        () => [] as InventoryMonthSnapshot[],
      );
      setSnapshots(refreshed);
      setBanner(`Eliminado el punto de ${closingYearMonth} del histórico mensual.`);
    } catch (e) {
      setBanner(humanizeClientError(e, 'Error al actualizar el gráfico mensual.'));
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
      realtimeIgnoreUntilRef.current = Date.now() + 2800;
      setLines((prev) => {
        const next = prev.filter((l) => l.id !== row.id);
        linesRef.current = next;
        return next;
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        draftsRef.current = next;
        return next;
      });
      if (row.catalog_item_id) {
        setCatalogQtyDraft((prev) => {
          const next = { ...prev };
          delete next[row.catalog_item_id!];
          catalogQtyDraftRef.current = next;
          return next;
        });
      }
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
        `Se guardará el cierre de ${closingYearMonth}: primero se guardan todas las cantidades pendientes; luego historial, snapshot y PDF con ese total; después las cantidades pasan a 0 y el inventario queda bloqueado hasta «Reiniciar inventario». ¿Continuar?`,
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
      await flushPendingAndReloadLines();
      const inv = linesRef.current;
      const d = draftsRef.current;
      const data = computeMonthClosurePayload(inv, d, catalogItems);
      const closedAt = new Date();
      await persistMonthClosure(
        closingYearMonth,
        { recordHistory: true, userId: user?.id ?? null },
        data,
        inv.length,
        closedAt,
      );
      void notifyInventarioCerrado(supabase, {
        localId,
        userId: user?.id ?? userId,
        actorName: actorLabel(displayName, loginUsername),
        yearMonth: closingYearMonth,
      });
      for (const row of inv) {
        await updateInventoryItemLine(supabase, {
          localId,
          itemId: row.id,
          quantity_on_hand: 0,
          price_per_unit: row.price_per_unit,
          name: row.name,
          format_label: row.format_label,
          unit: row.unit,
          unidadCoste: row.unidadCoste,
          formatoOperativo: row.formatoOperativo,
          factorConversionManual: row.factorConversionManual,
          origenCoste: row.origenCoste,
          masterCostSource: row.masterCostSource,
          supplierProductId: row.supplierProductId,
          supplierId: row.supplierId,
          precioUnitarioCalculado: row.precioUnitarioCalculado,
          escandalloRecipeId: row.escandalloRecipeId,
          centralProductionRecipeId: row.centralProductionRecipeId,
          ccRecipeFormatQty: row.ccRecipeFormatQty,
          precioManual: row.precioManual,
        });
      }
      applyLocalInventoryZero(inv);
      setInventoryEditLocked(true);
      realtimeIgnoreUntilRef.current = Date.now() + 4000;
      setBanner(
        `Cierre ${closingYearMonth} guardado: PDF ${data.total.toFixed(2)} €. Cantidades a 0; bloqueado hasta «Reiniciar inventario».`,
      );
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
    setInventoryEditLocked(false);
    if (!localId || !supabaseOk) return;
    if (lines.length === 0) {
      setBanner('No hay líneas en el inventario.');
      return;
    }
    const hasSnap = snapshots.some((s) => s.year_month === closingYearMonth);
    if (!hasSnap) {
      const saveFirst = await appConfirm(
        `No hay cierre mensual guardado para ${closingYearMonth} en los gráficos. Pulsa Aceptar para descargar el PDF, guardar ese cierre e historial, y reiniciar cantidades a 0. (Si el inventario es de otro mes, cambia primero «Mes del cierre» arriba.)`,
      );
      if (saveFirst) {
        const supabase = getSupabaseClient()!;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setResetInventoryBusy(true);
        setBanner(null);
        try {
          await flushPendingAndReloadLines();
          const inv0 = linesRef.current;
          const closureData = computeMonthClosurePayload(inv0, draftsRef.current, catalogItems);
          await persistMonthClosure(
            closingYearMonth,
            { recordHistory: true, userId: user?.id ?? null },
            closureData,
            inv0.length,
            new Date(),
          );
          for (const row of inv0) {
            await updateInventoryItemLine(supabase, {
              localId,
              itemId: row.id,
              quantity_on_hand: 0,
              price_per_unit: row.price_per_unit,
              name: row.name,
              format_label: row.format_label,
              unit: row.unit,
              unidadCoste: row.unidadCoste,
              formatoOperativo: row.formatoOperativo,
              factorConversionManual: row.factorConversionManual,
              origenCoste: row.origenCoste,
              masterCostSource: row.masterCostSource,
              supplierProductId: row.supplierProductId,
              supplierId: row.supplierId,
              precioUnitarioCalculado: row.precioUnitarioCalculado,
              escandalloRecipeId: row.escandalloRecipeId,
              centralProductionRecipeId: row.centralProductionRecipeId,
              ccRecipeFormatQty: row.ccRecipeFormatQty,
              precioManual: row.precioManual,
            });
          }
          applyLocalInventoryZero(inv0);
          realtimeIgnoreUntilRef.current = Date.now() + 3500;
          setBanner(`Cierre ${closingYearMonth} guardado y cantidades reiniciadas (se mantiene origen/coste).`);
        } catch (e) {
          setBanner(humanizeClientError(e, 'Error al guardar cierre o reiniciar.'));
        } finally {
          setResetInventoryBusy(false);
        }
        return;
      }
      if (
        !(await appConfirm(
          'Vas a reiniciar cantidades a 0 sin guardar cierre en los informes ni PDF. ¿Continuar de todos modos?',
        ))
      ) {
        return;
      }
    } else if (
      !(await appConfirm(
        'Se pondrán a 0 las cantidades de todas las líneas del inventario. Se mantiene origen, vínculos y configuración de coste. ¿Continuar?',
      ))
    ) {
      return;
    }
    const supabase = getSupabaseClient()!;
    setResetInventoryBusy(true);
    setBanner(null);
    try {
      const snapL = [...lines];
      for (const row of snapL) {
        await updateInventoryItemLine(supabase, {
          localId,
          itemId: row.id,
          quantity_on_hand: 0,
          price_per_unit: row.price_per_unit,
          name: row.name,
          format_label: row.format_label,
          unit: row.unit,
          unidadCoste: row.unidadCoste,
          formatoOperativo: row.formatoOperativo,
          factorConversionManual: row.factorConversionManual,
          origenCoste: row.origenCoste,
          masterCostSource: row.masterCostSource,
          supplierProductId: row.supplierProductId,
          supplierId: row.supplierId,
          precioUnitarioCalculado: row.precioUnitarioCalculado,
          escandalloRecipeId: row.escandalloRecipeId,
          centralProductionRecipeId: row.centralProductionRecipeId,
          ccRecipeFormatQty: row.ccRecipeFormatQty,
          precioManual: row.precioManual,
        });
      }
      applyLocalInventoryZero(snapL);
      realtimeIgnoreUntilRef.current = Date.now() + 3500;
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
      setOpenCategories((prev) => {
        const next = { ...prev };
        delete next[cat.id];
        return next;
      });
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
  const editDisabled = disabled || inventoryEditLocked;

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

      {inventoryEditLocked ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950">
          Cierre registrado: no puedes editar cantidades hasta pulsar «Reiniciar inventario».
        </div>
      ) : null}

      {inventorySaveFlash ? (
        <div
          className="pointer-events-none fixed bottom-4 left-1/2 z-[140] max-w-[min(92vw,18rem)] -translate-x-1/2 rounded-lg border border-emerald-300/80 bg-emerald-950 px-3 py-2 text-center text-[11px] font-semibold text-emerald-50 shadow-lg"
          role="status"
        >
          {inventorySaveFlash}
        </div>
      ) : null}

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : (
        <>
          <section className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white px-3 py-3 ring-1 ring-zinc-100 sm:px-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#D32F2F]/12 text-[#D32F2F]">
                  <Package className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Valor total inventario</p>
                  <p className="text-xl font-extrabold tabular-nums text-zinc-900 sm:text-2xl">{totalValor.toFixed(2)} €</p>
                  <p className="text-[10px] text-zinc-500">{lines.length} línea(s)</p>
                </div>
              </div>
              <div className="flex w-full min-w-0 flex-col gap-2 sm:max-w-xl sm:items-end">
                <label className="flex w-full flex-col gap-0.5 sm:items-end">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Mes del cierre</span>
                  <input
                    type="month"
                    value={closingYearMonth}
                    onChange={(e) => setClosingYearMonth(e.target.value)}
                    disabled={disabled}
                    className="h-9 w-full max-w-[11rem] rounded-lg border border-zinc-200 bg-white px-2 text-sm font-semibold text-zinc-900 shadow-sm disabled:opacity-45 sm:text-right"
                  />
                </label>
                <div className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:justify-end">
                  <button
                    type="button"
                    disabled={editDisabled || lines.length === 0 || finishInventoryBusy || resetInventoryBusy}
                    onClick={() => void finishInventoryToHistory()}
                    className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 text-[11px] font-bold text-emerald-950 shadow-sm disabled:opacity-45"
                  >
                    <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${finishInventoryBusy ? 'animate-pulse' : ''}`} />
                    <span className="truncate">{finishInventoryBusy ? '…' : 'Terminar'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={disabled || lines.length === 0 || resetInventoryBusy || finishInventoryBusy}
                    onClick={() => void resetInventoryClearLines()}
                    className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 text-[11px] font-bold text-amber-950 shadow-sm disabled:opacity-45"
                  >
                    <RotateCcw className={`h-3.5 w-3.5 shrink-0 ${resetInventoryBusy ? 'animate-spin' : ''}`} />
                    <span className="truncate">{resetInventoryBusy ? '…' : 'Reiniciar'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={disabled || pdfBusy || lines.length === 0}
                    onClick={() => void handleDownloadMonthlyPdf()}
                    className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-zinc-900 px-2 text-[11px] font-bold text-white ring-1 ring-zinc-700 disabled:opacity-45"
                  >
                    <FileDown className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{pdfBusy ? 'PDF…' : 'PDF mensual'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={disabled || chartsResetBusy}
                    onClick={() => void resetInventoryCharts()}
                    title="Quita del gráfico «Valor por mes» solo el mes seleccionado arriba"
                    className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-zinc-300 bg-white px-2 text-[11px] font-bold text-zinc-800 shadow-sm disabled:opacity-45"
                  >
                    <BarChart2 className={`h-3.5 w-3.5 shrink-0 ${chartsResetBusy ? 'animate-pulse' : ''}`} />
                    <span className="truncate">{chartsResetBusy ? '…' : 'Gráficos'}</span>
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
                    open={Boolean(openCategories[cat.id])}
                    onToggle={(e) => {
                      const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                      setOpenCategories((prev) => ({ ...prev, [cat.id]: isOpen }));
                    }}
                  >
                    <summary className="cursor-pointer list-none px-2.5 py-2 text-sm font-bold text-zinc-800 [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {cat.name}
                          <span className="ml-1.5 font-normal text-[10px] text-zinc-500 sm:hidden">
                            · {items.length} · {(categoryTotals[cat.id] ?? 0).toFixed(2)} €
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            disabled={
                              editDisabled ||
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
                          <span className="hidden items-center gap-2 text-[10px] font-semibold text-zinc-600 tabular-nums sm:inline-flex">
                            <span>{items.length} líneas</span>
                            <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-bold text-zinc-800">
                              {(categoryTotals[cat.id] ?? 0).toLocaleString('es-ES', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{' '}
                              €
                            </span>
                          </span>
                        </span>
                      </span>
                    </summary>
                    <ul className="space-y-1 border-t border-zinc-100 px-1.5 py-1.5">
                      {items.length === 0 ? (
                        <li className="rounded-lg bg-white px-2 py-4 text-center text-[11px] text-zinc-500 ring-1 ring-zinc-100">
                          Sin artículos en esta categoría. Pulsa «+ Artículo».
                        </li>
                      ) : null}
                      {items.map((it) => {
                        const line = lines.find((l) => l.catalog_item_id === it.id);
                        const draftKey = line ? line.id : `cat-${it.id}`;
                        const qtyBusy = busyCategoryId === cat.id;
                        const qtyValue =
                          catalogQtyDraft[it.id] ?? (line ? String(line.quantity_on_hand) : '');
                        const detailsOpen = Boolean(catalogDetailOpen[it.id]);
                        const lineDraft = drafts[draftKey] ?? (line ? lineDraftFromRow(line) : lineDraftFromCatalogItem(it, qtyValue || '0'));
                        const selectedSupplierProduct =
                          lineDraft.supplierProductId
                            ? supplierSearchProducts.find((p) => p.id === lineDraft.supplierProductId) ?? null
                            : null;
                        const catalogUnitNorm = selectedSupplierProduct
                          ? normalizeConversionUnit(selectedSupplierProduct.unit)
                          : '';
                        const invUnitNorm = normalizeConversionUnit(lineDraft.unit);
                        const suggestedKgHint =
                          selectedSupplierProduct &&
                          catalogUnitNorm === 'caja' &&
                          (invUnitNorm === 'kg' || lineDraft.unidadCoste === 'kg')
                            ? suggestKgPerPackFromProductName(selectedSupplierProduct.name)
                            : null;
                        const showSupplierEquivalence =
                          lineDraft.origenCoste === 'articulo_proveedor' &&
                          selectedSupplierProduct &&
                          catalogUnitNorm &&
                          invUnitNorm &&
                          catalogUnitNorm !== invUnitNorm;
                        const lineBusy = busyId === draftKey || (line ? busyId === line.id : false);
                        const lineSub =
                          Math.round(
                            (parseDecimal(lineDraft.qty) ?? 0) *
                              (parseDecimal(lineDraft.price) ?? 0) *
                              100,
                          ) / 100;
                        const formatoDisplay =
                          (lineDraft.formatoOperativo || '').trim() ||
                          (it.format_label || '').trim() ||
                          '—';
                        const unitDisplay = UNIT_SUFFIX[lineDraft.unit] ?? lineDraft.unit;
                        const priceNum = parseDecimal(lineDraft.price) ?? 0;
                        const priceDisplay = priceNum.toLocaleString('es-ES', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        });
                        return (
                          <li
                            key={it.id}
                            className="rounded-lg border border-zinc-100 bg-white px-1.5 py-1 shadow-sm"
                          >
                            <div className="flex items-start gap-1">
                              <button
                                type="button"
                                className="mt-0.5 shrink-0 rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40"
                                aria-expanded={detailsOpen}
                                aria-label={
                                  detailsOpen ? `Menos detalle: ${it.name}` : `Más detalle: ${it.name}`
                                }
                                disabled={editDisabled}
                                onClick={() =>
                                  setCatalogDetailOpen((prev) => ({
                                    ...prev,
                                    [it.id]: !prev[it.id],
                                  }))
                                }
                              >
                                <ChevronDown
                                  className={`h-3.5 w-3.5 transition-transform duration-200 ${detailsOpen ? 'rotate-180' : ''}`}
                                  aria-hidden
                                />
                              </button>
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-bold leading-tight text-zinc-900">{it.name}</p>
                                <p className="mt-0.5 text-[10px] leading-snug text-zinc-600">
                                  {formatoDisplay} · {priceDisplay} €/{unitDisplay}
                                </p>
                                <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-zinc-800">
                                  Subtotal: {lineSub.toFixed(2)} €
                                </p>
                                {detailsOpen ? (
                                  <p className="mt-1 text-[10px] leading-snug text-zinc-500">
                                    Catálogo ref.: {it.default_price_per_unit.toFixed(2)} €/
                                    {UNIT_SUFFIX[it.unit] ?? it.unit}
                                    {line ? ` · ${labelOrigenInventario(line.origenCoste)}` : ''}
                                  </p>
                                ) : null}
                              </div>
                              <div
                                className="flex shrink-0 items-center gap-0.5"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  disabled={editDisabled || qtyBusy}
                                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-800 disabled:opacity-45"
                                  aria-label={`Menos una unidad de ${it.name}`}
                                  onClick={() => {
                                    const cur = parseDecimal(qtyValue) ?? 0;
                                    const next = Math.max(0, cur - 1);
                                    const s = Number.isInteger(next) ? String(next) : String(next);
                                    setCatalogQtyDraft((prev) => ({ ...prev, [it.id]: s }));
                                    setDrafts((prev) => {
                                      const curD = prev[draftKey] ?? lineDraft;
                                      return { ...prev, [draftKey]: { ...curD, qty: s } };
                                    });
                                    scheduleDebouncedQtySave(it);
                                  }}
                                >
                                  <Minus className="h-3.5 w-3.5" aria-hidden />
                                </button>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  placeholder="0"
                                  aria-label={`Cantidad de ${it.name}`}
                                  value={qtyValue}
                                  disabled={editDisabled || qtyBusy}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setCatalogQtyDraft((prev) => ({ ...prev, [it.id]: v }));
                                    setDrafts((prev) => {
                                      const cur = prev[draftKey] ?? lineDraft;
                                      return { ...prev, [draftKey]: { ...cur, qty: v } };
                                    });
                                    scheduleDebouncedQtySave(it);
                                  }}
                                  className="h-8 w-11 rounded-md border border-zinc-200 px-0.5 text-center text-xs font-semibold tabular-nums"
                                />
                                <button
                                  type="button"
                                  disabled={editDisabled || qtyBusy}
                                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-800 disabled:opacity-45"
                                  aria-label={`Más una unidad de ${it.name}`}
                                  onClick={() => {
                                    const cur = parseDecimal(qtyValue) ?? 0;
                                    const next = cur + 1;
                                    const s = Number.isInteger(next) ? String(next) : String(next);
                                    setCatalogQtyDraft((prev) => ({ ...prev, [it.id]: s }));
                                    setDrafts((prev) => {
                                      const curD = prev[draftKey] ?? lineDraft;
                                      return { ...prev, [draftKey]: { ...curD, qty: s } };
                                    });
                                    scheduleDebouncedQtySave(it);
                                  }}
                                >
                                  <Plus className="h-3.5 w-3.5" aria-hidden />
                                </button>
                              </div>
                            </div>
                            {detailsOpen ? (
                              <div
                                className="mt-2 space-y-3 border-t border-zinc-100 pt-2"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                <>
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                                      {line ? 'Tu línea en inventario' : 'Configurar línea de inventario'}
                                    </p>
                                    <label className="block">
                                  <span className="text-[9px] font-bold uppercase text-zinc-400">Nombre</span>
                                  <input
                                    type="text"
                                    value={lineDraft.name}
                                    disabled={editDisabled || lineBusy || qtyBusy}
                                    onChange={(e) =>
                                      setDrafts((prev) => ({
                                        ...prev,
                                        [draftKey]: { ...lineDraft, name: e.target.value },
                                      }))
                                    }
                                    className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm font-semibold text-zinc-900"
                                  />
                                </label>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                  <label className="min-w-0 flex-1">
                                    <span className="text-[9px] font-bold uppercase text-zinc-400">
                                      Etiqueta / detalle (opc.)
                                    </span>
                                    <input
                                      type="text"
                                      value={lineDraft.format_label}
                                      disabled={editDisabled || lineBusy || qtyBusy}
                                      placeholder="ej. PAQUETE 11 ud"
                                      onChange={(e) =>
                                        setDrafts((prev) => ({
                                          ...prev,
                                          [draftKey]: { ...lineDraft, format_label: e.target.value },
                                        }))
                                      }
                                      className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs text-zinc-800"
                                    />
                                  </label>
                                  <label className="sm:w-36">
                                    <span className="text-[9px] font-bold uppercase text-zinc-400">
                                      Unidad (cantidad)
                                    </span>
                                    <select
                                      value={lineDraft.unit}
                                      disabled={editDisabled || lineBusy || qtyBusy}
                                      onChange={(e) =>
                                        setDrafts((prev) => {
                                          const cur = prev[draftKey] ?? lineDraft;
                                          const nextDraft = { ...cur, unit: e.target.value };
                                          void refreshDraftAutoPrice(draftKey, nextDraft);
                                          return { ...prev, [draftKey]: nextDraft };
                                        })
                                      }
                                      className="mt-0.5 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs font-semibold text-zinc-900"
                                      aria-label="Unidad de cantidad en stock"
                                    >
                                      {INVENTORY_UNITS.map((key) => (
                                        <option key={key} value={key}>
                                          {UNIT_SUFFIX[key] ?? key}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                  <label className="min-w-0 flex-1">
                                    <span className="text-[9px] font-bold uppercase text-zinc-400">
                                      Unidad de coste <span className="text-red-600">*</span>
                                    </span>
                                    <select
                                      value={lineDraft.unidadCoste}
                                      disabled={editDisabled || lineBusy || qtyBusy}
                                      required
                                      onChange={(e) =>
                                        setDrafts((prev) => {
                                          const nextDraft: LineDraft = {
                                            ...lineDraft,
                                            unidadCoste: e.target.value as InventoryUnidadCoste,
                                          };
                                          void refreshDraftAutoPrice(draftKey, nextDraft);
                                          return { ...prev, [draftKey]: nextDraft };
                                        })
                                      }
                                      className="mt-0.5 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs font-semibold text-zinc-900"
                                      aria-required
                                      aria-label="Unidad del precio (coste)"
                                    >
                                      {UNIDAD_COSTE_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="min-w-0 flex-1 sm:max-w-[14rem]">
                                    <span className="text-[9px] font-bold uppercase text-zinc-400">
                                      Formato operativo (opc.)
                                    </span>
                                    <select
                                      value={
                                        FORMATO_OPERATIVO_OPTIONS.some(
                                          (o) => o.value === lineDraft.formatoOperativo,
                                        )
                                          ? lineDraft.formatoOperativo
                                          : ''
                                      }
                                      disabled={editDisabled || lineBusy || qtyBusy}
                                      onChange={(e) =>
                                        setDrafts((prev) => ({
                                          ...prev,
                                          [draftKey]: { ...lineDraft, formatoOperativo: e.target.value },
                                        }))
                                      }
                                      className="mt-0.5 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs text-zinc-800"
                                      aria-label="Formato operativo informativo"
                                    >
                                      {FORMATO_OPERATIVO_OPTIONS.map((opt) => (
                                        <option key={opt.value || 'empty'} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                                <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-2 py-2">
                                  <p className="text-[10px] font-bold uppercase text-zinc-600">Origen del coste</p>
                                  <select
                                    value={lineDraft.origenCoste}
                                    disabled={editDisabled || lineBusy || qtyBusy}
                                    onChange={(e) => {
                                      const v = e.target.value as InventoryCostOrigen;
                                      setDrafts((prev) => {
                                        const cur = prev[draftKey] ?? lineDraft;
                                        const nextDraft: LineDraft = {
                                          ...cur,
                                          origenCoste: v,
                                          supplierProductId:
                                            v === 'articulo_proveedor' ? cur.supplierProductId : '',
                                          escandalloRecipeId: v === 'produccion_propia' ? cur.escandalloRecipeId : '',
                                          centralProductionRecipeId:
                                            v === 'recetario_cc' ? cur.centralProductionRecipeId : '',
                                          ccRecipeFormatQty: v === 'recetario_cc' ? cur.ccRecipeFormatQty : '1',
                                          factorConversionManual:
                                            v === 'articulo_proveedor' ? cur.factorConversionManual : '',
                                        };
                                        void refreshDraftAutoPrice(draftKey, nextDraft);
                                        return {
                                          ...prev,
                                          [draftKey]: nextDraft,
                                        };
                                      });
                                    }}
                                    className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold"
                                  >
                                    <option value="manual">Manual</option>
                                    <option value="articulo_proveedor">Artículo proveedor</option>
                                    <option value="produccion_propia">Producción propia (Escandallos)</option>
                                    <option value="recetario_cc" disabled={!isCentralKitchen}>
                                      Producción propia (Recetario Central){' '}
                                      {!isCentralKitchen ? '— solo cocina central' : ''}
                                    </option>
                                  </select>
                                  {lineDraft.origenCoste === 'articulo_proveedor' ? (
                                    <div className="mt-2 space-y-1">
                                      <p className="text-[9px] font-bold uppercase text-zinc-500">
                                        Buscar artículo proveedor
                                      </p>
                                      <SupplierProductSearchInput
                                        className="mt-0.5"
                                        products={supplierSearchProducts}
                                        value={lineDraft.supplierProductId}
                                        onSelect={(p) => {
                                          setDrafts((prev) => {
                                            const cur =
                                              prev[draftKey] ??
                                              (line
                                                ? lineDraftFromRow(line)
                                                : lineDraftFromCatalogItem(it, qtyValue || '0'));
                                            const nextDraft: LineDraft = { ...cur, supplierProductId: p.id };
                                            const supabase = getSupabaseClient();
                                            if (localId && supabase && nextDraft.origenCoste === 'articulo_proveedor') {
                                              void (async () => {
                                                const resolved = await resolveInventoryItemUnitPriceEur(
                                                  supabase,
                                                  localId,
                                                  {
                                                    origenCoste: 'articulo_proveedor',
                                                    supplierProductId: p.id,
                                                    escandalloRecipeId: null,
                                                    centralProductionRecipeId: null,
                                                    ccRecipeFormatQty: null,
                                                    unit: nextDraft.unit,
                                                    factorConversionManual: (() => {
                                                      const x = parseDecimal(nextDraft.factorConversionManual ?? '');
                                                      return x != null && Number.isFinite(x) && x > 0 ? x : null;
                                                    })(),
                                                    price_per_unit: 0,
                                                    precioManual: null,
                                                  },
                                                );
                                                setDrafts((p2) => ({
                                                  ...p2,
                                                  [draftKey]: {
                                                    ...(p2[draftKey] ?? nextDraft),
                                                    supplierProductId: p.id,
                                                    price:
                                                      resolved != null && Number.isFinite(resolved)
                                                        ? String(Math.round(resolved * 100) / 100)
                                                        : '',
                                                  },
                                                }));
                                              })();
                                            }
                                            return { ...prev, [draftKey]: nextDraft };
                                          });
                                        }}
                                        onClear={() =>
                                          setDrafts((prev) => ({
                                            ...prev,
                                            [draftKey]: { ...(prev[draftKey] ?? lineDraft), supplierProductId: '' },
                                          }))
                                        }
                                        disabled={editDisabled || lineBusy || qtyBusy}
                                      />
                                      {selectedSupplierProduct ? (
                                        <p className="mt-1 text-[10px] leading-snug text-zinc-500">
                                          Precio catálogo:{' '}
                                          {Number.isFinite(selectedSupplierProduct.pricePerUnit)
                                            ? `${selectedSupplierProduct.pricePerUnit.toFixed(2)} €/${UNIT_SUFFIX[selectedSupplierProduct.unit] ?? selectedSupplierProduct.unit}`
                                            : '—'}
                                          {'. '}
                                          Se aplica primero el último precio recibido; si no existe, este precio.
                                        </p>
                                      ) : null}
                                      <p className="text-[10px] font-semibold text-emerald-700">
                                        Precio actualizado automáticamente desde última compra.
                                      </p>
                                      {showSupplierEquivalence ? (
                                        <label className="mt-1 block">
                                          <span className="text-[9px] font-bold uppercase text-zinc-500">
                                            Equivalencia
                                          </span>
                                          <p className="mt-0.5 text-[10px] text-zinc-600">
                                            ¿Cuántos {invUnitNorm} contiene 1 {catalogUnitNorm}?
                                            {suggestedKgHint != null ? (
                                              <span className="block text-zinc-500">
                                                Valor sugerido: {suggestedKgHint} {invUnitNorm}
                                              </span>
                                            ) : null}
                                          </p>
                                          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-zinc-600">
                                            <input
                                              type="text"
                                              inputMode="decimal"
                                              value={lineDraft.factorConversionManual}
                                              disabled={editDisabled || lineBusy || qtyBusy}
                                              placeholder={suggestedKgHint != null ? String(suggestedKgHint) : 'ej. 6'}
                                              onChange={(e) => {
                                                const v = e.target.value;
                                                setDrafts((prev) => {
                                                  const cur = prev[draftKey] ?? lineDraft;
                                                  const next = { ...cur, factorConversionManual: v };
                                                  void refreshDraftAutoPrice(draftKey, next);
                                                  return { ...prev, [draftKey]: next };
                                                });
                                              }}
                                              className="h-8 w-20 rounded border border-zinc-200 px-2 text-[11px]"
                                            />
                                            <span>
                                              {invUnitNorm} por 1 {catalogUnitNorm}
                                            </span>
                                          </div>
                                        </label>
                                      ) : null}
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
                                        value={escandalloRecipeQuery[draftKey] ?? ''}
                                        disabled={editDisabled || lineBusy || qtyBusy}
                                        onChange={(e) =>
                                          setEscandalloRecipeQuery((prev) => ({
                                            ...prev,
                                            [draftKey]: e.target.value,
                                          }))
                                        }
                                        className="h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs"
                                      />
                                      <select
                                        value={lineDraft.escandalloRecipeId}
                                        disabled={editDisabled || lineBusy || qtyBusy}
                                        onChange={(e) =>
                                          setDrafts((prev) => {
                                            const nextDraft: LineDraft = {
                                              ...(prev[draftKey] ?? lineDraft),
                                              escandalloRecipeId: e.target.value,
                                            };
                                            void refreshDraftAutoPrice(draftKey, nextDraft);
                                            return { ...prev, [draftKey]: nextDraft };
                                          })
                                        }
                                        className="h-10 w-full max-h-40 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold"
                                      >
                                        <option value="">— Elegir receta —</option>
                                        {escandalloRecipes
                                          .filter((r) => {
                                            const t = (escandalloRecipeQuery[draftKey] ?? '').trim().toLowerCase();
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
                                  {lineDraft.origenCoste === 'recetario_cc' && isCentralKitchen ? (
                                    <div className="mt-2 space-y-1">
                                      <p className="text-[9px] font-bold uppercase text-zinc-500">
                                        Receta Cocina Central (sin ingredientes visibles)
                                      </p>
                                      <select
                                        value={lineDraft.centralProductionRecipeId}
                                        disabled={editDisabled || lineBusy || qtyBusy}
                                        onChange={(e) =>
                                          setDrafts((prev) => {
                                            const nextDraft: LineDraft = {
                                              ...(prev[draftKey] ?? lineDraft),
                                              centralProductionRecipeId: e.target.value,
                                            };
                                            void refreshDraftAutoPrice(draftKey, nextDraft);
                                            return { ...prev, [draftKey]: nextDraft };
                                          })
                                        }
                                        className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold"
                                      >
                                        <option value="">— Elegir receta CC —</option>
                                        {ccRecipes.map((r) => (
                                          <option key={r.id} value={r.id}>
                                            {r.name} · {r.base_yield_quantity} {r.final_unit}
                                            {r.operative_format_label ? ` · ${r.operative_format_label}` : ''}
                                          </option>
                                        ))}
                                      </select>
                                      <label className="block">
                                        <span className="text-[9px] font-bold uppercase text-zinc-500">
                                          Cantidad formato (× €/ud receta)
                                        </span>
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          placeholder="ej. 4 (bolsa 4 kg)"
                                          value={lineDraft.ccRecipeFormatQty}
                                          disabled={editDisabled || lineBusy || qtyBusy}
                                          onChange={(e) =>
                                            setDrafts((prev) => {
                                              const nextDraft: LineDraft = {
                                                ...(prev[draftKey] ?? lineDraft),
                                                ccRecipeFormatQty: e.target.value,
                                              };
                                              void refreshDraftAutoPrice(draftKey, nextDraft);
                                              return { ...prev, [draftKey]: nextDraft };
                                            })
                                          }
                                          className="mt-0.5 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs"
                                        />
                                      </label>
                                      <p className="text-[10px] leading-snug text-zinc-500">
                                        Precio = coste unitario de la fórmula × esta cantidad (ej. 2 €/kg × 4 kg = 8 € por
                                        bolsa).
                                      </p>
                                    </div>
                                  ) : null}
                                </div>
                                <label className="block sm:max-w-[10rem]">
                                  <span className="text-[9px] font-bold uppercase text-zinc-400">
                                    € / {precioEtiquetaUnidadCoste(lineDraft.unidadCoste)}
                                    {lineDraft.origenCoste !== 'manual' ? ' (auto. al guardar)' : ''}
                                  </span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={lineDraft.price}
                                    disabled={editDisabled || lineBusy || qtyBusy || lineDraft.origenCoste !== 'manual'}
                                    onChange={(e) =>
                                      setDrafts((prev) => ({
                                        ...prev,
                                        [draftKey]: { ...lineDraft, price: e.target.value },
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
                                      disabled={editDisabled || lineBusy || qtyBusy}
                                      onClick={() => void saveCatalogItemDraft(it, line ?? null, draftKey, lineDraft)}
                                      className="h-9 rounded-lg bg-[#D32F2F] px-3 text-xs font-bold text-white disabled:opacity-45"
                                    >
                                      {lineBusy ? '…' : 'Guardar línea'}
                                    </button>
                                    {line ? (
                                      <button
                                        type="button"
                                        disabled={editDisabled || lineBusy || qtyBusy}
                                        onClick={() => void removeLine(line)}
                                        className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-800 disabled:opacity-45"
                                      >
                                        Quitar del inventario
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                                </>
                                <div className="rounded-lg border border-red-100 bg-red-50/50 px-3 py-2.5">
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-red-800/90">
                                    Catálogo de tu local
                                  </p>
                                  <button
                                    type="button"
                                    disabled={
                                      editDisabled ||
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
                            disabled={editDisabled || busyCategoryId === cat.id}
                            onClick={() => void applyCategoryBatch(cat.id, items)}
                            className="h-9 w-full rounded-lg bg-[#D32F2F] text-xs font-bold text-white shadow-sm disabled:opacity-45"
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
            lines={mergedLinesForCharts}
            catalogItems={catalogItems}
            categories={categories}
            yearMonth={closingYearMonth}
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
