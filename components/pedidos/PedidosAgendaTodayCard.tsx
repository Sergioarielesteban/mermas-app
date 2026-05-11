'use client';

import Link from 'next/link';
import {
  AlarmClock,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
} from 'lucide-react';
import React from 'react';
import type { AgendaCutoffRow, AgendaReviewSupplierGroup } from '@/hooks/useOrderAgendaToday';
import { markMandatoryOmitted } from '@/lib/pedidos-order-agenda-mandatory-omit-storage';
import { markSupplierReviewItemsDone } from '@/lib/pedidos-order-agenda-review-storage';

export type PedidosAgendaTodayCardProps = {
  loading: boolean;
  mandatoryRows: AgendaCutoffRow[];
  reviewSupplierGroups: AgendaReviewSupplierGroup[];
  showAgendaCompletadaMicro?: boolean;
  localId: string | null;
  ymd: string;
  onAgendaAction?: () => void;
};

const MANDATORY_PREVIEW = 3;

const BRAND_RED = '#D32F2F';
const ACCENT_ORANGE = '#EA580C';

/** Mismo acabado que el saludo del panel y `PanelAlertas`: `rounded-xl` + ring (sin sangrar a ancho completo). */
const AGENDA_CARD_SHELL =
  'overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200/80';

export default React.memo(function PedidosAgendaTodayCard({
  loading,
  mandatoryRows,
  reviewSupplierGroups,
  showAgendaCompletadaMicro = false,
  localId,
  ymd,
  onAgendaAction,
}: PedidosAgendaTodayCardProps) {
  const [mandatoryExpanded, setMandatoryExpanded] = React.useState(false);
  const [reviewSectionOpen, setReviewSectionOpen] = React.useState(true);
  const [showCompletedReviews, setShowCompletedReviews] = React.useState(false);

  React.useEffect(() => {
    if (mandatoryRows.length <= MANDATORY_PREVIEW) setMandatoryExpanded(false);
  }, [mandatoryRows.length]);

  const pendingReviewGroups = React.useMemo(
    () => reviewSupplierGroups.filter((g) => !g.allDone),
    [reviewSupplierGroups],
  );

  const completedReviewGroups = React.useMemo(
    () => reviewSupplierGroups.filter((g) => g.allDone),
    [reviewSupplierGroups],
  );

  if (loading) {
    return (
      <section>
        <div className={`px-3 py-1.5 ${AGENDA_CARD_SHELL}`}>
          <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Agenda de hoy</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">Cargando…</p>
        </div>
      </section>
    );
  }

  if (showAgendaCompletadaMicro) {
    return (
      <section
        className="overflow-hidden rounded-xl border border-emerald-100/80 bg-emerald-50/40 px-3 py-1.5 shadow-sm ring-1 ring-emerald-100/70"
        aria-live="polite"
      >
        <p className="text-[11px] font-semibold leading-tight text-emerald-900">
          <span className="mr-1 text-emerald-600" aria-hidden>
            ✓
          </span>
          Agenda completada
        </p>
      </section>
    );
  }

  const hasMandatory = mandatoryRows.length > 0;
  const hasReviewCompletedOnly =
    completedReviewGroups.length > 0 && pendingReviewGroups.length === 0;
  const hasReviewSection =
    pendingReviewGroups.length > 0 || completedReviewGroups.length > 0;

  if (!hasMandatory && !hasReviewSection) return null;

  const mandatoryOverflow = mandatoryRows.length > MANDATORY_PREVIEW;
  const mandatoryShown = mandatoryExpanded ? mandatoryRows : mandatoryRows.slice(0, MANDATORY_PREVIEW);

  return (
    <section className="space-y-2">
      {hasMandatory ? (
        <div className={`space-y-0 ${AGENDA_CARD_SHELL}`}>
          <div className="flex items-center justify-between gap-2 bg-white px-2.5 py-1">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <AlarmClock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: BRAND_RED }} />
              <h2 className="truncate text-[11px] font-bold uppercase tracking-wide text-zinc-600">
                Pedidos obligatorios hoy
              </h2>
              <span
                className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold leading-none text-white"
                style={{ backgroundColor: BRAND_RED }}
              >
                {mandatoryRows.length}
              </span>
            </div>
            {mandatoryOverflow && !mandatoryExpanded ? (
              <button
                type="button"
                onClick={() => setMandatoryExpanded(true)}
                className="shrink-0 touch-manipulation text-[11px] font-semibold"
                style={{ color: BRAND_RED }}
              >
                Ver todos &gt;
              </button>
            ) : mandatoryOverflow && mandatoryExpanded ? (
              <button
                type="button"
                onClick={() => setMandatoryExpanded(false)}
                className="shrink-0 touch-manipulation text-[10px] font-semibold text-zinc-500"
              >
                Ver menos
              </button>
            ) : null}
          </div>
          <p className="border-b border-zinc-100 bg-white px-2.5 pb-0.5 pt-0 text-[9px] leading-tight text-zinc-500">
            Completa el pedido antes de la hora límite
          </p>

          <ul className="divide-y divide-zinc-100 bg-white">
            {mandatoryShown.map((row) => (
              <li key={row.supplierId} className="flex items-stretch gap-1 px-2.5 py-0.5">
                {localId ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={false}
                    title="No pedir hoy"
                    aria-label={`Omitir pedido obligatorio de ${row.supplierName} hoy`}
                    onClick={() => {
                      markMandatoryOmitted(localId, ymd, row.supplierId);
                      onAgendaAction?.();
                    }}
                    className="grid h-7 w-7 shrink-0 touch-manipulation place-items-center self-center rounded border border-zinc-200/90 bg-white active:scale-[0.98]"
                  >
                    <span className="h-3 w-3 rounded border-2 border-zinc-300 bg-white" aria-hidden />
                  </button>
                ) : null}
                <Link
                  href={row.href}
                  title={`Pedido a ${row.supplierName}`}
                  aria-label={`Abrir pedido y catálogo de ${row.supplierName}, antes de las ${row.cutoffLabel}`}
                  className="flex min-h-0 min-w-0 flex-1 touch-manipulation items-center gap-1.5 py-0.5 text-left outline-none active:bg-zinc-50/80"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-[13px] font-normal leading-tight text-zinc-900">
                      {row.supplierName}
                    </span>
                    <span className="block text-[9px] leading-tight text-zinc-500">Entrega habitual</span>
                  </span>
                  <span
                    className="shrink-0 text-[11px] font-bold tabular-nums leading-none"
                    style={{ color: BRAND_RED }}
                  >
                    antes {row.cutoffLabel}
                  </span>
                  <Eye className="h-3 w-3 shrink-0 opacity-80" strokeWidth={2} aria-hidden style={{ color: BRAND_RED }} />
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-300" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasReviewSection ? (
        <div className={AGENDA_CARD_SHELL}>
          <button
            type="button"
            onClick={() => setReviewSectionOpen((o) => !o)}
            className={[
              'flex w-full touch-manipulation items-center justify-between gap-2 bg-white px-2.5 py-1 text-left',
              reviewSectionOpen ? 'border-b border-zinc-100' : '',
            ].join(' ')}
          >
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: ACCENT_ORANGE }} />
              <span className="truncate text-[11px] font-bold uppercase tracking-wide text-zinc-600">
                Revisar proveedores
              </span>
              {pendingReviewGroups.length > 0 ? (
                <span
                  className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold leading-none text-white"
                  style={{ backgroundColor: ACCENT_ORANGE }}
                >
                  {pendingReviewGroups.length}
                </span>
              ) : (
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/80">
                  <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                </span>
              )}
            </div>
            {reviewSectionOpen ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-amber-600/80" aria-hidden />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-amber-600/80" aria-hidden />
            )}
          </button>

          {reviewSectionOpen ? (
            <>
              <p className="border-b border-zinc-100 bg-white px-2.5 pb-0.5 pt-0 text-[9px] leading-tight text-zinc-500">
                Revisa si necesitas algo de estos proveedores
              </p>
              <ul className="divide-y divide-zinc-100 bg-white">
                {hasReviewCompletedOnly ? (
                  <li className="px-2.5 py-1.5 text-center text-[9px] text-zinc-600">
                    Todo revisado por hoy
                  </li>
                ) : null}
                {pendingReviewGroups.map((g) => (
                  <li key={g.supplierId} className="flex items-stretch gap-1 px-2.5 py-0.5">
                    {localId ? (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={false}
                        title="Marcar como revisado"
                        aria-label={`Marcar ${g.supplierName} como revisado`}
                        onClick={() => {
                          markSupplierReviewItemsDone(localId, ymd, g.itemIds);
                          onAgendaAction?.();
                        }}
                        className="grid h-7 w-7 shrink-0 touch-manipulation place-items-center self-center rounded border border-zinc-200/90 bg-white active:scale-[0.98]"
                      >
                        <span className="h-3 w-3 rounded border-2 border-zinc-300 bg-white" aria-hidden />
                      </button>
                    ) : null}
                    <Link
                      href={g.href}
                      className="flex min-h-0 min-w-0 flex-1 touch-manipulation items-center gap-1.5 py-0.5 text-left outline-none active:bg-zinc-50/80"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-serif text-[13px] font-normal leading-tight text-zinc-900">
                          {g.supplierName}
                        </span>
                        <span className="block text-[9px] leading-tight text-zinc-500">Reparto diario</span>
                      </span>
                      {g.cutoffLabel ? (
                        <span
                          className="shrink-0 text-[11px] font-bold tabular-nums leading-none"
                          style={{ color: ACCENT_ORANGE }}
                        >
                          antes {g.cutoffLabel}
                        </span>
                      ) : null}
                      <Eye className="h-3 w-3 shrink-0 text-amber-600/70" strokeWidth={2} aria-hidden />
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-300" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>

              {completedReviewGroups.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowCompletedReviews((v) => !v)}
                    className="flex w-full touch-manipulation items-center justify-center gap-1 border-t border-zinc-100 bg-zinc-50/70 py-1 text-[10px] font-semibold text-amber-900/90"
                  >
                    Ver {completedReviewGroups.length} revisado{completedReviewGroups.length === 1 ? '' : 's'}
                    {showCompletedReviews ? (
                      <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                    )}
                  </button>
                  {showCompletedReviews ? (
                    <ul className="divide-y divide-zinc-100 bg-white">
                      {completedReviewGroups.map((g) => (
                        <li key={g.supplierId}>
                          <Link
                            href={g.href}
                            className="flex touch-manipulation items-center gap-1.5 px-2.5 py-1 opacity-90"
                          >
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-600">
                              <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12px] text-zinc-600">{g.supplierName}</span>
                              <span className="text-[9px] text-zinc-400">Revisado hoy</span>
                            </span>
                            {g.cutoffLabel ? (
                              <span className="shrink-0 text-[10px] font-semibold tabular-nums text-amber-700/80">
                                antes {g.cutoffLabel}
                              </span>
                            ) : null}
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-300" aria-hidden />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
});
