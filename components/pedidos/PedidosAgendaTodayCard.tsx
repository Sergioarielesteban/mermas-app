'use client';

import Link from 'next/link';
import {
  AlarmClock,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  Eye,
  Hand,
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

const MANDATORY_PREVIEW = 4;
const REVIEW_PREVIEW = 4;
const SWIPE_DONE_PX = 74;

const BRAND_RED = '#D32F2F';

const AGENDA_CARD_SHELL =
  'overflow-hidden rounded-[1.65rem] bg-[#fffdf8] shadow-[0_16px_42px_rgba(24,24,27,0.08)] ring-1 ring-zinc-200/80';

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
  const [reviewExpanded, setReviewExpanded] = React.useState(false);
  const [showCompletedReviews, setShowCompletedReviews] = React.useState(false);

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
      <section className={AGENDA_CARD_SHELL} aria-live="polite">
        <div className="px-4 py-3.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">
            Gestión de pedidos para hoy
          </p>
          <p className="mt-1 font-serif text-[18px] leading-tight text-zinc-800">Preparando agenda...</p>
        </div>
      </section>
    );
  }

  if (showAgendaCompletadaMicro) {
    return (
      <section
        className="overflow-hidden rounded-[1.35rem] border border-emerald-200/70 bg-emerald-50 px-4 py-3 shadow-sm"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white shadow-sm">
            <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-serif text-[19px] leading-tight text-emerald-950">Todo al día</p>
            <p className="mt-0.5 text-[12px] font-medium leading-snug text-emerald-800/80">
              No quedan pedidos obligatorios ni revisiones pendientes.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const hasMandatory = mandatoryRows.length > 0;
  const hasReview = pendingReviewGroups.length > 0 || completedReviewGroups.length > 0;
  if (!hasMandatory && !hasReview) return null;

  const totalPending = mandatoryRows.length + pendingReviewGroups.length;
  const mandatoryOverflow = mandatoryRows.length > MANDATORY_PREVIEW;
  const reviewOverflow = pendingReviewGroups.length > REVIEW_PREVIEW;
  const mandatoryShown = mandatoryExpanded ? mandatoryRows : mandatoryRows.slice(0, MANDATORY_PREVIEW);
  const reviewShown = reviewExpanded ? pendingReviewGroups : pendingReviewGroups.slice(0, REVIEW_PREVIEW);

  return (
    <section className={AGENDA_CARD_SHELL} id="panel-agenda-pedidos">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={[
          'flex w-full touch-manipulation items-center justify-between gap-3 bg-gradient-to-br from-white via-[#fffaf1] to-[#fff4e5] px-4 py-3 text-left transition active:scale-[0.995]',
          open ? 'border-b border-zinc-200/70' : '',
        ].join(' ')}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white shadow-sm"
            style={{ backgroundColor: totalPending > 0 ? BRAND_RED : '#059669' }}
            aria-hidden
          >
            <span className="text-[16px] font-black leading-none tabular-nums">{totalPending}</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
              Pedidos de hoy
            </p>
            <h2 className="mt-0.5 truncate font-serif text-[19px] font-normal leading-tight text-zinc-950">
              Gestión de pedidos para hoy
            </h2>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-1.5 sm:flex">
            <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-black text-red-700 ring-1 ring-red-100">
              {mandatoryRows.length} oblig.
            </span>
            <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-800 ring-1 ring-amber-100">
              {pendingReviewGroups.length} rev.
            </span>
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-white/80 text-zinc-500 ring-1 ring-zinc-200">
            {open ? <ChevronUp className="h-5 w-5" aria-hidden /> : <ChevronDown className="h-5 w-5" aria-hidden />}
          </span>
        </div>
      </button>

      {open ? (
        <div className="space-y-2.5 px-3 py-2.5">
          <div className="grid grid-cols-2 gap-2 sm:hidden">
            <MetricPill
              tone="red"
              label="Obligatorios"
              value={mandatoryRows.length}
              icon={<AlarmClock className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
            />
            <MetricPill
              tone="amber"
              label="Revisión diaria"
              value={pendingReviewGroups.length}
              icon={<Eye className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
            />
          </div>

          <AgendaSection
            tone="red"
            title="Pedidos obligatorios"
            count={mandatoryRows.length}
            hint="Proveedores con corte real hoy"
            emptyLabel="Sin obligatorios pendientes"
            action={
              mandatoryOverflow ? (
                <button
                  type="button"
                  onClick={() => setMandatoryExpanded((v) => !v)}
                  className="flex h-8 shrink-0 touch-manipulation items-center gap-1 rounded-full bg-red-50 px-2.5 text-[11px] font-bold text-red-700 ring-1 ring-red-100 active:scale-[0.98]"
                >
                  {mandatoryExpanded ? 'Menos' : `+${mandatoryRows.length - MANDATORY_PREVIEW}`}
                  {mandatoryExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              ) : null
            }
          >
            {mandatoryShown.map((row) => (
              <MandatoryOrderRow
                key={row.supplierId}
                row={row}
                localId={localId}
                ymd={ymd}
                onDone={onAgendaAction}
              />
            ))}
          </AgendaSection>

          <AgendaSection
            tone="amber"
            title="Revisión diaria"
            count={pendingReviewGroups.length}
            hint="Swipe a la derecha o toca el check"
            emptyLabel={completedReviewGroups.length > 0 ? 'Todo revisado por hoy' : 'Sin revisiones pendientes'}
            action={
              reviewOverflow ? (
                <button
                  type="button"
                  onClick={() => setReviewExpanded((v) => !v)}
                  className="flex h-8 shrink-0 touch-manipulation items-center gap-1 rounded-full bg-amber-50 px-2.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-100 active:scale-[0.98]"
                >
                  {reviewExpanded ? 'Menos' : `+${pendingReviewGroups.length - REVIEW_PREVIEW}`}
                  {reviewExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              ) : null
            }
          >
            {reviewShown.map((group) => (
              <ReviewSwipeRow
                key={group.supplierId}
                group={group}
                localId={localId}
                ymd={ymd}
                onDone={onAgendaAction}
              />
            ))}

            {completedReviewGroups.length > 0 ? (
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={() => setShowCompletedReviews((v) => !v)}
                  className="flex h-9 w-full touch-manipulation items-center justify-center gap-1.5 rounded-2xl bg-zinc-100/80 text-[11px] font-bold text-zinc-600 active:scale-[0.99]"
                >
                  {showCompletedReviews ? 'Ocultar revisados' : `Ver revisados (${completedReviewGroups.length})`}
                  {showCompletedReviews ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {showCompletedReviews ? (
                  <div className="mt-2 space-y-1.5">
                    {completedReviewGroups.map((group) => (
                      <CompletedReviewRow key={group.supplierId} group={group} />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </AgendaSection>
        </div>
      ) : null}
    </section>
  );
});

function MetricPill({
  tone,
  label,
  value,
  icon,
}: {
  tone: 'red' | 'amber';
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  const styles =
    tone === 'red'
      ? 'bg-red-50 text-red-800 ring-red-100'
      : 'bg-amber-50 text-amber-900 ring-amber-100';

  return (
    <div className={['flex items-center gap-2 rounded-2xl px-3 py-2 ring-1', styles].join(' ')}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/75">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[10px] font-bold uppercase tracking-wide opacity-75">{label}</span>
        <span className="block text-[18px] font-black leading-none tabular-nums">{value}</span>
      </span>
    </div>
  );
}

function AgendaSection({
  tone,
  title,
  count,
  hint,
  emptyLabel,
  action,
  children,
}: {
  tone: 'red' | 'amber';
  title: string;
  count: number;
  hint: string;
  emptyLabel: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const isRed = tone === 'red';
  const iconClass = isRed ? 'bg-red-600 text-white' : 'bg-amber-500 text-white';
  const labelClass = isRed ? 'text-red-800' : 'text-amber-900';

  return (
    <section className="rounded-[1.25rem] bg-white p-2 shadow-sm ring-1 ring-zinc-200/75">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={['grid h-9 w-9 shrink-0 place-items-center rounded-2xl', iconClass].join(' ')}>
            {isRed ? <AlarmClock className="h-4.5 w-4.5" strokeWidth={2.25} /> : <ClipboardCheck className="h-4.5 w-4.5" strokeWidth={2.25} />}
          </span>
          <div className="min-w-0">
            <h3 className={['truncate font-serif text-[17px] font-normal leading-tight', labelClass].join(' ')}>
              {title}
            </h3>
            <p className="truncate text-[11px] font-medium leading-tight text-zinc-500">{hint}</p>
          </div>
          {count > 0 ? (
            <span className={['rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums', isRed ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'].join(' ')}>
              {count}
            </span>
          ) : null}
        </div>
        {action}
      </div>

      <div className="space-y-1.5">
        {count > 0 ? children : <EmptySectionLabel tone={tone} label={emptyLabel} />}
      </div>
    </section>
  );
}

function EmptySectionLabel({ tone, label }: { tone: 'red' | 'amber'; label: string }) {
  return (
    <div className={['flex min-h-[3rem] items-center gap-2 rounded-2xl px-3', tone === 'red' ? 'bg-red-50/45 text-red-800' : 'bg-amber-50/60 text-amber-900'].join(' ')}>
      <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
      <span className="text-[12px] font-bold">{label}</span>
    </div>
  );
}

function MandatoryOrderRow({
  row,
  localId,
  ymd,
  onDone,
}: {
  row: AgendaCutoffRow;
  localId: string | null;
  ymd: string;
  onDone?: () => void;
}) {
  const statusClass =
    row.statusTone === 'danger'
      ? 'bg-red-600 text-white'
      : row.statusTone === 'warn'
        ? 'bg-orange-500 text-white'
        : 'bg-red-50 text-red-700';

  return (
    <div className="group flex min-h-[3.75rem] items-center gap-2 rounded-2xl bg-red-50/55 px-2 py-1.5 ring-1 ring-red-100/90 transition-transform duration-200 active:scale-[0.99]">
      {localId ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={false}
          title="No pedir hoy"
          aria-label={`Omitir pedido obligatorio de ${row.supplierName} hoy`}
          onClick={() => {
            markMandatoryOmitted(localId, ymd, row.supplierId);
            onDone?.();
          }}
          className="grid h-11 w-11 shrink-0 touch-manipulation place-items-center rounded-2xl bg-white text-red-600 shadow-sm ring-1 ring-red-200 transition duration-150 active:scale-95"
        >
          <Check className="h-6 w-6" strokeWidth={2.6} aria-hidden />
        </button>
      ) : null}

      <Link
        href={row.href}
        title={`Pedido a ${row.supplierName}`}
        aria-label={`Abrir pedido y catálogo de ${row.supplierName}, antes de las ${row.cutoffLabel}`}
        className="flex min-w-0 flex-1 touch-manipulation items-center gap-2 rounded-xl px-1 py-1 outline-none"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-serif text-[16px] leading-tight text-zinc-950">
            {row.supplierName}
          </span>
          <span className="mt-0.5 block truncate text-[11px] font-semibold text-red-700/80">
            Pedido obligatorio
          </span>
        </span>
        <span className={['shrink-0 rounded-full px-2 py-1 text-[11px] font-black tabular-nums', statusClass].join(' ')}>
          {row.statusTone === 'danger' ? 'vencido' : `antes ${row.cutoffLabel}`}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-red-500/70 transition-transform group-active:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}

function ReviewSwipeRow({
  group,
  localId,
  ymd,
  onDone,
}: {
  group: AgendaReviewSupplierGroup;
  localId: string | null;
  ymd: string;
  onDone?: () => void;
}) {
  const [dragX, setDragX] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isCompleting, setIsCompleting] = React.useState(false);
  const startXRef = React.useRef(0);
  const draggedRef = React.useRef(false);

  const complete = React.useCallback(() => {
    if (!localId || isCompleting) return;
    setIsCompleting(true);
    setDragX(110);
    window.setTimeout(() => {
      markSupplierReviewItemsDone(localId, ymd, group.itemIds);
      onDone?.();
    }, 150);
  }, [group.itemIds, isCompleting, localId, onDone, ymd]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-amber-500/95">
      <div className="absolute inset-y-0 left-0 flex items-center gap-2 pl-4 text-white">
        <Hand className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        <span className="text-[11px] font-black uppercase tracking-wide">Revisado</span>
      </div>
      <div
        className={[
          'relative flex min-h-[3.75rem] touch-pan-y items-center gap-2 rounded-2xl bg-amber-50 px-2 py-1.5 ring-1 ring-amber-100/90',
          isDragging ? 'transition-none' : 'transition-transform duration-200 ease-out',
          isCompleting ? 'opacity-80' : '',
        ].join(' ')}
        style={{ transform: `translateX(${dragX}px)` }}
        onPointerDown={(event) => {
          startXRef.current = event.clientX;
          draggedRef.current = false;
          setIsDragging(true);
        }}
        onPointerMove={(event) => {
          if (!isDragging || !localId) return;
          const next = Math.max(0, Math.min(116, event.clientX - startXRef.current));
          if (next > 6) draggedRef.current = true;
          setDragX(next);
        }}
        onPointerUp={() => {
          if (!isDragging) return;
          setIsDragging(false);
          if (dragX >= SWIPE_DONE_PX) {
            complete();
          } else {
            setDragX(0);
          }
        }}
        onPointerCancel={() => {
          setIsDragging(false);
          setDragX(0);
        }}
      >
        {localId ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={false}
            title="Marcar como revisado"
            aria-label={`Marcar ${group.supplierName} como revisado`}
            onClick={complete}
            className="grid h-11 w-11 shrink-0 touch-manipulation place-items-center rounded-2xl bg-white text-amber-700 shadow-sm ring-1 ring-amber-200 transition duration-150 active:scale-95"
          >
            <Check className="h-6 w-6" strokeWidth={2.6} aria-hidden />
          </button>
        ) : null}

        <Link
          href={group.href}
          onClick={(event) => {
            if (draggedRef.current) event.preventDefault();
          }}
          className="flex min-w-0 flex-1 touch-manipulation items-center gap-2 rounded-xl px-1 py-1 outline-none"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-serif text-[16px] leading-tight text-zinc-950">
              {group.supplierName}
            </span>
            <span className="mt-0.5 block truncate text-[11px] font-semibold text-amber-800/85">
              Revisar antes de pedir
            </span>
          </span>
          {group.cutoffLabel ? (
            <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-black text-amber-800 ring-1 ring-amber-100">
              antes {group.cutoffLabel}
            </span>
          ) : null}
          <ChevronRight className="h-4 w-4 shrink-0 text-amber-600/70" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function CompletedReviewRow({ group }: { group: AgendaReviewSupplierGroup }) {
  return (
    <Link
      href={group.href}
      className="flex min-h-[3rem] touch-manipulation items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2 ring-1 ring-emerald-100"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white">
        <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-serif text-[14px] leading-tight text-emerald-950">
          {group.supplierName}
        </span>
        <span className="block text-[10px] font-bold uppercase tracking-wide text-emerald-700/75">
          Revisado hoy
        </span>
      </span>
      {group.cutoffLabel ? (
        <span className="shrink-0 text-[11px] font-bold tabular-nums text-emerald-800/80">
          {group.cutoffLabel}
        </span>
      ) : null}
      <ChevronRight className="h-4 w-4 shrink-0 text-emerald-600/60" aria-hidden />
    </Link>
  );
}
