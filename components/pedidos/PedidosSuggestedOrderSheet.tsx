'use client';

import { Sparkles, X } from 'lucide-react';
import React from 'react';
import {
  type SuggestedConfidence,
  suggestedConfidenceLabel,
  type SuggestedOrderResult,
} from '@/lib/pedidos-suggested-order';
import type { TemporalPatternsResult } from '@/lib/pedidos-temporal-patterns';
import { PEDIDO_ORDER_UNITS } from '@/lib/pedidos-units';
import type { Unit } from '@/lib/types';

function unitLabel(unit: Unit): string {
  return PEDIDO_ORDER_UNITS.find((u) => u.value === unit)?.label ?? unit;
}

function confidenceBadgeClass(c: SuggestedConfidence): string {
  switch (c) {
    case 'alta':
      return 'bg-emerald-50 text-emerald-900 ring-emerald-200/80';
    case 'media':
      return 'bg-amber-50 text-amber-950 ring-amber-200/80';
    default:
      return 'bg-zinc-100 text-zinc-700 ring-zinc-200/80';
  }
}

type ApplyMode = 'fill_gaps' | 'replace';

type Props = {
  open: boolean;
  onClose: () => void;
  result: SuggestedOrderResult;
  hasExistingQuantities: boolean;
  onApply: (mode: ApplyMode) => void;
  /** Patrones temporales (mismo proveedor/local); opcional. */
  temporalPatterns?: TemporalPatternsResult | null;
};

