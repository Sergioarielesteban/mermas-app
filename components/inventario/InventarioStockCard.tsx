'use client';

import Link from 'next/link';
import { ClipboardList, History, SlidersHorizontal } from 'lucide-react';
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
  const unitLabel = labelInventoryUnit(item.unit);
  const supplierLine = item.supplierProductId ? 'Proveedor enlazado' : 'Sin proveedor';
  const price =
    item.price_per_unit > 0
      ? `${item.price_per_unit.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/${labelInventoryUnit(item.unidadCoste)}`
      : null;
  const movementLine = lastMovement
    ? `${MOVEMENT_TYPE_LABELS[lastMovement.movement_type] ?? 'Mov.'} · ${formatRelativeShort(lastMovement.occurred_at)}`
    : 'Sin movimientos';

  const secondaryBits = [price, movementLine, item.supplierProductId ? 'Pedidos activo' : null].filter(Boolean);

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200/70 bg-white px-3 py-2.5 shadow-sm ring-1 ring-zinc-100/80">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-black leading-tight text-zinc-950">{item.name}</h3>
          <p className="mt-0.5 truncate text-[10px] font-medium text-zinc-500">
            {supplierLine} · {unitLabel}
            {item.format_label ? ` · ${item.format_label}` : ''}
          </p>
        </div>
        <span
          className={[
            'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1',
            STOCK_STATUS_BADGE[status],
          ].join(' ')}
        >
          {STOCK_STATUS_LABEL[status]}
        </span>
      </div>

      <p className="mt-1.5 font-mono text-[17px] font-bold tabular-nums leading-none text-zinc-900">
        {formatStockQuantity(item.quantity_on_hand, item.unit)}
      </p>

      {secondaryBits.length > 0 ? (
        <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-zinc-500">{secondaryBits.join(' · ')}</p>
      ) : null}

      <div className="mt-2 grid min-w-0 grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => onAdjust(item)}
          className="inline-flex min-h-[34px] min-w-0 items-center justify-center gap-0.5 rounded-2xl border border-zinc-200 bg-white px-1 text-[9px] font-bold text-zinc-700 transition hover:bg-zinc-50 sm:gap-1 sm:px-1.5 sm:text-[10px]"
        >
          <SlidersHorizontal className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">Ajustar</span>
        </button>
        <button
          type="button"
          onClick={() => onCount(item)}
          className="inline-flex min-h-[34px] min-w-0 items-center justify-center gap-0.5 rounded-2xl border border-zinc-200 bg-white px-1 text-[9px] font-bold text-zinc-700 transition hover:bg-zinc-50 sm:gap-1 sm:px-1.5 sm:text-[10px]"
        >
          <ClipboardList className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">Contar</span>
        </button>
        <Link
          href={`/inventario/movimientos?item=${item.id}`}
          className="inline-flex min-h-[34px] min-w-0 items-center justify-center gap-0.5 rounded-2xl border border-zinc-200 bg-white px-1 text-[9px] font-bold text-zinc-700 transition hover:bg-zinc-50 sm:gap-1 sm:px-1.5 sm:text-[10px]"
        >
          <History className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">Movim.</span>
        </Link>
      </div>
    </article>
  );
}

export function InventarioMovementIcon({ delta }: { delta: number }) {
  return (
    <span
      className={[
        'text-[11px] font-black tabular-nums',
        delta >= 0 ? 'text-emerald-700' : 'text-amber-800',
      ].join(' ')}
      aria-hidden
    >
      {delta >= 0 ? '+' : '−'}
    </span>
  );
}
