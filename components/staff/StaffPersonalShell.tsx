'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  CalendarRange,
  ClipboardList,
  Clock,
  LayoutGrid,
  LayoutPanelTop,
  Send,
  Settings2,
  Smartphone,
  Users,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { buildStaffPermissions } from '@/lib/staff/permissions';
import StaffMiBottomNav from '@/components/staff/StaffMiBottomNav';

type NavLink = {
  href: string;
  label: string;
  Icon: LucideIcon;
  end?: boolean;
  managerOnly?: boolean;
  staffVisible?: boolean;
};

const LINKS: NavLink[] = [
  { href: '/personal', label: 'Resumen', Icon: LayoutGrid, end: true, staffVisible: true },
  { href: '/personal/planificacion', label: 'Cuadrante', Icon: CalendarRange, staffVisible: true },
  { href: '/personal/control', label: 'Control', Icon: LayoutPanelTop, managerOnly: true },
  { href: '/personal/fichaje', label: 'Fichaje', Icon: Clock, managerOnly: true },
  { href: '/personal/registro', label: 'Registro', Icon: ClipboardList, managerOnly: true },
  { href: '/personal/empleados', label: 'Equipo', Icon: Users, managerOnly: true },
  { href: '/personal/solicitudes', label: 'Solicitudes', Icon: Send, managerOnly: true },
  { href: '/personal/incidencias', label: 'Incidencias', Icon: AlertTriangle, managerOnly: true },
  { href: '/personal/configuracion', label: 'Ajustes', Icon: Settings2, managerOnly: true },
];

export default function StaffPersonalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profileRole } = useAuth();
  const perms = React.useMemo(() => buildStaffPermissions(profileRole), [profileRole]);
  const isMiApp = pathname.startsWith('/personal/mi');

  return (
    <div className={isMiApp ? 'space-y-4 pb-24 sm:pb-24 md:space-y-5' : 'space-y-4 pb-24 sm:pb-8 md:space-y-5'}>
      {!isMiApp ? (
        <nav
          className="-mx-1 flex gap-1 overflow-x-auto pb-1 scrollbar-thin sm:flex-wrap sm:gap-2 sm:overflow-visible md:gap-2"
          aria-label="Secciones Personal"
        >
          {LINKS.filter((l) => !l.managerOnly || perms.canViewTeamSummary).map((link) => {
            if (!perms.canViewTeamSummary && !link.staffVisible) return null;
            const { href, label, Icon, end } = link;
            const active = end ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition-colors sm:text-sm md:px-4 md:py-2.5 md:text-sm',
                  active
                    ? 'bg-[#D32F2F] text-white shadow-sm'
                    : 'bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200/80 hover:bg-zinc-50',
                ].join(' ')}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-90 md:h-5 md:w-5" strokeWidth={2.2} />
                {label}
              </Link>
            );
          })}
          <Link
            href="/personal/mi"
            className={[
              'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition-colors sm:text-sm md:px-4 md:py-2.5 md:text-sm',
              isMiApp
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80 hover:bg-emerald-100/80',
            ].join(' ')}
          >
            <Smartphone className="h-4 w-4 shrink-0 md:h-5 md:w-5" strokeWidth={2.2} />
            Mi espacio
          </Link>
        </nav>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-zinc-900 px-3 py-2 text-white shadow-sm ring-1 ring-zinc-700/50">
          <p className="text-xs font-extrabold uppercase tracking-wide text-white/80">Vista empleado</p>
          <Link
            href="/personal"
            className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/25"
          >
            Salir al panel
          </Link>
        </div>
      )}
      {children}
      {isMiApp ? <StaffMiBottomNav /> : null}
    </div>
  );
}
