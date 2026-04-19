'use client';

import React from 'react';
import { useRepeatPress } from '@/hooks/useRepeatPress';
import { formatQuantityWithUnit, unitPriceCatalogSuffix } from '@/lib/pedidos-format';
import type { PedidoSupplierProduct } from '@/lib/pedidos-supabase';

function shortUnitChip(unit: string): string {
  const u = unit.toLowerCase();
  if (u === 'paquete') return 'PAQ.';
  if (u === 'caja') return 'CAJ.';
  if (u === 'bolsa') return 'BOL.';
  if (u === 'racion') return 'RAC.';
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

  return (
    <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-800">{p.name}</p>
          <p className="text-xs text-zinc-500">
            {p.pricePerUnit.toFixed(2)} €/{u}
          </p>
          {suggestedQty != null ? (
            <p className="mt-1 text-[11px] font-semibold text-zinc-700">
              Cant. tramo: {formatQuantityWithUnit(suggestedQty, p.unit)}
            </p>
          ) : null}
        </div>
        <p className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-zinc-900">{lineTotal.toFixed(2)} €</p>
      </div>
      <div className="mt-3 flex min-w-0 items-center justify-end gap-2">
        <button
          type="button"
          {...repeatDown}
          className="grid h-10 w-10 shrink-0 touch-manipulation place-items-center rounded-full border border-zinc-300 bg-white text-lg font-semibold leading-none text-zinc-700 shadow-sm active:bg-zinc-50"
          aria-label={`Quitar una unidad de ${p.name}`}
        >
          {'\u2212'}
        </button>
        <input
          type="number"
          min={0}
          step={p.unit === 'kg' ? 0.01 : 1}
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          aria-label={`Cantidad ${p.name}`}
          className="h-10 min-w-[4.5rem] max-w-[6.5rem] flex-1 rounded-lg border border-zinc-300 bg-white px-2 text-center text-base font-semibold text-zinc-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          value={qty === 0 ? '' : p.unit === 'kg' ? qty : Math.round(qty)}
          onChange={(e) => onManual(e.target.value)}
        />
        <button
          type="button"
          {...repeatUp}
          className="grid h-10 w-10 shrink-0 touch-manipulation place-items-center rounded-full bg-[#D32F2F] text-lg font-semibold leading-none text-white shadow-sm active:bg-[#B71C1C]"
          aria-label={`Añadir una unidad de ${p.name}`}
        >
          +
        </button>
        <span className="w-12 shrink-0 text-left text-[10px] font-semibold uppercase leading-tight text-zinc-500">
          {shortUnitChip(p.unit)}
        </span>
      </div>
    </div>
  );
}
