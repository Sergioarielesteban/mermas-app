'use client';

import { AlertTriangle, CalendarClock, Link2, Package, Sparkles, X } from 'lucide-react';
import React from 'react';
import type { OperationalSuggestion, OperationalSuggestionKind } from '@/lib/pedidos-operational-suggestions';

/**
 * Altura del chip compacto (pares, frecuencia, etc.). Las tarjetas `stock_risk` con detalle usan altura automática.
 * Mantener alineado con el carrusel si se cambia el layout compacto.
 */
export const SUGGESTION_CARD_HEIGHT_PX = 72;

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
  const baseWrap = [
    'flex w-full min-w-0 gap-2 rounded-lg border border-zinc-200/80 bg-[#FAFAF9] shadow-sm ring-1 ring-zinc-100/80 transition-opacity duration-150',
    disabled ? 'opacity-60' : '',
  ].join(' ');

  const addButtonClass = [
    'rounded-full px-4 py-2 text-sm font-semibold leading-none transition-transform duration-150 active:scale-[0.98]',
    disabled
      ? 'cursor-not-allowed bg-zinc-100 text-zinc-400'
      : 'bg-[#E30613] text-white shadow-sm ring-1 ring-[#E30613]/20 hover:bg-[#c70510]',
  ].join(' ');

  if (isStockDetailLayout(suggestion)) {
    return (
      <div className={[baseWrap, 'p-3'].join(' ')}>
        <div className="flex shrink-0 items-start pt-0.5">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-white ring-1 ring-zinc-200/70">
            <KindIcon kind={suggestion.kind} />
          </div>
        </div>

        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="absolute right-0 top-0 grid h-7 w-7 place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100/90 hover:text-zinc-600"
            aria-label="Ocultar sugerencia"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </button>

          <p className="pr-9 text-sm font-semibold leading-snug text-zinc-900">{suggestion.title}</p>
          <p className="mt-1 text-base font-bold leading-snug text-zinc-900">{suggestion.riskProductName}</p>
          <p className="mt-1 text-sm leading-snug text-zinc-500">{suggestion.riskDescription}</p>

          <button type="button" disabled={disabled} onClick={onAdd} className={[addButtonClass, 'mt-3 w-full'].join(' ')}>
            {suggestion.addCtaLabel?.trim() ? suggestion.addCtaLabel : 'Añadir'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={[baseWrap, 'h-[72px] px-2 py-1.5'].join(' ')}>
      <div className="flex shrink-0 items-center self-center">
        <div className="grid h-6 w-6 place-items-center rounded-md bg-white ring-1 ring-zinc-200/70">
          <KindIcon kind={suggestion.kind} />
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-1">
        <div className="flex min-w-0 items-center gap-1">
          <p className="line-clamp-1 min-w-0 flex-1 text-[12px] font-semibold leading-snug text-zinc-900">
            {suggestion.title}
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100/90 hover:text-zinc-600"
            aria-label="Ocultar sugerencia"
          >
            <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          </button>
        </div>

        <div className="flex min-w-0 items-center gap-1.5">
          <p className="line-clamp-1 min-w-0 flex-1 text-[11px] leading-snug text-zinc-600">
            {suggestion.subtitle?.trim() ? suggestion.subtitle : '\u00a0'}
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={onAdd}
            className={[
              'max-w-[min(11rem,42vw)] shrink-0 truncate rounded-full px-2.5 py-1 text-[11px] font-bold leading-none transition-transform duration-150 active:scale-[0.98]',
              disabled
                ? 'cursor-not-allowed bg-zinc-100 text-zinc-400'
                : 'bg-[#E30613] text-white shadow-sm ring-1 ring-[#E30613]/20 hover:bg-[#c70510]',
            ].join(' ')}
          >
            {suggestion.addCtaLabel?.trim() ? suggestion.addCtaLabel : 'Añadir'}
          </button>
        </div>
      </div>
    </div>
  );
});
