'use client';

import { useCallback, useRef } from 'react';

type Options = { delayBeforeRepeatMs?: number; repeatIntervalMs?: number };

/**
 * Mantener pulsado para repetir la acción (p. ej. + cantidad en pedidos).
 * pointerdown: un tick; tras un retardo, intervalo hasta soltar.
 */
export function useRepeatPress(onTick: () => void, options?: Options) {
  const delayBeforeRepeatMs = options?.delayBeforeRepeatMs ?? 420;
  const repeatIntervalMs = options?.repeatIntervalMs ?? 100;
  const tickRef = useRef(onTick);
  tickRef.current = onTick;
  const timeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      clearTimers();
      tickRef.current();
      timeoutRef.current = window.setTimeout(() => {
        intervalRef.current = window.setInterval(() => {
          tickRef.current();
        }, repeatIntervalMs);
      }, delayBeforeRepeatMs);
    },
    [clearTimers, delayBeforeRepeatMs, repeatIntervalMs],
  );

  const onPointerEnd = useCallback(() => {
    clearTimers();
  }, [clearTimers]);

  return {
    onPointerDown,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
    onPointerLeave: onPointerEnd,
  };
}
