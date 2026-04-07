'use client';

import { useRouter } from 'next/navigation';
import React from 'react';
import { useMermasStore } from '@/components/MermasStoreProvider';
import { savePedidoDraft, type PedidoDraftItem } from '@/lib/pedidos-storage';

export default function NuevoPedidoPage() {
  const router = useRouter();
  const { products } = useMermasStore();
  const [supplierName, setSupplierName] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [selectedProductId, setSelectedProductId] = React.useState(products[0]?.id ?? '');
  const [quantityInput, setQuantityInput] = React.useState('1');
  const [items, setItems] = React.useState<PedidoDraftItem[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);

  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? null;
  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const addLine = () => {
    if (!selectedProduct) return;
    const qty = Number(quantityInput.replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) {
      setMessage('Cantidad invalida.');
      return;
    }
    const normalizedQty = selectedProduct.unit === 'kg' ? Math.round(qty * 100) / 100 : Math.floor(qty);
    const lineTotal = Math.round(normalizedQty * selectedProduct.pricePerUnit * 100) / 100;

    setItems((prev) => {
      const idx = prev.findIndex((i) => i.productId === selectedProduct.id);
      if (idx >= 0) {
        const current = prev[idx];
        const mergedQty = Math.round((current.quantity + normalizedQty) * 100) / 100;
        const mergedTotal = Math.round(mergedQty * current.pricePerUnit * 100) / 100;
        const copy = [...prev];
        copy[idx] = { ...current, quantity: mergedQty, lineTotal: mergedTotal };
        return copy;
      }
      return [
        ...prev,
        {
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          unit: selectedProduct.unit,
          quantity: normalizedQty,
          pricePerUnit: selectedProduct.pricePerUnit,
          lineTotal,
        },
      ];
    });
    setMessage(null);
    setQuantityInput(selectedProduct.unit === 'kg' ? '0,10' : '1');
  };

  const removeLine = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const total = items.reduce((acc, row) => acc + row.lineTotal, 0);

  const saveDraft = () => {
    if (!supplierName.trim()) {
      setMessage('Indica proveedor.');
      return;
    }
    if (items.length === 0) {
      setMessage('Añade al menos un producto.');
      return;
    }
    savePedidoDraft({
      id: `ped-${Date.now()}`,
      supplierName: supplierName.trim(),
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
      items,
      total: Math.round(total * 100) / 100,
    });
    router.push('/pedidos');
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-lg font-black text-zinc-900">Nuevo pedido</h1>
        <p className="pt-1 text-sm text-zinc-600">Crea un borrador de pedido con productos del catalogo.</p>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Proveedor</label>
        <input
          value={supplierName}
          onChange={(e) => setSupplierName(e.target.value)}
          placeholder="Ej: Makro, Transgourmet..."
          className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none"
        />
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Buscar producto
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar..."
          className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none"
        />
        <select
          value={selectedProductId}
          onChange={(e) => setSelectedProductId(e.target.value)}
          className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none"
        >
          {filteredProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <input
            value={quantityInput}
            onChange={(e) => setQuantityInput(e.target.value)}
            placeholder={selectedProduct?.unit === 'kg' ? '0,50' : '1'}
            className="h-11 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none"
          />
          <button
            type="button"
            onClick={addLine}
            className="h-11 rounded-xl bg-[#D32F2F] px-4 text-sm font-bold text-white"
          >
            Añadir
          </button>
        </div>
        {selectedProduct ? (
          <p className="mt-1 text-xs text-zinc-500">
            Precio: {selectedProduct.pricePerUnit.toFixed(2)} EUR/{selectedProduct.unit}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-sm font-bold text-zinc-800">Lineas del pedido</p>
        <div className="mt-2 space-y-2">
          {items.length === 0 ? <p className="text-sm text-zinc-500">Sin productos añadidos.</p> : null}
          {items.map((row) => (
            <div key={row.productId} className="flex items-center justify-between rounded-xl bg-zinc-50 p-3">
              <div>
                <p className="text-sm font-semibold text-zinc-800">{row.productName}</p>
                <p className="text-xs text-zinc-500">
                  {row.quantity} {row.unit} · {row.lineTotal.toFixed(2)} EUR
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeLine(row.productId)}
                className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-700"
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm font-black text-zinc-900">Total estimado: {total.toFixed(2)} EUR</p>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Notas</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none"
          placeholder="Observaciones del pedido..."
        />
        {message ? <p className="mt-2 text-sm text-[#B91C1C]">{message}</p> : null}
        <button
          type="button"
          onClick={saveDraft}
          className="mt-3 h-11 w-full rounded-xl bg-[#D32F2F] text-sm font-bold text-white"
        >
          Guardar borrador
        </button>
      </section>
    </div>
  );
}
