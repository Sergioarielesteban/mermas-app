'use client';

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

type Props = {
  product: PedidoSupplierProduct;
  qty: number;
  lineTotal: number;
  suggestedQty: number | null;
  onDelta: (delta: number) => void;
  onManual: (raw: string) => void;
};

export default function PedidosNuevoCatalogLine({ product: p, qty, lineTotal, suggestedQty, onDelta, onManual }: Props) {
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

  return (
    <div className="rounded-lg bg-zinc-50/90 py-1.5 pl-2 pr-2 ring-1 ring-zinc-200/85">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-tight text-zinc-900">{p.name}</p>
          <p className="mt-0.5 text-[12px] font-medium tabular-nums text-zinc-700">{priceLine}</p>
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
      <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          {...repeatDown}
          className="grid h-8 w-8 shrink-0 touch-manipulation place-items-center rounded-full border border-zinc-200 bg-white text-base font-semibold leading-none text-zinc-700 active:bg-zinc-100"
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
          className="h-8 min-w-[3.5rem] flex-1 rounded-xl border-0 bg-white px-2 text-center text-[15px] font-semibold tabular-nums text-zinc-900 shadow-inner shadow-zinc-200/80 ring-1 ring-zinc-200/90 outline-none focus:ring-2 focus:ring-[#D32F2F]/25 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          value={
            qty === 0 ? '' : unitAllowsDecimalOrderQuantity(p.unit) ? qty : Math.round(qty)
          }
          onChange={(e) => onManual(e.target.value)}
        />
        <button
          type="button"
          {...repeatUp}
          className="grid h-8 w-8 shrink-0 touch-manipulation place-items-center rounded-full bg-[#D32F2F] text-base font-semibold leading-none text-white active:bg-[#B71C1C]"
          aria-label={`Añadir una unidad de ${p.name}`}
        >
          +
        </button>
        <span className="w-10 shrink-0 text-right text-[9px] font-semibold uppercase leading-tight text-zinc-400">
          {shortUnitChip(p.unit)}
        </span>
      </div>
    </div>
  );
}
