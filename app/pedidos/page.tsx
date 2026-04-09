'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import { canAccessPedidos } from '@/lib/pedidos-access';
import {
  deleteOrder,
  fetchOrders,
  type PedidoOrder,
} from '@/lib/pedidos-supabase';

function normalizeWhatsappNumber(raw: string | undefined) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return null;
  return hasPlus ? digits : digits;
}

function buildWhatsappOrderMessage(order: PedidoOrder, deliveryDate: string, localName: string, requestedBy: string) {
  const fechaPedido = new Date(order.createdAt).toLocaleDateString('es-ES');
  const lines = order.items.map(
    (item) => `- ${item.productName}: ${item.quantity} ${item.unit}`,
  );
  return [
    `Proveedor: ${order.supplierName}`,
    `Fecha pedido: ${fechaPedido}`,
    `Fecha entrega: ${deliveryDate}`,
    `Local: ${localName || 'MATARO'}`,
    `Pedido por: ${requestedBy}`,
    '',
    'PEDIDO:',
    '',
    ...lines,
    '',
    order.notes ? `Notas: ${order.notes}` : '',
    '',
    'Por favor, confirmar pedido. Gracias.',
  ]
    .filter(Boolean)
    .join('\n');
}

function orderedProductsLabel(order: PedidoOrder) {
  if (order.items.length === 0) return 'Sin productos';
  return order.items.map((item) => `${item.productName} (${item.quantity} ${item.unit})`).join(' · ');
}

