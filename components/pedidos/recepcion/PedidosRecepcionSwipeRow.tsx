'use client';

import React from 'react';
import { AlertTriangle, Check } from 'lucide-react';

type Props = {
  children: React.ReactNode;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  /** Tap corto sin gesto horizontal (p. ej. expandir detalle). */
  onTap?: () => void;
  disabled?: boolean;
  className?: string;
};

const COMMIT_PX = 52;
const TAP_MAX_PX = 14;

/**
 * Fila deslizable para recepción rápida: derecha = OK, izquierda = incidencia.
 * Sin dependencias externas; puntero táctil + ratón.
 */
export default function PedidosRecepcionSwipeRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  onTap,
  disabled,
  className,
}: Props) {
  const originRef = React.useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const [offset, setOffset] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, button, select, a, [data-no-swipe]')) return;
    originRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture opcional */
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const o = originRef.current;
    if (!o || o.pointerId !== e.pointerId) return;
    const dx = e.clientX - o.x;
    const dy = e.clientY - o.y;
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      e.preventDefault();
    }
    setOffset(Math.max(-76, Math.min(76, dx)));
  };

  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    const o = originRef.current;
    if (!o || o.pointerId !== e.pointerId) return;
    const dx = e.clientX - o.x;
    const dy = e.clientY - o.y;
    const pid = o.pointerId;
    originRef.current = null;
    setDragging(false);
    setOffset(0);
    try {
      e.currentTarget.releasePointerCapture(pid);
    } catch {
      /* ignore */
    }

    if (Math.abs(dx) >= COMMIT_PX && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) onSwipeRight();
      else onSwipeLeft();
      return;
    }
    if (Math.abs(dx) < TAP_MAX_PX && Math.abs(dy) < TAP_MAX_PX && onTap) {
      onTap();
    }
  };

  return (
    <div className={['relative overflow-hidden rounded-xl touch-pan-y', className ?? ''].join(' ')}>
      <div className="pointer-events-none absolute inset-0 flex justify-between">
        <div className="flex w-12 items-center justify-start bg-emerald-500/[0.11] pl-2 sm:w-14">
          <Check className="h-[1.15rem] w-[1.15rem] text-emerald-700 sm:h-5 sm:w-5" strokeWidth={2.5} aria-hidden />
        </div>
        <div className="flex w-12 items-center justify-end bg-orange-500/[0.11] pr-2 sm:w-14">
          <AlertTriangle className="h-[1.1rem] w-[1.1rem] text-orange-700 sm:h-5 sm:w-5" strokeWidth={2.25} aria-hidden />
        </div>
      </div>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        className={[
          'relative rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-zinc-200/85',
          dragging ? '' : 'transition-transform duration-200 ease-out',
        ].join(' ')}
        style={{ transform: `translateX(${offset}px)` }}
      >
        {children}
      </div>
    </div>
  );
}
