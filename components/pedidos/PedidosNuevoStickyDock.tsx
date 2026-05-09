'use client';

import {
  ArrowRight,
  Bookmark,
  ChevronUp,
  LayoutTemplate,
  MessageCircle,
  ShoppingCart,
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

const DockBar = React.memo(function DockBar({
  isEmpty,
  linesCount,
  unitsCount,
  subtotalNoVat,
  minimumOrderEuro,
  showQuickActions,
  onSummaryTap,
  onContinue,
  onWhatsApp,
  onTemplate,
}: Pick<
  PedidosNuevoStickyDockProps,
  | 'isEmpty'
  | 'linesCount'
  | 'unitsCount'
  | 'subtotalNoVat'
  | 'minimumOrderEuro'
  | 'showQuickActions'
  | 'onContinue'
  | 'onWhatsApp'
  | 'onTemplate'
> & {
  onSummaryTap: () => void;
}) {
  const belowMinimum =
    minimumOrderEuro != null &&
    minimumOrderEuro > 0 &&
    !isEmpty &&
    subtotalNoVat + 1e-9 < minimumOrderEuro;
  const reachedMinimum =
    minimumOrderEuro != null && minimumOrderEuro > 0 && !isEmpty && subtotalNoVat + 1e-9 >= minimumOrderEuro;
  const gapEuro =
    minimumOrderEuro != null && minimumOrderEuro > 0 ? Math.max(0, minimumOrderEuro - subtotalNoVat) : 0;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-2.5 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 sm:px-3">
      <div className="pointer-events-auto w-full max-w-lg">
        <div
          className={[
            'flex flex-col gap-1 rounded-2xl border border-zinc-200/90 bg-[#FAFAF9] px-2.5 py-1.5 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-black/[0.03] transition-all duration-150 sm:px-3 sm:py-2',
            !isEmpty ? 'cursor-pointer active:scale-[0.995]' : '',
          ].join(' ')}
          role={isEmpty ? undefined : 'button'}
          tabIndex={isEmpty ? undefined : 0}
          onClick={isEmpty ? undefined : onSummaryTap}
          onKeyDown={
            isEmpty
              ? undefined
              : (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSummaryTap();
                  }
                }
          }
          aria-label={isEmpty ? undefined : 'Abrir resumen del pedido'}
        >
          <div className="flex items-center gap-2">
            <div className="relative flex min-w-0 flex-1 items-start gap-2">
              <div className="relative mt-0.5 shrink-0">
                <ShoppingCart className="h-5 w-5 text-zinc-600" strokeWidth={2} aria-hidden />
                {!isEmpty ? (
                  <span className="absolute -right-1.5 -top-1 flex h-[1rem] min-w-[1rem] items-center justify-center rounded-full bg-[#E30613] px-1 text-[8px] font-bold leading-none text-white shadow-sm">
                    {linesCount > 99 ? '99+' : linesCount}
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                {isEmpty ? (
                  <>
                    <p className="text-[11px] font-bold leading-tight text-zinc-900">
                      <span aria-hidden>🛒 </span>0 líneas
                    </p>
                    <p className="text-[10px] font-medium leading-tight text-zinc-500">Sin productos</p>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] font-bold leading-tight text-zinc-900">
                      <span className="tabular-nums">{linesCount}</span>{' '}
                      <span className="font-semibold text-zinc-600">
                        {linesCount === 1 ? 'línea' : 'líneas'} ·{' '}
                      </span>
                      <span className="tabular-nums">{unitsCount}</span> uds
                    </p>
                    <p className="text-[10px] font-semibold tabular-nums leading-tight text-zinc-700">
                      {formatMoney(subtotalNoVat)} € · Sin IVA
                    </p>
                  </>
                )}
              </div>
              {!isEmpty ? (
                <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-zinc-400" strokeWidth={2} aria-hidden />
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {!isEmpty && showQuickActions ? (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onWhatsApp();
                    }}
                    className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-xl bg-[#25D366] text-white shadow-sm ring-1 ring-[#128C7E]/25 transition-transform duration-150 active:scale-[0.96]"
                    aria-label="Enviar pedido por WhatsApp"
                  >
                    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden>
                      <path
                        fill="currentColor"
                        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTemplate();
                    }}
                    className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-xl border border-[#E30613]/35 bg-[#FFF8F7] text-[#B91C1C] shadow-sm ring-1 ring-[#E30613]/12 transition-transform duration-150 active:scale-[0.96]"
                    aria-label="Usar plantilla de pedido"
                  >
                    <LayoutTemplate className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                  </button>
                </>
              ) : null}

              {isEmpty ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onContinue();
                  }}
                  className="touch-manipulation rounded-xl border border-zinc-200/90 bg-white px-3 py-2 text-[11px] font-semibold text-zinc-600 shadow-sm ring-1 ring-zinc-100 transition-all duration-150 active:scale-[0.98]"
                >
                  Nuevo pedido
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onContinue();
                  }}
                  className="inline-flex h-10 touch-manipulation items-center gap-1 rounded-xl bg-[#E30613] px-3.5 text-[12px] font-bold text-white shadow-md ring-1 ring-[#E30613]/25 transition-transform duration-150 active:scale-[0.97] sm:px-4"
                >
                  Continuar
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                </button>
              )}
            </div>
          </div>

          {!isEmpty && minimumOrderEuro != null && minimumOrderEuro > 0 ? (
            <div className="border-t border-zinc-200/70 pt-1">
              {belowMinimum ? (
                <p className="rounded-lg bg-amber-50/95 px-2 py-1 text-[10px] font-semibold leading-snug text-amber-900 ring-1 ring-amber-200/80">
                  Faltan {formatMoney(gapEuro)} € para el pedido mínimo
                </p>
              ) : reachedMinimum ? (
                <p className="rounded-lg bg-emerald-50/95 px-2 py-1 text-[10px] font-semibold leading-snug text-emerald-900 ring-1 ring-emerald-200/70">
                  Pedido mínimo alcanzado
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

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

  const handleSummaryTap = React.useCallback(() => {
    if (props.isEmpty) return;
    setSheetOpen(true);
  }, [props.isEmpty]);

  const handleEmptyCta = React.useCallback(() => {
    props.onEmptyCatalogCta();
  }, [props.onEmptyCatalogCta]);

  return (
    <>
      <DockBar
        isEmpty={props.isEmpty}
        linesCount={props.linesCount}
        unitsCount={props.unitsCount}
        subtotalNoVat={props.subtotalNoVat}
        minimumOrderEuro={props.minimumOrderEuro}
        showQuickActions={props.showQuickActions}
        onSummaryTap={handleSummaryTap}
        onContinue={props.isEmpty ? handleEmptyCta : props.onContinue}
        onWhatsApp={props.onWhatsApp}
        onTemplate={props.onTemplate}
      />

      <SummarySheet open={sheetOpen} onClose={() => setSheetOpen(false)} {...props} />
    </>
  );
});
