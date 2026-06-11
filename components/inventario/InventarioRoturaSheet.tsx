'use client';

import React from 'react';
import type { InventoryStockRow } from '@/lib/inventory-operations-supabase';
import { parseStockDecimal, formatStockQuantity } from '@/lib/inventory-stock-format';

type Props = {
  item: InventoryStockRow | null;
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (quantity: number, detail: string) => void | Promise<void>;
};

export default function InventarioRoturaSheet({ item, open, busy, onClose, onSubmit }: Props) {
  const [quantity, setQuantity] = React.useState('');
  const [detail, setDetail] = React.useState('');

  React.useEffect(() => {
    if (!open || !item) return;
    setQuantity('');
    setDetail('');
  }, [open, item?.id]);

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center p-3 sm:items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Cerrar" onClick={() => !busy && onClose()} />
      <div className="relative w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl">
        <h3 className="text-[14px] font-black text-zinc-950">Rotura</h3>
        <p className="mt-0.5 truncate text-[11px] text-zinc-500">{item.name}</p>
        <p className="mt-1 font-mono text-[13px] font-bold tabular-nums text-zinc-700">
          Stock: {formatStockQuantity(item.quantity_on_hand, item.unit)}
        </p>

        <label className="mt-3 block">
          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Cantidad rota</span>
          <input
            type="text"
            inputMode="decimal"
            autoFocus
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            disabled={busy}
            className="mt-1 h-11 w-full rounded-2xl border border-zinc-200/80 px-3 text-[18px] font-bold tabular-nums text-zinc-900 ring-1 ring-zinc-200/70"
            placeholder="0"
          />
        </label>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {['Cámara', 'Suelo', 'Transporte'].map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={busy}
              onClick={() => setDetail(preset)}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-bold text-zinc-700"
            >
              {preset}
            </button>
          ))}
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="h-9 rounded-2xl px-3 text-[11px] font-semibold text-zinc-600">
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const q = parseStockDecimal(quantity);
              if (q == null || q <= 0) return;
              void onSubmit(q, detail.trim());
            }}
            className="h-9 rounded-2xl bg-[#D32F2F] px-4 text-[11px] font-bold text-white disabled:opacity-45"
          >
            {busy ? 'Guardando…' : 'Guardar rotura'}
          </button>
        </div>
      </div>
    </div>
  );
}
