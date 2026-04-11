'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import BottomNav from '@/components/BottomNav';
import { useAuth } from '@/components/AuthProvider';
import { SESSION_SHOW_CONTROL_PANEL } from '@/lib/session-flags';
import ChefOneGlowLine from '@/components/ChefOneGlowLine';

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { email, loading } = useAuth();
  const isLogin = pathname === '/login';
  const [forceUnlock, setForceUnlock] = React.useState(false);
  const [showSplash, setShowSplash] = React.useState(true);

  useEffect(() => {
    if (!loading) {
      setForceUnlock(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setForceUnlock(true);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const effectiveLoading = loading && !forceUnlock;

  useEffect(() => {
    if (effectiveLoading) return;
    if (!email && !isLogin) {
      router.replace('/login');
      // Fallback in case client router transition gets stuck.
      window.setTimeout(() => {
        if (window.location.pathname !== '/login') {
          window.location.replace('/login');
        }
      }, 400);
    }
    if (email && isLogin) {
      try {
        sessionStorage.setItem(SESSION_SHOW_CONTROL_PANEL, '1');
      } catch {
        /* modo privado u otro */
      }
      router.replace('/panel');
    }
  }, [effectiveLoading, email, isLogin, router]);

  useEffect(() => {
    if (effectiveLoading || isLogin || !email) return;
    const timer = window.setTimeout(() => setShowSplash(false), 1800);
    return () => window.clearTimeout(timer);
  }, [effectiveLoading, isLogin, email]);

  // /login nunca debe quedar detrás de "Cargando sesión" (getSession puede tardar o colgarse en red).
  if (isLogin) {
    return <main className="min-h-screen flex flex-col bg-white">{children}</main>;
  }

  // Resto de rutas: esperar auth o desbloqueo por tiempo.
  if (effectiveLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-50 px-4">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm font-semibold text-zinc-600">Cargando sesión...</p>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') window.location.assign('/login');
            }}
            className="h-10 rounded-xl bg-[#D32F2F] px-4 text-xs font-bold uppercase tracking-wide text-white"
          >
            Ir al acceso
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                const keys = Object.keys(window.localStorage);
                for (const key of keys) {
                  if (key.startsWith('sb-') && key.includes('-auth-token')) {
                    window.localStorage.removeItem(key);
                  }
                }
                window.localStorage.removeItem('mermas_user_email');
                window.location.replace('/login');
              }
            }}
            className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-xs font-bold uppercase tracking-wide text-zinc-700"
          >
            Reiniciar sesión
          </button>
        </div>
      </main>
    );
  }

  if (!email && !isLogin) {
    return null;
  }

  if (showSplash) {
    return (
      <main className="grid min-h-screen place-items-center bg-white px-6">
        <div className="flex w-full max-w-sm flex-col items-center">
          <img
            src="/logo-chef-one-wordmark.svg"
            alt="Chef-One"
            className="w-[min(88vw,400px)] max-w-full select-none"
            width={512}
            height={176}
            decoding="async"
          />
          <ChefOneGlowLine className="mx-auto mt-6 w-[min(75vw,280px)] sm:mt-7" />
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <AppShell>{children}</AppShell>
      </div>
      <BottomNav />
    </>
  );
}

