'use client';

import { RefreshCw } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { dispatchPedidosDataChanged } from '@/hooks/usePedidosDataChangedListener';

/** Desplazamiento visual máximo del indicador (px). */
const MAX_PULL_PX = 52;
/** Mínimo arrastre visual (tras amortiguar) para disparar refresco. */
const THRESHOLD_VISUAL = 34;

function dampen(deltaY: number) {
  return Math.min(deltaY * 0.38, MAX_PULL_PX);
}

function atScrollTop() {
  const y = window.scrollY ?? document.documentElement.scrollTop ?? 0;
  return y <= 2;
}

/**
 * En rutas /pedidos*, gesto tirar hacia abajo con el dedo (estando arriba del todo)
 * vuelve a pedir datos a Supabase vía el mismo canal que el resto del módulo.
 */
export default function PullToRefreshPedidos({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const enabled = Boolean(pathname?.startsWith('/pedidos'));
  const wrapRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  refreshingRef.current = refreshing;

  useEffect(() => {
    const el = wrapRef.current;
    if (!enabled || !el) return;

    const touchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (!atScrollTop()) return;
      startYRef.current = e.touches[0].clientY;
    };

    const touchMove = (e: TouchEvent) => {
      if (startYRef.current == null || refreshingRef.current) return;
      if (!atScrollTop()) {
        startYRef.current = null;
        pullRef.current = 0;
        setPullPx(0);
        return;
      }
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy <= 0) {
        pullRef.current = 0;
        setPullPx(0);
        return;
      }
      e.preventDefault();
      const p = dampen(dy);
      pullRef.current = p;
      setPullPx(p);
    };

    const finish = () => {
      const wasPulling = startYRef.current != null || pullRef.current > 0;
      if (!wasPulling) return;

      const p = pullRef.current;
      startYRef.current = null;
      pullRef.current = 0;
      setPullPx(0);

      if (refreshingRef.current) return;

      if (p >= THRESHOLD_VISUAL) {
        try {
          navigator.vibrate?.(12);
        } catch {
          /* no vibración */
        }
        setRefreshing(true);
        dispatchPedidosDataChanged();
        window.setTimeout(() => setRefreshing(false), 800);
      }
    };

    el.addEventListener('touchstart', touchStart, { passive: true });
    el.addEventListener('touchmove', touchMove, { passive: false });
    el.addEventListener('touchend', finish);
    el.addEventListener('touchcancel', finish);

    return () => {
      el.removeEventListener('touchstart', touchStart);
      el.removeEventListener('touchmove', touchMove);
      el.removeEventListener('touchend', finish);
      el.removeEventListener('touchcancel', finish);
    };
  }, [enabled]);

  if (!enabled) {
    return <>{children}</>;
  }

  const showIndicator = pullPx > 4 || refreshing;
  const indicatorHeight = refreshing ? Math.max(pullPx, 44) : pullPx;

  return (
    <div ref={wrapRef} className="relative">
      <div
        className="flex flex-col items-center justify-end overflow-hidden text-[#D32F2F] transition-[height] duration-100 ease-out"
        style={{ height: showIndicator ? indicatorHeight : 0 }}
        aria-hidden
      >
        {showIndicator ? (
          <RefreshCw className={`mb-1 h-5 w-5 shrink-0 ${refreshing ? 'animate-spin' : ''}`} strokeWidth={2.5} />
        ) : null}
      </div>
      <div className="sr-only" aria-live="polite">
        {refreshing ? 'Actualizando pedidos…' : ''}
      </div>
      {children}
    </div>
  );
}
