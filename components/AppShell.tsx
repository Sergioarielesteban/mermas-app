'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Drumstick,
  LayoutDashboard,
  Menu,
  X,
  FileText,
} from 'lucide-react';

const BRAND_RED = '#D32F2F';

type NavItem = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Registro de Mermas', Icon: BookOpen },
  { href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/productos', label: 'Añadir Productos', Icon: Drumstick },
  { href: '/resumen', label: 'Resumen', Icon: FileText },
];

function titleForPath(pathname: string | null) {
  if (!pathname) return 'Mermas';
  if (pathname === '/') return 'Registro de Mermas';
  if (pathname.startsWith('/dashboard')) return 'Dashboard';
  if (pathname.startsWith('/productos')) return 'Añadir Productos';
  if (pathname.startsWith('/resumen')) return 'Resumen';
  return 'Mermas';
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const title = useMemo(() => titleForPath(pathname), [pathname]);

  return (
    <div className="min-h-full bg-zinc-50">
      <header className="sticky top-0 z-40 bg-[#D32F2F]">
        <div className="mx-auto flex h-14 w-full max-w-md items-center gap-3 px-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-xl text-white/95 hover:bg-white/10 active:scale-[0.99]"
            aria-label="Abrir menú"
          >
            <Menu className="h-6 w-6" />
          </button>
          <h1 className="text-sm font-extrabold uppercase tracking-wide text-white">
            {title}
          </h1>
          <div className="flex-1" />
        </div>
      </header>

      {/* Backdrop */}
      <button
        type="button"
        aria-hidden={!open}
        onClick={() => setOpen(false)}
        className={[
          'fixed inset-0 z-50 bg-black/40 transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        tabIndex={-1}
      />

      {/* Drawer */}
      <aside
        className={[
          'fixed left-0 top-0 z-[60] h-full w-[84%] max-w-[320px] bg-white shadow-xl transition-transform',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        aria-label="Menú lateral"
      >
        <div className="flex h-14 items-center gap-3 bg-white px-3">
          <div
            className="grid h-10 w-10 place-items-center rounded-xl"
            style={{ backgroundColor: `${BRAND_RED}15` }}
          >
            <span className="text-sm font-black" style={{ color: BRAND_RED }}>
              XA
            </span>
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold text-zinc-900">XAMPA MERMAS</div>
            <div className="truncate text-xs text-zinc-500">Gestión de mermas</div>
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="grid h-10 w-10 place-items-center rounded-xl text-zinc-700 hover:bg-zinc-100"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="px-2 py-2">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname?.startsWith(`${item.href}/`);
            const Icon = item.Icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={[
                  'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors',
                  isActive ? 'bg-[#D32F2F]/10 text-[#D32F2F]' : 'text-zinc-800 hover:bg-zinc-100',
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
            <div className="text-xs font-semibold text-zinc-700">Modo demo</div>
            <div className="mt-1 text-xs text-zinc-500">
              Datos guardados en este dispositivo (localStorage).
            </div>
          </div>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-md px-4 py-4">{children}</main>
    </div>
  );
}

