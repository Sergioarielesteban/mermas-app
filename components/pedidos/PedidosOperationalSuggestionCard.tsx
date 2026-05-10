'use client';

import { CalendarClock, Link2, Package, Sparkles, X } from 'lucide-react';
import React from 'react';
import type { OperationalSuggestion, OperationalSuggestionKind } from '@/lib/pedidos-operational-suggestions';

/** Chip-card compacta: debe coincidir con SCROLL_STEP en el carrusel. */
export const SUGGESTION_CARD_WIDTH_PX = 236;
export const SUGGESTION_CARD_HEIGHT_PX = 64;

function KindIcon({ kind }: { kind: OperationalSuggestionKind }) {
  const cls = 'h-2.5 w-2.5 shrink-0 text-[#D32F2F]';
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
        'flex h-16 w-[236px] shrink-0 gap-1.5 rounded-lg border border-zinc-200/80 bg-[#FAFAF9] px-1.5 py-1 shadow-sm ring-1 ring-zinc-100/80 transition-opacity duration-150',
        disabled ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="flex shrink-0 items-center self-center">
        <div className="grid h-5 w-5 place-items-center rounded-md bg-white ring-1 ring-zinc-200/70">
          <KindIcon kind={suggestion.kind} />
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-0.5">
        <div className="flex min-w-0 items-center gap-0.5">
          <p className="line-clamp-1 min-w-0 flex-1 text-[10px] font-semibold leading-tight text-zinc-900">
            {suggestion.title}
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100/90 hover:text-zinc-600"
            aria-label="Ocultar sugerencia"
          >
            <X className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
          </button>
        </div>

        <div className="flex min-w-0 items-center gap-1">
          <p className="line-clamp-1 min-w-0 flex-1 text-[9px] leading-tight text-zinc-500">
            {suggestion.subtitle?.trim() ? suggestion.subtitle : '\u00a0'}
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={onAdd}
            className={[
              'shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold leading-none transition-transform duration-150 active:scale-[0.98]',
              disabled
                ? 'cursor-not-allowed bg-zinc-100 text-zinc-400'
                : 'bg-[#E30613] text-white shadow-sm ring-1 ring-[#E30613]/20 hover:bg-[#c70510]',
            ].join(' ')}
          >
            Añadir
          </button>
        </div>
      </div>
    </div>
  );
});
