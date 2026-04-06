'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Info } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: 'Registro de Mermas', Icon: BookOpen },
  { href: '/dashboard', label: 'Dashboard', Icon: Info },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 h-16 border-t border-zinc-200 bg-white/90 backdrop-blur"
      aria-label="Navegación inferior"
    >
      <div className="mx-auto flex h-full w-full max-w-md">
        {NAV_ITEMS.map((item) => {
          const Icon = item.Icon;
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname?.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={[
                'flex flex-1 flex-col items-center justify-center gap-1 px-2',
                'transition-colors',
                isActive ? 'text-[#D32F2F]' : 'text-zinc-500',
              ].join(' ')}
            >
              <Icon className="h-6 w-6" strokeWidth={2.25} />
              <span className="max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold leading-none">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

