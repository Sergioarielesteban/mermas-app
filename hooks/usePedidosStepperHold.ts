'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export type PedidosStepperHoldOptions = {
  /** Espera antes del primer repeat (ms). */
  delayBeforeRepeatMs?: number;
  /** Intervalo fase lenta (ms). */
  slowIntervalMs?: number;
  /** Intervalo fase rápida (ms). */
  fastIntervalMs?: number;
  /** Tras este tiempo desde que arranca el repeat lento, pasar a saltos grandes. */
  accelAfterMs?: number;
  /** Paso en fase lenta (normalmente 1). */
  slowStep?: number;
  /** Paso en fase rápida (p. ej. 5 cajas). */
  fastStep?: number;
};

/**
 * Mantener +/−: primer tick al pulsar, luego repeat lento (+1) y aceleración (+5 por tick).
 * Refs internos para no stale closures; limpia timers al soltar y al desmontar.
 */
export function usePedidosStepperHold(
  onDelta: (delta: number) => void,
  options?: PedidosStepperHoldOptions,
) {
  const delayBeforeRepeatMs = options?.delayBeforeRepeatMs ?? 400;
  const slowIntervalMs = options?.slowIntervalMs ?? 96;
  const fastIntervalMs = options?.fastIntervalMs ?? 68;
  const accelAfterMs = options?.accelAfterMs ?? 780;
  const slowStep = options?.slowStep ?? 1;
  const fastStep = options?.fastStep ?? 5;

  const onDeltaRef = useRef(onDelta);
  onDeltaRef.current = onDelta;

  const signRef = useRef<1 | -1>(1);
  const timeoutStartRef = useRef<number | null>(null);
  const intervalSlowRef = useRef<number | null>(null);
  const intervalFastRef = useRef<number | null>(null);
  const accelTimerRef = useRef<number | null>(null);

  const clearAll = useCallback(() => {
    if (timeoutStartRef.current != null) {
      window.clearTimeout(timeoutStartRef.current);
      timeoutStartRef.current = null;
    }
    if (intervalSlowRef.current != null) {
      window.clearInterval(intervalSlowRef.current);
      intervalSlowRef.current = null;
    }
    if (intervalFastRef.current != null) {
      window.clearInterval(intervalFastRef.current);
      intervalFastRef.current = null;
    }
    if (accelTimerRef.current != null) {
      window.clearTimeout(accelTimerRef.current);
      accelTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearAll(), [clearAll]);

  const startHold = useCallback(
    (sign: 1 | -1) => {
      clearAll();
      signRef.current = sign;
      onDeltaRef.current(sign * slowStep);

      const switchToFast = () => {
        if (intervalSlowRef.current != null) {
          window.clearInterval(intervalSlowRef.current);
          intervalSlowRef.current = null;
        }
        if (accelTimerRef.current != null) {
          window.clearTimeout(accelTimerRef.current);
          accelTimerRef.current = null;
        }
        if (intervalFastRef.current != null) return;
        intervalFastRef.current = window.setInterval(() => {
          onDeltaRef.current(sign * fastStep);
        }, fastIntervalMs);
      };

      timeoutStartRef.current = window.setTimeout(() => {
        timeoutStartRef.current = null;
        intervalSlowRef.current = window.setInterval(() => {
          onDeltaRef.current(sign * slowStep);
        }, slowIntervalMs);

        accelTimerRef.current = window.setTimeout(() => {
          switchToFast();
        }, accelAfterMs);
      }, delayBeforeRepeatMs);
    },
    [accelAfterMs, clearAll, delayBeforeRepeatMs, fastIntervalMs, fastStep, slowIntervalMs, slowStep],
  );

  const endHold = useCallback(() => {
    clearAll();
  }, [clearAll]);

  const onPlusPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      startHold(1);
    },
    [startHold],
  );

  const onMinusPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      startHold(-1);
    },
    [startHold],
  );

  return useMemo(
    () => ({
      onPlusPointerDown,
      onMinusPointerDown,
      onHoldPointerEnd: endHold,
    }),
    [endHold, onMinusPointerDown, onPlusPointerDown],
  );
}
