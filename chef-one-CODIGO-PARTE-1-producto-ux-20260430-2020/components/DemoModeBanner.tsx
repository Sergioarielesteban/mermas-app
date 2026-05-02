'use client';

import React, { useEffect, useState } from 'react';
import { exitDemoMode, isDemoMode } from '@/lib/demo-mode';

export default function DemoModeBanner() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(isDemoMode());
  }, []);

  if (!active) return null;

  return (
    <div className="sticky top-0 z-[45] border-b border-amber-300/90 bg-amber-100 px-3 py-2 text-center shadow-sm print:hidden">
      <p className="text-xs font-bold text-amber-950 sm:text-sm">
        Modo demo: estás viendo datos simulados. Nada se guarda en tu cuenta real.
      </p>
      <button
        type="button"
        className="mt-1.5 min-h-[40px] w-full max-w-sm rounded-xl border border-amber-800/30 bg-white px-4 text-xs font-black uppercase tracking-wide text-amber-950 shadow-sm sm:mt-0 sm:ml-3 sm:w-auto sm:py-2"
        onClick={() => {
          exitDemoMode();
          window.location.assign('/login');
        }}
      >
        Salir de demo
      </button>
    </div>
  );
}
