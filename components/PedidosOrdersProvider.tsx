'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '@/components/AuthProvider';
import { usePedidosDataChangedListener } from '@/hooks/usePedidosDataChangedListener';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import {
  fetchOrders,
  mergePedidoOrdersFromServer,
  type PedidoOrder,
} from '@/lib/pedidos-supabase';
import { getSupabaseClient } from '@/lib/supabase-client';

const ordersSessionKey = (localId: string) => `chefone_pedidos_orders:${localId}`;

const ORDER_TOMBSTONE_TTL_MS = 8 * 60 * 1000;

function orderTombstonesStorageKey(localId: string) {
  return `chefone_pedidos_deleted_orders:${localId}`;
}

function loadOrderTombstones(localId: string): Map<string, number> {
  if (typeof window === 'undefined') return new Map();
  try {
    const raw = sessionStorage.getItem(orderTombstonesStorageKey(localId));
    if (!raw) return new Map();
    const o = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    const m = new Map<string, number>();
    for (const [id, exp] of Object.entries(o)) {
      if (typeof exp === 'number' && exp > now) m.set(id, exp);
    }
    return m;
  } catch {
    return new Map();
  }
}

function saveOrderTombstones(localId: string, map: Map<string, number>) {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    const o: Record<string, number> = {};
    for (const [id, exp] of map) {
      if (exp > now) o[id] = exp;
    }
    sessionStorage.setItem(orderTombstonesStorageKey(localId), JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

function activeOrderTombstoneSet(map: Map<string, number>): Set<string> {
  const now = Date.now();
  for (const [id, exp] of [...map]) {
    if (exp <= now) map.delete(id);
  }
  return new Set(map.keys());
}

function readOrdersFromSession(localId: string): PedidoOrder[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ordersSessionKey(localId));
    if (raw == null) return null;
    const data = JSON.parse(raw) as unknown;
    return Array.isArray(data) ? (data as PedidoOrder[]) : null;
  } catch {
    return null;
  }
}

function writeOrdersToSession(localId: string, rows: PedidoOrder[]) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(ordersSessionKey(localId), JSON.stringify(rows));
  } catch {
    /* modo privado / cuota */
  }
}

type PedidosOrdersContextValue = {
  orders: PedidoOrder[];
  setOrders: React.Dispatch<React.SetStateAction<PedidoOrder[]>>;
  reloadOrders: () => void;
  reloadError: string | null;
  /** Tras crear un pedido: mantenerlo visible hasta que la lectura Supabase lo devuelva (réplica). */
  pinOrderId: (id: string) => void;
  /** Tras borrar en BD: quitar el pin para no resucitar el pedido. */
  releasePinOrderId: (id: string) => void;
  /** Insertar o sustituir un pedido en memoria (p. ej. tras leerlo por id al crear). */
  upsertOrder: (order: PedidoOrder) => void;
  /** Tras eliminar en Supabase: el merge no debe devolver el pedido por la ventana «reciente». */
  registerDeletedOrderId: (id: string) => void;
  /** Tras marcar recibido: si la réplica aún devuelve `sent`, mantener `received` un momento. */
  registerPendingReceivedOrder: (id: string, receivedAtIso: string, priceReviewArchivedAt?: string) => void;
  /** Tras volver un pedido a enviados desde BD: cancelar el ajuste por réplica. */
  clearPendingReceivedOrder: (id: string) => void;
};

const PedidosOrdersContext = createContext<PedidosOrdersContextValue | null>(null);

