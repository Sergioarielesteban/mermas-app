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
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
        Cargando movimientos…
      </div>
    );
  }

  if (movements.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/80 p-6 text-center text-sm text-zinc-600">
        {emptyMessage}
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {movements.map((m) => {
        const inbound = m.quantity_delta >= 0;
        return (
          <li
            key={m.id}
            className={[
              'rounded-2xl px-3 py-3 ring-1',
              inbound ? 'bg-emerald-50/40 ring-emerald-100/80' : 'bg-amber-50/35 ring-amber-100/80',
            ].join(' ')}
          >
            <div className="flex items-start gap-3">
              <div
                className={[
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1',
                  inbound ? 'bg-white ring-emerald-200/70' : 'bg-white ring-amber-200/70',
                ].join(' ')}
              >
                <InventarioMovementIcon delta={m.quantity_delta} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <p className="truncate text-sm font-bold text-zinc-900">{m.item_name || 'Producto'}</p>
                  <p className="shrink-0 text-sm font-extrabold tabular-nums text-zinc-900">
                    {inbound ? '+' : ''}
                    {formatStockQuantity(m.quantity_delta, m.unit ?? m.item_unit)}
                  </p>
                </div>
                <p className="mt-0.5 text-xs font-semibold text-zinc-700">
                  {MOVEMENT_TYPE_LABELS[m.movement_type] ?? 'Movimiento'}
                  {m.reason?.trim() ? ` · ${m.reason.trim()}` : ''}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {formatRelativeShort(m.occurred_at)}
                  {m.previous_stock != null && m.new_stock != null
                    ? ` · ${m.previous_stock} → ${m.new_stock} ${labelInventoryUnit(m.unit ?? m.item_unit)}`
                    : ''}
                  {m.source_module ? ` · ${m.source_module}` : ''}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
