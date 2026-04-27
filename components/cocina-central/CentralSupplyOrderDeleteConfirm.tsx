'use client';

import React from 'react';

type Props = {
  open: boolean;
  busy: boolean;
  mode: 'single' | 'batch';
  batchCount?: number;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function CentralSupplyOrderDeleteConfirm({
  open,
  busy,
  mode,
  batchCount = 0,
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;

  const title = mode === 'batch' ? 'Eliminar pedidos de sede' : 'Eliminar pedido de sede';
  const text =
    mode === 'batch'
      ? `Se eliminarán ${batchCount} pedido${batchCount === 1 ? '' : 's'} de forma definitiva. Esta acción no afecta a productos ni fórmulas de producción.`
      : 'Este pedido se eliminará definitivamente. Esta acción no afecta a productos ni fórmulas de producción.';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cc-supply-del-title"
    >
      <button type="button" className="absolute inset-0" aria-label="Cerrar" onClick={onCancel} />
      <div className="relative z-[71] w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl ring-1 ring-zinc-100">
        <h2 id="cc-supply-del-title" className="text-lg font-extrabold text-zinc-900">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">{text}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-11 rounded-xl border border-zinc-200 px-4 text-sm font-bold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="h-11 rounded-xl bg-[#D32F2F] px-4 text-sm font-extrabold text-white hover:bg-[#B91C1C] disabled:opacity-50"
          >
            {busy ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}
