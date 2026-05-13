'use client';

import Link from 'next/link';
import { CalendarDays, Filter, Package, Search, Sparkles, Star, TrendingUp } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React from 'react';
import { usePedidosOperationalSuggestions } from '@/hooks/usePedidosOperationalSuggestions';
import { useSuggestedOrder } from '@/hooks/useSuggestedOrder';
import { useTemporalPatterns } from '@/hooks/useTemporalPatterns';
import { useAuth } from '@/components/AuthProvider';
import { usePedidosOrders } from '@/components/PedidosOrdersProvider';
import { getDemoPedidoSuppliers } from '@/lib/demo-dataset';
import { isDemoMode } from '@/lib/demo-mode';
import { uid } from '@/lib/id';
import { appConfirm } from '@/lib/app-dialog-bridge';
import { getSupabaseClient } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { dispatchPedidosDataChanged, usePedidosDataChangedListener } from '@/hooks/usePedidosDataChangedListener';
import {
  coverageDateRangeLabel,
  coverageDaysUntilNextDelivery,
  isDeliveryDateOnConfiguredCycle,
  suggestedOrderQuantityForPar,
  weeklyParScaledToCoverageDays,
} from '@/lib/pedidos-coverage';
import PedidosOperationalSuggestions from '@/components/pedidos/PedidosOperationalSuggestions';
import PedidosNuevoCatalogRow from '@/components/PedidosNuevoCatalogLine';
import PedidosNuevoStickyDock from '@/components/pedidos/PedidosNuevoStickyDock';
import PedidosSaveTemplateSheet from '@/components/pedidos/PedidosSaveTemplateSheet';
import PedidosSuggestedOrderSheet from '@/components/pedidos/PedidosSuggestedOrderSheet';
import PedidosTemporalInsightStrip from '@/components/pedidos/PedidosTemporalInsightStrip';
import PedidosUseTemplateSheet from '@/components/pedidos/PedidosUseTemplateSheet';
import { buildPedidoWhatsappMessage } from '@/lib/pedidos-whatsapp-message';
import { applyQuantityTapDelta, parseQuantityManualInput } from '@/lib/pedidos-order-quantity';
import {
  readSuppliersSessionCache,
  writeSuppliersSessionCache,
} from '@/lib/pedidos-session-cache';
import {
  attachOperationalScrollSave,
  attachOperationalStateListeners,
  clearPersistedScreenState,
  makePersistedScreenStateKey,
  readOperationalScrollY,
  readPersistedScreenState,
  restoreOperationalScrollY,
  writePersistedScreenState,
} from '@/lib/persisted-screen-state';
import {
  fetchPedidoOrderTemplateDetail,
  touchPedidoOrderTemplateUsed,
} from '@/lib/pedidos-order-templates';
import {
  EMPTY_CATALOG_SIGNALS,
  fetchCatalogSignals,
  type CatalogSignals,
} from '@/lib/pedidos-nuevo-catalog-stats';
import {
  fetchSupplierProductFavoriteIdSet,
  setSupplierProductFavorite,
} from '@/lib/pedidos-supplier-favorites';
import {
  fetchOrderById,
  fetchSuppliersWithProducts,
  saveOrder,
  supplierProductHasDistinctBilling,
  unitSupportsReceivedWeightKg,
  type PedidoOrderItem,
  type PedidoOrder,
  type PedidoSupplier,
  type PedidoSupplierProduct,
} from '@/lib/pedidos-supabase';
import { notifyPedidoEnviado } from '@/services/notifications';
import { normalizeWhatsappPhone, openWhatsAppMessage } from '@/lib/whatsapp';

type QtyMap = Record<string, number>;
type CatalogTabId = 'favorites' | 'top' | 'all';

type NuevoPedidoOperationalState = {
  pathname: string;
  searchParams: string;
  localId: string;
  mode: string;
  scrollY: number;
  supplierId: string;
  search: string;
  catalogTab: CatalogTabId;
  useTemplateOpen: boolean;
  saveTemplateOpen: boolean;
  suggestedOrderOpen: boolean;
  deliveryDateFieldError: boolean;
};

const basketSessionKey = (localId: string) => `chefone_pedidos_basket:${localId}`;
const basketLocalKey = (localId: string) => `chefone_pedidos_basket_local:${localId}`;
const JS_DAY_TO_CONSUMPTION_DAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

type StoredBasketDraft = {
  v: 1;
  updatedAt: number;
  supplierId?: string;
  qtyByProductId?: QtyMap;
  notes?: string;
  deliveryDate?: string;
};

function readStoredBasketDraft(localId: string): StoredBasketDraft | null {
  if (typeof window === 'undefined') return null;
  const tryRead = (storage: Storage, key: string): StoredBasketDraft | null => {
    try {
      const raw = storage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredBasketDraft;
      if (!parsed || parsed.v !== 1 || typeof parsed.updatedAt !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const fromSession = tryRead(sessionStorage, basketSessionKey(localId));
  if (fromSession) return fromSession;
  const fromLocal = tryRead(localStorage, basketLocalKey(localId));
  if (fromLocal) {
    try {
      sessionStorage.setItem(basketSessionKey(localId), JSON.stringify(fromLocal));
    } catch {
      /* ignore */
    }
  }
  return fromLocal;
}

function writeStoredBasketDraft(localId: string, draft: Omit<StoredBasketDraft, 'v' | 'updatedAt'>) {
  if (typeof window === 'undefined') return;
  const payload: StoredBasketDraft = {
    v: 1,
    updatedAt: Date.now(),
    ...draft,
  };
  try {
    const json = JSON.stringify(payload);
    sessionStorage.setItem(basketSessionKey(localId), json);
    localStorage.setItem(basketLocalKey(localId), json);
  } catch {
    /* ignore */
  }
}

function clearStoredBasketDraft(localId: string) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(basketSessionKey(localId));
    localStorage.removeItem(basketLocalKey(localId));
  } catch {
    /* ignore */
  }
}

/**
 * Quién solicita el pedido: perfil (`full_name` / vinculación empleado), alias de sesión, email y fallback.
 */
function resolvePedidoRequesterDisplayName(
  displayName: string | null,
  loginUsername: string | null,
  email: string | null,
): string {
  const dn = displayName?.trim();
  if (dn) return dn;
  const lu = loginUsername?.trim();
  if (lu) return lu;
  const em = email?.trim();
  if (em) return em;
  return 'Usuario sin nombre';
}

function buildWhatsappDraftMessage(input: {
  createdAtIso: string;
  deliveryDate: string;
  localName: string;
  requestedBy: string;
  notes: string;
  items: PedidoOrderItem[];
  contentRevisedAfterSent?: boolean;
}) {
  return buildPedidoWhatsappMessage({
    localDisplayName: input.localName || 'CHEF-ONE MATARO',
    fechaPedidoDisplay: new Date(input.createdAtIso).toLocaleDateString('es-ES'),
    fechaEntregaDisplay: input.deliveryDate,
    responsable: input.requestedBy.trim() || '—',
    items: input.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      unit: item.unit,
    })),
    contentRevisedAfterSent: input.contentRevisedAfterSent,
    notes: input.notes?.trim() || undefined,
  });
}

