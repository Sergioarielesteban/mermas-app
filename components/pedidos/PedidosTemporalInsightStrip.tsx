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

function insightProductKey(insight: TemporalInsight): string {
  const parts = insight.id.split(':');
  if ((parts[0] === 'wl' || parts[0] === 'tr' || parts[0] === '3w') && parts[2]) return `p:${parts[2]}`;
  if (parts[0] === 'wd' && parts[2]) return `p:${parts[2]}`;
  return `k:${insight.kind}`;
}

function pickDistinctInsight(
  list: TemporalInsight[],
  kinds: Set<TemporalInsightKind>,
  usedIds: Set<string>,
  usedProducts: Set<string>,
): TemporalInsight | null {
  for (const insight of list) {
    if (!kinds.has(insight.kind) || usedIds.has(insight.id)) continue;
    const pKey = insightProductKey(insight);
    if (usedProducts.has(pKey)) continue;
    usedIds.add(insight.id);
    usedProducts.add(pKey);
    return insight;
  }
  return null;
}

function assignSlots(insights: TemporalInsight[]): { weekly: TemporalInsight | null; trend: TemporalInsight | null; finde: TemporalInsight | null } {
  const usedIds = new Set<string>();
  const usedProducts = new Set<string>();
  let weekly = pickDistinctInsight(insights, WEEKLY_KINDS, usedIds, usedProducts);
  let trend = pickDistinctInsight(insights, TREND_KINDS, usedIds, usedProducts);
  let finde =
    pickDistinctInsight(insights, WEEKEND_KINDS, usedIds, usedProducts) ??
    insights.find((i) => {
      if (usedIds.has(i.id)) return false;
      const pKey = insightProductKey(i);
      if (usedProducts.has(pKey)) return false;
      usedIds.add(i.id);
      usedProducts.add(pKey);
      return true;
    }) ??
    null;

  if (!weekly && insights[0] && !usedIds.has(insights[0].id)) {
    weekly = insights[0];
    usedIds.add(weekly.id);
    usedProducts.add(insightProductKey(weekly));
  }
  if (!trend && insights[1] && !usedIds.has(insights[1].id)) {
    trend = insights[1];
    usedIds.add(trend.id);
    usedProducts.add(insightProductKey(trend));
  }
  if (!finde && insights[2] && !usedIds.has(insights[2].id)) {
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
  const [collapsed, setCollapsed] = React.useState(true);

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
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-expanded={!collapsed}
          aria-controls="patrones-contenido"
        >
          <p className="truncate text-[13px] font-bold tracking-tight text-zinc-800 sm:text-sm">
            PATRONES · nivel {level}/6
          </p>
          <span className="inline-flex shrink-0 text-zinc-400" title={INSIGHT_MATURITY_TOOLTIP}>
            <Info className="h-4 w-4" strokeWidth={2} aria-hidden />
            <span className="sr-only">Información sobre niveles de patrones</span>
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-zinc-500">{collapsed ? 'Mostrar' : 'Ocultar'}</span>
        </button>
        <div className="shrink-0">
          <button
            type="button"
            className="text-[12px] font-semibold text-[#E30613] underline-offset-2 hover:underline"
            aria-expanded={helpOpen}
            aria-controls="patrones-niveles-ayuda"
            onClick={() => setHelpOpen((v) => !v)}
          >
            ¿Qué significa?
          </button>
        </div>
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

      {!collapsed ? (
        <div id="patrones-contenido">
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
            <ul
              className={[
                'mt-2 flex w-full gap-0 overflow-x-auto overscroll-x-contain px-0 pb-0',
                'snap-x snap-mandatory',
                '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                'touch-pan-x',
              ].join(' ')}
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {slots.map((slot) => {
                const Icon = slot.icon;
                const ins = slot.insight;
                const sub = ins ? miniMetric(ins.headline) : null;
                return (
                  <li
                    key={slot.key}
                    className="w-full min-w-full shrink-0 snap-start snap-always"
                    style={{ flex: '0 0 100%', scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
                  >
                    <div className="flex h-[44px] min-w-0 items-center gap-2 rounded-xl border border-zinc-200/90 bg-white px-3 shadow-sm ring-1 ring-zinc-100/80">
                      <div className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#FFF5F5] ring-1 ring-[#E30613]/12">
                        <Icon className="h-3.5 w-3.5 text-[#E30613]" strokeWidth={2} aria-hidden />
                      </div>
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                        {slot.label}
                      </span>
                      {ins ? (
                        <p className="min-w-0 flex-1 truncate text-[12px] font-semibold leading-none text-zinc-900">
                          {ins.headline}
                        </p>
                      ) : (
                        <p className="min-w-0 flex-1 truncate text-[11px] text-zinc-400">Sin señal clara aún</p>
                      )}
                      <span className="shrink-0 text-[10px] text-zinc-500">{sub ?? 'Histórico'}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {hasInsights && patterns.learningMessage ? (
            <p className="mt-1.5 text-[9px] leading-snug text-zinc-400">{patterns.learningMessage}</p>
          ) : null}
        </div>
      ) : null}

      <span className="sr-only">{INSIGHT_MATURITY_TOOLTIP}</span>
    </div>
  );
});
