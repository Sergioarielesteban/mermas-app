'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import BottomNav from '@/components/BottomNav';
import { useAuth } from '@/components/AuthProvider';
import { SESSION_SHOW_CONTROL_PANEL } from '@/lib/session-flags';

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
    }, 3500);
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

  // Keep server and first client paint aligned to avoid hydration mismatch.
  if (effectiveLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-50 px-4">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm font-semibold text-zinc-600">Cargando sesión...</p>
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

  if (isLogin) {
    return <main className="min-h-screen px-4 py-8">{children}</main>;
  }

  if (showSplash) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#fafafa] px-6">
        <img
          src="/logo-chef-one.svg"
          alt="Chef-One"
          className="h-auto w-full max-w-[min(20rem,88vw)] select-none"
          width={320}
          height={320}
          decoding="async"
        />
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

