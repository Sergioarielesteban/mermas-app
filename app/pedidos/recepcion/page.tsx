'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { usePedidosOrders } from '@/components/PedidosOrdersProvider';
import { CHEF_ONE_TAPER_LINE_CLASS } from '@/components/ChefOneGlowLine';
import { appConfirm } from '@/lib/app-dialog-bridge';
import { getSupabaseClient } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { dispatchPedidosDataChanged, usePedidosDataChangedListener } from '@/hooks/usePedidosDataChangedListener';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import RecepcionLineRow from '@/components/pedidos/recepcion/RecepcionLineRow';
import { SupplierAvatar } from '@/components/pedidos/SupplierAvatar';
import { formatQuantityWithUnit, unitPriceCatalogSuffix } from '@/lib/pedidos-format';
import {
  parsePricePerKg,
  parseReceivedKg,
  resolveEuroPerKgSuggestion,
} from '@/lib/pedidos-recepcion-inputs';
import {
  billingQuantityForReceptionPrice,
  fetchLastHistoricoComparableBySupplierProductIds,
  fetchLastReceivedPricePerKgBySupplierProductIds,
  fetchReceptionEuroPerKgHintsBySupplierProductIds,
  fetchSupplierProductWeightedReceivedPrices,
  fetchSuppliersWithProducts,
  persistReceptionItemTotals,
  commitPriceEvolutionFromReceivedOrderItem,
  receptionBillsByWeight,
  receptionLineTotals,
  resolveReceivedQuantityForReceptionPreview,
  resolveReceivedWeightKgForReceptionPreview,
  setOrderPriceReviewArchived,
  updateOrderItemIncident,
  updateOrderItemPrice,
  updateOrderItemReceived,
  updateOrderItemReceivedWeightKg,
  type PedidoOrder,
  type PedidoOrderItem,
  type PedidoSupplier,
  type ReceptionEuroPerKgHints,
} from '@/lib/pedidos-supabase';
import {
  catalogNameByProductIdFromSuppliers,
  orderLineDisplayName,
} from '@/lib/pedidos-line-display-name';
import {
  attachOperationalScrollSave,
  attachOperationalStateListeners,
  makePersistedScreenStateKey,
  readOperationalScrollY,
  readPersistedScreenState,
  restoreOperationalScrollY,
  writePersistedScreenState,
} from '@/lib/persisted-screen-state';
import { markPedidosUiSkipRestoreOnce } from '@/lib/pedidos-ui-session';
import { useOperationalAutoCollapse } from '@/lib/use-operational-auto-collapse';
import { actorLabel, notifyIncidenciaRecepcionDeduped } from '@/services/notifications';

function orderHasAnyIncident(order: PedidoOrder): boolean {
  return order.items.some((i) => Boolean(i.incidentType) || Boolean(i.incidentNotes?.trim()));
}

/** Texto único para el pedido si varias líneas tenían la misma incidencia (o la primera nota). */
function draftIncidentNoteForOrder(order: PedidoOrder): string {
  const notes = order.items.map((i) => i.incidentNotes?.trim()).filter(Boolean) as string[];
  if (notes.length === 0) return '';
  const uniq = [...new Set(notes)];
  return uniq.join(' · ');
}

type RecepcionOperationalState = {
  pathname: string;
  search: string;
  localId: string;
  scrollY: number;
  expandedPendingOrderId: string | null;
  archivedAccordionOpen: boolean;
  expandedArchivedOrderId: string | null;
  incidentOpenByOrderId: Record<string, boolean>;
  incidentNoteByOrderId: Record<string, string>;
  priceInputByItemId: Record<string, string>;
};

