'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import BottomNav, { BOTTOM_QUICK_ACTIONS_SCROLL_PADDING } from '@/components/BottomNav';
import { useAuth } from '@/components/AuthProvider';
import Logo from '@/components/Logo';
import {
  APP_RESUME_SCROLL_RESTORE_FLAG,
  clearAppResumeState,
  isResumeEligiblePath,
  readAppResumeState,
  shouldRestoreAppResumeRoute,
  writeAppResumeState,
} from '@/lib/app-resume-state';
import { readOperationalScrollY, restoreOperationalScrollY } from '@/lib/persisted-screen-state';

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { email, loading, localId } = useAuth();
  const normalizedEmail = email?.trim().toLowerCase() ?? null;
  const isLogin = pathname === '/login';
  /** Landing pública en `/` (sin sesión); la PWA usa `start_url` `/login` para no pasar por aquí al abrir el icono. */
  const isPublicHome = pathname === '/';
  const isOnboarding = pathname === '/onboarding';
  const isPrecio = pathname === '/precio';
  /** Impresión de etiquetas Producción del día — sin shell (como página de etiqueta de lote). */
  const isProduccionEtiquetasPrint = pathname === '/produccion/etiquetas/print';
  /** Tablet fichaje a pantalla completa (sesión encargado; empleados solo PIN). */
  const isTerminalFichaje =
    pathname === '/terminal-fichaje' || pathname.startsWith('/terminal-fichaje/');
  const [forceUnlock, setForceUnlock] = React.useState(false);
  const loginFallbackTimerRef = React.useRef<number | null>(null);

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
  const isResumeEligibleCurrentPath = isResumeEligiblePath(pathname);

  const saveResumePoint = React.useCallback(() => {
    if (!normalizedEmail || !isResumeEligibleCurrentPath || !pathname) return;
    const href =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : pathname;
    writeAppResumeState({
      href,
      pathname,
      scrollY: readOperationalScrollY(),
      email: normalizedEmail,
      localId: localId ?? null,
    });
  }, [isResumeEligibleCurrentPath, localId, normalizedEmail, pathname]);

  const restoreResumeScrollIfNeeded = React.useCallback(
    (force = false) => {
      if (!normalizedEmail || !isResumeEligibleCurrentPath) return;
      const saved = readAppResumeState(normalizedEmail);
      const currentHref =
        typeof window !== 'undefined'
          ? `${window.location.pathname}${window.location.search}`
          : pathname ?? '/';
      if (!saved || saved.href.split('#')[0] !== currentHref) return;
      if (saved.scrollY <= 8) return;
      const current = readOperationalScrollY();
      if (force || current <= 8) {
        restoreOperationalScrollY(saved.scrollY);
      }
    },
    [isResumeEligibleCurrentPath, normalizedEmail, pathname],
  );

  const restoreResumeRouteIfNeeded = React.useCallback(() => {
    if (!normalizedEmail || typeof window === 'undefined') return false;
    const saved = readAppResumeState(normalizedEmail);
    if (!saved) return false;
    if (!shouldRestoreAppResumeRoute(window.location.pathname, saved)) return false;
    const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (saved.href === currentHref) return false;
    try {
      window.sessionStorage.setItem(APP_RESUME_SCROLL_RESTORE_FLAG, '1');
    } catch {
      /* ignore */
    }
    router.replace(saved.href, { scroll: false });
    return true;
  }, [normalizedEmail, router]);

  useEffect(() => {
    if (!normalizedEmail || !isResumeEligibleCurrentPath) return;
    saveResumePoint();

    let scrollTimer: number | null = null;
    const saveSoon = () => {
      if (scrollTimer != null) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(saveResumePoint, 160);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        saveResumePoint();
        return;
      }
      if (restoreResumeRouteIfNeeded()) return;
      restoreResumeScrollIfNeeded(false);
    };
    const onPageShow = () => {
      if (restoreResumeRouteIfNeeded()) return;
      restoreResumeScrollIfNeeded(false);
    };
    const onFocus = () => {
      if (restoreResumeRouteIfNeeded()) return;
      restoreResumeScrollIfNeeded(false);
    };
    const main = document.querySelector('main');

    if (main instanceof HTMLElement) main.addEventListener('scroll', saveSoon, { passive: true });
    window.addEventListener('scroll', saveSoon, { passive: true });
    window.addEventListener('blur', saveResumePoint);
    window.addEventListener('pagehide', saveResumePoint);
    window.addEventListener('beforeunload', saveResumePoint);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (scrollTimer != null) window.clearTimeout(scrollTimer);
      if (main instanceof HTMLElement) main.removeEventListener('scroll', saveSoon);
      window.removeEventListener('scroll', saveSoon);
      window.removeEventListener('blur', saveResumePoint);
      window.removeEventListener('pagehide', saveResumePoint);
      window.removeEventListener('beforeunload', saveResumePoint);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [
    isResumeEligibleCurrentPath,
    normalizedEmail,
    restoreResumeRouteIfNeeded,
    restoreResumeScrollIfNeeded,
    saveResumePoint,
  ]);

  useEffect(() => {
    if (!normalizedEmail || !isResumeEligibleCurrentPath) return;
    let shouldRestore = false;
    try {
      const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      shouldRestore =
        window.sessionStorage.getItem(APP_RESUME_SCROLL_RESTORE_FLAG) === '1' ||
        navEntry?.type === 'reload' ||
        navEntry?.type === 'back_forward';
      window.sessionStorage.removeItem(APP_RESUME_SCROLL_RESTORE_FLAG);
    } catch {
      shouldRestore = false;
    }
    if (shouldRestore) {
      window.setTimeout(() => {
        if (!restoreResumeRouteIfNeeded()) restoreResumeScrollIfNeeded(true);
      }, 80);
      window.setTimeout(() => {
        if (!restoreResumeRouteIfNeeded()) restoreResumeScrollIfNeeded(true);
      }, 260);
    }
  }, [isResumeEligibleCurrentPath, normalizedEmail, restoreResumeRouteIfNeeded, restoreResumeScrollIfNeeded]);

  useEffect(() => {
    if (loginFallbackTimerRef.current != null) {
      window.clearTimeout(loginFallbackTimerRef.current);
      loginFallbackTimerRef.current = null;
    }
    if (effectiveLoading) return;
    if (email && isPublicHome) {
      const resume = readAppResumeState(normalizedEmail);
      if (resume) {
        try {
          window.sessionStorage.setItem(APP_RESUME_SCROLL_RESTORE_FLAG, '1');
        } catch {
          /* ignore */
        }
      }
      router.replace(resume?.href ?? '/panel');
      return;
    }
    if (!email && !isLogin && !isPublicHome && !isOnboarding && !isPrecio && !isProduccionEtiquetasPrint) {
      router.replace('/login');
      // Fallback in case client router transition gets stuck.
      loginFallbackTimerRef.current = window.setTimeout(() => {
        if (window.location.pathname !== '/login') {
          window.location.replace('/login');
        }
      }, 400);
      return;
    }
    if (email && isLogin) {
      const resume = readAppResumeState(normalizedEmail);
      if (resume) {
        try {
          window.sessionStorage.setItem(APP_RESUME_SCROLL_RESTORE_FLAG, '1');
        } catch {
          /* ignore */
        }
      }
      router.replace(resume?.href ?? '/panel');
    }
    return () => {
      if (loginFallbackTimerRef.current != null) {
        window.clearTimeout(loginFallbackTimerRef.current);
        loginFallbackTimerRef.current = null;
      }
    };
  }, [
    effectiveLoading,
    email,
    isLogin,
    isPublicHome,
    isOnboarding,
    isPrecio,
    isProduccionEtiquetasPrint,
    router,
    normalizedEmail,
  ]);

  // /login y la landing en / no usan el shell de la app ni el bloqueo de "Cargando sesión".
  if (isLogin || isPublicHome || isOnboarding || isPrecio) {
    return <main className="flex min-h-screen flex-col bg-white">{children}</main>;
  }

  // Resto de rutas: esperar auth o desbloqueo por tiempo.
  if (effectiveLoading) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-start bg-white px-4 py-8 sm:justify-center sm:py-10">
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          <p className="order-1 text-center text-sm font-medium text-zinc-500">Cargando sesión…</p>
          <div className="order-2 flex w-full max-w-xs flex-col gap-2">
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
                  clearAppResumeState();
                  window.location.replace('/login');
                }
              }}
              className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-xs font-bold uppercase tracking-wide text-zinc-700"
            >
              Reiniciar sesión
            </button>
          </div>
          <p className="order-3 px-2 text-center text-[11px] leading-snug text-zinc-400">
            Vista previa estrecha: si no ves cambios, abre{' '}
            <a href="/login" className="font-semibold text-[#D32F2F] underline underline-offset-2">
              /login
            </a>{' '}
            o la landing en{' '}
            <a href="/" className="font-semibold text-[#D32F2F] underline underline-offset-2">
              /
            </a>{' '}
            en Chrome o Safari.
          </p>
          <div className="order-last mt-1 w-full">
            <Logo variant="login" className="mx-auto" />
          </div>
        </div>
      </main>
    );
  }

  /** Sin sesión en rutas protegidas: la redirect a /login puede tardar un frame — nunca devolver null (pantalla en blanco). */
  if (!email && !isLogin && !isOnboarding && !isPrecio && !isProduccionEtiquetasPrint) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-white px-6 text-center">
        <p className="text-sm font-medium text-zinc-600">Redirigiendo al acceso…</p>
        <a
          href="/login"
          className="text-sm font-semibold text-[#D32F2F] underline underline-offset-2"
        >
          Ir a iniciar sesión
        </a>
      </main>
    );
  }

  if (isTerminalFichaje) {
    return (
      <main className="flex min-h-[100dvh] flex-col bg-zinc-950 text-white">{children}</main>
    );
  }

  if (isProduccionEtiquetasPrint) {
    return (
      <main className="min-h-[100dvh] bg-white p-4 text-zinc-900 print:bg-white print:p-0">{children}</main>
    );
  }

  const escandalloRecipeEditRoute =
    pathname != null && /^\/escandallos\/recetas\/.+\/editar$/.test(pathname);
  /** En editor receta móvil no hay BottomNav: solo safe area; desde lg el padding reserva la barra. */
  const shellPadEscandalloRecipeEdit =
    'max-lg:pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] lg:pb-[calc(4.75rem+max(0.5rem,env(safe-area-inset-bottom,0px)))]';

  return (
    <>
      <div
        className={[
          'flex min-h-0 flex-1 flex-col overflow-hidden',
          escandalloRecipeEditRoute ? shellPadEscandalloRecipeEdit : '',
        ].join(' ')}
        style={
          escandalloRecipeEditRoute
            ? undefined
            : {
                paddingBottom: `calc(${BOTTOM_QUICK_ACTIONS_SCROLL_PADDING} + max(0.5rem, env(safe-area-inset-bottom, 0px)))`,
              }
        }
      >
        <AppShell>{children}</AppShell>
      </div>
      <BottomNav />
    </>
  );
}
