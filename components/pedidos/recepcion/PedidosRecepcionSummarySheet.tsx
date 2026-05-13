'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Lightbulb,
  Package,
  Printer,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import React from 'react';
import {
  formatPedidosRecepcionSummaryMoney,
  type PedidosRecepcionSummaryAlert,
  type PedidosRecepcionSummaryPayload,
} from '@/lib/pedidos-recepcion-summary-build';

type Props = {
  open: boolean;
  onClose: () => void;
  payload: PedidosRecepcionSummaryPayload;
};

function toneClasses(tone: PedidosRecepcionSummaryAlert['tone']): string {
  switch (tone) {
    case 'rose':
      return 'border-rose-200/90 bg-rose-50/95 text-rose-950';
    case 'amber':
      return 'border-amber-200/90 bg-amber-50/95 text-amber-950';
    case 'sky':
      return 'border-sky-200/90 bg-sky-50/95 text-sky-950';
    case 'emerald':
      return 'border-emerald-200/90 bg-emerald-50/95 text-emerald-950';
    default:
      return 'border-zinc-200 bg-white text-zinc-900';
  }
}

export default function PedidosRecepcionSummarySheet({ open, onClose, payload }: Props) {
  const navRouter = useRouter();

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const finishedAt = React.useMemo(() => {
    try {
      const d = new Date(payload.completedAtIso);
      return d.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return payload.completedAtIso;
    }
  }, [payload.completedAtIso]);

  const maxTot = Math.max(payload.originalTotals.total, payload.receivedTotals.total, 1);
  const wOrig = (payload.originalTotals.total / maxTot) * 100;
  const wRec = (payload.receivedTotals.total / maxTot) * 100;

  const pctOk =
    payload.lineCount > 0 ? Math.round((payload.linesOk / payload.lineCount) * 100) : 0;
  const pctBad =
    payload.lineCount > 0 ? Math.round((payload.linesIncidencia / payload.lineCount) * 100) : 0;

  const impactPositive = payload.diffEur >= 0;

  const handlePrint = React.useCallback(() => {
    window.print();
  }, []);

  return (
    <div
      className={[
        'fixed inset-0 z-[120] flex flex-col justify-end print:static print:inset-auto',
        open ? 'pointer-events-auto' : 'pointer-events-none print:pointer-events-auto',
      ].join(' ')}
      aria-hidden={!open}
    >
      <button
        type="button"
        className={[
          'absolute inset-0 bg-zinc-950/45 backdrop-blur-[2px] transition-opacity duration-300 print:hidden',
          open ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        onClick={onClose}
        aria-label="Cerrar resumen"
      />
      <div
        id="pedidos-recepcion-summary-sheet"
        className={[
          'relative flex max-h-[min(92vh,100dvh)] min-h-0 w-full flex-col overflow-hidden rounded-t-[1.35rem] bg-zinc-50 shadow-[0_-12px_48px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-out print:max-h-none print:rounded-none print:shadow-none',
          open ? 'translate-y-0' : 'translate-y-full print:translate-y-0',
        ].join(' ')}
      >
        <div className="flex shrink-0 justify-center pt-2 print:hidden">
          <span className="h-1 w-10 rounded-full bg-zinc-300/90" aria-hidden />
        </div>

        <header className="shrink-0 bg-[#D32F2F] px-3 pb-3 pt-2 text-white print:bg-white print:text-zinc-900">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                <CheckCircle2 className="h-5 w-5" strokeWidth={2.25} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-white/90 print:text-[#B91C1C]">
                  Recepción completada
                </p>
                <p className="mt-0.5 truncate text-[15px] font-bold leading-tight">{payload.supplierName}</p>
              </div>
            </div>
            <div className="flex max-w-[min(16rem,55%)] shrink-0 flex-col items-end gap-1">
              <div className="flex w-full items-center justify-end gap-2">
                <p
                  className="min-w-0 truncate text-right text-[11px] font-semibold leading-tight text-white print:text-zinc-900"
                  title={payload.userDisplayName}
                >
                  {payload.userDisplayName}
                </p>
                <button
                  type="button"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/25 transition hover:bg-white/20 print:hidden"
                  onClick={onClose}
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" strokeWidth={2} aria-hidden />
                </button>
              </div>
              <p className="w-full text-right text-[10px] leading-snug font-semibold text-white/88 print:text-zinc-600">
                {finishedAt}
              </p>
            </div>
          </div>
        </header>

        <div
          id="pedidos-recepcion-summary-print"
          className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain px-2.5 pb-3 pt-2 [-webkit-overflow-scrolling:touch] sm:px-3 print:overflow-visible print:pb-4"
        >
          <div className="rounded-xl border border-emerald-200/80 bg-white px-2.5 py-2 shadow-sm ring-1 ring-emerald-100/80">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2.25} aria-hidden />
                <div>
                  <p className="text-[11px] font-bold text-emerald-900">Recepción validada</p>
                  <p className="text-[10px] text-emerald-800/90">Listo para archivo operativo y seguimiento.</p>
                </div>
              </div>
              <Link
                href={`/pedidos/recepcion?orderId=${encodeURIComponent(payload.orderId)}`}
                className="hidden shrink-0 rounded-lg border border-emerald-200/90 bg-emerald-50/90 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-emerald-900 sm:inline print:hidden"
                onClick={onClose}
              >
                Ver ficha
              </Link>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <KpiMini
              icon={<Package className="h-3.5 w-3.5 text-zinc-500" aria-hidden />}
              label="Líneas"
              value={String(payload.lineCount)}
            />
            <KpiMini
              icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />}
              label="Correctas"
              value={`${payload.linesOk} · ${pctOk}%`}
            />
            <KpiMini
              icon={<AlertTriangle className="h-3.5 w-3.5 text-orange-500" aria-hidden />}
              label="Incidencias"
              value={`${payload.linesIncidencia} · ${pctBad}%`}
            />
            <KpiMini
              icon={
                impactPositive ? (
                  <TrendingUp className="h-3.5 w-3.5 text-[#B91C1C]" aria-hidden />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-emerald-700" aria-hidden />
                )
              }
              label="Vs pedido"
              value={`${impactPositive ? '+' : '−'}${formatPedidosRecepcionSummaryMoney(Math.abs(payload.diffEur))}`}
              valueClassName={impactPositive ? 'text-[#991B1B]' : 'text-emerald-800'}
            />
          </div>

          <section className="mt-2 rounded-xl border border-zinc-200/90 bg-white p-2 shadow-sm ring-1 ring-zinc-100/90">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500">Impacto económico</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <div>
                <p className="text-[9px] font-semibold uppercase text-zinc-500">Pedido (previsto)</p>
                <p className="text-sm font-black tabular-nums text-zinc-900">
                  {formatPedidosRecepcionSummaryMoney(payload.originalTotals.total)}
                </p>
                <p className="text-[9px] text-zinc-500">IVA incl.</p>
              </div>
              <div
                className={[
                  'rounded-lg px-2 py-1.5 text-center text-[10px] font-black tabular-nums ring-1 sm:min-w-[6.5rem]',
                  impactPositive
                    ? 'bg-rose-50 text-[#991B1B] ring-rose-200/90'
                    : 'bg-emerald-50 text-emerald-900 ring-emerald-200/90',
                ].join(' ')}
              >
                Δ {impactPositive ? '+' : '−'}
                {formatPedidosRecepcionSummaryMoney(Math.abs(payload.diffEur))}
                {payload.diffPct != null ? (
                  <span className="block text-[9px] font-bold opacity-90">
                    ({payload.diffPct >= 0 ? '+' : ''}
                    {payload.diffPct.toLocaleString('es-ES', { maximumFractionDigits: 2 })}%)
                  </span>
                ) : null}
              </div>
              <div className="sm:text-right">
                <p className="text-[9px] font-semibold uppercase text-zinc-500">Recibido (real)</p>
                <p className="text-sm font-black tabular-nums text-zinc-900">
                  {formatPedidosRecepcionSummaryMoney(payload.receivedTotals.total)}
                </p>
                <p className="text-[9px] text-zinc-500">IVA incl.</p>
              </div>
            </div>
            <div className="mt-2 space-y-1.5">
              <div>
                <div className="mb-0.5 flex items-center justify-between text-[8px] font-semibold uppercase tracking-wide text-zinc-500">
                  <span>Pedido</span>
                  <span className="tabular-nums text-zinc-600">{formatPedidosRecepcionSummaryMoney(payload.originalTotals.total)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-2 rounded-full bg-zinc-400" style={{ width: `${wOrig}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-0.5 flex items-center justify-between text-[8px] font-semibold uppercase tracking-wide text-zinc-500">
                  <span>Recibido</span>
                  <span className="tabular-nums text-zinc-600">{formatPedidosRecepcionSummaryMoney(payload.receivedTotals.total)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-2 rounded-full bg-[#D32F2F]/80" style={{ width: `${wRec}%` }} />
                </div>
              </div>
              <p className="text-[8px] font-medium text-zinc-400">
                Barras normalizadas al mayor importe ({formatPedidosRecepcionSummaryMoney(maxTot)}). Neto pedido{' '}
                {formatPedidosRecepcionSummaryMoney(payload.originalTotals.base)} · Neto recibido{' '}
                {formatPedidosRecepcionSummaryMoney(payload.receivedTotals.base)}
              </p>
            </div>
          </section>

          {payload.incidentRows.length > 0 ? (
            <section className="mt-2">
              <p className="mb-1 px-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500">
                Incidencias y desviaciones
              </p>
              <ul className="space-y-1">
                {payload.incidentRows.map((row, idx) => (
                  <li
                    key={`${row.name}-${idx}`}
                    className="flex items-start gap-2 rounded-xl border border-zinc-200/90 bg-white px-2.5 py-2 shadow-sm ring-1 ring-zinc-100/80"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-[12px] font-bold leading-snug text-zinc-900 [overflow-wrap:anywhere]">{row.name}</p>
                      {row.priceBaseLabel && row.priceNewLabel ? (
                        <p className="text-[11px] font-semibold leading-snug text-zinc-700">
                          <span className="text-zinc-500">Precio base:</span>{' '}
                          <span className="tabular-nums text-zinc-900">{row.priceBaseLabel}</span>{' '}
                          <span className="mx-1 text-zinc-300">→</span>{' '}
                          <span className="text-zinc-500">nuevo:</span>{' '}
                          <span className="tabular-nums text-zinc-900">{row.priceNewLabel}</span>
                        </p>
                      ) : null}
                      <p
                        className={[
                          'text-[11px] font-semibold leading-snug',
                          row.priceDeltaLabel.startsWith('−') ? 'text-emerald-800' : 'text-rose-700',
                        ].join(' ')}
                      >
                        <span className="text-zinc-500">{row.priceDeltaLabel.startsWith('−') ? 'Bajada:' : 'Subida:'}</span>{' '}
                        <span className="tabular-nums">{row.priceDeltaLabel}</span>
                      </p>
                    </div>
                    <div
                      className={[
                        'shrink-0 rounded-lg px-2 py-1.5 text-right text-[10px] font-black tabular-nums ring-1',
                        row.impactEur >= 0
                          ? 'bg-rose-50 text-[#991B1B] ring-rose-200/80'
                          : 'bg-emerald-50 text-emerald-900 ring-emerald-200/80',
                      ].join(' ')}
                    >
                      {row.impactEur >= 0 ? '+' : '−'}
                      {formatPedidosRecepcionSummaryMoney(Math.abs(row.impactEur))}
                    </div>
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300 print:hidden" aria-hidden />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {payload.smartAlerts.length > 0 ? (
            <section className="mt-2">
              <div className="mb-1 flex items-center gap-1.5 px-0.5">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500">Alertas inteligentes</p>
              </div>
              <ul className="space-y-1">
                {payload.smartAlerts.map((a) => (
                  <li
                    key={a.id}
                    className={['rounded-lg border px-2 py-1.5 text-[11px] font-medium leading-snug ring-1', toneClasses(a.tone)].join(
                      ' ',
                    )}
                  >
                    {a.text}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-2 grid grid-cols-2 gap-1.5">
            <FooterKpi
              label="Ahorro / sobrecoste"
              value={`${payload.diffEur >= 0 ? '+' : '−'}${formatPedidosRecepcionSummaryMoney(Math.abs(payload.diffEur))}`}
              valueClass={payload.diffEur >= 0 ? 'text-[#991B1B]' : 'text-emerald-800'}
            />
            <FooterKpi
              label="Impacto semanal"
              value={payload.weeklyPurchasesHint ?? '—'}
              sub="Comparativa global próximamente"
            />
            <FooterKpi label="Incidencias (líneas)" value={String(payload.productsWithIncidentCount)} />
            <FooterKpi label="A monitorizar" value={String(payload.linesToMonitorCount)} />
          </section>
        </div>

        <footer className="shrink-0 border-t border-zinc-200/90 bg-white/95 px-2.5 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur-md print:static print:border-0 print:shadow-none">
          <div className="mx-auto flex max-w-lg flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white text-xs font-bold text-zinc-800 shadow-sm transition active:scale-[0.99] print:hidden"
              >
                <Printer className="h-4 w-4 text-zinc-600" aria-hidden />
                Imprimir
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#D32F2F] text-xs font-black uppercase tracking-wide text-white shadow-md shadow-[#B91C1C]/25 transition active:scale-[0.99] print:hidden"
              >
                Cerrar
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                navRouter.push(`/pedidos/recepcion?orderId=${encodeURIComponent(payload.orderId)}`);
              }}
              className="h-10 w-full rounded-lg text-[11px] font-bold text-[#B91C1C] underline-offset-2 hover:underline print:hidden"
            >
              Ver detalle completo en Recepción
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function KpiMini({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200/90 bg-white px-2 py-1.5 shadow-sm ring-1 ring-zinc-100/80">
      <div className="flex items-center gap-1">
        {icon}
        <span className="text-[8px] font-bold uppercase tracking-wide text-zinc-500">{label}</span>
      </div>
      <p className={['mt-0.5 text-[12px] font-black tabular-nums leading-tight text-zinc-950', valueClassName].filter(Boolean).join(' ')}>
        {value}
      </p>
    </div>
  );
}

function FooterKpi({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200/85 bg-zinc-50/90 px-2 py-1.5 ring-1 ring-zinc-100/80">
      <p className="text-[8px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={['mt-0.5 text-[11px] font-black tabular-nums text-zinc-900', valueClass].filter(Boolean).join(' ')}>{value}</p>
      {sub ? <p className="mt-0.5 text-[8px] font-medium text-zinc-500">{sub}</p> : null}
    </div>
  );
}
