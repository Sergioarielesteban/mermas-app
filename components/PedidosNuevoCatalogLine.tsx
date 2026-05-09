'use client';

import { Star } from 'lucide-react';
import React from 'react';
import { useRepeatPress } from '@/hooks/useRepeatPress';
import { formatQuantityWithUnit, unitPriceCatalogSuffix } from '@/lib/pedidos-format';
import { supplierProductHasDistinctBilling, type PedidoSupplierProduct } from '@/lib/pedidos-supabase';
import { unitAllowsDecimalOrderQuantity } from '@/lib/pedidos-units';

function shortUnitChip(unit: string): string {
  const u = unit.toLowerCase();
  if (u === 'paquete') return 'PAQ.';
  if (u === 'caja') return 'CAJ.';
  if (u === 'bolsa') return 'BOL.';
  if (u === 'racion') return 'RAC.';
  if (u === 'docena') return 'DOC.';
  if (u === 'litro') return 'L';
  if (u === 'ml') return 'ML';
  if (u === 'g') return 'G';
  return unit.toUpperCase();
}

export type PedidosNuevoCatalogLineProps = {
  product: PedidoSupplierProduct;
  qty: number;
  lineTotal: number;
  suggestedQty: number | null;
  onDelta: (delta: number) => void;
  onManual: (raw: string) => void;
  /** Última recepción registrada (referencia; no modifica precio catálogo). */
  repeatFromReception?: {
    qty: number;
    atIso: string;
    unitPrice: number;
  };
  favoriteToggle?: {
    isFavorite: boolean;
    onToggle: () => void;
    disabled?: boolean;
  };
};

