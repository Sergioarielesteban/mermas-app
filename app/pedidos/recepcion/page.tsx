'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { dispatchPedidosDataChanged, usePedidosDataChangedListener } from '@/hooks/usePedidosDataChangedListener';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { formatQuantityWithUnit, unitPriceCatalogSuffix } from '@/lib/pedidos-format';
import {
  billingQuantityForLine,
  fetchOrders,
  setOrderPriceReviewArchived,
  setOrderStatus,
  unitCanDeclareScaleKgOnReception,
  unitSupportsReceivedWeightKg,
  updateOrderItemIncident,
  updateOrderItemPrice,
  updateOrderItemReceived,
  updateOrderItemReceivedWeightKg,
  type PedidoOrder,
} from '@/lib/pedidos-supabase';

function parseReceivedKg(raw: string): number | null | 'invalid' {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return Math.round(n * 1000) / 1000;
}

function orderHasAnyIncident(order: PedidoOrder): boolean {
  return order.items.some((i) => Boolean(i.incidentType) || Boolean(i.incidentNotes?.trim()));
}

/** Texto único para el pedido si varias líneas tenían la misma incidencia (o la primera nota). */
function draftIncidentNoteForOrder(order: PedidoOrder): string {
  const notes = order.items.map((i) => i.incidentNotes?.trim()).filter(Boolean) as string[];
  if (notes.length === 0) return '';
  const uniq = [...new Set(notes)];
  return uniq.join(' · ');
}

