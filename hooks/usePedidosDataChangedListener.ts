'use client';

import { useEffect, useRef } from 'react';

const EVENT = 'pedidos:data-changed';

/** Agrupa avisos (Realtime, varias pestañas) para no recargar en ráfaga al cambiar de pantalla. */
const DISPATCH_DEBOUNCE_MS = 1600;
let dispatchTimer: number | null = null;

/** Dispara refresco de datos de pedidos en todas las pantallas del módulo (p. ej. tras Realtime). */
export function dispatchPedidosDataChanged(opts?: { immediate?: boolean }) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem('mermas_reload_pedidos', '1');
  } catch {
    /* modo privado */
  }
  if (opts?.immediate) {
    if (dispatchTimer != null) window.clearTimeout(dispatchTimer);
    dispatchTimer = null;
    window.dispatchEvent(new CustomEvent(EVENT));
    return;
  }
  if (dispatchTimer != null) window.clearTimeout(dispatchTimer);
  dispatchTimer = window.setTimeout(() => {
    dispatchTimer = null;
    window.dispatchEvent(new CustomEvent(EVENT));
  }, DISPATCH_DEBOUNCE_MS);
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
