'use client';

import React from 'react';
import type { ActionUrgency, WeeklyAction } from '@/lib/analysis/generateWeeklyActionPlan';

function urgencyLabel(urgency: ActionUrgency) {
  switch (urgency) {
    case 'high':
      return 'ALTA';
    case 'medium':
      return 'MEDIA';
    default:
      return 'MANTENER';
  }
}

function urgencyStyles(urgency: ActionUrgency) {
  switch (urgency) {
    case 'high':
      return {
        badge: 'bg-[#C4531F]/10 text-[#C4531F] ring-[#C4531F]/15',
        accent: 'border-l-[#C4531F]',
      };
    case 'medium':
      return {
        badge: 'bg-[#B8872A]/10 text-[#B8872A] ring-[#B8872A]/15',
        accent: 'border-l-[#B8872A]',
      };
    default:
      return {
        badge: 'bg-[#587246]/10 text-[#587246] ring-[#587246]/15',
        accent: 'border-l-[#587246]',
      };
  }
}

type Props = {
  actions: WeeklyAction[];
  loading?: boolean;
  error?: string | null;
};

export default function WeeklyActionPlan({ actions, loading = false, error = null }: Props) {
  if (loading) {
    return (
      <section className="rounded-[28px] border border-[rgba(58,43,34,.05)] bg-[#FFFDFC] p-4 shadow-[0_4px_20px_rgba(58,43,34,.04)]">
        <div className="space-y-3">
          <div className="h-6 w-44 rounded-full bg-zinc-100/80" />
          <div className="h-4 w-72 max-w-full rounded-full bg-zinc-100/70" />
          <div className="space-y-3 pt-2">
            <div className="h-28 rounded-[22px] bg-zinc-50" />
            <div className="h-28 rounded-[22px] bg-zinc-50" />
            <div className="h-28 rounded-[22px] bg-zinc-50" />
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-[28px] border border-[rgba(58,43,34,.05)] bg-[#FFFDFC] p-4 shadow-[0_4px_20px_rgba(58,43,34,.04)]">
        <p className="text-[16px] font-black text-[#2A211B]">Qué hacer esta semana</p>
        <p className="mt-1 text-[13px] text-[#7B6F66]">{error}</p>
        <p className="mt-2 text-[12px] text-[#7B6F66]">Actualiza el análisis o conecta más datos.</p>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-[rgba(58,43,34,.05)] bg-[#FFFDFC] p-4 shadow-[0_4px_20px_rgba(58,43,34,.04)]">
      <div className="space-y-1.5">
        <p className="font-[Cormorant_Garamond] text-[24px] leading-none text-[#2A211B]">Qué hacer esta semana</p>
        <p className="text-[13px] text-[#7B6F66]">3 acciones concretas para mejorar la experiencia del cliente</p>
      </div>

      {actions.length === 0 ? (
        <div className="mt-4 rounded-[22px] border border-[rgba(58,43,34,.05)] bg-[#F7F3EE] p-4">
          <p className="text-[14px] font-semibold text-[#2A211B]">
            Aún necesitamos más reseñas para generar acciones fiables.
          </p>
          <p className="mt-1 text-[12.5px] text-[#7B6F66]">Actualiza reseñas o conecta más canales.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {actions.map((action, index) => {
            const styles = urgencyStyles(action.urgency);
            return (
              <article
                key={action.id}
                className={[
                  'rounded-[22px] border border-[rgba(58,43,34,.05)] bg-[#FFFDFC] p-4 shadow-[0_4px_20px_rgba(58,43,34,.04)]',
                  index === 0 && action.urgency === 'high' ? `border-l-4 ${styles.accent}` : '',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-[DM_Mono] text-[12px] font-bold tracking-[0.22em] text-[#7B6F66]">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <h3 className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-[#2A211B]">
                        {action.title}
                      </h3>
                    </div>
                  </div>
                  <span
                    className={[
                      'shrink-0 rounded-full px-2.5 py-1 font-[DM_Mono] text-[10px] font-bold uppercase tracking-[0.16em] ring-1',
                      styles.badge,
                    ].join(' ')}
                  >
                    {urgencyLabel(action.urgency)}
                  </span>
                </div>

                <p className="mt-3 text-[13px] leading-6 text-[#7B6F66]">
                  <span className="font-semibold text-[#2A211B]">Por qué importa:</span> {action.reason}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#F7F3EE] px-2.5 py-1 font-[DM_Mono] text-[10px] font-bold uppercase tracking-[0.18em] text-[#2A211B]">
                    Impacto
                  </span>
                  <span className="text-[13px] text-[#2A211B]">{action.impact}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#F7F3EE] px-2.5 py-1 font-[DM_Mono] text-[10px] font-bold uppercase tracking-[0.18em] text-[#2A211B]">
                    Tiempo
                  </span>
                  <span className="text-[13px] text-[#2A211B]">{action.estimatedTime}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
