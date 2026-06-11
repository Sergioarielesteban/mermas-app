'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS: { href: string; label: string }[] = [
  { href: '/inventario', label: 'Stock' },
  { href: '/inventario/movimientos', label: 'Movimientos' },
  { href: '/inventario/conteo', label: 'Conteo' },
  { href: '/inventario/valoracion', label: 'Valoración' },
];

type Props = { className?: string };

export default function InventarioSubnav({ className = '' }: Props) {
  const pathname = usePathname();
  return (
    <nav
      className={`flex gap-1 overflow-x-auto pb-1 sm:flex-wrap ${className}`.trim()}
      aria-label="Secciones Inventario"
    >
      {LINKS.map(({ href, label }) => {
        const active =
          href === '/inventario' ? pathname === '/inventario' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={[
              'shrink-0 rounded-xl px-3 py-2 text-xs font-bold sm:text-sm',
              active
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50',
            ].join(' ')}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
