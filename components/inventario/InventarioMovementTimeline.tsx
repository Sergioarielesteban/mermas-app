'use client';

import type { InventoryMovementWithItem } from '@/lib/inventory-operations-supabase';
import { MOVEMENT_TYPE_LABELS } from '@/lib/inventory-operations-supabase';
import { InventarioMovementIcon } from '@/components/inventario/InventarioStockCard';
import { formatRelativeShort, formatStockQuantity, labelInventoryUnit } from '@/lib/inventory-stock-format';

type Props = {
  movements: InventoryMovementWithItem[];
  loading?: boolean;
  emptyMessage?: string;
};

export default function InventarioMovementTimeline({
  movements,
  loading,
  emptyMessage = 'Aún no hay movimientos registrados.',
}: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-200/70 bg-white px-3 py-4 text-center text-[12px] text-zinc-500 ring-1 ring-zinc-100/80">
        Cargando movimientos…
      </div>
    );
  }

  if (movements.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200/90 bg-zinc-50/70 px-3 py-4 text-center text-[12px] text-zinc-600 ring-1 ring-zinc-100">
        {emptyMessage}
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {movements.map((m) => {
        const inbound = m.quantity_delta >= 0;
        return (
          <li
            key={m.id}
            className={[
              'rounded-2xl border-l-[3px] px-2.5 py-2 ring-1 shadow-[0_2px_8px_rgba(24,24,27,0.035)]',
              inbound
                ? 'border-l-emerald-500 bg-white ring-emerald-100/80'
                : 'border-l-amber-500 bg-white ring-amber-100/80',
            ].join(' ')}
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-zinc-50 ring-1 ring-zinc-200/70">
                <InventarioMovementIcon delta={m.quantity_delta} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[13px] font-black leading-tight text-zinc-950">
                    {m.item_name || 'Producto'}
                  </p>
                  <p className="shrink-0 font-mono text-[13px] font-bold tabular-nums text-zinc-900">
                    {inbound ? '+' : ''}
                    {formatStockQuantity(m.quantity_delta, m.unit ?? m.item_unit)}
                  </p>
                </div>
                <p className="mt-0.5 text-[11px] font-semibold text-zinc-700">
                  {MOVEMENT_TYPE_LABELS[m.movement_type] ?? 'Movimiento'}
                  {m.reason?.trim() ? ` · ${m.reason.trim()}` : ''}
                </p>
                <p className="mt-0.5 text-[10px] text-zinc-500">
                  {formatRelativeShort(m.occurred_at)}
                  {m.previous_stock != null && m.new_stock != null
                    ? ` · ${m.previous_stock} → ${m.new_stock} ${labelInventoryUnit(m.unit ?? m.item_unit)}`
                    : ''}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
