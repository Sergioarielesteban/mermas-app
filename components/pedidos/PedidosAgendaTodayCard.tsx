'use client';

import Link from 'next/link';
import { CalendarClock, Check, ChevronRight, Package } from 'lucide-react';
import React from 'react';
import type { AgendaCutoffRow, AgendaReviewRow } from '@/hooks/useOrderAgendaToday';
import { markReviewItemDone } from '@/lib/pedidos-order-agenda-review-storage';
import { todayYmdLocal } from '@/lib/pedidos-order-agenda-engine';

function toneClass(tone: AgendaCutoffRow['statusTone']) {
  switch (tone) {
    case 'ok':
      return 'text-emerald-700';
    case 'warn':
      return 'text-amber-800';
    case 'danger':
      return 'text-[#B91C1C]';
    default:
      return 'text-zinc-600';
  }
}

export type PedidosAgendaTodayCardProps = {
  loading: boolean;
  cutoffRows: AgendaCutoffRow[];
  reviewRows: AgendaReviewRow[];
  localId: string | null;
  onMarkedReview?: () => void;
};

export default React.memo(function PedidosAgendaTodayCard({
  loading,
  cutoffRows,
  reviewRows,
  localId,
  onMarkedReview,
}: PedidosAgendaTodayCardProps) {
  const ymd = React.useMemo(() => todayYmdLocal(new Date()), []);

  if (loading) {
    return (
      <section className="rounded-2xl border border-zinc-200/90 bg-white px-3 py-2.5 shadow-sm ring-1 ring-zinc-100/90 sm:px-4">
        <p className="text-[11px] font-semibold text-zinc-400">Agenda de hoy</p>
        <p className="mt-1 text-[12px] text-zinc-500">Cargando…</p>
      </section>
    );
  }

  const pendingCutoffs = cutoffRows.filter((r) => r.statusLabel !== 'enviado');
  const doneCutoffs = cutoffRows.filter((r) => r.statusLabel === 'enviado');

  return (
    <section className="rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-[#FFFDFD] to-white px-3 py-2.5 shadow-sm ring-1 ring-[#E30613]/10 sm:px-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 shrink-0 text-[#E30613]" strokeWidth={2} aria-hidden />
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Agenda de hoy</h2>
      </div>

      {pendingCutoffs.length > 0 || doneCutoffs.length > 0 ? (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Pedidos con hora límite</p>
          <ul className="mt-1 space-y-1">
            {[...pendingCutoffs, ...doneCutoffs].map((row) => (
              <li key={row.supplierId}>
                <Link
                  href={row.href}
                  className="flex min-h-[2.5rem] items-center gap-2 rounded-xl border border-zinc-100/90 bg-white/90 px-2.5 py-1.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-zinc-100/80 active:bg-zinc-50"
                >
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-zinc-900">{row.supplierName}</span>
                  <span className="shrink-0 text-[11px] text-zinc-500">antes {row.cutoffLabel}</span>
                  <span className={`shrink-0 text-[10px] font-bold uppercase ${toneClass(row.statusTone)}`}>
                    {row.statusLabel}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {reviewRows.length > 0 ? (
        <div className={pendingCutoffs.length || doneCutoffs.length ? 'mt-3' : 'mt-2'}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Revisar antes de pedir</p>
          <ul className="mt-1 space-y-1">
            {reviewRows.map((row) => (
              <li key={row.id} className="flex items-center gap-1">
                <Link
                  href={row.href}
                  className="flex min-h-[2.25rem] min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border border-zinc-100/90 bg-zinc-50/90 px-2.5 py-1 ring-1 ring-zinc-100/80"
                >
                  <span className="truncate text-[12px] font-medium text-zinc-900">{row.label}</span>
                  <span className="shrink-0 text-[11px] text-zinc-500">· {row.supplierName}</span>
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
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-emerald-200/90 bg-emerald-50 text-emerald-800 shadow-sm active:scale-[0.98]"
                  >
                    <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  </button>
                ) : row.done ? (
                  <span className="grid h-9 w-9 shrink-0 place-items-center text-emerald-600" title="Revisado">
                    <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-2 border-t border-zinc-100 pt-2">
        <Link
          href="/pedidos/nuevo"
          className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-xl bg-[#E30613] px-3 text-[11px] font-bold text-white shadow-sm ring-1 ring-[#E30613]/30 active:scale-[0.99] sm:flex-none"
        >
          <Package className="h-3.5 w-3.5" aria-hidden />
          Crear pedido
        </Link>
        <Link
          href="/pedidos/proveedores"
          className="inline-flex min-h-9 flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-[11px] font-semibold text-zinc-800 shadow-sm active:bg-zinc-50 sm:flex-none"
        >
          Ver proveedores
        </Link>
      </div>
    </section>
  );
});
