'use client';

import React from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';

type Props = {
  onOpen: () => void;
};

/** Entrada discreta al asistente operativo desde el panel central. */
export default function PanelAssistantCard({ onOpen }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-left ring-1 ring-zinc-200/70 transition active:scale-[0.99]"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-400">
        <Sparkles className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold tracking-tight text-zinc-800">
          Asistente Chef One
        </p>
        <p className="mt-0.5 text-[11.5px] text-zinc-400">
          Pregunta al jefe de cocina digital
        </p>
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-400"
        aria-hidden
      />
    </button>
  );
}
