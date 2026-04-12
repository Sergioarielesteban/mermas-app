'use client';

import { useEffect, useRef } from 'react';

const EVENT = 'pedidos:data-changed';

/** Aviso tras guardar en Supabase (misma pestaña). El layout de pedidos escucha y llama a `reloadOrders`. */
export function dispatchPedidosDataChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT));
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
