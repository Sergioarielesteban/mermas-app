'use client';

import { AlertTriangle, CalendarClock, Link2, Package, Sparkles, X } from 'lucide-react';
import React from 'react';
import type { OperationalSuggestion, OperationalSuggestionKind } from '@/lib/pedidos-operational-suggestions';

/** Altura fija de todas las tarjetas del carrusel (mismo tamaño siempre). */
export const SUGGESTION_CARD_HEIGHT_PX = 96;

function KindIcon({ kind }: { kind: OperationalSuggestionKind }) {
  const cls = 'h-3 w-3 shrink-0 text-[#D32F2F]';
  switch (kind) {
    case 'pair':
      return <Link2 className={cls} strokeWidth={2} aria-hidden />;
    case 'weekly_pattern':
      return <CalendarClock className={cls} strokeWidth={2} aria-hidden />;
    case 'rhythm_low':
      return <Package className={cls} strokeWidth={2} aria-hidden />;
    case 'stock_risk':
      return <AlertTriangle className={cls} strokeWidth={2} aria-hidden />;
    default:
      return <Sparkles className={cls} strokeWidth={2} aria-hidden />;
  }
}

function isStockDetailLayout(s: OperationalSuggestion): boolean {
  return s.kind === 'stock_risk' && Boolean(s.riskProductName?.trim());
}

export type PedidosOperationalSuggestionCardProps = {
  suggestion: OperationalSuggestion;
  onDismiss: () => void;
};

export default React.memo(function PedidosOperationalSuggestionCard({
  suggestion,
  onDismiss,
}: PedidosOperationalSuggestionCardProps) {
  const stock = isStockDetailLayout(suggestion);

  return (
    <div
      className={[
        'flex h-[96px] w-full min-w-0 gap-2 overflow-hidden rounded-lg border border-zinc-200/80 bg-[#FAFAF9] px-2.5 py-2 shadow-sm ring-1 ring-zinc-100/80 transition-opacity duration-150',
      ].join(' ')}
    >
      <div className="flex shrink-0 items-center justify-center self-stretch">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white ring-1 ring-zinc-200/70">
          <KindIcon kind={suggestion.kind} />
        </div>
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-0.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="absolute right-0 top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100/90 hover:text-zinc-600"
          aria-label="Ocultar recordatorio"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        </button>

        <p className="line-clamp-1 min-w-0 pr-8 text-[12px] font-semibold leading-snug text-zinc-900">
          {suggestion.title}
        </p>

        {stock ? (
          <>
            <p className="line-clamp-1 min-w-0 pr-2 text-[13px] font-bold leading-snug text-zinc-900">
              {suggestion.riskProductName}
            </p>
            <p className="line-clamp-1 min-w-0 pr-2 text-[11px] leading-snug text-zinc-500">
              {suggestion.riskDescription?.trim() ? suggestion.riskDescription : '\u00a0'}
            </p>
          </>
        ) : (
          <p className="line-clamp-2 min-w-0 pr-8 text-[11px] leading-snug text-zinc-600">
            {suggestion.subtitle?.trim() ? suggestion.subtitle : '\u00a0'}
          </p>
        )}
      </div>
    </div>
  );
});
