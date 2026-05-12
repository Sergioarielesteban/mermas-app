'use client';

import React from 'react';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** When false, backdrop click and close button do nothing. */
  allowClose?: boolean;
};

/** Overlay + panel scrollable (drawer móvil, centrado en desktop). */
export function ProveedoresModalShell({ open, title, onClose, children, allowClose = true }: Props) {
  React.useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && allowClose) onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose, allowClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex flex-col justify-end sm:justify-center sm:p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Cerrar"
        disabled={!allowClose}
        className="absolute inset-0 bg-zinc-950/35 backdrop-blur-[2px] disabled:pointer-events-none"
        onClick={() => allowClose && onClose()}
      />
      <div
        className="relative z-[96] mx-auto flex max-h-[min(92dvh,840px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] border border-white/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,250,249,0.98))] shadow-[0_24px_60px_rgba(15,23,42,0.14)] ring-1 ring-zinc-200/70 sm:max-w-xl sm:rounded-[24px]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100/80 bg-white/70 px-4 py-3 backdrop-blur">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">Editar</p>
            <h2 className="mt-0.5 text-sm font-semibold tracking-tight text-zinc-950">{title}</h2>
          </div>
          <button
            type="button"
            disabled={!allowClose}
            onClick={() => allowClose && onClose()}
            className="grid h-9 w-9 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm transition hover:bg-zinc-50 disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
      </div>
    </div>
  );
}
