'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';

/** Botón "Personalizar panel" para abrir el bottom-sheet de configuración. */
export default function PanelCustomizeButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-white/80 px-3 py-3 text-[12px] font-semibold text-zinc-700 shadow-sm transition-transform active:scale-[0.99]"
    >
      <Sparkles className="h-4 w-4 text-zinc-500" aria-hidden />
      Personalizar panel
    </button>
  );
}
