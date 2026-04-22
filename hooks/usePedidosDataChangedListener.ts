'use client';

import { useEffect, useRef } from 'react';

const EVENT = 'pedidos:data-changed';
const DISPATCH_COALESCE_MS = 180;
let lastDispatchAt = 0;
let pendingDispatchTimer: number | null = null;

/** Aviso tras guardar en Supabase (misma pestaña). El layout de pedidos escucha y llama a `reloadOrders`. */
export function dispatchPedidosDataChanged() {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const elapsed = now - lastDispatchAt;
  if (elapsed >= DISPATCH_COALESCE_MS) {
    lastDispatchAt = now;
    window.dispatchEvent(new CustomEvent(EVENT));
    return;
  }
  if (pendingDispatchTimer != null) return;
  pendingDispatchTimer = window.setTimeout(() => {
    pendingDispatchTimer = null;
    lastDispatchAt = Date.now();
    window.dispatchEvent(new CustomEvent(EVENT));
  }, DISPATCH_COALESCE_MS - elapsed);
}

export function usePedidosDataChangedListener(onRefresh: () => void, active: boolean) {
  const ref = useRef(onRefresh);
  ref.current = onRefresh;
  useEffect(() => {
    if (!active) return;
    const h = () => ref.current();
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, [active]);
}
