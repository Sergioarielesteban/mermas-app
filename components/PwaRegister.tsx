'use client';

import { useEffect, useRef, useState } from 'react';

export default function PwaRegister() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const reloadScheduledRef = useRef(false);

  const scheduleReload = () => {
    if (reloadScheduledRef.current) return;
    reloadScheduledRef.current = true;
    window.location.reload();
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    let updateInterval: number | null = null;
    const onControllerChange = () => {
      scheduleReload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const syncWaitingBanner = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting) {
        waitingWorkerRef.current = registration.waiting;
        setUpdateAvailable(true);
      }
    };

    void navigator.serviceWorker.register('/sw.js').then((registration) => {
      registrationRef.current = registration;
      syncWaitingBanner(registration);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorkerRef.current = registration.waiting ?? newWorker;
            setUpdateAvailable(true);
          }
        });
      });

      updateInterval = window.setInterval(() => {
        void registration.update().then(() => syncWaitingBanner(registration));
      }, 60_000);
    });

    const onReturnToApp = () => {
      const reg = registrationRef.current;
      if (document.visibilityState === 'visible' && reg?.waiting) {
        waitingWorkerRef.current = reg.waiting;
        setUpdateAvailable(true);
      }
    };
    document.addEventListener('visibilitychange', onReturnToApp);
    window.addEventListener('pageshow', onReturnToApp);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onReturnToApp);
      window.removeEventListener('pageshow', onReturnToApp);
      if (updateInterval) window.clearInterval(updateInterval);
    };
  }, []);

  const applyUpdate = () => {
    setApplyingUpdate(true);
    void (async () => {
      try {
        const reg =
          (await navigator.serviceWorker.getRegistration()) ?? registrationRef.current ?? (await navigator.serviceWorker.ready);
        const waiting = reg.waiting ?? waitingWorkerRef.current ?? null;

        if (waiting) {
          const fallbackMs = 4500;
          const t = window.setTimeout(() => scheduleReload(), fallbackMs);
          const clearFallback = () => window.clearTimeout(t);
          navigator.serviceWorker.addEventListener('controllerchange', clearFallback, { once: true });
          waiting.postMessage({ type: 'SKIP_WAITING' });
          return;
        }

        await reg.update();
        scheduleReload();
      } catch {
        scheduleReload();
      }
    })();
  };

  if (!updateAvailable) return null;

  return (
    <>
      {applyingUpdate ? (
        <div
          className="fixed inset-0 z-[200] grid place-items-center bg-black/40 px-6"
          role="status"
          aria-live="polite"
        >
          <div className="max-w-sm rounded-2xl bg-zinc-900 px-6 py-5 text-center text-white shadow-2xl ring-1 ring-zinc-600">
            <p className="text-sm font-semibold">Aplicando actualización…</p>
            <p className="mt-2 text-xs text-zinc-400">La app se recargará en un momento.</p>
          </div>
        </div>
      ) : null}
      <div className="fixed inset-x-3 z-[120] rounded-2xl bg-zinc-900 px-4 py-3 text-white shadow-2xl ring-1 ring-zinc-700 bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
        <p className="text-sm font-semibold">Hay una nueva versión disponible.</p>
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setUpdateAvailable(false)}
            className="h-9 rounded-lg border border-zinc-600 px-3 text-xs font-bold uppercase tracking-wide text-zinc-200"
          >
            Luego
          </button>
          <button
            type="button"
            onClick={applyUpdate}
            disabled={applyingUpdate}
            className="h-9 rounded-lg bg-[#D32F2F] px-3 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-60"
          >
            Actualizar ahora
          </button>
        </div>
      </div>
    </>
  );
}