function shortDateEs(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

export default function PedidosNuevoCatalogLine({
  product: p,
  qty,
  lineTotal,
  suggestedQty,
  onDelta,
  onManual,
  repeatFromReception,
  favoriteToggle,
}: PedidosNuevoCatalogLineProps) {
  const u = unitPriceCatalogSuffix[p.unit];
  const repeatUp = useRepeatPress(() => onDelta(1));
  const repeatDown = useRepeatPress(() => onDelta(-1));
  const dual = supplierProductHasDistinctBilling(p) && p.billingUnit === 'kg';
  const eq = p.billingQtyPerOrderUnit ?? p.estimatedKgPerUnit;
  const estKg =
    dual && qty > 0 && eq != null && eq > 0 ? Math.round(qty * eq * 1000) / 1000 : null;
  const ppk = dual && p.pricePerBillingUnit != null ? p.pricePerBillingUnit : null;
  const pack = p.unitsPerPack > 0 ? p.unitsPerPack : 1;
  const internalUseTotal =
    pack > 1 && p.recipeUnit != null && qty > 0
      ? Math.round(qty * pack * 10000) / 10000
      : null;
  const su = p.recipeUnit != null ? unitPriceCatalogSuffix[p.recipeUnit] : null;
  const showSubtotal = qty > 0;
  const priceLine =
    dual && ppk != null
      ? `${ppk.toFixed(2)} €/kg${eq != null ? ` · ${eq} kg/${u}` : ''}`
      : `${p.pricePerUnit.toFixed(2)} €/${u}`;
  const lastRecvCatalog =
    repeatFromReception == null &&
    p.ultimoPrecioRecibido != null &&
    Number.isFinite(p.ultimoPrecioRecibido) &&
    p.ultimoPrecioRecibido > 0
      ? `${p.ultimoPrecioRecibido.toFixed(2)} €/${u}`
      : null;

  return (
    <div className="rounded-xl bg-white py-1 px-1.5 shadow-sm shadow-zinc-200/40 ring-1 ring-zinc-200/70">
      <div className="flex items-start gap-1.5">
        {favoriteToggle ? (
          <button
            type="button"
            disabled={favoriteToggle.disabled}
            onClick={(e) => {
              e.stopPropagation();
              if (favoriteToggle.disabled) return;
              favoriteToggle.onToggle();
            }}
            className={[
              'mt-0.5 grid h-9 w-9 shrink-0 touch-manipulation place-items-center rounded-xl transition-colors active:scale-[0.97]',
              favoriteToggle.disabled ? 'cursor-not-allowed opacity-35' : '',
              favoriteToggle.isFavorite ? 'text-amber-500' : 'text-zinc-300 hover:text-zinc-400',
            ].join(' ')}
            aria-label={favoriteToggle.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
            aria-pressed={favoriteToggle.isFavorite}
          >
            <Star
              className="h-[1.125rem] w-[1.125rem]"
              strokeWidth={favoriteToggle.isFavorite ? 0 : 1.35}
              fill={favoriteToggle.isFavorite ? 'currentColor' : 'none'}
            />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug text-zinc-900">{p.name}</p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">{shortUnitChip(p.unit)}</p>
          <p className="mt-0.5 text-[11px] font-medium tabular-nums text-zinc-700">{priceLine}</p>
          {repeatFromReception ? (
            <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
              Último pedido ·{' '}
              <span className="font-medium text-zinc-700">
                {formatQuantityWithUnit(repeatFromReception.qty, p.unit)}
              </span>
              {shortDateEs(repeatFromReception.atIso) ? (
                <> · {shortDateEs(repeatFromReception.atIso)}</>
              ) : null}
              {' · '}
              <span className="font-semibold tabular-nums text-[#D32F2F]">
                {repeatFromReception.unitPrice.toFixed(2)} €/{u}
              </span>
            </p>
          ) : lastRecvCatalog ? (
            <p className="mt-0.5 text-[10px] tabular-nums text-zinc-500">
              Último: <span className="font-semibold text-[#D32F2F]">{lastRecvCatalog}</span>
            </p>
          ) : null}
          {qty > 0 && dual && ppk != null && estKg != null ? (
            <p className="mt-0.5 text-[10px] text-zinc-500">
              Est. {estKg} kg · {lineTotal.toFixed(2)} €
            </p>
          ) : null}
          {qty > 0 && internalUseTotal != null && su != null ? (
            <p className="mt-0.5 text-[10px] text-zinc-500">
              Uso: {internalUseTotal.toLocaleString('es-ES', { maximumFractionDigits: 4 })} {su}
            </p>
          ) : null}
          {suggestedQty != null ? (
            <p className="mt-0.5 text-[10px] font-medium text-zinc-600">
              Tramo: {formatQuantityWithUnit(suggestedQty, p.unit)}
            </p>
          ) : null}
        </div>
        {showSubtotal ? (
          <p className="shrink-0 self-start pt-0.5 text-[13px] font-bold tabular-nums text-zinc-900">
            {lineTotal.toFixed(2)} €
          </p>
        ) : null}
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-2">
        <button
          type="button"
          {...repeatDown}
          className="grid h-10 w-10 shrink-0 touch-manipulation place-items-center rounded-xl border border-zinc-200 bg-white text-lg font-semibold leading-none text-zinc-800 shadow-sm active:bg-zinc-100"
          aria-label={`Quitar una unidad de ${p.name}`}
        >
          {'\u2212'}
        </button>
        <input
          type="number"
          min={0}
          step={unitAllowsDecimalOrderQuantity(p.unit) ? 0.01 : 1}
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          aria-label={`Cantidad ${p.name}`}
          className="h-10 min-w-[3.25rem] flex-1 rounded-xl border-0 bg-white px-2 text-center text-[15px] font-semibold tabular-nums text-zinc-900 shadow-inner shadow-zinc-200/80 ring-1 ring-zinc-200/90 outline-none focus:ring-2 focus:ring-[#D32F2F]/25 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          value={qty === 0 ? '' : unitAllowsDecimalOrderQuantity(p.unit) ? qty : Math.round(qty)}
          onChange={(e) => onManual(e.target.value)}
        />
        <button
          type="button"
          {...repeatUp}
          className="grid h-10 w-10 shrink-0 touch-manipulation place-items-center rounded-xl bg-[#D32F2F] text-lg font-semibold leading-none text-white shadow-sm active:bg-[#B71C1C]"
          aria-label={`Añadir una unidad de ${p.name}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
