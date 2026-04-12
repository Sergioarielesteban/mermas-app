'use client';

import { LayoutDashboard } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  const goToControlPanel = () => {
    router.push('/panel');
  };

  const onPanel = pathname === '/panel' || pathname?.startsWith('/panel/');

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-zinc-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md print:hidden"
      aria-label="Volver al panel de control"
    >
      <div className="mx-auto flex h-16 w-full max-w-md items-center justify-center px-4">
        <button
          type="button"
          onClick={goToControlPanel}
          aria-current={onPanel ? 'page' : undefined}
          className={[
            'flex min-w-[12rem] flex-col items-center justify-center gap-0.5 rounded-2xl px-6 py-2 transition-all',
            onPanel
              ? 'bg-[#D32F2F]/12 text-[#D32F2F] shadow-sm ring-1 ring-[#D32F2F]/25'
              : 'text-zinc-600 hover:bg-zinc-100',
          ].join(' ')}
        >
          <LayoutDashboard className="h-6 w-6" strokeWidth={2.25} />
          <span className="text-[11px] font-bold leading-none tracking-wide">Panel de control</span>
        </button>
      </div>
    </nav>
  );
}
