'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import { canAccessPedidos } from '@/lib/pedidos-access';
import {
  fetchOrders,
  fetchSuppliersWithProducts,
  saveOrder,
  type PedidoOrderItem,
  type PedidoSupplier,
} from '@/lib/pedidos-supabase';

type QtyMap = Record<string, number>;

export default function NuevoPedidoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { localCode, localName, localId, email } = useAuth();
  const canUse = canAccessPedidos(localCode, email, localName, localId);
  const editingId = searchParams.get('id');
  const [suppliers, setSuppliers] = React.useState<PedidoSupplier[]>([]);
  const [supplierId, setSupplierId] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [qtyByProductId, setQtyByProductId] = React.useState<QtyMap>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [isLoadedEdit, setIsLoadedEdit] = React.useState(false);
  const [existingCreatedAt, setExistingCreatedAt] = React.useState<string | null>(null);
  const [existingSentAt, setExistingSentAt] = React.useState<string | null>(null);
  const [existingOrderId, setExistingOrderId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!canUse || !localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchSuppliersWithProducts(supabase, localId)
      .then((rows) => {
        setSuppliers(rows);
        if (!supplierId && rows[0]?.id) setSupplierId(rows[0].id);
      })
      .catch((err: Error) => setMessage(err.message));
  }, [canUse, localId, supplierId]);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const supplierProducts = React.useMemo(() => selectedSupplier?.products ?? [], [selectedSupplier]);
  const filteredProducts = supplierProducts.filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  React.useEffect(() => {
    if (!editingId) return;
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchOrders(supabase, localId)
      .then((rows) => {
        const draft = rows.find((row) => row.id === editingId);
        if (!draft) {
          setMessage('No se encontro el borrador para editar.');
          setIsLoadedEdit(true);
          return;
        }
        setExistingOrderId(draft.id);
        setSupplierId(draft.supplierId);
        setNotes(draft.notes);
        setExistingCreatedAt(draft.createdAt);
        setExistingSentAt(draft.sentAt ?? null);
        setQtyByProductId(
          draft.items.reduce<QtyMap>((acc, item) => {
            if (item.supplierProductId) acc[item.supplierProductId] = item.quantity;
            return acc;
          }, {}),
        );
        setIsLoadedEdit(true);
      })
      .catch((err: Error) => {
        setMessage(err.message);
        setIsLoadedEdit(true);
      });
  }, [editingId, localId]);

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
  const setDirectQty = (productId: string, rawValue: string) => {
    const parsed = Number(rawValue.replace(',', '.'));
    const safe = Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
    setQtyByProductId((prev) => ({ ...prev, [productId]: safe }));
  };

  const items: PedidoOrderItem[] = supplierProducts
    .map((p) => {
      const quantity = qtyByProductId[p.id] ?? 0;
      const lineTotal = Math.round(quantity * p.pricePerUnit * 100) / 100;
      return {
        id: p.id,
        supplierProductId: p.id,
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
    if (!localId) {
      setMessage('Perfil del local aún cargando.');
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setMessage('Sin conexión con Supabase.');
      return;
    }
    void saveOrder(supabase, localId, {
      orderId: existingOrderId ?? undefined,
      supplierId: selectedSupplier.id,
      status: nextStatus,
      notes: notes.trim(),
      createdAt: existingCreatedAt ?? new Date().toISOString(),
      sentAt: nextStatus === 'sent' ? existingSentAt ?? new Date().toISOString() : undefined,
      items: items.map((item) => ({
        supplierProductId: item.supplierProductId,
        productName: item.productName,
        unit: item.unit,
        quantity: item.quantity,
        receivedQuantity: item.receivedQuantity,
        pricePerUnit: item.pricePerUnit,
        lineTotal: item.lineTotal,
      })),
    })
      .then(() => router.push('/pedidos'))
      .catch((err: Error) => setMessage(err.message));
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
      <section>
        <Link
          href="/pedidos"
          className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700"
        >
          ← Atras
        </Link>
      </section>

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
          className="mt-2 h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 outline-none"
        >
          {suppliers.map((s) => (
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
          className="mt-2 h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
        />
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-sm font-bold text-zinc-800">Catalogo del proveedor</p>
        <p className="mt-1 text-xs text-zinc-500">Toca +1/+5 para cargar rapido o escribe la cantidad exacta.</p>
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
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQtyByProductId((prev) => ({ ...prev, [p.id]: Math.max(0, (prev[p.id] ?? 0) + (p.unit === 'kg' ? 0.5 : 1)) }))}
                      className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700"
                    >
                      {p.unit === 'kg' ? '+0.5' : '+1'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setQtyByProductId((prev) => ({ ...prev, [p.id]: Math.max(0, (prev[p.id] ?? 0) + (p.unit === 'kg' ? 1 : 5)) }))}
                      className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700"
                    >
                      {p.unit === 'kg' ? '+1' : '+5'}
                    </button>
                  </div>
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
                  <input
                    value={qty}
                    onChange={(e) => setDirectQty(p.id, e.target.value)}
                    inputMode="decimal"
                    className="h-10 w-20 rounded-lg border border-zinc-300 bg-white px-2 text-center text-sm font-semibold text-zinc-900 outline-none"
                  />
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
            <div key={row.id} className="flex items-center justify-between rounded-xl bg-zinc-50 p-3">
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

      <section className="rounded-2xl bg-white p-4 pb-28 ring-1 ring-zinc-200">
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Notas</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
          placeholder="Observaciones del pedido..."
        />
        {message ? <p className="mt-2 text-sm text-[#B91C1C]">{message}</p> : null}
      </section>

      <section className="sticky bottom-2 z-20 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {items.length} lineas · Total {total.toFixed(2)} EUR
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => saveDraft('draft')}
            className="h-11 rounded-xl bg-[#D32F2F] text-sm font-bold text-white"
          >
            {editingId ? 'Guardar cambios' : 'Guardar borrador'}
          </button>
          <button
            type="button"
            onClick={() => saveDraft('sent')}
            className="h-11 rounded-xl border border-[#2563EB] bg-white text-sm font-bold text-[#2563EB]"
          >
            Enviar pedido
          </button>
        </div>
      </section>
    </div>
  );
}
