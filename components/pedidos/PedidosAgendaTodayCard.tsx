'use client';

import Link from 'next/link';
import {
  AlarmClock,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
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

/** Mismo acabado que el resto de tarjetas grandes del panel (PriorityRowCard). */
const AGENDA_CARD_SHELL =
  'overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200/80';

/**
 * Una sola tarjeta "Gestión de pedidos para hoy" que agrupa, al desplegarse,
 * los Pedidos obligatorios y la Revisión diaria de proveedores. Mantiene el
 * mismo lenguaje visual que el resto del panel (cards blancas, rings suaves,
 * tipografía mixta sans + serif, badges redondos).
 */
export default React.memo(function PedidosAgendaTodayCard({
  loading,
  mandatoryRows,
  reviewSupplierGroups,
  showAgendaCompletadaMicro = false,
  localId,
  ymd,
  onAgendaAction,
}: PedidosAgendaTodayCardProps) {
  const [open, setOpen] = React.useState(false);
  const [mandatoryExpanded, setMandatoryExpanded] = React.useState(false);
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
        <div className={`px-3 py-2.5 ${AGENDA_CARD_SHELL}`}>
          <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">
            Gestión de pedidos para hoy
          </p>
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
          Agenda de pedidos completada
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

  const totalPending = mandatoryRows.length + pendingReviewGroups.length;
  const allDone = totalPending === 0;
  const mandatoryOverflow = mandatoryRows.length > MANDATORY_PREVIEW;
  const mandatoryShown = mandatoryExpanded ? mandatoryRows : mandatoryRows.slice(0, MANDATORY_PREVIEW);

  return (
    <section className={AGENDA_CARD_SHELL} id="panel-agenda-pedidos">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={[
          'flex min-h-[4rem] w-full touch-manipulation items-center justify-between gap-2 bg-white px-3 py-3.5 text-left sm:min-h-[4.5rem] sm:py-4',
          open ? 'border-b border-zinc-100' : '',
        ].join(' ')}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={[
              'grid h-12 w-12 shrink-0 place-items-center rounded-2xl ring-1 ring-white/60',
              allDone ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700',
            ].join(' ')}
          >
            <ClipboardList className="h-6 w-6" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-serif text-[16px] font-normal leading-tight text-zinc-900">
              Gestión de pedidos para hoy
            </p>
            <p className="mt-0.5 text-[12px] leading-snug text-zinc-500">
              {allDone
                ? 'Todo en orden'
                : `${mandatoryRows.length} obligatorio${mandatoryRows.length === 1 ? '' : 's'}` +
                  ` · ${pendingReviewGroups.length} por revisar`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end justify-between gap-1 self-stretch py-0.5">
          {allDone ? (
            <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/80">
              <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            </span>
          ) : (
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white ring-1"
              style={{ backgroundColor: BRAND_RED, borderColor: BRAND_RED }}
            >
              {totalPending}
            </span>
          )}
          {open ? (
            <ChevronUp className="h-5 w-5 text-zinc-300" aria-hidden />
          ) : (
            <ChevronDown className="h-5 w-5 text-zinc-300" aria-hidden />
          )}
        </div>
      </button>

      {open ? (
        <div>
          {hasMandatory ? (
            <SubSection
              tone="red"
              icon={<AlarmClock className="h-3.5 w-3.5" strokeWidth={2} style={{ color: BRAND_RED }} aria-hidden />}
              title="Obligatorios"
              count={mandatoryRows.length}
              countColor={BRAND_RED}
              hint="Completa el pedido antes de la hora límite"
              extra={
                mandatoryOverflow ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMandatoryExpanded((v) => !v);
                    }}
                    className="shrink-0 touch-manipulation text-[10px] font-semibold"
                    style={{ color: BRAND_RED }}
                  >
                    {mandatoryExpanded ? 'Ver menos' : 'Ver todos >'}
                  </button>
                ) : null
              }
            >
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
                      </span>
                      <span
                        className="shrink-0 text-[11px] font-bold tabular-nums leading-none"
                        style={{ color: BRAND_RED }}
                      >
                        antes {row.cutoffLabel}
                      </span>
                      <Eye
                        className="h-3 w-3 shrink-0 opacity-80"
                        strokeWidth={2}
                        aria-hidden
                        style={{ color: BRAND_RED }}
                      />
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-300" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </SubSection>
          ) : null}

          {hasReviewSection ? (
            <SubSection
              tone="amber"
              icon={<Eye className="h-3.5 w-3.5" strokeWidth={2} style={{ color: ACCENT_ORANGE }} aria-hidden />}
              title="Revisión diaria"
              count={pendingReviewGroups.length}
              countColor={ACCENT_ORANGE}
              hint={hasReviewCompletedOnly ? 'Todo revisado por hoy' : 'Revisa si necesitas algo de estos proveedores'}
            >
              {!hasReviewCompletedOnly ? (
                <ul className="divide-y divide-zinc-100 bg-white">
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
              ) : null}

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
            </SubSection>
          ) : null}
        </div>
      ) : null}
    </section>
  );
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  Sub-sección dentro del acordeón unificado                                 */
/* ────────────────────────────────────────────────────────────────────────── */

function SubSection({
  tone,
  icon,
  title,
  count,
  countColor,
  hint,
  extra,
  children,
}: {
  tone: 'red' | 'amber';
  icon: React.ReactNode;
  title: string;
  count: number;
  countColor: string;
  hint?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneBg = tone === 'red' ? 'bg-red-50/40' : 'bg-amber-50/40';
  return (
    <div className="border-t border-zinc-100">
      <div className={['flex items-center justify-between gap-2 px-3 py-1.5', toneBg].join(' ')}>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {icon}
          <span className="truncate text-[9.5px] font-bold uppercase tracking-[0.08em] text-zinc-700">
            {title}
          </span>
          {count > 0 ? (
            <span
              className="shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold leading-none text-white"
              style={{ backgroundColor: countColor }}
            >
              {count}
            </span>
          ) : (
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/80">
              <Check className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
            </span>
          )}
        </div>
        {extra}
      </div>
      {hint ? (
        <p className="border-b border-zinc-100 bg-white px-3 pb-1 pt-0.5 text-[9.5px] leading-tight text-zinc-500">
          {hint}
        </p>
      ) : null}
      {children}
    </div>
  );
}
