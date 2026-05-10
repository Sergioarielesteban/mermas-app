'use client';

import { CalendarClock, Check, Info, Sunset, TrendingUp } from 'lucide-react';
import React from 'react';
import type { TemporalInsight, TemporalInsightKind, TemporalPatternsResult } from '@/lib/pedidos-temporal-patterns';
import {
  INSIGHT_MATURITY_TOOLTIP,
  MATURITY_FOOTER_HINT,
  maturityProgressCaption,
} from '@/lib/pedidos-temporal-ui-copy';

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

/** Stepper horizontal: completados (check verde), actual (círculo rojo), futuros (borde gris). */
function MaturityStepper({ level }: { level: number }) {
  const steps = [1, 2, 3, 4, 5, 6];
  return (
    <div
      className="flex min-h-[2.75rem] w-full items-center"
      role="img"
      aria-label={`Nivel de patrones ${level} de 6`}
    >
      {steps.map((n, idx) => (
        <React.Fragment key={n}>
          {idx > 0 ? (
            <div
              className={[
                'h-0.5 min-w-[6px] flex-1 rounded-full',
                idx < level ? 'bg-emerald-500' : 'bg-zinc-200',
              ].join(' ')}
              aria-hidden
            />
          ) : null}
          <div
            className={[
              'relative z-[1] grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums shadow-sm sm:h-10 sm:w-10 sm:text-[12px]',
              n < level
                ? 'bg-emerald-500 text-white ring-2 ring-white'
                : n === level
                  ? 'bg-[#E30613] text-white ring-2 ring-[#E30613]/20'
                  : 'border-2 border-zinc-300 bg-white text-zinc-400',
            ].join(' ')}
          >
            {n < level ? (
              <Check className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={2.5} aria-hidden />
            ) : (
              <span aria-hidden>{n}</span>
            )}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

export default React.memo(function PedidosTemporalInsightStrip({ patterns, hidden }: Props) {
  const [helpOpen, setHelpOpen] = React.useState(false);

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

  const tooltipLines = INSIGHT_MATURITY_TOOLTIP.split('\n');

  return (
    <div className="border-b border-zinc-100/85 bg-gradient-to-b from-[#FAFAF9] to-white px-3 py-3 sm:px-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-[13px] font-bold tracking-tight text-zinc-800 sm:text-sm">
            PATRONES · nivel {level}/6
          </p>
          <span
            className="inline-flex shrink-0 text-zinc-400"
            title={INSIGHT_MATURITY_TOOLTIP}
          >
            <Info className="h-4 w-4" strokeWidth={2} aria-hidden />
            <span className="sr-only">Información sobre niveles de patrones</span>
          </span>
        </div>
        <button
          type="button"
          className="shrink-0 text-[12px] font-semibold text-[#E30613] underline-offset-2 hover:underline"
          aria-expanded={helpOpen}
          aria-controls="patrones-niveles-ayuda"
          onClick={() => setHelpOpen((v) => !v)}
        >
          ¿Qué significa?
        </button>
      </div>

      {helpOpen ? (
        <div
          id="patrones-niveles-ayuda"
          className="mt-2 rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-[11px] leading-snug text-zinc-600 shadow-sm ring-1 ring-zinc-100/80"
          role="region"
        >
          <ul className="list-none space-y-1.5">
            {tooltipLines.map((line, i) => (
              <li key={i}>{line.trim()}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl bg-white/90 px-1 py-2 ring-1 ring-zinc-100/90 sm:px-2">
        <MaturityStepper level={level} />
      </div>

      <div className="mt-3 space-y-1 text-[12px] leading-snug text-zinc-800 sm:text-[13px]">
        <p>
          <span className="font-semibold text-zinc-900">Nivel {level}:</span>{' '}
          <span className="text-zinc-700">{maturityProgressCaption(level)}</span>
        </p>
        <p className="text-zinc-600">{MATURITY_FOOTER_HINT}</p>
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
