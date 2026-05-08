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
    <div className="fixed inset-0 z-[95] flex flex-col justify-end sm:justify-center sm:p-4" role="dialog" aria-modal>
      <button
        type="button"
        aria-label="Cerrar"
        disabled={!allowClose}
        className="absolute inset-0 bg-black/50 disabled:pointer-events-none"
        onClick={() => allowClose && onClose()}
      />
      <div
        className="relative z-[96] mx-auto flex max-h-[min(92dvh,800px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-zinc-200 sm:max-w-xl sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 bg-white px-4 py-3">
          <h2 className="text-sm font-bold tracking-tight text-zinc-900">{title}</h2>
          <button
            type="button"
            disabled={!allowClose}
            onClick={() => allowClose && onClose()}
            className="grid h-9 w-9 place-items-center rounded-xl text-zinc-500 transition hover:bg-zinc-100 disabled:opacity-40"
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
