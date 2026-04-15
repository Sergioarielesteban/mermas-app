'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import { Camera, Check, ChevronDown, Search, Upload, X } from 'lucide-react';
import { CHEF_ONE_TAPER_LINE_CLASS } from '@/components/ChefOneGlowLine';
import { useMermasStore } from '@/components/MermasStoreProvider';
import type { MermaMotiveKey } from '@/lib/types';

type Motive = { key: MermaMotiveKey; emoji: string; label: string };

const MOTIVES: Motive[] = [
  { key: 'se-quemo', emoji: '🔥', label: 'SE QUEMÓ' },
  { key: 'mal-estado', emoji: '💀', label: 'MAL ESTADO' },
  { key: 'cliente-cambio', emoji: '♻️', label: 'EL CLIENTE CAMBIÓ' },
  { key: 'error-cocina', emoji: '❌', label: 'ERROR DEL EQUIPO' },
  { key: 'sobras-marcaje', emoji: '🗑️', label: 'SOBRAS DE MARCAJE' },
  { key: 'cancelado', emoji: '⚠️', label: 'CANCELADO' },
] as const;

function toNumberClamped(value: string, min: number, max: number, decimals = 2) {
  const normalized = value.replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return min;
  const clamped = Math.min(max, Math.max(min, parsed));
  const factor = 10 ** decimals;
  return Math.round(clamped * factor) / factor;
}

function nowParts() {
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { date, time };
}

