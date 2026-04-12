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
  /** Tras crear un pedido: mantenerlo visible hasta que la lectura Supabase lo devuelva (réplica). */
  pinOrderId: (id: string) => void;
  /** Tras borrar en BD: quitar el pin para no resucitar el pedido. */
  releasePinOrderId: (id: string) => void;
  /** Insertar o sustituir un pedido en memoria (p. ej. tras leerlo por id al crear). */
  upsertOrder: (order: PedidoOrder) => void;
};

const PedidosOrdersContext = createContext<PedidosOrdersContextValue | null>(null);

export function PedidosOrdersProvider({ children }: { children: React.ReactNode }) {
  const { localCode, localName, localId, email } = useAuth();
  const hasEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);

  const [orders, setOrders] = useState<PedidoOrder[]>([]);
  const pinUntilSeenRef = useRef<Set<string>>(new Set());
  const localIdRef = useRef<string | null>(localId ?? null);
  localIdRef.current = localId ?? null;
  /** Evita escribir en sessionStorage el snapshot del local anterior justo tras cambiar de local. */
  const ordersReadyLocalIdRef = useRef<string | null>(null);

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
    void fetchOrders(supabase, targetId).then((rows) => {
      if (localIdRef.current !== targetId) return;
      setOrders((prev) =>
        mergePedidoOrdersFromServer(prev, rows, pinUntilSeenRef.current),
      );
      ordersReadyLocalIdRef.current = targetId;
    });
  }, [canUse, localId]);

  useLayoutEffect(() => {
    ordersReadyLocalIdRef.current = null;
    setOrders([]);
    pinUntilSeenRef.current.clear();
  }, [localId]);

  useEffect(() => {
    if (!canUse || !localId) return;
    const cached = readOrdersFromSession(localId);
    if (cached !== null) {
      ordersReadyLocalIdRef.current = localId;
      setOrders(cached);
      return;
    }
    ordersReadyLocalIdRef.current = null;
    reloadOrders();
  }, [canUse, localId, reloadOrders]);

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
      pinOrderId,
      releasePinOrderId,
      upsertOrder,
    }),
    [orders, reloadOrders, pinOrderId, releasePinOrderId, upsertOrder],
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
