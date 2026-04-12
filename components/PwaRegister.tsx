'use client';

import { useEffect, useRef, useState } from 'react';

export default function PwaRegister() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    let updateInterval: number | null = null;
    const onControllerChange = () => {
      window.location.reload();
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
    const waiting = waitingWorkerRef.current ?? registrationRef.current?.waiting ?? null;
    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    if (registrationRef.current) {
      void registrationRef.current.update().finally(() => window.location.reload());
      return;
    }
    window.location.reload();
  };

  if (!updateAvailable) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[90] rounded-2xl bg-zinc-900 px-4 py-3 text-white shadow-2xl ring-1 ring-zinc-700">
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
          className="h-9 rounded-lg bg-[#D32F2F] px-3 text-xs font-bold uppercase tracking-wide text-white"
        >
          Actualizar ahora
        </button>
      </div>
    </div>
  );
}

