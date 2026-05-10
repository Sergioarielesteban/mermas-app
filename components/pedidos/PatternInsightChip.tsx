'use client';

import React from 'react';
import type { TemporalInsight } from '@/lib/pedidos-temporal-patterns';

function confidenceDot(c: TemporalInsight['confidence']): string {
  switch (c) {
    case 'alta':
      return 'bg-emerald-500';
    case 'media':
      return 'bg-amber-500';
    default:
      return 'bg-zinc-400';
  }
}

export type PatternInsightChipProps = {
  insight: TemporalInsight;
};

export default React.memo(function PatternInsightChip({ insight }: PatternInsightChipProps) {
  return (
    <span
      className="inline-flex max-w-[min(100%,18rem)] shrink-0 items-center gap-1.5 rounded-full border border-zinc-200/90 bg-white px-2.5 py-1 text-[10px] font-medium leading-snug text-zinc-800 shadow-sm ring-1 ring-zinc-100/80"
      title={insight.detail ?? insight.headline}
    >
      <span className={['h-1.5 w-1.5 shrink-0 rounded-full', confidenceDot(insight.confidence)].join(' ')} aria-hidden />
      <span className="line-clamp-2">{insight.headline}</span>
    </span>
  );
});
