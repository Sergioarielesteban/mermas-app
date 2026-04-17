'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  CalendarRange,
  Clock,
  ClipboardList,
  LayoutGrid,
  Settings2,
  Users,
} from 'lucide-react';

type NavLink = {
  href: string;
  label: string;
  Icon: LucideIcon;
  end?: boolean;
};

const LINKS: NavLink[] = [
  { href: '/personal', label: 'Resumen', Icon: LayoutGrid, end: true },
  { href: '/personal/planificacion', label: 'Cuadrante', Icon: CalendarRange },
  { href: '/personal/fichaje', label: 'Fichaje', Icon: Clock },
  { href: '/personal/registro', label: 'Registro', Icon: ClipboardList },
  { href: '/personal/empleados', label: 'Equipo', Icon: Users },
  { href: '/personal/incidencias', label: 'Incidencias', Icon: AlertTriangle },
  { href: '/personal/configuracion', label: 'Ajustes', Icon: Settings2 },
];

export default function StaffPersonalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-4 pb-24 sm:pb-8">
      <nav
        className="-mx-1 flex gap-1 overflow-x-auto pb-1 scrollbar-thin sm:flex-wrap sm:overflow-visible"
        aria-label="Secciones Personal"
      >
        {LINKS.map(({ href, label, Icon, end }) => {
          const active = end ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition-colors sm:text-sm',
                active
                  ? 'bg-[#D32F2F] text-white shadow-sm'
                  : 'bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200/80 hover:bg-zinc-50',
              ].join(' ')}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2.2} />
              {label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
