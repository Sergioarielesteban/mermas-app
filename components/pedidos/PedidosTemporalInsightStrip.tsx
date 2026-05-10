'use client';

import { CalendarClock, Sunset, TrendingUp } from 'lucide-react';
import React from 'react';
import type { TemporalInsight, TemporalInsightKind, TemporalPatternsResult } from '@/lib/pedidos-temporal-patterns';
import { INSIGHT_MATURITY_TOOLTIP, maturityProgressCaption } from '@/lib/pedidos-temporal-ui-copy';

type SlotKey = 'weekly' | 'trend' | 'weekend';

type InsightSlot = {
  key: SlotKey;
  label: string;
  icon: typeof CalendarClock;
  insight: TemporalInsight | null;
};

const WEEKLY_KINDS = new Set<TemporalInsightKind>(['weekday_lift', 'weekend_rhythm']);
const TREND_KINDS = new Set<TemporalInsightKind>(['recent_trend', 'vs_three_weeks_ago', 'drink_cluster_trend']);
const WEEKEND_KINDS = new Set<TemporalInsightKind>(['weekend_rhythm', 'weekday_lift']);

function pickInsight(list: TemporalInsight[], kinds: Set<TemporalInsightKind>): TemporalInsight | null {
  for (const i of list) {
    if (kinds.has(i.kind)) return i;
  }
  return null;
}

function assignSlots(insights: TemporalInsight[]): { weekly: TemporalInsight | null; trend: TemporalInsight | null; finde: TemporalInsight | null } {
  const used = new Set<string>();
  let weekly = pickInsight(insights, WEEKLY_KINDS);
  if (weekly) used.add(weekly.id);
  let trend = insights.find((i) => TREND_KINDS.has(i.kind) && !used.has(i.id)) ?? null;
  if (trend) used.add(trend.id);
  let finde =
    insights.find((i) => WEEKEND_KINDS.has(i.kind) && i.id !== weekly?.id && !used.has(i.id)) ??
    insights.find((i) => !used.has(i.id)) ??
    null;

  if (!weekly && insights[0] && !used.has(insights[0].id)) {
    weekly = insights[0];
    used.add(weekly.id);
  }
  if (!trend && insights[1] && !used.has(insights[1].id)) {
    trend = insights[1];
    used.add(trend.id);
  }
  if (!finde && insights[2] && !used.has(insights[2].id)) {
    finde = insights[2];
  }

  return { weekly, trend, finde };
}

function miniMetric(headline: string): string | null {
  const m = headline.match(/~\s*(\d+)\s*%|([+-]?\d+)\s*%/);
  if (m) return `${m[1] || m[2]}% vs periodo anterior`;
  const m2 = headline.match(/(\d+)\s*%/);
  if (m2) return `${m2[1]}% orientativo`;
  return null;
}

type Props = {
  patterns: TemporalPatternsResult;
  hidden?: boolean;
};

function MaturitySteps({ level }: { level: number }) {
  const steps = [1, 2, 3, 4, 5, 6];
  return (
    <div className="flex items-center gap-0.5 sm:gap-1" aria-hidden>
      {steps.map((n) => (
        <div key={n} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
          <div
            className={[
              'h-1 w-full rounded-full',
              n < level ? 'bg-emerald-400/75' : n === level ? 'bg-white' : 'bg-white/25',
            ].join(' ')}
          />
          <span className={`text-[8px] font-bold tabular-nums ${n === level ? 'text-white' : 'text-white/55'}`}>{n}</span>
        </div>
      ))}
    </div>
  );
}

export default React.memo(function PedidosTemporalInsightStrip({ patterns, hidden }: Props) {
  if (hidden) return null;

  const hasInsights = patterns.displayInsights.length > 0;
  const showLearningOnly = Boolean(patterns.learningMessage) && !hasInsights;

  if (!hasInsights && !patterns.learningMessage) return null;

  const level = Math.min(6, Math.max(1, patterns.maturityLevel)) as 1 | 2 | 3 | 4 | 5 | 6;
  const slotsRaw = hasInsights ? assignSlots(patterns.displayInsights) : { weekly: null, trend: null, finde: null };

  const slots: InsightSlot[] = [
    {
      key: 'weekly',
      label: 'Patrón semanal',
      icon: CalendarClock,
      insight: slotsRaw.weekly,
    },
    {
      key: 'trend',
      label: 'Tendencia reciente',
      icon: TrendingUp,
      insight: slotsRaw.trend,
    },
    {
      key: 'weekend',
      label: 'Antes del finde',
      icon: Sunset,
      insight: slotsRaw.finde,
    },
  ];

  return (
    <div className="border-b border-zinc-100/85 bg-gradient-to-b from-[#FAFAF9] to-white px-2 py-1.5 sm:px-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-500">Patterns</span>
            <span
              className="cursor-help text-[9px] font-semibold tabular-nums text-zinc-400 underline decoration-dotted decoration-zinc-300 underline-offset-2"
              title={INSIGHT_MATURITY_TOOLTIP}
            >
              · nivel {level}/6
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-zinc-500 sm:text-[10px]">
            {maturityProgressCaption(level)}
          </p>
        </div>
      </div>

      <div
        className="mt-1.5 rounded-lg bg-gradient-to-r from-[#c50512] to-[#E30613] px-1.5 py-1.5 shadow-inner shadow-black/10 ring-1 ring-black/5"
        title={INSIGHT_MATURITY_TOOLTIP}
      >
        <MaturitySteps level={level} />
      </div>

      {showLearningOnly ? (
        <p className="mt-1.5 text-[10px] leading-snug text-zinc-500">{patterns.learningMessage}</p>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:mt-1.5 sm:grid-cols-3 sm:gap-1.5">
          {slots.map((slot) => {
            const Icon = slot.icon;
            const ins = slot.insight;
            const sub = ins ? miniMetric(ins.headline) : null;
            return (
              <div
                key={slot.key}
                className="flex min-h-[5.75rem] min-w-0 flex-col justify-between rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 shadow-sm ring-1 ring-zinc-100/80 sm:min-h-[6.25rem] sm:rounded-lg sm:px-2 sm:py-2"
              >
                <div className="flex items-center gap-1 text-zinc-400">
                  <Icon className="h-4 w-4 shrink-0 text-[#E30613] sm:h-3 sm:w-3" strokeWidth={2} aria-hidden />
                  <span className="truncate text-[11px] font-bold uppercase tracking-wide text-zinc-600 sm:text-[8px] sm:text-zinc-500">
                    {slot.label}
                  </span>
                </div>
                {ins ? (
                  <>
                    <p className="mt-1 line-clamp-4 text-[12px] font-semibold leading-snug text-zinc-900 sm:mt-0.5 sm:line-clamp-3 sm:text-[10px]">
                      {ins.headline}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-500 sm:mt-0.5 sm:text-[9px]">
                      {sub ?? 'Según histórico reciente'}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-[11px] leading-snug text-zinc-400 sm:mt-0.5 sm:text-[8px]">Sin señal clara aún</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasInsights && patterns.learningMessage ? (
        <p className="mt-1.5 text-[9px] leading-snug text-zinc-400">{patterns.learningMessage}</p>
      ) : null}

      <span className="sr-only">{INSIGHT_MATURITY_TOOLTIP}</span>
    </div>
  );
});
