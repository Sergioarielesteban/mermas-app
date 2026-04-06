'use client';

import React, { useMemo, useState } from 'react';

type Product = { id: string; name: string };
type Motive = { key: string; emoji: string; label: string };

const PRODUCTS: Product[] = [
  { id: 'carne-smash', name: 'Carne Smash' },
  { id: 'huevos', name: 'Huevos' },
  { id: 'vikingo', name: 'Vikingo' },
  { id: 'pan-brioche', name: 'Pan Brioche' },
  { id: 'patatas', name: 'Patatas' },
] as const;

const MOTIVES: Motive[] = [
  { key: 'se-quemo', emoji: '🔥', label: 'SE QUEMÓ' },
  { key: 'mal-estado', emoji: '💀', label: 'MAL ESTADO' },
  { key: 'cliente-cambio', emoji: '♻️', label: 'EL CLIENTE CAMBIÓ' },
  { key: 'error-cocina', emoji: '❌', label: 'ERROR EN COCINA' },
  { key: 'sobras-marcaje', emoji: '🗑️', label: 'SOBRAS DE MARCAJE' },
  { key: 'cancelado', emoji: '⚠️', label: 'CANCELADO' },
] as const;

function toIntClamped(value: string, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export default function MermasRegistrationForm() {
  const motives = useMemo(() => MOTIVES, []);

  const [productId, setProductId] = useState<string>(PRODUCTS[0].id);
  const [quantity, setQuantity] = useState<number>(1);
  const [motiveKey, setMotiveKey] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);

  const selectedMotive = motives.find((m) => m.key === motiveKey) ?? null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!productId) {
      setMessage('Selecciona un producto.');
      return;
    }
    if (!motiveKey) {
      setMessage('Selecciona un motivo.');
      return;
    }
    if (quantity < 1) {
      setMessage('La cantidad debe ser mayor que 0.');
      return;
    }

    // Sin backend por ahora: simulamos guardado.
    const payload = {
      productId,
      quantity,
      motiveKey,
      notes: notes.trim(),
    };

    console.log('Guardar mermas:', payload);
    setMessage('Mermas guardadas correctamente.');
  };

  const handleCancel = () => {
    setProductId(PRODUCTS[0].id);
    setQuantity(1);
    setMotiveKey(null);
    setNotes('');
    setMessage(null);
  };

  return (
    <div className="min-h-full bg-zinc-50">
      <div className="bg-[#D32F2F]">
        <div className="mx-auto w-full max-w-md px-4 py-4">
          <h1 className="text-lg font-semibold text-white">Registro de Mermas</h1>
          <p className="mt-1 text-xs text-white/90">Carga rápida para hostelería</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="mx-auto w-full max-w-md px-4 py-4">
        {message ? (
          <div className="mb-3 rounded-xl bg-zinc-100 p-3 text-sm text-zinc-800">
            {message}
            {message.includes('guardadas') && selectedMotive ? (
              <span className="block pt-1 text-xs text-zinc-600">
                Motivo: {selectedMotive.emoji} {selectedMotive.label}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-xs font-semibold text-zinc-700">
              Selector de Producto
            </label>
            <div className="relative">
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full appearance-none rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
              >
                {PRODUCTS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-zinc-700">
              Selector de Cantidad
            </label>

            <div className="grid grid-cols-3 items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className={[
                  'h-12 rounded-xl text-2xl font-bold',
                  quantity <= 1
                    ? 'cursor-not-allowed bg-zinc-200 text-zinc-400'
                    : 'bg-[#D32F2F] text-white hover:bg-[#c62828]',
                ].join(' ')}
                aria-label="Restar cantidad"
              >
                -
              </button>

              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                value={quantity}
                onChange={(e) => setQuantity(toIntClamped(e.target.value, 1, 999))}
                className="h-12 rounded-xl border border-zinc-200 bg-white text-center text-sm font-semibold text-zinc-900 shadow-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                aria-label="Cantidad"
              />

              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(999, q + 1))}
                className="h-12 rounded-xl bg-[#D32F2F] text-2xl font-bold text-white hover:bg-[#c62828]"
                aria-label="Aumentar cantidad"
              >
                +
              </button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-700">Motivos</label>
              <span className="text-[11px] text-zinc-500">Selecciona uno</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {motives.map((m) => {
                const isSelected = m.key === motiveKey;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMotiveKey((prev) => (prev === m.key ? null : m.key))}
                    className={[
                      'flex flex-col items-center justify-center rounded-xl border px-2 py-2 text-center transition-colors',
                      isSelected
                        ? 'border-transparent bg-[#D32F2F] text-white'
                        : 'border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300',
                    ].join(' ')}
                    aria-pressed={isSelected}
                  >
                    <span className="text-lg leading-none">{m.emoji}</span>
                    <span className="mt-1 text-[11px] font-semibold leading-tight">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-zinc-700">Campo de Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Escribe aquí cualquier observación..."
              className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
              aria-label="Notas"
            />
          </div>
        </div>

        <div className="pt-5 pb-2">
          <div className="space-y-3">
            <button
              type="submit"
              className="h-16 w-full rounded-2xl bg-[#D32F2F] text-base font-extrabold uppercase tracking-wide text-white shadow-sm hover:bg-[#c62828] active:scale-[0.99]"
            >
              GUARDAR
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="h-12 w-full rounded-2xl bg-zinc-200 text-sm font-bold uppercase tracking-wide text-zinc-700 hover:bg-zinc-300 active:scale-[0.99]"
            >
              CANCELAR
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