export default function RecepcionPedidosPage() {
  const searchParams = useSearchParams();
  const { localCode, localName, localId, email } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const [orders, setOrders] = React.useState<PedidoOrder[]>([]);
  const [supplierFilter, setSupplierFilter] = React.useState('all');
  const initialDateFilter = searchParams.get('date') ?? '';
  const [dateFilter, setDateFilter] = React.useState(initialDateFilter);
  const [message, setMessage] = React.useState<string | null>(null);
  const [priceInputByItemId, setPriceInputByItemId] = React.useState<Record<string, string>>({});
  const [weightInputByItemId, setWeightInputByItemId] = React.useState<Record<string, string>>({});
  const weightInputRef = React.useRef<Record<string, string>>({});
  weightInputRef.current = weightInputByItemId;
  const priceInputRef = React.useRef<Record<string, string>>({});
  priceInputRef.current = priceInputByItemId;

  const getLinePrice = React.useCallback((item: PedidoOrder['items'][number]) => {
    const raw = priceInputRef.current[item.id];
    const parsed = raw == null ? item.pricePerUnit : Number(raw.replace(',', '.'));
    return Number.isNaN(parsed) || parsed < 0 ? item.pricePerUnit : Math.round(parsed * 100) / 100;
  }, []);
  const [incidentOpenByOrderId, setIncidentOpenByOrderId] = React.useState<Record<string, boolean>>({});
  const [incidentNoteByOrderId, setIncidentNoteByOrderId] = React.useState<Record<string, string>>({});
  const [showReceivedBanner, setShowReceivedBanner] = React.useState(false);
  const receivedBannerTimeoutRef = React.useRef<number | null>(null);
  const focusOrderIdFromUrl = searchParams.get('orderId') ?? '';
  const focusOrderAppliedRef = React.useRef(false);

  React.useEffect(() => {
    focusOrderAppliedRef.current = false;
  }, [focusOrderIdFromUrl]);

  const reloadOrders = React.useCallback(() => {
    if (!canUse || !localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchOrders(supabase, localId)
      .then((rows) =>
        setOrders(rows.filter((row) => row.status === 'sent' || row.status === 'received')),
      )
      .catch((err: Error) => setMessage(err.message));
  }, [canUse, localId]);

  React.useEffect(() => {
    reloadOrders();
  }, [reloadOrders]);

  usePedidosDataChangedListener(reloadOrders, Boolean(hasPedidosEntry && canUse));

  React.useEffect(() => {
    if (!focusOrderIdFromUrl || focusOrderAppliedRef.current) return;
    const o = orders.find((x) => x.id === focusOrderIdFromUrl);
    if (!o) return;
    focusOrderAppliedRef.current = true;
    setDateFilter(o.createdAt.slice(0, 10));
    setSupplierFilter('all');
    setIncidentOpenByOrderId((prev) => ({ ...prev, [focusOrderIdFromUrl]: true }));
    setIncidentNoteByOrderId((prev) => ({
      ...prev,
      [focusOrderIdFromUrl]: prev[focusOrderIdFromUrl] ?? draftIncidentNoteForOrder(o),
    }));
  }, [orders, focusOrderIdFromUrl]);

  const pendingPriceReviewOrders = React.useMemo(
    () =>
      orders.filter(
        (o) =>
          (o.status === 'sent' || o.status === 'received') && !o.priceReviewArchivedAt,
      ),
    [orders],
  );
  const archivedPriceReviewOrders = React.useMemo(
    () =>
      orders.filter(
        (o) =>
          (o.status === 'sent' || o.status === 'received') && Boolean(o.priceReviewArchivedAt),
      ),
    [orders],
  );

  const supplierOptions = React.useMemo(() => {
    return Array.from(new Set(orders.map((o) => o.supplierName))).sort((a, b) => a.localeCompare(b));
  }, [orders]);

  const filteredOrders = React.useMemo(() => {
    return pendingPriceReviewOrders.filter((order) => {
      const bySupplier = supplierFilter === 'all' || order.supplierName === supplierFilter;
      const orderDate = order.createdAt.slice(0, 10);
      const byDate = !dateFilter || orderDate === dateFilter;
      return bySupplier && byDate;
    });
  }, [pendingPriceReviewOrders, supplierFilter, dateFilter]);

  const filteredArchivedOrders = React.useMemo(() => {
    return archivedPriceReviewOrders.filter((order) => {
      const bySupplier = supplierFilter === 'all' || order.supplierName === supplierFilter;
      const orderDate = order.createdAt.slice(0, 10);
      const byDate = !dateFilter || orderDate === dateFilter;
      return bySupplier && byDate;
    });
  }, [archivedPriceReviewOrders, supplierFilter, dateFilter]);

  const persistPackagingReceivedKg = React.useCallback(
    async (supabase: SupabaseClient, items: PedidoOrder['items']) => {
      const weights = weightInputRef.current;
      for (const item of items) {
        if (!unitSupportsReceivedWeightKg(item.unit)) continue;
        const wRaw = weights[item.id];
        if (wRaw === undefined) continue;
        const wp = parseReceivedKg(wRaw);
        if (wp === 'invalid') {
          throw new Error('Peso recibido (kg) inválido en una línea de bandeja o caja.');
        }
        await updateOrderItemReceivedWeightKg(supabase, localId!, item.id, wp);
      }
    },
    [localId],
  );

  const markAllReceived = (order: PedidoOrder) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void (async () => {
      try {
        for (const item of order.items) {
          const raw = priceInputRef.current[item.id];
          const parsed = raw == null ? item.pricePerUnit : Number(raw.replace(',', '.'));
          const nextPrice = Number.isNaN(parsed) || parsed < 0 ? item.pricePerUnit : Math.round(parsed * 100) / 100;

          let receivedQty = item.quantity;
          let weightKg: number | null = null;

          if (item.unit === 'kg') {
            const wRaw = weightInputRef.current[item.id];
            if (wRaw !== undefined) {
              const wp = parseReceivedKg(wRaw);
              if (wp === 'invalid') {
                setMessage('Peso recibido (kg) inválido en una línea de producto al peso.');
                return;
              }
              await updateOrderItemReceivedWeightKg(supabase, localId, item.id, wp);
              if (wp != null) {
                weightKg = wp;
                receivedQty = wp;
              } else {
                weightKg = null;
                receivedQty = item.quantity;
              }
            } else {
              await updateOrderItemReceivedWeightKg(supabase, localId, item.id, null);
              weightKg = null;
              receivedQty = item.quantity;
            }
          } else {
            if (unitSupportsReceivedWeightKg(item.unit)) {
              const wRaw = weightInputRef.current[item.id];
              if (wRaw !== undefined) {
                const wp = parseReceivedKg(wRaw);
                if (wp === 'invalid') {
                  setMessage('Peso recibido (kg) inválido en una línea de bandeja o caja.');
                  return;
                }
                await updateOrderItemReceivedWeightKg(supabase, localId, item.id, wp);
                weightKg = wp;
              }
            }
            receivedQty = item.quantity;
          }

          await updateOrderItemReceived(supabase, localId, item.id, receivedQty);
          const billingQty = billingQuantityForLine({
            unit: item.unit,
            receivedQuantity: receivedQty,
            receivedWeightKg: weightKg,
          });
          await updateOrderItemPrice(supabase, localId, item.id, nextPrice, billingQty);
        }

        await setOrderStatus(supabase, localId, order.id, 'received');
        setMessage('Pedido marcado como recibido.');
        setShowReceivedBanner(true);
        if (receivedBannerTimeoutRef.current) window.clearTimeout(receivedBannerTimeoutRef.current);
        receivedBannerTimeoutRef.current = window.setTimeout(() => {
          setShowReceivedBanner(false);
          receivedBannerTimeoutRef.current = null;
        }, 1000);
        await reloadOrders();
        dispatchPedidosDataChanged();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'No se pudo marcar recibido.');
      }
    })();
  };

  const markPriceReviewArchived = (orderId: string, archived: boolean) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void setOrderPriceReviewArchived(supabase, localId, orderId, archived)
      .then(() => {
        setMessage(
          archived ? 'Pedido archivado de la revisión de precios.' : 'Pedido de nuevo en pendientes de revisión.',
        );
        reloadOrders();
        dispatchPedidosDataChanged();
      })
      .catch((err: Error) => setMessage(err.message));
  };

  React.useEffect(
    () => () => {
      if (receivedBannerTimeoutRef.current) window.clearTimeout(receivedBannerTimeoutRef.current);
    },
    [],
  );

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

    let billingQty = 0;
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        const nextItems = order.items.map((item) => {
          if (item.id !== itemId) return item;
          billingQty = billingQuantityForLine(item);
          return {
            ...item,
            pricePerUnit: nextPrice,
            lineTotal: Math.round(nextPrice * billingQty * 100) / 100,
          };
        });
        return { ...order, items: nextItems };
      }),
    );

    void updateOrderItemPrice(supabase, localId, itemId, nextPrice, billingQty)
      .then(() => dispatchPedidosDataChanged())
      .catch((err: Error) => {
        void reloadOrders();
        setMessage(err.message);
      });
  };

  const setLocalUnitPrice = (orderId: string, itemId: string, rawValue: string) => {
    const parsed = Number(rawValue.replace(',', '.'));
    if (Number.isNaN(parsed) || parsed < 0) return;
    const nextPrice = Math.round(parsed * 100) / 100;
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        const nextItems = order.items.map((item) => {
          if (item.id !== itemId) return item;
          const bq = billingQuantityForLine(item);
          return { ...item, pricePerUnit: nextPrice, lineTotal: Math.round(nextPrice * bq * 100) / 100 };
        });
        return { ...order, items: nextItems };
      }),
    );
  };

  const commitPriceInput = (orderId: string, itemId: string) => {
    const orderSnap = orders.find((o) => o.id === orderId);
    const itemSnap = orderSnap?.items.find((i) => i.id === itemId);
    if (!itemSnap) return;
    const raw = priceInputByItemId[itemId] ?? itemSnap.pricePerUnit.toFixed(2);
    changeUnitPrice(orderId, itemId, raw);
    const parsed = Number(raw.replace(',', '.'));
    const normalized = Number.isNaN(parsed) || parsed < 0 ? '0.00' : (Math.round(parsed * 100) / 100).toFixed(2);
    setPriceInputByItemId((prev) => ({ ...prev, [itemId]: normalized }));
  };

  const commitWeightInput = (orderId: string, itemId: string) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const raw = weightInputByItemId[itemId];
    if (raw === undefined) return;
    const parsed = parseReceivedKg(raw);
    if (parsed === 'invalid') {
      setMessage('Peso recibido inválido.');
      return;
    }

    const orderSnap = orders.find((o) => o.id === orderId);
    const itemSnap = orderSnap?.items.find((i) => i.id === itemId);
    if (!itemSnap) return;

    if (itemSnap.unit === 'kg') {
      const price = getLinePrice(itemSnap);
      void (async () => {
        try {
          if (parsed == null) {
            await updateOrderItemReceivedWeightKg(supabase, localId, itemId, null);
            await updateOrderItemReceived(supabase, localId, itemId, itemSnap.receivedQuantity);
            await updateOrderItemPrice(supabase, localId, itemId, price, itemSnap.receivedQuantity);
          } else {
            await updateOrderItemReceivedWeightKg(supabase, localId, itemId, parsed);
            await updateOrderItemReceived(supabase, localId, itemId, parsed);
            await updateOrderItemPrice(supabase, localId, itemId, price, parsed);
          }
          setOrders((prev) =>
            prev.map((order) => {
              if (order.id !== orderId) return order;
              return {
                ...order,
                items: order.items.map((item) => {
                  if (item.id !== itemId) return item;
                  if (parsed == null) {
                    const lt = Math.round(price * item.receivedQuantity * 100) / 100;
                    return { ...item, receivedWeightKg: null, lineTotal: lt };
                  }
                  const lt = Math.round(price * parsed * 100) / 100;
                  return { ...item, receivedWeightKg: parsed, receivedQuantity: parsed, lineTotal: lt };
                }),
              };
            }),
          );
          setWeightInputByItemId((prev) => {
            const next = { ...prev };
            if (parsed == null) delete next[itemId];
            else next[itemId] = String(parsed);
            return next;
          });
          dispatchPedidosDataChanged();
        } catch (err: unknown) {
          void reloadOrders();
          setMessage(err instanceof Error ? err.message : 'No se pudo guardar el peso.');
        }
      })();
      return;
    }

    void updateOrderItemReceivedWeightKg(supabase, localId, itemId, parsed)
      .then(() => {
        setOrders((prev) =>
          prev.map((order) => {
            if (order.id !== orderId) return order;
            return {
              ...order,
              items: order.items.map((item) =>
                item.id === itemId ? { ...item, receivedWeightKg: parsed } : item,
              ),
            };
          }),
        );
        setWeightInputByItemId((prev) => {
          const next = { ...prev };
          if (parsed == null) delete next[itemId];
          else next[itemId] = String(parsed);
          return next;
        });
        dispatchPedidosDataChanged();
      })
      .catch((err: Error) => {
        void reloadOrders();
        setMessage(err.message);
      });
  };

  const toggleOrderIncidentPanel = (order: PedidoOrder) => {
    setIncidentOpenByOrderId((prev) => {
      const willOpen = !prev[order.id];
      if (willOpen) {
        setIncidentNoteByOrderId((n) => {
          if (n[order.id] !== undefined) return n;
          return { ...n, [order.id]: draftIncidentNoteForOrder(order) };
        });
      }
      return { ...prev, [order.id]: willOpen };
    });
  };

  const saveOrderIncident = (order: PedidoOrder) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const raw =
      incidentNoteByOrderId[order.id] ??
      (incidentOpenByOrderId[order.id] ? draftIncidentNoteForOrder(order) : '');
    const note = raw.trim();
    const nextIncidentType: PedidoOrder['items'][number]['incidentType'] = note ? 'damaged' : null;
    const nextIncidentNotes = note || undefined;

    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== order.id) return o;
        const nextItems = o.items.map((item) => ({
          ...item,
          incidentType: nextIncidentType,
          incidentNotes: nextIncidentNotes,
        }));
        return { ...o, items: nextItems };
      }),
    );

    void Promise.all(
      order.items.map((item) =>
        updateOrderItemIncident(supabase, localId, item.id, { type: note ? 'damaged' : null, notes: note }),
      ),
    )
      .then(() => dispatchPedidosDataChanged())
      .catch((err: Error) => {
        void reloadOrders();
        setMessage(err.message);
      });
  };

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
      {showReceivedBanner ? (
        <div className="pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-black/25 px-6">
          <div className="rounded-2xl bg-[#16A34A] px-7 py-5 text-center shadow-2xl ring-2 ring-white/75">
            <p className="text-xl font-black uppercase tracking-wide text-white">RECIBIDO</p>
          </div>
        </div>
      ) : null}
      <section>
        <Link
          href="/pedidos"
          className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700"
        >
          ← Atras
        </Link>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-center text-lg font-black text-zinc-900">RECEPCION</h1>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-sm font-semibold text-zinc-800">Pendientes revisión de precios</p>
        <p className="mt-1 text-xs text-zinc-500">
          Pedidos enviados y los dados a «Pendiente de recibir» desde Pedidos (mercancia anotada, precios sin tocar).
          Siguen aqui hasta que pulses «Revisado» tras cotejar con el albaran, o «Marcar todo recibido» si ajustas precios
          en esta pantalla. La fecha filtra la lista; dejala vacia para ver todos.
        </p>
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
          {filteredOrders.map((order) => {
            const orderIncidentMode =
              Boolean(incidentOpenByOrderId[order.id]) || orderHasAnyIncident(order);
            return (
            <div
              key={order.id}
              className={[
                'rounded-xl p-3 ring-1 transition-colors',
                orderIncidentMode ? 'bg-red-50 ring-2 ring-red-500 shadow-sm' : 'bg-zinc-50 ring-zinc-200',
              ].join(' ')}
            >
              <div className="flex flex-col items-center px-2 pb-1 text-center">
                <p className="max-w-[96%] text-sm font-semibold leading-snug tracking-tight text-zinc-900">
                  {order.supplierName}
                </p>
                <span
                  className="mt-2 block h-[2px] w-20 bg-gradient-to-r from-transparent via-[#D32F2F] to-transparent opacity-90"
                  aria-hidden
                />
                <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">
                  Pedido {new Date(order.createdAt).toLocaleDateString('es-ES')}
                </p>
                {order.status === 'received' ? (
                  <p className="mt-2 max-w-[95%] rounded-lg bg-amber-100 px-2 py-1.5 text-[10px] font-bold uppercase leading-snug tracking-wide text-amber-950 ring-1 ring-amber-300/80">
                    Pendiente de recibir: mercancia anotada. Ajusta aqui el precio si el albaran no coincide; luego
                    «Revisado» o «Marcar todo recibido».
                  </p>
                ) : null}
              </div>
              <div className="mt-3 space-y-2">
                {order.items.map((item) => (
                    <div key={item.id} className="space-y-1.5 rounded-lg bg-white p-3 ring-1 ring-zinc-200">
                      <p className="text-sm font-semibold text-zinc-800">{item.productName}</p>
                      <p className="text-xs text-zinc-700">
                        Pedido:{' '}
                        <span className="font-bold text-zinc-900">
                          {formatQuantityWithUnit(item.quantity, item.unit)}
                        </span>
                      </p>
                      {unitSupportsReceivedWeightKg(item.unit) &&
                      item.estimatedKgPerUnit != null &&
                      item.estimatedKgPerUnit > 0 ? (
                        <p className="text-xs text-zinc-600">
                          Estimado pedido: {(item.quantity * item.estimatedKgPerUnit).toFixed(2)} kg (
                          {item.estimatedKgPerUnit.toFixed(2)} kg/{item.unit})
                          {item.receivedQuantity > 0
                            ? ` · referencia con ${item.unit === 'caja' ? 'cajas' : 'bandejas'} recibidas: ${(item.receivedQuantity * item.estimatedKgPerUnit).toFixed(2)} kg`
                            : ''}
                        </p>
                      ) : null}
                      <p className="text-xs text-zinc-700">
                        P/unit:{' '}
                        <span className="font-bold text-zinc-900">
                          {item.pricePerUnit.toFixed(2)} €/{unitPriceCatalogSuffix[item.unit]}
                        </span>
                      </p>
                      <p className="text-xs text-zinc-700">
                        Subt:{' '}
                        <span className="font-bold text-zinc-900">{item.lineTotal.toFixed(2)} €</span>
                      </p>
                      {unitCanDeclareScaleKgOnReception(item.unit) ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <label className="text-xs font-semibold text-zinc-600">Kg reales</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            autoCorrect="off"
                            placeholder="Ej: 12,5"
                            value={
                              weightInputByItemId[item.id] ??
                              (item.receivedWeightKg != null ? String(item.receivedWeightKg) : '')
                            }
                            onChange={(e) =>
                              setWeightInputByItemId((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            onBlur={() => commitWeightInput(order.id, item.id)}
                            className="h-8 w-[3.25rem] max-w-[3.25rem] shrink-0 rounded-lg border border-zinc-300 bg-white px-1.5 py-1 text-xs font-semibold text-zinc-900 outline-none sm:w-[4rem] sm:max-w-[4rem]"
                          />
                          {item.receivedWeightKg != null && item.receivedWeightKg > 0 ? (
                            <span className="text-xs text-zinc-500">
                              Guardado: {item.receivedWeightKg.toFixed(3)} kg
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="text-xs font-semibold text-zinc-600">Precio recibido</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={priceInputByItemId[item.id] ?? item.pricePerUnit.toFixed(2)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setPriceInputByItemId((prev) => ({ ...prev, [item.id]: raw }));
                            setLocalUnitPrice(order.id, item.id, raw);
                          }}
                          onBlur={() => commitPriceInput(order.id, item.id)}
                          className="h-10 w-20 rounded-lg border border-zinc-300 bg-white px-2 text-sm font-semibold text-zinc-900 outline-none"
                        />
                      </div>
                    </div>
                  ))}
              </div>
              <div className="mt-3 border-t border-red-200/70 pt-3">
                <button
                  type="button"
                  onClick={() => toggleOrderIncidentPanel(order)}
                  className={[
                    'w-full rounded-lg px-3 py-2.5 text-center text-xs font-bold text-white sm:w-auto',
                    incidentOpenByOrderId[order.id] || orderHasAnyIncident(order)
                      ? 'bg-[#991B1B] ring-2 ring-red-600'
                      : 'bg-[#B91C1C]',
                  ].join(' ')}
                >
                  {incidentOpenByOrderId[order.id] ? 'Ocultar nota de incidencia' : 'Incidencia'}
                </button>
                {incidentOpenByOrderId[order.id] ? (
                  <div className="mt-3 space-y-2 rounded-xl bg-red-100 p-3 ring-2 ring-red-400">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-red-900">
                      Nota para todo el pedido (se guarda en todas las lineas)
                    </p>
                    <textarea
                      value={
                        incidentNoteByOrderId[order.id] ??
                        (incidentOpenByOrderId[order.id] ? draftIncidentNoteForOrder(order) : '')
                      }
                      onChange={(e) =>
                        setIncidentNoteByOrderId((prev) => ({ ...prev, [order.id]: e.target.value }))
                      }
                      rows={3}
                      placeholder="Describe la incidencia del pedido..."
                      className="w-full rounded-lg border-2 border-red-400 bg-white px-2 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => saveOrderIncident(order)}
                        className="rounded-lg bg-[#B91C1C] px-3 py-2 text-xs font-semibold text-white"
                      >
                        Guardar incidencia
                      </button>
                      <button
                        type="button"
                        onClick={() => setIncidentOpenByOrderId((prev) => ({ ...prev, [order.id]: false }))}
                        className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-xs font-semibold text-zinc-800"
                      >
                        Cerrar sin guardar
                      </button>
                    </div>
                  </div>
                ) : null}
                {orderHasAnyIncident(order) &&
                draftIncidentNoteForOrder(order) &&
                !incidentOpenByOrderId[order.id] ? (
                  <p className="mt-2 text-xs font-semibold text-[#B91C1C]">
                    <span aria-hidden>{'\u{1F6A8}'}</span> Incidencia: {draftIncidentNoteForOrder(order)}
                  </p>
                ) : null}
              </div>
              <div className="mt-4 space-y-2 border-t border-zinc-200/90 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !window.confirm(
                        '¿Archivar este pedido de la lista de revisión de precios? Sigue en «Pedidos enviados» y en el histórico cuando lo recibas.',
                      )
                    ) {
                      return;
                    }
                    markPriceReviewArchived(order.id, true);
                  }}
                  className="w-full rounded-xl border border-amber-600/80 bg-amber-50 py-2.5 text-center text-xs font-bold text-amber-950"
                >
                  Revisado (quitar de esta lista)
                </button>
                <button
                  type="button"
                  onClick={() => markAllReceived(order)}
                  className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-b from-[#4ADE80] to-[#16A34A] py-3.5 text-center text-xs font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-emerald-900/25 ring-1 ring-white/25 transition active:scale-[0.98] active:shadow-md"
                >
                  Marcar todo recibido
                </button>
              </div>
            </div>
            );
          })}
          {filteredArchivedOrders.length > 0 ? (
            <div className="mt-8 space-y-2 border-t border-zinc-200 pt-6">
              <p className="text-center text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                Archivados (revisión de precios)
              </p>
              <p className="text-center text-xs text-zinc-500">
                Pedidos que quitaste de la bandeja con «Revisado». Siguen en la app; puedes devolverlos a pendientes.
              </p>
              {filteredArchivedOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-100/90 p-3 ring-1 ring-zinc-200"
                >
                  <div className="min-w-0 text-left">
                    <p className="text-sm font-semibold text-zinc-900">{order.supplierName}</p>
                    <p className="text-xs text-zinc-500">
                      Pedido {new Date(order.createdAt).toLocaleDateString('es-ES')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => markPriceReviewArchived(order.id, false)}
                    className="shrink-0 rounded-lg border border-zinc-400 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800"
                  >
                    Volver a pendientes
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
