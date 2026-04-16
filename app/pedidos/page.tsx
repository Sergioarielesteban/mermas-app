'use client';

import Link from 'next/link';
import { Bot, ChevronDown } from 'lucide-react';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { CHEF_ONE_TAPER_LINE_CLASS } from '@/components/ChefOneGlowLine';
import { usePedidosOrders } from '@/components/PedidosOrdersProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import MermasStyleHero from '@/components/MermasStyleHero';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { dispatchPedidosDataChanged, usePedidosDataChangedListener } from '@/hooks/usePedidosDataChangedListener';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import {
  formatIncidentLine,
  formatQuantityWithUnit,
  lineSubtotalForOrderListDisplay,
  totalsWithVatForOrderListDisplay,
  unitPriceCatalogSuffix,
} from '@/lib/pedidos-format';
import {
  readCatalogPricesSessionCache,
  writeCatalogPricesSessionCache,
} from '@/lib/pedidos-session-cache';
import {
  billingQuantityForReceptionPrice,
  billingQuantityForLine,
  deleteOrder,
  fetchSuppliersWithProducts,
  persistReceptionItemTotals,
  persistSentOrderAsReceived,
  receptionLineTotals,
  reopenReceivedOrderToSent,
  setOrderPriceReviewArchived,
  unitCanDeclareScaleKgOnReception,
  unitSupportsReceivedWeightKg,
  updateOrderItemIncident,
  updateOrderItemReceived,
  updateOrderItemReceivedWeightKg,
  updateOrderItemPrice,
  type PedidoOrder,
  type PedidoSupplier,
} from '@/lib/pedidos-supabase';
import { requestDeleteSecurityPin } from '@/lib/delete-security';

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
  return cleaned || 'CHEF-ONE MATARO';
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
    `Local: ${normalizeLocalForWhatsapp(localName || 'CHEF-ONE MATARO')}`,
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

function catalogPriceMapFromSuppliers(suppliers: PedidoSupplier[]) {
  const m = new Map<string, number>();
  for (const s of suppliers) {
    for (const p of s.products) {
      m.set(p.id, p.pricePerUnit);
    }
  }
  return m;
}

function receivedOrderHasAttention(order: PedidoOrder) {
  return order.items.some((item) => Boolean(item.incidentType) || Boolean(item.incidentNotes?.trim()));
}

/** Pie del histórico: un solo texto si todas las líneas con incidencia coinciden; si no, una línea por producto. */
function draftIncidentNoteForSentOrder(order: PedidoOrder, marks: Record<string, 'ok' | 'bad'>): string {
  const notes: string[] = [];
  for (const item of order.items) {
    const m = marks[item.id];
    const isBad = m === 'bad' || (m === undefined && Boolean(item.incidentType));
    if (isBad && item.incidentNotes?.trim()) notes.push(item.incidentNotes.trim());
  }
  const uniq = [...new Set(notes)];
  return uniq.join(' · ');
}

function historicoIncidentFooterText(order: PedidoOrder): string | null {
  const rows: { name: string; text: string }[] = [];
  for (const item of order.items) {
    const t = formatIncidentLine(item);
    if (t) rows.push({ name: item.productName, text: t });
  }
  if (rows.length === 0) return null;
  const unique = [...new Set(rows.map((r) => r.text))];
  if (unique.length === 1) return unique[0];
  return rows.map((r) => `${r.name}: ${r.text}`).join('\n');
}

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

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type AssistantPendingAction = {
  kind: 'update_price';
  orderId: string;
  itemId: string;
  productName: string;
  supplierName: string;
  previousPrice: number;
  nextPrice: number;
};

