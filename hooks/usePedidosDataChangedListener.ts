'use client';

import { useEffect, useRef } from 'react';

const EVENT = 'pedidos:data-changed';

/** Dispara refresco de datos de pedidos en todas las pantallas del módulo (p. ej. tras Realtime). */
export function dispatchPedidosDataChanged() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem('mermas_reload_pedidos', '1');
  } catch {
    /* modo privado */
  }
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
