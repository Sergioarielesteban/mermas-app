'use client';

import React from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';

type Props = {
  onOpen: () => void;
};

/** Card núcleo del asistente operativo en el panel central. */
export default function PanelAssistantCard({ onOpen }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative w-full overflow-hidden rounded-3xl bg-white p-4 text-left shadow-sm ring-1 ring-zinc-200/90 transition active:scale-[0.99] sm:p-5"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[#D32F2F]/0 via-[#D32F2F] to-[#D32F2F]/0 opacity-90"
        aria-hidden
      />
      <div className="flex items-start gap-3.5">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#D32F2F]/10 text-[#D32F2F] ring-1 ring-[#D32F2F]/15">
          <Sparkles className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="font-serif text-[17px] font-normal leading-snug tracking-tight text-zinc-900">
            Asistente Chef One
          </p>
          <p className="mt-1 text-[13px] leading-snug text-zinc-600">
            Consulta información operativa en tiempo real
          </p>
          <p className="mt-2 text-[11px] font-medium text-zinc-400">
            Pedidos · albaranes · APPCC · incidencias · precios y más
          </p>
        </div>
        <ChevronRight
          className="mt-1 h-5 w-5 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500"
          aria-hidden
        />
      </div>
    </button>
  );
}
