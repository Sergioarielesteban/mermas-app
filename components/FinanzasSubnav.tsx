'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS: { href: string; label: string }[] = [
  { href: '/finanzas', label: 'Resumen' },
  { href: '/finanzas/datos', label: 'Datos' },
  { href: '/finanzas/compras', label: 'Compras' },
  { href: '/finanzas/proveedores', label: 'Proveedores' },
  { href: '/finanzas/articulos', label: 'Artículos' },
  { href: '/finanzas/precios', label: 'Precios' },
  { href: '/finanzas/mermas', label: 'Mermas' },
  { href: '/finanzas/albaranes', label: 'Albaranes' },
];

export default function FinanzasSubnav() {
  const pathname = usePathname();
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto pb-1 sm:flex-wrap" aria-label="Secciones Finanzas">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href || (href !== '/finanzas' && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={[
              'shrink-0 rounded-xl px-3 py-2 text-xs font-bold sm:text-sm',
              active ? 'bg-zinc-900 text-white' : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50',
            ].join(' ')}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
