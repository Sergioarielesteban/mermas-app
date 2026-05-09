'use client';

import { Star } from 'lucide-react';
import React from 'react';
import { usePedidosStepperHold } from '@/hooks/usePedidosStepperHold';
import { formatQuantityWithUnit, unitPriceCatalogSuffix } from '@/lib/pedidos-format';
import { supplierProductHasDistinctBilling, type PedidoSupplierProduct } from '@/lib/pedidos-supabase';
import { parseQuantityManualInput } from '@/lib/pedidos-order-quantity';
import { unitAllowsDecimalOrderQuantity } from '@/lib/pedidos-units';
import type { Unit } from '@/lib/types';

function shortUnitChip(unit: string): string {
  const u = unit.toLowerCase();
  if (u === 'paquete') return 'paq.';
  if (u === 'caja') return 'caja';
  if (u === 'bolsa') return 'bolsa';
  if (u === 'racion') return 'ración';
  if (u === 'docena') return 'doc.';
  if (u === 'litro') return 'L';
  if (u === 'ml') return 'ml';
  if (u === 'g') return 'g';
  return unit.toLowerCase();
}

function shortDateEs(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

/** Visualización de cantidad siempre visible (incluido 0). */
function formatQtyDisplay(qty: number, unit: Unit): string {
  if (unitAllowsDecimalOrderQuantity(unit)) {
    return qty.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  return String(Math.max(0, Math.round(qty)));
}

export type PedidosNuevoCatalogLineProps = {
  product: PedidoSupplierProduct;
  qty: number;
  lineTotal: number;
  suggestedQty: number | null;
  onDelta: (delta: number) => void;
  onManual: (raw: string) => void;
  receptionQty?: number;
  receptionAtIso?: string;
  receptionUnitPrice?: number;
  /** Estrella: solo pasar si hay usuario (productId evita closures nuevos por línea). */
  favoriteProductId?: string;
  isFavorite?: boolean;
  favoriteDisabled?: boolean;
  onFavoriteToggle?: (productId: string) => void;
};

function PedidosNuevoCatalogLineInner({
  product: p,
  qty,
  lineTotal,
  suggestedQty,
  onDelta,
  onManual,
  receptionQty,
  receptionAtIso,
  receptionUnitPrice,
  favoriteProductId,
  isFavorite,
  favoriteDisabled,
  onFavoriteToggle,
}: PedidosNuevoCatalogLineProps) {
  const u = unitPriceCatalogSuffix[p.unit];
  const hold = usePedidosStepperHold(onDelta, {
    delayBeforeRepeatMs: 400,
    slowIntervalMs: 96,
    fastIntervalMs: 68,
    accelAfterMs: 780,
    slowStep: 1,
    fastStep: 5,
  });

  const [editingQty, setEditingQty] = React.useState(false);
  const [draftQty, setDraftQty] = React.useState('');
  /** Atajos +5/+10/+20 o −5/−10/−20; null = cerrado. */
  const [popoverShortcuts, setPopoverShortcuts] = React.useState<null | { bulkSign: 1 | -1 }>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const stepperShellRef = React.useRef<HTMLDivElement>(null);
  const idleCloseRef = React.useRef<number | null>(null);
  const longPressPlusRef = React.useRef<number | null>(null);
  const longPressMinusRef = React.useRef<number | null>(null);
  const holdRedTimerRef = React.useRef<number | null>(null);
  /** Cantidad en rojo durante incremento/decremento continuo (mock “mantener pulsado”). */
  const [qtyHoldHighlight, setQtyHoldHighlight] = React.useState(false);

  const LONG_PRESS_MS = 320;
  const IDLE_CLOSE_MS = 2600;
  /** Alineado con delayBeforeRepeatMs del hook: modo repetición = highlight rojo. */
  const HOLD_RED_DELAY_MS = 400;

  /** Popover ±1/±5… solo en viewport ≥ sm; en móvil queda recortado por overflow del listado. */
  const [holdShortcutsEnabled, setHoldShortcutsEnabled] = React.useState(false);

  const clearIdleClose = React.useCallback(() => {
    if (idleCloseRef.current != null) {
      window.clearTimeout(idleCloseRef.current);
      idleCloseRef.current = null;
    }
  }, []);

  const scheduleIdleClose = React.useCallback(() => {
    clearIdleClose();
    idleCloseRef.current = window.setTimeout(() => {
      idleCloseRef.current = null;
      setPopoverShortcuts(null);
    }, IDLE_CLOSE_MS);
  }, [clearIdleClose]);

  const clearLongPressTimers = React.useCallback(() => {
    if (longPressPlusRef.current != null) {
      window.clearTimeout(longPressPlusRef.current);
      longPressPlusRef.current = null;
    }
    if (longPressMinusRef.current != null) {
      window.clearTimeout(longPressMinusRef.current);
      longPressMinusRef.current = null;
    }
  }, []);

  const clearHoldRed = React.useCallback(() => {
    if (holdRedTimerRef.current != null) {
      window.clearTimeout(holdRedTimerRef.current);
      holdRedTimerRef.current = null;
    }
    setQtyHoldHighlight(false);
  }, []);

  const scheduleHoldRed = React.useCallback(() => {
    clearHoldRed();
    holdRedTimerRef.current = window.setTimeout(() => {
      holdRedTimerRef.current = null;
      setQtyHoldHighlight(true);
    }, HOLD_RED_DELAY_MS);
  }, [clearHoldRed]);

  /** Abre atajos tras long-press: detiene el hold para que no sigan saltando cantidades con el popover abierto. */
  const openShortcutsFromHold = React.useCallback(
    (bulkSign: 1 | -1) => {
      hold.onHoldPointerEnd();
      clearHoldRed();
      setPopoverShortcuts({ bulkSign });
      scheduleIdleClose();
    },
    [clearHoldRed, hold, scheduleIdleClose],
  );

  const closeShortcuts = React.useCallback(() => {
    clearIdleClose();
    setPopoverShortcuts(null);
  }, [clearIdleClose]);

  React.useEffect(() => {
    if (!holdShortcutsEnabled) closeShortcuts();
  }, [holdShortcutsEnabled, closeShortcuts]);

  React.useEffect(() => {
    return () => {
      clearIdleClose();
      clearLongPressTimers();
      clearHoldRed();
    };
  }, [clearHoldRed, clearIdleClose, clearLongPressTimers]);

  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const sync = () => setHoldShortcutsEnabled(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  React.useEffect(() => {
    if (!popoverShortcuts) return;
    const onDoc = (ev: PointerEvent) => {
      const el = stepperShellRef.current;
      if (!el?.contains(ev.target as Node)) closeShortcuts();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') closeShortcuts();
    };
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [popoverShortcuts, closeShortcuts]);

  const dual = supplierProductHasDistinctBilling(p) && p.billingUnit === 'kg';
  const eq = p.billingQtyPerOrderUnit ?? p.estimatedKgPerUnit;
  const estKg =
    dual && qty > 0 && eq != null && eq > 0 ? Math.round(qty * eq * 1000) / 1000 : null;
  const ppk = dual && p.pricePerBillingUnit != null ? p.pricePerBillingUnit : null;
  const pack = p.unitsPerPack > 0 ? p.unitsPerPack : 1;
  const packLabel =
    pack > 1 ? `${shortUnitChip(p.unit)} · ${Math.round(pack)} u` : shortUnitChip(p.unit);
  const internalUseTotal =
    pack > 1 && p.recipeUnit != null && qty > 0
      ? Math.round(qty * pack * 10000) / 10000
      : null;
  const su = p.recipeUnit != null ? unitPriceCatalogSuffix[p.recipeUnit] : null;

  const priceLine =
    dual && ppk != null
      ? `${ppk.toFixed(2)} €/kg${eq != null ? ` · ${eq} kg/${u}` : ''}`
      : `${p.pricePerUnit.toFixed(2)} €/${u}`;

  const hasReception =
    receptionQty != null &&
    receptionAtIso != null &&
    receptionUnitPrice != null &&
    Number.isFinite(receptionUnitPrice);

  const lastRecvCatalog =
    !hasReception &&
    p.ultimoPrecioRecibido != null &&
    Number.isFinite(p.ultimoPrecioRecibido) &&
    p.ultimoPrecioRecibido > 0
      ? `${p.ultimoPrecioRecibido.toFixed(2)} €/${u}`
      : null;

  React.useEffect(() => {
    if (!editingQty) return;
    inputRef.current?.focus();
    inputRef.current?.select?.();
  }, [editingQty]);

  const beginEditQty = React.useCallback(() => {
    closeShortcuts();
    setDraftQty(formatQtyDisplay(qty, p.unit));
    setEditingQty(true);
  }, [closeShortcuts, qty, p.unit]);

  const applyBulk = React.useCallback(
    (n: 1 | 5 | 10 | 20, sign: 1 | -1) => {
      onDelta(sign * n);
      closeShortcuts();
    },
    [onDelta, closeShortcuts],
  );

  const commitDraft = React.useCallback(() => {
    const raw = draftQty.trim() === '' ? '0' : draftQty;
    const parsed = parseQuantityManualInput(p.unit, raw);
    onManual(parsed === null ? '0' : String(parsed));
    setEditingQty(false);
  }, [draftQty, onManual, p.unit]);

  const handleFavoriteClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (favoriteDisabled || !favoriteProductId || !onFavoriteToggle) return;
      onFavoriteToggle(favoriteProductId);
    },
    [favoriteDisabled, favoriteProductId, onFavoriteToggle],
  );

  const extraHintParts: string[] = [];
  if (qty > 0 && dual && ppk != null && estKg != null) {
    extraHintParts.push(`Est. ${estKg} kg · ${lineTotal.toFixed(2)} €`);
  }
  if (qty > 0 && internalUseTotal != null && su != null) {
    extraHintParts.push(
      `Uso: ${internalUseTotal.toLocaleString('es-ES', { maximumFractionDigits: 4 })} ${su}`,
    );
  }
  if (suggestedQty != null) {
    extraHintParts.push(`Tramo: ${formatQuantityWithUnit(suggestedQty, p.unit)}`);
  }

  const minusDisabled = qty <= 0;
  const stepperActive = qty > 0;

  return (
    <div
      className={[
        'px-2 transition-colors duration-200 sm:px-2.5',
        isFavorite ? 'bg-[#FFF9F9]' : 'bg-white',
      ].join(' ')}
    >
      <div className="flex items-start gap-1.5 py-1 sm:gap-2">
        {favoriteProductId != null && onFavoriteToggle ? (
          <button
            type="button"
            disabled={favoriteDisabled}
            onClick={handleFavoriteClick}
            className={[
              'grid h-5 w-5 shrink-0 touch-manipulation place-items-center rounded transition-[transform,background-color,color] duration-150 active:scale-95',
              favoriteDisabled ? 'cursor-not-allowed opacity-35' : '',
              isFavorite
                ? 'text-[#E30613] hover:bg-[#E30613]/8'
                : 'text-zinc-400 hover:bg-zinc-100/90 hover:text-zinc-500',
            ].join(' ')}
            aria-label={isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
            aria-pressed={Boolean(isFavorite)}
          >
            <Star
              className="h-2.5 w-2.5"
              strokeWidth={isFavorite ? 0 : 1.35}
              fill={isFavorite ? 'currentColor' : 'none'}
            />
          </button>
        ) : null}

        <div className="flex min-w-0 flex-1 items-start gap-2 sm:gap-2.5">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[13px] font-medium leading-snug tracking-tight text-zinc-900 [overflow-wrap:anywhere]">
              {p.name}
            </p>
            <p className="mt-px text-[11px] leading-snug text-zinc-500">
              <span className="text-zinc-500">{packLabel}</span>
              <span className="text-zinc-400"> · </span>
              {hasReception ? (
                <>
                  <span className="font-semibold tabular-nums text-[#E30613]">
                    Último: {receptionUnitPrice!.toFixed(2)} €/{u}
                  </span>
                  {shortDateEs(receptionAtIso!) ? (
                    <span className="font-normal text-zinc-500"> · {shortDateEs(receptionAtIso!)}</span>
                  ) : null}
                </>
              ) : lastRecvCatalog ? (
                <span className="font-semibold tabular-nums text-[#E30613]">Último: {lastRecvCatalog}</span>
              ) : (
                <span className="font-semibold tabular-nums text-[#E30613]">{priceLine}</span>
              )}
            </p>
            {extraHintParts.length > 0 ? (
              <p className="mt-px truncate text-[10px] leading-tight text-zinc-500">{extraHintParts.join(' · ')}</p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center self-start pt-0.5">
            <div className="relative shrink-0" ref={stepperShellRef}>
              <div
                className={[
                  'inline-flex h-10 min-h-10 max-h-10 min-w-0 touch-manipulation items-stretch overflow-hidden rounded-full border bg-white transition-[box-shadow,border-color] duration-150',
                  stepperActive
                    ? 'border-zinc-200/90 shadow-[0_1px_6px_rgba(0,0,0,0.05)]'
                    : 'border-zinc-200/70 shadow-none',
                ].join(' ')}
              >
                <button
                  type="button"
                  disabled={minusDisabled}
                  tabIndex={-1}
                  onPointerDown={(e) => {
                    if (minusDisabled) return;
                    scheduleHoldRed();
                    hold.onMinusPointerDown(e);
                    clearLongPressTimers();
                    if (holdShortcutsEnabled) {
                      longPressMinusRef.current = window.setTimeout(() => {
                        longPressMinusRef.current = null;
                        openShortcutsFromHold(-1);
                      }, LONG_PRESS_MS);
                    }
                  }}
                  onPointerUp={() => {
                    clearHoldRed();
                    clearLongPressTimers();
                    hold.onHoldPointerEnd();
                  }}
                  onPointerCancel={() => {
                    clearHoldRed();
                    clearLongPressTimers();
                    hold.onHoldPointerEnd();
                  }}
                  onPointerLeave={() => {
                    clearHoldRed();
                    clearLongPressTimers();
                    hold.onHoldPointerEnd();
                  }}
                  className={[
                    'grid h-10 min-h-10 max-h-10 min-w-[2.25rem] max-w-[2.25rem] shrink-0 touch-manipulation select-none place-items-center bg-white text-lg font-semibold leading-none tracking-tight transition-colors duration-100',
                    minusDisabled
                      ? 'cursor-not-allowed text-zinc-300'
                      : 'text-zinc-500 active:bg-zinc-100',
                  ].join(' ')}
                  aria-label={`Quitar una unidad de ${p.name}`}
                >
                  −
                </button>
                <div className="flex h-10 min-h-10 max-h-10 w-[3rem] min-w-[3rem] max-w-[3rem] shrink-0 items-center justify-center overflow-hidden bg-white px-0.5 sm:w-[3.1rem] sm:min-w-[3.1rem] sm:max-w-[3.1rem]">
                  {editingQty ? (
                    <input
                      ref={inputRef}
                      type="text"
                      inputMode={unitAllowsDecimalOrderQuantity(p.unit) ? 'decimal' : 'numeric'}
                      enterKeyHint="done"
                      autoComplete="off"
                      aria-label={`Cantidad ${p.name}`}
                      value={draftQty}
                      onChange={(e) => setDraftQty(e.target.value)}
                      onBlur={commitDraft}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitDraft();
                        }
                      }}
                      className="box-border h-10 min-h-10 max-h-10 w-full min-w-0 border-0 bg-transparent py-0 text-center text-[16px] font-semibold tabular-nums leading-none tracking-tight text-zinc-900 outline-none ring-0 transition-colors duration-150 [-webkit-appearance:none] appearance-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        beginEditQty();
                      }}
                      className={[
                        'box-border flex h-10 min-h-10 max-h-10 w-full min-w-0 touch-manipulation items-center justify-center px-0.5 text-center text-[16px] font-semibold tabular-nums leading-none tracking-tight outline-none transition-colors duration-100 active:bg-zinc-50',
                        qtyHoldHighlight
                          ? 'text-[#E30613]'
                          : qty > 0
                            ? 'text-zinc-900'
                            : 'text-zinc-400',
                      ].join(' ')}
                      aria-label={`Editar cantidad de ${p.name}`}
                    >
                      {formatQtyDisplay(qty, p.unit)}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  tabIndex={-1}
                  onPointerDown={(e) => {
                    scheduleHoldRed();
                    hold.onPlusPointerDown(e);
                    clearLongPressTimers();
                    if (holdShortcutsEnabled) {
                      longPressPlusRef.current = window.setTimeout(() => {
                        longPressPlusRef.current = null;
                        openShortcutsFromHold(1);
                      }, LONG_PRESS_MS);
                    }
                  }}
                  onPointerUp={() => {
                    clearHoldRed();
                    clearLongPressTimers();
                    hold.onHoldPointerEnd();
                  }}
                  onPointerCancel={() => {
                    clearHoldRed();
                    clearLongPressTimers();
                    hold.onHoldPointerEnd();
                  }}
                  onPointerLeave={() => {
                    clearHoldRed();
                    clearLongPressTimers();
                    hold.onHoldPointerEnd();
                  }}
                  className="grid h-10 min-h-10 max-h-10 min-w-[2.25rem] max-w-[2.25rem] shrink-0 touch-manipulation select-none place-items-center bg-white text-lg font-bold leading-none tracking-tight text-[#E30613] transition-colors duration-100 active:bg-[#FFF0F0]"
                  aria-label={`Añadir una unidad de ${p.name}`}
                >
                  +
                </button>
              </div>

              {popoverShortcuts ? (
                <div
                  role="dialog"
                  aria-label="Atajos de cantidad"
                  className="absolute right-0 top-full z-[70] mt-1 w-[11.25rem] max-w-[calc(100vw-2rem)] origin-top rounded-xl border border-zinc-200/90 bg-white p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.12)]"
                  onClick={() => scheduleIdleClose()}
                >
                  <div className="grid grid-cols-3 gap-1.5">
                    {([1, 5, 10] as const).map((n) => {
                      const s = popoverShortcuts.bulkSign;
                      const label = s > 0 ? `+${n}` : `−${n}`;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => applyBulk(n, s)}
                          className="grid min-h-10 min-w-0 touch-manipulation place-items-center rounded-lg border border-zinc-200/95 bg-white px-1 py-1.5 text-[13px] font-bold tabular-nums text-zinc-900 shadow-sm transition-[transform,background-color] duration-100 active:scale-[0.97] active:bg-zinc-50"
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => applyBulk(20, popoverShortcuts.bulkSign)}
                    className="mt-1.5 grid min-h-9 w-full touch-manipulation place-items-center rounded-lg border border-dashed border-zinc-300/95 bg-zinc-50/80 text-[12px] font-bold tabular-nums text-zinc-800 transition-[transform,background-color] duration-100 active:scale-[0.99] active:bg-zinc-100"
                  >
                    {popoverShortcuts.bulkSign > 0 ? '+20' : '−20'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function propsEqual(a: PedidosNuevoCatalogLineProps, b: PedidosNuevoCatalogLineProps): boolean {
  if (a.product !== b.product) return false;
  if (a.qty !== b.qty) return false;
  if (a.lineTotal !== b.lineTotal) return false;
  if (a.suggestedQty !== b.suggestedQty) return false;
  if (a.receptionQty !== b.receptionQty) return false;
  if (a.receptionAtIso !== b.receptionAtIso) return false;
  if (a.receptionUnitPrice !== b.receptionUnitPrice) return false;
  if (a.favoriteProductId !== b.favoriteProductId) return false;
  if (a.isFavorite !== b.isFavorite) return false;
  if (a.favoriteDisabled !== b.favoriteDisabled) return false;
  if (a.onDelta !== b.onDelta) return false;
  if (a.onManual !== b.onManual) return false;
  if (a.onFavoriteToggle !== b.onFavoriteToggle) return false;
  return true;
}

const PedidosNuevoCatalogLineMemo = React.memo(PedidosNuevoCatalogLineInner, propsEqual);

export type PedidosNuevoCatalogRowProps = {
  product: PedidoSupplierProduct;
  qty: number;
  lineTotal: number;
  suggestedQty: number | null;
  receptionQty?: number;
  receptionAtIso?: string;
  receptionUnitPrice?: number;
  isFavorite: boolean;
  favoriteDisabled: boolean;
  onAdjustDelta: (productId: string, unit: Unit, delta: number) => void;
  onManualChange: (productId: string, unit: Unit, raw: string) => void;
  onFavoriteToggle: (productId: string) => void;
};

/**
 * Fila de catálogo con callbacks estables hacia el padre; envuelve la línea memoizada para evitar
 * re-render en cada toque de +/− en otras filas.
 */
export const PedidosNuevoCatalogRow = React.memo(function PedidosNuevoCatalogRow({
  product,
  qty,
  lineTotal,
  suggestedQty,
  receptionQty,
  receptionAtIso,
  receptionUnitPrice,
  isFavorite,
  favoriteDisabled,
  onAdjustDelta,
  onManualChange,
  onFavoriteToggle,
}: PedidosNuevoCatalogRowProps) {
  const onDelta = React.useCallback(
    (d: number) => onAdjustDelta(product.id, product.unit, d),
    [onAdjustDelta, product.id, product.unit],
  );
  const onManual = React.useCallback(
    (raw: string) => onManualChange(product.id, product.unit, raw),
    [onManualChange, product.id, product.unit],
  );

  return (
    <PedidosNuevoCatalogLineMemo
      product={product}
      qty={qty}
      lineTotal={lineTotal}
      suggestedQty={suggestedQty}
      onDelta={onDelta}
      onManual={onManual}
      receptionQty={receptionQty}
      receptionAtIso={receptionAtIso}
      receptionUnitPrice={receptionUnitPrice}
      favoriteProductId={product.id}
      isFavorite={isFavorite}
      favoriteDisabled={favoriteDisabled}
      onFavoriteToggle={onFavoriteToggle}
    />
  );
});

export default PedidosNuevoCatalogRow;
