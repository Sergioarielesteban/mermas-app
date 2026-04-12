'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import BottomNav from '@/components/BottomNav';
import { useAuth } from '@/components/AuthProvider';
import ChefOneLaunchMark from '@/components/ChefOneLaunchMark';

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { email, loading } = useAuth();
  const isLogin = pathname === '/login';
  /** Landing pública en `/` (sin sesión); la PWA usa `start_url` `/login` para no pasar por aquí al abrir el icono. */
  const isPublicHome = pathname === '/';
  const [forceUnlock, setForceUnlock] = React.useState(false);

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
    if (email && isPublicHome) {
      router.replace('/panel');
      return;
    }
    if (!email && !isLogin && !isPublicHome) {
      router.replace('/login');
      // Fallback in case client router transition gets stuck.
      window.setTimeout(() => {
        if (window.location.pathname !== '/login') {
          window.location.replace('/login');
        }
      }, 400);
    }
    if (email && isLogin) {
      router.replace('/panel');
    }
  }, [effectiveLoading, email, isLogin, isPublicHome, router]);

  // /login y la landing en / no usan el shell de la app ni el bloqueo de "Cargando sesión".
  if (isLogin || isPublicHome) {
    return <main className="min-h-screen flex flex-col bg-white">{children}</main>;
  }

  // Resto de rutas: esperar auth o desbloqueo por tiempo.
  if (effectiveLoading) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-6">
        <div className="flex w-full max-w-md flex-col items-center">
          <ChefOneLaunchMark />
          <p className="mt-8 text-sm font-medium text-zinc-500">Cargando sesión…</p>
          <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
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
        </div>
      </main>
    );
  }

  if (!email && !isLogin) {
    return null;
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

