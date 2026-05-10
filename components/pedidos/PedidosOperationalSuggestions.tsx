'use client';

import React from 'react';
import PedidosOperationalSuggestionCard from '@/components/pedidos/PedidosOperationalSuggestionCard';
import type { OperationalSuggestion } from '@/lib/pedidos-operational-suggestions';

export type PedidosOperationalSuggestionsProps = {
  suggestions: OperationalSuggestion[];
  onApply: (suggestion: OperationalSuggestion) => void;
  onDismiss: (suggestionId: string) => void;
  applyingId: string | null;
};

export default React.memo(function PedidosOperationalSuggestions({
  suggestions,
  onApply,
  onDismiss,
  applyingId,
}: PedidosOperationalSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div
      className="border-b border-zinc-100/90 bg-gradient-to-b from-[#FFF9F9]/80 to-transparent px-3 py-2"
      aria-live="polite"
    >
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Sugerencias</p>
      <ul className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {suggestions.map((s) => (
          <li key={s.id} className="w-[min(92vw,17.5rem)] shrink-0 snap-start sm:w-[17rem]">
            <PedidosOperationalSuggestionCard
              suggestion={s}
              disabled={applyingId === s.id}
              onAdd={() => onApply(s)}
              onDismiss={() => onDismiss(s.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
});