export default function MermasRegistrationForm() {
  const { products, addMerma } = useMermasStore();
  const motives = useMemo(() => MOTIVES, []);
  const current = nowParts();

  const [productId, setProductId] = useState<string>(products[0]?.id ?? '');
  const [quantity, setQuantity] = useState<number>(0);
  const [quantityInput, setQuantityInput] = useState<string>('0');
  const [motiveKey, setMotiveKey] = useState<MermaMotiveKey | null>(null);
  const [dateValue, setDateValue] = useState(current.date);
  const [timeValue, setTimeValue] = useState(current.time);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [showSavedBanner, setShowSavedBanner] = useState(false);
  const [validationBanner, setValidationBanner] = useState<string | null>(null);
  const [openProductPicker, setOpenProductPicker] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [lastQtyAction, setLastQtyAction] = useState<'inc' | 'dec' | null>(null);
  const savedBannerTimeoutRef = React.useRef<number | null>(null);
  const validationBannerTimeoutRef = React.useRef<number | null>(null);

  const selectedProduct = products.find((p) => p.id === productId) ?? null;
  /** Botones +/− siempre de 1 en 1; decimales solo escribiendo en el recuadro. */
  const quantityButtonStep = 1;
  const quantityLabel = selectedProduct?.unit === 'kg' ? 'Cantidad (kg)' : 'Cantidad';
  const quantityHint = selectedProduct?.unit === 'kg'
    ? 'Botones ±1 kg. Toca la cantidad para decimales (ej: 0,30).'
    : selectedProduct?.unit === 'racion'
      ? 'Botones ±1. Toca la cantidad para medias raciones (ej: 0,5).'
      : 'Botones ±1 unidad. Toca la cantidad para decimales (ej: 0,5).';

  React.useEffect(() => {
    if (!productId && products[0]?.id) {
      setProductId(products[0].id);
    }
  }, [productId, products]);

  React.useEffect(() => {
    setQuantityInput(quantity.toFixed(2).replace('.', ','));
  }, [quantity, selectedProduct?.unit]);

  React.useEffect(() => {
    if (motiveKey !== 'mal-estado') {
      setPhotoDataUrl(null);
    }
  }, [motiveKey]);

  React.useEffect(() => {
    return () => {
      if (savedBannerTimeoutRef.current) {
        window.clearTimeout(savedBannerTimeoutRef.current);
      }
      if (validationBannerTimeoutRef.current) {
        window.clearTimeout(validationBannerTimeoutRef.current);
      }
    };
  }, []);

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.trim().toLowerCase()),
  );

  const showValidationBanner = (text: string) => {
    setValidationBanner(text);
    if (validationBannerTimeoutRef.current) {
      window.clearTimeout(validationBannerTimeoutRef.current);
    }
    validationBannerTimeoutRef.current = window.setTimeout(() => {
      setValidationBanner(null);
      validationBannerTimeoutRef.current = null;
    }, 1300);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!productId) {
      showValidationBanner('Te faltó elegir un producto');
      return;
    }
    if (!motiveKey) {
      showValidationBanner('Te faltó elegir un motivo');
      return;
    }
    if (quantity <= 0) {
      showValidationBanner('La cantidad debe ser mayor que 0');
      return;
    }

    if (!dateValue || !timeValue) {
      showValidationBanner('Completa fecha y hora');
      return;
    }

    const occurredAt = new Date(`${dateValue}T${timeValue}:00`);
    if (Number.isNaN(occurredAt.getTime())) {
      showValidationBanner('Fecha u hora inválida');
      return;
    }

    const result = await addMerma({
      productId,
      quantity,
      motiveKey,
      notes,
      occurredAt: occurredAt.toISOString(),
      photoDataUrl: motiveKey === 'mal-estado' ? (photoDataUrl ?? undefined) : undefined,
    });
    if (!result.ok) {
      showValidationBanner(result.reason ?? 'No se pudo guardar la merma');
      return;
    }

    const now = nowParts();
    setQuantity(0);
    setQuantityInput('0');
    setMotiveKey(null);
    setNotes('');
    setPhotoDataUrl(null);
    setDateValue(now.date);
    setTimeValue(now.time);
    setLastQtyAction(null);

    setValidationBanner(null);
    setShowSavedBanner(true);
    if (savedBannerTimeoutRef.current) {
      window.clearTimeout(savedBannerTimeoutRef.current);
    }
    savedBannerTimeoutRef.current = window.setTimeout(() => {
      setShowSavedBanner(false);
      savedBannerTimeoutRef.current = null;
    }, 1000);
  };

  const handlePhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setPhotoDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-full">
      {showSavedBanner ? (
        <div className="pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-black/25 px-6">
          <div className="rounded-2xl bg-[#D32F2F] px-7 py-5 text-center shadow-2xl ring-2 ring-white/75">
            <p className="text-xl font-black uppercase tracking-wide text-white">MERMA REGISTRADA</p>
          </div>
        </div>
      ) : null}
      {validationBanner ? (
        <div className="pointer-events-none fixed inset-0 z-[91] grid place-items-center bg-black/20 px-6">
          <div className="rounded-2xl bg-zinc-900 px-7 py-5 text-center shadow-2xl ring-2 ring-white/70">
            <p className="text-lg font-black uppercase tracking-wide text-white">{validationBanner}</p>
          </div>
        </div>
      ) : null}

      <form onSubmit={handleSave} className="pb-2">
        <div className="space-y-5">
          <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-200">
            <label className="mb-2 block text-xs font-semibold text-zinc-700">
              Producto <span className="text-[#B91C1C]">*</span>
            </label>
            <input
              type="text"
              value={productId}
              onChange={() => undefined}
              tabIndex={-1}
              aria-hidden
              className="hidden"
            />
            <button
              type="button"
              onClick={() => setOpenProductPicker(true)}
              className="flex h-12 w-full items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-left text-sm text-zinc-900 shadow-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
            >
              <span className={selectedProduct ? 'text-zinc-900' : 'text-zinc-400'}>
                {selectedProduct?.name ?? 'Selecciona producto'}
              </span>
              <ChevronDown className="h-4 w-4 text-zinc-500" />
            </button>
            {selectedProduct ? (
              <p className="pt-1 text-xs text-zinc-500">
                Precio: {selectedProduct.pricePerUnit.toFixed(2)} EUR/{selectedProduct.unit}
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-200">
            <label className="mb-2 block text-xs font-semibold text-zinc-700">
              {quantityLabel} <span className="text-[#B91C1C]">*</span>
            </label>
            <div className="grid grid-cols-3 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setQuantity((q) => {
                    const next = toNumberClamped(String(q - quantityButtonStep), 0, 999, 2);
                    setQuantityInput(next.toFixed(2).replace('.', ','));
                    return next;
                  });
                  setLastQtyAction('dec');
                }}
                disabled={quantity <= 0}
                className={[
                  'h-14 rounded-xl border border-zinc-300 text-2xl font-bold',
                  quantity <= 0
                    ? 'cursor-not-allowed bg-zinc-100 text-zinc-400'
                    : lastQtyAction === 'dec'
                      ? 'bg-[#D32F2F] text-white hover:bg-[#c62828]'
                      : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
                ].join(' ')}
                aria-label="Restar cantidad"
              >
                -
              </button>

              <input
                type="text"
                inputMode="decimal"
                required
                value={quantityInput}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (!/^\d*(?:[.,]\d{0,2})?$/.test(raw)) return;
                  setQuantityInput(raw);
                  const normalized = raw.replace(',', '.');
                  const parsed = Number(normalized);
                  if (Number.isFinite(parsed)) {
                    setQuantity(toNumberClamped(normalized, 0, 999, 2));
                  }
                  setLastQtyAction(null);
                }}
                onBlur={() => {
                  const normalized = quantityInput.replace(',', '.');
                  const parsed = Number(normalized);
                  const safe = Number.isFinite(parsed) ? toNumberClamped(normalized, 0, 999, 2) : quantity;
                  setQuantity(safe);
                  setQuantityInput(safe.toFixed(2).replace('.', ','));
                }}
                className="h-14 rounded-xl border border-zinc-300 bg-white text-center text-xl font-bold text-zinc-900 shadow-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                aria-label="Cantidad"
              />

              <button
                type="button"
                onClick={() => {
                  setQuantity((q) => {
                    const next = toNumberClamped(String(q + quantityButtonStep), 0, 999, 2);
                    setQuantityInput(next.toFixed(2).replace('.', ','));
                    return next;
                  });
                  setLastQtyAction('inc');
                }}
                className={[
                  'h-14 rounded-xl border border-zinc-300 text-2xl font-bold',
                  lastQtyAction === 'inc'
                    ? 'bg-[#D32F2F] text-white hover:bg-[#c62828]'
                    : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
                ].join(' ')}
                aria-label="Aumentar cantidad"
              >
                +
              </button>
            </div>
            {quantityHint ? <p className="pt-1 text-xs text-zinc-500">{quantityHint}</p> : null}
          </div>

          <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-200">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-700">
                Motivo <span className="text-[#B91C1C]">*</span>
              </label>
              <span className="text-[11px] text-zinc-500">Selecciona uno</span>
            </div>
            <input
              type="text"
              value={motiveKey ?? ''}
              onChange={() => undefined}
              tabIndex={-1}
              aria-hidden
              className="hidden"
            />

            <div className="grid grid-cols-2 gap-1.5">
              {motives.map((m) => {
                const isSelected = m.key === motiveKey;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMotiveKey((prev) => (prev === m.key ? null : m.key))}
                    className={[
                      'flex h-12 items-center justify-center gap-1.5 rounded-md border px-2 text-center transition-all',
                      isSelected
                        ? 'border-[#D32F2F] bg-[#D32F2F]/10 text-zinc-900 shadow-sm'
                        : 'border-zinc-300 bg-zinc-50 text-zinc-800 hover:border-zinc-400',
                    ].join(' ')}
                    aria-pressed={isSelected}
                  >
                    <span className="text-base leading-none">{m.emoji}</span>
                    <span className="text-[10px] font-semibold leading-tight">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {motiveKey === 'mal-estado' ? (
            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-200">
              <label className="mb-2 block text-xs font-semibold text-zinc-700">Añadir Foto de Merma</label>
              <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-zinc-50 text-sm font-semibold text-zinc-700 hover:bg-zinc-100">
                <Camera className="h-4 w-4" />
                <Upload className="h-4 w-4" />
                <span>Tomar o subir foto</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhoto}
                />
              </label>
              {photoDataUrl ? (
                <Image
                  src={photoDataUrl}
                  alt="Foto de merma"
                  width={720}
                  height={360}
                  unoptimized
                  className="mt-2 h-36 w-full rounded-xl object-cover ring-1 ring-zinc-200"
                />
              ) : null}
            </div>
          ) : null}

          <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-200">
            <label className="mb-2 block text-xs font-semibold text-zinc-700">Campo de Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Escribe aquí cualquier observación..."
              className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
              aria-label="Notas"
            />
          </div>

          <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-200">
            <div className="mx-auto grid max-w-[17.5rem] grid-cols-2 gap-2">
              <label className="mb-1.5 block text-[11px] font-semibold text-zinc-700">
                Fecha
                <input
                  type="date"
                  value={dateValue}
                  onChange={(e) => setDateValue(e.target.value)}
                  className="mt-1.5 h-8 w-full min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-[11px] font-sans leading-none text-zinc-900 outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                />
              </label>
              <label className="mb-1.5 block text-[11px] font-semibold text-zinc-700">
                Hora
                <input
                  type="time"
                  value={timeValue}
                  onChange={(e) => setTimeValue(e.target.value)}
                  className="mt-1.5 h-8 w-full min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-[11px] font-sans leading-none text-zinc-900 outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="pt-5 pb-6">
          <button
            type="submit"
            className="h-16 w-full rounded-2xl bg-[#D32F2F] text-base font-extrabold uppercase tracking-wide text-white shadow-sm hover:bg-[#c62828] active:scale-[0.99]"
          >
            GUARDAR
          </button>
          <span
            className={`mx-auto mt-4 w-24 ${CHEF_ONE_TAPER_LINE_CLASS}`}
            aria-hidden
          />
        </div>
      </form>

      {openProductPicker ? (
        <div className="fixed inset-0 z-50 bg-black/40 px-4 py-10">
          <div className="mx-auto flex h-full w-full max-w-md flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 p-4">
              <h3 className="text-lg font-black uppercase text-zinc-800">Producto</h3>
              <button
                type="button"
                onClick={() => setOpenProductPicker(false)}
                className="grid h-9 w-9 place-items-center rounded-lg text-zinc-700 hover:bg-zinc-100"
                aria-label="Cerrar selector de producto"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4">
              <label className="flex h-11 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3">
                <Search className="h-4 w-4 text-zinc-500" />
                <input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar producto..."
                  className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                  autoFocus
                />
              </label>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <div className="space-y-1">
                {filteredProducts.length === 0 ? (
                  <div className="rounded-xl bg-zinc-50 px-3 py-4 text-sm text-zinc-500 ring-1 ring-zinc-200">
                    No hay coincidencias.
                  </div>
                ) : null}

                {filteredProducts.map((p) => {
                  const active = p.id === productId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setProductId(p.id);
                        setOpenProductPicker(false);
                      }}
                      className={[
                        'flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left',
                        active
                          ? 'border-[#D32F2F] bg-[#D32F2F]/5 text-zinc-900'
                          : 'border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'grid h-5 w-5 place-items-center rounded-full border',
                          active ? 'border-[#D32F2F] text-[#D32F2F]' : 'border-zinc-400 text-transparent',
                        ].join(' ')}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span className="flex-1 text-base">{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