export default function PedidosSuggestedOrderSheet({
  open,
  onClose,
  result,
  hasExistingQuantities,
  onApply,
  temporalPatterns,
}: Props) {
  if (!open) return null;

  const nowLabel = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="suggested-order-title"
      onClick={() => onClose()}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-zinc-100 px-4 py-3">
          <div className="min-w-0">
            <h2 id="suggested-order-title" className="flex items-center gap-2 text-base font-bold text-zinc-900">
              <Sparkles className="h-5 w-5 shrink-0 text-[#E30613]" strokeWidth={2} aria-hidden />
              Pedido sugerido
            </h2>
            <p className="mt-1 text-xs leading-snug text-zinc-500">
              Cobertura estimada según histórico (no inventario real)
            </p>
          </div>
          <button
            type="button"
            onClick={() => onClose()}
            className="shrink-0 rounded-full p-2 text-zinc-500 hover:bg-zinc-100"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {temporalPatterns &&
        (temporalPatterns.displayInsights.length > 0 || temporalPatterns.learningMessage) ? (
          <div className="shrink-0 border-b border-zinc-100 bg-[#FFFBFB] px-4 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-400">
              Patrones en el tiempo · nivel {temporalPatterns.maturityLevel}/6
            </p>
            {temporalPatterns.displayInsights.length > 0 ? (
              <ul className="mt-1.5 space-y-1.5">
                {temporalPatterns.displayInsights.slice(0, 3).map((ins) => (
                  <li key={ins.id} className="text-[11px] leading-snug text-zinc-700">
                    <span className="mr-1 font-semibold text-[#E30613]">•</span>
                    {ins.headline}
                    {ins.detail ? (
                      <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">{ins.detail}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {temporalPatterns.learningMessage ? (
              <p className="mt-1.5 text-[10px] leading-snug text-zinc-500">{temporalPatterns.learningMessage}</p>
            ) : null}
          </div>
        ) : null}

        {result.ok ? (
          <>
            <div className="shrink-0 space-y-2 border-b border-zinc-50 bg-[#FAFAF9]/80 px-4 py-2.5 text-[11px] text-zinc-600">
              <p>
                <span className="font-semibold text-zinc-800">{result.supplierName}</span>
                <span className="text-zinc-400"> · </span>
                <span className="capitalize">{nowLabel}</span>
              </p>
              {result.coverageGlobalLabel ? (
                <p className="rounded-lg border border-zinc-200/90 bg-white px-2.5 py-2 leading-snug text-zinc-800 ring-1 ring-zinc-100/90">
                  <span className="font-bold text-zinc-900">Cobertura estimada global: </span>
                  {result.coverageGlobalLabel}
                  <span className="text-zinc-400"> · </span>
                  <span className={`font-semibold ${result.globalConfidence === 'alta' ? 'text-emerald-800' : result.globalConfidence === 'media' ? 'text-amber-900' : 'text-zinc-600'}`}>
                    {suggestedConfidenceLabel(result.globalConfidence)}
                  </span>
                </p>
              ) : null}
              {result.deliveryCoverageDays != null ? (
                <p className="text-[10px] leading-snug text-zinc-500">
                  Tramo de entrega en catálogo: ~{result.deliveryCoverageDays} días hasta el siguiente reparto (referencia
                  cobertura).
                </p>
              ) : null}
              <p className="text-[10px] leading-snug text-zinc-500">{result.prudentSubtitle}</p>
              <p>
                <span className="font-semibold text-zinc-800">{result.lines.length}</span> productos ·{' '}
                <span className="font-semibold text-zinc-800">{result.orderCountInWindow}</span> pedidos analizados (
                {result.windowDays} d)
              </p>
              <p className="text-zinc-800">
                Total estimado (IVA incl.):{' '}
                <span className="font-bold text-[#7F1D1D]">
                  {result.estimatedTotalWithVat.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </span>
              </p>
              <p className="pt-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                Precios según catálogo actual
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
              <p className="mb-2 px-1 text-xs font-bold capitalize text-zinc-900">{result.title}</p>
              <ul className="space-y-2">
                {result.lines.map((line) => (
                  <li
                    key={line.supplierProductId}
                    className="rounded-xl border border-zinc-100 bg-white px-3 py-2.5 shadow-sm ring-1 ring-zinc-100/80"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-zinc-900">
                        {line.productName}
                      </p>
                      <span
                        className={[
                          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1',
                          confidenceBadgeClass(line.confidence),
                        ].join(' ')}
                      >
                        {suggestedConfidenceLabel(line.confidence)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-bold tabular-nums text-zinc-900">
                      {line.suggestedQty} {unitLabel(line.unit)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      {line.unitPrice.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })} /{' '}
                      {unitLabel(line.unit)}
                    </p>
                    <p className="mt-1.5 text-[10px] leading-snug text-zinc-600">{line.estimatedCoverageCaption}</p>
                    <p className="mt-1 text-[11px] leading-snug text-zinc-700">
                      Según histórico: {line.reason}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="shrink-0 border-t border-zinc-100 bg-white px-3 py-3 pb-4">
              <p className="mb-2 text-center text-[10px] leading-snug text-zinc-500">{result.prudentDisclaimer}</p>
              {hasExistingQuantities ? (
                <div className="mb-3 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-[11px] leading-snug text-amber-950">
                  Ya tienes productos con cantidad en este pedido. Elige cómo aplicar la sugerencia.
                </div>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  onClick={() => onClose()}
                  className="order-last w-full rounded-xl border border-zinc-200 bg-white py-3 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 sm:order-first sm:w-auto sm:px-4"
                >
                  Cancelar
                </button>
                {hasExistingQuantities ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onApply('fill_gaps')}
                      className="w-full rounded-xl border border-[#E30613]/40 bg-[#FFF8F7] py-3 text-sm font-bold text-[#7F1D1D] shadow-sm ring-1 ring-[#E30613]/15 hover:bg-[#FFF0EE] sm:w-auto sm:px-4"
                    >
                      Añadir solo faltantes
                    </button>
                    <button
                      type="button"
                      onClick={() => onApply('replace')}
                      className="w-full rounded-xl bg-[#E30613] py-3 text-sm font-bold text-white shadow-sm ring-1 ring-[#E30613]/25 hover:bg-[#c70510] sm:w-auto sm:px-4"
                    >
                      Reemplazar cantidades
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onApply('replace')}
                    className="w-full rounded-xl bg-[#E30613] py-3 text-sm font-bold text-white shadow-sm ring-1 ring-[#E30613]/25 hover:bg-[#c70510] sm:w-auto sm:flex-1"
                  >
                    Aplicar sugerencia
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-4 px-4 py-8">
            <p className="text-center text-sm leading-relaxed text-zinc-600">
              No hay suficiente historial para sugerir un pedido todavía.
            </p>
            <p className="text-center text-xs text-zinc-400">
              Necesitas al menos un par de pedidos recientes con este proveedor.
            </p>
            <button
              type="button"
              onClick={() => onClose()}
              className="mx-auto rounded-xl border border-zinc-200 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50"
            >
              Entendido
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
