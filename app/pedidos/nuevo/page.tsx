'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import { canAccessPedidos } from '@/lib/pedidos-access';
import {
  fetchSupplierProductPriceHistory,
  fetchOrders,
  fetchSuppliersWithProducts,
  saveOrder,
  type PedidoOrderItem,
  type PedidoSupplier,
  type SupplierProductPriceHistory,
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
  localName: string;
  requestedBy: string;
  notes: string;
  items: PedidoOrderItem[];
}) {
  const fechaPedido = new Date(input.createdAtIso).toLocaleDateString('es-ES');
  return [
    `Proveedor: ${input.supplierName}`,
    `Fecha pedido: ${fechaPedido}`,
    `Fecha entrega: ${input.deliveryDate}`,
    `Local: ${input.localName || 'MATARO'}`,
    `Pedido por: ${input.requestedBy}`,
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
  const [deliveryDate, setDeliveryDate] = React.useState('');
  const [priceHistoryByProductId, setPriceHistoryByProductId] = React.useState<Map<string, SupplierProductPriceHistory>>(new Map());
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

  React.useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setDeliveryDate(tomorrow.toISOString().slice(0, 10));
  }, []);

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

  React.useEffect(() => {
    if (!localId || supplierProducts.length === 0) {
      setPriceHistoryByProductId(new Map());
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchSupplierProductPriceHistory(supabase, localId, supplierProducts.map((p) => p.id))
      .then((rows) => setPriceHistoryByProductId(rows))
      .catch(() => setPriceHistoryByProductId(new Map()));
  }, [localId, supplierProducts]);

  const changeQty = (productId: string, unit: PedidoOrderItem['unit'], direction: 'inc' | 'dec') => {
    const step = unit === 'kg' ? 0.1 : 1;
    setQtyByProductId((prev) => {
      const current = prev[productId] ?? 0;
      const nextRaw = direction === 'inc' ? current + step : current - step;
      const next = Math.max(0, Math.round(nextRaw * 100) / 100);
      return { ...prev, [productId]: next };
    });
  };

  const setQtyToPar = (productId: string, parStock: number) => {
    setQtyByProductId((prev) => ({ ...prev, [productId]: Math.max(0, Math.round(parStock * 100) / 100) }));
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
        vatRate: p.vatRate ?? 0,
        lineTotal,
      };
    })
    .filter((row) => row.quantity > 0);

  const totalBase = items.reduce((acc, row) => acc + row.lineTotal, 0);
  const totalVat = items.reduce((acc, row) => acc + row.lineTotal * row.vatRate, 0);
  const total = totalBase + totalVat;

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
      deliveryDate: deliveryDate || undefined,
      items: items.map((item) => ({
        supplierProductId: item.supplierProductId,
        productName: item.productName,
        unit: item.unit,
        quantity: item.quantity,
        receivedQuantity: item.receivedQuantity,
        pricePerUnit: item.pricePerUnit,
        vatRate: item.vatRate,
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
    setDeliveryDate(picked);
    const requestedBy = window.prompt('Nombre de quien pide:')?.trim();
    if (!requestedBy) return setMessage('Debes indicar quién está pidiendo.');
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Sin conexión con Supabase.');

    void saveOrder(supabase, localId, {
      orderId: existingOrderId ?? undefined,
      supplierId: selectedSupplier.id,
      status: 'sent',
      notes: notes.trim(),
      createdAt: existingCreatedAt ?? new Date().toISOString(),
      sentAt: existingSentAt ?? new Date().toISOString(),
      deliveryDate: deliveryDate || undefined,
      items: items.map((item) => ({
        supplierProductId: item.supplierProductId,
        productName: item.productName,
        unit: item.unit,
        quantity: item.quantity,
        receivedQuantity: item.receivedQuantity,
        pricePerUnit: item.pricePerUnit,
        vatRate: item.vatRate,
        lineTotal: item.lineTotal,
      })),
    })
      .then(() => {
        const text = encodeURIComponent(
          buildWhatsappDraftMessage({
            supplierName: selectedSupplier.name,
            createdAtIso: existingCreatedAt ?? new Date().toISOString(),
            deliveryDate: parsed.toLocaleDateString('es-ES'),
            localName: localName ?? 'MATARO',
            requestedBy,
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
        <p className="pt-1 text-sm text-zinc-600">Pedidos esta disponible para los locales de Mataro y Premia.</p>
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
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Fecha entrega</label>
        <input
          type="date"
          value={deliveryDate}
          onChange={(e) => setDeliveryDate(e.target.value)}
          className="mt-2 h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none"
        />
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-sm font-bold text-zinc-800">Catalogo del proveedor</p>
        <p className="mt-1 text-xs text-zinc-500">Al seleccionar proveedor se carga todo su catálogo. Usa solo + y -.</p>
        <div className="mt-2">
          <button
            type="button"
            onClick={() => {
              setQtyByProductId((prev) => {
                const next = { ...prev };
                for (const p of filteredProducts) {
                  if ((p.parStock ?? 0) > 0) next[p.id] = p.parStock;
                }
                return next;
              });
            }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700"
          >
            Aplicar par stock a todos
          </button>
        </div>
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
            const priceHistory = priceHistoryByProductId.get(p.id);
            const priceDelta = priceHistory ? p.pricePerUnit - priceHistory.lastPrice : 0;
            return (
              <div key={p.id} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-800">{p.name}</p>
                    <p className="text-xs text-zinc-500">
                      {p.pricePerUnit.toFixed(2)} €/{p.unit} · IVA {(p.vatRate * 100).toFixed(0)}%
                    </p>
                    <p className="text-xs text-zinc-500">
                      Par stock: {p.parStock}
                      {priceHistory ? ` · Último ${priceHistory.lastPrice.toFixed(2)} € · Δ ${priceDelta >= 0 ? '+' : ''}${priceDelta.toFixed(2)} €` : ' · Sin histórico'}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-zinc-900">{lineTotal.toFixed(2)} €</p>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <div className="min-w-[88px] rounded-md bg-[#D32F2F] px-3 py-1.5 text-center text-sm font-black text-white">
                    {p.unit === 'kg' ? qty.toFixed(2) : Math.round(qty)}
                  </div>
                  <span className="text-xs font-semibold uppercase text-zinc-500">{p.unit}</span>
                  <button
                    type="button"
                    onClick={() => changeQty(p.id, p.unit, 'dec')}
                    className="grid h-10 w-10 place-items-center rounded-full border border-zinc-300 bg-white text-2xl font-black leading-none text-zinc-500"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() => changeQty(p.id, p.unit, 'inc')}
                    className="grid h-10 w-10 place-items-center rounded-full bg-[#D32F2F] text-2xl font-black leading-none text-white"
                  >
                    +
                  </button>
                </div>
                {(p.parStock ?? 0) > 0 && qty < p.parStock ? (
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-700">
                    <span>Bajo par stock</span>
                    <button
                      type="button"
                      onClick={() => setQtyToPar(p.id, p.parStock)}
                      className="rounded border border-amber-300 bg-white px-2 py-0.5 font-semibold"
                    >
                      Llevar a PAR
                    </button>
                  </div>
                ) : null}
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
                  {row.quantity} {row.unit} · Subtotal {row.lineTotal.toFixed(2)} € · IVA {(row.lineTotal * row.vatRate).toFixed(2)} €
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
          <div className="flex items-center justify-between text-sm text-zinc-700">
            <span>Subtotal</span>
            <span className="font-semibold">{totalBase.toFixed(2)} €</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm text-zinc-700">
            <span>IVA</span>
            <span className="font-semibold">{totalVat.toFixed(2)} €</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-base font-black text-zinc-900">
            <span>Total</span>
            <span>{total.toFixed(2)} €</span>
          </div>
        </div>
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
        <div className="rounded-xl bg-zinc-50 p-2 ring-1 ring-zinc-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{items.length} lineas</p>
          <div className="mt-1 flex items-center justify-between text-sm text-zinc-700">
            <span>Subtotal</span>
            <span>{totalBase.toFixed(2)} €</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm text-zinc-700">
            <span>IVA</span>
            <span>{totalVat.toFixed(2)} €</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-base font-black text-zinc-900">
            <span>Total</span>
            <span>{total.toFixed(2)} €</span>
          </div>
        </div>
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
