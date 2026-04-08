'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import { canAccessPedidos } from '@/lib/pedidos-access';
import { fetchOrders, setOrderStatus, updateOrderItemReceived, type PedidoOrder } from '@/lib/pedidos-supabase';

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
        for (const item of order.items) {
          await updateOrderItemReceived(supabase, localId, item.id, item.quantity);
        }
        await setOrderStatus(supabase, localId, order.id, 'received');
        reloadOrders();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'No se pudo marcar recibido.');
      }
    })();
  };

  const changeReceived = (orderId: string, itemId: string, current: number, step: number, max: number) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const next = Math.max(0, Math.min(max, Math.round((current + step) * 100) / 100));
    void updateOrderItemReceived(supabase, localId, itemId, next)
      .then(() => reloadOrders())
      .catch((err: Error) => setMessage(err.message));
    void orderId;
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
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            changeReceived(order.id, item.id, item.receivedQuantity, -step, item.quantity)
                          }
                          className="h-8 w-8 rounded-full border border-zinc-300 bg-white font-bold text-zinc-700"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            changeReceived(order.id, item.id, item.receivedQuantity, step, item.quantity)
                          }
                          className="h-8 w-8 rounded-full bg-[#2563EB] font-bold text-white"
                        >
                          +
                        </button>
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
