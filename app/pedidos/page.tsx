'use client';

import Link from 'next/link';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import { canAccessPedidos } from '@/lib/pedidos-access';
import {
  deleteOrder,
  fetchOrders,
  setOrderStatus,
  type PedidoOrder,
} from '@/lib/pedidos-supabase';

export default function PedidosPage() {
  const { localCode, localName, localId, email } = useAuth();
  const canUse = canAccessPedidos(localCode, email, localName, localId);
  const [orders, setOrders] = React.useState<PedidoOrder[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const reloadOrders = React.useCallback(() => {
    if (!canUse || !localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchOrders(supabase, localId)
      .then((rows) => setOrders(rows))
      .catch((err: Error) => setMessage(err.message));
  }, [canUse, localId]);

  React.useEffect(() => {
    reloadOrders();
  }, [reloadOrders]);

  const draftOrders = orders.filter((row) => row.status === 'draft');
  const sentOrders = orders.filter((row) => row.status === 'sent');
  const receivedOrders = orders.filter((row) => row.status === 'received');
  const draftsTotal = draftOrders.reduce((acc, d) => acc + d.total, 0);

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
        <h1 className="text-lg font-black text-zinc-900">Pedidos</h1>
        <p className="pt-1 text-sm text-zinc-600">
          Gestion de pedidos de compra, recepcion de mercancia y control de incidencias.
        </p>
      </section>

      {message ? (
        <section className="rounded-2xl bg-white p-4 text-sm text-zinc-700 ring-1 ring-zinc-200">{message}</section>
      ) : null}

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Borradores</p>
          <p className="pt-2 text-2xl font-black text-zinc-900">{draftOrders.length}</p>
          <p className="pt-1 text-xs text-zinc-500">Total: {draftsTotal.toFixed(2)} EUR</p>
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pendientes recepcion</p>
          <p className="pt-2 text-2xl font-black text-zinc-900">{sentOrders.length}</p>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Accesos</p>
        <div className="mt-3 grid grid-cols-1 gap-2">
          <Link
            href="/pedidos/nuevo"
            className="rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-3 text-sm font-semibold text-zinc-800"
          >
            Nuevo pedido
          </Link>
          <Link
            href="/pedidos/proveedores"
            className="rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-3 text-sm font-semibold text-zinc-800"
          >
            Proveedores y catalogo
          </Link>
          <Link
            href="/pedidos/recepcion"
            className="rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-3 text-sm font-semibold text-zinc-800"
          >
            Recepcion de albaranes
          </Link>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-sm font-bold text-zinc-800">Borradores</p>
        <div className="mt-2 space-y-2">
          {draftOrders.length === 0 ? <p className="text-sm text-zinc-500">No hay borradores.</p> : null}
          {draftOrders.map((order) => (
            <div key={order.id} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{order.supplierName}</p>
                  <p className="text-xs text-zinc-500">{order.items.length} lineas · {order.total.toFixed(2)} EUR</p>
                </div>
                <p className="text-xs text-zinc-500">{new Date(order.createdAt).toLocaleDateString('es-ES')}</p>
              </div>
              <div className="mt-3 flex gap-2">
                <Link
                  href={`/pedidos/nuevo?id=${order.id}`}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700"
                >
                  Editar
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    if (!localId) return;
                    const supabase = getSupabaseClient();
                    if (!supabase) return;
                    void setOrderStatus(supabase, localId, order.id, 'sent')
                      .then(() => reloadOrders())
                      .catch((err: Error) => setMessage(err.message));
                  }}
                  className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white"
                >
                  Enviar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!localId) return;
                    const supabase = getSupabaseClient();
                    if (!supabase) return;
                    void deleteOrder(supabase, localId, order.id)
                      .then(() => reloadOrders())
                      .catch((err: Error) => setMessage(err.message));
                  }}
                  className="rounded-lg border border-[#B91C1C] bg-white px-3 py-2 text-xs font-semibold text-[#B91C1C]"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-sm font-bold text-zinc-800">Pedidos enviados</p>
        <div className="mt-2 space-y-2">
          {sentOrders.length === 0 ? <p className="text-sm text-zinc-500">No hay pedidos enviados.</p> : null}
          {sentOrders.map((order) => (
            <div key={order.id} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
              <p className="text-sm font-semibold text-zinc-900">{order.supplierName}</p>
              <p className="text-xs text-zinc-500">
                {order.items.length} lineas · {order.total.toFixed(2)} EUR · enviado{' '}
                {order.sentAt ? new Date(order.sentAt).toLocaleDateString('es-ES') : '-'}
              </p>
              <button
                type="button"
                onClick={() => setExpandedId((prev) => (prev === order.id ? null : order.id))}
                className="mt-2 text-xs font-semibold text-[#2563EB]"
              >
                {expandedId === order.id ? 'Ocultar detalle' : 'Ver detalle'}
              </button>
              {expandedId === order.id ? (
                <div className="mt-2 space-y-1">
                  {order.items.map((item) => (
                    <p key={item.id} className="text-xs text-zinc-600">
                      {item.productName}: {item.quantity} {item.unit} ({item.lineTotal.toFixed(2)} EUR)
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-sm font-bold text-zinc-800">Historico recibido</p>
        <div className="mt-2 space-y-2">
          {receivedOrders.length === 0 ? <p className="text-sm text-zinc-500">No hay pedidos recibidos.</p> : null}
          {receivedOrders.map((order) => (
            <div key={order.id} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
              <p className="text-sm font-semibold text-zinc-900">{order.supplierName}</p>
              <p className="text-xs text-zinc-500">
                {order.items.length} lineas · {order.total.toFixed(2)} EUR · recibido{' '}
                {order.receivedAt ? new Date(order.receivedAt).toLocaleDateString('es-ES') : '-'}
              </p>
              <button
                type="button"
                onClick={() => setExpandedId((prev) => (prev === order.id ? null : order.id))}
                className="mt-2 text-xs font-semibold text-[#2563EB]"
              >
                {expandedId === order.id ? 'Ocultar detalle' : 'Ver detalle'}
              </button>
              {expandedId === order.id ? (
                <div className="mt-2 space-y-1">
                  {order.items.map((item) => (
                    <p key={item.id} className="text-xs text-zinc-600">
                      {item.productName}: pedido {item.quantity} / recibido {item.receivedQuantity} {item.unit}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
