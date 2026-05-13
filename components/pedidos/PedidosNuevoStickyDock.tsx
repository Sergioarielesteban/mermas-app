'use client';

import {
  ArrowRight,
  Bookmark,
  LayoutTemplate,
  MessageCircle,
} from 'lucide-react';
import React from 'react';

export type PedidosNuevoStickyDockProps = {
  /** Sin líneas en el pedido actual */
  isEmpty: boolean;
  linesCount: number;
  unitsCount: number;
  subtotalNoVat: number;
  vatAmount: number;
  totalWithVat: number;
  /** Pedido mínimo en € sin IVA; null = no mostrar badges */
  minimumOrderEuro: number | null;
  notes: string;
  onNotesChange: (value: string) => void;
  onContinue: () => void;
  onWhatsApp: () => void;
  onTemplate: () => void;
  onSaveTemplate: () => void;
  /** Oculta acciones rápidas (p. ej. edición de pedido enviado) */
  showQuickActions: boolean;
  /** CTA cuando la cesta está vacía (p. ej. scroll al catálogo) */
  onEmptyCatalogCta: () => void;
};

function formatMoney(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SummarySheet = React.memo(function SummarySheet({
  open,
  onClose,
  linesCount,
  unitsCount,
  subtotalNoVat,
  vatAmount,
  totalWithVat,
  minimumOrderEuro,
  notes,
  onNotesChange,
  onContinue,
  onWhatsApp,
  onTemplate,
  onSaveTemplate,
  showQuickActions,
}: PedidosNuevoStickyDockProps & { open: boolean; onClose: () => void }) {
  if (!open) return null;

  const belowMinimum =
    minimumOrderEuro != null &&
    minimumOrderEuro > 0 &&
    linesCount > 0 &&
    subtotalNoVat + 1e-9 < minimumOrderEuro;
  const gapEuro =
    minimumOrderEuro != null && minimumOrderEuro > 0 ? Math.max(0, minimumOrderEuro - subtotalNoVat) : 0;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/35 transition-opacity duration-150"
        aria-label="Cerrar resumen"
        onClick={onClose}
      />
      <div className="relative mx-auto mb-[max(0.35rem,env(safe-area-inset-bottom))] w-full max-w-lg translate-y-0 transition-transform duration-150 ease-out">
        <div className="max-h-[min(88vh,680px)] overflow-y-auto rounded-t-2xl border border-zinc-200/90 bg-[#FAFAF9] shadow-[0_-12px_40px_rgba(15,23,42,0.12)] ring-1 ring-black/[0.04]">
          <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-zinc-200/80 bg-[#FAFAF9]/95 px-4 py-3 backdrop-blur-sm">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">Resumen</p>
              <p className="text-sm font-bold text-zinc-900">Tu pedido</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-2 py-1 text-[11px] font-semibold text-zinc-500 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-800"
            >
              Cerrar
            </button>
          </div>

          <div className="space-y-3 px-4 pb-4 pt-3">
            <div className="rounded-xl border border-zinc-200/80 bg-white px-3 py-2.5 ring-1 ring-zinc-100/90">
              <div className="flex items-center justify-between text-[12px] text-zinc-700">
                <span>Líneas</span>
                <span className="font-semibold tabular-nums text-zinc-900">{linesCount}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[12px] text-zinc-700">
                <span>Unidades</span>
                <span className="font-semibold tabular-nums text-zinc-900">{unitsCount}</span>
              </div>
              <div className="mt-2 border-t border-zinc-100 pt-2">
                <div className="flex items-center justify-between text-[12px] text-zinc-700">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatMoney(subtotalNoVat)} €</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[12px] text-zinc-700">
                  <span>IVA</span>
                  <span className="tabular-nums">{formatMoney(vatAmount)} €</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm font-black text-zinc-900">
                  <span>Total</span>
                  <span className="tabular-nums">{formatMoney(totalWithVat)} €</span>
                </div>
              </div>
            </div>

            {minimumOrderEuro != null && minimumOrderEuro > 0 && linesCount > 0 ? (
              <div
                className={[
                  'rounded-xl px-3 py-2 text-[11px] font-semibold leading-snug ring-1',
                  belowMinimum
                    ? 'bg-amber-50 text-amber-950 ring-amber-200/85'
                    : 'bg-emerald-50 text-emerald-950 ring-emerald-200/75',
                ].join(' ')}
              >
                {belowMinimum
                  ? `Faltan ${formatMoney(gapEuro)} € para el pedido mínimo (${formatMoney(minimumOrderEuro)} € sin IVA).`
                  : 'Pedido mínimo alcanzado.'}
              </div>
            ) : null}

            <div>
              <label htmlFor="dock-sheet-notas" className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                Observaciones
              </label>
              <textarea
                id="dock-sheet-notas"
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                rows={3}
                className="mt-1.5 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-inner shadow-zinc-100 outline-none ring-0 transition-[box-shadow] duration-150 placeholder:text-zinc-400 focus:border-[#E30613]/35 focus:shadow-[0_0_0_3px_rgba(227,6,19,0.08)]"
                placeholder="Comentarios para el pedido…"
              />
            </div>

            <div className="grid gap-2">
              {showQuickActions ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSaveTemplate();
                    }}
                    disabled={linesCount === 0}
                    className="flex h-11 touch-manipulation items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white text-[13px] font-bold text-zinc-800 shadow-sm ring-1 ring-zinc-100 transition-all duration-150 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Bookmark className="h-4 w-4 text-[#B91C1C]" strokeWidth={2} aria-hidden />
                    Guardar plantilla
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onWhatsApp();
                      onClose();
                    }}
                    disabled={linesCount === 0}
                    className="flex h-11 touch-manipulation items-center justify-center gap-2 rounded-xl bg-[#25D366] text-[13px] font-bold text-white shadow-sm ring-1 ring-[#128C7E]/30 transition-transform duration-150 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
                    WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onTemplate();
                      onClose();
                    }}
                    className="flex h-11 touch-manipulation items-center justify-center gap-2 rounded-xl border border-[#E30613]/35 bg-[#FFF8F7] text-[13px] font-bold text-[#7F1D1D] shadow-sm ring-1 ring-[#E30613]/15 transition-transform duration-150 active:scale-[0.99]"
                  >
                    <LayoutTemplate className="h-4 w-4" strokeWidth={2} aria-hidden />
                    Usar plantilla
                  </button>
                </>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  onContinue();
                  onClose();
                }}
                className="flex h-11 touch-manipulation items-center justify-center gap-2 rounded-xl bg-[#E30613] text-[13px] font-bold text-white shadow-md ring-1 ring-[#E30613]/25 transition-transform duration-150 active:scale-[0.99]"
              >
                Continuar pedido
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

/**
 * Barra inferior operativa del flujo «Nuevo pedido»: resumen compacto + bottom sheet de control.
 */
export default React.memo(function PedidosNuevoStickyDock(props: PedidosNuevoStickyDockProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const {
    isEmpty,
    linesCount,
    unitsCount,
    subtotalNoVat,
    minimumOrderEuro,
    showQuickActions,
    onContinue,
    onWhatsApp,
    onTemplate,
    onSaveTemplate,
    onNotesChange,
    notes,
    vatAmount,
    totalWithVat,
    onEmptyCatalogCta,
  } = props;

  return (
    <>
      <SummarySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        isEmpty={isEmpty}
        linesCount={linesCount}
        unitsCount={unitsCount}
        subtotalNoVat={subtotalNoVat}
        vatAmount={vatAmount}
        totalWithVat={totalWithVat}
        minimumOrderEuro={minimumOrderEuro}
        notes={notes}
        onNotesChange={onNotesChange}
        onContinue={onContinue}
        onWhatsApp={onWhatsApp}
        onTemplate={onTemplate}
        onSaveTemplate={onSaveTemplate}
        showQuickActions={showQuickActions}
        onEmptyCatalogCta={onEmptyCatalogCta}
      />
    </>
  );
});
