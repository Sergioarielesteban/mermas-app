'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart2, ClipboardList, History, Package } from 'lucide-react';

const LINKS: {
  href: string;
  label: string;
  Icon: typeof Package;
  iconClass: string;
}[] = [
  {
    href: '/inventario',
    label: 'Stock',
    Icon: Package,
    iconClass: 'bg-[#D32F2F]/[0.09] text-[#D32F2F] ring-[#D32F2F]/12',
  },
  {
    href: '/inventario/movimientos',
    label: 'Movimientos',
    Icon: History,
    iconClass: 'bg-sky-50 text-sky-700 ring-sky-200/70',
  },
  {
    href: '/inventario/conteo',
    label: 'Conteo',
    Icon: ClipboardList,
    iconClass: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
  },
  {
    href: '/inventario/valoracion',
    label: 'Valoración',
    Icon: BarChart2,
    iconClass: 'bg-amber-50 text-amber-700 ring-amber-200/70',
  },
];

function navActive(pathname: string, href: string): boolean {
  return href === '/inventario' ? pathname === '/inventario' : pathname.startsWith(href);
}

type Props = { className?: string };

export default function InventarioSubnav({ className = '' }: Props) {
  const pathname = usePathname();

  return (
    <section
      className={`min-w-0 max-w-full overflow-hidden rounded-[24px] border border-zinc-200/80 bg-white/95 p-2 shadow-[0_14px_34px_rgba(15,23,42,0.04)] ring-1 ring-zinc-100/80 sm:p-2.5 ${className}`.trim()}
    >
      <nav aria-label="Secciones Inventario" className="grid min-w-0 grid-cols-2 gap-1.5 sm:gap-2">
        {LINKS.map(({ href, label, Icon, iconClass }) => {
          const active = navActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={[
                'group flex min-h-[2.5rem] min-w-0 items-center gap-1.5 rounded-[18px] border px-2 py-1.5 text-left transition active:scale-[0.99] sm:min-h-[2.65rem] sm:gap-2 sm:px-2.5 sm:py-2',
                active
                  ? 'border-[#D32F2F]/18 bg-[#FFF7F5] shadow-[0_4px_16px_rgba(211,47,47,0.08)] ring-1 ring-[#D32F2F]/10'
                  : 'border-zinc-200/80 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] ring-1 ring-zinc-200/70',
              ].join(' ')}
            >
              <span
                className={[
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full ring-1 sm:h-7 sm:w-7',
                  iconClass,
                ].join(' ')}
              >
                <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={2} aria-hidden />
              </span>
              <span className="min-w-0 truncate text-[12px] font-black leading-tight text-zinc-950 sm:text-[13px]">
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