export default function PedidosPage() {
  const { localCode, localName, localId, email } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const {
    orders,
    setOrders,
    reloadOrders,
    releasePinOrderId,
    registerDeletedOrderId,
    registerPendingReceivedOrder,
    clearPendingReceivedOrder,
  } = usePedidosOrders();
  const [catalogPriceByProductId, setCatalogPriceByProductId] = React.useState<Map<string, number>>(() => new Map());
  const [message, setMessage] = React.useState<string | null>(null);
  const [showDeletedBanner, setShowDeletedBanner] = React.useState(false);
  const deletedBannerTimeoutRef = React.useRef<number | null>(null);
  const [priceInputByItemId, setPriceInputByItemId] = React.useState<Record<string, string>>({});
  const [weightInputByItemId, setWeightInputByItemId] = React.useState<Record<string, string>>({});
  const [pricePerKgInputByItemId, setPricePerKgInputByItemId] = React.useState<Record<string, string>>({});
  const priceInputRef = React.useRef<Record<string, string>>({});
  priceInputRef.current = priceInputByItemId;
  const weightInputRef = React.useRef<Record<string, string>>({});
  weightInputRef.current = weightInputByItemId;
  const pricePerKgInputRef = React.useRef<Record<string, string>>({});
  pricePerKgInputRef.current = pricePerKgInputByItemId;
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
    const text = encodeURIComponent(
      buildWhatsappOrderMessage(order, deliveryDate, localName ?? 'CHEF-ONE MATARO', requestedBy),
    );
    const url = `https://wa.me/${phone}?text=${text}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [email, localName]);

  const [expandedSentId, setExpandedSentId] = React.useState<string | null>(null);
  const [expandedHistoricoId, setExpandedHistoricoId] = React.useState<string | null>(null);
  const [pendientesEntregaAccordionOpen, setPendientesEntregaAccordionOpen] = React.useState(false);
  const [historicoRecibidosAccordionOpen, setHistoricoRecibidosAccordionOpen] = React.useState(false);
  /** Feedback visual al marcar recibido (el merge con réplica ya no revierte el estado). */
  const [receivingOrderId, setReceivingOrderId] = React.useState<string | null>(null);
  /** Marca visual por línea (varias a la vez); evita que un refetch parcial “borre” el estado al ir recibiendo. */
  const [quickLineMarks, setQuickLineMarks] = React.useState<Record<string, 'ok' | 'bad'>>({});
  const [incidentOpenBySentOrderId, setIncidentOpenBySentOrderId] = React.useState<Record<string, boolean>>({});
  const [incidentNoteBySentOrderId, setIncidentNoteBySentOrderId] = React.useState<Record<string, string>>({});
  const [assistantOpen, setAssistantOpen] = React.useState(false);
  const [assistantInput, setAssistantInput] = React.useState('');
  const [assistantReply, setAssistantReply] = React.useState<string | null>(null);
  const [assistantPendingAction, setAssistantPendingAction] = React.useState<AssistantPendingAction | null>(null);
  const [assistantListening, setAssistantListening] = React.useState(false);
  const assistantRecognitionRef = React.useRef<{
    stop: () => void;
  } | null>(null);

  const toggleSentIncidentPanel = (order: PedidoOrder) => {
    setIncidentOpenBySentOrderId((prev) => {
      const willOpen = !prev[order.id];
      if (willOpen) {
        setIncidentNoteBySentOrderId((n) => {
          if (n[order.id] !== undefined) return n;
          return { ...n, [order.id]: draftIncidentNoteForSentOrder(order, quickLineMarks) };
        });
      }
      return { ...prev, [order.id]: willOpen };
    });
  };

  const saveSentOrderIncident = (order: PedidoOrder) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const hasAnyBad = order.items.some((item) => {
      const m = quickLineMarks[item.id];
      return m === 'bad' || (m === undefined && Boolean(item.incidentType));
    });
    if (!hasAnyBad) {
      setMessage('Marca primero las lineas con problema (✗).');
      return;
    }
    const raw = (incidentNoteBySentOrderId[order.id] ?? '').trim();
    void Promise.all(
      order.items.map((item) => {
        const m = quickLineMarks[item.id];
        const isBad = m === 'bad' || (m === undefined && Boolean(item.incidentType));
        if (!isBad) return Promise.resolve();
        if (raw) {
          return updateOrderItemIncident(supabase, localId, item.id, {
            type: item.incidentType ?? 'missing',
            notes: raw,
          });
        }
        return updateOrderItemIncident(supabase, localId, item.id, { type: 'missing', notes: 'No recibido' });
      }),
    )
      .then(() => {
        setMessage('Incidencias guardadas.');
        setIncidentOpenBySentOrderId((prev) => ({ ...prev, [order.id]: false }));
        void reloadOrders();
        dispatchPedidosDataChanged();
      })
      .catch((err: Error) => {
        void reloadOrders();
        setMessage(err.message);
      });
  };

  const clearQuickReceive = (orderId: string, line: PedidoOrder['items'][number]) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const itemId = line.id;
    setQuickLineMarks((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        return {
          ...order,
          items: order.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  receivedQuantity: 0,
                  receivedWeightKg: item.unit === 'kg' ? null : item.receivedWeightKg,
                  incidentType: null,
                  incidentNotes: undefined,
                  lineTotal: 0,
                }
              : item,
          ),
        };
      }),
    );
    void Promise.all([
      updateOrderItemReceived(supabase, localId, itemId, 0),
      updateOrderItemIncident(supabase, localId, itemId, { type: null, notes: '' }),
    ])
      .then(async () => {
        if (line.unit === 'kg') {
          await updateOrderItemReceivedWeightKg(supabase, localId, itemId, null);
        }
        await updateOrderItemPrice(supabase, localId, itemId, line.pricePerUnit, 0);
      })
      .then(() => reloadOrders())
      .then(() => dispatchPedidosDataChanged())
      .catch((err: Error) => {
        void reloadOrders();
        setMessage(err.message);
      });
  };

  const quickReceiveItem = (orderId: string, line: PedidoOrder['items'][number], markOk: boolean) => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const itemId = line.id;
    const nextReceived = markOk ? line.quantity : 0;
    const nextIncidentType: PedidoOrder['items'][number]['incidentType'] = markOk ? null : 'missing';
    const nextIncidentNotes = markOk ? undefined : 'No recibido';

    const merged = markOk
      ? line.unit === 'kg'
        ? { ...line, receivedQuantity: nextReceived, receivedWeightKg: null as number | null }
        : { ...line, receivedQuantity: nextReceived }
      : {
          ...line,
          receivedQuantity: 0,
          receivedWeightKg: line.unit === 'kg' ? null : line.receivedWeightKg,
        };
    const billingQty = markOk ? billingQuantityForLine(merged) : 0;
    const lineTotal = Math.round(line.pricePerUnit * billingQty * 100) / 100;

    setQuickLineMarks((prev) => ({ ...prev, [itemId]: markOk ? 'ok' : 'bad' }));

    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        const nextItems = order.items.map((item) => {
          if (item.id !== itemId) return item;
          return {
            ...item,
            receivedQuantity: nextReceived,
            receivedWeightKg: merged.receivedWeightKg,
            incidentType: nextIncidentType,
            incidentNotes: nextIncidentNotes,
            lineTotal,
          };
        });
        return { ...order, items: nextItems };
      }),
    );

    const afterReceive = async () => {
      if (line.unit === 'kg') {
        await updateOrderItemReceivedWeightKg(supabase, localId, itemId, null);
      }
      await updateOrderItemPrice(supabase, localId, itemId, line.pricePerUnit, billingQty);
    };

    void Promise.all([
      updateOrderItemReceived(supabase, localId, itemId, nextReceived),
      updateOrderItemIncident(supabase, localId, itemId, markOk ? { type: null, notes: '' } : { type: 'missing', notes: 'No recibido' }),
    ])
      .then(() => afterReceive())
      .then(() => reloadOrders())
      .then(() => dispatchPedidosDataChanged())
      .catch((err: Error) => {
        void reloadOrders();
        setMessage(err.message);
      });
  };

  const getLinePrice = React.useCallback((item: PedidoOrder['items'][number]) => {
    const raw = priceInputRef.current[item.id];
    const parsed = raw == null ? item.pricePerUnit : Number(raw.replace(',', '.'));
    return Number.isNaN(parsed) || parsed < 0 ? item.pricePerUnit : Math.round(parsed * 100) / 100;
  }, []);

  const setLocalUnitPrice = React.useCallback(
    (orderId: string, itemId: string, rawValue: string) => {
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
    },
    [setOrders],
  );

  const commitPriceInput = React.useCallback(
    (orderId: string, itemId: string) => {
      const orderSnap = orders.find((o) => o.id === orderId);
      const itemSnap = orderSnap?.items.find((i) => i.id === itemId);
      if (!itemSnap || !localId) return;
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const raw = priceInputByItemId[itemId] ?? itemSnap.pricePerUnit.toFixed(2);
      const parsed = Number(raw.replace(',', '.'));
      if (Number.isNaN(parsed) || parsed < 0) {
        setMessage('Precio inválido.');
        return;
      }
      const nextPrice = Math.round(parsed * 100) / 100;
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
      setPriceInputByItemId((prev) => ({ ...prev, [itemId]: nextPrice.toFixed(2) }));
      if (unitSupportsReceivedWeightKg(itemSnap.unit)) {
        setPricePerKgInputByItemId((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      }
    },
    [localId, orders, priceInputByItemId, reloadOrders],
  );

  const commitWeightInput = React.useCallback(
    (orderId: string, itemId: string) => {
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
      const price = getLinePrice(itemSnap);
      const merged = {
        ...itemSnap,
        pricePerUnit: price,
        receivedWeightKg: parsed,
        ...(itemSnap.unit === 'kg' && parsed != null ? { receivedQuantity: parsed } : {}),
      };
      void (async () => {
        try {
          await updateOrderItemReceivedWeightKg(supabase, localId, itemId, parsed);
          if (itemSnap.unit === 'kg') {
            await updateOrderItemReceived(supabase, localId, itemId, parsed ?? itemSnap.receivedQuantity);
          }
          await persistReceptionItemTotals(supabase, localId, merged);
          dispatchPedidosDataChanged();
        } catch (err: unknown) {
          void reloadOrders();
          setMessage(err instanceof Error ? err.message : 'No se pudo guardar el peso.');
        }
      })();
      setWeightInputByItemId((prev) => {
        const next = { ...prev };
        if (parsed == null) delete next[itemId];
        else next[itemId] = String(parsed);
        return next;
      });
    },
    [getLinePrice, localId, orders, reloadOrders, weightInputByItemId],
  );

  const commitPricePerKgInput = React.useCallback(
    (orderId: string, itemId: string) => {
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
      const merged = { ...itemSnap, receivedPricePerKg: parsed };
      void persistReceptionItemTotals(supabase, localId, merged)
        .then(() => dispatchPedidosDataChanged())
        .catch((err: Error) => {
          void reloadOrders();
          setMessage(err.message);
        });
    },
    [localId, orders, pricePerKgInputByItemId, reloadOrders],
  );

  const flushOrderReceptionDrafts = React.useCallback(
    async (order: PedidoOrder) => {
      if (!localId) return;
      const supabase = getSupabaseClient();
      if (!supabase) return;
      await Promise.all(
        order.items.map(async (item) => {
          const price = getLinePrice(item);
          const rawW = weightInputRef.current[item.id];
          const rawPpk = pricePerKgInputRef.current[item.id];
          let parsedWeight: number | null = item.receivedWeightKg ?? null;
          if (rawW !== undefined) {
            const p = parseReceivedKg(rawW);
            if (p === 'invalid') throw new Error(`Peso inválido en ${item.productName}.`);
            parsedWeight = p;
          }
          let parsedPpk: number | null = item.receivedPricePerKg ?? null;
          if (rawPpk !== undefined) {
            const p = parsePricePerKg(rawPpk);
            if (p === 'invalid') throw new Error(`€/kg inválido en ${item.productName}.`);
            parsedPpk = p;
          }
          if (parsedPpk != null && (parsedWeight == null || parsedWeight <= 0)) {
            throw new Error(`Faltan kg reales en ${item.productName} para usar €/kg.`);
          }
          const merged = {
            ...item,
            pricePerUnit: price,
            receivedWeightKg: parsedWeight,
            ...(unitSupportsReceivedWeightKg(item.unit) ? { receivedPricePerKg: parsedPpk } : {}),
            ...(item.unit === 'kg' && parsedWeight != null ? { receivedQuantity: parsedWeight } : {}),
          };
          if (unitCanDeclareScaleKgOnReception(item.unit)) {
            await updateOrderItemReceivedWeightKg(supabase, localId, item.id, parsedWeight);
            if (item.unit === 'kg') {
              await updateOrderItemReceived(supabase, localId, item.id, parsedWeight ?? item.receivedQuantity);
            }
            await persistReceptionItemTotals(supabase, localId, merged);
          } else {
            await updateOrderItemPrice(
              supabase,
              localId,
              item.id,
              merged.pricePerUnit,
              billingQuantityForReceptionPrice(merged),
            );
          }
        }),
      );
    },
    [getLinePrice, localId],
  );

  const setSentOrderPriceReviewed = React.useCallback(
    (orderId: string, reviewed: boolean) => {
      if (!localId) return;
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const optimisticTs = reviewed ? new Date().toISOString() : undefined;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, priceReviewArchivedAt: optimisticTs } : o,
        ),
      );
      void setOrderPriceReviewArchived(supabase, localId, orderId, reviewed)
        .then(() => {
          setMessage(
            reviewed
              ? 'Revisión de precios marcada como completada.'
              : 'Revisión de precios reabierta.',
          );
          void reloadOrders();
          dispatchPedidosDataChanged();
        })
        .catch((err: Error) => {
          void reloadOrders();
          setMessage(err.message);
        });
    },
    [localId, reloadOrders, setOrders],
  );

  React.useEffect(() => {
    setQuickLineMarks((prev) => {
      const next: Record<string, 'ok' | 'bad'> = {};
      for (const o of orders) {
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
  }, [orders]);

  const reloadCatalog = React.useCallback(() => {
    if (!canUse || !localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const lid = localId;
    void fetchSuppliersWithProducts(supabase, lid)
      .then((rows) => {
        const map = catalogPriceMapFromSuppliers(rows);
        setCatalogPriceByProductId(map);
        writeCatalogPricesSessionCache(lid, map);
      })
      .catch(() => {
        /* catálogo opcional para colorear precio */
      });
  }, [canUse, localId]);

  React.useEffect(() => {
    if (!canUse || !localId) return;
    const cached = readCatalogPricesSessionCache(localId);
    if (cached !== null) setCatalogPriceByProductId(cached);
    reloadCatalog();
  }, [canUse, localId, reloadCatalog]);

  usePedidosDataChangedListener(
    React.useCallback(() => {
      reloadCatalog();
    }, [reloadCatalog]),
    Boolean(hasPedidosEntry && canUse),
  );

  React.useEffect(
    () => () => {
      if (deletedBannerTimeoutRef.current) window.clearTimeout(deletedBannerTimeoutRef.current);
    },
    [],
  );

  const sentOrders = React.useMemo(() => {
    const rows = orders.filter((row) => row.status === 'sent');
    return [...rows].sort((a, b) => {
      const aTs = a.deliveryDate
        ? new Date(`${a.deliveryDate}T00:00:00`).getTime()
        : new Date(a.createdAt).getTime();
      const bTs = b.deliveryDate
        ? new Date(`${b.deliveryDate}T00:00:00`).getTime()
        : new Date(b.createdAt).getTime();
      // Entrega más próxima arriba (mañana primero, luego días posteriores).
      if (aTs !== bTs) return aTs - bTs;
      // Desempate estable por fecha de creación.
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [orders]);
  const receivedOrders = orders.filter((row) => row.status === 'received');

  const runAssistantCommandFromText = React.useCallback((inputText: string) => {
    const raw = inputText.trim();
    if (!raw) return;
    const normalized = normalizeText(raw);
    setAssistantPendingAction(null);

    const weekMatch =
      normalized.includes('esta semana') &&
      (normalized.includes('a que precio') || normalized.includes('precio pague') || normalized.includes('precio pagamos'));
    if (weekMatch) {
      let productPart = normalized;
      const patterns = [
        /^busca(?:me)?(?:\s+a)?\s+que\s+precio\s+pague\s+/,
        /^busca(?:me)?(?:\s+a)?\s+que\s+precio\s+pagamos\s+/,
        /^a\s+que\s+precio\s+pague\s+/,
        /^a\s+que\s+precio\s+pagamos\s+/,
      ];
      for (const p of patterns) {
        productPart = productPart.replace(p, '');
      }
      productPart = productPart.replace(/\s+esta\s+semana$/, '').replace(/\s+/g, ' ').trim();
      if (!productPart) {
        setAssistantReply('No entendí el producto. Ejemplo: "buscame a qué precio pagué la lechuga esta semana".');
        return;
      }
      const now = new Date();
      const from = new Date(now);
      from.setDate(now.getDate() - 7);
      const fromTs = from.getTime();
      const productNeedle = normalizeText(productPart).replace(/^el\s+|^la\s+|^los\s+|^las\s+/, '');
      const rows: Array<{ supplier: string; product: string; price: number; date: string }> = [];
      for (const o of orders) {
        const when = new Date(o.receivedAt ?? o.sentAt ?? o.createdAt).getTime();
        if (!Number.isFinite(when) || when < fromTs) continue;
        for (const i of o.items) {
          const name = normalizeText(i.productName);
          if (!name.includes(productNeedle)) continue;
          rows.push({
            supplier: o.supplierName,
            product: i.productName,
            price: i.pricePerUnit,
            date: new Date(o.receivedAt ?? o.sentAt ?? o.createdAt).toLocaleDateString('es-ES'),
          });
        }
      }
      if (rows.length === 0) {
        setAssistantReply(`No encontré compras recientes para "${productPart}" en los últimos 7 días.`);
        return;
      }
      const prices = rows.map((r) => r.price);
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const last = rows[0];
      setAssistantReply(
        `${last.product}: media ${avg.toFixed(2)} €, min ${min.toFixed(2)} €, max ${max.toFixed(2)} € (último: ${last.price.toFixed(2)} € en ${last.supplier}, ${last.date}).`,
      );
      return;
    }

    const updateMatch = normalized.match(/(?:oido chef[, ]*)?(?:actualiza|cambia|pon)\s+(.+?)\s+a\s+(\d+(?:[.,]\d{1,4})?)/);
    if (updateMatch) {
      const productNeedle = normalizeText(updateMatch[1]).replace(/^el\s+|^la\s+|^los\s+|^las\s+/, '');
      const nextPrice = Number(updateMatch[2].replace(',', '.'));
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
        setAssistantReply('El precio no es válido.');
        return;
      }
      const candidates: Array<{ orderId: string; supplierName: string; itemId: string; productName: string; price: number }> = [];
      for (const o of sentOrders) {
        for (const i of o.items) {
          if (normalizeText(i.productName).includes(productNeedle)) {
            candidates.push({
              orderId: o.id,
              supplierName: o.supplierName,
              itemId: i.id,
              productName: i.productName,
              price: i.pricePerUnit,
            });
          }
        }
      }
      if (candidates.length === 0) {
        setAssistantReply(`No encontré "${updateMatch[1]}" en pedidos enviados.`);
        return;
      }
      if (candidates.length > 1) {
        setAssistantReply(
          `Encontré varias coincidencias de "${updateMatch[1]}". Sé más específico con proveedor o nombre completo.`,
        );
        return;
      }
      const c = candidates[0];
      setAssistantPendingAction({
        kind: 'update_price',
        orderId: c.orderId,
        itemId: c.itemId,
        productName: c.productName,
        supplierName: c.supplierName,
        previousPrice: c.price,
        nextPrice: Math.round(nextPrice * 100) / 100,
      });
      setAssistantReply(
        `¿Confirmas actualizar ${c.productName} (${c.supplierName}) de ${c.price.toFixed(2)} € a ${nextPrice.toFixed(2)} €?`,
      );
      return;
    }

    setAssistantReply(
      'No entendí el comando. Prueba: "buscame a qué precio pagué la lechuga esta semana" o "actualiza bacon a 7,80".',
    );
  }, [orders, sentOrders]);

  const runAssistantCommand = React.useCallback(() => {
    runAssistantCommandFromText(assistantInput);
  }, [assistantInput, runAssistantCommandFromText]);

  const confirmAssistantAction = React.useCallback(() => {
    if (!assistantPendingAction || !localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (assistantPendingAction.kind === 'update_price') {
      const order = orders.find((o) => o.id === assistantPendingAction.orderId);
      const item = order?.items.find((i) => i.id === assistantPendingAction.itemId);
      if (!order || !item) {
        setAssistantReply('No encontré la línea a actualizar (puede haberse refrescado).');
        setAssistantPendingAction(null);
        return;
      }
      const merged = { ...item, pricePerUnit: assistantPendingAction.nextPrice };
      const qty = billingQuantityForReceptionPrice(merged);
      setOrders((prev) =>
        prev.map((o) =>
          o.id !== order.id
            ? o
            : {
                ...o,
                items: o.items.map((it) =>
                  it.id !== item.id
                    ? it
                    : { ...it, pricePerUnit: assistantPendingAction.nextPrice, lineTotal: Math.round(qty * assistantPendingAction.nextPrice * 100) / 100 },
                ),
              },
        ),
      );
      void updateOrderItemPrice(supabase, localId, item.id, assistantPendingAction.nextPrice, qty)
        .then(() => {
          setAssistantReply(`Actualizado: ${assistantPendingAction.productName} a ${assistantPendingAction.nextPrice.toFixed(2)} €.`);
          setAssistantPendingAction(null);
          void reloadOrders();
          dispatchPedidosDataChanged();
        })
        .catch((err: Error) => {
          void reloadOrders();
          setAssistantReply(`Error al actualizar: ${err.message}`);
          setAssistantPendingAction(null);
        });
    }
  }, [assistantPendingAction, localId, orders, reloadOrders, setOrders]);

  const startAssistantVoice = React.useCallback(() => {
    if (assistantListening) return;
    if (typeof window === 'undefined') return;
    const W = window as unknown as {
      SpeechRecognition?: new () => any;
      webkitSpeechRecognition?: new () => any;
    };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) {
      setAssistantReply('Tu navegador no soporta dictado de voz en esta pantalla.');
      return;
    }
    const recognition = new Ctor();
    recognition.lang = 'es-ES';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    recognition.onstart = () => setAssistantListening(true);
    recognition.onerror = () => {
      setAssistantListening(false);
      setAssistantReply('No se pudo iniciar el micrófono. Revisa permisos del navegador.');
    };
    recognition.onend = () => {
      setAssistantListening(false);
      assistantRecognitionRef.current = null;
    };
    recognition.onresult = (event: any) => {
      const text = Array.from(event.results as any[])
        .map((r: any) => r[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (text) setAssistantInput(text);
      const last = event.results?.[event.results.length - 1];
      if (last?.isFinal && text) {
        setAssistantInput(text);
        runAssistantCommandFromText(text);
      }
    };
    assistantRecognitionRef.current = recognition;
    recognition.start();
  }, [assistantListening, runAssistantCommandFromText]);

  const stopAssistantVoice = React.useCallback(() => {
    assistantRecognitionRef.current?.stop();
  }, []);

  React.useEffect(() => {
    return () => {
      assistantRecognitionRef.current?.stop();
      assistantRecognitionRef.current = null;
    };
  }, []);

  const renderSentOrderReceiveAndIncident = (order: PedidoOrder) => {
    const hasAnyBad = order.items.some((item) => {
      const m = quickLineMarks[item.id];
      return m === 'bad' || (m === undefined && Boolean(item.incidentType));
    });
    const incidentOpen = Boolean(incidentOpenBySentOrderId[order.id]);
    const detailOpen = expandedSentId === order.id;
    const reviewed = Boolean(order.priceReviewArchivedAt);
    return (
      <div className="mt-3 space-y-3 border-t border-amber-200/70 pt-3 text-left">
        {!detailOpen ? (
          <p className="text-center text-[11px] leading-snug text-zinc-600">
            Toca el recuadro del proveedor para desplegar líneas, marcar ✓/✗ y rellenar kg/precio recibido aquí mismo.
          </p>
        ) : null}
        <button
          type="button"
          disabled={receivingOrderId === order.id}
          onClick={() => {
            if (!localId) return;
            const supabase = getSupabaseClient();
            if (!supabase) return;
            const snap = orders.find((o) => o.id === order.id);
            if (!snap) return;
            setMessage(null);
            setReceivingOrderId(order.id);
            void flushOrderReceptionDrafts(snap)
              .then(() => persistSentOrderAsReceived(supabase, localId, snap, { preserveOrderPricing: true }))
              .then(() => {
                const nowIso = new Date().toISOString();
                registerPendingReceivedOrder(order.id, nowIso);
                setOrders((prev) =>
                  prev.map((o) =>
                    o.id === order.id
                      ? { ...o, status: 'received', receivedAt: nowIso, priceReviewArchivedAt: undefined }
                      : o,
                  ),
                );
                setExpandedSentId((id) => (id === order.id ? null : id));
                setMessage('Pedido marcado como recibido.');
                void reloadOrders();
                window.setTimeout(() => void reloadOrders(), 500);
                dispatchPedidosDataChanged();
              })
              .catch((err: Error) => setMessage(err.message))
              .finally(() => setReceivingOrderId((id) => (id === order.id ? null : id)));
          }}
          className="flex w-full flex-col items-center justify-center gap-0.5 rounded-2xl bg-gradient-to-b from-[#4ADE80] to-[#16A34A] py-3 text-center text-[11px] font-black uppercase leading-tight tracking-wide text-white shadow-md shadow-emerald-900/20 ring-1 ring-white/25 transition active:scale-[0.99] disabled:opacity-90"
        >
          {receivingOrderId === order.id ? (
            <span>Recibido</span>
          ) : (
            <>
              <span>Marcar como</span>
              <span>recibido</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => setSentOrderPriceReviewed(order.id, !reviewed)}
          className={[
            'w-full rounded-lg px-3 py-2.5 text-center text-xs font-bold transition active:scale-[0.99]',
            reviewed
              ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300'
              : 'bg-zinc-200 text-zinc-700',
          ].join(' ')}
        >
          {reviewed ? 'Revisión de precios: completada (tocar para reabrir)' : 'Marcar revisión de precios como completada'}
        </button>
        <button
          type="button"
          onClick={() => toggleSentIncidentPanel(order)}
          className={[
            'w-full rounded-lg px-3 py-2.5 text-center text-xs font-bold transition',
            incidentOpen || hasAnyBad
              ? 'bg-[#B91C1C] text-white active:scale-[0.99]'
              : 'bg-zinc-200 text-zinc-600 active:scale-[0.99]',
          ].join(' ')}
        >
          {incidentOpen ? 'Ocultar incidencia' : 'Incidencia'}
        </button>
        {incidentOpen ? (
          <div className="space-y-2 rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
            <p className="text-[10px] font-bold uppercase tracking-wide text-red-900">
              Nota para lineas marcadas con ✗
            </p>
            <textarea
              value={
                incidentNoteBySentOrderId[order.id] ??
                (incidentOpen ? draftIncidentNoteForSentOrder(order, quickLineMarks) : '')
              }
              onChange={(e) => setIncidentNoteBySentOrderId((prev) => ({ ...prev, [order.id]: e.target.value }))}
              rows={4}
              placeholder="Describe la incidencia..."
              className="w-full rounded-lg border border-red-300 bg-white px-2 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => saveSentOrderIncident(order)}
                className="rounded-lg bg-[#B91C1C] px-3 py-2 text-xs font-semibold text-white"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => setIncidentOpenBySentOrderId((prev) => ({ ...prev, [order.id]: false }))}
                className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-xs font-semibold text-zinc-800"
              >
                Cerrar sin guardar
              </button>
            </div>
            <p className="text-center text-[11px] text-zinc-500">
              La incidencia se guarda aquí mismo para este pedido.
            </p>
          </div>
        ) : null}
      </div>
    );
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
      {showDeletedBanner ? (
        <div className="pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-black/25 px-6">
          <div className="rounded-2xl bg-[#D32F2F] px-7 py-5 text-center shadow-2xl ring-2 ring-white/75">
            <p className="text-xl font-black uppercase tracking-wide text-white">ELIMINADO</p>
          </div>
        </div>
      ) : null}

      <MermasStyleHero
        eyebrow="Pedidos"
        title="Proveedores y recepción"
        description="Crea pedidos, envía por WhatsApp, controla envíos y recepción en el local."
      />

      <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <button
          type="button"
          onClick={() => setAssistantOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2.5 text-left ring-1 ring-zinc-200"
          aria-expanded={assistantOpen}
        >
          <span className="inline-flex items-center gap-2 text-sm font-bold text-zinc-900">
            <Bot className="h-4 w-4 text-[#D32F2F]" />
            Oído Chef
          </span>
          <ChevronDown className={['h-4 w-4 text-zinc-500 transition-transform', assistantOpen ? 'rotate-180' : ''].join(' ')} />
        </button>
        {assistantOpen ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-zinc-500">
              Ejemplos: "buscame a qué precio pagué la lechuga esta semana" · "actualiza bacon a 7,80".
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={assistantInput}
                onChange={(e) => setAssistantInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    runAssistantCommand();
                  }
                }}
                placeholder="Escribe una orden..."
                className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-[#D32F2F]/50"
              />
              <button
                type="button"
                onClick={runAssistantCommand}
                className="h-11 rounded-xl bg-zinc-900 px-3 text-xs font-bold text-white"
              >
                Ejecutar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (assistantListening) stopAssistantVoice();
                  else startAssistantVoice();
                }}
                className={[
                  'h-11 rounded-xl px-3 text-xs font-bold ring-1',
                  assistantListening
                    ? 'bg-[#B91C1C] text-white ring-[#B91C1C]/40'
                    : 'bg-white text-zinc-700 ring-zinc-300',
                ].join(' ')}
              >
                {assistantListening ? 'Escuchando…' : '🎙 Voz'}
              </button>
            </div>
            {assistantReply ? (
              <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700 ring-1 ring-zinc-200">{assistantReply}</p>
            ) : null}
            {assistantPendingAction ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={confirmAssistantAction}
                  className="h-10 rounded-lg bg-[#16A34A] px-3 text-xs font-bold text-white"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAssistantPendingAction(null);
                    setAssistantReply('Acción cancelada.');
                  }}
                  className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700"
                >
                  Cancelar
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Link href="/pedidos/nuevo" className="flex h-15 items-center justify-center rounded-xl bg-[#D32F2F] px-3 text-center text-sm font-bold text-white">
            + Nuevo pedido
          </Link>
          <Link href="/pedidos/proveedores" className="flex h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white px-3 text-center text-sm font-semibold text-zinc-700">
            Proveedores
          </Link>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Link href="/pedidos/calendario" className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-center text-sm font-semibold text-zinc-700">
            Calendario entregas
          </Link>
          <Link href="/pedidos/precios" className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-center text-sm font-semibold text-zinc-700">
            Evolucion precios
          </Link>
          <Link href="/pedidos/historial-mes" className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-center text-sm font-semibold text-zinc-700">
            Compras del mes
          </Link>
        </div>
      </section>

      {message ? (
        <section className="rounded-2xl bg-white p-4 text-sm text-zinc-700 ring-1 ring-zinc-200">{message}</section>
      ) : null}

      <details
        className={[
          'overflow-hidden rounded-3xl transition-all duration-300 ease-out',
          pendientesEntregaAccordionOpen
            ? 'bg-white shadow-lg shadow-zinc-200/60 ring-2 ring-zinc-900/5'
            : 'bg-zinc-50/80 ring-1 ring-zinc-200/90 hover:bg-white hover:ring-zinc-300',
        ].join(' ')}
        open={pendientesEntregaAccordionOpen}
        onToggle={(e) => setPendientesEntregaAccordionOpen(e.currentTarget.open)}
      >
        <summary className="flex w-full cursor-pointer list-none flex-col items-center px-5 py-8 text-center outline-none transition active:bg-zinc-50/50 focus-visible:ring-2 focus-visible:ring-[#D32F2F]/40 focus-visible:ring-offset-2 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Entrega</span>
          <span className="mt-2 text-center text-2xl font-semibold leading-[1.15] tracking-tight text-zinc-900 sm:text-[1.75rem] sm:leading-tight">
            Pendientes de entrega
          </span>
          <span className={`mx-auto mt-4 w-24 ${CHEF_ONE_TAPER_LINE_CLASS}`} aria-hidden />
          <span className="mt-4 text-3xl font-black tabular-nums text-zinc-900">
            {sentOrders.length}
          </span>
          <span className="mt-4 flex flex-wrap items-center justify-center gap-x-1.5 text-xs text-zinc-500">
            {sentOrders.length === 0 ? (
              <span>Nada pendiente ahora</span>
            ) : (
              <>
                <span>
                  {`${sentOrders.length} pedido${sentOrders.length === 1 ? '' : 's'} enviado${
                    sentOrders.length === 1 ? '' : 's'
                  }`}
                </span>
                <span className="text-zinc-400">·</span>
                <span>IVA incl. en totales</span>
              </>
            )}
          </span>
          <span className="mt-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#D32F2F]">
            {pendientesEntregaAccordionOpen ? 'Ocultar pedidos' : 'Ver pedidos pendientes'}
            <ChevronDown
              className={[
                'h-4 w-4 transition-transform duration-300',
                pendientesEntregaAccordionOpen ? 'rotate-180' : '',
              ].join(' ')}
              aria-hidden
            />
          </span>
        </summary>
        <div className="space-y-2 border-t border-zinc-100 bg-gradient-to-b from-amber-50/95 via-amber-50/80 to-amber-100/50 px-3 pb-4 pt-3 sm:px-4">
          {sentOrders.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-600">No hay pedidos enviados.</p>
          ) : null}
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
                  const totals = totalsWithVatForOrderListDisplay(order);
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
                      <p className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        Revisión precios:{' '}
                        <span className={order.priceReviewArchivedAt ? 'text-emerald-700' : 'text-zinc-700'}>
                          {order.priceReviewArchivedAt ? 'completada' : 'pendiente'}
                        </span>
                      </p>
                    </>
                  );
                })()}
              </button>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => sendWhatsappOrder(order)}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-center text-xs font-semibold text-[#166534]"
                >
                  Enviar WhatsApp
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!(await requestDeleteSecurityPin())) {
                      setMessage('Clave de seguridad incorrecta.');
                      return;
                    }
                    if (!localId) return;
                    if (!window.confirm('¿Seguro que quieres eliminar este pedido?')) return;
                    const supabase = getSupabaseClient();
                    if (!supabase) return;
                    void deleteOrder(supabase, localId, order.id)
                      .then(() => {
                        registerDeletedOrderId(order.id);
                        releasePinOrderId(order.id);
                        setOrders((prev) => prev.filter((o) => o.id !== order.id));
                        setMessage('Pedido enviado eliminado.');
                        setShowDeletedBanner(true);
                        if (deletedBannerTimeoutRef.current) window.clearTimeout(deletedBannerTimeoutRef.current);
                        deletedBannerTimeoutRef.current = window.setTimeout(() => {
                          setShowDeletedBanner(false);
                          deletedBannerTimeoutRef.current = null;
                        }, 1000);
                        void reloadOrders();
                        dispatchPedidosDataChanged();
                      })
                      .catch((err: Error) => setMessage(err.message));
                  }}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-center text-xs font-semibold text-[#B91C1C]"
                >
                  Eliminar
                </button>
              </div>
              {renderSentOrderReceiveAndIncident(order)}
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
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-zinc-900">{item.productName}</p>
                            <p className="mt-1 text-xs text-zinc-700">
                              Pedido:{' '}
                              <span className="font-semibold text-zinc-900">
                                {formatQuantityWithUnit(item.quantity, item.unit)}
                              </span>
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const serverBad = Boolean(item.incidentType);
                                if (mark === 'bad' || (mark === undefined && serverBad)) {
                                  clearQuickReceive(order.id, item);
                                  return;
                                }
                                quickReceiveItem(order.id, item, false);
                              }}
                              className={[
                                'grid h-7 w-7 place-items-center rounded-full border text-sm font-black',
                                isBad ? 'border-[#B91C1C] bg-[#B91C1C] text-white' : 'border-zinc-300 bg-white text-zinc-400',
                              ].join(' ')}
                              title="No recibido (toca otra vez para quitar)"
                              aria-label="No recibido"
                            >
                              {'\u2715'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const serverOk =
                                  item.receivedQuantity >= item.quantity &&
                                  item.quantity > 0 &&
                                  !item.incidentType;
                                if (mark === 'ok' || (mark === undefined && serverOk)) {
                                  clearQuickReceive(order.id, item);
                                  return;
                                }
                                quickReceiveItem(order.id, item, true);
                              }}
                              className={[
                                'grid h-7 w-7 place-items-center rounded-full border text-sm font-black',
                                isOk ? 'border-[#16A34A] bg-[#16A34A] text-white' : 'border-zinc-300 bg-white text-zinc-400',
                              ].join(' ')}
                              title="Recibido OK (toca otra vez para quitar)"
                              aria-label="Recibido OK"
                            >
                              {'\u2713'}
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-zinc-700">
                          Precio base (pedido):{' '}
                          <span className="font-semibold text-zinc-900">
                            {item.basePricePerUnit != null && Number.isFinite(item.basePricePerUnit)
                              ? `${item.basePricePerUnit.toFixed(2)} €/${unitPriceCatalogSuffix[item.unit]}`
                              : '—'}
                          </span>
                        </p>
                        <p className="text-xs text-zinc-700">
                          Precio albarán:{' '}
                          <span className="font-semibold text-zinc-900">
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
                          <span className="font-semibold text-zinc-900">
                            {lineSubtotalForOrderListDisplay(item).toFixed(2)} €
                          </span>
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
                    );
                  })}
                </div>
              ) : null}

            </div>
          ))}
        </div>
      </details>

      <details
        className={[
          'overflow-hidden rounded-3xl transition-all duration-300 ease-out',
          historicoRecibidosAccordionOpen
            ? 'bg-white shadow-lg shadow-zinc-200/60 ring-2 ring-zinc-900/5'
            : 'bg-zinc-50/80 ring-1 ring-zinc-200/90 hover:bg-white hover:ring-zinc-300',
        ].join(' ')}
        open={historicoRecibidosAccordionOpen}
        onToggle={(e) => setHistoricoRecibidosAccordionOpen(e.currentTarget.open)}
      >
        <summary className="flex w-full cursor-pointer list-none flex-col items-center px-5 py-8 text-center outline-none transition active:bg-zinc-50/50 focus-visible:ring-2 focus-visible:ring-[#D32F2F]/40 focus-visible:ring-offset-2 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Almacén</span>
          <span className="mt-2 text-center text-2xl font-semibold leading-[1.15] tracking-tight text-zinc-900 sm:text-[1.75rem] sm:leading-tight">
            Histórico recibidos
          </span>
          <span className={`mx-auto mt-4 w-24 ${CHEF_ONE_TAPER_LINE_CLASS}`} aria-hidden />
          <span className="mt-4 text-3xl font-black tabular-nums text-zinc-900">
            {receivedOrders.length}
          </span>
          <span className="mt-4 flex flex-wrap items-center justify-center gap-x-1.5 text-xs text-zinc-500">
            {receivedOrders.length === 0 ? (
              <span>Sin pedidos recibidos</span>
            ) : (
              <>
                <span>
                  {receivedOrders.length} pedido{receivedOrders.length === 1 ? '' : 's'}
                </span>
                <span className="text-zinc-400">·</span>
                <span>Verde sin incidencia · rojo con incidencia</span>
              </>
            )}
          </span>
          <span className="mt-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#D32F2F]">
            {historicoRecibidosAccordionOpen ? 'Ocultar pedidos' : 'Ver pedidos recibidos'}
            <ChevronDown
              className={[
                'h-4 w-4 transition-transform duration-300',
                historicoRecibidosAccordionOpen ? 'rotate-180' : '',
              ].join(' ')}
              aria-hidden
            />
          </span>
        </summary>
        <div className="space-y-4 border-t border-zinc-100 bg-gradient-to-b from-zinc-50/90 to-white px-3 pb-4 pt-4 sm:px-4">
          {receivedOrders.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">No hay pedidos recibidos.</p>
          ) : null}
          {receivedOrders.map((order) => {
            const needsAttention = receivedOrderHasAttention(order);
            const incidentFooterText = historicoIncidentFooterText(order);
            const detailOpen = expandedHistoricoId === order.id;
            const totals = totalsWithVatForOrderListDisplay(order);
            return (
            <div
              key={order.id}
              className={[
                'overflow-hidden rounded-3xl transition-all duration-300 ease-out',
                needsAttention
                  ? detailOpen
                    ? 'bg-red-50 shadow-lg shadow-red-200/35 ring-2 ring-red-400/90'
                    : 'bg-red-50/95 ring-2 ring-red-400/80 shadow-sm hover:bg-red-50'
                  : detailOpen
                    ? 'bg-emerald-50 shadow-lg shadow-emerald-200/35 ring-2 ring-emerald-600/80'
                    : 'bg-emerald-50/95 ring-2 ring-emerald-500/75 shadow-sm hover:bg-emerald-50',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={() => setExpandedHistoricoId((prev) => (prev === order.id ? null : order.id))}
                className={[
                  'flex w-full flex-col items-center px-4 py-6 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-[#D32F2F]/40 focus-visible:ring-offset-2',
                  needsAttention ? 'active:bg-red-100/50' : 'active:bg-emerald-100/50',
                ].join(' ')}
                aria-expanded={detailOpen}
              >
                <span className="text-center text-xl font-semibold leading-[1.15] tracking-tight text-zinc-900 sm:text-[1.65rem] sm:leading-tight">
                  {order.supplierName}
                </span>
                <span className={`mx-auto mt-3 w-24 ${CHEF_ONE_TAPER_LINE_CLASS}`} aria-hidden />
                <span className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-500">
                  <span className="tabular-nums font-medium text-zinc-700">{totals.total.toFixed(2)} €</span>
                  <span className="text-zinc-400">·</span>
                  <span>
                    recibido {order.receivedAt ? new Date(order.receivedAt).toLocaleDateString('es-ES') : '-'}
                  </span>
                  <span className="text-zinc-400">·</span>
                  <span>IVA incl.</span>
                </span>
                {needsAttention ? (
                  <span className="mt-2 rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-800 ring-1 ring-red-200">
                    Incidencia
                  </span>
                ) : null}
                <span className="mt-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#D32F2F]">
                  {detailOpen ? 'Ocultar lineas del pedido' : 'Ver lineas del pedido'}
                  <ChevronDown
                    className={['h-4 w-4 transition-transform duration-300', detailOpen ? 'rotate-180' : ''].join(
                      ' ',
                    )}
                    aria-hidden
                  />
                </span>
              </button>
              <div
                className={[
                  'flex flex-wrap justify-center gap-2 border-t px-3 py-3',
                  needsAttention
                    ? 'border-red-200/80 bg-white/75'
                    : 'border-emerald-200/80 bg-white/75',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!localId) return;
                    const ok = window.confirm(
                      '¿Devolver este pedido a «Pendientes de entrega»? Volverá a la bandeja de revisión de precios (las líneas no se borran).',
                    );
                    if (!ok) return;
                    const supabase = getSupabaseClient();
                    if (!supabase) return;
                    void reopenReceivedOrderToSent(supabase, localId, order.id)
                      .then(() => {
                        clearPendingReceivedOrder(order.id);
                        setMessage('Pedido devuelto a enviados.');
                        void reloadOrders();
                        dispatchPedidosDataChanged();
                      })
                      .catch((err: Error) => setMessage(err.message));
                  }}
                  className="rounded-lg border border-amber-600/70 bg-amber-50 px-2 py-1.5 text-center text-xs font-semibold text-amber-900"
                >
                  Volver a enviados
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!(await requestDeleteSecurityPin())) {
                      setMessage('Clave de seguridad incorrecta.');
                      return;
                    }
                    if (!localId) return;
                    if (!window.confirm('¿Seguro que quieres eliminar este pedido?')) return;
                    const supabase = getSupabaseClient();
                    if (!supabase) return;
                    void deleteOrder(supabase, localId, order.id)
                      .then(() => {
                        registerDeletedOrderId(order.id);
                        releasePinOrderId(order.id);
                        setOrders((prev) => prev.filter((o) => o.id !== order.id));
                        setMessage('Pedido histórico eliminado.');
                        setShowDeletedBanner(true);
                        if (deletedBannerTimeoutRef.current) window.clearTimeout(deletedBannerTimeoutRef.current);
                        deletedBannerTimeoutRef.current = window.setTimeout(() => {
                          setShowDeletedBanner(false);
                          deletedBannerTimeoutRef.current = null;
                        }, 1000);
                        void reloadOrders();
                        dispatchPedidosDataChanged();
                      })
                      .catch((err: Error) => setMessage(err.message));
                  }}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-center text-xs font-semibold text-[#B91C1C]"
                >
                  Eliminar
                </button>
              </div>
              {expandedHistoricoId === order.id ? (
                <div
                  className={[
                    'space-y-3 border-t bg-gradient-to-b px-3 pb-4 pt-3 text-left sm:px-4',
                    needsAttention
                      ? 'border-red-200/70 from-red-50/80 to-red-100/30'
                      : 'border-emerald-200/70 from-emerald-50/80 to-emerald-100/30',
                  ].join(' ')}
                >
                  <p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                    Lineas del pedido
                  </p>
                  {order.notes?.trim() ? (
                    <div className="rounded-2xl border border-zinc-100 bg-white px-3 py-2.5 shadow-sm ring-1 ring-zinc-100">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Notas del pedido</p>
                      <p className="mt-1 text-sm leading-relaxed text-zinc-900">{order.notes.trim()}</p>
                    </div>
                  ) : null}
                  {order.items.map((item) => {
                    const inc = Boolean(item.incidentType) || Boolean(item.incidentNotes?.trim());
                    const isBad = inc;
                    const isOk = !inc && item.receivedQuantity >= item.quantity && item.quantity > 0;
                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-zinc-900">{item.productName}</p>
                          <div className="flex shrink-0 items-center gap-2">
                            <span
                              className={[
                                'grid h-7 w-7 place-items-center rounded-full border text-sm font-black',
                                isOk
                                  ? 'border-[#16A34A] bg-[#16A34A] text-white'
                                  : isBad
                                    ? 'border-amber-600 bg-amber-500 text-white'
                                    : 'border-zinc-300 bg-white text-zinc-400',
                              ].join(' ')}
                              title={isOk ? 'Recibido OK' : isBad ? 'Incidencia registrada' : 'Parcial'}
                              aria-hidden
                            >
                              {isOk ? '\u2713' : isBad ? '\u2715' : '\u00B7'}
                            </span>
                            <span className="w-16 text-right text-xs font-semibold tabular-nums text-zinc-900">
                              {item.pricePerUnit.toFixed(2)} €
                            </span>
                          </div>
                        </div>
                        <p className="mt-2 text-xs italic text-zinc-700">
                          Pedido:{' '}
                          <span className="font-semibold not-italic text-zinc-900">
                            {formatQuantityWithUnit(item.quantity, item.unit)}
                          </span>
                        </p>
                        <p className="text-xs italic text-zinc-700">
                          Precio recepción:{' '}
                          <span className="font-semibold not-italic text-zinc-900">
                            {item.pricePerUnit.toFixed(2)} €/{unitPriceCatalogSuffix[item.unit]}
                          </span>
                        </p>
                        <p className="text-xs italic text-zinc-700">
                          Subt:{' '}
                          <span className="font-semibold not-italic text-zinc-900">
                            {lineSubtotalForOrderListDisplay(item).toFixed(2)} €
                          </span>
                        </p>
                        {unitCanDeclareScaleKgOnReception(item.unit) &&
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
                  {needsAttention && incidentFooterText ? (
                    <div className="rounded-xl border border-red-200 bg-red-50/50 px-3 py-2.5 text-left shadow-sm ring-1 ring-red-100">
                      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-red-800">
                        <span aria-hidden>{'\u{1F6A8}'}</span> Incidencia
                      </p>
                      <p className="mt-1.5 text-xs leading-relaxed text-zinc-800 whitespace-pre-wrap">
                        {incidentFooterText}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            );
          })}
        </div>
      </details>

    </div>
  );
}
