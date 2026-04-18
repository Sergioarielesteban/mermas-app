'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { CalendarDays, Home, Send, User, Users } from 'lucide-react';

const LINKS: { href: string; label: string; Icon: LucideIcon; end?: boolean }[] = [
  { href: '/personal/mi', label: 'Inicio', Icon: Home, end: true },
  { href: '/personal/mi/turnos', label: 'Turnos', Icon: CalendarDays },
  { href: '/personal/mi/equipo', label: 'Equipo', Icon: Users },
  { href: '/personal/mi/solicitudes', label: 'Solicitudes', Icon: Send },
  { href: '/personal/mi/cuenta', label: 'Cuenta', Icon: User },
];

export default function StaffMiBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200/90 bg-white/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-md sm:px-2"
      aria-label="Mi espacio"
    >
      <div className="mx-auto flex max-w-lg justify-between gap-0">
        {LINKS.map(({ href, label, Icon, end }) => {
          const active = end ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-extrabold transition-colors',
                active ? 'text-[#D32F2F]' : 'text-zinc-500 hover:text-zinc-800',
              ].join(' ')}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={2.2} aria-hidden />
              <span className="truncate px-0.5">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
