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
  adminOnly?: boolean;
  /** Gestión de equipo (admin o encargado con permiso). */
  teamManagement?: boolean;
  staffVisible?: boolean;
  /** Fichaje/registro en móvil (no manager). */
  personalMobileClock?: boolean;
};

const LINKS: NavLink[] = [
  { href: '/personal', label: 'Resumen', Icon: LayoutGrid, end: true, staffVisible: true },
  { href: '/personal/planificacion', label: 'Cuadrante', Icon: CalendarRange, adminOnly: true },
  { href: '/personal/control', label: 'Control', Icon: LayoutPanelTop, adminOnly: true },
  /** Solo admin y staff (móvil); manager usa la tablet central. */
  { href: '/personal/fichaje', label: 'Fichaje', Icon: Clock, staffVisible: true, personalMobileClock: true },
  { href: '/personal/registro', label: 'Registro', Icon: ClipboardList, staffVisible: true, personalMobileClock: true },
  { href: '/personal/empleados', label: 'Equipo', Icon: Users, teamManagement: true },
  { href: '/personal/solicitudes', label: 'Solicitudes', Icon: Send, adminOnly: true },
  { href: '/personal/incidencias', label: 'Incidencias', Icon: AlertTriangle, adminOnly: true },
  { href: '/personal/configuracion', label: 'Ajustes', Icon: Settings2, adminOnly: true },
];

const pillBase =
  'inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-bold transition-colors sm:px-4 sm:text-sm';
const pillActive = 'bg-[#D32F2F] text-white';
const pillInactive = 'bg-[#ebebeb] text-zinc-800 hover:bg-[#e0e0e0]';

/**
 * Pills de sección Personal. Colocar justo debajo del `ModuleHeader` en cada página (no en `/personal/mi/*`).
 */
export function PersonalSectionNav() {
  const pathname = usePathname();
  const { profileRole } = useAuth();
  const perms = React.useMemo(() => buildStaffPermissions(profileRole), [profileRole]);
  const isMiApp = pathname.startsWith('/personal/mi');
  const role = profileRole ?? 'staff';
  const isAdmin = role === 'admin';

  if (isMiApp) return null;

  return (
    <div className="rounded-xl bg-[#f5f5f5] p-2 sm:p-3">
      <nav
        className="flex flex-nowrap items-stretch gap-2 overflow-x-auto overscroll-x-contain scrollbar-thin"
        aria-label="Secciones Personal"
      >
        {LINKS.filter((l) => {
          if (l.teamManagement) return perms.canManageEmployees;
          if (l.adminOnly) return isAdmin;
          if (l.managerOnly) return perms.canViewTeamSummary;
          if (l.personalMobileClock) return perms.canAccessPersonalFichajeRoutes;
          if (role === 'manager') return Boolean(l.staffVisible) && !l.personalMobileClock;
          return true;
        }).map((link) => {
          if (!perms.canViewTeamSummary && !link.staffVisible) return null;
          const { href, label, Icon, end } = link;
          const active = end ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} className={[pillBase, active ? pillActive : pillInactive].join(' ')}>
              <Icon className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2.2} />
              {label}
            </Link>
          );
        })}
        <Link href="/personal/mi" className={[pillBase, pillInactive].join(' ')}>
          <Smartphone className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2.2} />
          Mi espacio
        </Link>
      </nav>
    </div>
  );
}

export default function StaffPersonalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMiApp = pathname.startsWith('/personal/mi');

  return (
    <div className={isMiApp ? 'space-y-4 pb-24 sm:pb-24 md:space-y-5' : 'space-y-4 pb-24 sm:pb-8 md:space-y-5'}>
      {isMiApp ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-zinc-900 px-3 py-2 text-white shadow-sm ring-1 ring-zinc-700/50">
          <p className="text-xs font-extrabold uppercase tracking-wide text-white/80">Vista empleado</p>
          <Link
            href="/personal"
            className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/25"
          >
            Salir al panel
          </Link>
        </div>
      ) : null}
      {children}
      {isMiApp ? <StaffMiBottomNav /> : null}
    </div>
  );
}
