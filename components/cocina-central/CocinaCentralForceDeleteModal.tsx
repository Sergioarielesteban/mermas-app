'use client';

import React, { useEffect, useState } from 'react';

export type ForceDeleteEntity = 'lote' | 'orden';

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  entity: ForceDeleteEntity;
  /** Deshabilita el botón rojo mientras dura el RPC */
  busy?: boolean;
};

const BODY: Record<ForceDeleteEntity, string> = {
  lote: 'Esto eliminará este lote y todos sus registros asociados: movimientos, entregas y trazabilidad. Esta acción es irreversible.',
  orden:
    'Esto eliminará esta producción y todos sus registros asociados: movimientos, entregas y trazabilidad. Esta acción es irreversible.',
};

export function CocinaCentralForceDeleteModal({
  open,
  onClose,
  onConfirm,
  entity,
  busy = false,
}: Props) {
  const [phrase, setPhrase] = useState('');

  useEffect(() => {
    if (open) setPhrase('');
  }, [open]);

  if (!open) return null;

  const canSubmit = phrase === 'ELIMINAR' && !busy;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="alertdialog"
      aria-modal
      aria-labelledby="cc-force-del-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
        <h2 id="cc-force-del-title" className="text-lg font-extrabold text-zinc-900">
          Eliminar definitivamente
        </h2>
        <p className="mt-2 text-sm text-zinc-700">{BODY[entity]}</p>
        <label className="mt-4 block text-xs font-bold uppercase text-zinc-500">
          Escribe ELIMINAR para confirmar
          <input
            type="text"
            className="mt-1.5 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm font-mono"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={busy}
          />
        </label>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="h-11 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-800"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="h-11 rounded-xl border border-red-300 bg-red-600 px-4 text-sm font-extrabold text-white disabled:opacity-50"
            onClick={() => void onConfirm()}
            disabled={!canSubmit}
          >
            Eliminar definitivamente
          </button>
        </div>
      </div>
    </div>
  );
}
