'use client';

import { Bot, LayoutDashboard } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { canUsePedidosModule } from '@/lib/pedidos-access';

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { localCode, localName, localId, email, profileReady } = useAuth();

  const showOidoChef = profileReady && canUsePedidosModule(localCode, email, localName, localId);

  const goOidoChef = () => {
    router.push('/pedidos#oido-chef');
  };

  const goToControlPanel = () => {
    router.push('/panel');
  };

  const onPedidosAssistant = pathname === '/pedidos';
  const onPanel = pathname === '/panel' || pathname?.startsWith('/panel/');

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-zinc-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md print:hidden"
      aria-label={showOidoChef ? 'Ir a Oído Chef' : 'Volver al panel de control'}
    >
      <div className="mx-auto flex h-16 w-full max-w-md items-center justify-center px-4">
        <button
          type="button"
          onClick={showOidoChef ? goOidoChef : goToControlPanel}
          aria-current={showOidoChef ? (onPedidosAssistant ? 'page' : undefined) : onPanel ? 'page' : undefined}
          className={[
            'flex min-w-[12rem] flex-col items-center justify-center gap-0.5 rounded-2xl px-6 py-2 transition-all',
            showOidoChef
              ? onPedidosAssistant
                ? 'bg-[#D32F2F]/12 text-[#D32F2F] shadow-sm ring-1 ring-[#D32F2F]/25'
                : 'text-zinc-700 hover:bg-red-50'
              : onPanel
                ? 'bg-[#D32F2F]/12 text-[#D32F2F] shadow-sm ring-1 ring-[#D32F2F]/25'
                : 'text-zinc-600 hover:bg-zinc-100',
          ].join(' ')}
        >
          {showOidoChef ? (
            <Bot className="h-6 w-6" strokeWidth={2.25} />
          ) : (
            <LayoutDashboard className="h-6 w-6" strokeWidth={2.25} />
          )}
          <span className="text-[11px] font-bold leading-none tracking-wide">
            {showOidoChef ? 'Oído Chef' : 'Panel de control'}
          </span>
        </button>
      </div>
    </nav>
  );
}
