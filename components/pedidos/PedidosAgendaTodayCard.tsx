'use client';

import Link from 'next/link';
import { CalendarClock, Check, ChevronRight } from 'lucide-react';
import React from 'react';
import type { AgendaCutoffRow, AgendaReviewRow } from '@/hooks/useOrderAgendaToday';
import { markReviewItemDone } from '@/lib/pedidos-order-agenda-review-storage';
import { todayYmdLocal } from '@/lib/pedidos-order-agenda-engine';

/** Fondo suave por estado (sin colores agresivos). */
function rowSurfaceClass(tone: AgendaCutoffRow['statusTone']) {
  switch (tone) {
    case 'warn':
      return 'border-amber-200/70 bg-amber-50/75 ring-amber-100/70';
    case 'danger':
      return 'border-red-200/65 bg-red-50/65 ring-red-100/60';
    case 'neutral':
    default:
      return 'border-zinc-200/80 bg-zinc-50/90 ring-zinc-100/90';
  }
}

function statusTextClass(tone: AgendaCutoffRow['statusTone']) {
  switch (tone) {
    case 'warn':
      return 'text-amber-800';
    case 'danger':
      return 'text-red-800/95';
    case 'neutral':
    default:
      return 'text-zinc-600';
  }
}

export type PedidosAgendaTodayCardProps = {
  loading: boolean;
  /** Solo cortes pendientes (no enviado); cada fila enlaza a nuevo pedido del proveedor. */
  cutoffRows: AgendaCutoffRow[];
  reviewRows: AgendaReviewRow[];
  /** Todos los cortes del día ya enviados y sin ítems de revisión: mensaje compacto. */
  showAgendaAlDiaMicro?: boolean;
  localId: string | null;
  onMarkedReview?: () => void;
};

export default React.memo(function PedidosAgendaTodayCard({
  loading,
  cutoffRows,
  reviewRows,
  showAgendaAlDiaMicro = false,
  localId,
  onMarkedReview,
}: PedidosAgendaTodayCardProps) {
  const ymd = React.useMemo(() => todayYmdLocal(new Date()), []);

  if (loading) {
    return (
      <section className="rounded-xl border border-zinc-200/90 bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-zinc-100/90">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Agenda de hoy</p>
        <p className="mt-0.5 text-[11px] text-zinc-500">Cargando…</p>
      </section>
    );
  }

  if (showAgendaAlDiaMicro) {
    return (
      <section
        className="rounded-xl border border-emerald-200/60 bg-emerald-50/35 px-2.5 py-1.5 shadow-sm ring-1 ring-emerald-100/50"
        aria-live="polite"
      >
        <p className="text-[11px] font-semibold leading-tight text-emerald-900">Agenda al día</p>
        <p className="mt-0.5 text-[10px] leading-snug text-emerald-800/85">
          Todos los pedidos programados están enviados.
        </p>
      </section>
    );
  }

  const hasCutoffs = cutoffRows.length > 0;
  const hasReviews = reviewRows.length > 0;

  if (!hasCutoffs && !hasReviews) return null;

  return (
    <section className="rounded-xl border border-zinc-200/90 bg-white px-2.5 py-2 shadow-sm ring-1 ring-zinc-100/90">
      {hasCutoffs ? (
        <div className="flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-[#E30613]" strokeWidth={2} aria-hidden />
          <h2 className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-zinc-500">Agenda de hoy</h2>
        </div>
      ) : hasReviews ? (
        <h2 className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-zinc-500">Revisar antes de pedir</h2>
      ) : null}

      {hasCutoffs ? (
        <ul className={`${hasReviews ? 'mt-1.5' : 'mt-1'} space-y-1`}>
          {cutoffRows.map((row) => (
            <li key={row.supplierId}>
              <Link
                href={row.href}
                className={[
                  'flex min-h-[2.25rem] touch-manipulation items-center gap-2 rounded-lg border px-2 py-1 text-left shadow-sm ring-1 transition-colors active:bg-black/[0.03]',
                  rowSurfaceClass(row.statusTone),
                ].join(' ')}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold leading-tight text-zinc-900">
                    {row.supplierName}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-zinc-500">
                    antes {row.cutoffLabel}
                    <span className="text-zinc-400"> · </span>
                    <span className={`font-semibold uppercase tracking-wide ${statusTextClass(row.statusTone)}`}>
                      {row.statusLabel}
                    </span>
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {hasReviews ? (
        <div className={hasCutoffs ? 'mt-2 border-t border-zinc-100 pt-2' : 'mt-1'}>
          {hasCutoffs ? (
            <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Revisar antes de pedir</p>
          ) : null}
          <ul className={hasCutoffs ? 'mt-1 space-y-1' : 'space-y-1'}>
            {reviewRows.map((row) => (
              <li key={row.id} className="flex items-center gap-1">
                <Link
                  href={row.href}
                  className="flex min-h-[2rem] min-w-0 flex-1 touch-manipulation items-center justify-between gap-2 rounded-lg border border-zinc-200/80 bg-zinc-50/80 px-2 py-1 ring-1 ring-zinc-100/80 active:bg-zinc-100/60"
                >
                  <span className="truncate text-[11px] font-medium text-zinc-900">{row.label}</span>
                  <span className="shrink-0 text-[10px] text-zinc-500">· {row.supplierName}</span>
                </Link>
                {!row.done && localId ? (
                  <button
                    type="button"
                    title="Marcar revisado"
                    aria-label={`Marcar ${row.label} como revisado`}
                    onClick={() => {
                      markReviewItemDone(localId, ymd, row.id);
                      onMarkedReview?.();
                    }}
                    className="grid h-8 w-8 shrink-0 touch-manipulation place-items-center rounded-lg border border-emerald-200/90 bg-emerald-50 text-emerald-800 shadow-sm active:scale-[0.98]"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                  </button>
                ) : row.done ? (
                  <span className="grid h-8 w-8 shrink-0 place-items-center text-emerald-600" title="Revisado">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
});
