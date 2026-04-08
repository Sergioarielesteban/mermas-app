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

function normalizeWhatsappNumber(raw: string | undefined) {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  return digits || null;
}

function buildWhatsappDraftMessage(input: {
  supplierName: string;
  createdAtIso: string;
  deliveryDate: string;
  notes: string;
  items: PedidoOrderItem[];
}) {
  const fechaPedido = new Date(input.createdAtIso).toLocaleDateString('es-ES');
  return [
    `Proveedor: ${input.supplierName}`,
    `Fecha pedido: ${fechaPedido}`,
    `Fecha entrega: ${input.deliveryDate}`,
    'Local: ____________________',
    'Pedido por: _______________',
    '',
    'PEDIDO:',
    '',
    ...input.items.map((item) => `- ${item.productName}: ${item.quantity} ${item.unit}`),
    '',
    input.notes ? `Notas: ${input.notes}` : '',
    'Por favor, confirmar pedido. Gracias.',
  ]
    .filter(Boolean)
    .join('\n');
}

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
  const [loadingSuppliers, setLoadingSuppliers] = React.useState(false);
  const [isLoadedEdit, setIsLoadedEdit] = React.useState(false);
  const [existingCreatedAt, setExistingCreatedAt] = React.useState<string | null>(null);
  const [existingSentAt, setExistingSentAt] = React.useState<string | null>(null);
  const [existingOrderId, setExistingOrderId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!canUse || !localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoadingSuppliers(true);
    void fetchSuppliersWithProducts(supabase, localId)
      .then((rows) => {
        setSuppliers(rows);
        if (rows[0]?.id) {
          setSupplierId((prev) => prev || rows[0].id);
        }
      })
      .catch((err: Error) => setMessage(err.message))
      .finally(() => setLoadingSuppliers(false));
  }, [canUse, localId]);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const supplierProducts = React.useMemo(() => selectedSupplier?.products ?? [], [selectedSupplier]);
  const filteredProducts = supplierProducts
    .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

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

  const changeQty = (productId: string, unit: PedidoOrderItem['unit'], direction: 'inc' | 'dec') => {
    const step = unit === 'kg' ? 0.1 : 1;
    setQtyByProductId((prev) => {
      const current = prev[productId] ?? 0;
      const nextRaw = direction === 'inc' ? current + step : current - step;
      const next = Math.max(0, Math.round(nextRaw * 100) / 100);
      return { ...prev, [productId]: next };
    });
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

  const sendToWhatsappInOneStep = () => {
    if (!selectedSupplier) return setMessage('Selecciona proveedor.');
    if (items.length === 0) return setMessage('Añade al menos un producto.');
    if (!localId) return setMessage('Perfil del local aún cargando.');
    const phone = normalizeWhatsappNumber(selectedSupplier.contact);
    if (!phone) return setMessage('El proveedor no tiene teléfono válido en contacto.');
    const suggested = new Date();
    suggested.setDate(suggested.getDate() + 1);
    const picked = window.prompt('Fecha de entrega (AAAA-MM-DD):', suggested.toISOString().slice(0, 10))?.trim();
    if (!picked) return;
    const parsed = new Date(`${picked}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return setMessage('Fecha de entrega inválida. Usa AAAA-MM-DD.');
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Sin conexión con Supabase.');

    void saveOrder(supabase, localId, {
      orderId: existingOrderId ?? undefined,
      supplierId: selectedSupplier.id,
      status: 'sent',
      notes: notes.trim(),
      createdAt: existingCreatedAt ?? new Date().toISOString(),
      sentAt: existingSentAt ?? new Date().toISOString(),
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
      .then(() => {
        const text = encodeURIComponent(
          buildWhatsappDraftMessage({
            supplierName: selectedSupplier.name,
            createdAtIso: existingCreatedAt ?? new Date().toISOString(),
            deliveryDate: parsed.toLocaleDateString('es-ES'),
            notes: notes.trim(),
            items,
          }),
        );
        window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener,noreferrer');
        router.push('/pedidos');
      })
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
        {loadingSuppliers ? <p className="mt-2 text-xs font-semibold text-zinc-500">Cargando catálogo de proveedores...</p> : null}
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
        <p className="mt-1 text-xs text-zinc-500">Al seleccionar proveedor se carga todo su catálogo. Usa solo + y -.</p>
        <div className="mt-2 space-y-2">
          {selectedSupplier && filteredProducts.length > 0 ? (
            <p className="text-xs font-semibold text-zinc-500">
              {selectedSupplier.name}: {filteredProducts.length} productos
            </p>
          ) : null}
          {selectedSupplier && filteredProducts.length === 0 ? (
            <p className="text-sm text-zinc-500">Este proveedor no tiene productos activos. Revísalo en Proveedores.</p>
          ) : null}
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
                  <button
                    type="button"
                    onClick={() => changeQty(p.id, p.unit, 'dec')}
                    className="h-14 w-14 rounded-full border border-zinc-300 bg-white text-3xl font-black text-zinc-700"
                  >
                    -
                  </button>
                  <div className="min-w-28 rounded-lg bg-white px-3 py-3 text-center text-base font-black text-zinc-900 ring-1 ring-zinc-200">
                    {p.unit === 'kg' ? qty.toFixed(2) : Math.round(qty)} {p.unit}
                  </div>
                  <button
                    type="button"
                    onClick={() => changeQty(p.id, p.unit, 'inc')}
                    className="h-14 w-14 rounded-full bg-[#2563EB] text-3xl font-black text-white"
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
            onClick={sendToWhatsappInOneStep}
            className="h-11 rounded-xl border border-[#2563EB] bg-white text-sm font-bold text-[#2563EB]"
          >
            Enviar pedido por WhatsApp
          </button>
        </div>
      </section>
    </div>
  );
}
