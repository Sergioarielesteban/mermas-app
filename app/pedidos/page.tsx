'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { formatIncidentLine, formatQuantityWithUnit, unitPriceCatalogSuffix } from '@/lib/pedidos-format';
import {
  deleteOrder,
  fetchOrders,
  fetchSuppliersWithProducts,
  reopenReceivedOrderToSent,
  unitSupportsReceivedWeightKg,
  updateOrderItemIncident,
  updateOrderItemReceived,
  type PedidoOrder,
  type PedidoSupplier,
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

function normalizeLocalForWhatsapp(raw: string) {
  const cleaned = raw.replace(/\bCAN\b/gi, '').replace(/\s+/g, ' ').trim();
  return cleaned || 'XAMPA MATARO';
}

function buildWhatsappOrderMessage(order: PedidoOrder, deliveryDate: string, localName: string, requestedBy: string) {
  const fechaPedido = new Date(order.createdAt).toLocaleDateString('es-ES');
  const lines = order.items.map(
    (item) => `- ${item.productName}: ${formatQuantityWithUnit(item.quantity, item.unit)}`,
  );
  return [
    `Proveedor: ${order.supplierName}`,
    `Fecha pedido: ${fechaPedido}`,
    `Fecha entrega: ${deliveryDate}`,
    `Local: ${normalizeLocalForWhatsapp(localName || 'XAMPA MATARO')}`,
    `Pedido por: ${requestedBy}`,
    '------------------------------',
    'PEDIDO:',
    '------------------------------',
    ...lines,
    '------------------------------',
    order.notes ? `Notas: ${order.notes}` : '',
    'Por favor, confirmar pedido. Gracias.',
  ]
    .filter(Boolean)
    .join('\n');
}

function totalsWithVat(order: PedidoOrder) {
  const base = order.items.reduce((acc, item) => acc + item.lineTotal, 0);
  const vat = order.items.reduce((acc, item) => acc + item.lineTotal * (item.vatRate ?? 0), 0);
  return { base, vat, total: base + vat };
}

function catalogPriceMapFromSuppliers(suppliers: PedidoSupplier[]) {
  const m = new Map<string, number>();
  for (const s of suppliers) {
    for (const p of s.products) {
      m.set(p.id, p.pricePerUnit);
    }
  }
  return m;
}

function itemPriceDiffersFromCatalog(
  item: PedidoOrder['items'][number],
  catalogPriceByProductId: Map<string, number>,
) {
  if (!item.supplierProductId) return false;
  const cat = catalogPriceByProductId.get(item.supplierProductId);
  if (cat == null) return false;
  return Math.round((item.pricePerUnit - cat) * 100) / 100 !== 0;
}

function receivedOrderHasAttention(
  order: PedidoOrder,
  catalogPriceByProductId: Map<string, number>,
) {
  return order.items.some(
    (item) =>
      Boolean(item.incidentType) ||
      Boolean(item.incidentNotes?.trim()) ||
      itemPriceDiffersFromCatalog(item, catalogPriceByProductId),
  );
}

export default function PedidosPage() {
  const router = useRouter();
  const { localCode, localName, localId, email } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const [orders, setOrders] = React.useState<PedidoOrder[]>([]);
  const [catalogPriceByProductId, setCatalogPriceByProductId] = React.useState<Map<string, number>>(() => new Map());
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

  const [expandedSentId, setExpandedSentId] = React.useState<string | null>(null);
  const [expandedHistoricoId, setExpandedHistoricoId] = React.useState<string | null>(null);
  /** Marca visual por línea (varias a la vez); evita que un refetch parcial “borre” el estado al ir recibiendo. */
  const [quickLineMarks, setQuickLineMarks] = React.useState<Record<string, 'ok' | 'bad'>>({});

  const quickReceiveItem = (orderId: string, itemId: string, expectedQty: number, markOk: boolean) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const nextReceived = markOk ? expectedQty : 0;
    const nextIncidentType: PedidoOrder['items'][number]['incidentType'] = markOk ? null : 'missing';
    const nextIncidentNotes = markOk ? undefined : 'No recibido';

    setQuickLineMarks((prev) => ({ ...prev, [itemId]: markOk ? 'ok' : 'bad' }));

    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        const nextItems = order.items.map((item) => {
          if (item.id !== itemId) return item;
          return {
            ...item,
            receivedQuantity: nextReceived,
            incidentType: nextIncidentType,
            incidentNotes: nextIncidentNotes,
          };
        });
        return { ...order, items: nextItems };
      }),
    );

    void Promise.all([
      updateOrderItemReceived(supabase, localId, itemId, nextReceived),
      updateOrderItemIncident(supabase, localId, itemId, markOk ? { type: null, notes: '' } : { type: 'missing', notes: 'No recibido' }),
    ])
      .then(() => reloadOrders())
      .catch((err: Error) => {
        void reloadOrders();
        setMessage(err.message);
      });
  };

  const reloadOrders = React.useCallback(() => {
    if (!canUse || !localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchOrders(supabase, localId)
      .then((rows) => {
        setOrders(rows);
        // No machacar marcas con datos aún viejos del servidor (race: el fetch puede llegar antes que el update).
        setQuickLineMarks((prev) => {
          const next: Record<string, 'ok' | 'bad'> = {};
          for (const o of rows) {
            if (o.status !== 'sent') continue;
            for (const i of o.items) {
              const rq = Number(i.receivedQuantity);
              const qq = Number(i.quantity);
              const serverOk = qq > 0 && rq >= qq && !i.incidentType;
              const serverBad = Boolean(i.incidentType);
              if (serverOk) next[i.id] = 'ok';
              else if (serverBad) next[i.id] = 'bad';
              else if (prev[i.id]) next[i.id] = prev[i.id];
            }
          }
          return next;
        });
      })
      .catch((err: Error) => setMessage(err.message));
  }, [canUse, localId]);

  React.useEffect(() => {
    reloadOrders();
  }, [reloadOrders]);

  const reloadCatalog = React.useCallback(() => {
    if (!canUse || !localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchSuppliersWithProducts(supabase, localId)
      .then((rows) => setCatalogPriceByProductId(catalogPriceMapFromSuppliers(rows)))
      .catch(() => {
        /* catálogo opcional para colorear precio */
      });
  }, [canUse, localId]);

  React.useEffect(() => {
    reloadCatalog();
  }, [reloadCatalog]);

  React.useEffect(
    () => () => {
      if (deletedBannerTimeoutRef.current) window.clearTimeout(deletedBannerTimeoutRef.current);
    },
    [],
  );

  const sentOrders = orders.filter((row) => row.status === 'sent');
  const receivedOrders = orders.filter((row) => row.status === 'received');

  if (!hasPedidosEntry) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-black text-zinc-900">Modulo no habilitado</p>
        <p className="pt-1 text-sm text-zinc-600">Pedidos esta disponible para los locales de Mataro y Premia.</p>
      </section>
    );
  }
  if (!canUse) {
    return <PedidosPremiaLockedScreen />;
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
        <h1 className="text-center text-lg font-black text-zinc-900">PEDIDOS</h1>
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
          <Link href="/pedidos/historial-mes" className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-center text-sm font-semibold text-zinc-700 inline-block">
            Historial mes
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

      <section className="rounded-2xl bg-white p-4 text-center ring-1 ring-zinc-200">
        <p className="text-sm font-bold text-zinc-800">Pedidos enviados</p>
        <div className="mt-2 space-y-2">
          {sentOrders.length === 0 ? <p className="text-sm text-zinc-500">No hay pedidos enviados.</p> : null}
          {sentOrders.map((order) => (
            <div
              key={order.id}
              className="rounded-xl bg-amber-100 p-3 text-center ring-2 ring-amber-300/90 shadow-sm"
            >
              <button
                type="button"
                onClick={() => setExpandedSentId((prev) => (prev === order.id ? null : order.id))}
                className="w-full rounded-xl py-1 text-center outline-none focus-visible:ring-2 focus-visible:ring-amber-600/40 active:bg-amber-200/60"
                aria-expanded={expandedSentId === order.id}
              >
                {(() => {
                  const totals = totalsWithVat(order);
                  return (
                    <>
                      <p className="text-sm font-semibold text-zinc-900">{order.supplierName}</p>
                      <p className="text-xs text-zinc-500">
                        enviado {order.sentAt ? new Date(order.sentAt).toLocaleDateString('es-ES') : '-'}
                      </p>
                      {order.deliveryDate ? (
                        <p className="text-xs text-zinc-500">
                          Entrega: {new Date(`${order.deliveryDate}T00:00:00`).toLocaleDateString('es-ES')}
                        </p>
                      ) : null}
                      <p className="pt-1 text-sm font-bold text-zinc-700">
                        Total (IVA incluido):{' '}
                        <span className="text-base font-black text-zinc-900">{totals.total.toFixed(2)} €</span>
                      </p>
                      <p className="pt-2 text-[10px] font-semibold uppercase tracking-wide text-amber-900/70">
                        Toca para {expandedSentId === order.id ? 'ocultar' : 'ver'} detalle
                      </p>
                    </>
                  );
                })()}
              </button>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedSentId((prev) => (prev === order.id ? null : order.id))}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-center text-xs font-semibold text-[#2563EB]"
                >
                  {expandedSentId === order.id ? 'Ocultar detalle' : 'Ver detalle'}
                </button>
                <button
                  type="button"
                  onClick={() => sendWhatsappOrder(order)}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-center text-xs font-semibold text-[#166534]"
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
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-center text-xs font-semibold text-[#B91C1C]"
                >
                  Eliminar
                </button>
              </div>
              {expandedSentId === order.id ? (
                <div className="mt-3 space-y-3 text-left">
                  {order.notes?.trim() ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900/80">Notas del pedido</p>
                      <p className="mt-1 text-sm leading-relaxed text-amber-950">{order.notes.trim()}</p>
                    </div>
                  ) : null}
                  {order.deliveryDate ? (
                    <p className="text-xs text-zinc-600">
                      Entrega prevista:{' '}
                      {new Date(`${order.deliveryDate}T00:00:00`).toLocaleDateString('es-ES')}
                    </p>
                  ) : null}
                  {order.items.map((item) => {
                    const incidentText = formatIncidentLine(item);
                    const mark = quickLineMarks[item.id];
                    const isOk =
                      mark === 'ok' ||
                      (mark === undefined &&
                        item.receivedQuantity >= item.quantity &&
                        item.quantity > 0 &&
                        !item.incidentType);
                    const isBad = mark === 'bad' || (mark === undefined && Boolean(item.incidentType));
                    return (
                      <div key={item.id} className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-zinc-200">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-zinc-900">{item.productName}</p>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => quickReceiveItem(order.id, item.id, item.quantity, true)}
                              className={[
                                'grid h-7 w-7 place-items-center rounded-full border text-sm font-black',
                                isOk ? 'border-[#16A34A] bg-[#16A34A] text-white' : 'border-zinc-300 bg-white text-zinc-400',
                              ].join(' ')}
                              title="Recibido OK"
                              aria-label="Recibido OK"
                            >
                              {'\u2713'}
                            </button>
                            <button
                              type="button"
                              onClick={() => quickReceiveItem(order.id, item.id, item.quantity, false)}
                              className={[
                                'grid h-7 w-7 place-items-center rounded-full border text-sm font-black',
                                isBad ? 'border-[#B91C1C] bg-[#B91C1C] text-white' : 'border-zinc-300 bg-white text-zinc-400',
                              ].join(' ')}
                              title="Marcar incidencia"
                              aria-label="Marcar incidencia"
                            >
                              {'\u2715'}
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-zinc-700">
                          Pedido:{' '}
                          <span className="font-semibold text-zinc-900">
                            {formatQuantityWithUnit(item.quantity, item.unit)}
                          </span>
                        </p>
                        <p className="text-xs text-zinc-700">
                          Recibido:{' '}
                          <span className="font-semibold text-zinc-900">
                            {formatQuantityWithUnit(item.receivedQuantity, item.unit)}
                          </span>
                        </p>
                        <p className="text-xs text-zinc-600">
                          Precio: {item.pricePerUnit.toFixed(2)} €/{unitPriceCatalogSuffix[item.unit]} · Subt.{' '}
                          {item.lineTotal.toFixed(2)} €
                        </p>
                        {incidentText ? (
                          <p className="text-xs font-semibold text-[#B91C1C]">Incidencia: {incidentText}</p>
                        ) : null}
                        {unitSupportsReceivedWeightKg(item.unit) &&
                        item.receivedWeightKg != null &&
                        item.receivedWeightKg > 0 ? (
                          <p className="text-xs text-zinc-700">
                            Peso báscula:{' '}
                            <span className="font-semibold">{item.receivedWeightKg.toFixed(3)} kg</span>
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 text-center ring-1 ring-zinc-200">
        <p className="text-sm font-bold text-zinc-800">Historico recibido</p>
        <div className="mt-2 space-y-2">
          {receivedOrders.length === 0 ? <p className="text-sm text-zinc-500">No hay pedidos recibidos.</p> : null}
          {receivedOrders.map((order) => {
            const needsAttention = receivedOrderHasAttention(order, catalogPriceByProductId);
            const cardTone = needsAttention
              ? 'bg-red-100 ring-2 ring-red-400/90'
              : 'bg-green-100 ring-2 ring-green-500/80';
            return (
            <div key={order.id} className={`rounded-xl p-3 text-center shadow-sm ${cardTone}`}>
              <button
                type="button"
                onClick={() => setExpandedHistoricoId((prev) => (prev === order.id ? null : order.id))}
                className="w-full rounded-xl py-1 text-center outline-none focus-visible:ring-2 focus-visible:ring-green-700/30 active:opacity-90"
                aria-expanded={expandedHistoricoId === order.id}
              >
                {(() => {
                  const totals = totalsWithVat(order);
                  return (
                    <>
                      <p className="text-sm font-semibold text-zinc-900">{order.supplierName}</p>
                      <p className="text-xs text-zinc-500">
                        recibido {order.receivedAt ? new Date(order.receivedAt).toLocaleDateString('es-ES') : '-'}
                      </p>
                      <p className="pt-1 text-sm font-bold text-zinc-700">
                        Total (IVA incluido):{' '}
                        <span className="text-base font-black text-zinc-900">{totals.total.toFixed(2)} €</span>
                      </p>
                      <p className="pt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                        Toca para {expandedHistoricoId === order.id ? 'ocultar' : 'ver'} detalle
                      </p>
                    </>
                  );
                })()}
              </button>
              {needsAttention ? (
                <p className="mt-2 text-xs font-semibold text-red-800">
                  Incidencia o precio distinto al catálogo en alguna línea
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedHistoricoId((prev) => (prev === order.id ? null : order.id))}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-center text-xs font-semibold text-[#2563EB]"
                >
                  {expandedHistoricoId === order.id ? 'Ocultar detalle' : 'Ver detalle'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!localId) return;
                    const ok = window.confirm(
                      '¿Devolver este pedido a «Pedidos enviados»? El pedido volverá a pendientes de recepción (las líneas no se borran).',
                    );
                    if (!ok) return;
                    const supabase = getSupabaseClient();
                    if (!supabase) return;
                    void reopenReceivedOrderToSent(supabase, localId, order.id)
                      .then(() => {
                        setMessage('Pedido devuelto a enviados.');
                        void reloadOrders();
                      })
                      .catch((err: Error) => setMessage(err.message));
                  }}
                  className="rounded-lg border border-amber-600/70 bg-amber-50 px-2 py-1.5 text-center text-xs font-semibold text-amber-900"
                >
                  Volver a enviados
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
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-center text-xs font-semibold text-[#B91C1C]"
                >
                  Eliminar
                </button>
              </div>
              {expandedHistoricoId === order.id ? (
                <div className="mt-3 space-y-3 text-left">
                  {order.notes?.trim() ? (
                    <div className="rounded-xl border border-green-200 bg-white px-3 py-2.5 ring-1 ring-green-100">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-green-900/80">Notas del pedido</p>
                      <p className="mt-1 text-sm leading-relaxed text-zinc-900">{order.notes.trim()}</p>
                    </div>
                  ) : null}
                  {order.items.map((item) => {
                    const inc = Boolean(item.incidentType) || Boolean(item.incidentNotes?.trim());
                    const isBad = inc || item.receivedQuantity < item.quantity;
                    const isOk = !isBad && item.receivedQuantity >= item.quantity && item.quantity > 0;
                    const incidentText = formatIncidentLine(item);
                    return (
                      <div key={item.id} className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-zinc-900">{item.productName}</p>
                          <div className="flex shrink-0 items-center gap-2">
                            <span
                              className={[
                                'grid h-7 w-7 place-items-center rounded-full border text-sm font-black',
                                isOk
                                  ? 'border-[#16A34A] bg-[#16A34A] text-white'
                                  : isBad
                                    ? 'border-[#B91C1C] bg-[#B91C1C] text-white'
                                    : 'border-zinc-300 bg-white text-zinc-400',
                              ].join(' ')}
                              title={isOk ? 'Recibido OK' : isBad ? 'Incidencia o cantidad pendiente' : 'Parcial'}
                              aria-hidden
                            >
                              {isOk ? '\u2713' : isBad ? '\u2715' : '\u00B7'}
                            </span>
                            <span className="w-16 text-right text-xs font-semibold tabular-nums text-zinc-900">
                              {item.pricePerUnit.toFixed(2)} €
                            </span>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-zinc-700">
                          Pedido:{' '}
                          <span className="font-semibold text-zinc-900">
                            {formatQuantityWithUnit(item.quantity, item.unit)}
                          </span>
                        </p>
                        <p className="text-xs text-zinc-700">
                          Recibido:{' '}
                          <span className="font-semibold text-zinc-900">
                            {formatQuantityWithUnit(item.receivedQuantity, item.unit)}
                          </span>
                        </p>
                        <p className="text-xs text-zinc-600">
                          Precio recepción: {item.pricePerUnit.toFixed(2)} €/{unitPriceCatalogSuffix[item.unit]} · Subt.{' '}
                          {item.lineTotal.toFixed(2)} €
                        </p>
                        {incidentText ? (
                          <p className="mt-1 text-xs font-semibold text-[#B91C1C]">Incidencia: {incidentText}</p>
                        ) : null}
                        {unitSupportsReceivedWeightKg(item.unit) &&
                        item.receivedWeightKg != null &&
                        item.receivedWeightKg > 0 ? (
                          <p className="mt-1 text-xs text-zinc-800">
                            Peso báscula:{' '}
                            <span className="font-semibold">{item.receivedWeightKg.toFixed(3)} kg</span>
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
