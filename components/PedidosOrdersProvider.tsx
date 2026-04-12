'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { usePedidosDataChangedListener } from '@/hooks/usePedidosDataChangedListener';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import {
  fetchOrders,
  mergePedidoOrdersFromServer,
  type PedidoOrder,
} from '@/lib/pedidos-supabase';
import { getSupabaseClient } from '@/lib/supabase-client';

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
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchOrders(supabase, localId).then((rows) => {
      setOrders((prev) => mergePedidoOrdersFromServer(prev, rows, pinUntilSeenRef.current));
    });
  }, [canUse, localId]);

  useEffect(() => {
    setOrders([]);
    pinUntilSeenRef.current.clear();
  }, [localId]);

  useEffect(() => {
    if (!canUse || !localId) return;
    reloadOrders();
  }, [canUse, localId, reloadOrders]);

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
