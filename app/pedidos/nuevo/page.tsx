'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { uid } from '@/lib/id';
import { canAccessPedidos } from '@/lib/pedidos-access';
import { MOCK_SUPPLIERS } from '@/lib/pedidos-mock-catalog';
import { getPedidoDraftById, savePedidoDraft, type PedidoDraftItem } from '@/lib/pedidos-storage';

type QtyMap = Record<string, number>;

export default function NuevoPedidoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { localCode, localName, localId, email } = useAuth();
  const canUse = canAccessPedidos(localCode, email, localName, localId);
  const editingId = searchParams.get('id');
  const [supplierId, setSupplierId] = React.useState(MOCK_SUPPLIERS[0]?.id ?? '');
  const [notes, setNotes] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [qtyByProductId, setQtyByProductId] = React.useState<QtyMap>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [isLoadedEdit, setIsLoadedEdit] = React.useState(false);
  const [existingCreatedAt, setExistingCreatedAt] = React.useState<string | null>(null);
  const [existingSentAt, setExistingSentAt] = React.useState<string | null>(null);

  const selectedSupplier = MOCK_SUPPLIERS.find((s) => s.id === supplierId) ?? null;
  const supplierProducts = selectedSupplier?.products ?? [];
  const filteredProducts = supplierProducts.filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  React.useEffect(() => {
    if (!editingId) return;
    const draft = getPedidoDraftById(editingId);
    if (!draft) {
      setMessage('No se encontro el borrador para editar.');
      setIsLoadedEdit(true);
      return;
    }
    setSupplierId(draft.supplierId || MOCK_SUPPLIERS[0]?.id || '');
    setNotes(draft.notes);
    setExistingCreatedAt(draft.createdAt);
    setExistingSentAt(draft.sentAt ?? null);
    setQtyByProductId(
      draft.items.reduce<QtyMap>((acc, item) => {
        acc[item.productId] = item.quantity;
        return acc;
      }, {}),
    );
    setIsLoadedEdit(true);
  }, [editingId]);

  React.useEffect(() => {
    setSearch('');
    if (editingId && !isLoadedEdit) return;
    setQtyByProductId((prev) => {
      const next: QtyMap = {};
      for (const product of supplierProducts) {
        next[product.id] = prev[product.id] ?? 0;
      }
      return next;
    });
  }, [supplierId, supplierProducts, editingId, isLoadedEdit]);

  const changeQty = (productId: string, unit: 'kg' | 'ud' | 'bolsa' | 'racion', direction: 'inc' | 'dec') => {
    const step = unit === 'kg' ? 0.1 : 1;
    setQtyByProductId((prev) => {
      const current = prev[productId] ?? 0;
      const nextRaw = direction === 'inc' ? current + step : current - step;
      const next = Math.max(0, Math.round(nextRaw * 100) / 100);
      return { ...prev, [productId]: next };
    });
  };

  const items: PedidoDraftItem[] = supplierProducts
    .map((p) => {
      const quantity = qtyByProductId[p.id] ?? 0;
      const lineTotal = Math.round(quantity * p.pricePerUnit * 100) / 100;
      return {
        productId: p.id,
        productName: p.name,
        unit: p.unit,
        quantity,
        receivedQuantity: 0,
        pricePerUnit: p.pricePerUnit,
        lineTotal,
      };
    })
    .filter((row) => row.quantity > 0);

  const total = items.reduce((acc, row) => acc + row.lineTotal, 0);

  const saveDraft = (nextStatus: 'draft' | 'sent' = 'draft') => {
    if (!selectedSupplier) {
      setMessage('Selecciona proveedor.');
      return;
    }
    if (items.length === 0) {
      setMessage('Añade al menos un producto.');
      return;
    }
    const id = editingId ?? uid('ped');
    savePedidoDraft({
      id,
      supplierId: selectedSupplier.id,
      supplierName: selectedSupplier.name,
      status: nextStatus,
      notes: notes.trim(),
      createdAt: existingCreatedAt ?? new Date().toISOString(),
      sentAt: nextStatus === 'sent' ? existingSentAt ?? new Date().toISOString() : undefined,
      items,
      total: Math.round(total * 100) / 100,
    });
    router.push('/pedidos');
  };

  if (!canUse) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-black text-zinc-900">Modulo no habilitado</p>
        <p className="pt-1 text-sm text-zinc-600">Pedidos esta disponible solo para el local de Mataro.</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-lg font-black text-zinc-900">Nuevo pedido</h1>
        <p className="pt-1 text-sm text-zinc-600">
          {editingId ? 'Edita el borrador y guarda cambios.' : 'Crea un borrador de pedido con productos del catalogo.'}
        </p>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Proveedor</label>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none"
        >
          {MOCK_SUPPLIERS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {selectedSupplier ? (
          <p className="mt-1 text-xs text-zinc-500">Contacto demo: {selectedSupplier.contact}</p>
        ) : null}
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Buscar producto
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar..."
          className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none"
        />
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-sm font-bold text-zinc-800">Catalogo del proveedor</p>
        <div className="mt-2 space-y-2">
          {filteredProducts.length === 0 ? <p className="text-sm text-zinc-500">Sin productos para este filtro.</p> : null}
          {filteredProducts.map((p) => {
            const qty = qtyByProductId[p.id] ?? 0;
            const lineTotal = Math.round(qty * p.pricePerUnit * 100) / 100;
            return (
              <div key={p.id} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-800">{p.name}</p>
                    <p className="text-xs text-zinc-500">
                      {p.pricePerUnit.toFixed(2)} EUR/{p.unit}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-zinc-900">{lineTotal.toFixed(2)} EUR</p>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => changeQty(p.id, p.unit, 'dec')}
                    className="h-10 w-10 rounded-full border border-zinc-300 bg-white text-xl font-bold text-zinc-700"
                  >
                    -
                  </button>
                  <div className="min-w-20 rounded-lg bg-white px-3 py-2 text-center text-sm font-bold text-zinc-900 ring-1 ring-zinc-200">
                    {p.unit === 'kg' ? qty.toFixed(2) : Math.round(qty)} {p.unit}
                  </div>
                  <button
                    type="button"
                    onClick={() => changeQty(p.id, p.unit, 'inc')}
                    className="h-10 w-10 rounded-full bg-[#2563EB] text-xl font-bold text-white"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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
          onClick={() => saveDraft('draft')}
          className="mt-3 h-11 w-full rounded-xl bg-[#D32F2F] text-sm font-bold text-white"
        >
          {editingId ? 'Guardar cambios' : 'Guardar borrador'}
        </button>
        <button
          type="button"
          onClick={() => saveDraft('sent')}
          className="mt-2 h-11 w-full rounded-xl border border-[#2563EB] bg-white text-sm font-bold text-[#2563EB]"
        >
          Enviar pedido
        </button>
      </section>
    </div>
  );
}
