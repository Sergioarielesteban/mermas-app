'use client';

import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, ClipboardList, History, SlidersHorizontal } from 'lucide-react';
import type { InventoryMovement } from '@/lib/inventory-operations-supabase';
import { MOVEMENT_TYPE_LABELS } from '@/lib/inventory-operations-supabase';
import type { InventoryStockRow } from '@/lib/inventory-operations-supabase';
import {
  STOCK_STATUS_BADGE,
  STOCK_STATUS_LABEL,
  formatRelativeShort,
  formatStockQuantity,
  labelInventoryUnit,
  resolveStockStatus,
} from '@/lib/inventory-stock-format';

type Props = {
  item: InventoryStockRow;
  lastMovement?: InventoryMovement | null;
  onAdjust: (item: InventoryStockRow) => void;
  onCount: (item: InventoryStockRow) => void;
};

export default function InventarioStockCard({ item, lastMovement, onAdjust, onCount }: Props) {
  const status = resolveStockStatus(item.quantity_on_hand, item.min_stock);
  const price =
    item.price_per_unit > 0
      ? `${item.price_per_unit.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/${labelInventoryUnit(item.unidadCoste)}`
      : null;

  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/80">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-zinc-900">{item.name}</h3>
          {item.format_label ? (
            <p className="mt-0.5 truncate text-[11px] font-medium text-zinc-500">{item.format_label}</p>
          ) : null}
        </div>
        <span
          className={[
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1',
            STOCK_STATUS_BADGE[status],
          ].join(' ')}
        >
          {STOCK_STATUS_LABEL[status]}
        </span>
      </div>

      <p className="mt-3 text-3xl font-extrabold tabular-nums tracking-tight text-zinc-900">
        {formatStockQuantity(item.quantity_on_hand, item.unit)}
      </p>

      <dl className="mt-3 space-y-1 text-[11px] text-zinc-600">
        {price ? (
          <div className="flex justify-between gap-2">
            <dt className="text-zinc-500">Último precio</dt>
            <dd className="font-semibold text-zinc-800">{price}</dd>
          </div>
        ) : null}
        {lastMovement ? (
          <div className="flex justify-between gap-2">
            <dt className="text-zinc-500">Último movimiento</dt>
            <dd className="truncate text-right font-semibold text-zinc-800">
              {MOVEMENT_TYPE_LABELS[lastMovement.movement_type] ?? 'Movimiento'} ·{' '}
              {formatRelativeShort(lastMovement.occurred_at)}
            </dd>
          </div>
        ) : (
          <div className="flex justify-between gap-2">
            <dt className="text-zinc-500">Último movimiento</dt>
            <dd className="font-medium text-zinc-400">Sin movimientos</dd>
          </div>
        )}
        {item.supplierId ? (
          <div className="flex justify-between gap-2">
            <dt className="text-zinc-500">Enlace proveedor</dt>
            <dd className="font-semibold text-emerald-700">Activo</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onAdjust(item)}
          className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 text-[11px] font-bold text-zinc-800 active:bg-zinc-100"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          Ajustar
        </button>
        <button
          type="button"
          onClick={() => onCount(item)}
          className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 text-[11px] font-bold text-zinc-800 active:bg-zinc-100"
        >
          <ClipboardList className="h-3.5 w-3.5" aria-hidden />
          Contar
        </button>
        <Link
          href={`/inventario/movimientos?item=${item.id}`}
          className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-zinc-200 bg-white text-[11px] font-bold text-zinc-800 hover:bg-zinc-50"
        >
          <History className="h-3.5 w-3.5" aria-hidden />
          Ver
        </Link>
      </div>
    </article>
  );
}

export function InventarioMovementIcon({ delta }: { delta: number }) {
  if (delta >= 0) {
    return <ArrowDownLeft className="h-4 w-4 text-emerald-600" aria-hidden />;
  }
  return <ArrowUpRight className="h-4 w-4 text-amber-700" aria-hidden />;
}
