'use client';

import { Bot, LayoutDashboard } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { canUsePedidosModule } from '@/lib/pedidos-access';
import { goBackOrToPanel } from '@/lib/navigate-back-or-fallback';

/** Pedidos escucha esto y arranca el micrófono (mismo flujo que 🎙 Voz). */
export const OIDO_CHEF_START_VOICE_EVENT = 'oido-chef-start-voice';
export const OIDO_CHEF_VOICE_NAV_FLAG = 'oido-chef-autovoz-v1';

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { localCode, localName, localId, email, profileReady } = useAuth();

  const showOidoChef = profileReady && canUsePedidosModule(localCode, email, localName, localId);

  const goOidoChef = () => {
    if (pathname === '/pedidos') {
      if (typeof window !== 'undefined') {
        const onAssistant = new URLSearchParams(window.location.search).get('oido') === '1';
        if (onAssistant) {
          window.location.hash = 'oido-chef';
          window.dispatchEvent(new Event(OIDO_CHEF_START_VOICE_EVENT));
          return;
        }
        router.push('/pedidos?oido=1#oido-chef');
        return;
      }
    }
    let useQueryFallback = false;
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(OIDO_CHEF_VOICE_NAV_FLAG, '1');
      }
    } catch {
      useQueryFallback = true;
    }
    router.push(useQueryFallback ? '/pedidos?voz=1&oido=1#oido-chef' : '/pedidos?oido=1#oido-chef');
  };

  const goBackInApp = () => {
    goBackOrToPanel(router);
  };

  const onPedidosAssistant = pathname === '/pedidos';

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-zinc-200/80 bg-white/95 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] backdrop-blur-md print:hidden"
      aria-label={showOidoChef ? 'Oído Chef: ir a Pedidos y activar el micrófono' : 'Volver a la pantalla anterior'}
    >
      <div className="mx-auto flex min-h-16 w-full max-w-full items-center justify-center px-4 py-2 sm:max-w-2xl md:max-w-4xl lg:max-w-5xl">
        <button
          type="button"
          onClick={showOidoChef ? goOidoChef : goBackInApp}
          aria-current={showOidoChef ? (onPedidosAssistant ? 'page' : undefined) : undefined}
          className={[
            'flex min-w-[12rem] flex-col items-center justify-center gap-0.5 rounded-2xl px-6 py-2 transition-all',
            showOidoChef
              ? onPedidosAssistant
                ? 'bg-[#D32F2F]/12 text-[#D32F2F] shadow-sm ring-1 ring-[#D32F2F]/25'
                : 'text-zinc-700 hover:bg-red-50'
              : 'text-zinc-600 hover:bg-zinc-100',
          ].join(' ')}
        >
          {showOidoChef ? (
            <Bot className="h-6 w-6" strokeWidth={2.25} />
          ) : (
            <LayoutDashboard className="h-6 w-6" strokeWidth={2.25} />
          )}
          <span className="text-[11px] font-bold leading-none tracking-wide">
            {showOidoChef ? 'Oído Chef' : 'Volver'}
          </span>
        </button>
      </div>
    </nav>
  );
}
