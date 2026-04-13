'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useCallback, useMemo, useState } from 'react';
import {
  BookOpen,
  ClipboardList,
  Drumstick,
  LogOut,
  Menu,
  MessageCircle,
  X,
  RefreshCcw,
  ShoppingCart,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import PullToRefreshPedidos from '@/components/PullToRefreshPedidos';
import { canAccessPedidos } from '@/lib/pedidos-access';
import { formatLocalHeaderName } from '@/lib/local-display-name';
import ChefOneGlowLine from '@/components/ChefOneGlowLine';

type NavItem = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Mermas', Icon: BookOpen },
  { href: '/productos', label: 'Añadir Productos', Icon: Drumstick },
];
function titleForPath(pathname: string | null) {
  if (!pathname) return 'Mermas';
  if (pathname === '/panel' || pathname.startsWith('/panel/')) return 'Panel de control';
  if (pathname === '/' || pathname.startsWith('/dashboard')) return 'Mermas';
  if (pathname.startsWith('/productos')) return 'Añadir Productos';
  if (pathname.startsWith('/resumen')) return 'Resumen';
  if (pathname.startsWith('/pedidos')) return 'Pedidos';
  if (pathname.startsWith('/inventario')) return 'Inventario';
  if (pathname.startsWith('/chat')) return 'Chat del local';
  if (pathname === '/appcc') return 'APPCC';
  if (pathname.startsWith('/appcc/temperaturas')) return 'Temperaturas';
  if (pathname.startsWith('/appcc/historial')) return 'Historial';
  if (pathname.startsWith('/appcc/equipos')) return 'Equipos frío';
  if (pathname.startsWith('/appcc/aceite/registro')) return 'Aceite';
  if (pathname.startsWith('/appcc/aceite/historial')) return 'Historial aceite';
  if (pathname.startsWith('/appcc/aceite/equipos')) return 'Freidoras';
  if (pathname.startsWith('/appcc/aceite')) return 'Aceite';
  if (pathname.startsWith('/appcc')) return 'APPCC';
  return 'Mermas';
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const { email, logout, localId, localCode, localName } = useAuth();
  const localLabel = formatLocalHeaderName(localName ?? localCode) ?? localName ?? localCode;
  const showPedidos = canAccessPedidos(localCode, email, localName, localId);

  const title = useMemo(() => titleForPath(pathname), [pathname]);
  const isPanelRoute = pathname === '/panel' || pathname?.startsWith('/panel/');
  const navItems = useMemo<NavItem[]>(
    () => [
      ...(showPedidos ? [...NAV_ITEMS, { href: '/pedidos', label: 'Pedidos', Icon: ShoppingCart }] : NAV_ITEMS),
      { href: '/inventario', label: 'Inventario', Icon: ClipboardList },
      { href: '/chat', label: 'Chat', Icon: MessageCircle },
    ],
    [showPedidos],
  );

  const confirmAndLogout = () => setConfirmLogoutOpen(true);

  const goToControlPanel = useCallback(() => {
    router.push('/panel');
  }, [router]);

  /** Recarga la página sin borrar el service worker ni las cachés (evita “reinicio total” de la PWA). */
  const refreshApp = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-full bg-white">
      {confirmLogoutOpen ? (
        <>
          <button
            type="button"
            aria-hidden
            onClick={() => setConfirmLogoutOpen(false)}
            className="fixed inset-0 z-[70] bg-black/45"
            tabIndex={-1}
          />
          <div className="fixed inset-0 z-[80] grid place-items-center px-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl ring-1 ring-zinc-200">
              <p className="text-sm font-extrabold text-zinc-900">Confirmar cierre de sesión</p>
              <p className="mt-1 text-sm text-zinc-600">¿Seguro que quieres cerrar sesión?</p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmLogoutOpen(false)}
                  className="h-10 flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-bold text-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmLogoutOpen(false);
                    void logout();
                  }}
                  className="h-10 flex-1 rounded-xl bg-[#D32F2F] px-3 text-sm font-bold text-white"
                >
                  Cerrar sesión
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <header
        className={[
          'sticky top-0 z-40 shadow-lg print:hidden',
          isPanelRoute
            ? 'border-b border-zinc-800 bg-zinc-950'
            : 'border-b border-[#b32020] bg-gradient-to-r from-[#B91C1C] to-[#D32F2F]',
        ].join(' ')}
      >
        <div className="mx-auto flex min-h-14 w-full max-w-md items-center gap-3 px-3 py-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white/95 hover:bg-white/10 active:scale-[0.99]"
            aria-label="Abrir menú"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/95 px-1.5 ring-1 ring-white/40">
            <img
              src="/logo-chef-one-wordmark.svg"
              alt=""
              role="presentation"
              className="h-6 w-auto max-w-[4.5rem] object-contain object-left"
              width={512}
              height={160}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="line-clamp-1 text-sm font-extrabold uppercase tracking-wide text-white">
              {title}
            </h1>
            {localId && localLabel ? (
              <p className="line-clamp-1 text-[10px] font-semibold uppercase tracking-wider text-white/85">
                {localLabel}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={refreshApp}
            className="grid h-10 w-10 place-items-center rounded-xl text-white/95 hover:bg-white/10 active:scale-[0.99]"
            aria-label="Actualizar app"
            title="Actualizar app"
          >
            <RefreshCcw className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={confirmAndLogout}
            className="grid h-10 w-10 place-items-center rounded-xl text-white/95 hover:bg-white/10 active:scale-[0.99]"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Backdrop */}
      <button
        type="button"
        aria-hidden={!open}
        onClick={() => setOpen(false)}
        className={[
          'fixed inset-0 z-50 bg-black/40 transition-opacity print:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        tabIndex={-1}
      />

      {/* Drawer */}
      <aside
        className={[
          'fixed left-0 top-0 z-[60] h-full w-[84%] max-w-[320px] bg-white shadow-2xl transition-transform print:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        aria-label="Menú lateral"
      >
        <div className="relative border-b border-zinc-200 bg-white px-3 pb-5 pt-4">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-100"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex flex-col items-center px-2 pb-1 pt-9 text-center">
            <img
              src="/logo-chef-one-wordmark.svg"
              alt=""
              role="presentation"
              className="h-12 w-auto max-w-[min(72vw,260px)] select-none sm:h-14"
              width={512}
              height={176}
            />
            <ChefOneGlowLine className="mx-auto mt-4 w-[min(70vw,220px)]" />
            <p className="mt-3 text-xs text-zinc-600">Gestión operativa</p>
          </div>
          <div className="mt-4 rounded-xl bg-zinc-50 px-3 py-2.5 text-xs leading-snug text-zinc-600 ring-1 ring-zinc-200">
            Plataforma interna de control de costes y desperdicio.
          </div>
        </div>

        <nav className="px-2 py-3">
          {navItems.map((item) => {
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard' || pathname === '/'
                : pathname === item.href || pathname?.startsWith(`${item.href}/`);
            const Icon = item.Icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={[
                  'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-all',
                  isActive
                    ? 'bg-[#D32F2F]/10 text-[#D32F2F] shadow-sm ring-1 ring-[#D32F2F]/25'
                    : 'text-zinc-800 hover:bg-zinc-100',
                ].join(' ')}
              >
                <Icon className="h-5 w-5" />
                <span className="min-w-0 truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4">
          <div className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
            <div className="text-xs font-semibold text-zinc-700">Sesión</div>
            <div className="mt-1 truncate text-xs text-zinc-500">{email ?? 'Sin usuario'}</div>
            {localId && localLabel ? (
              <div className="mt-1 truncate text-xs font-medium text-zinc-700">{localLabel}</div>
            ) : null}
            <button
              type="button"
              onClick={refreshApp}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Actualizar version app
            </button>
            <button
              type="button"
              onClick={() => {
                confirmAndLogout();
                setOpen(false);
              }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"
            >
              <LogOut className="h-3.5 w-3.5" />
              Cerrar Sesión
            </button>
            <div className="mt-2 text-[11px] text-zinc-500">
              {localId
                ? 'Datos del local sincronizados con Supabase.'
                : 'Datos guardados en este dispositivo (localStorage).'}
            </div>
          </div>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-md px-4 py-5">
        {pathname !== '/panel' && !pathname?.startsWith('/panel/') ? (
          <div className="mb-4 space-y-1.5 print:hidden">
            <button
              type="button"
              onClick={goToControlPanel}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white py-2.5 text-sm font-bold text-zinc-800 shadow-sm ring-1 ring-zinc-200/80 hover:bg-zinc-50 active:scale-[0.99]"
            >
              <span aria-hidden>←</span>
              Panel de control
            </button>
            <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Módulo · {title}
            </p>
          </div>
        ) : null}
        <PullToRefreshPedidos>{children}</PullToRefreshPedidos>
      </main>
    </div>
  );
}

