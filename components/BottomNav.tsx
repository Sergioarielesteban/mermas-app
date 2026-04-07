'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Info, ShoppingCart } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { canAccessPedidos } from '@/lib/pedidos-access';

const NAV_ITEMS = [
  { href: '/', label: 'Registro de Mermas', Icon: BookOpen },
  { href: '/pedidos', label: 'Pedidos', Icon: ShoppingCart },
  { href: '/dashboard', label: 'Dashboard', Icon: Info },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const { localCode, email } = useAuth();
  const items = canAccessPedidos(localCode, email)
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => item.href !== '/pedidos');

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-zinc-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      aria-label="Navegación inferior"
    >
      <div className="mx-auto flex h-16 w-full max-w-md px-1">
        {items.map((item) => {
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
                'flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 transition-all',
                isActive
                  ? 'bg-[#D32F2F]/10 text-[#D32F2F] shadow-sm ring-1 ring-[#D32F2F]/20'
                  : 'text-zinc-500 hover:bg-zinc-100',
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