export default function PedidosPage() {
  const router = useRouter();
  const { localCode, localName, localId, email } = useAuth();
  const canUse = canAccessPedidos(localCode, email, localName, localId);
  const [orders, setOrders] = React.useState<PedidoOrder[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [showDeletedBanner, setShowDeletedBanner] = React.useState(false);
  const deletedBannerTimeoutRef = React.useRef<number | null>(null);
  const sendWhatsappOrder = React.useCallback((order: PedidoOrder) => {
    const phone = normalizeWhatsappNumber(order.supplierContact);
    if (!phone) {
      setMessage(`El proveedor "${order.supplierName}" no tiene teléfono válido en contacto.`);
      return;
    }
    const fallbackDelivery = order.createdAt.slice(0, 10);
    const rawDelivery = order.deliveryDate ?? fallbackDelivery;
    const parsed = new Date(`${rawDelivery}T00:00:00`);
    const deliveryDate = Number.isNaN(parsed.getTime())
      ? new Date(order.createdAt).toLocaleDateString('es-ES')
      : parsed.toLocaleDateString('es-ES');
    const requestedBy = (email ?? 'EQUIPO').split('@')[0] || 'EQUIPO';
    const text = encodeURIComponent(buildWhatsappOrderMessage(order, deliveryDate, localName ?? 'MATARO', requestedBy));
    const url = `https://wa.me/${phone}?text=${text}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [email, localName]);

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

  React.useEffect(
    () => () => {
      if (deletedBannerTimeoutRef.current) window.clearTimeout(deletedBannerTimeoutRef.current);
    },
    [],
  );

  const sentOrders = orders.filter((row) => row.status === 'sent');
  const receivedOrders = orders.filter((row) => row.status === 'received');

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
      {showDeletedBanner ? (
        <div className="pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-black/25 px-6">
          <div className="rounded-2xl bg-[#D32F2F] px-7 py-5 text-center shadow-2xl ring-2 ring-white/75">
            <p className="text-xl font-black uppercase tracking-wide text-white">ELIMINADO</p>
          </div>
        </div>
      ) : null}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-lg font-black text-zinc-900">Pedidos</h1>
        <p className="pt-1 text-sm text-zinc-600">Gestion de pedidos de compra, recepcion de mercancia y seguimiento de precios.</p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Link href="/pedidos/nuevo" className="rounded-xl bg-[#D32F2F] px-3 py-2 text-center text-sm font-bold text-white">
            + Nuevo pedido
          </Link>
          <Link href="/pedidos/proveedores" className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-center text-sm font-semibold text-zinc-700">
            Proveedores
          </Link>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href="/pedidos/calendario" className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-center text-sm font-semibold text-zinc-700 inline-block">
            Calendario entregas
          </Link>
          <Link href="/pedidos/precios" className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-center text-sm font-semibold text-zinc-700 inline-block">
            Evolucion precios
          </Link>
        </div>
      </section>

      {message ? (
        <section className="rounded-2xl bg-white p-4 text-sm text-zinc-700 ring-1 ring-zinc-200">{message}</section>
      ) : null}

      <section className="flex justify-center">
        <button
          type="button"
          onClick={() => {
            const today = new Date().toISOString().slice(0, 10);
            router.push(`/pedidos/recepcion?date=${today}`);
          }}
          className="w-full max-w-sm rounded-2xl bg-white p-4 text-center ring-1 ring-zinc-200"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pendientes recepcion</p>
          <p className="pt-2 text-2xl font-black text-zinc-900">{sentOrders.length}</p>
          <p className="pt-1 text-xs text-zinc-500">Toca para ver el listado de pedidos de hoy.</p>
        </button>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-sm font-bold text-zinc-800">Pedidos enviados</p>
        <div className="mt-2 space-y-2">
          {sentOrders.length === 0 ? <p className="text-sm text-zinc-500">No hay pedidos enviados.</p> : null}
          {sentOrders.map((order) => (
            <div key={order.id} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
              <p className="text-sm font-semibold text-zinc-900">{order.supplierName}</p>
              <p className="text-xs text-zinc-500">
                enviado {order.sentAt ? new Date(order.sentAt).toLocaleDateString('es-ES') : '-'}
              </p>
              {order.deliveryDate ? <p className="text-xs text-zinc-500">Entrega: {new Date(`${order.deliveryDate}T00:00:00`).toLocaleDateString('es-ES')}</p> : null}
              <p className="pt-1 text-xs text-zinc-600">{orderedProductsLabel(order)}</p>
              <button
                type="button"
                onClick={() => setExpandedId((prev) => (prev === order.id ? null : order.id))}
                className="mt-2 text-xs font-semibold text-[#2563EB]"
              >
                {expandedId === order.id ? 'Ocultar detalle' : 'Ver detalle'}
              </button>
              <button
                type="button"
                onClick={() => sendWhatsappOrder(order)}
                className="mt-2 ml-3 text-xs font-semibold text-[#166534]"
              >
                Enviar WhatsApp
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!localId) return;
                  const supabase = getSupabaseClient();
                  if (!supabase) return;
                  void deleteOrder(supabase, localId, order.id)
                    .then(() => {
                      setOrders((prev) => prev.filter((o) => o.id !== order.id));
                      setMessage('Pedido enviado eliminado.');
                      setShowDeletedBanner(true);
                      if (deletedBannerTimeoutRef.current) window.clearTimeout(deletedBannerTimeoutRef.current);
                      deletedBannerTimeoutRef.current = window.setTimeout(() => {
                        setShowDeletedBanner(false);
                        deletedBannerTimeoutRef.current = null;
                      }, 1000);
                      void reloadOrders();
                    })
                    .catch((err: Error) => setMessage(err.message));
                }}
                className="mt-2 ml-3 text-xs font-semibold text-[#B91C1C]"
              >
                Eliminar
              </button>
              {expandedId === order.id ? (
                <div className="mt-2 space-y-1">
                  {order.items.map((item) => (
                    <p key={item.id} className="text-xs text-zinc-600">
                      {item.productName}: {item.quantity} {item.unit}
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
                recibido {order.receivedAt ? new Date(order.receivedAt).toLocaleDateString('es-ES') : '-'}
              </p>
              <button
                type="button"
                onClick={() => setExpandedId((prev) => (prev === order.id ? null : order.id))}
                className="mt-2 text-xs font-semibold text-[#2563EB]"
              >
                {expandedId === order.id ? 'Ocultar detalle' : 'Ver detalle'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!localId) return;
                  const supabase = getSupabaseClient();
                  if (!supabase) return;
                  void deleteOrder(supabase, localId, order.id)
                    .then(() => {
                      setOrders((prev) => prev.filter((o) => o.id !== order.id));
                      setMessage('Pedido histórico eliminado.');
                      setShowDeletedBanner(true);
                      if (deletedBannerTimeoutRef.current) window.clearTimeout(deletedBannerTimeoutRef.current);
                      deletedBannerTimeoutRef.current = window.setTimeout(() => {
                        setShowDeletedBanner(false);
                        deletedBannerTimeoutRef.current = null;
                      }, 1000);
                      void reloadOrders();
                    })
                    .catch((err: Error) => setMessage(err.message));
                }}
                className="mt-2 ml-3 text-xs font-semibold text-[#B91C1C]"
              >
                Eliminar
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