export default function RecepcionPedidosPage() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { localCode, localName, localId, email, userId, displayName, loginUsername } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const { orders: allOrders, setOrders, reloadOrders, clearPendingReceivedOrder } = usePedidosOrders();
  const orders = React.useMemo(
    () => allOrders.filter((row) => row.status === 'sent' || row.status === 'received'),
    [allOrders],
  );
  const [message, setMessage] = React.useState<string | null>(null);
  const [catalogSuppliers, setCatalogSuppliers] = React.useState<PedidoSupplier[]>([]);
  const [priceInputByItemId, setPriceInputByItemId] = React.useState<Record<string, string>>({});
  const priceInputRef = React.useRef<Record<string, string>>({});
  priceInputRef.current = priceInputByItemId;
  const ordersRef = React.useRef(orders);
  ordersRef.current = orders;

  const catalogNameByProductId = React.useMemo(
    () => catalogNameByProductIdFromSuppliers(catalogSuppliers),
    [catalogSuppliers],
  );

  const reloadCatalogSuppliers = React.useCallback(() => {
    if (!localId) {
      setCatalogSuppliers([]);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchSuppliersWithProducts(supabase, localId)
      .then((rows) => setCatalogSuppliers(rows))
      .catch(() => setCatalogSuppliers([]));
  }, [localId]);

  React.useEffect(() => {
    reloadCatalogSuppliers();
  }, [reloadCatalogSuppliers]);

  usePedidosDataChangedListener(reloadCatalogSuppliers, Boolean(hasPedidosEntry && canUse));

  const getLinePrice = React.useCallback((item: PedidoOrder['items'][number], priceDraft?: string) => {
    const raw = priceDraft !== undefined ? priceDraft : priceInputRef.current[item.id];
    if (raw == null || String(raw).trim() === '') {
      return item.pricePerUnit;
    }
    const parsed = Number(String(raw).replace(',', '.'));
    return Number.isNaN(parsed) || parsed < 0 ? item.pricePerUnit : Math.round(parsed * 100) / 100;
  }, []);
  const [incidentOpenByOrderId, setIncidentOpenByOrderId] = React.useState<Record<string, boolean>>({});
  const [incidentNoteByOrderId, setIncidentNoteByOrderId] = React.useState<Record<string, string>>({});
  const [expandedPendingOrderId, setExpandedPendingOrderId] = React.useState<string | null>(null);
  const [archivedAccordionOpen, setArchivedAccordionOpen] = React.useState(true);
  const [expandedArchivedOrderId, setExpandedArchivedOrderId] = React.useState<string | null>(null);
  const pendingReviewListRef = React.useRef<HTMLDivElement | null>(null);
  const archivedReviewListRef = React.useRef<HTMLDivElement | null>(null);
  const focusOrderIdFromUrl = searchParams.get('orderId') ?? '';
  const searchString = searchParams.toString();
  const focusOrderAppliedRef = React.useRef(false);
  const restoredOperationalStateRef = React.useRef(false);
  const pendingScrollRestoreRef = React.useRef<number | null>(null);
  const operationalStateKey = React.useMemo(
    () => makePersistedScreenStateKey('pedidos-recepcion', [localId ?? 'sin-local']),
    [localId],
  );
  const receptionDraftPrefix = React.useMemo(
    () => (localId ? `reception-draft:${localId}` : undefined),
    [localId],
  );

  useOperationalAutoCollapse({
    activeId: expandedPendingOrderId,
    containerRef: pendingReviewListRef,
    onCollapse: () => setExpandedPendingOrderId(null),
    hasPendingChanges: () =>
      Boolean(expandedPendingOrderId && incidentOpenByOrderId[expandedPendingOrderId]),
  });

  useOperationalAutoCollapse({
    activeId: expandedArchivedOrderId,
    containerRef: archivedReviewListRef,
    onCollapse: () => setExpandedArchivedOrderId(null),
  });

  const buildOperationalState = React.useCallback(
    (): RecepcionOperationalState | null => {
      if (!localId) return null;
      return {
        pathname,
        search: searchString,
        localId,
        scrollY: readOperationalScrollY(),
        expandedPendingOrderId,
        archivedAccordionOpen,
        expandedArchivedOrderId,
        incidentOpenByOrderId,
        incidentNoteByOrderId,
        priceInputByItemId: priceInputRef.current,
      };
    },
    [
      archivedAccordionOpen,
      expandedArchivedOrderId,
      expandedPendingOrderId,
      incidentNoteByOrderId,
      incidentOpenByOrderId,
      localId,
      pathname,
      searchString,
    ],
  );

  const saveOperationalState = React.useCallback(() => {
    const state = buildOperationalState();
    if (!state) return;
    writePersistedScreenState(operationalStateKey, state);
  }, [buildOperationalState, operationalStateKey]);

  const restoreOperationalState = React.useCallback((onlyScroll = false) => {
    if (!localId) return false;
    const state = readPersistedScreenState<RecepcionOperationalState>(operationalStateKey);
    if (!state || state.localId !== localId || state.pathname !== pathname) return false;
    if (onlyScroll) {
      if (state.scrollY > 0 && readOperationalScrollY() < 8) restoreOperationalScrollY(state.scrollY);
      return true;
    }
    setExpandedPendingOrderId(state.expandedPendingOrderId);
    setArchivedAccordionOpen(state.archivedAccordionOpen);
    setExpandedArchivedOrderId(state.expandedArchivedOrderId);
    setIncidentOpenByOrderId(state.incidentOpenByOrderId ?? {});
    setIncidentNoteByOrderId(state.incidentNoteByOrderId ?? {});
    setPriceInputByItemId(state.priceInputByItemId ?? {});
    if (state.scrollY > 0) pendingScrollRestoreRef.current = state.scrollY;
    restoredOperationalStateRef.current = true;
    return true;
  }, [localId, operationalStateKey, pathname]);

  React.useLayoutEffect(() => {
    if (restoredOperationalStateRef.current) return;
    restoreOperationalState(false);
  }, [restoreOperationalState]);

  React.useEffect(() => {
    if (!pendingScrollRestoreRef.current || orders.length === 0) return;
    const y = pendingScrollRestoreRef.current;
    pendingScrollRestoreRef.current = null;
    restoreOperationalScrollY(y);
  }, [orders.length]);

  React.useEffect(
    () =>
      attachOperationalStateListeners({
        save: saveOperationalState,
        restore: () => restoreOperationalState(true),
      }),
    [restoreOperationalState, saveOperationalState],
  );

  React.useEffect(
    () => attachOperationalScrollSave(saveOperationalState, 180),
    [saveOperationalState],
  );

  React.useEffect(() => {
    saveOperationalState();
  }, [saveOperationalState]);

  React.useEffect(() => {
    focusOrderAppliedRef.current = false;
  }, [focusOrderIdFromUrl]);

  React.useEffect(() => {
    if (!focusOrderIdFromUrl || focusOrderAppliedRef.current) return;
    const o = orders.find((x) => x.id === focusOrderIdFromUrl);
    if (!o) return;
    focusOrderAppliedRef.current = true;
    setExpandedPendingOrderId(focusOrderIdFromUrl);
    setIncidentOpenByOrderId((prev) => ({ ...prev, [focusOrderIdFromUrl]: true }));
    setIncidentNoteByOrderId((prev) => ({
      ...prev,
      [focusOrderIdFromUrl]: prev[focusOrderIdFromUrl] ?? draftIncidentNoteForOrder(o),
    }));
  }, [orders, focusOrderIdFromUrl]);

  const pendingPriceReviewOrders = React.useMemo(
    () =>
      orders.filter(
        (o) =>
          (o.status === 'sent' || o.status === 'received') && !o.priceReviewArchivedAt,
      ),
    [orders],
  );
  const archivedPriceReviewOrders = React.useMemo(
    () =>
      orders.filter(
        (o) =>
          (o.status === 'sent' || o.status === 'received') && Boolean(o.priceReviewArchivedAt),
      ),
    [orders],
  );

  const receptionEuroByProductRef = React.useRef<Record<string, number>>({});
  const weightedPmpEuroByProductRef = React.useRef<Record<string, number>>({});
  const receptionHintsByProductRef = React.useRef<Map<string, ReceptionEuroPerKgHints>>(new Map());
  const historicoComparableByProductRef = React.useRef<
    Map<string, { precio: number; unidad: string }>
  >(new Map());
  const [priceHintsTick, setPriceHintsTick] = React.useState(0);

  const supplierProductIdsForHints = React.useMemo(() => {
    const ids = new Set<string>();
    for (const o of pendingPriceReviewOrders) {
      for (const it of o.items) {
        if (it.supplierProductId) ids.add(it.supplierProductId);
      }
    }
    return [...ids];
  }, [pendingPriceReviewOrders]);

  const hintIdsKey = supplierProductIdsForHints.join(',');

  React.useEffect(() => {
    if (!localId) return;
    if (supplierProductIdsForHints.length === 0) {
      receptionEuroByProductRef.current = {};
      weightedPmpEuroByProductRef.current = {};
      receptionHintsByProductRef.current = new Map();
      historicoComparableByProductRef.current = new Map();
      setPriceHintsTick((t) => t + 1);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    const ids = supplierProductIdsForHints;
    void Promise.all([
      fetchLastReceivedPricePerKgBySupplierProductIds(supabase, localId, ids),
      fetchSupplierProductWeightedReceivedPrices(supabase, localId, ids, { unit: 'kg' }),
      fetchReceptionEuroPerKgHintsBySupplierProductIds(supabase, localId, ids),
      fetchLastHistoricoComparableBySupplierProductIds(supabase, localId, ids),
    ])
      .then(([recvMap, pmpMap, hintsMap, historicoMap]) => {
        if (cancelled) return;
        receptionEuroByProductRef.current = Object.fromEntries(recvMap);
        weightedPmpEuroByProductRef.current = Object.fromEntries(pmpMap);
        receptionHintsByProductRef.current = hintsMap;
        historicoComparableByProductRef.current = historicoMap;
        setPriceHintsTick((t) => t + 1);
      })
      .catch(() => {
        if (cancelled) return;
        receptionEuroByProductRef.current = {};
        weightedPmpEuroByProductRef.current = {};
        receptionHintsByProductRef.current = new Map();
        historicoComparableByProductRef.current = new Map();
        setPriceHintsTick((t) => t + 1);
      });
    return () => {
      cancelled = true;
    };
  }, [localId, hintIdsKey]);

  const recepcionLineSuggestionByItemId = React.useMemo(() => {
    const m = new Map<string, ReturnType<typeof resolveEuroPerKgSuggestion>>();
    const recv = receptionEuroByProductRef.current;
    const pmpR = weightedPmpEuroByProductRef.current;
    const hints = receptionHintsByProductRef.current;
    for (const o of pendingPriceReviewOrders) {
      for (const it of o.items) {
        if (!receptionBillsByWeight(it)) continue;
        const sid = it.supplierProductId;
        const h = sid ? hints.get(sid) : undefined;
        m.set(
          it.id,
          resolveEuroPerKgSuggestion(it, {
            articleEuroPerKg: h?.articleEuroPerKg ?? null,
            lastReceptionEuroPerKg: sid ? recv[sid] : undefined,
            weightedPmpEuroPerKg: sid ? pmpR[sid] : undefined,
            liveCatalogBillingEuroPerKg: h?.catalogBillingEuroPerKg ?? null,
          }),
        );
      }
    }
    return m;
  }, [pendingPriceReviewOrders, priceHintsTick]);

  const resolvePpkForItemSnap = React.useCallback((item: PedidoOrderItem) => {
    const sid = item.supplierProductId;
    const h = sid ? receptionHintsByProductRef.current.get(sid) : undefined;
    return resolveEuroPerKgSuggestion(item, {
      articleEuroPerKg: h?.articleEuroPerKg ?? null,
      lastReceptionEuroPerKg: sid ? receptionEuroByProductRef.current[sid] : undefined,
      weightedPmpEuroPerKg: sid ? weightedPmpEuroByProductRef.current[sid] : undefined,
      liveCatalogBillingEuroPerKg: h?.catalogBillingEuroPerKg ?? null,
    }).value;
  }, []);

  const flushOrderPricesToDatabase = async (order: PedidoOrder) => {
    if (!localId) throw new Error('Sin local.');
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase no disponible.');

    await Promise.all(
      order.items.map(async (item) => {
        const price = getLinePrice(item);
        const merged = { ...item, pricePerUnit: price };

        await persistReceptionItemTotals(supabase, localId, merged);

        await commitPriceEvolutionFromReceivedOrderItem(supabase, localId, merged, {
          userId,
          receivedAt: order.receivedAt ?? new Date().toISOString(),
        });
      }),
    );

    setPriceInputByItemId((prev) => {
      const next = { ...prev };
      for (const item of order.items) {
        next[item.id] = getLinePrice(item).toFixed(2);
      }
      return next;
    });

    dispatchPedidosDataChanged();
  };

  const markPriceReviewArchived = async (orderId: string, archived: boolean) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    clearPendingReceivedOrder(orderId);
    const optimisticTs = archived ? new Date().toISOString() : undefined;
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        if (archived && optimisticTs) {
          return { ...o, priceReviewArchivedAt: optimisticTs };
        }
        return { ...o, priceReviewArchivedAt: undefined };
      }),
    );
    if (archived) {
      setArchivedAccordionOpen(true);
      setExpandedArchivedOrderId(orderId);
    } else {
      setExpandedArchivedOrderId((cur) => (cur === orderId ? null : cur));
    }
    try {
      await setOrderPriceReviewArchived(supabase, localId, orderId, archived);
      setMessage(
        archived ? 'Pedido archivado de la revisión de precios.' : 'Pedido de nuevo en pendientes de revisión.',
      );
      void reloadOrders();
      dispatchPedidosDataChanged();
    } catch (err: unknown) {
      void reloadOrders();
      setMessage(err instanceof Error ? err.message : 'Error al actualizar.');
    }
  };

  const changeUnitPrice = (orderId: string, itemId: string, rawValue: string) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const parsed = Number(rawValue.replace(',', '.'));
    if (Number.isNaN(parsed) || parsed < 0) {
      setMessage('Precio inválido.');
      return;
    }
    const nextPrice = Math.round(parsed * 100) / 100;

    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        const nextItems = order.items.map((item) => {
          if (item.id !== itemId) return item;
          const merged = {
            ...item,
            pricePerUnit: nextPrice,
            ...(receptionBillsByWeight(item) && item.unit !== 'kg' ? { receivedPricePerKg: null } : {}),
          };
          const { lineTotal, effectivePricePerUnit } = receptionLineTotals(merged);
          return { ...merged, pricePerUnit: effectivePricePerUnit, lineTotal };
        });
        return { ...order, items: nextItems };
      }),
    );

    const orderSnap = ordersRef.current.find((o) => o.id === orderId);
    const itemSnap = orderSnap?.items.find((i) => i.id === itemId);
    if (!itemSnap) return;

    const merged = {
      ...itemSnap,
      pricePerUnit: nextPrice,
      ...(receptionBillsByWeight(itemSnap) && itemSnap.unit !== 'kg' ? { receivedPricePerKg: null } : {}),
    };

    void (receptionBillsByWeight(itemSnap)
      ? persistReceptionItemTotals(supabase, localId, merged)
      : updateOrderItemPrice(
          supabase,
          localId,
          itemId,
          nextPrice,
          billingQuantityForReceptionPrice(merged),
        )
    )
      .then(() => dispatchPedidosDataChanged())
      .catch((err: Error) => {
        void reloadOrders();
        setMessage(err.message);
      });
  };

  const commitReceivedOrderQtyInput = (orderId: string, itemId: string, rawQty: string, priceDraft?: string) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const orderSnap = ordersRef.current.find((o) => o.id === orderId);
    const itemSnap = orderSnap?.items.find((i) => i.id === itemId);
    if (!itemSnap || receptionBillsByWeight(itemSnap)) return;

    const price = getLinePrice(itemSnap, priceDraft);
    const q = resolveReceivedQuantityForReceptionPreview({ ...itemSnap, pricePerUnit: price }, rawQty);
    const merged: PedidoOrderItem = {
      ...itemSnap,
      pricePerUnit: price,
      receivedQuantity: q,
      receivedWeightKg: null,
      receivedPricePerKg: null,
    };

    void (async () => {
      try {
        await persistReceptionItemTotals(supabase, localId, merged);
        const { lineTotal, effectivePricePerUnit } = receptionLineTotals(merged);
        setOrders((prev) =>
          prev.map((order) => {
            if (order.id !== orderId) return order;
            return {
              ...order,
              items: order.items.map((item) =>
                item.id === itemId ? { ...merged, pricePerUnit: effectivePricePerUnit, lineTotal } : item,
              ),
            };
          }),
        );
        setPriceInputByItemId((prev) => ({ ...prev, [itemId]: effectivePricePerUnit.toFixed(2) }));
        setMessage(null);
        dispatchPedidosDataChanged();
      } catch (err: unknown) {
        void reloadOrders();
        setMessage(err instanceof Error ? err.message : 'No se pudo guardar la cantidad recibida.');
      }
    })();
  };

  const commitPriceInput = (orderId: string, itemId: string, raw: string) => {
    const orderSnap = ordersRef.current.find((o) => o.id === orderId);
    const itemSnap = orderSnap?.items.find((i) => i.id === itemId);
    if (!itemSnap) return;
    changeUnitPrice(orderId, itemId, raw);
    const parsed = Number(raw.replace(',', '.'));
    const normalized = Number.isNaN(parsed) || parsed < 0 ? '0.00' : (Math.round(parsed * 100) / 100).toFixed(2);
    setPriceInputByItemId((prev) => ({ ...prev, [itemId]: normalized }));
  };

  const commitPricePerKgInput = (orderId: string, itemId: string, raw: string) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const orderSnap = ordersRef.current.find((o) => o.id === orderId);
    const itemSnap = orderSnap?.items.find((i) => i.id === itemId);
    if (!itemSnap || !receptionBillsByWeight(itemSnap)) return;

    const trimmed = raw.trim();
    let parsed: number | null;
    if (trimmed === '') {
      parsed = resolvePpkForItemSnap(itemSnap);
    } else {
      const p = parsePricePerKg(raw);
      if (p === 'invalid') {
        setMessage('€/kg inválido.');
        return;
      }
      parsed = p;
    }

    const price = getLinePrice(itemSnap);
    const receivedWeightKg = resolveReceivedWeightKgForReceptionPreview(itemSnap, undefined);
    const merged: PedidoOrderItem = {
      ...itemSnap,
      pricePerUnit: price,
      receivedWeightKg,
      receivedPricePerKg: parsed,
      ...(itemSnap.unit === 'kg' && receivedWeightKg != null && receivedWeightKg > 0
        ? { receivedQuantity: receivedWeightKg }
        : {}),
    };

    void (async () => {
      try {
        await persistReceptionItemTotals(supabase, localId, merged);
        const { lineTotal, effectivePricePerUnit } = receptionLineTotals(merged);
        setOrders((prev) =>
          prev.map((order) => {
            if (order.id !== orderId) return order;
            return {
              ...order,
              items: order.items.map((item) =>
                item.id === itemId
                  ? { ...merged, pricePerUnit: effectivePricePerUnit, lineTotal }
                  : item,
              ),
            };
          }),
        );
        setPriceInputByItemId((prev) => ({ ...prev, [itemId]: effectivePricePerUnit.toFixed(2) }));
        setMessage(null);
        dispatchPedidosDataChanged();
      } catch (err: unknown) {
        void reloadOrders();
        setMessage(err instanceof Error ? err.message : 'No se pudo guardar €/kg.');
      }
    })();
  };

  const commitWeightInput = (orderId: string, itemId: string, rawKg: string, priceDraft?: string) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const parsed = parseReceivedKg(rawKg);
    if (parsed === 'invalid') {
      setMessage('Peso recibido inválido.');
      return;
    }

    const orderSnap = ordersRef.current.find((o) => o.id === orderId);
    const itemSnap = orderSnap?.items.find((i) => i.id === itemId);
    if (!itemSnap) return;

    if (itemSnap.unit === 'kg' && receptionBillsByWeight(itemSnap)) {
      const price = getLinePrice(itemSnap, priceDraft);
      void (async () => {
        try {
          if (parsed == null) {
            await updateOrderItemReceivedWeightKg(supabase, localId, itemId, null);
            await updateOrderItemReceived(supabase, localId, itemId, itemSnap.receivedQuantity);
            await persistReceptionItemTotals(supabase, localId, {
              ...itemSnap,
              pricePerUnit: price,
              receivedWeightKg: null,
            });
          } else {
            await updateOrderItemReceivedWeightKg(supabase, localId, itemId, parsed);
            await updateOrderItemReceived(supabase, localId, itemId, parsed);
            await persistReceptionItemTotals(supabase, localId, {
              ...itemSnap,
              pricePerUnit: price,
              receivedWeightKg: parsed,
              receivedQuantity: parsed,
            });
          }
          setOrders((prev) =>
            prev.map((order) => {
              if (order.id !== orderId) return order;
              return {
                ...order,
                items: order.items.map((item) => {
                  if (item.id !== itemId) return item;
                  if (parsed == null) {
                    const merged = { ...item, pricePerUnit: price, receivedWeightKg: null };
                    const { lineTotal, effectivePricePerUnit } = receptionLineTotals(merged);
                    return { ...merged, pricePerUnit: effectivePricePerUnit, lineTotal };
                  }
                  const merged = {
                    ...item,
                    pricePerUnit: price,
                    receivedWeightKg: parsed,
                    receivedQuantity: parsed,
                  };
                  const { lineTotal, effectivePricePerUnit } = receptionLineTotals(merged);
                  return { ...merged, pricePerUnit: effectivePricePerUnit, lineTotal };
                }),
              };
            }),
          );
          dispatchPedidosDataChanged();
        } catch (err: unknown) {
          void reloadOrders();
          setMessage(err instanceof Error ? err.message : 'No se pudo guardar el peso.');
        }
      })();
      return;
    }

    if (!receptionBillsByWeight(itemSnap)) return;

    void (async () => {
      try {
        const nextWeight = parsed == null ? null : parsed;
        const nextPpk =
          nextWeight == null
            ? null
            : itemSnap.receivedPricePerKg ?? resolvePpkForItemSnap(itemSnap) ?? null;
        const merged = {
          ...itemSnap,
          receivedWeightKg: nextWeight,
          receivedPricePerKg: nextPpk,
        };
        await persistReceptionItemTotals(supabase, localId, merged);
        const { lineTotal, effectivePricePerUnit } = receptionLineTotals(merged);
        setOrders((prev) =>
          prev.map((order) => {
            if (order.id !== orderId) return order;
            return {
              ...order,
              items: order.items.map((item) =>
                item.id === itemId
                  ? { ...merged, pricePerUnit: effectivePricePerUnit, lineTotal }
                  : item,
              ),
            };
          }),
        );
        setPriceInputByItemId((prev) => ({ ...prev, [itemId]: effectivePricePerUnit.toFixed(2) }));
        dispatchPedidosDataChanged();
      } catch (err: unknown) {
        void reloadOrders();
        setMessage(err instanceof Error ? err.message : 'No se pudo guardar el peso.');
      }
    })();
  };

  const toggleOrderIncidentPanel = (order: PedidoOrder) => {
    setIncidentOpenByOrderId((prev) => {
      const willOpen = !prev[order.id];
      if (willOpen) {
        setIncidentNoteByOrderId((n) => {
          if (n[order.id] !== undefined) return n;
          return { ...n, [order.id]: draftIncidentNoteForOrder(order) };
        });
      }
      return { ...prev, [order.id]: willOpen };
    });
  };

  const saveOrderIncident = (order: PedidoOrder) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const raw =
      incidentNoteByOrderId[order.id] ??
      (incidentOpenByOrderId[order.id] ? draftIncidentNoteForOrder(order) : '');
    const note = raw.trim();
    const nextIncidentType: PedidoOrder['items'][number]['incidentType'] = note ? 'damaged' : null;
    const nextIncidentNotes = note || undefined;

    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== order.id) return o;
        const nextItems = o.items.map((item) => ({
          ...item,
          incidentType: nextIncidentType,
          incidentNotes: nextIncidentNotes,
        }));
        return { ...o, items: nextItems };
      }),
    );

    void Promise.all(
      order.items.map((item) =>
        updateOrderItemIncident(supabase, localId, item.id, { type: note ? 'damaged' : null, notes: note }),
      ),
    )
      .then(() => {
        dispatchPedidosDataChanged();
        if (note) {
          notifyIncidenciaRecepcionDeduped(supabase, {
            localId,
            userId,
            actorName: actorLabel(displayName, loginUsername),
            supplierName: order.supplierName,
            orderId: order.id,
          });
        }
      })
      .catch((err: Error) => {
        void reloadOrders();
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
  return (
    <div className="space-y-2.5 sm:space-y-3">
      <section className="flex flex-wrap gap-1.5">
        <Link
          href="/pedidos"
          onClick={markPedidosUiSkipRestoreOnce}
          className="inline-flex items-center gap-1 py-0.5 text-xs font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline"
        >
          ← Pedidos
        </Link>
        <Link
          href="/pedidos/albaranes"
          className="inline-flex h-8 items-center rounded-lg border border-[#D32F2F]/25 bg-red-50/70 px-2.5 text-[11px] font-semibold text-[#B91C1C]"
        >
          Albaranes
        </Link>
      </section>

      <section className="overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200/90">
        <div className="border-b border-zinc-100 bg-gradient-to-r from-zinc-50 to-zinc-50/50 px-3 py-2.5 text-center">
          <h1 className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-800">
            Pendientes de revisión de precios
          </h1>
        </div>
        <div ref={pendingReviewListRef} className="space-y-2 p-3 sm:p-3.5">
          {message ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-950 ring-1 ring-amber-200/80">
              {message}
            </p>
          ) : null}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setExpandedPendingOrderId(null);
                setExpandedArchivedOrderId(null);
              }}
              className="inline-flex h-7 items-center rounded-full bg-amber-50 px-2.5 text-[10px] font-black text-amber-900 ring-1 ring-amber-200/70 transition hover:bg-amber-100/70 active:scale-[0.98]"
            >
              Cerrar todo
            </button>
          </div>
          {pendingPriceReviewOrders.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">No hay pedidos pendientes de revisión.</p>
          ) : null}
          {pendingPriceReviewOrders.map((order) => {
            const orderIncidentMode =
              Boolean(incidentOpenByOrderId[order.id]) || orderHasAnyIncident(order);
            const expanded = expandedPendingOrderId === order.id;
            return (
            <div
              key={order.id}
              className={[
                'rounded-lg p-2 ring-1',
                orderIncidentMode ? 'bg-red-50 ring-1 ring-red-400/70' : 'bg-zinc-50/80 ring-zinc-200/90',
              ].join(' ')}
            >
              <div className="flex flex-col items-center px-1 pb-0.5 text-center">
                <SupplierAvatar
                  name={order.supplierName}
                  logoUrl={order.supplierLogoUrl}
                  className="mb-2 h-10 w-10 text-[11px]"
                />
                <p className="max-w-[96%] text-sm font-semibold leading-snug tracking-tight text-zinc-900">
                  {order.supplierName}
                </p>
                <span
                  className={`mx-auto mt-1.5 w-16 ${CHEF_ONE_TAPER_LINE_CLASS}`}
                  aria-hidden
                />
                <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400">
                  Pedido {new Date(order.createdAt).toLocaleDateString('es-ES')}
                </p>
                {order.status === 'received' ? (
                  <p className="mt-1.5 max-w-[98%] rounded-md bg-amber-50 px-2 py-1 text-[10px] font-semibold leading-snug text-amber-950 ring-1 ring-amber-200/90">
                    Falta cotejar precios con el albarán. Ajusta líneas y archiva abajo cuando revisado.
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => setExpandedPendingOrderId((id) => (id === order.id ? null : order.id))}
                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700"
                  aria-expanded={expanded}
                >
                  {expanded ? 'Ocultar' : 'Detalle'}
                  <ChevronDown className={['h-3.5 w-3.5', expanded ? 'rotate-180' : ''].join(' ')} aria-hidden />
                </button>
              </div>
              {expanded ? (
              <>
              <div className="mt-1.5 space-y-1">
                {order.items.map((item) => {
                  const sug = recepcionLineSuggestionByItemId.get(item.id) ?? {
                    value: null,
                    source: null,
                  };
                  const sid = item.supplierProductId;
                  const lastHistorico =
                    sid != null ? historicoComparableByProductRef.current.get(sid) ?? null : null;
                  return (
                    <RecepcionLineRow
                      key={item.id}
                      orderId={order.id}
                      item={item}
                      lineDisplayName={orderLineDisplayName(item, catalogNameByProductId)}
                      suggestedEuroPerKg={sug.value}
                      suggestionSource={sug.source}
                      lastHistoricoComparable={lastHistorico}
                      priceHintsVersion={priceHintsTick}
                      commitWeightInput={commitWeightInput}
                      commitReceivedOrderQtyInput={commitReceivedOrderQtyInput}
                      commitPricePerKgInput={commitPricePerKgInput}
                      commitPriceInput={commitPriceInput}
                      draftStoragePrefix={
                        receptionDraftPrefix ? `${receptionDraftPrefix}:${order.id}` : undefined
                      }
                    />
                  );
                })}
              </div>
              <div className="mt-3 border-t border-red-200/70 pt-3">
                <button
                  type="button"
                  onClick={() => toggleOrderIncidentPanel(order)}
                  className={[
                    'w-full rounded-lg px-3 py-2.5 text-center text-xs font-bold text-white sm:w-auto',
                    incidentOpenByOrderId[order.id] || orderHasAnyIncident(order)
                      ? 'bg-[#991B1B] ring-2 ring-red-600'
                      : 'bg-[#B91C1C]',
                  ].join(' ')}
                >
                  {incidentOpenByOrderId[order.id] ? 'Ocultar nota de incidencia' : 'Incidencia'}
                </button>
                {incidentOpenByOrderId[order.id] ? (
                  <div className="mt-3 space-y-2 rounded-xl bg-red-100 p-3 ring-2 ring-red-400">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-red-900">
                      Nota para todo el pedido (se guarda en todas las lineas)
                    </p>
                    <textarea
                      value={
                        incidentNoteByOrderId[order.id] ??
                        (incidentOpenByOrderId[order.id] ? draftIncidentNoteForOrder(order) : '')
                      }
                      onChange={(e) =>
                        setIncidentNoteByOrderId((prev) => ({ ...prev, [order.id]: e.target.value }))
                      }
                      rows={3}
                      placeholder="Describe la incidencia del pedido..."
                      className="w-full rounded-lg border-2 border-red-400 bg-white px-2 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => saveOrderIncident(order)}
                        className="rounded-lg bg-[#B91C1C] px-3 py-2 text-xs font-semibold text-white"
                      >
                        Guardar incidencia
                      </button>
                      <button
                        type="button"
                        onClick={() => setIncidentOpenByOrderId((prev) => ({ ...prev, [order.id]: false }))}
                        className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-xs font-semibold text-zinc-800"
                      >
                        Cerrar sin guardar
                      </button>
                    </div>
                  </div>
                ) : null}
                {orderHasAnyIncident(order) &&
                draftIncidentNoteForOrder(order) &&
                !incidentOpenByOrderId[order.id] ? (
                  <p className="mt-2 text-xs font-semibold text-[#B91C1C]">
                    <span aria-hidden>{'\u{1F6A8}'}</span> Incidencia: {draftIncidentNoteForOrder(order)}
                  </p>
                ) : null}
              </div>
              <div className="mt-4 border-t border-zinc-200/90 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                    if (
                      !(await appConfirm(
                        '¿Archivar este pedido de la revisión de precios? Pasará al acordeón inferior (sigue en Pedidos enviados). No marca el pedido como recibido.',
                      ))
                    ) {
                      return;
                    }
                      const latest = orders.find((o) => o.id === order.id);
                      if (!latest || !localId) return;
                      setMessage('Guardando precios…');
                      try {
                        await flushOrderPricesToDatabase(latest);
                        setMessage(null);
                        await markPriceReviewArchived(order.id, true);
                      } catch (err: unknown) {
                        setMessage(
                          err instanceof Error ? err.message : 'No se pudieron guardar los precios del pedido.',
                        );
                        void reloadOrders();
                      }
                    })();
                  }}
                  className="w-full rounded-xl border border-amber-600/80 bg-amber-50 py-3 text-center text-sm font-bold text-amber-950 shadow-sm"
                >
                  revisado
                </button>
              </div>
              </>
              ) : null}
            </div>
            );
          })}
          {archivedPriceReviewOrders.length > 0 ? (
            <details
              className="group mt-8 border-t border-zinc-200 pt-4"
              open={archivedAccordionOpen}
              onToggle={(e) => setArchivedAccordionOpen(e.currentTarget.open)}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl bg-zinc-100/90 px-3 py-2.5 text-left ring-1 ring-zinc-200 [&::-webkit-details-marker]:hidden">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-600">
                    Archivados · revisión de precios
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {archivedPriceReviewOrders.length} pedido
                    {archivedPriceReviewOrders.length === 1 ? '' : 's'} · toca para plegar o desplegar
                  </p>
                </div>
                <span className="shrink-0 text-lg font-light text-zinc-400 group-open:rotate-90" aria-hidden>
                  ›
                </span>
              </summary>
              <div ref={archivedReviewListRef} className="mt-3 space-y-2">
                <p className="text-center text-[11px] text-zinc-500">
                  Toca el proveedor o la fecha para ver líneas del pedido. «Reabrir en pendientes» mueve el pedido otra vez
                  arriba.
                </p>
                {archivedPriceReviewOrders.map((order) => {
                  const expanded = expandedArchivedOrderId === order.id;
                  return (
                    <div key={order.id} className="overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200">
                      <div className="flex flex-wrap items-stretch gap-2 p-3">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedArchivedOrderId((id) => (id === order.id ? null : order.id))
                          }
                          className="min-w-0 flex-1 rounded-lg text-left outline-none ring-[#D32F2F] focus-visible:ring-2"
                        >
                          <p className="text-sm font-semibold text-zinc-900">{order.supplierName}</p>
                          <p className="text-xs text-zinc-500">
                            Pedido {new Date(order.createdAt).toLocaleDateString('es-ES')}
                            {expanded ? ' · ocultar detalle' : ' · ver detalle'}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => void markPriceReviewArchived(order.id, false)}
                          className="shrink-0 self-center rounded-lg border border-zinc-400 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800"
                        >
                          Reabrir en pendientes
                        </button>
                      </div>
                      {expanded ? (
                        <div className="space-y-1.5 border-t border-zinc-100 bg-zinc-50/90 px-3 py-2">
                          {order.items.map((item) => (
                            <div
                              key={item.id}
                              className="space-y-1 rounded-lg bg-white p-2 ring-1 ring-zinc-200"
                            >
                              <p className="text-sm font-semibold leading-tight text-zinc-800">
                                {orderLineDisplayName(item, catalogNameByProductId)}
                              </p>
                              <p className="text-xs text-zinc-600">
                                Pedido:{' '}
                                <span className="text-base font-bold tabular-nums text-zinc-900">
                                  {formatQuantityWithUnit(item.quantity, item.unit)}
                                </span>
                              </p>
                              {item.receivedWeightKg != null && item.receivedWeightKg > 0 ? (
                                <p className="text-[11px] text-zinc-600">
                                  Kg: {item.receivedWeightKg.toFixed(3)}
                                </p>
                              ) : null}
                              {item.receivedPricePerKg != null && item.receivedPricePerKg > 0 ? (
                                <p className="text-[11px] text-zinc-600">
                                  €/kg: {item.receivedPricePerKg.toFixed(4)}
                                </p>
                              ) : null}
                              {item.basePricePerUnit != null && Number.isFinite(item.basePricePerUnit) ? (
                                <p className="text-[11px] leading-tight text-zinc-600">
                                  <span className="font-semibold text-zinc-500">Precio pedido</span>{' '}
                                  <span className="font-semibold text-zinc-900">
                                    {item.basePricePerUnit.toFixed(2)} €/{unitPriceCatalogSuffix[item.unit]}
                                  </span>
                                </p>
                              ) : null}
                              <p className="text-[11px] leading-tight text-zinc-600">
                                <span className="font-semibold text-zinc-500">Precio real recibido</span>{' '}
                                <span className="font-bold text-zinc-900">
                                  {item.pricePerUnit.toFixed(2)} €/{unitPriceCatalogSuffix[item.unit]}
                                </span>
                              </p>
                              {item.basePricePerUnit != null &&
                              Number.isFinite(item.basePricePerUnit) &&
                              Math.abs(item.pricePerUnit - item.basePricePerUnit) > 0.005 ? (
                                <p className="text-[10px] font-semibold leading-tight text-amber-900">
                                  Diferencia:{' '}
                                  {item.pricePerUnit >= item.basePricePerUnit ? '+' : ''}
                                  {(item.pricePerUnit - item.basePricePerUnit).toFixed(2)} € vs pedido
                                  {item.basePricePerUnit > 0
                                    ? ` (${item.pricePerUnit >= item.basePricePerUnit ? '+' : ''}${((((item.pricePerUnit - item.basePricePerUnit) / item.basePricePerUnit) * 100)).toFixed(1)} %)`
                                    : ''}
                                </p>
                              ) : null}
                              <p className="text-[11px] text-zinc-700">
                                Subt:{' '}
                                <span className="font-bold tabular-nums text-zinc-900">{item.lineTotal.toFixed(2)} €</span>
                              </p>
                              {item.incidentType || item.incidentNotes?.trim() ? (
                                <p className="text-[11px] font-semibold text-[#B91C1C]">
                                  Incidencia: {item.incidentNotes?.trim() || item.incidentType}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}
        </div>
      </section>

    </div>
  );
}