export function PedidosOrdersProvider({ children }: { children: React.ReactNode }) {
  const { localCode, localName, localId, email } = useAuth();
  const hasEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);

  const [orders, setOrders] = useState<PedidoOrder[]>([]);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const pinUntilSeenRef = useRef<Set<string>>(new Set());
  const localIdRef = useRef<string | null>(localId ?? null);
  localIdRef.current = localId ?? null;
  /** Evita escribir en sessionStorage el snapshot del local anterior justo tras cambiar de local. */
  const ordersReadyLocalIdRef = useRef<string | null>(null);
  const locallyDeletedOrderIdsRef = useRef<Map<string, number>>(new Map());
  const pendingReceivedByIdRef = useRef(
    new Map<string, { markedAt: number; receivedAtIso: string; priceReviewArchivedAt?: string }>(),
  );

  const registerDeletedOrderId = useCallback((id: string) => {
    const lid = localIdRef.current;
    if (!lid) return;
    locallyDeletedOrderIdsRef.current.set(id, Date.now() + ORDER_TOMBSTONE_TTL_MS);
    saveOrderTombstones(lid, locallyDeletedOrderIdsRef.current);
  }, []);

  const registerPendingReceivedOrder = useCallback(
    (id: string, receivedAtIso: string, priceReviewArchivedAt?: string) => {
      pendingReceivedByIdRef.current.set(id, {
        markedAt: Date.now(),
        receivedAtIso,
        ...(priceReviewArchivedAt != null ? { priceReviewArchivedAt } : {}),
      });
    },
    [],
  );

  const clearPendingReceivedOrder = useCallback((id: string) => {
    pendingReceivedByIdRef.current.delete(id);
  }, []);

  const pinOrderId = useCallback((id: string) => {
    pinUntilSeenRef.current.add(id);
  }, []);

  const releasePinOrderId = useCallback((id: string) => {
    pinUntilSeenRef.current.delete(id);
  }, []);

  const upsertOrder = useCallback((order: PedidoOrder) => {
    pinUntilSeenRef.current.add(order.id);
    setOrders((prev) => {
      const rest = prev.filter((o) => o.id !== order.id);
      return [order, ...rest].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    });
  }, []);

  const reloadOrders = useCallback(() => {
    if (!canUse || !localId) return;
    const targetId = localId;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setReloadError(null);
    void fetchOrders(supabase, targetId).then((rows) => {
      if (localIdRef.current !== targetId) return;
      // No borrar pendingReceived al ver `received`: la primera lectura puede ser correcta y la siguiente
      // (Realtime / 2.º fetch) venir de réplica con `sent` y sin pin el pedido «rebota» a enviados.
      // El pin solo se quita con clearPendingReceivedOrder (p. ej. «Volver a enviados» o archivar en Recepción).
      const tombstones = activeOrderTombstoneSet(locallyDeletedOrderIdsRef.current);
      saveOrderTombstones(targetId, locallyDeletedOrderIdsRef.current);
      setOrders((prev) =>
        mergePedidoOrdersFromServer(prev, rows, pinUntilSeenRef.current, {
          tombstoneIds: tombstones,
          pendingReceivedById: pendingReceivedByIdRef.current,
        }),
      );
      ordersReadyLocalIdRef.current = targetId;
    }).catch((error: unknown) => {
      if (localIdRef.current !== targetId) return;
      const msg = error instanceof Error ? error.message : 'No se pudo recargar pedidos.';
      setReloadError(msg);
    });
  }, [canUse, localId]);

  useLayoutEffect(() => {
    ordersReadyLocalIdRef.current = null;
    setOrders([]);
    pinUntilSeenRef.current.clear();
    locallyDeletedOrderIdsRef.current = localId ? loadOrderTombstones(localId) : new Map();
    pendingReceivedByIdRef.current.clear();
  }, [localId]);

  /** sessionStorage antes del pintado: evita lista vacía al volver a Pedidos desde otro módulo. */
  useLayoutEffect(() => {
    if (!canUse || !localId) return;
    const cached = readOrdersFromSession(localId);
    if (cached !== null) {
      ordersReadyLocalIdRef.current = localId;
      setOrders(cached);
    } else {
      ordersReadyLocalIdRef.current = null;
    }
  }, [canUse, localId]);

  useEffect(() => {
    if (!canUse || !localId) return;
    void reloadOrders();
  }, [canUse, localId, reloadOrders]);

  useEffect(() => {
    if (!canUse || !localId || !hasEntry) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let debounce: number | null = null;
    const scheduleReload = () => {
      if (debounce != null) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        debounce = null;
        reloadOrders();
      }, 1200);
    };
    const channel = supabase
      .channel(`pedidos-orders-rt:${localId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_orders', filter: `local_id=eq.${localId}` },
        scheduleReload,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_order_items', filter: `local_id=eq.${localId}` },
        scheduleReload,
      )
      .subscribe();
    return () => {
      if (debounce != null) window.clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [canUse, hasEntry, localId, reloadOrders]);

  useEffect(() => {
    if (!canUse || !localId) return;
    if (ordersReadyLocalIdRef.current !== localId) return;
    writeOrdersToSession(localId, orders);
  }, [canUse, localId, orders]);

  usePedidosDataChangedListener(reloadOrders, Boolean(hasEntry && canUse));

  const value = useMemo(
    () => ({
      orders,
      setOrders,
      reloadOrders,
      reloadError,
      pinOrderId,
      releasePinOrderId,
      upsertOrder,
      registerDeletedOrderId,
      registerPendingReceivedOrder,
      clearPendingReceivedOrder,
    }),
    [
      orders,
      reloadOrders,
      reloadError,
      pinOrderId,
      releasePinOrderId,
      upsertOrder,
      registerDeletedOrderId,
      registerPendingReceivedOrder,
      clearPendingReceivedOrder,
    ],
  );

  return <PedidosOrdersContext.Provider value={value}>{children}</PedidosOrdersContext.Provider>;
}

export function usePedidosOrders(): PedidosOrdersContextValue {
  const ctx = useContext(PedidosOrdersContext);
  if (!ctx) {
    throw new Error('usePedidosOrders debe usarse dentro de PedidosOrdersProvider (layout /pedidos)');
  }
  return ctx;
}
