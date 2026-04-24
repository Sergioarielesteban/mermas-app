'use client';

import { Plus, Thermometer } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { canUsePedidosModule } from '@/lib/pedidos-access';

/** Pedidos escucha esto y arranca el micrófono (mismo flujo que 🎙 Voz). */
export const OIDO_CHEF_START_VOICE_EVENT = 'oido-chef-start-voice';
export const OIDO_CHEF_VOICE_NAV_FLAG = 'oido-chef-autovoz-v1';

/**
 * Reservar en el contenedor con scroll: altura de la barra fija (sin el safe area;
 * se suma en `AppFrame` con `max(0.5rem, env(safe-area-inset-bottom))`).
 */
export const BOTTOM_QUICK_ACTIONS_SCROLL_PADDING = '4.75rem' as const;

const MERMA_REGISTER_HASH = 'merma-register-form';

function QuickLink({
  href,
  label,
  active,
  primary,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  primary: boolean;
  children: ReactNode;
}) {
  const iconClass = primary
    ? 'text-white'
    : active
      ? 'text-[#B91C1C]'
      : 'text-zinc-600';
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex min-h-[2.75rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1.5 text-center transition-colors',
        'touch-manipulation active:scale-[0.99]',
        primary
          ? [
              'bg-[#D32F2F] text-white shadow-sm shadow-[#D32F2F]/20',
              active ? 'ring-2 ring-[#B91C1C] ring-offset-1 ring-offset-white' : 'hover:bg-[#C62828]',
            ].join(' ')
          : [
              'border border-zinc-200/90 bg-zinc-50/95 text-zinc-900 ring-1 ring-zinc-200/50',
              active
                ? 'bg-red-50/90 ring-[#D32F2F]/25'
                : 'hover:border-zinc-300 hover:bg-zinc-100/90',
            ].join(' '),
      ].join(' ')}
    >
      <span className={iconClass}>{children}</span>
      <span
        className={[
          'w-full max-w-full truncate text-[11px] font-bold leading-tight tracking-wide',
          primary ? 'text-white' : active ? 'text-[#8B1A1A]' : 'text-zinc-800',
        ].join(' ')}
      >
        {label}
      </span>
    </Link>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const { localCode, localName, localId, email, profileReady } = useAuth();

  const showBar = profileReady && canUsePedidosModule(localCode, email, localName, localId);

  if (!showBar) return null;

  const mermaActive = pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  const pedidoActive = pathname === '/pedidos/nuevo' || pathname.startsWith('/pedidos/nuevo/');
  const tempActive = pathname.startsWith('/appcc/temperaturas');

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-zinc-200/80 bg-white/98 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] shadow-[0_-6px_24px_rgba(15,15,20,0.08)] print:hidden"
      aria-label="Accesos rápidos: nuevo pedido, merma, temperaturas"
    >
      <div className="mx-auto flex w-full max-w-full items-stretch justify-center gap-2 px-3 py-2 sm:max-w-2xl sm:px-4 md:max-w-4xl md:px-4 lg:max-w-5xl">
        <QuickLink
          href="/pedidos/nuevo"
          label="+ Pedido"
          primary
          active={pedidoActive}
        >
          <Plus className="h-5 w-5" strokeWidth={2.4} aria-hidden />
        </QuickLink>
        <QuickLink
          href={`/dashboard#${MERMA_REGISTER_HASH}`}
          label="+ Merma"
          primary={false}
          active={mermaActive}
        >
          <Plus className="h-5 w-5" strokeWidth={2.4} aria-hidden />
        </QuickLink>
        <QuickLink
          href="/appcc/temperaturas"
          label="Temp."
          primary={false}
          active={tempActive}
        >
          <Thermometer className="h-5 w-5" strokeWidth={2.4} aria-hidden />
        </QuickLink>
      </div>
    </nav>
  );
}
