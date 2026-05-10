'use client';

import { CalendarClock, Link2, Package, Sparkles, X } from 'lucide-react';
import React from 'react';
import type { OperationalSuggestion, OperationalSuggestionKind } from '@/lib/pedidos-operational-suggestions';

/** Dimensiones fijas carrusel (peek del siguiente en el contenedor). */
export const SUGGESTION_CARD_WIDTH_PX = 272;
export const SUGGESTION_CARD_HEIGHT_PX = 116;

function KindIcon({ kind }: { kind: OperationalSuggestionKind }) {
  const cls = 'h-3 w-3 shrink-0 text-[#D32F2F]';
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
        'flex h-[116px] w-[272px] shrink-0 flex-col rounded-xl border border-zinc-200/85 bg-[#FAFAF9] p-2 shadow-sm ring-1 ring-zinc-100/90 transition-opacity duration-150',
        disabled ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="flex shrink-0 items-start gap-2">
        <div className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white ring-1 ring-zinc-200/80">
          <KindIcon kind={suggestion.kind} />
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
          aria-label="Ocultar sugerencia"
        >
          <X className="h-3 w-3" strokeWidth={2} />
        </button>
      </div>

      <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-tight text-zinc-900">{suggestion.title}</p>

      <p className="mt-0.5 min-h-0 flex-1 overflow-hidden text-[10px] leading-snug text-zinc-500">
        <span className="line-clamp-2">{suggestion.subtitle?.trim() ? suggestion.subtitle : '\u00a0'}</span>
      </p>

      <div className="mt-auto flex shrink-0 justify-end pt-1">
        <button
          type="button"
          disabled={disabled}
          onClick={onAdd}
          className={[
            'rounded-lg px-2.5 py-1 text-[11px] font-bold transition-transform duration-150 active:scale-[0.98]',
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
