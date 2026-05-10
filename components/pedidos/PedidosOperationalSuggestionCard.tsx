'use client';

import { CalendarClock, Link2, Package, Sparkles, X } from 'lucide-react';
import React from 'react';
import type { OperationalSuggestion, OperationalSuggestionKind } from '@/lib/pedidos-operational-suggestions';

function KindIcon({ kind }: { kind: OperationalSuggestionKind }) {
  const cls = 'h-3.5 w-3.5 shrink-0 text-[#D32F2F]';
  switch (kind) {
    case 'pair':
      return <Link2 className={cls} strokeWidth={2} aria-hidden />;
    case 'weekly_pattern':
      return <CalendarClock className={cls} strokeWidth={2} aria-hidden />;
    case 'rhythm_low':
      return <Package className={cls} strokeWidth={2} aria-hidden />;
    default:
      return <Sparkles className={cls} strokeWidth={2} aria-hidden />;
  }
}

export type PedidosOperationalSuggestionCardProps = {
  suggestion: OperationalSuggestion;
  onAdd: () => void;
  onDismiss: () => void;
  disabled?: boolean;
};

export default React.memo(function PedidosOperationalSuggestionCard({
  suggestion,
  onAdd,
  onDismiss,
  disabled,
}: PedidosOperationalSuggestionCardProps) {
  return (
    <div
      className={[
        'relative flex min-w-0 flex-col gap-1 rounded-xl border bg-[#FAFAF9] px-2.5 py-2 shadow-sm ring-1 ring-zinc-100/90 transition-all duration-150',
        'border-zinc-200/85',
        disabled ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="flex gap-2">
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white ring-1 ring-zinc-200/80">
          <KindIcon kind={suggestion.kind} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold leading-snug text-zinc-900">{suggestion.title}</p>
          {suggestion.subtitle ? (
            <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">{suggestion.subtitle}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className=":-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
          aria-label="Ocultar sugerencia"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
      <div className="flex justify-end pt-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={onAdd}
          className={[
            'rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all duration-150 active:scale-[0.98]',
            disabled
              ? 'cursor-not-allowed bg-zinc-100 text-zinc-400'
              : 'bg-[#E30613] text-white shadow-sm ring-1 ring-[#E30613]/25 hover:bg-[#c70510]',
          ].join(' ')}
        >
          Añadir
        </button>
      </div>
    </div>
  );
});
