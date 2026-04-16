'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { usePedidosOrders } from '@/components/PedidosOrdersProvider';
import { CHEF_ONE_TAPER_LINE_CLASS } from '@/components/ChefOneGlowLine';
import { getSupabaseClient } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { dispatchPedidosDataChanged } from '@/hooks/usePedidosDataChangedListener';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { formatQuantityWithUnit, unitPriceCatalogSuffix } from '@/lib/pedidos-format';
import {
  billingQuantityForReceptionPrice,
  persistReceptionItemTotals,
  receptionLineTotals,
  setOrderPriceReviewArchived,
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

function parsePricePerKg(raw: string): number | null | 'invalid' {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return Math.round(n * 10000) / 10000;
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
  const { orders: allOrders, setOrders, reloadOrders, clearPendingReceivedOrder } = usePedidosOrders();
  const orders = React.useMemo(
    () => allOrders.filter((row) => row.status === 'sent' || row.status === 'received'),
    [allOrders],
  );
  const [message, setMessage] = React.useState<string | null>(null);
  const [priceInputByItemId, setPriceInputByItemId] = React.useState<Record<string, string>>({});
  const [weightInputByItemId, setWeightInputByItemId] = React.useState<Record<string, string>>({});
  const [pricePerKgInputByItemId, setPricePerKgInputByItemId] = React.useState<Record<string, string>>({});
  const weightInputRef = React.useRef<Record<string, string>>({});
  weightInputRef.current = weightInputByItemId;
  const priceInputRef = React.useRef<Record<string, string>>({});
  priceInputRef.current = priceInputByItemId;
  const pricePerKgInputRef = React.useRef<Record<string, string>>({});
  pricePerKgInputRef.current = pricePerKgInputByItemId;

  const getLinePrice = React.useCallback((item: PedidoOrder['items'][number]) => {
    const raw = priceInputRef.current[item.id];
    const parsed = raw == null ? item.pricePerUnit : Number(raw.replace(',', '.'));
    return Number.isNaN(parsed) || parsed < 0 ? item.pricePerUnit : Math.round(parsed * 100) / 100;
  }, []);
  const [incidentOpenByOrderId, setIncidentOpenByOrderId] = React.useState<Record<string, boolean>>({});
  const [incidentNoteByOrderId, setIncidentNoteByOrderId] = React.useState<Record<string, string>>({});
  const [expandedPendingOrderId, setExpandedPendingOrderId] = React.useState<string | null>(null);
  const [archivedAccordionOpen, setArchivedAccordionOpen] = React.useState(true);
  const [expandedArchivedOrderId, setExpandedArchivedOrderId] = React.useState<string | null>(null);
  const focusOrderIdFromUrl = searchParams.get('orderId') ?? '';
  const focusOrderAppliedRef = React.useRef(false);

  React.useEffect(() => {
    focusOrderAppliedRef.current = false;
  }, [focusOrderIdFromUrl]);

  React.useEffect(() => {
    if (!focusOrderIdFromUrl || focusOrderAppliedRef.current) return;
    const o = orders.find((x) => x.id === focusOrderIdFromUrl);
    if (!o) return;
    focusOrderAppliedRef.current = true;
    setExpandedPendingOrderId(focusOrderIdFromUrl);
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

  const flushOrderPricesToDatabase = async (order: PedidoOrder) => {
    if (!localId) throw new Error('Sin local.');
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase no disponible.');
    await Promise.all(
      order.items.map(async (item) => {
        const price = getLinePrice(item);
        const rawPpk = pricePerKgInputRef.current[item.id];
        let ppkMerge: number | null = item.receivedPricePerKg ?? null;
        if (rawPpk !== undefined) {
          if (rawPpk.trim() === '') ppkMerge = null;
          else {
            const n = Number(rawPpk.replace(',', '.'));
            ppkMerge = Number.isFinite(n) && n > 0 ? Math.round(n * 10000) / 10000 : null;
          }
        }
        const merged = {
          ...item,
          pricePerUnit: price,
          ...(unitSupportsReceivedWeightKg(item.unit) ? { receivedPricePerKg: ppkMerge } : {}),
        };
        if (unitCanDeclareScaleKgOnReception(item.unit)) {
          await persistReceptionItemTotals(supabase, localId, merged);
        } else {
          await updateOrderItemPrice(supabase, localId, item.id, price, billingQuantityForReceptionPrice(merged));
        }
      }),
    );
    setPriceInputByItemId((prev) => {
      const next = { ...prev };
      for (const item of order.items) {
        next[item.id] = getLinePrice(item).toFixed(2);
      }
      return next;
    });
    setPricePerKgInputByItemId((prev) => {
      const next = { ...prev };
      for (const item of order.items) {
        if (unitSupportsReceivedWeightKg(item.unit)) delete next[item.id];
      }
      return next;
    });
    dispatchPedidosDataChanged();
  };

  const markPriceReviewArchived = async (orderId: string, archived: boolean) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    clearPendingReceivedOrder(orderId);
    const optimisticTs = archived ? new Date().toISOString() : undefined;
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        if (archived && optimisticTs) {
          return { ...o, priceReviewArchivedAt: optimisticTs };
        }
        return { ...o, priceReviewArchivedAt: undefined };
      }),
    );
    if (archived) {
      setArchivedAccordionOpen(true);
      setExpandedArchivedOrderId(orderId);
    } else {
      setExpandedArchivedOrderId((cur) => (cur === orderId ? null : cur));
    }
    try {
      await setOrderPriceReviewArchived(supabase, localId, orderId, archived);
      setMessage(
        archived ? 'Pedido archivado de la revisión de precios.' : 'Pedido de nuevo en pendientes de revisión.',
      );
      void reloadOrders();
      dispatchPedidosDataChanged();
    } catch (err: unknown) {
      void reloadOrders();
      setMessage(err instanceof Error ? err.message : 'Error al actualizar.');
    }
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

    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        const nextItems = order.items.map((item) => {
          if (item.id !== itemId) return item;
          const merged = {
            ...item,
            pricePerUnit: nextPrice,
            ...(unitSupportsReceivedWeightKg(item.unit) ? { receivedPricePerKg: null } : {}),
          };
          const { lineTotal, effectivePricePerUnit } = receptionLineTotals(merged);
          return { ...merged, pricePerUnit: effectivePricePerUnit, lineTotal };
        });
        return { ...order, items: nextItems };
      }),
    );

    setPricePerKgInputByItemId((prev) => {
      const orderSnap = orders.find((o) => o.id === orderId);
      const itemSnap = orderSnap?.items.find((i) => i.id === itemId);
      if (!itemSnap || !unitSupportsReceivedWeightKg(itemSnap.unit)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });

    const orderSnap = orders.find((o) => o.id === orderId);
    const itemSnap = orderSnap?.items.find((i) => i.id === itemId);
    if (!itemSnap) return;

    const merged = {
      ...itemSnap,
      pricePerUnit: nextPrice,
      ...(unitSupportsReceivedWeightKg(itemSnap.unit) ? { receivedPricePerKg: null } : {}),
    };

    void (unitCanDeclareScaleKgOnReception(itemSnap.unit)
      ? persistReceptionItemTotals(supabase, localId, merged)
      : updateOrderItemPrice(
          supabase,
          localId,
          itemId,
          nextPrice,
          billingQuantityForReceptionPrice(merged),
        )
    )
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
          const merged = { ...item, pricePerUnit: nextPrice };
          const { lineTotal, effectivePricePerUnit } = receptionLineTotals(merged);
          return { ...merged, pricePerUnit: effectivePricePerUnit, lineTotal };
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

  const commitPricePerKgInput = (orderId: string, itemId: string) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const raw = pricePerKgInputByItemId[itemId];
    if (raw === undefined) return;
    const parsed = parsePricePerKg(raw);
    if (parsed === 'invalid') {
      setMessage('€/kg inválido.');
      return;
    }

    const orderSnap = orders.find((o) => o.id === orderId);
    const itemSnap = orderSnap?.items.find((i) => i.id === itemId);
    if (!itemSnap || !unitSupportsReceivedWeightKg(itemSnap.unit)) return;

    if (parsed != null && (itemSnap.receivedWeightKg == null || itemSnap.receivedWeightKg <= 0)) {
      setMessage('Indica primero los kg reales para aplicar €/kg.');
      return;
    }

    const merged = {
      ...itemSnap,
      receivedPricePerKg: parsed,
    };

    void (async () => {
      try {
        await persistReceptionItemTotals(supabase, localId, merged);
        const { lineTotal, effectivePricePerUnit } = receptionLineTotals(merged);
        setOrders((prev) =>
          prev.map((order) => {
            if (order.id !== orderId) return order;
            return {
              ...order,
              items: order.items.map((item) =>
                item.id === itemId
                  ? { ...merged, pricePerUnit: effectivePricePerUnit, lineTotal }
                  : item,
              ),
            };
          }),
        );
        setPriceInputByItemId((prev) => ({ ...prev, [itemId]: effectivePricePerUnit.toFixed(2) }));
        setPricePerKgInputByItemId((prev) => {
          const next = { ...prev };
          if (parsed == null) delete next[itemId];
          else next[itemId] = String(parsed);
          return next;
        });
        setMessage(null);
        dispatchPedidosDataChanged();
      } catch (err: unknown) {
        void reloadOrders();
        setMessage(err instanceof Error ? err.message : 'No se pudo guardar €/kg.');
      }
    })();
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
            await persistReceptionItemTotals(supabase, localId, {
              ...itemSnap,
              pricePerUnit: price,
              receivedWeightKg: null,
            });
          } else {
            await updateOrderItemReceivedWeightKg(supabase, localId, itemId, parsed);
            await updateOrderItemReceived(supabase, localId, itemId, parsed);
            await persistReceptionItemTotals(supabase, localId, {
              ...itemSnap,
              pricePerUnit: price,
              receivedWeightKg: parsed,
              receivedQuantity: parsed,
            });
          }
          setOrders((prev) =>
            prev.map((order) => {
              if (order.id !== orderId) return order;
              return {
                ...order,
                items: order.items.map((item) => {
                  if (item.id !== itemId) return item;
                  if (parsed == null) {
                    const merged = { ...item, pricePerUnit: price, receivedWeightKg: null };
                    const { lineTotal, effectivePricePerUnit } = receptionLineTotals(merged);
                    return { ...merged, pricePerUnit: effectivePricePerUnit, lineTotal };
                  }
                  const merged = {
                    ...item,
                    pricePerUnit: price,
                    receivedWeightKg: parsed,
                    receivedQuantity: parsed,
                  };
                  const { lineTotal, effectivePricePerUnit } = receptionLineTotals(merged);
                  return { ...merged, pricePerUnit: effectivePricePerUnit, lineTotal };
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

    void (async () => {
      try {
        const nextWeight = parsed == null ? null : parsed;
        const nextPpk = nextWeight == null ? null : itemSnap.receivedPricePerKg ?? null;
        const merged = {
          ...itemSnap,
          receivedWeightKg: nextWeight,
          receivedPricePerKg: nextPpk,
        };
        await persistReceptionItemTotals(supabase, localId, merged);
        const { lineTotal, effectivePricePerUnit } = receptionLineTotals(merged);
        setOrders((prev) =>
          prev.map((order) => {
            if (order.id !== orderId) return order;
            return {
              ...order,
              items: order.items.map((item) =>
                item.id === itemId
                  ? { ...merged, pricePerUnit: effectivePricePerUnit, lineTotal }
                  : item,
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
        if (parsed == null) {
          setPricePerKgInputByItemId((prev) => {
            const next = { ...prev };
            delete next[itemId];
            return next;
          });
        }
        setPriceInputByItemId((prev) => ({ ...prev, [itemId]: effectivePricePerUnit.toFixed(2) }));
        dispatchPedidosDataChanged();
      } catch (err: unknown) {
        void reloadOrders();
        setMessage(err instanceof Error ? err.message : 'No se pudo guardar el peso.');
      }
    })();
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
      <section>
        <Link
          href="/pedidos"
          className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700"
        >
          ← Atras
        </Link>
      </section>

      <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200">
        <div className="border-b border-zinc-200 bg-gradient-to-r from-zinc-100 to-zinc-50 px-4 py-4 text-center">
          <h1 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-800">
            Pendientes de revisión de precios
          </h1>
        </div>
        <div className="space-y-3 p-4">
          {message ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-950 ring-1 ring-amber-200/80">
              {message}
            </p>
          ) : null}
          {pendingPriceReviewOrders.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">No hay pedidos pendientes de revisión.</p>
          ) : null}
          {pendingPriceReviewOrders.map((order) => {
            const orderIncidentMode =
              Boolean(incidentOpenByOrderId[order.id]) || orderHasAnyIncident(order);
            const expanded = expandedPendingOrderId === order.id;
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
                  className={`mx-auto mt-2 w-20 ${CHEF_ONE_TAPER_LINE_CLASS}`}
                  aria-hidden
                />
                <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">
                  Pedido {new Date(order.createdAt).toLocaleDateString('es-ES')}
                </p>
                {order.status === 'received' ? (
                  <p className="mt-2 max-w-[95%] rounded-lg bg-amber-100 px-2 py-1.5 text-[10px] font-bold uppercase leading-snug tracking-wide text-amber-950 ring-1 ring-amber-300/80">
                    Recibido desde Pedidos: falta cotejar precios. Ajusta aquí si el albarán no coincide; luego pulsa
                    «revisado» para archivar en la parte inferior.
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => setExpandedPendingOrderId((id) => (id === order.id ? null : order.id))}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-700"
                  aria-expanded={expanded}
                >
                  {expanded ? 'Ocultar detalle' : 'Ver detalle'}
                  <ChevronDown
                    className={['h-4 w-4 transition-transform', expanded ? 'rotate-180' : ''].join(' ')}
                    aria-hidden
                  />
                </button>
              </div>
              {expanded ? (
              <>
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
                      {item.basePricePerUnit != null && Number.isFinite(item.basePricePerUnit) ? (
                        <p className="text-xs text-zinc-600">
                          Precio base (pedido):{' '}
                          <span className="font-semibold text-zinc-800">
                            {item.basePricePerUnit.toFixed(2)} €/{unitPriceCatalogSuffix[item.unit]}
                          </span>
                        </p>
                      ) : null}
                      <p className="text-xs text-zinc-700">
                        Precio albarán:{' '}
                        <span className="font-bold text-zinc-900">
                          {item.pricePerUnit.toFixed(2)} €/{unitPriceCatalogSuffix[item.unit]}
                        </span>
                      </p>
                      {item.basePricePerUnit != null &&
                      Number.isFinite(item.basePricePerUnit) &&
                      Math.abs(item.pricePerUnit - item.basePricePerUnit) > 0.005 ? (
                        <p className="text-xs font-semibold text-amber-900">
                          Variación:{' '}
                          {item.pricePerUnit >= item.basePricePerUnit ? '+' : ''}
                          {(item.pricePerUnit - item.basePricePerUnit).toFixed(2)} €
                          {item.basePricePerUnit > 0
                            ? ` (${item.pricePerUnit >= item.basePricePerUnit ? '+' : ''}${((((item.pricePerUnit - item.basePricePerUnit) / item.basePricePerUnit) * 100)).toFixed(1)} %)`
                            : ''}
                        </p>
                      ) : null}
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
                      {unitSupportsReceivedWeightKg(item.unit) ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <label className="text-xs font-semibold text-zinc-600">€/kg real</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            autoCorrect="off"
                            placeholder="Ej: 3,45"
                            value={
                              pricePerKgInputByItemId[item.id] ??
                              (item.receivedPricePerKg != null ? String(item.receivedPricePerKg) : '')
                            }
                            onChange={(e) =>
                              setPricePerKgInputByItemId((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            onBlur={() => commitPricePerKgInput(order.id, item.id)}
                            className="h-8 w-14 max-w-[5.5rem] shrink-0 rounded-lg border border-zinc-300 bg-white px-1.5 py-1 text-xs font-semibold text-zinc-900 outline-none sm:w-[5rem]"
                          />
                          {item.receivedPricePerKg != null && item.receivedPricePerKg > 0 ? (
                            <span className="text-xs text-zinc-500">
                              Subtotal = kg × €/kg; equiv.{' '}
                              {item.pricePerUnit.toFixed(2)} €/{unitPriceCatalogSuffix[item.unit]}
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-500">
                              Opcional: con kg reales, el importe sigue el albarán por peso.
                            </span>
                          )}
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
              <div className="mt-4 border-t border-zinc-200/90 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !window.confirm(
                        '¿Archivar este pedido de la revisión de precios? Pasará al acordeón inferior (sigue en Pedidos enviados). No marca el pedido como recibido.',
                      )
                    ) {
                      return;
                    }
                    void (async () => {
                      const latest = orders.find((o) => o.id === order.id);
                      if (!latest || !localId) return;
                      setMessage('Guardando precios…');
                      try {
                        await flushOrderPricesToDatabase(latest);
                        setMessage(null);
                        await markPriceReviewArchived(order.id, true);
                      } catch (err: unknown) {
                        setMessage(
                          err instanceof Error ? err.message : 'No se pudieron guardar los precios del pedido.',
                        );
                        void reloadOrders();
                      }
                    })();
                  }}
                  className="w-full rounded-xl border border-amber-600/80 bg-amber-50 py-3 text-center text-sm font-bold text-amber-950 shadow-sm"
                >
                  revisado
                </button>
              </div>
              </>
              ) : null}
            </div>
            );
          })}
          {archivedPriceReviewOrders.length > 0 ? (
            <details
              className="group mt-8 border-t border-zinc-200 pt-4"
              open={archivedAccordionOpen}
              onToggle={(e) => setArchivedAccordionOpen(e.currentTarget.open)}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl bg-zinc-100/90 px-3 py-2.5 text-left ring-1 ring-zinc-200 [&::-webkit-details-marker]:hidden">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-600">
                    Archivados · revisión de precios
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {archivedPriceReviewOrders.length} pedido
                    {archivedPriceReviewOrders.length === 1 ? '' : 's'} · toca para plegar o desplegar
                  </p>
                </div>
                <span
                  className="shrink-0 text-lg font-light text-zinc-400 transition-transform group-open:rotate-90"
                  aria-hidden
                >
                  ›
                </span>
              </summary>
              <div className="mt-3 space-y-2">
                <p className="text-center text-[11px] text-zinc-500">
                  Toca el proveedor o la fecha para ver líneas del pedido. «Volver a pendientes» reabre arriba.
                </p>
                {archivedPriceReviewOrders.map((order) => {
                  const expanded = expandedArchivedOrderId === order.id;
                  return (
                    <div key={order.id} className="overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200">
                      <div className="flex flex-wrap items-stretch gap-2 p-3">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedArchivedOrderId((id) => (id === order.id ? null : order.id))
                          }
                          className="min-w-0 flex-1 rounded-lg text-left outline-none ring-[#D32F2F] focus-visible:ring-2"
                        >
                          <p className="text-sm font-semibold text-zinc-900">{order.supplierName}</p>
                          <p className="text-xs text-zinc-500">
                            Pedido {new Date(order.createdAt).toLocaleDateString('es-ES')}
                            {expanded ? ' · ocultar detalle' : ' · ver detalle'}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => void markPriceReviewArchived(order.id, false)}
                          className="shrink-0 self-center rounded-lg border border-zinc-400 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800"
                        >
                          Volver a pendientes
                        </button>
                      </div>
                      {expanded ? (
                        <div className="space-y-2 border-t border-zinc-100 bg-zinc-50/90 px-3 py-3">
                          {order.items.map((item) => (
                            <div
                              key={item.id}
                              className="space-y-1 rounded-lg bg-white p-3 ring-1 ring-zinc-200"
                            >
                              <p className="text-sm font-semibold text-zinc-800">{item.productName}</p>
                              <p className="text-xs text-zinc-700">
                                Pedido:{' '}
                                <span className="font-bold text-zinc-900">
                                  {formatQuantityWithUnit(item.quantity, item.unit)}
                                </span>
                              </p>
                              {item.receivedWeightKg != null && item.receivedWeightKg > 0 ? (
                                <p className="text-xs text-zinc-600">
                                  Kg reales guardados: {item.receivedWeightKg.toFixed(3)} kg
                                </p>
                              ) : null}
                              {item.receivedPricePerKg != null && item.receivedPricePerKg > 0 ? (
                                <p className="text-xs text-zinc-600">
                                  €/kg real: {item.receivedPricePerKg.toFixed(4)} €/kg
                                </p>
                              ) : null}
                              {item.basePricePerUnit != null && Number.isFinite(item.basePricePerUnit) ? (
                                <p className="text-xs text-zinc-600">
                                  Precio base (pedido):{' '}
                                  <span className="font-semibold text-zinc-800">
                                    {item.basePricePerUnit.toFixed(2)} €/{unitPriceCatalogSuffix[item.unit]}
                                  </span>
                                </p>
                              ) : null}
                              <p className="text-xs text-zinc-700">
                                Precio albarán:{' '}
                                <span className="font-bold text-zinc-900">
                                  {item.pricePerUnit.toFixed(2)} €/{unitPriceCatalogSuffix[item.unit]}
                                </span>
                              </p>
                              {item.basePricePerUnit != null &&
                              Number.isFinite(item.basePricePerUnit) &&
                              Math.abs(item.pricePerUnit - item.basePricePerUnit) > 0.005 ? (
                                <p className="text-xs font-semibold text-amber-900">
                                  Variación:{' '}
                                  {item.pricePerUnit >= item.basePricePerUnit ? '+' : ''}
                                  {(item.pricePerUnit - item.basePricePerUnit).toFixed(2)} €
                                  {item.basePricePerUnit > 0
                                    ? ` (${item.pricePerUnit >= item.basePricePerUnit ? '+' : ''}${((((item.pricePerUnit - item.basePricePerUnit) / item.basePricePerUnit) * 100)).toFixed(1)} %)`
                                    : ''}
                                </p>
                              ) : null}
                              <p className="text-xs text-zinc-700">
                                Subt:{' '}
                                <span className="font-bold text-zinc-900">{item.lineTotal.toFixed(2)} €</span>
                              </p>
                              {item.incidentType || item.incidentNotes?.trim() ? (
                                <p className="text-[11px] font-semibold text-[#B91C1C]">
                                  Incidencia: {item.incidentNotes?.trim() || item.incidentType}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}
        </div>
      </section>

    </div>
  );
}
