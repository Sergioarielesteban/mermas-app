'use client';

import React from 'react';
import type { InventoryMovementType } from '@/lib/inventory-operations-supabase';
import { MOVEMENT_TYPE_LABELS, OUTBOUND_MOVEMENT_TYPES } from '@/lib/inventory-operations-supabase';
import type { InventoryStockRow } from '@/lib/inventory-operations-supabase';
import { formatStockQuantity, labelInventoryUnit, parseStockDecimal } from '@/lib/inventory-stock-format';

type Props = {
  item: InventoryStockRow | null;
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    direction: 'in' | 'out';
    quantity: number;
    movementType: InventoryMovementType;
    reason: string;
    notes: string;
  }) => void | Promise<void>;
};

const IN_TYPES: InventoryMovementType[] = [
  'manual_adjustment',
  'initial_stock',
  'transfer_in',
  'central_kitchen_receipt',
];

const OUT_TYPES: InventoryMovementType[] = [
  'manual_adjustment',
  'waste',
  'breakage',
  'staff_consumption',
  'transfer_out',
];

export default function InventarioAdjustSheet({ item, open, busy, onClose, onSubmit }: Props) {
  const [direction, setDirection] = React.useState<'in' | 'out'>('in');
  const [quantity, setQuantity] = React.useState('');
  const [movementType, setMovementType] = React.useState<InventoryMovementType>('manual_adjustment');
  const [reason, setReason] = React.useState('');
  const [notes, setNotes] = React.useState('');

  React.useEffect(() => {
    if (!open || !item) return;
    setDirection('in');
    setQuantity('');
    setMovementType('manual_adjustment');
    setReason('');
    setNotes('');
  }, [open, item?.id]);

  React.useEffect(() => {
    if (direction === 'in' && OUTBOUND_MOVEMENT_TYPES.includes(movementType)) {
      setMovementType('manual_adjustment');
    }
    if (direction === 'out' && (movementType === 'initial_stock' || movementType === 'central_kitchen_receipt' || movementType === 'transfer_in' || movementType === 'purchase_receipt')) {
      setMovementType('manual_adjustment');
    }
  }, [direction, movementType]);

  if (!open || !item) return null;

  const types = direction === 'in' ? IN_TYPES : OUT_TYPES;

  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center p-3 sm:items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Cerrar" onClick={() => !busy && onClose()} />
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl">
        <h3 className="text-[14px] font-black text-zinc-950">Ajustar stock</h3>
        <p className="mt-0.5 truncate text-[11px] text-zinc-500">{item.name}</p>
        <p className="mt-1.5 font-mono text-[15px] font-bold tabular-nums text-zinc-900">
          Actual: {formatStockQuantity(item.quantity_on_hand, item.unit)}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {(['in', 'out'] as const).map((d) => (
            <button
              key={d}
              type="button"
              disabled={busy}
              onClick={() => setDirection(d)}
              className={[
                'h-9 rounded-2xl text-[11px] font-bold ring-1 transition',
                direction === d
                  ? 'bg-[#FFF7F5] text-[#B91C1C] ring-[#D32F2F]/20'
                  : 'border border-zinc-200/80 bg-white text-zinc-700 ring-zinc-200/70',
              ].join(' ')}
            >
              {d === 'in' ? '+ Entrada' : '− Salida'}
            </button>
          ))}
        </div>

        <label className="mt-3 block">
          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Cantidad ({labelInventoryUnit(item.unit)})</span>
          <input
            type="text"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            disabled={busy}
            className="mt-1 h-10 w-full rounded-2xl border border-zinc-200/80 px-3 text-[15px] font-bold tabular-nums text-zinc-900 ring-1 ring-zinc-200/70"
            placeholder="0"
          />
        </label>

        <label className="mt-3 block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Motivo</span>
          <select
            value={movementType}
            onChange={(e) => setMovementType(e.target.value as InventoryMovementType)}
            disabled={busy}
            className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900"
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {MOVEMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Detalle (opcional)</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm"
            placeholder="Ej. rotura en cámara"
          />
        </label>

        <label className="mt-3 block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Notas</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
            rows={2}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="h-10 rounded-xl px-4 text-xs font-semibold text-zinc-600">
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const q = parseStockDecimal(quantity);
              if (q == null || q <= 0) return;
              void onSubmit({ direction, quantity: q, movementType, reason, notes });
            }}
            className="h-10 rounded-xl bg-[#D32F2F] px-4 text-xs font-bold text-white disabled:opacity-45"
          >
            {busy ? 'Guardando…' : 'Guardar movimiento'}
          </button>
        </div>
      </div>
    </div>
  );
}
