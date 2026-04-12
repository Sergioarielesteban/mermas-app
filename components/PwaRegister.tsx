'use client';

import { useEffect, useRef, useState } from 'react';

const PWA_WAITING_KEY = 'chef-one-pwa-sw-waiting';

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

    try {
      if (sessionStorage.getItem(PWA_WAITING_KEY) === '1') {
        setUpdateAvailable(true);
      }
    } catch {
      /* sessionStorage no disponible */
    }

    let updateInterval: number | null = null;
    const onControllerChange = () => {
      scheduleReload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const applyWaitingState = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting) {
        waitingWorkerRef.current = registration.waiting;
        setUpdateAvailable(true);
        try {
          sessionStorage.setItem(PWA_WAITING_KEY, '1');
        } catch {
          /* ignore */
        }
        return;
      }
      // Mientras instala la nueva versión, `.waiting` puede ser null un instante: no borrar el aviso todavía.
      if (registration.installing) return;

      waitingWorkerRef.current = null;
      try {
        sessionStorage.removeItem(PWA_WAITING_KEY);
      } catch {
        /* ignore */
      }
      setUpdateAvailable(false);
    };

    const recheckRegistration = (registration: ServiceWorkerRegistration) => {
      applyWaitingState(registration);
      void registration.update().then(() => applyWaitingState(registration));
    };

    void navigator.serviceWorker.register('/sw.js').then((registration) => {
      registrationRef.current = registration;
      recheckRegistration(registration);
      window.setTimeout(() => recheckRegistration(registration), 250);
      window.setTimeout(() => recheckRegistration(registration), 900);
      window.setTimeout(() => recheckRegistration(registration), 2800);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorkerRef.current = registration.waiting ?? newWorker;
            setUpdateAvailable(true);
            try {
              sessionStorage.setItem(PWA_WAITING_KEY, '1');
            } catch {
              /* ignore */
            }
          }
        });
      });

      updateInterval = window.setInterval(() => {
        void registration.update().then(() => applyWaitingState(registration));
      }, 60_000);
    });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
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
      ) : (
        <div className="fixed inset-0 z-[119] bg-black/40" aria-hidden />
      )}
      <div
        className="fixed inset-x-3 z-[120] rounded-2xl bg-zinc-900 px-4 py-4 text-white shadow-2xl ring-2 ring-[#D32F2F]/50 bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
        role="alertdialog"
        aria-labelledby="pwa-update-title"
        aria-describedby="pwa-update-desc"
      >
        <p id="pwa-update-title" className="text-sm font-semibold">
          Nueva versión de la app
        </p>
        <p id="pwa-update-desc" className="mt-1.5 text-xs leading-snug text-zinc-300">
          Hay una actualización lista. Pulsa el botón para cargar la última versión; el aviso no se quita hasta
          actualizar.
        </p>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={applyUpdate}
            disabled={applyingUpdate}
            className="h-10 w-full rounded-lg bg-[#D32F2F] px-3 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-60 sm:w-auto"
          >
            Actualizar a la última versión
          </button>
        </div>
      </div>
    </>
  );
}