export default function NuevoPedidoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { localCode, localName, localId, email, userId, displayName, loginUsername } = useAuth();
  const requesterResolvedName = React.useMemo(
    () => resolvePedidoRequesterDisplayName(displayName, loginUsername, email),
    [displayName, loginUsername, email],
  );
  const { upsertOrder, orders } = usePedidosOrders();

  const pullNewOrderIntoStore = React.useCallback(
    async (orderId: string) => {
      if (!localId) return;
      const supabase = getSupabaseClient();
      if (!supabase) return;
      for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 300 + attempt * 200));
        try {
          const o = await fetchOrderById(supabase, localId, orderId);
          if (o) {
            upsertOrder(o);
            return;
          }
        } catch {
          /* réplica u error transitorio: reintentar */
        }
      }
    },
    [localId, upsertOrder],
  );
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const editingId = searchParams.get('id');
  const duplicateFrom = searchParams.get('duplicateFrom');
  const templateIdParam = searchParams.get('templateId');
  /** Deep link desde agenda / enlaces: abrir catálogo de ese proveedor (no el primero alfabético). */
  const supplierIdFromUrl = searchParams.get('supplierId');
  const searchString = searchParams.toString();
  const operationalMode = editingId ? `edit:${editingId}` : duplicateFrom ? `duplicate:${duplicateFrom}` : templateIdParam ? `template:${templateIdParam}` : 'create';
  const operationalStateKey = React.useMemo(
    () => makePersistedScreenStateKey('pedidos-nuevo', [localId ?? 'sin-local', operationalMode]),
    [localId, operationalMode],
  );
  const pendingScrollRestoreRef = React.useRef<number | null>(null);
  const restoredOperationalStateRef = React.useRef(false);
  const canPersistOperationalStateRef = React.useRef(false);
  const suppressNextSupplierResetRef = React.useRef(false);
  const [suppliers, setSuppliers] = React.useState<PedidoSupplier[]>([]);
  const [supplierId, setSupplierId] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [qtyByProductId, setQtyByProductId] = React.useState<QtyMap>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [deliveryDate, setDeliveryDate] = React.useState('');
  /** Aviso local junto al campo de fecha de entrega (sin subir la pantalla). */
  const [deliveryDateFieldError, setDeliveryDateFieldError] = React.useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = React.useState(false);
  const [isLoadedEdit, setIsLoadedEdit] = React.useState(false);
  const [existingCreatedAt, setExistingCreatedAt] = React.useState<string | null>(null);
  const [existingSentAt, setExistingSentAt] = React.useState<string | null>(null);
  const [existingOrderId, setExistingOrderId] = React.useState<string | null>(null);
  const [existingOrderUpdatedAt, setExistingOrderUpdatedAt] = React.useState<string | null>(null);
  const [editSourceItems, setEditSourceItems] = React.useState<PedidoOrderItem[] | null>(null);
  const [editBlockedReason, setEditBlockedReason] = React.useState<string | null>(null);
  const [hadContentRevisionFlag, setHadContentRevisionFlag] = React.useState(false);
  const [useTemplateOpen, setUseTemplateOpen] = React.useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = React.useState(false);
  const [suggestedOrderOpen, setSuggestedOrderOpen] = React.useState(false);
  /** Pausa auto-avance del carrusel de sugerencias al interactuar con buscador/cantidades/notas. */
  const [suggestionCarouselEpoch, setSuggestionCarouselEpoch] = React.useState(0);
  const [templateSummary, setTemplateSummary] = React.useState<{
    loaded: number;
    priceUp: number;
    missingCatalog: number;
  } | null>(null);
  const basketDraftRef = React.useRef<Pick<StoredBasketDraft, 'supplierId' | 'qtyByProductId' | 'notes' | 'deliveryDate'>>({
    supplierId: '',
    qtyByProductId: {},
    notes: '',
    deliveryDate: '',
  });

  type BootstrapPedidoPayload = {
    supplierId: string;
    qty: QtyMap;
    lines: Array<{ supplierProductId: string | null; quantity: number }>;
    templateId?: string;
    fromDuplicate?: boolean;
  };
  const bootstrapPedidoRef = React.useRef<BootstrapPedidoPayload | null>(null);
  const bootstrapUrlKeyHandledRef = React.useRef<string | null>(null);
  const bootstrapFetchInflightRef = React.useRef<string | null>(null);

  const clearBasketDraft = React.useCallback(() => {
    if (!localId) return;
    try {
      clearStoredBasketDraft(localId);
      clearPersistedScreenState(makePersistedScreenStateKey('pedidos-nuevo', [localId, 'create']));
    } catch {
      /* ignore */
    }
  }, [localId]);

  const pickSupplierForRows = React.useCallback(
    (rows: PedidoSupplier[], previousId: string) => {
      if (supplierIdFromUrl && rows.some((s) => s.id === supplierIdFromUrl)) {
        return supplierIdFromUrl;
      }
      if (previousId && rows.some((s) => s.id === previousId)) {
        return previousId;
      }
      return rows[0]?.id ?? '';
    },
    [supplierIdFromUrl],
  );

  const resetPedidoFormAfterSuccess = React.useCallback(() => {
    clearBasketDraft();
    setNotes('');
    setQtyByProductId({});
    setSearch('');
    setDeliveryDate('');
    setDeliveryDateFieldError(false);
    setMessage(null);
    setExistingOrderId(null);
    setExistingCreatedAt(null);
    setExistingSentAt(null);
    setExistingOrderUpdatedAt(null);
    setEditSourceItems(null);
    setEditBlockedReason(null);
    setHadContentRevisionFlag(false);
    setIsLoadedEdit(false);
    setSupplierId((sid) => suppliers[0]?.id ?? sid);
    setTemplateSummary(null);
  }, [clearBasketDraft, suppliers]);

  const reloadSuppliers = React.useCallback(() => {
    if (!canUse || !localId) return;
    if (isDemoMode()) {
      const rows = getDemoPedidoSuppliers();
      setSuppliers(rows);
      setSupplierId((prev) => pickSupplierForRows(rows, prev));
      setLoadingSuppliers(false);
      return;
    }
    const lid = localId;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoadingSuppliers(true);
    void fetchSuppliersWithProducts(supabase, lid)
      .then((rows) => {
        setSuppliers(rows);
        setSupplierId((prev) => pickSupplierForRows(rows, prev));
        writeSuppliersSessionCache(lid, rows);
      })
      .catch((err: Error) => setMessage(err.message))
      .finally(() => setLoadingSuppliers(false));
  }, [canUse, localId, pickSupplierForRows]);

  React.useEffect(() => {
    if (!canUse || !localId) return;
    const cached = readSuppliersSessionCache(localId);
    if (cached !== null) {
      setSuppliers(cached);
      setSupplierId((prev) => pickSupplierForRows(cached, prev));
    }
    reloadSuppliers();
  }, [canUse, localId, reloadSuppliers, pickSupplierForRows]);

  /** Restaurar antes del paint para no pisar la cesta con el guardado/reconciliación del primer commit. */
  React.useLayoutEffect(() => {
    if (!canUse || !localId || editingId) return;
    if (searchParams.get('templateId') || searchParams.get('duplicateFrom')) return;
    const urlSupplier = searchParams.get('supplierId');
    try {
      const parsed = readStoredBasketDraft(localId);
      if (!parsed) return;
      // Si la URL fuerza un proveedor (p. ej. agenda), no restaurar otro proveedor ni cantidades de otro catálogo.
      if (parsed.supplierId && !urlSupplier) setSupplierId(parsed.supplierId);
      if (parsed.qtyByProductId && typeof parsed.qtyByProductId === 'object' && !urlSupplier) {
        setQtyByProductId(parsed.qtyByProductId);
      }
      if (typeof parsed.notes === 'string') setNotes(parsed.notes);
      if (typeof parsed.deliveryDate === 'string') setDeliveryDate(parsed.deliveryDate);
    } catch {
      /* ignore */
    }
  }, [canUse, localId, editingId, searchParams]);

  const prevSupplierIdFromUrlRef = React.useRef<string | null>(null);

  /** Al cambiar el proveedor en la URL (p. ej. de un enlace a otro), vaciar cantidades del catálogo anterior. */
  React.useEffect(() => {
    if (!supplierIdFromUrl) {
      prevSupplierIdFromUrlRef.current = null;
      return;
    }
    const prev = prevSupplierIdFromUrlRef.current;
    if (prev !== null && prev !== supplierIdFromUrl) {
      setQtyByProductId({});
    }
    prevSupplierIdFromUrlRef.current = supplierIdFromUrl;
  }, [supplierIdFromUrl]);

  /** Sincronizar proveedor con ?supplierId= cuando ya tenemos la lista cargada (incl. navegación cliente sin refetch). */
  React.useEffect(() => {
    if (!supplierIdFromUrl || suppliers.length === 0) return;
    if (!suppliers.some((s) => s.id === supplierIdFromUrl)) return;
    setSupplierId(supplierIdFromUrl);
  }, [supplierIdFromUrl, suppliers]);

  React.useEffect(() => {
    if (!canUse || !localId || editingId) return;
    basketDraftRef.current = {
      supplierId,
      qtyByProductId,
      notes,
      deliveryDate,
    };
    try {
      writeStoredBasketDraft(localId, {
        supplierId,
        qtyByProductId,
        notes,
        deliveryDate,
      });
    } catch {
      /* ignore */
    }
  }, [canUse, localId, editingId, supplierId, qtyByProductId, notes, deliveryDate]);

  usePedidosDataChangedListener(reloadSuppliers, Boolean(hasPedidosEntry && canUse));

  React.useEffect(() => {
    setSuggestionCarouselEpoch((n) => n + 1);
  }, [search, qtyByProductId, notes, deliveryDate]);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const supplierProducts = React.useMemo(() => selectedSupplier?.products ?? [], [selectedSupplier]);

  const { result: suggestedOrderResult, hasSuggestion } = useSuggestedOrder({
    localId,
    supplierId,
    supplierName: selectedSupplier?.name ?? '',
    supplierProducts,
    orders,
    deliveryDateYmd: deliveryDate,
    deliveryCycleWeekdays: selectedSupplier?.deliveryCycleWeekdays,
    deliveryExceptionDates: selectedSupplier?.deliveryExceptionDates,
  });

  const temporalPatterns = useTemporalPatterns({
    localId,
    supplierId,
    supplierProducts,
    orders,
  });

  React.useEffect(() => {
    setSuggestedOrderOpen(false);
  }, [supplierId]);

  const hasExistingSuggestedBasketQty = React.useMemo(
    () => Object.values(qtyByProductId).some((q) => q > 0),
    [qtyByProductId],
  );

  const applySuggestedOrder = React.useCallback(
    (mode: 'fill_gaps' | 'replace') => {
      if (!suggestedOrderResult.ok) return;
      setQtyByProductId((prev) => {
        const next = { ...prev };
        for (const line of suggestedOrderResult.lines) {
          if (mode === 'fill_gaps') {
            const cur = next[line.supplierProductId] ?? 0;
            if (cur > 0) continue;
            next[line.supplierProductId] = line.suggestedQty;
          } else {
            next[line.supplierProductId] = line.suggestedQty;
          }
        }
        return next;
      });
      setSuggestedOrderOpen(false);
      setSuggestionCarouselEpoch((e) => e + 1);
    },
    [suggestedOrderResult],
  );

  const coverageDays = React.useMemo(() => {
    if (!deliveryDate.trim() || !selectedSupplier) return null;
    return coverageDaysUntilNextDelivery(
      deliveryDate,
      selectedSupplier.deliveryCycleWeekdays ?? [],
      selectedSupplier.deliveryExceptionDates ?? [],
    );
  }, [deliveryDate, selectedSupplier]);

  const coverageRangeLabel = React.useMemo(() => {
    if (!deliveryDate.trim() || coverageDays == null) return null;
    return coverageDateRangeLabel(deliveryDate, coverageDays);
  }, [deliveryDate, coverageDays]);

  const deliveryDayMismatch = React.useMemo(() => {
    if (!deliveryDate.trim() || !selectedSupplier) return false;
    return !isDeliveryDateOnConfiguredCycle(
      deliveryDate,
      selectedSupplier.deliveryCycleWeekdays ?? [],
      selectedSupplier.deliveryExceptionDates ?? [],
    );
  }, [deliveryDate, selectedSupplier]);

  const selectedDateIsException = React.useMemo(() => {
    if (!deliveryDate.trim() || !selectedSupplier) return false;
    return (selectedSupplier.deliveryExceptionDates ?? []).includes(deliveryDate);
  }, [deliveryDate, selectedSupplier]);

  const deliveryChipLabel = React.useMemo(() => {
    if (!deliveryDate.trim()) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deliveryDate.trim());
    if (!m) return null;
    const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tNorm = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tNorm.getTime() === tomorrow.getTime()) return 'Mañana';
    if (tNorm.getTime() === today.getTime()) return 'Hoy';
    return target.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  }, [deliveryDate]);

  /** Siempre «Todos» al abrir / cambiar proveedor (catálogo completo primero). */
  const [catalogTab, setCatalogTab] = React.useState<CatalogTabId>('all');
  const [favoriteIds, setFavoriteIds] = React.useState<Set<string>>(() => new Set());
  const [catalogSignals, setCatalogSignals] = React.useState<CatalogSignals>(EMPTY_CATALOG_SIGNALS);
  React.useEffect(() => {
    setCatalogTab('all');
    setFavoriteIds(new Set());
    setCatalogSignals(EMPTY_CATALOG_SIGNALS);
  }, [supplierId]);

  /** Favoritos y señales (últimos / más usados) solo del proveedor seleccionado — mismo ámbito que `supplierProducts`. */
  React.useEffect(() => {
    if (!localId || !supplierId || !canUse) return;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = getSupabaseClient();
        const [fav, signals] = await Promise.all([
          fetchSupplierProductFavoriteIdSet(supabase, localId, userId, supplierId),
          fetchCatalogSignals(supabase, localId, supplierId),
        ]);
        if (cancelled) return;
        setFavoriteIds(fav);
        setCatalogSignals(signals);
      } catch {
        if (!cancelled) {
          setFavoriteIds(new Set());
          setCatalogSignals(EMPTY_CATALOG_SIGNALS);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [localId, supplierId, canUse, userId]);

  const qSearch = search.trim().toLowerCase();

  const mostOrderedIndex = React.useMemo(
    () => new Map(catalogSignals.mostOrdered30d.map((r, i) => [r.supplierProductId, i])),
    [catalogSignals.mostOrdered30d],
  );
  const recentIndex = React.useMemo(
    () => new Map(catalogSignals.recentProductIds.map((id, i) => [id, i])),
    [catalogSignals.recentProductIds],
  );

  const displayedProducts = React.useMemo(() => {
    const match = (p: PedidoSupplierProduct) => {
      if (!qSearch) return true;
      if (p.name.toLowerCase().includes(qSearch)) return true;
      if (p.articleMasterName?.toLowerCase().includes(qSearch)) return true;
      if (p.articleAliasInterno?.toLowerCase().includes(qSearch)) return true;
      return false;
    };
    const base = supplierProducts.filter(match);

    const sortSmartHabitual = (rows: PedidoSupplierProduct[]) =>
      [...rows].sort((a, b) => {
        const fa = favoriteIds.has(a.id) ? 0 : 1;
        const fb = favoriteIds.has(b.id) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        const ma = mostOrderedIndex.get(a.id) ?? 9999;
        const mb = mostOrderedIndex.get(b.id) ?? 9999;
        if (ma !== mb) return ma - mb;
        const ra = recentIndex.get(a.id) ?? 9999;
        const rb = recentIndex.get(b.id) ?? 9999;
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name, 'es');
      });

    if (catalogTab === 'all') {
      if (qSearch) return [...base].sort((a, b) => a.name.localeCompare(b.name, 'es'));
      return sortSmartHabitual(base);
    }
    if (catalogTab === 'favorites') {
      return base.filter((p) => favoriteIds.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }
    const orderMap = new Map(catalogSignals.mostOrdered30d.map((r, i) => [r.supplierProductId, i]));
    return base
      .filter((p) => orderMap.has(p.id))
      .sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
  }, [
    supplierProducts,
    qSearch,
    catalogTab,
    favoriteIds,
    catalogSignals,
    mostOrderedIndex,
    recentIndex,
  ]);

  const readOperationalState = React.useCallback(() => {
    if (!localId) return null;
    const state = readPersistedScreenState<NuevoPedidoOperationalState>(operationalStateKey);
    if (!state || state.localId !== localId || state.pathname !== pathname || state.mode !== operationalMode) return null;
    return state;
  }, [localId, operationalMode, operationalStateKey, pathname]);

  const saveOperationalState = React.useCallback(() => {
    if (!canUse || !localId || !canPersistOperationalStateRef.current) return;
    const basket = basketDraftRef.current;
    if (!editingId) {
      writeStoredBasketDraft(localId, basket);
    }
    writePersistedScreenState<NuevoPedidoOperationalState>(operationalStateKey, {
      pathname,
      searchParams: searchString,
      localId,
      mode: operationalMode,
      scrollY: readOperationalScrollY(),
      supplierId,
      search,
      catalogTab,
      useTemplateOpen,
      saveTemplateOpen,
      suggestedOrderOpen,
      deliveryDateFieldError,
    });
  }, [
    canUse,
    catalogTab,
    deliveryDateFieldError,
    editingId,
    localId,
    operationalMode,
    operationalStateKey,
    pathname,
    saveTemplateOpen,
    search,
    searchString,
    suggestedOrderOpen,
    supplierId,
    useTemplateOpen,
  ]);

  React.useLayoutEffect(() => {
    if (restoredOperationalStateRef.current) return;
    if (!canUse || !localId || suppliers.length === 0) return;
    restoredOperationalStateRef.current = true;
    const state = readOperationalState();
    if (state) {
      if (!supplierIdFromUrl && suppliers.some((s) => s.id === state.supplierId)) {
        if (state.supplierId !== supplierId) suppressNextSupplierResetRef.current = true;
        setSupplierId(state.supplierId);
      }
      setSearch(state.search);
      setCatalogTab(state.catalogTab);
      setUseTemplateOpen(state.useTemplateOpen);
      setSaveTemplateOpen(state.saveTemplateOpen);
      setSuggestedOrderOpen(state.suggestedOrderOpen);
      setDeliveryDateFieldError(state.deliveryDateFieldError);
      if (state.scrollY > 0) pendingScrollRestoreRef.current = state.scrollY;
    }
    canPersistOperationalStateRef.current = true;
  }, [canUse, localId, readOperationalState, supplierId, supplierIdFromUrl, suppliers]);

  React.useEffect(() => {
    if (!pendingScrollRestoreRef.current || loadingSuppliers) return;
    const y = pendingScrollRestoreRef.current;
    pendingScrollRestoreRef.current = null;
    restoreOperationalScrollY(y);
  }, [displayedProducts.length, loadingSuppliers, supplierProducts.length]);

  React.useEffect(
    () =>
      attachOperationalStateListeners({
        save: saveOperationalState,
        restore: () => {
          const state = readOperationalState();
          if (state?.scrollY && readOperationalScrollY() < 8) restoreOperationalScrollY(state.scrollY);
        },
      }),
    [readOperationalState, saveOperationalState],
  );

  React.useEffect(
    () => attachOperationalScrollSave(saveOperationalState, 180),
    [saveOperationalState],
  );

  React.useEffect(() => {
    saveOperationalState();
  }, [saveOperationalState]);

  const toggleProductFavorite = React.useCallback(
    async (supplierProductId: string) => {
      if (!localId || !userId) {
        setMessage('Inicia sesión para usar favoritos.');
        window.setTimeout(() => setMessage(null), 3200);
        return;
      }
      if (!supplierId) return;
      const supabase = getSupabaseClient();
      const next = !favoriteIds.has(supplierProductId);
      setFavoriteIds((prev) => {
        const n = new Set(prev);
        if (next) n.add(supplierProductId);
        else n.delete(supplierProductId);
        return n;
      });
      try {
        await setSupplierProductFavorite(supabase, localId, userId, supplierId, supplierProductId, next);
      } catch (e) {
        setFavoriteIds((prev) => {
          const n = new Set(prev);
          if (next) n.delete(supplierProductId);
          else n.add(supplierProductId);
          return n;
        });
        setMessage(e instanceof Error ? e.message : 'No se pudo guardar el favorito.');
      }
    },
    [localId, userId, supplierId, favoriteIds],
  );

  React.useEffect(() => {
    if (!editingId) {
      setEditSourceItems(null);
      setEditBlockedReason(null);
      setHadContentRevisionFlag(false);
      setIsLoadedEdit(false);
      return;
    }
    if (!localId) return;
    setExistingOrderUpdatedAt(null);
    setEditBlockedReason(null);
    if (isDemoMode()) {
      const draft = orders.find((o) => o.id === editingId) ?? null;
      if (!draft) {
        setMessage('No se encontró el pedido en la demo.');
        setIsLoadedEdit(true);
        return;
      }
      if (draft.status === 'received') {
        setEditBlockedReason(
          'Este pedido está marcado como recibido. Para ajustarlo usa Recepción o vuelve a «enviado» desde el histórico.',
        );
        setEditSourceItems(null);
        setIsLoadedEdit(true);
        return;
      }
      setEditSourceItems(draft.items);
      setHadContentRevisionFlag(Boolean(draft.contentRevisedAfterSentAt));
      setExistingOrderId(draft.id);
      setSupplierId(draft.supplierId);
      setNotes(draft.notes);
      setDeliveryDate(draft.deliveryDate ?? '');
      setExistingCreatedAt(draft.createdAt);
      setExistingSentAt(draft.sentAt ?? null);
      setExistingOrderUpdatedAt(draft.updatedAt ?? null);
      setQtyByProductId(
        draft.items.reduce<QtyMap>((acc, item) => {
          if (item.supplierProductId) acc[item.supplierProductId] = item.quantity;
          return acc;
        }, {}),
      );
      setIsLoadedEdit(true);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchOrderById(supabase, localId, editingId)
      .then((draft) => {
        if (!draft) {
          setMessage('No se encontro el borrador para editar.');
          setIsLoadedEdit(true);
          return;
        }
        if (draft.status === 'received') {
          setEditBlockedReason(
            'Este pedido está marcado como recibido. Para ajustarlo usa Recepción o vuelve a «enviado» desde el histórico.',
          );
          setEditSourceItems(null);
          setIsLoadedEdit(true);
          return;
        }
        setEditSourceItems(draft.items);
        setHadContentRevisionFlag(Boolean(draft.contentRevisedAfterSentAt));
        setExistingOrderId(draft.id);
        setSupplierId(draft.supplierId);
        setNotes(draft.notes);
        setDeliveryDate(draft.deliveryDate ?? '');
        setExistingCreatedAt(draft.createdAt);
        setExistingSentAt(draft.sentAt ?? null);
        setExistingOrderUpdatedAt(draft.updatedAt ?? null);
        setQtyByProductId(
          draft.items.reduce<QtyMap>((acc, item) => {
            if (item.supplierProductId) acc[item.supplierProductId] = item.quantity;
            return acc;
          }, {}),
        );
        setIsLoadedEdit(true);
      })
      .catch((err: Error) => {
        setMessage(err.message);
        setIsLoadedEdit(true);
      });
  }, [editingId, localId, orders]);

  React.useEffect(() => {
    if (editingId) return;
    if (!localId || !canUse) return;
    const tid = templateIdParam;
    const dup = duplicateFrom;
    if (!tid && !dup) return;
    const key = tid ? `t:${tid}` : `d:${dup}`;
    if (bootstrapUrlKeyHandledRef.current === key) return;
    if (bootstrapFetchInflightRef.current === key) return;
    bootstrapFetchInflightRef.current = key;

    let cancelled = false;
    void (async () => {
      if (tid) {
        const detail = await fetchPedidoOrderTemplateDetail(getSupabaseClient(), localId, tid, isDemoMode());
        if (cancelled) return;
        if (!detail) {
          setMessage('No se encontró la plantilla.');
          bootstrapUrlKeyHandledRef.current = key;
          bootstrapFetchInflightRef.current = null;
          router.replace('/pedidos/nuevo');
          return;
        }
        const qty: QtyMap = {};
        for (const it of detail.items) {
          if (it.supplierProductId) qty[it.supplierProductId] = it.quantity;
        }
        const lines = detail.items.map((i) => ({
          supplierProductId: i.supplierProductId,
          quantity: i.quantity,
        }));
        bootstrapPedidoRef.current = {
          supplierId: detail.supplierId,
          qty,
          lines,
          templateId: tid,
        };
        setSupplierId(detail.supplierId);
        return;
      }
      if (dup) {
        if (isDemoMode()) {
          const src = orders.find((o) => o.id === dup) ?? null;
          if (!src) {
            if (!cancelled) {
              setMessage('Pedido no encontrado para duplicar.');
              bootstrapUrlKeyHandledRef.current = key;
              bootstrapFetchInflightRef.current = null;
              router.replace('/pedidos/nuevo');
            }
            return;
          }
          const qty: QtyMap = {};
          for (const it of src.items) {
            if (it.supplierProductId) qty[it.supplierProductId] = it.quantity;
          }
          const lines = src.items.map((i) => ({
            supplierProductId: i.supplierProductId,
            quantity: i.quantity,
          }));
          bootstrapPedidoRef.current = {
            supplierId: src.supplierId,
            qty,
            lines,
            fromDuplicate: true,
          };
          setSupplierId(src.supplierId);
          return;
        }
        const supabase = getSupabaseClient();
        if (!supabase) {
          setMessage('Sin conexión.');
          return;
        }
        const src = await fetchOrderById(supabase, localId, dup);
        if (cancelled) return;
        if (!src) {
          setMessage('Pedido no encontrado para duplicar.');
          bootstrapUrlKeyHandledRef.current = key;
          bootstrapFetchInflightRef.current = null;
          router.replace('/pedidos/nuevo');
          return;
        }
        const qty: QtyMap = {};
        for (const it of src.items) {
          if (it.supplierProductId) qty[it.supplierProductId] = it.quantity;
        }
        const lines = src.items.map((i) => ({
          supplierProductId: i.supplierProductId,
          quantity: i.quantity,
        }));
        bootstrapPedidoRef.current = {
          supplierId: src.supplierId,
          qty,
          lines,
          fromDuplicate: true,
        };
        setSupplierId(src.supplierId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingId, localId, canUse, templateIdParam, duplicateFrom, orders, router]);

  React.useEffect(() => {
    if (suppressNextSupplierResetRef.current) {
      suppressNextSupplierResetRef.current = false;
    } else {
      setSearch('');
    }
    if (editingId && !isLoadedEdit) return;
    /** Mientras el catálogo del proveedor no está cargado, no reconciliar: si no, prev queda {} y borra la cesta restaurada desde sessionStorage. */
    if (supplierProducts.length === 0) return;
    setQtyByProductId((prev) => {
      const next: QtyMap = {};
      for (const product of supplierProducts) {
        next[product.id] = prev[product.id] ?? 0;
      }
      return next;
    });
  }, [supplierId, supplierProducts, editingId, isLoadedEdit]);

  React.useEffect(() => {
    const b = bootstrapPedidoRef.current;
    if (!b) return;
    if (editingId) return;
    if (supplierId !== b.supplierId) return;
    if (supplierProducts.length === 0) return;

    setQtyByProductId((prev) => {
      const next: QtyMap = {};
      for (const product of supplierProducts) {
        const t = b.qty[product.id];
        next[product.id] = t != null && t > 0 ? t : prev[product.id] ?? 0;
      }
      return next;
    });

    const pmap = new Map(supplierProducts.map((x) => [x.id, x]));
    let missing = 0;
    let priceUp = 0;
    let loaded = 0;
    for (const line of b.lines) {
      if (!line.supplierProductId) continue;
      const p = pmap.get(line.supplierProductId);
      if (!p) {
        missing += 1;
        continue;
      }
      loaded += 1;
      const ult = p.ultimoPrecioRecibido;
      if (ult != null && ult > 0 && p.pricePerUnit > ult * 1.02) priceUp += 1;
    }

    if (b.templateId) {
      setTemplateSummary({ loaded, priceUp, missingCatalog: missing });
      void touchPedidoOrderTemplateUsed(getSupabaseClient(), localId!, b.templateId, isDemoMode());
    } else {
      setTemplateSummary(null);
    }

    bootstrapPedidoRef.current = null;
    const urlKey = templateIdParam ? `t:${templateIdParam}` : duplicateFrom ? `d:${duplicateFrom}` : null;
    if (urlKey) bootstrapUrlKeyHandledRef.current = urlKey;
    bootstrapFetchInflightRef.current = null;
    router.replace('/pedidos/nuevo');
  }, [
    supplierId,
    supplierProducts,
    editingId,
    router,
    templateIdParam,
    duplicateFrom,
    localId,
  ]);

  const setQtyFromInput = React.useCallback((productId: string, unit: PedidoOrderItem['unit'], raw: string) => {
    const parsed = parseQuantityManualInput(unit, raw);
    if (parsed === null) return;
    setQtyByProductId((prev) => ({ ...prev, [productId]: parsed }));
  }, []);

  const adjustQty = React.useCallback((productId: string, unit: PedidoOrderItem['unit'], delta: number) => {
    setQtyByProductId((prev) => {
      const current = prev[productId] ?? 0;
      const next = applyQuantityTapDelta(unit, current, delta);
      return { ...prev, [productId]: next };
    });
  }, []);

  const { suggestions: operationalSuggestions, recordDismiss: recordOperationalDismiss } =
    usePedidosOperationalSuggestions({
      localId,
      supplierId,
      orders,
      supplierProducts,
      qtyByProductId,
      catalogSignals,
      searchActive: search.trim().length > 0,
    });

  const handleCatalogDelta = React.useCallback(
    (productId: string, unit: PedidoOrderItem['unit'], delta: number) => {
      adjustQty(productId, unit, delta);
    },
    [adjustQty],
  );

  const handleCatalogManual = React.useCallback(
    (productId: string, unit: PedidoOrderItem['unit'], raw: string) => {
      setQtyFromInput(productId, unit, raw);
    },
    [setQtyFromInput],
  );

  const handleFavoriteToggle = React.useCallback(
    (productId: string) => {
      void toggleProductFavorite(productId);
    },
    [toggleProductFavorite],
  );

  const existingByProductId = React.useMemo(() => {
    const map = new Map<string, PedidoOrderItem>();
    for (const item of editSourceItems ?? []) {
      if (item.supplierProductId) map.set(item.supplierProductId, item);
    }
    return map;
  }, [editSourceItems]);

  const items: PedidoOrderItem[] = supplierProducts
    .map((p) => {
      const quantity = qtyByProductId[p.id] ?? 0;
      const prev = existingByProductId.get(p.id);
      const lineTotal = Math.round(quantity * p.pricePerUnit * 100) / 100;
      const receivedRaw = prev?.receivedQuantity ?? 0;
      const receivedQuantity =
        quantity <= 0 ? 0 : receivedRaw > 0 ? Math.min(receivedRaw, quantity) : 0;
      const billingSnap =
        prev != null &&
        (prev.billingUnit != null ||
          prev.billingQtyPerOrderUnit != null ||
          prev.pricePerBillingUnit != null)
          ? {
              ...(prev.billingUnit != null ? { billingUnit: prev.billingUnit } : {}),
              ...(prev.billingQtyPerOrderUnit != null
                ? { billingQtyPerOrderUnit: prev.billingQtyPerOrderUnit }
                : {}),
              ...(prev.pricePerBillingUnit != null ? { pricePerBillingUnit: prev.pricePerBillingUnit } : {}),
            }
          : supplierProductHasDistinctBilling(p)
            ? {
                billingUnit: p.billingUnit!,
                ...(p.billingQtyPerOrderUnit != null ? { billingQtyPerOrderUnit: p.billingQtyPerOrderUnit } : {}),
                ...(p.pricePerBillingUnit != null ? { pricePerBillingUnit: p.pricePerBillingUnit } : {}),
              }
            : {};
      return {
        id: p.id,
        supplierProductId: p.id,
        productName: p.name,
        unit: p.unit,
        quantity,
        receivedQuantity,
        pricePerUnit: p.pricePerUnit,
        vatRate: p.vatRate ?? 0,
        lineTotal,
        ...billingSnap,
        ...(unitSupportsReceivedWeightKg(p.unit) && p.estimatedKgPerUnit != null && p.estimatedKgPerUnit > 0
          ? { estimatedKgPerUnit: p.estimatedKgPerUnit }
          : {}),
        ...(prev?.basePricePerUnit != null && Number.isFinite(prev.basePricePerUnit)
          ? { basePricePerUnit: prev.basePricePerUnit }
          : {}),
        receivedWeightKg: prev?.receivedWeightKg ?? null,
        receivedPricePerKg: prev?.receivedPricePerKg ?? null,
        incidentType: prev?.incidentType ?? null,
        incidentNotes: prev?.incidentNotes,
        excludeFromPriceEvolution: Boolean(prev?.excludeFromPriceEvolution),
      };
    })
    .filter((row) => row.quantity > 0);

  const totalBase = items.reduce((acc, row) => acc + row.lineTotal, 0);
  const totalVat = items.reduce((acc, row) => acc + row.lineTotal * row.vatRate, 0);
  const total = totalBase + totalVat;

  const supplierMinimumEuro = selectedSupplier?.minimumOrderEuro ?? null;

  const templateSheetOrder = React.useMemo((): PedidoOrder | null => {
    if (!selectedSupplier || items.length === 0) return null;
    const lineTotalSum =
      Math.round(items.reduce((s, i) => s + i.lineTotal + i.lineTotal * i.vatRate, 0) * 100) / 100;
    return {
      id: existingOrderId ?? 'borrador-local',
      supplierId: selectedSupplier.id,
      supplierName: selectedSupplier.name,
      supplierContact: selectedSupplier.contact,
      status: 'draft',
      notes: notes.trim(),
      createdAt: existingCreatedAt ?? new Date().toISOString(),
      deliveryDate: deliveryDate || undefined,
      items,
      total: lineTotalSum,
      usuarioNombre: requesterResolvedName,
    };
  }, [selectedSupplier, items, notes, existingOrderId, existingCreatedAt, deliveryDate, requesterResolvedName]);

  const scrollToPedidoAcciones = React.useCallback(() => {
    document.getElementById('pedido-nuevo-acciones')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const focusDeliveryDateInput = React.useCallback(() => {
    const el = document.getElementById('pedido-nuevo-fecha-entrega') as HTMLInputElement | null;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
      } catch {
        // ignore
      }
    }
  }, []);
  const openDeliveryDateEditor = React.useCallback(() => {
    scrollToPedidoAcciones();
    window.setTimeout(() => focusDeliveryDateInput(), 280);
  }, [focusDeliveryDateInput, scrollToPedidoAcciones]);

  const scrollToCatalogoNuevo = React.useCallback(() => {
    document.getElementById('pedido-nuevo-catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => document.getElementById('pedido-nuevo-buscar')?.focus(), 280);
  }, []);

  const totalUnitsOrdered = React.useMemo(() => {
    let s = 0;
    for (const p of supplierProducts) {
      const q = qtyByProductId[p.id] ?? 0;
      if (q > 0) s += q;
    }
    return s;
  }, [supplierProducts, qtyByProductId]);

  const saveDraft = (nextStatus: 'draft' | 'sent' = 'draft') => {
    if (!selectedSupplier) {
      setMessage('Selecciona proveedor.');
      return;
    }
    if (items.length === 0) {
      setMessage('Añade al menos un producto.');
      return;
    }
    if (!deliveryDate.trim()) {
      setDeliveryDateFieldError(true);
      setMessage(null);
      openDeliveryDateEditor();
      return;
    }
    if (!localId) {
      setMessage('Perfil del local aún cargando.');
      return;
    }
    const usuarioNombrePersist = requesterResolvedName;
    const editingSent = Boolean(existingSentAt && existingOrderId);
    const effectiveStatus: 'draft' | 'sent' = editingSent ? 'sent' : nextStatus;
    const markContentRevisedAfterSent = editingSent && effectiveStatus === 'sent';

    if (isDemoMode()) {
      const orderId = existingOrderId ?? `demo-order-${uid('o')}`;
      const created = existingCreatedAt ?? new Date().toISOString();
      const lineTotalSum =
        Math.round(items.reduce((s, i) => s + i.lineTotal + i.lineTotal * i.vatRate, 0) * 100) / 100;
      const order: PedidoOrder = {
        id: orderId,
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        supplierContact: selectedSupplier.contact,
        status: effectiveStatus,
        notes: notes.trim(),
        createdAt: created,
        ...(effectiveStatus === 'sent' ? { sentAt: existingSentAt ?? new Date().toISOString() } : {}),
        deliveryDate: deliveryDate || undefined,
        updatedAt: new Date().toISOString(),
        ...(markContentRevisedAfterSent ? { contentRevisedAfterSentAt: new Date().toISOString() } : {}),
        items: items.map((item) => ({
          ...item,
          id: item.id || `demo-li-${uid('i')}`,
        })),
        total: lineTotalSum,
        usuarioNombre: usuarioNombrePersist,
      };
      resetPedidoFormAfterSuccess();
      upsertOrder(order);
      dispatchPedidosDataChanged();
      router.replace(`/pedidos?${markContentRevisedAfterSent ? 'pedido=actualizado' : 'pedido=borrador'}`);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setMessage('Sin conexión con Supabase.');
      return;
    }
    void saveOrder(supabase, localId, {
      orderId: existingOrderId ?? undefined,
      supplierId: selectedSupplier.id,
      status: effectiveStatus,
      notes: notes.trim(),
      createdAt: existingCreatedAt ?? new Date().toISOString(),
      sentAt: effectiveStatus === 'sent' ? existingSentAt ?? new Date().toISOString() : undefined,
      deliveryDate: deliveryDate || undefined,
      expectedOrderUpdatedAt: existingOrderUpdatedAt ?? undefined,
      markContentRevisedAfterSent,
      usuarioNombre: usuarioNombrePersist,
      items: items.map((item) => ({
        supplierProductId: item.supplierProductId,
        productName: item.productName,
        unit: item.unit,
        quantity: item.quantity,
        receivedQuantity: item.receivedQuantity,
        pricePerUnit: item.pricePerUnit,
        vatRate: item.vatRate,
        lineTotal: item.lineTotal,
        estimatedKgPerUnit: item.estimatedKgPerUnit ?? null,
        receivedWeightKg: item.receivedWeightKg ?? null,
        basePricePerUnit: item.basePricePerUnit ?? item.pricePerUnit,
        incidentType: item.incidentType ?? null,
        incidentNotes: item.incidentNotes?.trim() ? item.incidentNotes.trim() : null,
        receivedPricePerKg: item.receivedPricePerKg ?? null,
        billingUnit: item.billingUnit ?? null,
        billingQtyPerOrderUnit: item.billingQtyPerOrderUnit ?? null,
        pricePerBillingUnit: item.pricePerBillingUnit ?? null,
        excludeFromPriceEvolution: Boolean(item.excludeFromPriceEvolution),
      })),
    })
      .then((orderId) => {
        const qp = markContentRevisedAfterSent ? 'pedido=actualizado' : 'pedido=borrador';
        resetPedidoFormAfterSuccess();
        void pullNewOrderIntoStore(orderId);
        dispatchPedidosDataChanged();
        router.replace(`/pedidos?${qp}`);
      })
      .catch((err: Error) => setMessage(err.message));
  };

  const sendToWhatsappInOneStep = () => {
    if (!selectedSupplier) return setMessage('Selecciona proveedor.');
    if (items.length === 0) return setMessage('Añade al menos un producto.');
    if (!localId) return setMessage('Perfil del local aún cargando.');
    if (!deliveryDate.trim()) {
      setDeliveryDateFieldError(true);
      setMessage(null);
      openDeliveryDateEditor();
      return;
    }
    const phone = normalizeWhatsappPhone(selectedSupplier.contact);
    if (!phone) return setMessage('El proveedor no tiene teléfono válido en contacto.');
    const parsed = new Date(`${deliveryDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return setMessage('Fecha de entrega inválida. Usa AAAA-MM-DD.');
    const editingSentWhatsapp = Boolean(existingSentAt && existingOrderId);
    const markRevWhatsapp = editingSentWhatsapp;

    if (isDemoMode()) {
      const orderId = existingOrderId ?? `demo-order-${uid('o')}`;
      const created = existingCreatedAt ?? new Date().toISOString();
      const lineTotalSum =
        Math.round(items.reduce((s, i) => s + i.lineTotal + i.lineTotal * i.vatRate, 0) * 100) / 100;
      const order: PedidoOrder = {
        id: orderId,
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        supplierContact: selectedSupplier.contact,
        status: 'sent',
        notes: notes.trim(),
        createdAt: created,
        sentAt: existingSentAt ?? new Date().toISOString(),
        deliveryDate,
        updatedAt: new Date().toISOString(),
        ...(markRevWhatsapp ? { contentRevisedAfterSentAt: new Date().toISOString() } : {}),
        items: items.map((item) => ({
          ...item,
          id: item.id || `demo-li-${uid('i')}`,
        })),
        total: lineTotalSum,
        usuarioNombre: requesterResolvedName,
      };
      resetPedidoFormAfterSuccess();
      upsertOrder(order);
      dispatchPedidosDataChanged();
      setMessage('Demo: pedido guardado como enviado (no se abre WhatsApp).');
      window.setTimeout(() => setMessage(null), 4000);
      router.replace('/pedidos?pedido=enviado');
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Sin conexión con Supabase.');
    void saveOrder(supabase, localId, {
      orderId: existingOrderId ?? undefined,
      supplierId: selectedSupplier.id,
      status: 'sent',
      notes: notes.trim(),
      createdAt: existingCreatedAt ?? new Date().toISOString(),
      sentAt: existingSentAt ?? new Date().toISOString(),
      deliveryDate,
      expectedOrderUpdatedAt: existingOrderUpdatedAt ?? undefined,
      markContentRevisedAfterSent: markRevWhatsapp,
      usuarioNombre: requesterResolvedName,
      items: items.map((item) => ({
        supplierProductId: item.supplierProductId,
        productName: item.productName,
        unit: item.unit,
        quantity: item.quantity,
        receivedQuantity: item.receivedQuantity,
        pricePerUnit: item.pricePerUnit,
        vatRate: item.vatRate,
        lineTotal: item.lineTotal,
        estimatedKgPerUnit: item.estimatedKgPerUnit ?? null,
        receivedWeightKg: item.receivedWeightKg ?? null,
        basePricePerUnit: item.basePricePerUnit ?? item.pricePerUnit,
        incidentType: item.incidentType ?? null,
        incidentNotes: item.incidentNotes?.trim() ? item.incidentNotes.trim() : null,
        receivedPricePerKg: item.receivedPricePerKg ?? null,
        billingUnit: item.billingUnit ?? null,
        billingQtyPerOrderUnit: item.billingQtyPerOrderUnit ?? null,
        pricePerBillingUnit: item.pricePerBillingUnit ?? null,
        excludeFromPriceEvolution: Boolean(item.excludeFromPriceEvolution),
      })),
    })
      .then((orderId) => {
        const supa = getSupabaseClient();
        if (supa && localId && selectedSupplier) {
          void notifyPedidoEnviado(supa, {
            localId,
            userId,
            actorName: requesterResolvedName,
            supplierName: selectedSupplier.name,
            orderId,
          });
        }
        resetPedidoFormAfterSuccess();
        void pullNewOrderIntoStore(orderId);
        const whatsappMessage = buildWhatsappDraftMessage({
          createdAtIso: existingCreatedAt ?? new Date().toISOString(),
          deliveryDate: parsed.toLocaleDateString('es-ES'),
          localName: localName ?? 'MATARO',
          requestedBy: requesterResolvedName,
          notes: notes.trim(),
          items,
          contentRevisedAfterSent: markRevWhatsapp || Boolean(hadContentRevisionFlag),
        });
        openWhatsAppMessage(phone, whatsappMessage);
        dispatchPedidosDataChanged();
        router.replace('/pedidos?pedido=enviado');
      })
      .catch((err: Error) => {
        setMessage(err.message);
      });
  };

  if (!hasPedidosEntry) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-black text-zinc-900">Modulo no habilitado</p>
        <p className="pt-1 text-sm text-zinc-600">Pedidos esta disponible para los locales de Mataro y Premia.</p>
      </section>
    );
  }
  if (!canUse) {
    return <PedidosPremiaLockedScreen />;
  }

  if (editingId && editBlockedReason) {
    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-100">
          {editBlockedReason}
        </section>
      </div>
    );
  }

  if (editingId && !isLoadedEdit) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-600">Cargando pedido…</p>
      </div>
    );
  }

  return (
    <div className="relative space-y-1.5 pb-[5.85rem] sm:space-y-2 sm:pb-[6.35rem]">
      {existingSentAt && editingId ? (
        <section
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950 ring-1 ring-amber-100"
          role="status"
        >
          <p>Este pedido ya fue enviado. Puedes modificarlo y volver a enviarlo.</p>
          {hadContentRevisionFlag ? (
            <p className="mt-1.5 font-bold uppercase tracking-wide text-amber-900">Modificado tras envío</p>
          ) : null}
        </section>
      ) : null}

      {!editingId && templateSummary ? (
        <section
          className="rounded-xl border border-emerald-200/90 bg-emerald-50/90 px-3 py-2 text-[11px] leading-snug text-emerald-950 ring-1 ring-emerald-100"
          role="status"
        >
          <p className="font-bold text-emerald-900">Plantilla aplicada</p>
          <p className="mt-1 text-emerald-900/90">
            <span className="font-semibold">{templateSummary.loaded}</span> productos en catálogo con cantidades.
            {templateSummary.priceUp > 0 ? (
              <>
                {' '}
                · <span className="font-semibold text-amber-800">{templateSummary.priceUp}</span> con precio catálogo por
                encima del último recibido (&gt;2%).
              </>
            ) : null}
            {templateSummary.missingCatalog > 0 ? (
              <>
                {' '}
                · <span className="font-semibold text-rose-800">{templateSummary.missingCatalog}</span> no están activos
                en catálogo (revisa proveedor).
              </>
            ) : null}
          </p>
        </section>
      ) : null}

      {!editingId ? (
        <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/85">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-2 py-2 sm:px-3">
            <Link
              href="/pedidos"
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              ←
            </Link>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() =>
                  document.getElementById('pedido-nuevo-acciones')?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  })
                }
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#25D366] hover:bg-emerald-50"
                aria-label="Ir a enviar por WhatsApp"
              >
                <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setUseTemplateOpen(true)}
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-[#E30613]/35 bg-[#FFF8F7] px-2.5 text-[11px] font-bold text-[#7F1D1D] shadow-sm ring-1 ring-[#E30613]/15 hover:bg-[#FFF0EE] sm:px-3"
              >
                Plantilla
              </button>
            </div>
          </div>
          <div className="bg-[#FAFAF9] px-3 pb-2.5 pt-2.5">
            <label htmlFor="pedido-nuevo-proveedor" className="sr-only">
              Proveedor
            </label>
            {loadingSuppliers ? (
              <p className="mb-2 text-center text-[10px] font-semibold text-zinc-500">Cargando catálogo…</p>
            ) : null}
            <div className="mx-auto w-full max-w-lg">
              <select
                id="pedido-nuevo-proveedor"
                value={supplierId}
                disabled={Boolean(existingSentAt && existingOrderId)}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full cursor-pointer appearance-none truncate rounded-xl border border-zinc-200 bg-white bg-[length:0.95rem] bg-[position:right_0.65rem_center] bg-no-repeat py-2.5 pl-10 pr-10 text-center text-[15px] font-bold leading-tight text-zinc-900 shadow-sm outline-none ring-1 ring-zinc-100/80 [text-align-last:center] disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
                style={{
                  textAlign: 'center',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2371717a'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                }}
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-zinc-200/85">
          <label htmlFor="pedido-nuevo-proveedor-edit" className="sr-only">
            Proveedor
          </label>
          {loadingSuppliers ? <p className="text-[11px] font-semibold text-zinc-500">Cargando catálogo…</p> : null}
          <div className="mx-auto mt-1 w-full max-w-lg">
            <select
              id="pedido-nuevo-proveedor-edit"
              value={supplierId}
              disabled={Boolean(existingSentAt && existingOrderId)}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full cursor-pointer appearance-none truncate rounded-xl border border-zinc-200 bg-white bg-[length:1rem] bg-[position:right_0.65rem_center] bg-no-repeat py-2.5 pl-10 pr-10 text-center text-[15px] font-bold leading-tight text-zinc-900 outline-none [text-align-last:center] disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
              style={{
                textAlign: 'center',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2371717a'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
              }}
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      <section
        id="pedido-nuevo-catalogo"
        className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/85"
      >
        {selectedSupplier && supplierProducts.length > 0 ? (
          <div className="flex items-end gap-0 overflow-x-auto border-b border-zinc-100 px-1.5 pt-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-2.5">
            {(
              [
                ['favorites', 'Favoritos', Star],
                ['top', 'Más usados', TrendingUp],
                ['all', 'Todos', Package],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setCatalogTab(id)}
                className={[
                  'inline-flex shrink-0 items-center gap-0.5 border-b-2 px-2 pb-2 pt-0.5 text-[10px] font-semibold transition-colors active:opacity-90 sm:gap-1 sm:px-2.5 sm:text-[11px]',
                  catalogTab === id
                    ? 'border-[#E30613] text-[#E30613]'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700',
                ].join(' ')}
              >
                <Icon className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" strokeWidth={2} aria-hidden />
                {label}
              </button>
            ))}
            {hasSuggestion ? (
              <button
                type="button"
                onClick={() => setSuggestedOrderOpen(true)}
                className="inline-flex shrink-0 items-center gap-0.5 border-b-2 border-transparent px-2 pb-2 pt-0.5 text-[10px] font-semibold text-[#E30613] transition-colors hover:text-[#c50512] active:opacity-90 sm:gap-1 sm:px-2.5 sm:text-[11px]"
              >
                <Sparkles className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" strokeWidth={2} aria-hidden />
                Pedido sugerido
              </button>
            ) : null}
          </div>
        ) : null}
        {selectedSupplier && supplierProducts.length > 0 ? (
          <PedidosTemporalInsightStrip patterns={temporalPatterns} hidden={search.trim().length > 0} />
        ) : null}
        {selectedSupplier && supplierProducts.length > 0 ? (
          <PedidosOperationalSuggestions
            suggestions={operationalSuggestions}
            onDismiss={recordOperationalDismiss}
            interactionEpoch={suggestionCarouselEpoch}
          />
        ) : null}
        {selectedSupplier && supplierProducts.length > 0 ? (
          <div className="border-b border-zinc-100 bg-white px-2.5 pb-1.5 pt-1.5 sm:px-3">
            <div className="flex gap-1.5">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                  aria-hidden
                />
                <input
                  id="pedido-nuevo-buscar"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar producto…"
                  className="h-9 w-full rounded-lg border-0 bg-zinc-50 py-1.5 pl-9 pr-2.5 text-[13px] text-zinc-900 shadow-inner shadow-zinc-100 ring-1 ring-zinc-200/70 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-[#E30613]/20"
                />
              </div>
              <button
                type="button"
                className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-lg border border-zinc-200 bg-white px-2 text-[10px] font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 sm:gap-1 sm:px-2.5 sm:text-[11px]"
                aria-label="Filtros (próximamente)"
              >
                <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                <span className="hidden sm:inline">Filtros</span>
              </button>
            </div>
            <button
              type="button"
              onClick={openDeliveryDateEditor}
              className={[
                'mt-1.5 inline-flex h-8 w-full items-center justify-between gap-2 rounded-lg border px-2.5 text-left shadow-sm ring-1',
                deliveryDate.trim()
                  ? 'border-zinc-200 bg-white text-zinc-700 ring-zinc-100'
                  : 'border-[#E30613]/30 bg-[#FFF5F5] text-[#B42318] ring-[#E30613]/10',
              ].join(' ')}
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate text-[11px] font-semibold">
                  {deliveryDate.trim() && deliveryChipLabel ? `Entrega: ${deliveryChipLabel}` : 'Falta fecha de entrega'}
                </span>
              </span>
              <span className="text-[10px] font-semibold text-zinc-500">Editar</span>
            </button>
          </div>
        ) : null}
        <div className="divide-y divide-zinc-100 border-t border-zinc-100">
          {selectedSupplier && supplierProducts.length === 0 ? (
            <p className="px-3 py-4 text-sm text-zinc-500">Este proveedor no tiene productos activos. Revísalo en Proveedores.</p>
          ) : null}
          {selectedSupplier && supplierProducts.length > 0 && displayedProducts.length === 0 ? (
            <p className="mx-3 my-3 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/90 px-2.5 py-2 text-center text-[12px] leading-snug text-zinc-600">
              {catalogTab === 'favorites'
                ? 'Sin favoritos. Abre «Todos» y pulsa la estrella.'
                : catalogTab === 'top'
                  ? 'Sin datos de pedidos en los últimos 30 días.'
                  : qSearch
                    ? 'Ningún producto coincide con la búsqueda.'
                    : 'Sin productos que mostrar.'}
            </p>
          ) : null}
          {displayedProducts.map((p) => {
            const qty = qtyByProductId[p.id] ?? 0;
            const lineTotal = Math.round(qty * p.pricePerUnit * 100) / 100;
            const planTodayKey = JS_DAY_TO_CONSUMPTION_DAY[new Date().getDay()];
            const advancedSegment =
              p.consumptionPlan?.mode === 'advanced'
                ? (p.consumptionPlan.segments ?? []).find((segment) => segment.order_day === planTodayKey)
                : null;
            const advancedTargetQty =
              advancedSegment && Number.isFinite(advancedSegment.target_quantity)
                ? Math.max(0, Number(advancedSegment.target_quantity))
                : null;
            const segmentTarget =
              advancedTargetQty != null
                ? advancedTargetQty
                : coverageDays != null
                  ? weeklyParScaledToCoverageDays(p.parStock ?? 0, coverageDays)
                  : null;
            const suggestedQty = segmentTarget != null ? suggestedOrderQuantityForPar(p.unit, segmentTarget) : null;
            const sig = catalogSignals.lastReceptionByProductId[p.id];
            return (
              <PedidosNuevoCatalogRow
                key={p.id}
                product={p}
                qty={qty}
                lineTotal={lineTotal}
                suggestedQty={coverageDays != null && suggestedQty != null ? suggestedQty : null}
                receptionQty={sig?.lastQty}
                receptionAtIso={sig?.lastAt}
                receptionUnitPrice={sig?.lastReceivedUnitPrice}
                isFavorite={Boolean(userId && favoriteIds.has(p.id))}
                favoriteDisabled={!userId}
                onAdjustDelta={handleCatalogDelta}
                onManualChange={handleCatalogManual}
                onFavoriteToggle={handleFavoriteToggle}
              />
            );
          })}
        </div>
      </section>

      <section className="rounded-xl bg-white p-3 ring-1 ring-zinc-200/90">
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Notas</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
          placeholder="Observaciones del pedido..."
        />
      </section>

      <section
        id="pedido-nuevo-acciones"
        className="rounded-xl border border-zinc-200/90 bg-white p-2.5 ring-1 ring-zinc-100 scroll-mt-24"
      >
        <p className="mb-2 text-[10px] leading-snug text-zinc-600">
          Pedido realizado por:{' '}
          <span className="font-bold text-zinc-900">{requesterResolvedName}</span>
        </p>
        <div className="mb-2">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">Fecha de entrega</p>
          <div
            className={[
              'relative mt-1 flex min-h-[2.75rem] w-full min-w-0 items-center rounded-xl border bg-white transition-[border-color,box-shadow]',
              deliveryDateFieldError
                ? 'border-red-400 bg-red-50/90 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.35)]'
                : [
                    'border-zinc-300 shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
                    'focus-within:border-zinc-400 focus-within:shadow-[0_0_0_3px_rgba(24,24,27,0.06),0_1px_2px_rgba(0,0,0,0.04)]',
                  ].join(' '),
            ].join(' ')}
          >
            <input
              id="pedido-nuevo-fecha-entrega"
              type="date"
              value={deliveryDate}
              aria-invalid={deliveryDateFieldError}
              aria-describedby={deliveryDateFieldError ? 'pedido-nuevo-fecha-entrega-aviso' : undefined}
              onChange={(e) => {
                setDeliveryDate(e.target.value);
                setDeliveryDateFieldError(false);
              }}
              aria-label="Fecha de entrega del pedido"
              className={[
                'relative z-[1] box-border min-h-[2.75rem] w-full min-w-0 flex-1 cursor-pointer rounded-xl border-0 bg-transparent px-3 py-2 pr-10 text-sm font-medium outline-none ring-0 [color-scheme:light]',
                '[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-55 [&::-webkit-calendar-picker-indicator]:hover:opacity-90',
                deliveryDate ? 'text-zinc-900' : 'text-transparent',
              ].join(' ')}
            />
            {!deliveryDate ? (
              <span className="pointer-events-none absolute left-3 top-1/2 z-0 max-w-[calc(100%-3rem)] -translate-y-1/2 truncate text-sm text-zinc-500">
                Elegir fecha
              </span>
            ) : null}
          </div>
          {deliveryDateFieldError ? (
            <p id="pedido-nuevo-fecha-entrega-aviso" className="mt-1.5 text-xs font-semibold text-red-700">
              Selecciona fecha de entrega para continuar
            </p>
          ) : null}
          {selectedDateIsException ? (
            <p className="mt-1.5 text-[10px] font-semibold text-emerald-700">
              Fecha excepcional válida para este proveedor.
            </p>
          ) : null}
          {coverageRangeLabel ? (
            <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/90 px-2 py-1.5 text-[10px] text-emerald-950 ring-1 ring-emerald-100 sm:text-[11px]">
              <p className="text-center font-bold uppercase tracking-wide text-emerald-900">Cobertura de este pedido</p>
              <p className="mt-0.5 text-center font-medium capitalize leading-tight">{coverageRangeLabel}</p>
            </div>
          ) : deliveryDate.trim() !== '' ? null : (
            <p className="mt-1.5 text-[10px] text-zinc-500">
              Si eliges fecha verás aquí el tramo de cobertura y los objetivos por línea.
            </p>
          )}
          {deliveryDayMismatch ? (
            <p className="mt-1.5 text-[10px] font-semibold text-amber-800 sm:text-[11px]">
              Esta fecha no es un día de reparto marcado para el proveedor. Revisa Proveedores o la fecha del albarán.
            </p>
          ) : null}
        </div>
        <div className="rounded-lg bg-zinc-50 p-1.5 ring-1 ring-zinc-200/90">
          <div className="flex items-center justify-between text-xs text-zinc-700">
            <span>Subtotal</span>
            <span className="tabular-nums">{totalBase.toFixed(2)} €</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between text-xs text-zinc-700">
            <span>IVA</span>
            <span className="tabular-nums">{totalVat.toFixed(2)} €</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between text-sm font-black text-zinc-900">
            <span>Total</span>
            <span className="tabular-nums">{total.toFixed(2)} €</span>
          </div>
        </div>
        {message ? <p className="mt-1.5 text-sm text-[#B91C1C]">{message}</p> : null}
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => {
              void (async () => {
                if (!(await appConfirm('¿Cancelar pedido y vaciar cesta?'))) return;
                resetPedidoFormAfterSuccess();
                router.push('/pedidos');
              })();
            }}
            className="h-10 rounded-lg border border-zinc-200 bg-white text-xs font-bold text-zinc-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => saveDraft('draft')}
            className="h-10 rounded-lg bg-[#D32F2F] text-xs font-bold text-white"
          >
            {editingId ? 'Guardar cambios' : 'Guardar borrador'}
          </button>
          <button
            type="button"
            onClick={sendToWhatsappInOneStep}
            className="inline-flex h-10 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-[#25D366] px-1 py-0.5 text-[9px] font-semibold leading-tight text-white ring-1 ring-[#128C7E]/35 sm:flex-row sm:gap-1 sm:px-2 sm:text-[11px]"
            aria-label="Enviar pedido por WhatsApp"
          >
            <svg className="h-4 w-4 shrink-0 text-white" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="currentColor"
                d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
              />
            </svg>
            <span className="text-center leading-tight sm:hidden">
              Enviar por
              <br />
              WhatsApp
            </span>
            <span className="hidden sm:inline">Enviar WhatsApp</span>
          </button>
        </div>
      </section>

      <PedidosNuevoStickyDock
        isEmpty={items.length === 0}
        linesCount={items.length}
        unitsCount={totalUnitsOrdered}
        subtotalNoVat={totalBase}
        vatAmount={totalVat}
        totalWithVat={total}
        minimumOrderEuro={supplierMinimumEuro}
        notes={notes}
        onNotesChange={setNotes}
        onContinue={scrollToPedidoAcciones}
        onWhatsApp={sendToWhatsappInOneStep}
        onTemplate={() => setUseTemplateOpen(true)}
        onSaveTemplate={() => setSaveTemplateOpen(true)}
        showQuickActions={!editingId}
        onEmptyCatalogCta={scrollToCatalogoNuevo}
        deliveryDateLabel={deliveryDate.trim() && deliveryChipLabel ? deliveryChipLabel : 'Fecha'}
        deliveryDateMissing={!deliveryDate.trim()}
        onDeliveryDateTap={openDeliveryDateEditor}
      />

      <PedidosSaveTemplateSheet
        open={Boolean(saveTemplateOpen && templateSheetOrder)}
        onClose={() => setSaveTemplateOpen(false)}
        localId={localId}
        userId={userId}
        order={templateSheetOrder}
        supplierName={selectedSupplier?.name ?? ''}
        linkedOrderId={existingOrderId}
      />

      <PedidosUseTemplateSheet
        open={useTemplateOpen}
        onClose={() => setUseTemplateOpen(false)}
        localId={localId}
        onPick={(id) => {
          router.push(`/pedidos/nuevo?templateId=${encodeURIComponent(id)}`);
        }}
      />

      <PedidosSuggestedOrderSheet
        open={suggestedOrderOpen}
        onClose={() => setSuggestedOrderOpen(false)}
        result={suggestedOrderResult}
        hasExistingQuantities={hasExistingSuggestedBasketQty}
        onApply={applySuggestedOrder}
        temporalPatterns={temporalPatterns}
      />
    </div>
  );
}
