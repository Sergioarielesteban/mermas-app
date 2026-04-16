'use client';

import React, { useState } from 'react';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useMermasStore } from '@/components/MermasStoreProvider';
import { requestDeleteSecurityPin } from '@/lib/delete-security';
import type { Unit } from '@/lib/types';

export default function ProductosPage() {
  const { products, addProduct, updateProduct, removeProduct } = useMermasStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<Unit>('ud');
  const [price, setPrice] = useState('0');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showDeletedBanner, setShowDeletedBanner] = useState(false);
  const deletedBannerTimeoutRef = React.useRef<number | null>(null);
  const [search, setSearch] = useState('');

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(price);
    const trimmed = name.trim();
    if (!trimmed || !Number.isFinite(numeric) || numeric <= 0) return;
    const duplicate = products.some(
      (p) =>
        p.name.trim().toLowerCase() === trimmed.toLowerCase() &&
        (editingId ? p.id !== editingId : true),
    );
    if (duplicate) {
      setMessage('Ya existe un producto con ese nombre.');
      return;
    }

    if (editingId) {
      updateProduct(editingId, { name, unit, pricePerUnit: numeric });
      setMessage('Producto actualizado.');
    } else {
      addProduct({ name, unit, pricePerUnit: numeric });
      setMessage('Producto añadido.');
    }
    setName('');
    setUnit('ud');
    setPrice('0');
    setEditingId(null);
    setOpen(false);
  };

  React.useEffect(
    () => () => {
      if (deletedBannerTimeoutRef.current) window.clearTimeout(deletedBannerTimeoutRef.current);
    },
    [],
  );

  return (
    <div className="relative">
      {showDeletedBanner ? (
        <div className="pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-black/25 px-6">
          <div className="rounded-2xl bg-[#D32F2F] px-7 py-5 text-center shadow-2xl ring-2 ring-white/75">
            <p className="text-xl font-black uppercase tracking-wide text-white">ELIMINADO</p>
          </div>
        </div>
      ) : null}
      <div className="mb-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Catalogo de Productos</p>
        <p className="pt-1 text-sm text-zinc-700">Gestiona nombre, unidad y precio por producto.</p>
        <label className="mt-3 flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
          />
        </label>
      </div>
      {message ? (
        <div className="mb-3 rounded-xl bg-white p-3 text-sm text-zinc-700 ring-1 ring-zinc-200">
          {message}
        </div>
      ) : null}

      <div className="space-y-3 pb-20">
        {filteredProducts.map((p) => (
          <div
            key={p.id}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-4 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-extrabold uppercase text-zinc-900">{p.name}</p>
                <p className="pt-1 text-sm text-zinc-600">
                  {p.pricePerUnit.toFixed(2)} €/{p.unit}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(p.id);
                    setName(p.name);
                    setUnit(p.unit);
                    setPrice(String(p.pricePerUnit));
                    setOpen(true);
                    setMessage(null);
                  }}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                  aria-label={`Editar ${p.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const confirmed = window.confirm(`¿Eliminar "${p.name}"?`);
                    if (!confirmed) return;
                    if (!(await requestDeleteSecurityPin())) {
                      setMessage('Clave de seguridad incorrecta.');
                      return;
                    }
                    const result = removeProduct(p.id);
                    setMessage(result.ok ? 'Producto eliminado.' : result.reason ?? 'No se pudo eliminar.');
                    if (result.ok) {
                      setShowDeletedBanner(true);
                      if (deletedBannerTimeoutRef.current) window.clearTimeout(deletedBannerTimeoutRef.current);
                      deletedBannerTimeoutRef.current = window.setTimeout(() => {
                        setShowDeletedBanner(false);
                        deletedBannerTimeoutRef.current = null;
                      }, 1000);
                    }
                  }}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                  aria-label={`Eliminar ${p.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {filteredProducts.length === 0 ? (
          <div className="rounded-xl bg-white p-4 text-sm text-zinc-500 ring-1 ring-zinc-200">
            No hay productos que coincidan con la búsqueda.
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-6 z-40 grid h-16 w-16 place-items-center rounded-full bg-gradient-to-r from-[#B91C1C] to-[#D32F2F] text-white shadow-xl"
        aria-label="Añadir producto"
      >
        <Plus className="h-8 w-8" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-800">
                {editingId ? 'Editar Producto' : 'Nuevo Producto'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setEditingId(null);
                  setName('');
                  setUnit('ud');
                  setPrice('0');
                }}
                className="grid h-9 w-9 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-100"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form className="space-y-3" onSubmit={handleSubmit}>
              <label className="block text-xs font-semibold text-zinc-700">
                Nombre del Producto
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                  placeholder="Ej: Alitas de Pollo"
                />
              </label>

              <label className="block text-xs font-semibold text-zinc-700">
                Unidad de Medida
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as Unit)}
                  className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                >
                  <option value="kg">kg</option>
                  <option value="ud">ud</option>
                  <option value="bolsa">bolsa</option>
                  <option value="racion">racion</option>
                </select>
              </label>

              <label className="block text-xs font-semibold text-zinc-700">
                Precio por Unidad
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                  placeholder="0.00"
                />
              </label>

              <button
                type="submit"
                className="h-12 w-full rounded-xl bg-[#D32F2F] text-sm font-extrabold uppercase text-white"
              >
                {editingId ? 'Guardar Cambios' : 'Guardar Producto'}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

