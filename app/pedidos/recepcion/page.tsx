'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import { canAccessPedidos } from '@/lib/pedidos-access';
import { fetchOrders, setOrderStatus, updateOrderItemPrice, updateOrderItemReceived, type PedidoOrder } from '@/lib/pedidos-supabase';

export default function RecepcionPedidosPage() {
  const searchParams = useSearchParams();
  const { localCode, localName, localId, email } = useAuth();
  const canUse = canAccessPedidos(localCode, email, localName, localId);
  const [orders, setOrders] = React.useState<PedidoOrder[]>([]);
  const [supplierFilter, setSupplierFilter] = React.useState('all');
  const initialDateFilter = searchParams.get('date') ?? '';
  const [dateFilter, setDateFilter] = React.useState(initialDateFilter);
  const [message, setMessage] = React.useState<string | null>(null);

  const reloadOrders = React.useCallback(() => {
    if (!canUse || !localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchOrders(supabase, localId)
      .then((rows) => setOrders(rows.filter((row) => row.status === 'sent')))
      .catch((err: Error) => setMessage(err.message));
  }, [canUse, localId]);

  React.useEffect(() => {
    reloadOrders();
  }, [reloadOrders]);

  const supplierOptions = React.useMemo(() => {
    return Array.from(new Set(orders.map((o) => o.supplierName))).sort((a, b) => a.localeCompare(b));
  }, [orders]);

  const filteredOrders = React.useMemo(() => {
    return orders.filter((order) => {
      const bySupplier = supplierFilter === 'all' || order.supplierName === supplierFilter;
      const orderDate = order.createdAt.slice(0, 10);
      const byDate = !dateFilter || orderDate === dateFilter;
      return bySupplier && byDate;
    });
  }, [orders, supplierFilter, dateFilter]);

  const markAllReceived = (order: PedidoOrder) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void (async () => {
      try {
        const updates = await Promise.allSettled(
          order.items.map((item) => updateOrderItemReceived(supabase, localId, item.id, item.quantity)),
        );
        const failed = updates.filter((r) => r.status === 'rejected');
        if (failed.length > 0) {
          setMessage(`No se pudieron actualizar ${failed.length} líneas del pedido.`);
          return;
        }
        await setOrderStatus(supabase, localId, order.id, 'received');
        setMessage('Pedido marcado como recibido.');
        await reloadOrders();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'No se pudo marcar recibido.');
      }
    })();
  };

  const changeReceived = (orderId: string, itemId: string, current: number, step: number) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const next = Math.max(0, Math.round((current + step) * 100) / 100);
    if (next === current) return;

    let shouldCloseOrder = false;
    // Optimistic UI: reflect line changes instantly.
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        const nextItems = order.items.map((item) =>
          item.id === itemId ? { ...item, receivedQuantity: next } : item,
        );
        shouldCloseOrder = nextItems.every((item) => item.receivedQuantity >= item.quantity);
        return { ...order, items: nextItems };
      }),
    );

    void updateOrderItemReceived(supabase, localId, itemId, next)
      .then(async () => {
        if (!shouldCloseOrder) return;
        await setOrderStatus(supabase, localId, orderId, 'received');
        setMessage('Pedido completado y movido a histórico recibido.');
        await reloadOrders();
      })
      .catch((err: Error) => {
        // Re-sync from backend if optimistic update failed.
        void reloadOrders();
        setMessage(err.message);
      });
  };

  const changeUnitPrice = (orderId: string, itemId: string, rawValue: string) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const parsed = Number(rawValue.replace(',', '.'));
    if (Number.isNaN(parsed) || parsed < 0) {
      setMessage('Precio inválido.');
      return;
    }
    const nextPrice = Math.round(parsed * 100) / 100;

    let itemQuantity = 0;
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        const nextItems = order.items.map((item) => {
          if (item.id !== itemId) return item;
          itemQuantity = item.quantity;
          return { ...item, pricePerUnit: nextPrice, lineTotal: Math.round(nextPrice * item.quantity * 100) / 100 };
        });
        return { ...order, items: nextItems };
      }),
    );

    void updateOrderItemPrice(supabase, localId, itemId, nextPrice, itemQuantity).catch((err: Error) => {
      void reloadOrders();
      setMessage(err.message);
    });
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
        <h1 className="text-lg font-black text-zinc-900">Recepcion de albaranes</h1>
        <p className="pt-1 text-sm text-zinc-600">Marca por linea lo recibido frente a lo pedido.</p>
        {dateFilter ? (
          <p className="pt-1 text-xs font-semibold text-zinc-500">
            Mostrando pedidos del día: {new Date(`${dateFilter}T00:00:00`).toLocaleDateString('es-ES')}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-sm font-semibold text-zinc-800">Pendientes de recepcion</p>
        {message ? <p className="mt-2 text-sm text-[#B91C1C]">{message}</p> : null}
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none"
          >
            <option value="all">Todos los proveedores</option>
            {supplierOptions.map((supplier) => (
              <option key={supplier} value={supplier}>
                {supplier}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none"
          />
        </div>
        <div className="mt-2 space-y-3">
          {filteredOrders.length === 0 ? <p className="text-sm text-zinc-500">No hay pedidos con ese filtro.</p> : null}
          {filteredOrders.map((order) => (
            <div key={order.id} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-zinc-900">{order.supplierName}</p>
                  <p className="text-xs text-zinc-500">Pedido {new Date(order.createdAt).toLocaleDateString('es-ES')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => markAllReceived(order)}
                  className="rounded-lg bg-[#16A34A] px-3 py-2 text-xs font-semibold text-white"
                >
                  Marcar todo recibido
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {order.items.map((item) => {
                  const step = item.unit === 'kg' ? 0.1 : 1;
                  return (
                    <div key={item.id} className="rounded-lg bg-white p-2 ring-1 ring-zinc-200">
                      <p className="text-sm font-semibold text-zinc-800">{item.productName}</p>
                      <p className="text-xs text-zinc-500">
                        Pedido: {item.quantity} {item.unit} · Recibido: {item.receivedQuantity} {item.unit}
                        {item.receivedQuantity > item.quantity
                          ? ` · Extra: +${(item.receivedQuantity - item.quantity).toFixed(item.unit === 'kg' ? 2 : 0)} ${item.unit}`
                          : ''}
                      </p>
                      <p className="text-xs text-zinc-500">
                        p/unit: {item.pricePerUnit.toFixed(2)} €/{item.unit} · subt.: {item.lineTotal.toFixed(2)} €
                      </p>
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            changeReceived(order.id, item.id, item.receivedQuantity, -step)
                          }
                          className="grid h-11 w-11 place-items-center rounded-full border border-zinc-300 bg-white text-2xl font-black leading-none text-zinc-700"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            changeReceived(order.id, item.id, item.receivedQuantity, step)
                          }
                          className="grid h-11 w-11 place-items-center rounded-full bg-[#D32F2F] text-2xl font-black leading-none text-white"
                        >
                          +
                        </button>
                        <div className="ml-auto flex items-center gap-2">
                          <label className="text-xs font-semibold text-zinc-600">Precio recibido</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={item.pricePerUnit.toFixed(2)}
                            onBlur={(e) => changeUnitPrice(order.id, item.id, e.target.value)}
                            className="h-10 w-28 rounded-lg border border-zinc-300 bg-white px-2 text-sm font-semibold text-zinc-900 outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
