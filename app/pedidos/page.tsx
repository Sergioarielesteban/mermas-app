'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bot, ChevronDown } from 'lucide-react';
import React from 'react';
import { OIDO_CHEF_START_VOICE_EVENT, OIDO_CHEF_VOICE_NAV_FLAG } from '@/components/BottomNav';
import { useAuth } from '@/components/AuthProvider';
import { CHEF_ONE_TAPER_LINE_CLASS } from '@/components/ChefOneGlowLine';
import { usePedidosOrders } from '@/components/PedidosOrdersProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import MermasStyleHero from '@/components/MermasStyleHero';
import PedidosAlbaranOcrModal from '@/components/PedidosAlbaranOcrModal';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { dispatchPedidosDataChanged, usePedidosDataChangedListener } from '@/hooks/usePedidosDataChangedListener';
import { canAccessFinanzas } from '@/lib/app-role-permissions';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import {
  estimatedKgForOrderLine,
  estimatedOrderLineSubtotal,
  formatIncidentLine,
  formatQuantityWithUnit,
  lineSubtotalForOrderListDisplay,
  receptionBillingSummary,
  totalsWithVatForOrderListDisplay,
  unitPriceCatalogSuffix,
} from '@/lib/pedidos-format';
import {
  readCatalogPricesSessionCache,
  writeCatalogPricesSessionCache,
} from '@/lib/pedidos-session-cache';
import { buildOidoChefAiContext } from '@/lib/oido-chef-ai-context';
import {
  billingQuantityForReceptionPrice,
  billingQuantityForLine,
  deleteOrder,
  fetchSuppliersWithProducts,
  persistReceptionItemTotals,
  receptionLineTotals,
  reopenReceivedOrderToSent,
  setOrderStatus,
  setOrderPriceReviewArchived,
  unitCanDeclareScaleKgOnReception,
  unitSupportsReceivedWeightKg,
  orderItemHasDistinctBilling,
  updateOrderItemIncident,
  updateOrderItemReceived,
  updateOrderItemReceivedWeightKg,
  updateOrderItemPrice,
  type PedidoOrder,
  type PedidoSupplier,
} from '@/lib/pedidos-supabase';
import {
  createStaffMealRecord,
  fetchStaffMealWorkers,
  voidStaffMealRecord,
  type StaffMealWorker,
} from '@/lib/comida-personal-supabase';
import { getPedidoDrafts } from '@/lib/pedidos-storage';
import {
  fetchCleaningTasks,
  fetchCleaningWeekdayItems,
} from '@/lib/appcc-limpieza-supabase';
import {
  APPCC_SLOT_LABEL,
  fetchAppccColdUnits,
  fetchAppccReadingsForDate,
  madridDateKey,
  appccTemperaturasOperationalDateKey,
  readingsByUnitAndSlot,
  type AppccSlot,
} from '@/lib/appcc-supabase';
import { fetchAppccFryers, fetchOilEventsForDate } from '@/lib/appcc-aceite-supabase';
import { topByValue } from '@/lib/analytics';
import { fetchProductsAndMermas } from '@/lib/mermas-supabase';
import { appConfirm } from '@/lib/app-dialog-bridge';
import { confirmDestructiveOperation } from '@/lib/ops-role-confirm';
import {
  actorLabel,
  notifyIncidenciaRecepcionDeduped,
  notifyPedidoRecibido,
} from '@/services/notifications';
import { openWhatsApp, normalizeWhatsappPhone } from '@/lib/whatsapp';

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
    order.contentRevisedAfterSentAt ? '— Pedido actualizado (líneas revisadas tras el envío anterior). —' : '',
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

/** Palabra(s) suelta(s) → pantalla (sin tener que decir «abre…»). */
function matchAssistantSingleTopicNav(normalized: string): { href: string; message: string } | null {
  const n = normalized.trim();
  if (!n) return null;
  const exact: Record<string, { href: string; message: string }> = {
    proveedores: { href: '/pedidos/proveedores', message: 'Abriendo Proveedores…' },
    recepcion: { href: '/pedidos/recepcion', message: 'Abriendo Recepción…' },
    albaranes: { href: '/pedidos/albaranes', message: 'Abriendo Albaranes…' },
    albaran: { href: '/pedidos/albaranes', message: 'Abriendo Albaranes…' },
    precios: { href: '/pedidos/precios', message: 'Abriendo Precios…' },
    articulos: { href: '/pedidos/articulos', message: 'Abriendo Artículos…' },
    artículos: { href: '/pedidos/articulos', message: 'Abriendo Artículos…' },
    calendario: { href: '/pedidos/calendario', message: 'Abriendo Calendario de entregas…' },
    comida: { href: '/comida-personal', message: 'Abriendo Consumo interno…' },
    personal: { href: '/comida-personal', message: 'Abriendo Consumo interno…' },
    equipos: { href: '/appcc/equipos', message: 'Abriendo Equipos (frío)…' },
    checklist: { href: '/checklist', message: 'Abriendo Checklist…' },
    produccion: { href: '/produccion', message: 'Abriendo Producción…' },
    panel: { href: '/panel', message: 'Abriendo Panel…' },
    inventario: { href: '/inventario', message: 'Abriendo Inventario…' },
    escandallos: { href: '/escandallos', message: 'Abriendo Escandallos…' },
  };
  if (exact[n]) return exact[n];
  if (n === 'comida personal' || n === 'comida del personal' || n === 'consumo interno') {
    return { href: '/comida-personal', message: 'Abriendo Consumo interno…' };
  }
  if (n === 'nuevo pedido' || n === 'pedido nuevo') {
    return { href: '/pedidos/nuevo', message: 'Abriendo Nuevo pedido…' };
  }
  if (n === 'historial mes' || n === 'compras mes' || n === 'historial del mes') {
    return { href: '/pedidos/historial-mes', message: 'Abriendo Histórico del mes…' };
  }
  if (n === 'cronograma limpieza' || n === 'limpieza cronograma') {
    return { href: '/appcc/limpieza/cronograma', message: 'Abriendo Cronograma de limpieza…' };
  }
  if (n === 'tareas limpieza' || n === 'limpieza tareas') {
    return { href: '/appcc/limpieza/tareas', message: 'Abriendo Tareas de limpieza…' };
  }
  return null;
}

const ASSISTANT_FALLBACK_HINT = [
  'No lo tengo claro. Prueba una de estas ideas (también valen palabras sueltas como «limpieza», «recepción», «appcc»):',
  '',
  'Pedidos: «resumen», «pedidos enviados», «abre pendientes de entrega», «marcar recibido pedido de …», «WhatsApp pedido de …», «actualiza … a … € en …».',
  'Pantallas: «recepción», «proveedores», «precios», «calendario», «comida».',
  'Limpieza: «limpieza», «qué toca limpiar hoy» o «cronograma limpieza».',
  'APPCC: «appcc», «estado APPCC hoy», «temperaturas», «aceite».',
].join('\n');

type AssistantPendingAction = {
  kind: 'update_price';
  orderId: string;
  itemId: string;
  productName: string;
  supplierName: string;
  previousPrice: number;
  nextPrice: number;
};

type AssistantHistoryRow = {
  at: string;
  command: string;
  result: string;
};

const ASSISTANT_HISTORY_LS_KEY = 'oido-chef-history-v1';

export default function PedidosPage() {
  const { localCode, localName, localId, email, userId, displayName, loginUsername, profileRole } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const {
    orders,
    setOrders,
    reloadOrders,
    reloadError,
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
  const sendWhatsappOrder = React.useCallback(
    (order: PedidoOrder, options?: { viaAssistant?: boolean }) => {
    const phone = normalizeWhatsappPhone(order.supplierContact);
    if (!phone) {
      const err = `El proveedor "${order.supplierName}" no tiene teléfono válido en contacto.`;
      setMessage(err);
      if (options?.viaAssistant) setAssistantReply(err);
      return;
    }
    const fallbackDelivery = order.createdAt.slice(0, 10);
    const rawDelivery = order.deliveryDate ?? fallbackDelivery;
    const parsed = new Date(`${rawDelivery}T00:00:00`);
    const deliveryDate = Number.isNaN(parsed.getTime())
      ? new Date(order.createdAt).toLocaleDateString('es-ES')
      : parsed.toLocaleDateString('es-ES');
    const requestedBy = (email ?? 'EQUIPO').split('@')[0] || 'EQUIPO';
    const whatsappMessage = buildWhatsappOrderMessage(
      order,
      deliveryDate,
      localName ?? 'CHEF-ONE MATARO',
      requestedBy,
    );
    openWhatsApp(phone, whatsappMessage);
  },
  [email, localName],
);

  const [expandedSentId, setExpandedSentId] = React.useState<string | null>(null);
  const [ocrOrder, setOcrOrder] = React.useState<PedidoOrder | null>(null);
  const [expandedHistoricoId, setExpandedHistoricoId] = React.useState<string | null>(null);
  /** Plegado por mes (YYYY-MM) en histórico recibidos; sin entrada = mes actual según índice. */
  const [historicoMonthOpen, setHistoricoMonthOpen] = React.useState<Record<string, boolean>>({});
  const [pendientesEntregaAccordionOpen, setPendientesEntregaAccordionOpen] = React.useState(false);
  const [historicoRecibidosAccordionOpen, setHistoricoRecibidosAccordionOpen] = React.useState(false);
  /** Feedback visual al marcar recibido (el merge con réplica ya no revierte el estado). */
  const [receivingOrderId, setReceivingOrderId] = React.useState<string | null>(null);
  /** Marca visual por línea (varias a la vez); evita que un refetch parcial “borre” el estado al ir recibiendo. */
  const [quickLineMarks, setQuickLineMarks] = React.useState<Record<string, 'ok' | 'bad'>>({});
  const [incidentOpenBySentOrderId, setIncidentOpenBySentOrderId] = React.useState<Record<string, boolean>>({});
  const [incidentNoteBySentOrderId, setIncidentNoteBySentOrderId] = React.useState<Record<string, string>>({});
  const [assistantInput, setAssistantInput] = React.useState('');
  const [assistantReply, setAssistantReply] = React.useState<string | null>(null);
  const [assistantPendingAction, setAssistantPendingAction] = React.useState<AssistantPendingAction | null>(null);
  const [assistantBusy, setAssistantBusy] = React.useState(false);
  const [assistantHistory, setAssistantHistory] = React.useState<AssistantHistoryRow[]>([]);
  const [assistantListening, setAssistantListening] = React.useState(false);
  const assistantRecognitionRef = React.useRef<{
    stop: () => void;
  } | null>(null);
  /** Evita doble arranque (barra inferior + hash + StrictMode). */
  const assistantVoiceBootRef = React.useRef(false);
  /** Coalesce varias líneas marcadas ✗ en el mismo pedido antes de notificar. */
  const incidenciaRecepcionDebounceRef = React.useRef<Map<string, number>>(new Map());
  const router = useRouter();
  const searchParams = useSearchParams();
  const oidoStandalone = searchParams.get('oido') === '1';
  const avisoPedido = searchParams.get('pedido');

  React.useEffect(() => {
    if (!avisoPedido) return;
    const t = window.setTimeout(() => {
      router.replace('/pedidos', { scroll: false });
    }, 6000);
    return () => window.clearTimeout(t);
  }, [avisoPedido, router]);

  const scheduleIncidenciaRecepcionNotifyDebounced = React.useCallback(
    (order: PedidoOrder) => {
      if (!localId) return;
      const supa = getSupabaseClient();
      if (!supa) return;
      const timers = incidenciaRecepcionDebounceRef.current;
      const existing = timers.get(order.id);
      if (existing != null) window.clearTimeout(existing);
      const t = window.setTimeout(() => {
        timers.delete(order.id);
        notifyIncidenciaRecepcionDeduped(supa, {
          localId,
          userId,
          actorName: actorLabel(displayName, loginUsername),
          supplierName: order.supplierName,
          orderId: order.id,
        });
      }, 1000);
      timers.set(order.id, t);
    },
    [localId, userId, displayName, loginUsername],
  );

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
        dispatchPedidosDataChanged();
        const supa = getSupabaseClient();
        if (supa && localId) {
          notifyIncidenciaRecepcionDeduped(supa, {
            localId,
            userId,
            actorName: actorLabel(displayName, loginUsername),
            supplierName: order.supplierName,
            orderId: order.id,
          });
        }
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
    const resetPrice = line.basePricePerUnit ?? line.pricePerUnit;
    void Promise.all([
      updateOrderItemReceived(supabase, localId, itemId, 0),
      updateOrderItemIncident(supabase, localId, itemId, { type: null, notes: '' }),
    ])
      .then(async () => {
        if (line.unit === 'kg') {
          await updateOrderItemReceivedWeightKg(supabase, localId, itemId, null);
        } else if (unitSupportsReceivedWeightKg(line.unit)) {
          await updateOrderItemReceivedWeightKg(supabase, localId, itemId, null);
        }
        await updateOrderItemPrice(supabase, localId, itemId, resetPrice, 0);
      })
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
    const orderForNotify = orders.find((o) => o.id === orderId);
    const itemId = line.id;
    const nextReceived = markOk ? line.quantity : 0;
    const nextIncidentType: PedidoOrder['items'][number]['incidentType'] = markOk ? null : 'missing';
    const nextIncidentNotes = markOk ? undefined : 'No recibido';

    let merged: PedidoOrder['items'][number] = markOk
      ? line.unit === 'kg'
        ? { ...line, receivedQuantity: nextReceived, receivedWeightKg: null as number | null }
        : { ...line, receivedQuantity: nextReceived }
      : {
          ...line,
          receivedQuantity: 0,
          receivedWeightKg: line.unit === 'kg' ? null : line.receivedWeightKg,
        };

    if (markOk && line.unit !== 'kg' && unitSupportsReceivedWeightKg(line.unit)) {
      const eq = line.billingQtyPerOrderUnit ?? line.estimatedKgPerUnit;
      if (eq != null && eq > 0 && nextReceived > 0) {
        merged = {
          ...merged,
          receivedWeightKg: Math.round(nextReceived * eq * 1000) / 1000,
        };
      }
      if (line.billingUnit === 'kg') {
        const ppk =
          line.pricePerBillingUnit ??
          (eq != null &&
          eq > 0 &&
          line.basePricePerUnit != null &&
          Number.isFinite(line.basePricePerUnit) &&
          line.basePricePerUnit > 0
            ? line.basePricePerUnit / eq
            : null);
        if (ppk != null && ppk > 0) {
          merged = { ...merged, receivedPricePerKg: Math.round(ppk * 10000) / 10000 };
        }
      }
    }

    const { lineTotal, effectivePricePerUnit } = receptionLineTotals(merged);
    const billingQty = markOk ? billingQuantityForLine(merged) : 0;

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
            receivedPricePerKg: merged.receivedPricePerKg,
            incidentType: nextIncidentType,
            incidentNotes: nextIncidentNotes,
            lineTotal: markOk ? lineTotal : 0,
            pricePerUnit: markOk ? effectivePricePerUnit : item.pricePerUnit,
          };
        });
        return { ...order, items: nextItems };
      }),
    );

    const afterReceive = async () => {
      if (line.unit === 'kg') {
        await updateOrderItemReceivedWeightKg(supabase, localId, itemId, null);
        await updateOrderItemPrice(supabase, localId, itemId, line.pricePerUnit, billingQty);
        return;
      }
      if (unitCanDeclareScaleKgOnReception(line.unit)) {
        await updateOrderItemReceivedWeightKg(
          supabase,
          localId,
          itemId,
          merged.receivedWeightKg != null && merged.receivedWeightKg > 0 ? merged.receivedWeightKg : null,
        );
      }
      const usePersist =
        markOk &&
        unitCanDeclareScaleKgOnReception(line.unit) &&
        merged.receivedWeightKg != null &&
        merged.receivedWeightKg > 0 &&
        (merged.unit === 'kg' ||
          (merged.receivedPricePerKg != null && merged.receivedPricePerKg > 0));
      if (usePersist) {
        await persistReceptionItemTotals(supabase, localId, merged);
      } else if (markOk) {
        await updateOrderItemPrice(supabase, localId, itemId, line.pricePerUnit, billingQty);
      } else {
        await updateOrderItemPrice(supabase, localId, itemId, line.basePricePerUnit ?? line.pricePerUnit, 0);
      }
    };

    void Promise.all([
      updateOrderItemReceived(supabase, localId, itemId, nextReceived),
      updateOrderItemIncident(supabase, localId, itemId, markOk ? { type: null, notes: '' } : { type: 'missing', notes: 'No recibido' }),
    ])
      .then(() => afterReceive())
      .then(() => {
        if (!markOk && orderForNotify) {
          scheduleIncidenciaRecepcionNotifyDebounced(orderForNotify);
        }
        return reloadOrders();
      })
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
          await updateOrderItemReceived(supabase, localId, item.id, merged.receivedQuantity);
          if (unitCanDeclareScaleKgOnReception(item.unit)) {
            await updateOrderItemReceivedWeightKg(supabase, localId, item.id, parsedWeight);
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

  const commitSentOrderAsReceived = React.useCallback(
    (orderId: string, opts?: { rethrow?: boolean }) => {
      if (!localId) return Promise.resolve();
      const supabase = getSupabaseClient();
      if (!supabase) return Promise.resolve();
      const snap = orders.find((o) => o.id === orderId);
      if (!snap) return Promise.resolve();
      setMessage(null);
      setReceivingOrderId(orderId);
      return flushOrderReceptionDrafts(snap)
        .then(() =>
          setOrderStatus(supabase, localId, snap.id, 'received', new Date().toISOString(), {
            expectedUpdatedAt: snap.updatedAt,
          }),
        )
        .then(() => {
          const nowIso = new Date().toISOString();
          registerPendingReceivedOrder(orderId, nowIso);
          setOrders((prev) =>
            prev.map((o) =>
              o.id === orderId
                ? { ...o, status: 'received', receivedAt: nowIso, priceReviewArchivedAt: undefined, updatedAt: nowIso }
                : o,
            ),
          );
          setExpandedSentId((id) => (id === orderId ? null : id));
          setMessage('Pedido marcado como recibido.');
          const supa = getSupabaseClient();
          if (supa && localId) {
            void notifyPedidoRecibido(supa, {
              localId,
              userId,
              actorName: actorLabel(displayName, loginUsername),
              supplierName: snap.supplierName,
              orderId: snap.id,
            });
            if (receivedOrderHasAttention(snap)) {
              notifyIncidenciaRecepcionDeduped(supa, {
                localId,
                userId,
                actorName: actorLabel(displayName, loginUsername),
                supplierName: snap.supplierName,
                orderId: snap.id,
              });
            }
          }
          dispatchPedidosDataChanged();
        })
        .catch((err: Error) => {
          setMessage(err.message);
          if (opts?.rethrow) throw err;
        })
        .finally(() => setReceivingOrderId((id) => (id === orderId ? null : id)));
    },
    [
      dispatchPedidosDataChanged,
      displayName,
      flushOrderReceptionDrafts,
      localId,
      loginUsername,
      orders,
      registerPendingReceivedOrder,
      reloadOrders,
      setOrders,
      userId,
    ],
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
  const receivedOrders = React.useMemo(
    () => orders.filter((row) => row.status === 'received'),
    [orders],
  );

  /** Histórico recibidos: mes (YYYY-MM) → pedidos, orden global por recepción descendente. */
  const historicoReceivedByMonth = React.useMemo(() => {
    const sorted = [...receivedOrders].sort((a, b) => {
      const at = a.receivedAt ? new Date(a.receivedAt).getTime() : new Date(a.createdAt).getTime();
      const bt = b.receivedAt ? new Date(b.receivedAt).getTime() : new Date(b.createdAt).getTime();
      return bt - at;
    });
    const byKey = new Map<string, PedidoOrder[]>();
    for (const o of sorted) {
      const d = o.receivedAt ? new Date(o.receivedAt) : new Date(o.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const list = byKey.get(key);
      if (list) list.push(o);
      else byKey.set(key, [o]);
    }
    const keys = [...byKey.keys()].sort((a, b) => b.localeCompare(a));
    return keys.map((key) => {
      const [y, mon] = key.split('-').map(Number);
      const labelRaw = new Date(y, mon - 1, 1).toLocaleDateString('es-ES', {
        month: 'long',
        year: 'numeric',
      });
      const label = labelRaw.charAt(0).toUpperCase() + labelRaw.slice(1);
      return { key, label, orders: byKey.get(key)! };
    });
  }, [receivedOrders]);

  const OIDO_CHEF_TTS_LS_KEY = 'oido-chef-tts-v1';
  const OIDO_CHEF_TTS_NATURAL_LS_KEY = 'oido-chef-tts-natural-v1';
  const oidoChefAiEnabled = process.env.NEXT_PUBLIC_OIDO_CHEF_AI === '1';
  const [assistantTtsEnabled, setAssistantTtsEnabled] = React.useState(false);
  const [assistantTtsNatural, setAssistantTtsNatural] = React.useState(false);
  React.useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage.getItem(OIDO_CHEF_TTS_LS_KEY) === '1') {
        setAssistantTtsEnabled(true);
      }
      if (oidoChefAiEnabled && window.localStorage.getItem(OIDO_CHEF_TTS_NATURAL_LS_KEY) === '1') {
        setAssistantTtsNatural(true);
      }
    } catch {
      // ignore
    }
  }, [oidoChefAiEnabled]);

  const assistantProactiveHint = React.useMemo(() => {
    const bits: string[] = [];
    if (sentOrders.length > 0) {
      bits.push(`${sentOrders.length} pedido(s) enviado(s) pendientes de recepción.`);
    }
    try {
      const nd = getPedidoDrafts().filter((d) => d.status === 'draft').length;
      if (nd > 0) bits.push(`${nd} borrador(es) de pedido en este dispositivo.`);
    } catch {
      // ignore
    }
    return bits.join(' ');
  }, [sentOrders]);

  React.useEffect(() => {
    if (!assistantReply) return;
    if (typeof window === 'undefined') return;

    if (assistantTtsNatural && oidoChefAiEnabled) {
      window.speechSynthesis?.cancel();
      const ac = new AbortController();
      const audio = new Audio();
      const urlRef = { current: null as string | null };
      void (async () => {
        try {
          const supabase = getSupabaseClient();
          if (!supabase) return;
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;
          if (!token) return;
          const res = await fetch('/api/ai/oido-chef/tts', {
            method: 'POST',
            signal: ac.signal,
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: assistantReply.slice(0, 3800) }),
          });
          if (!res.ok) return;
          const blob = await res.blob();
          if (ac.signal.aborted) return;
          urlRef.current = URL.createObjectURL(blob);
          audio.src = urlRef.current;
          await audio.play();
        } catch {
          /* abort o fallo de red */
        }
      })();
      return () => {
        ac.abort();
        audio.pause();
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      };
    }

    if (!assistantTtsEnabled) return;
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(assistantReply.slice(0, 900));
    u.lang = 'es-ES';
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
    return () => {
      window.speechSynthesis.cancel();
    };
  }, [assistantReply, assistantTtsEnabled, assistantTtsNatural, oidoChefAiEnabled]);

  const pushAssistantHistory = React.useCallback((command: string, result: string) => {
    setAssistantHistory((prev) => {
      const next: AssistantHistoryRow[] = [
        { at: new Date().toISOString(), command: command.trim(), result: result.trim() },
        ...prev,
      ].slice(0, 20);
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(ASSISTANT_HISTORY_LS_KEY, JSON.stringify(next));
        }
      } catch {
        // ignore localStorage errors
      }
      return next;
    });
  }, []);

  const runAssistantCommandFromText = React.useCallback(async (inputText: string) => {
    const raw = inputText.trim();
    if (!raw) return;
    const normalized = normalizeText(raw);
    setAssistantPendingAction(null);
    setAssistantBusy(true);

    try {
      if (
        normalized === 'ayuda' ||
        normalized === 'help' ||
        normalized === 'comandos' ||
        normalized === 'ejemplos' ||
        normalized === 'que puedes hacer' ||
        normalized === 'que sabes hacer' ||
        normalized === 'para que sirves'
      ) {
        const msg = [
          'Puedo leer frases naturales y palabras sueltas.',
          '',
          '· Pedidos: «resumen», «pendientes», enviados/recibidos, recepción, proveedores, precios.',
          '· Limpieza: «limpieza» o «qué toca limpiar hoy».',
          '· APPCC: «appcc», «estado APPCC hoy», temperaturas, aceite.',
          '· Consumo interno: «comida», registros y anulaciones (ver ejemplos al fallar un comando).',
          '',
          'Tip: una sola palabra suele bastar (ej. «limpieza», «recepción», «appcc»).',
          '',
          oidoChefAiEnabled
            ? 'Con IA activada: puedes preguntar en lenguaje natural (p. ej. precios de la semana); la respuesta usa los pedidos cargados en esta pantalla.'
            : 'Para preguntas libres con ChatGPT (API OpenAI), activa NEXT_PUBLIC_OIDO_CHEF_AI en el despliegue y OPENAI_API_KEY en el servidor.',
        ].join('\n');
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        return;
      }

      const openPendientesEntregaMatch =
        (normalized.includes('abre') ||
          normalized.includes('abrir') ||
          normalized.includes('muestra') ||
          normalized.includes('desplega')) &&
        normalized.includes('pendiente') &&
        (normalized.includes('entrega') ||
          normalized.includes('enviado') ||
          normalized.includes('recepcion') ||
          normalized.includes('pedidos') ||
          normalized.includes('pedido'));
      if (openPendientesEntregaMatch) {
        setPendientesEntregaAccordionOpen(true);
        const msg = 'Listo: desplegado «Pendientes de entrega». Baja un poco para ver los pedidos.';
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        window.requestAnimationFrame(() => {
          document.getElementById('pedidos-pendientes-entrega')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        return;
      }

      const openHistoricoRecibidosMatch =
        (normalized.includes('abre') ||
          normalized.includes('abrir') ||
          normalized.includes('muestra') ||
          normalized.includes('desplega')) &&
        (normalized.includes('historico') ||
          normalized.includes('historial') ||
          ((normalized.includes('recibido') || normalized.includes('recibidos')) &&
            (normalized.includes('pedido') ||
              normalized.includes('pedidos') ||
              normalized.includes('almacen'))));
      if (openHistoricoRecibidosMatch) {
        setHistoricoRecibidosAccordionOpen(true);
        const msg = 'Listo: desplegado «Histórico recibidos».';
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        window.requestAnimationFrame(() => {
          document.getElementById('pedidos-historico-recibidos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        return;
      }

      const topicJump = matchAssistantSingleTopicNav(normalized);
      if (topicJump) {
        router.push(topicJump.href);
        setAssistantReply(topicJump.message);
        pushAssistantHistory(raw, topicJump.message);
        return;
      }

      const navVerb =
        /\b(abre|abrir|vamos|entra|entrar|ir|lleva|llevame|muestrame)\b/.test(normalized) ||
        normalized.startsWith('ir ') ||
        normalized.includes('llevame a');
      const resolveNavHrefFromAssistant = (): string | null => {
        if (!navVerb) return null;
        const n = normalized;
        if (n.includes('nuevo pedido') || (n.includes('pedido') && n.includes('nuevo'))) return '/pedidos/nuevo';
        if (n.includes('proveedor')) return '/pedidos/proveedores';
        if (n.includes('articulo')) return '/pedidos/articulos';
        if (n.includes('calendario') || (n.includes('entrega') && n.includes('calendario'))) return '/pedidos/calendario';
        if (n.includes('recepcion') || n.includes('albaran')) return '/pedidos/recepcion';
        if ((n.includes('compras') && n.includes('mes')) || (n.includes('historial') && n.includes('mes')))
          return '/pedidos/historial-mes';
        if (
          (n.includes('limpieza') || n.includes('limpiar')) &&
          !n.includes('recibido') &&
          !n.includes('recibidos')
        ) {
          if (n.includes('cronograma')) return '/appcc/limpieza/cronograma';
          if (n.includes('tarea')) return '/appcc/limpieza/tareas';
          return '/appcc/limpieza';
        }
        if (n.includes('temperatura')) return '/appcc/temperaturas';
        if (n.includes('aceite') && !n.includes('hoy') && !n.includes('registro')) return '/appcc/aceite';
        if (
          (n.includes('appcc') || n.includes('haccp')) &&
          !n.includes('hoy') &&
          !n.includes('estado') &&
          !n.includes('resumen') &&
          !n.includes('como va')
        ) {
          return '/appcc';
        }
        if (
          (n.includes('precio') || n.includes('precios')) &&
          !n.includes('esta semana') &&
          !n.includes('pague') &&
          !n.includes('pagamos') &&
          !n.includes('comida')
        ) {
          return '/pedidos/precios';
        }
        if (
          (n.includes('comida personal') ||
            n.includes('comida de personal') ||
            n.includes('consumo interno')) &&
          !n.includes('registra') &&
          !n.includes('anula') &&
          !n.includes('cuantas') &&
          !n.includes('cuantos') &&
          !n.includes('trabajador')
        ) {
          return '/comida-personal';
        }
        return null;
      };
      const navHrefAssistant = resolveNavHrefFromAssistant();
      if (navHrefAssistant) {
        router.push(navHrefAssistant);
        const msg = `Abriendo ${navHrefAssistant.replace(/^\//, '')}…`;
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        return;
      }

      const resumenDiaMatch =
        normalized === 'resumen' ||
        (normalized.includes('resumen') &&
          (normalized.includes('operativo') ||
            normalized.includes('diario') ||
            normalized.includes('del dia') ||
            normalized.includes('de hoy'))) ||
        normalized.includes('como vamos') ||
        (normalized.includes('que tal') &&
          (normalized.includes('vamos') || normalized.includes('dia') || normalized.includes('hoy')));
      if (resumenDiaMatch) {
        const today = new Date().toISOString().slice(0, 10);
        const nSent = sentOrders.length;
        const nRec = orders.filter((o) => o.status === 'received').length;
        let mealsPart = 'Consumo interno hoy: (sin sesión o datos).';
        let cleanPart = 'Limpieza hoy: (sin sesión o datos).';
        const supabase = localId ? getSupabaseClient() : null;
        if (localId && supabase) {
          const [mealsRes, tasks, units, schedule] = await Promise.all([
            supabase
              .from('staff_meal_records')
              .select('people_count,total_cost_eur')
              .eq('local_id', localId)
              .eq('meal_date', today)
              .is('voided_at', null),
            fetchCleaningTasks(supabase, localId, true),
            fetchAppccColdUnits(supabase, localId, true),
            fetchCleaningWeekdayItems(supabase, localId),
          ]);
          if (mealsRes.error) throw new Error(mealsRes.error.message);
          const mrows = mealsRes.data ?? [];
          const unitsMeal = mrows.reduce((acc, r) => acc + Number((r as { people_count: number }).people_count ?? 0), 0);
          const costEur = mrows.reduce(
            (acc, r) => acc + Number((r as { total_cost_eur: number | null }).total_cost_eur ?? 0),
            0,
          );
          mealsPart = `Consumo interno hoy: ${mrows.length} líneas, ${unitsMeal.toFixed(0)} uds, ${costEur.toFixed(2)} €.`;
          const wd = new Date().getDay();
          const srows = schedule.filter((s) => s.weekday === wd);
          if (srows.length === 0) {
            cleanPart = 'Limpieza hoy: nada programado en cronograma.';
          } else {
            const lines = srows
              .map((r) => {
                if (r.task_id) return tasks.find((t) => t.id === r.task_id)?.title ?? null;
                if (r.cold_unit_id) return units.find((u) => u.id === r.cold_unit_id)?.name ?? null;
                return null;
              })
              .filter(Boolean) as string[];
            cleanPart = `Limpieza hoy: ${lines.join(' · ')}.`;
          }
        }
        const ctx = (localName ?? localCode ?? '').trim();
        const pfx = ctx ? `(${ctx}) ` : '';
        const msg = `${pfx}Resumen del día · Pedidos enviados: ${nSent}. · Recibidos (en pantalla): ${nRec}. · ${mealsPart} · ${cleanPart}`;
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        return;
      }

      const weekMatch =
        normalized.includes('esta semana') &&
        (normalized.includes('a que precio') ||
          normalized.includes('precio pague') ||
          normalized.includes('precio pagamos') ||
          normalized.includes('precio de') ||
          normalized.includes('precio compre') ||
          normalized.includes('cuanto pague') ||
          normalized.includes('cuanto pagamos') ||
          normalized.includes('cuanto pago'));
      if (weekMatch) {
        let stem = normalized
          .replace(/^oido\s*chef\s*[,:]?\s+/i, '')
          .replace(/^chef\s+[,:]?\s+/i, '')
          .replace(/\s+esta\s+semana$/i, '')
          .trim();

        let productPart = '';
        const compraCap = stem.match(
          /a\s+que\s+precio\s+(?:compre|compramos|compraste|compraron|pague|pagamos|pago)\s+(?:el|la|los|las)?\s*(.+)/i,
        );
        if (compraCap?.[1]?.trim()) {
          productPart = compraCap[1].trim();
        } else {
          productPart = stem;
          const patterns: RegExp[] = [
            /^precio de\s+/,
            /^busca(?:me)?(?:\s+a)?\s+que\s+precio\s+pague\s+/,
            /^busca(?:me)?(?:\s+a)?\s+que\s+precio\s+pagamos\s+/,
            /^a\s+que\s+precio\s+pague\s+/,
            /^a\s+que\s+precio\s+pagamos\s+/,
            /^a\s+que\s+precio\s+/,
            /^cuanto\s+pague\s+(?:el|la|los|las)?\s*/,
            /^cuanto\s+pagamos\s+(?:el|la|los|las)?\s*/,
            /^cuanto\s+pago\s+(?:el|la|los|las)?\s*/,
          ];
          for (const p of patterns) {
            productPart = productPart.replace(p, '');
          }
        }
        productPart = productPart.replace(/\s+/g, ' ').trim();
        if (!productPart) {
          const msg = 'No entendí el producto. Ejemplo: «chef, ¿a qué precio compré la mantequilla esta semana?».';
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        const now = new Date();
        const from = new Date(now);
        from.setDate(now.getDate() - 7);
        const fromTs = from.getTime();
        const productNeedle = normalizeText(productPart).replace(/^el\s+|^la\s+|^los\s+|^las\s+/, '');
        const rows: Array<{ supplier: string; product: string; price: number; date: string; ts: number }> = [];
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
              ts: when,
            });
          }
        }
        if (rows.length === 0) {
          const msg = `No encontré compras recientes para "${productPart}" en los últimos 7 días.`;
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        rows.sort((a, b) => b.ts - a.ts);
        const prices = rows.map((r) => r.price);
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const last = rows[0];
        const msg = `${last.product}: media ${avg.toFixed(2)} €, min ${min.toFixed(2)} €, max ${max.toFixed(2)} € (último: ${last.price.toFixed(2)} € en ${last.supplier}, ${last.date}).`;
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        return;
      }

      const lastPurchaseMatch =
        (normalized.includes('ultima compra') ||
          normalized.includes('ultimo precio de compra') ||
          normalized.includes('cuando compramos')) &&
        !normalized.includes('esta semana');
      if (lastPurchaseMatch) {
        let productPart = normalized
          .replace(/.*ultima compra\s+(?:de|del|la|el)\s+/i, '')
          .replace(/.*ultimo precio de compra\s+(?:de|del|la|el)\s+/i, '')
          .replace(/.*cuando compramos\s+(?:de|del|la|el)\s+/i, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (!productPart) {
          const msg = 'Di el producto. Ejemplo: "última compra de lechuga".';
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        const productNeedle = normalizeText(productPart).replace(/^el\s+|^la\s+|^los\s+|^las\s+/, '');
        type Hit = { supplier: string; product: string; price: number; date: string; when: number };
        const hits: Hit[] = [];
        for (const o of orders) {
          const when = new Date(o.receivedAt ?? o.sentAt ?? o.createdAt).getTime();
          if (!Number.isFinite(when)) continue;
          for (const i of o.items) {
            if (!normalizeText(i.productName).includes(productNeedle)) continue;
            hits.push({
              supplier: o.supplierName,
              product: i.productName,
              price: i.pricePerUnit,
              date: new Date(o.receivedAt ?? o.sentAt ?? o.createdAt).toLocaleDateString('es-ES'),
              when,
            });
          }
        }
        hits.sort((a, b) => b.when - a.when);
        if (hits.length === 0) {
          const msg = `No encontré compras de "${productPart}" en el histórico cargado.`;
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        const h = hits[0];
        const msg = `Última compra: ${h.product} a ${h.price.toFixed(2)} € (${h.supplier}, ${h.date}).`;
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        return;
      }

      const estadoAppccHoyMatch =
        normalized === 'appcc' ||
        normalized === 'haccp' ||
        (normalized.includes('appcc') &&
          (normalized.includes('hoy') ||
            normalized.includes('estado') ||
            normalized.includes('resumen') ||
            normalized.includes('como va')));
      if (estadoAppccHoyMatch) {
        if (!localId) return;
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const dateKeyTemps = appccTemperaturasOperationalDateKey();
        const dateKey = madridDateKey();
        const tempSlots: AppccSlot[] = ['manana', 'noche'];
        const [units, readings, fryers, oilEvents] = await Promise.all([
          fetchAppccColdUnits(supabase, localId, true),
          fetchAppccReadingsForDate(supabase, localId, dateKeyTemps),
          (async () => {
            try {
              return await fetchAppccFryers(supabase, localId, true);
            } catch {
              return [];
            }
          })(),
          (async () => {
            try {
              return await fetchOilEventsForDate(supabase, localId, dateKey);
            } catch {
              return [];
            }
          })(),
        ]);
        const bySlot = readingsByUnitAndSlot(readings);
        const missing: string[] = [];
        for (const u of units) {
          for (const s of tempSlots) {
            if (!bySlot.get(`${u.id}:${s}`)) {
              missing.push(`${u.name} (${APPCC_SLOT_LABEL[s]})`);
            }
          }
        }
        const tempLine =
          units.length === 0
            ? 'Temperaturas: sin equipos frío activos.'
            : missing.length === 0
              ? 'Registros de temperatura: mañana y noche completas para el día operativo actual.'
              : `Faltan registros de temperatura (día operativo): ${missing.join(' · ')}.`;
        const oilLine =
          fryers.length === 0
            ? 'Aceite: sin freidoras configuradas.'
            : oilEvents.length === 0
              ? 'Aceite: hoy sin eventos registrados.'
              : `Aceite hoy: ${oilEvents.length} evento(s) en ${dateKey}.`;
        const msg = `APPCC hoy · ${tempLine} · ${oilLine}`;
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        return;
      }

      const tempFaltantesMatch =
        normalized === 'temperaturas' ||
        normalized === 'temperatura' ||
        ((normalized.includes('temperatura') || normalized.includes('temperaturas')) &&
          (normalized.includes('falta') || normalized.includes('faltan') || normalized.includes('pendiente')));
      if (tempFaltantesMatch) {
        if (!localId) return;
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const dateKey = appccTemperaturasOperationalDateKey();
        const tempSlots: AppccSlot[] = ['manana', 'noche'];
        const [units, readings] = await Promise.all([
          fetchAppccColdUnits(supabase, localId, true),
          fetchAppccReadingsForDate(supabase, localId, dateKey),
        ]);
        const bySlot = readingsByUnitAndSlot(readings);
        const missing: string[] = [];
        for (const u of units) {
          for (const s of tempSlots) {
            if (!bySlot.get(`${u.id}:${s}`)) {
              missing.push(`${u.name} (${APPCC_SLOT_LABEL[s]})`);
            }
          }
        }
        const msg =
          missing.length === 0
            ? 'No faltan registros de temperatura para el día operativo actual (mañana/noche).'
            : `Faltan registros de temperatura: ${missing.join(' · ')}.`;
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        return;
      }

      const aceiteHoyMatch =
        normalized === 'aceite' ||
        (normalized.includes('aceite') && (normalized.includes('hoy') || normalized.includes('registro')));
      if (aceiteHoyMatch) {
        if (!localId) return;
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const dateKey = madridDateKey();
        const events = await fetchOilEventsForDate(supabase, localId, dateKey);
        const msg =
          events.length === 0
            ? 'Aceite: hoy no hay eventos registrados.'
            : `Aceite hoy (${events.length}): abre APPCC → Aceite para detalle.`;
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        return;
      }

      const topMermasMesMatch =
        (normalized.includes('merma') || normalized.includes('mermas')) &&
        (normalized.includes('top') || normalized.includes('ranking') || normalized.includes('mes'));
      if (topMermasMesMatch) {
        if (!localId) return;
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const { products, mermas } = await fetchProductsAndMermas(supabase, localId);
        const now = new Date();
        const ms = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const monthMermas = mermas.filter((m) => new Date(m.occurredAt).getTime() >= ms);
        const top = topByValue(monthMermas, products, 5);
        if (top.length === 0) {
          const msg = 'No hay mermas registradas este mes.';
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        const msg = `Top mermas del mes (€): ${top.map((t) => `${t.name} ${t.value.toFixed(2)} €`).join(' · ')}.`;
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        return;
      }

      const sentOrdersSummaryMatch =
        (normalized.includes('pedido') || normalized.includes('pedidos')) &&
        (normalized.includes('enviado') ||
          normalized.includes('por recibir') ||
          normalized.includes('pendiente') ||
          normalized.includes('recepcion'));
      if (sentOrdersSummaryMatch) {
        if (sentOrders.length === 0) {
          const msg = 'No hay pedidos en estado enviado.';
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        const fmtDelivery = (o: PedidoOrder) => {
          const raw = o.deliveryDate ?? o.createdAt.slice(0, 10);
          const parsed = new Date(`${raw}T00:00:00`);
          return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString('es-ES');
        };
        const maxList = 8;
        const listed = sentOrders.slice(0, maxList);
        const tail =
          sentOrders.length > maxList ? ` …y ${sentOrders.length - maxList} más.` : '';
        const msg = `Pedidos enviados (${sentOrders.length}): ${listed
          .map((o) => `${o.supplierName} (entrega ${fmtDelivery(o)})`)
          .join(' · ')}${tail}`;
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        return;
      }

      const whatsappPedidoMatch =
        (normalized.includes('whatsapp') || normalized.includes('guasap')) &&
        (normalized.includes('pedido') || normalized.includes('proveedor'));
      const waSupplierCap =
        raw.match(/\b(?:whatsapp|guasap)\b.*?\bde\s+(.+)/i) ||
        raw.match(/\b(?:whatsapp|guasap)\b.*?\bproveedor\s+(.+)/i);
      if (whatsappPedidoMatch) {
        const needleRaw = waSupplierCap?.[1]?.trim();
        const needle = needleRaw ? normalizeText(needleRaw) : '';
        const candidates = needle
          ? sentOrders.filter((o) => normalizeText(o.supplierName).includes(needle))
          : [...sentOrders];
        if (candidates.length === 0) {
          const msg = needleRaw
            ? `No hay pedido enviado cuyo proveedor coincida con "${needleRaw}".`
            : 'No hay pedidos enviados.';
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        if (candidates.length > 1 && !needle) {
          const msg = 'Hay varios pedidos enviados; di por ejemplo: "WhatsApp pedido de Makro".';
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        if (candidates.length > 1) {
          const msg = `Varios proveedores coinciden con "${needleRaw}". Sé más específico.`;
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        const sel = candidates[0];
        const phone = normalizeWhatsappPhone(sel.supplierContact);
        if (!phone) {
          const msg = `El proveedor "${sel.supplierName}" no tiene teléfono válido en contacto.`;
          setAssistantReply(msg);
          setMessage(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        sendWhatsappOrder(sel, { viaAssistant: true });
        const okMsg = `Abriendo WhatsApp para ${sel.supplierName}.`;
        setAssistantReply(okMsg);
        pushAssistantHistory(raw, okMsg);
        return;
      }

      const receivedPedidosSummaryMatch =
        normalized.includes('recibido') &&
        (normalized.includes('cuantos') ||
          normalized.includes('cuantas') ||
          normalized.includes('resumen') ||
          normalized.includes('lista') ||
          normalized.includes('cuales') ||
          normalized.includes('hemos'));
      if (receivedPedidosSummaryMatch) {
        const n = orders.filter((o) => o.status === 'received').length;
        const msg =
          n === 0
            ? 'No hay pedidos en estado recibido en la carga actual.'
            : `Pedidos recibidos en pantalla: ${n}. Di "abre histórico recibidos" para ver el desplegable.`;
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        return;
      }

      const draftsPedidosMatch = normalized.includes('borrador');
      if (draftsPedidosMatch) {
        const drafts = getPedidoDrafts().filter((d) => d.status === 'draft');
        if (drafts.length === 0) {
          const msg = 'No hay borradores de pedido guardados en este dispositivo.';
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        const maxList = 6;
        const listed = drafts.slice(0, maxList);
        const tail = drafts.length > maxList ? ` …y ${drafts.length - maxList} más.` : '';
        const msg = `Borradores (${drafts.length}): ${listed
          .map((d) => `${d.supplierName} (${d.items.length} líneas)`)
          .join(' · ')}${tail}. Abre «+ Nuevo pedido» para continuar uno.`;
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        return;
      }

      const workersComidaListMatch =
        (normalized.includes('trabajador') || normalized.includes('lista') || normalized.includes('quien')) &&
        (normalized.includes('comida') || normalized.includes('personal')) &&
        !normalized.includes('registra');
      if (workersComidaListMatch) {
        if (!localId) return;
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const workers = await fetchStaffMealWorkers(supabase, localId);
        if (workers.length === 0) {
          const msg = 'No hay trabajadores activos en consumo interno (o aún no está configurada la lista).';
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        const msg = `Trabajadores (consumo interno): ${workers.map((w) => w.name).join(', ')}.`;
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        return;
      }

      const mealsTodayMatch =
        (normalized.includes('cuantas comidas') &&
          (normalized.includes('hoy') || normalized.includes('de hoy') || normalized.includes('registramos hoy'))) ||
        ((normalized.includes('hoy') || normalized.includes('de hoy')) &&
          normalized.includes('comida') &&
          !normalized.includes('registra') &&
          !normalized.includes('limpia') &&
          (normalized.includes('cuantas') ||
            normalized.includes('cuanto') ||
            normalized.includes('coste') ||
            normalized.includes('cuesta') ||
            normalized.includes('gasto') ||
            normalized.includes('resumen') ||
            normalized.includes('llevamos')));
      if (mealsTodayMatch) {
        const today = new Date().toISOString().slice(0, 10);
        if (!localId) return;
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const { data, error } = await supabase
          .from('staff_meal_records')
          .select('people_count,total_cost_eur')
          .eq('local_id', localId)
          .eq('meal_date', today)
          .is('voided_at', null);
        if (error) throw new Error(error.message);
        const units = (data ?? []).reduce((acc, r) => acc + Number((r as { people_count: number }).people_count ?? 0), 0);
        const records = (data ?? []).length;
        const costEur = (data ?? []).reduce(
          (acc, r) => acc + Number((r as { total_cost_eur: number | null }).total_cost_eur ?? 0),
          0,
        );
        const msg = `Hoy lleváis ${records} líneas de consumo interno (${units.toFixed(0)} uds), coste acumulado ${costEur.toFixed(2)} €.`;
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        return;
      }

      const ownMealMatch = normalized.match(/registra(?:r)?\s+comida\s+propia\s+(?:para|de)\s+(.+)/);
      if (ownMealMatch) {
        if (!localId) return;
        const workerNeedle = normalizeText(ownMealMatch[1]).trim();
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const workers = await fetchStaffMealWorkers(supabase, localId);
        const matches = workers.filter((w) => normalizeText(w.name).includes(workerNeedle));
        if (matches.length === 0) {
          const msg = `No encontré trabajador para "${ownMealMatch[1]}".`;
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        if (matches.length > 1) {
          const msg = `Hay varios trabajadores que coinciden con "${ownMealMatch[1]}". Sé más específico.`;
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        const worker: StaffMealWorker = matches[0];
        const today = new Date().toISOString().slice(0, 10);
        await createStaffMealRecord(supabase, localId, {
          service: 'comida',
          mealDate: today,
          peopleCount: 1,
          unitCostEur: 0,
          workerId: worker.id,
          workerName: worker.name,
          sourceProductId: null,
          sourceProductName: 'Comida propia',
          notes: 'Registrado desde Oído Chef',
        });
        const msg = `Registrado: comida propia para ${worker.name} (hoy, coste 0).`;
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        return;
      }

      const voidWorkerCap = raw.match(/\b(?:anula|anular|deshaz|deshacer)\s+comida\s+(?:de|para)\s+(.+)/i);
      const voidComidaHoyMatch =
        (normalized.includes('anula') ||
          normalized.includes('anular') ||
          normalized.includes('deshaz') ||
          normalized.includes('deshacer') ||
          (normalized.includes('borra') && normalized.includes('ultim')) ||
          (normalized.includes('elimina') && normalized.includes('ultim'))) &&
        normalized.includes('comida') &&
        !normalized.includes('registra');
      if (voidWorkerCap?.[1]?.trim() && voidComidaHoyMatch) {
        if (!localId) return;
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const today = new Date().toISOString().slice(0, 10);
        const needle = normalizeText(voidWorkerCap[1]).trim();
        const { data, error } = await supabase
          .from('staff_meal_records')
          .select('id,created_at,worker_name_snapshot,source_product_name,notes')
          .eq('local_id', localId)
          .eq('meal_date', today)
          .is('voided_at', null)
          .order('created_at', { ascending: false })
          .limit(40);
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as Array<{
          id: string;
          worker_name_snapshot: string | null;
          source_product_name: string | null;
          notes: string | null;
        }>;
        const hit = rows.find((r) => {
          const blob = normalizeText(
            [r.worker_name_snapshot, r.source_product_name, r.notes].filter(Boolean).join(' '),
          );
          return blob.includes(needle);
        });
        if (!hit) {
          const msg = `No encontré un registro de comida de hoy que coincida con "${voidWorkerCap[1].trim()}".`;
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        await voidStaffMealRecord(supabase, localId, hit.id);
        const msg = `Anulado el registro de comida más reciente que coincidía con "${voidWorkerCap[1].trim()}".`;
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        return;
      }
      if (voidComidaHoyMatch) {
        if (!localId) return;
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const today = new Date().toISOString().slice(0, 10);
        const { data, error } = await supabase
          .from('staff_meal_records')
          .select('id,worker_name_snapshot,source_product_name')
          .eq('local_id', localId)
          .eq('meal_date', today)
          .is('voided_at', null)
          .order('created_at', { ascending: false })
          .limit(1);
        if (error) throw new Error(error.message);
        const row = (data ?? [])[0] as { id: string; worker_name_snapshot: string | null; source_product_name: string | null } | undefined;
        if (!row) {
          const msg = 'No hay registros de consumo interno de hoy para anular.';
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        await voidStaffMealRecord(supabase, localId, row.id);
        const who = row.worker_name_snapshot?.trim() || row.source_product_name?.trim() || 'registro';
        const msg = `Anulado el último registro de comida de hoy (${who}).`;
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        return;
      }

      const cleaningTodayMatch =
        normalized === 'limpieza' ||
        normalized === 'limpiezas' ||
        normalized === 'limpiar' ||
        normalized === 'limpieza hoy' ||
        normalized === 'hoy limpieza' ||
        normalized.includes('que toca limpiar') ||
        normalized.includes('que toca limpiar hoy') ||
        (normalized.includes('que toca hoy') && !normalized.includes('pedido')) ||
        normalized.includes('limpieza de hoy') ||
        (normalized.includes('tareas de limpieza') && normalized.includes('hoy'));
      if (cleaningTodayMatch) {
        if (!localId) return;
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const [tasks, units, schedule] = await Promise.all([
          fetchCleaningTasks(supabase, localId, true),
          fetchAppccColdUnits(supabase, localId, true),
          fetchCleaningWeekdayItems(supabase, localId),
        ]);
        const wd = new Date().getDay();
        const rows = schedule.filter((s) => s.weekday === wd);
        if (rows.length === 0) {
          const msg = 'Hoy no hay tareas programadas en el cronograma de limpieza.';
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        const lines = rows
          .map((r) => {
            if (r.task_id) return tasks.find((t) => t.id === r.task_id)?.title ?? null;
            if (r.cold_unit_id) return units.find((u) => u.id === r.cold_unit_id)?.name ?? null;
            return null;
          })
          .filter(Boolean) as string[];
        const msg = `Hoy toca: ${lines.join(' · ')}`;
        setAssistantReply(msg);
        pushAssistantHistory(raw, msg);
        return;
      }

      const markReceivedMatch =
        (normalized.includes('marcar') || normalized.includes('marca')) && normalized.includes('recibid');
      const markReceivedSupplierCap = raw.match(
        /(?:marcar\s+|marca\s+)?(?:como\s+)?recibid[oa]\s+(?:el\s+)?(?:pedido\s+)?(?:de\s+|del\s+)(.+)/i,
      );
      if (markReceivedMatch && markReceivedSupplierCap?.[1]?.trim()) {
        const needle = normalizeText(markReceivedSupplierCap[1]).trim();
        const hits = sentOrders.filter((o) => normalizeText(o.supplierName).includes(needle));
        if (hits.length === 0) {
          const msg = `No hay pedido enviado de "${markReceivedSupplierCap[1].trim()}".`;
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        if (hits.length > 1) {
          const msg = 'Varios pedidos enviados coinciden; sé más específico con el nombre del proveedor.';
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        try {
          await commitSentOrderAsReceived(hits[0].id, { rethrow: true });
          const msg = `Listo: pedido de ${hits[0].supplierName} marcado como recibido.`;
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'No se pudo marcar como recibido (revisa kg/precios en recepción).';
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
        }
        return;
      }

      const updateMatch = normalized.match(/(?:oido chef[, ]*)?(?:actualiza|cambia|pon)\s+(.+?)\s+a\s+(\d+(?:[.,]\d{1,4})?)/);
      const updateSupplierHint = raw.match(/\s+en\s+(.+)\s*$/i)?.[1];
      const supplierNeedle = updateSupplierHint ? normalizeText(updateSupplierHint).trim() : '';
      if (updateMatch) {
        const productNeedle = normalizeText(updateMatch[1]).replace(/^el\s+|^la\s+|^los\s+|^las\s+/, '');
        const nextPrice = Number(updateMatch[2].replace(',', '.'));
        if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
          const msg = 'El precio no es válido.';
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        let candidates: Array<{ orderId: string; supplierName: string; itemId: string; productName: string; price: number }> = [];
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
        if (supplierNeedle) {
          const filtered = candidates.filter((c) => normalizeText(c.supplierName).includes(supplierNeedle));
          if (filtered.length > 0) {
            candidates = filtered;
          } else if (candidates.length > 0) {
            const msg = `Hay "${updateMatch[1]}" en enviados pero no con el proveedor indicado. Prueba otro nombre o quita "en …".`;
            setAssistantReply(msg);
            pushAssistantHistory(raw, msg);
            return;
          }
        }
        if (candidates.length === 0) {
          const msg = `No encontré "${updateMatch[1]}" en pedidos enviados.`;
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
          return;
        }
        if (candidates.length > 1) {
          const msg = `Encontré varias coincidencias de "${updateMatch[1]}". Sé más específico con proveedor o nombre completo (puedes decir "… en Makro").`;
          setAssistantReply(msg);
          pushAssistantHistory(raw, msg);
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
        const msg = `¿Confirmas actualizar ${c.productName} (${c.supplierName}) de ${c.price.toFixed(2)} € a ${nextPrice.toFixed(2)} €?`;
        setAssistantReply(msg);
        return;
      }

      if (oidoChefAiEnabled) {
        const supabaseAi = getSupabaseClient();
        if (supabaseAi) {
          const { data: sessionAi } = await supabaseAi.auth.getSession();
          const tokenAi = sessionAi.session?.access_token;
          if (tokenAi) {
            const context = buildOidoChefAiContext(orders, sentOrders, localName, localCode);
            const resAi = await fetch('/api/ai/oido-chef', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${tokenAi}`,
              },
              body: JSON.stringify({ message: raw, context }),
            });
            const j = (await resAi.json().catch(() => ({}))) as { ok?: boolean; reply?: string; reason?: string };
            if (resAi.ok && j.ok && typeof j.reply === 'string' && j.reply.trim()) {
              const reply = j.reply.trim();
              setAssistantReply(reply);
              pushAssistantHistory(raw, reply);
              return;
            }
          }
        }
      }

      const msg = ASSISTANT_FALLBACK_HINT;
      setAssistantReply(msg);
      pushAssistantHistory(raw, msg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error procesando el comando.';
      setAssistantReply(msg);
      pushAssistantHistory(raw, msg);
    } finally {
      setAssistantBusy(false);
    }
  }, [
    commitSentOrderAsReceived,
    localCode,
    localId,
    localName,
    oidoChefAiEnabled,
    orders,
    pushAssistantHistory,
    router,
    sendWhatsappOrder,
    sentOrders,
  ]);

  const runAssistantCommand = React.useCallback(() => {
    void runAssistantCommandFromText(assistantInput);
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
          const msg = `Actualizado: ${assistantPendingAction.productName} a ${assistantPendingAction.nextPrice.toFixed(2)} €.`;
          setAssistantReply(msg);
          pushAssistantHistory(
            `actualiza ${assistantPendingAction.productName} a ${assistantPendingAction.nextPrice.toFixed(2)}`,
            msg,
          );
          setAssistantPendingAction(null);
          dispatchPedidosDataChanged();
        })
        .catch((err: Error) => {
          void reloadOrders();
          const msg = `Error al actualizar: ${err.message}`;
          setAssistantReply(msg);
          pushAssistantHistory(
            `actualiza ${assistantPendingAction.productName} a ${assistantPendingAction.nextPrice.toFixed(2)}`,
            msg,
          );
          setAssistantPendingAction(null);
        });
    }
  }, [assistantPendingAction, localId, orders, pushAssistantHistory, reloadOrders, setOrders]);

  React.useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const raw = window.localStorage.getItem(ASSISTANT_HISTORY_LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AssistantHistoryRow[];
      if (Array.isArray(parsed)) setAssistantHistory(parsed.slice(0, 20));
    } catch {
      // ignore localStorage errors
    }
  }, []);

  /** Enlaces antiguos a /pedidos#oido-chef: llevar a la pantalla dedicada del asistente. */
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (searchParams.get('oido') === '1') return;
    if (window.location.hash !== '#oido-chef') return;
    router.replace('/pedidos?oido=1#oido-chef', { scroll: false });
  }, [router, searchParams]);

  const startAssistantVoice = React.useCallback(() => {
    if (assistantListening || assistantVoiceBootRef.current) return;
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
    assistantVoiceBootRef.current = true;
    const recognition = new Ctor();
    recognition.lang = 'es-ES';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    recognition.onstart = () => setAssistantListening(true);
    recognition.onerror = () => {
      assistantVoiceBootRef.current = false;
      setAssistantListening(false);
      setAssistantReply('No se pudo iniciar el micrófono. Revisa permisos del navegador.');
    };
    recognition.onend = () => {
      assistantVoiceBootRef.current = false;
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
        void runAssistantCommandFromText(text);
      }
    };
    assistantRecognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      assistantVoiceBootRef.current = false;
      setAssistantReply('No se pudo iniciar la escucha de voz.');
    }
  }, [assistantListening, runAssistantCommandFromText]);

  const scheduleAssistantVoiceFromBottomNav = React.useCallback(() => {
    window.requestAnimationFrame(() => {
      document.getElementById('oido-chef')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => {
        startAssistantVoice();
      }, 140);
    });
  }, [startAssistantVoice]);

  React.useEffect(() => {
    if (searchParams.get('voz') !== '1') return;
    router.replace('/pedidos?oido=1', { scroll: false });
    scheduleAssistantVoiceFromBottomNav();
  }, [router, scheduleAssistantVoiceFromBottomNav, searchParams]);

  React.useEffect(() => {
    try {
      if (window.sessionStorage.getItem(OIDO_CHEF_VOICE_NAV_FLAG) === '1') {
        window.sessionStorage.removeItem(OIDO_CHEF_VOICE_NAV_FLAG);
        scheduleAssistantVoiceFromBottomNav();
      }
    } catch {
      // ignore
    }
  }, [scheduleAssistantVoiceFromBottomNav]);

  React.useEffect(() => {
    const onNavVoice = () => scheduleAssistantVoiceFromBottomNav();
    window.addEventListener(OIDO_CHEF_START_VOICE_EVENT, onNavVoice);
    return () => window.removeEventListener(OIDO_CHEF_START_VOICE_EVENT, onNavVoice);
  }, [scheduleAssistantVoiceFromBottomNav]);

  const stopAssistantVoice = React.useCallback(() => {
    assistantRecognitionRef.current?.stop();
  }, []);

  React.useEffect(() => {
    return () => {
      assistantRecognitionRef.current?.stop();
      assistantRecognitionRef.current = null;
    };
  }, []);

  const renderSentOrderReceiveAndIncident = (
    order: PedidoOrder,
    opts?: { showExpandHint?: boolean },
  ) => {
    const hasAnyBad = order.items.some((item) => {
      const m = quickLineMarks[item.id];
      return m === 'bad' || (m === undefined && Boolean(item.incidentType));
    });
    const incidentOpen = Boolean(incidentOpenBySentOrderId[order.id]);
    const reviewed = Boolean(order.priceReviewArchivedAt);
    const showExpandHint = opts?.showExpandHint ?? false;
    return (
      <div className="mt-2 space-y-2 border-t border-amber-200/70 pt-2 text-left">
        {showExpandHint ? (
          <p className="text-center text-[11px] leading-snug text-zinc-600">
            Toca el recuadro del proveedor para desplegar líneas, marcar ✓/✗ y rellenar kg/precio recibido aquí mismo.
          </p>
        ) : (
          <>
            <button
              type="button"
              disabled={receivingOrderId === order.id}
              onClick={() => {
                void commitSentOrderAsReceived(order.id);
              }}
              className="flex w-full flex-col items-center justify-center gap-0.5 rounded-2xl bg-gradient-to-b from-[#4ADE80] to-[#16A34A] py-2 text-center text-[11px] font-black uppercase leading-tight tracking-wide text-white shadow-md shadow-emerald-900/20 ring-1 ring-white/25 transition active:scale-[0.99] disabled:opacity-90"
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
                'w-full rounded-lg px-3 py-2 text-center text-xs font-bold transition active:scale-[0.99]',
                reviewed
                  ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300'
                  : 'bg-zinc-200 text-zinc-700',
              ].join(' ')}
            >
              {reviewed
                ? 'Revisión de precios: completada (tocar para reabrir)'
                : 'Marcar revisión de precios como completada'}
            </button>
            <button
              type="button"
              onClick={() => toggleSentIncidentPanel(order)}
              className={[
                'w-full rounded-lg px-3 py-2 text-center text-xs font-bold transition',
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
          </>
        )}
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

  const assistantPanel = (
    <section
      id="oido-chef"
      className="scroll-mt-4 rounded-2xl border border-[#D32F2F]/15 bg-white p-4 shadow-sm ring-1 ring-zinc-900/5"
    >
      <div className="mb-3 flex items-center gap-3 border-b border-zinc-100 pb-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#D32F2F]/10">
          <Bot className="h-5 w-5 text-[#D32F2F]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-zinc-900">Oído Chef</h2>
          <p className="text-[11px] text-zinc-500">Precios, recepción, limpieza, comida del personal y más.</p>
        </div>
      </div>

      <div className="space-y-2">
        {assistantProactiveHint ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950 ring-1 ring-amber-200">
            {assistantProactiveHint}
          </p>
        ) : null}

        <div className="flex gap-2">
          <input
            type="text"
            value={assistantInput}
            onChange={(e) => setAssistantInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void runAssistantCommand();
              }
            }}
            placeholder="Escribe una orden..."
            className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-[#D32F2F]/50"
          />
          <button
            type="button"
            onClick={() => void runAssistantCommand()}
            disabled={assistantBusy}
            className="h-11 shrink-0 rounded-xl bg-zinc-900 px-3 text-xs font-bold text-white disabled:opacity-60"
          >
            {assistantBusy ? 'Pensando…' : 'Ejecutar'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (assistantListening) stopAssistantVoice();
              else startAssistantVoice();
            }}
            className={[
              'h-11 shrink-0 rounded-xl px-3 text-xs font-bold ring-1',
              assistantListening
                ? 'bg-[#B91C1C] text-white ring-[#B91C1C]/40'
                : 'bg-white text-zinc-700 ring-zinc-300',
            ].join(' ')}
          >
            {assistantListening ? 'Escuchando…' : '🎙 Voz'}
          </button>
        </div>
        {assistantReply ? (
          <p className="whitespace-pre-line rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700 ring-1 ring-zinc-200">
            {assistantReply}
          </p>
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
                const cmd =
                  assistantPendingAction?.kind === 'update_price'
                    ? `actualiza ${assistantPendingAction.productName} a ${assistantPendingAction.nextPrice.toFixed(2)}`
                    : 'acción pendiente';
                setAssistantPendingAction(null);
                setAssistantReply('Acción cancelada.');
                pushAssistantHistory(cmd, 'Acción cancelada.');
              }}
              className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700"
            >
              Cancelar
            </button>
          </div>
        ) : null}

        <details className="rounded-xl border border-zinc-200/90 bg-zinc-50/40 px-3 py-2 [&_summary::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer list-none text-xs font-semibold text-zinc-600">
            Guía de órdenes y TTS
          </summary>
          <div className="mt-2 space-y-2 border-t border-zinc-200/80 pt-2">
            <p className="text-xs leading-snug text-zinc-500">
              Catálogo 7: precio semanal · última compra · actualiza precio en proveedor · marcar recibido · limpieza ·
              comida propia · top mermas · temperaturas. APPCC: estado hoy, aceite. Navegación y WhatsApp.
            </p>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700">
              <input
                type="checkbox"
                checked={assistantTtsEnabled && !assistantTtsNatural}
                disabled={assistantTtsNatural}
                onChange={(e) => {
                  const on = e.target.checked;
                  setAssistantTtsEnabled(on);
                  try {
                    window.localStorage.setItem(OIDO_CHEF_TTS_LS_KEY, on ? '1' : '0');
                  } catch {
                    // ignore
                  }
                  if (!on) window.speechSynthesis?.cancel();
                }}
                className="h-4 w-4 rounded border-zinc-400"
              />
              Leer respuestas con voz del navegador (gratis, más robótica)
            </label>
            {oidoChefAiEnabled ? (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700">
                <input
                  type="checkbox"
                  checked={assistantTtsNatural}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setAssistantTtsNatural(on);
                    try {
                      window.localStorage.setItem(OIDO_CHEF_TTS_NATURAL_LS_KEY, on ? '1' : '0');
                    } catch {
                      // ignore
                    }
                    if (on) {
                      setAssistantTtsEnabled(false);
                      try {
                        window.localStorage.setItem(OIDO_CHEF_TTS_LS_KEY, '0');
                      } catch {
                        // ignore
                      }
                    }
                    window.speechSynthesis?.cancel();
                  }}
                  className="h-4 w-4 rounded border-zinc-400"
                />
                Voz natural OpenAI (mp3, requiere OPENAI_API_KEY en servidor)
              </label>
            ) : null}
          </div>
        </details>

        {assistantHistory.length > 0 ? (
          <details className="rounded-xl border border-zinc-200/90 bg-white px-3 py-2 [&_summary::-webkit-details-marker]:hidden">
            <summary className="cursor-pointer list-none text-xs font-semibold text-zinc-600">
              Últimos comandos ({Math.min(5, assistantHistory.length)})
            </summary>
            <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto border-t border-zinc-100 pt-2">
              {assistantHistory.slice(0, 5).map((row, idx) => (
                <li key={`${row.at}-${idx}`} className="rounded-md bg-zinc-50 px-2 py-1 text-[11px] ring-1 ring-zinc-200">
                  <p className="truncate font-semibold text-zinc-800">{row.command}</p>
                  <p className="truncate text-zinc-600">{row.result}</p>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );

  if (oidoStandalone) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-5">
        {showDeletedBanner ? (
          <div className="pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-black/25 px-6">
            <div className="rounded-2xl bg-[#D32F2F] px-7 py-5 text-center shadow-2xl ring-2 ring-white/75">
              <p className="text-xl font-black uppercase tracking-wide text-white">ELIMINADO</p>
            </div>
          </div>
        ) : null}

        <Link
          href="/pedidos"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-700 underline-offset-4 hover:text-zinc-900 hover:underline"
        >
          ← Volver a pedidos
        </Link>

        <MermasStyleHero
          eyebrow="Asistente"
          title="Oído Chef"
          description="Misma cuenta y datos que en Pedidos: aquí solo el asistente, para no saturar la lista de envíos."
        />

        {assistantPanel}
      </div>
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

      <MermasStyleHero
        slim
        eyebrow="Pedidos"
        title="Proveedores y recepción"
        description="Crea pedidos, envía por WhatsApp y controla envíos y recepción en el local."
      />

      {avisoPedido === 'enviado' ? (
        <div
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950 shadow-sm ring-1 ring-emerald-100"
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 leading-snug">Pedido enviado. Revisa WhatsApp si se abrió la conversación.</p>
            <button
              type="button"
              onClick={() => router.replace('/pedidos', { scroll: false })}
              className="shrink-0 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-bold text-emerald-900"
            >
              OK
            </button>
          </div>
        </div>
      ) : null}
      {avisoPedido === 'borrador' ? (
        <div
          className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-950 shadow-sm ring-1 ring-sky-100"
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 leading-snug">Borrador guardado. Lo verás en la lista de pedidos.</p>
            <button
              type="button"
              onClick={() => router.replace('/pedidos', { scroll: false })}
              className="shrink-0 rounded-lg border border-sky-300 bg-white px-2.5 py-1 text-xs font-bold text-sky-900"
            >
              OK
            </button>
          </div>
        </div>
      ) : null}
      {avisoPedido === 'actualizado' ? (
        <div
          className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-950 shadow-sm ring-1 ring-sky-100"
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 leading-snug">
              Pedido enviado actualizado. Si hubo cambios de líneas, queda marcado como modificado tras envío.
            </p>
            <button
              type="button"
              onClick={() => router.replace('/pedidos', { scroll: false })}
              className="shrink-0 rounded-lg border border-sky-300 bg-white px-2.5 py-1 text-xs font-bold text-sky-900"
            >
              OK
            </button>
          </div>
        </div>
      ) : null}

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <Link href="/pedidos/proveedores" className="flex h-8 items-center justify-center rounded-lg border border-zinc-300 bg-white px-2 text-center text-xs font-semibold text-zinc-700 sm:h-9 sm:text-sm">
            Proveedores
          </Link>
          <Link href="/pedidos/articulos" className="flex h-8 items-center justify-center rounded-lg border border-zinc-300 bg-white px-2 text-center text-xs font-semibold text-zinc-700 sm:h-9 sm:text-sm">
            Artículos
          </Link>
          <Link href="/pedidos/historial-mes" className="flex h-8 items-center justify-center rounded-lg border border-zinc-300 bg-white px-2 text-center text-xs font-semibold text-zinc-700 sm:h-9 sm:text-sm">
            Compras del mes
          </Link>
          <Link
            href="/pedidos/albaranes"
            className="flex h-8 items-center justify-center rounded-lg border border-[#D32F2F]/25 bg-red-50/80 px-2 text-center text-xs font-semibold text-[#B91C1C] sm:h-9 sm:text-sm"
          >
            Albaranes
          </Link>
        </div>
        {canAccessFinanzas(profileRole) ? (
          <Link
            href="/finanzas"
            className="mt-2 flex h-9 w-full items-center justify-center rounded-lg border border-zinc-900/20 bg-zinc-900 px-2 text-center text-xs font-bold text-white sm:text-sm"
          >
            Finanzas — gasto y salud
          </Link>
        ) : null}
      </section>

      {reloadError ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-semibold">No se pudieron recargar los pedidos.</p>
          <p className="mt-0.5 text-xs text-red-800">{reloadError}</p>
          <button
            type="button"
            onClick={() => reloadOrders()}
            className="mt-2 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800"
          >
            Reintentar
          </button>
        </section>
      ) : null}

      {message ? (
        <section className="rounded-2xl bg-white p-4 text-sm text-zinc-700 ring-1 ring-zinc-200">{message}</section>
      ) : null}

      <Link
        href="/pedidos/nuevo"
        className="flex min-h-[4.125rem] items-center justify-center rounded-2xl bg-[#D32F2F] px-5 text-center text-lg font-bold text-white shadow-md ring-1 ring-[#D32F2F]/20 sm:min-h-[4.5rem] sm:text-xl"
      >
        + Nuevo pedido
      </Link>

      <details
        id="pedidos-pendientes-entrega"
        className={[
          'overflow-hidden rounded-3xl transition-all duration-300 ease-out',
          pendientesEntregaAccordionOpen
            ? 'bg-white shadow-lg shadow-zinc-200/60 ring-2 ring-zinc-900/5'
            : 'bg-zinc-50/80 ring-1 ring-zinc-200/90 hover:bg-white hover:ring-zinc-300',
        ].join(' ')}
        open={pendientesEntregaAccordionOpen}
        onToggle={(e) => setPendientesEntregaAccordionOpen(e.currentTarget.open)}
      >
        <summary className="flex w-full cursor-pointer list-none flex-col items-center px-5 py-3 text-center outline-none transition active:bg-zinc-50/50 focus-visible:ring-2 focus-visible:ring-[#D32F2F]/40 focus-visible:ring-offset-2 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Entrega</span>
          <span className="mt-0.5 text-center text-lg font-semibold leading-tight tracking-tight text-zinc-900 sm:text-xl sm:leading-tight">
            Pendientes de entrega
          </span>
          <span className={`mx-auto mt-1.5 w-20 ${CHEF_ONE_TAPER_LINE_CLASS}`} aria-hidden />
          <span className="mt-1.5 text-xl font-black tabular-nums text-zinc-900 sm:text-2xl">
            {sentOrders.length}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center justify-center gap-x-1.5 text-xs text-zinc-500">
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
          <span className="mt-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#D32F2F]">
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
        <div className="space-y-1.5 border-t border-zinc-100 bg-gradient-to-b from-amber-50/95 via-amber-50/80 to-amber-100/50 px-3 pb-3 pt-2.5 sm:px-4">
          {sentOrders.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-600">No hay pedidos enviados.</p>
          ) : null}
          {sentOrders.map((order) => (
            <div
              key={order.id}
              className="rounded-xl bg-amber-100 p-2.5 text-center ring-2 ring-amber-300/90 shadow-sm"
            >
              <button
                type="button"
                onClick={() => setExpandedSentId((prev) => (prev === order.id ? null : order.id))}
                className="w-full rounded-lg py-0.5 text-center outline-none focus-visible:ring-2 focus-visible:ring-amber-600/40 active:bg-amber-200/60"
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
                      {order.contentRevisedAfterSentAt ? (
                        <p className="text-[10px] font-bold uppercase text-amber-900">Modificado tras envío</p>
                      ) : null}
                      {order.deliveryDate ? (
                        <p className="text-xs text-zinc-500">
                          Entrega: {new Date(`${order.deliveryDate}T00:00:00`).toLocaleDateString('es-ES')}
                        </p>
                      ) : null}
                      <div
                        className="mx-auto mt-1.5 max-w-[16.5rem] rounded-lg bg-white/70 px-2 py-1.5 text-left ring-1 ring-amber-300/40"
                        aria-label="Importes del pedido"
                      >
                        <div className="flex items-baseline justify-between gap-2 text-[11px] leading-tight text-zinc-600">
                          <span className="shrink-0 font-medium">
                            Subt. <abbr title="sin IVA">s/IVA</abbr>
                          </span>
                          <span className="tabular-nums font-semibold text-zinc-900">{totals.base.toFixed(2)} €</span>
                        </div>
                        <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[11px] leading-tight text-zinc-600">
                          <span className="shrink-0 font-medium">
                            <abbr title="Impuesto sobre el valor añadido">IVA</abbr>
                          </span>
                          <span className="tabular-nums font-semibold text-zinc-900">{totals.vat.toFixed(2)} €</span>
                        </div>
                        <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-amber-200/90 pt-1 text-xs font-bold leading-tight text-zinc-900">
                          <span className="shrink-0">
                            Tot. <abbr title="con IVA incluido">c/IVA</abbr>
                          </span>
                          <span className="tabular-nums font-black text-zinc-950">{totals.total.toFixed(2)} €</span>
                        </div>
                      </div>
                      <p className="pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        Revisión precios:{' '}
                        <span className={order.priceReviewArchivedAt ? 'text-emerald-700' : 'text-zinc-700'}>
                          {order.priceReviewArchivedAt ? 'completada' : 'pendiente'}
                        </span>
                      </p>
                    </>
                  );
                })()}
              </button>
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                <Link
                  href={`/pedidos/nuevo?id=${encodeURIComponent(order.id)}`}
                  className="flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-2 py-1 text-center text-xs font-semibold text-zinc-800"
                >
                  Editar pedido
                </Link>
                <button
                  type="button"
                  onClick={() => sendWhatsappOrder(order)}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-center text-xs font-semibold text-[#166534]"
                >
                  Enviar WhatsApp
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!(await confirmDestructiveOperation(profileRole, '¿Confirmar eliminación de este pedido?'))) {
                      return;
                    }
                    if (!localId) return;
                    if (!(await appConfirm('¿Seguro que quieres eliminar este pedido?'))) return;
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
                        dispatchPedidosDataChanged();
                      })
                      .catch((err: Error) => setMessage(err.message));
                  }}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-center text-xs font-semibold text-[#B91C1C]"
                >
                  Eliminar
                </button>
              </div>
              {expandedSentId !== order.id ? renderSentOrderReceiveAndIncident(order, { showExpandHint: true }) : null}
              {expandedSentId === order.id ? (
                <div className="mt-2 space-y-2 text-left">
                  <div className="rounded-lg border border-[#D32F2F]/30 bg-white px-2 py-1.5 ring-1 ring-[#D32F2F]/12 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setOcrOrder(order)}
                      className="w-full rounded-lg border border-[#D32F2F]/45 bg-[#D32F2F]/10 py-2 text-center text-[11px] font-black uppercase tracking-wide text-[#B91C1C] transition active:scale-[0.99]"
                    >
                      Escanear albarán
                    </button>
                  </div>
                  {order.notes?.trim() ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-2.5 py-2">
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
                    const isDualKgReception = orderItemHasDistinctBilling(item) && item.billingUnit === 'kg';
                    const estSub = estimatedOrderLineSubtotal(item);
                    const estKg = estimatedKgForOrderLine(item);
                    const realSub = lineSubtotalForOrderListDisplay(item);
                    const showDualCompare =
                      orderItemHasDistinctBilling(item) &&
                      item.billingUnit === 'kg' &&
                      estKg != null &&
                      item.incidentType !== 'missing';
                    const realKg =
                      item.receivedWeightKg != null && item.receivedWeightKg > 0 ? item.receivedWeightKg : null;
                    return (
                      <div key={item.id} className="space-y-1 rounded-lg bg-white p-2 ring-1 ring-zinc-200">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold leading-tight text-zinc-900">{item.productName}</p>
                            <p className="mt-0.5 text-xs text-zinc-600">
                              Pedido:{' '}
                              <span className="text-base font-bold tabular-nums text-zinc-900 sm:text-lg">
                                {formatQuantityWithUnit(item.quantity, item.unit)}
                              </span>
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
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
                        <div className="space-y-2 text-[11px] leading-snug text-zinc-700">
                          <div className="rounded-lg border border-zinc-200/90 bg-zinc-50/80 px-2 py-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                              A · Pedido (informativo)
                            </p>
                            <p className="mt-1 font-medium text-zinc-800">
                              {formatQuantityWithUnit(item.quantity, item.unit)}
                              {estKg != null ? (
                                <span className="text-zinc-600"> · estimado ~{estKg} kg</span>
                              ) : null}
                            </p>
                            <p className="mt-0.5 text-zinc-600">
                              Total estimado{' '}
                              <span className="font-semibold tabular-nums text-zinc-800">{estSub.toFixed(2)} €</span>
                              {isDualKgReception && item.pricePerBillingUnit != null ? (
                                <span className="text-zinc-500">
                                  {' '}
                                  · ref. pedido {item.pricePerBillingUnit.toFixed(4)} €/kg
                                </span>
                              ) : null}
                            </p>
                            {isDualKgReception && item.basePricePerUnit != null ? (
                              <p className="mt-1 text-[10px] text-zinc-500">
                                Referencia ~{item.basePricePerUnit.toFixed(2)} €/{unitPriceCatalogSuffix[item.unit]} al
                                enviar el pedido (no usar como precio final: el coste lo marcan kg y €/kg abajo).
                              </p>
                            ) : null}
                          </div>

                          {isDualKgReception ? (
                            <div className="rounded-lg border-2 border-emerald-500/40 bg-emerald-50/50 px-2 py-2">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-900/90">
                                B · Recepción real (editable)
                              </p>
                              <p className="mt-1 text-[10px] leading-snug text-emerald-950/85">
                                <strong>Coste final = kg reales × €/kg.</strong> La caja/bandeja es unidad operativa del
                                pedido, no la base del importe.
                              </p>
                              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <div>
                                  <label className="mb-0.5 block text-[10px] font-semibold text-zinc-700">
                                    Cantidad real (kg)
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    placeholder="5,8"
                                    title="Kilos reales (unidad de cobro)"
                                    value={
                                      weightInputByItemId[item.id] ??
                                      (item.receivedWeightKg != null ? String(item.receivedWeightKg) : '')
                                    }
                                    onChange={(e) =>
                                      setWeightInputByItemId((prev) => ({ ...prev, [item.id]: e.target.value }))
                                    }
                                    onBlur={() => commitWeightInput(order.id, item.id)}
                                    className="h-9 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm font-semibold tabular-nums text-zinc-900 outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="mb-0.5 block text-[10px] font-semibold text-zinc-700">
                                    Precio real (€/kg)
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    placeholder="8,15"
                                    title="Euros por kilo reales"
                                    value={
                                      pricePerKgInputByItemId[item.id] ??
                                      (item.receivedPricePerKg != null ? String(item.receivedPricePerKg) : '')
                                    }
                                    onChange={(e) =>
                                      setPricePerKgInputByItemId((prev) => ({ ...prev, [item.id]: e.target.value }))
                                    }
                                    onBlur={() => commitPricePerKgInput(order.id, item.id)}
                                    className="h-9 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm font-semibold tabular-nums text-zinc-900 outline-none"
                                  />
                                </div>
                              </div>
                              {item.receivedQuantity > 0 ? (
                                <p className="mt-2 text-[10px] text-zinc-600">
                                  Recibido en unidad de pedido:{' '}
                                  <span className="font-semibold text-zinc-800">
                                    {formatQuantityWithUnit(item.receivedQuantity, item.unit)}
                                  </span>
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <>
                              {unitCanDeclareScaleKgOnReception(item.unit) || unitSupportsReceivedWeightKg(item.unit) ? (
                                <div className="rounded-lg border border-emerald-200/85 bg-emerald-50/45 px-2 py-2">
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-900/85">
                                    B · Recepción real
                                  </p>
                                  <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
                                    {unitCanDeclareScaleKgOnReception(item.unit) ? (
                                      <div className="flex min-w-0 flex-col gap-0.5">
                                        <label className="text-[10px] font-semibold text-zinc-700">Kg reales</label>
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          autoComplete="off"
                                          autoCorrect="off"
                                          placeholder="12,5"
                                          title="Kg reales"
                                          value={
                                            weightInputByItemId[item.id] ??
                                            (item.receivedWeightKg != null ? String(item.receivedWeightKg) : '')
                                          }
                                          onChange={(e) =>
                                            setWeightInputByItemId((prev) => ({ ...prev, [item.id]: e.target.value }))
                                          }
                                          onBlur={() => commitWeightInput(order.id, item.id)}
                                          className="h-8 w-[4.5rem] rounded-md border border-zinc-300 bg-white px-1.5 text-xs font-semibold text-zinc-900 outline-none sm:w-[5rem]"
                                        />
                                      </div>
                                    ) : null}
                                    {unitSupportsReceivedWeightKg(item.unit) ? (
                                      <div className="flex min-w-0 flex-col gap-0.5">
                                        <label className="text-[10px] font-semibold text-zinc-700">€/kg real</label>
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          autoComplete="off"
                                          autoCorrect="off"
                                          placeholder="3,45"
                                          title="€/kg real"
                                          value={
                                            pricePerKgInputByItemId[item.id] ??
                                            (item.receivedPricePerKg != null ? String(item.receivedPricePerKg) : '')
                                          }
                                          onChange={(e) =>
                                            setPricePerKgInputByItemId((prev) => ({ ...prev, [item.id]: e.target.value }))
                                          }
                                          onBlur={() => commitPricePerKgInput(order.id, item.id)}
                                          className="h-8 w-[5rem] rounded-md border border-zinc-300 bg-white px-1.5 text-xs font-semibold text-zinc-900 outline-none"
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-zinc-100 pt-2">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <label className="shrink-0 text-[10px] font-semibold text-zinc-700">
                                    Precio (€/{unitPriceCatalogSuffix[item.unit]})
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    title={`Importe por ${unitPriceCatalogSuffix[item.unit]} de pedido`}
                                    value={priceInputByItemId[item.id] ?? item.pricePerUnit.toFixed(2)}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      setPriceInputByItemId((prev) => ({ ...prev, [item.id]: raw }));
                                      setLocalUnitPrice(order.id, item.id, raw);
                                    }}
                                    onBlur={() => commitPriceInput(order.id, item.id)}
                                    className="h-8 w-[4.75rem] rounded-md border border-zinc-300 bg-white px-1.5 text-sm font-semibold tabular-nums text-zinc-900 outline-none"
                                  />
                                </div>
                              </div>
                            </>
                          )}

                          <div className="rounded-lg border border-zinc-300 bg-white px-2 py-2 ring-1 ring-zinc-100">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">C · Resultado</p>
                            <p className="mt-1 text-base font-black tabular-nums text-zinc-900">
                              Subtotal final: {realSub.toFixed(2)} €
                            </p>
                            {isDualKgReception && item.incidentType !== 'missing' ? (
                              <p className="mt-0.5 text-[10px] text-zinc-600">
                                Estimado {estSub.toFixed(2)} € → Real {realSub.toFixed(2)} €
                              </p>
                            ) : null}
                            {showDualCompare && realKg != null ? (
                              <p className="mt-1 text-[10px] font-semibold text-amber-900/90">
                                Diferencia: Δ kg {realKg >= estKg! ? '+' : ''}
                                {(realKg - estKg!).toFixed(3)} · Δ € {realSub >= estSub ? '+' : ''}
                                {(realSub - estSub).toFixed(2)}
                              </p>
                            ) : null}
                            {!isDualKgReception &&
                            item.basePricePerUnit != null &&
                            Number.isFinite(item.basePricePerUnit) &&
                            Math.abs(item.pricePerUnit - item.basePricePerUnit) > 0.005 ? (
                              <p className="mt-1 text-[10px] text-zinc-600">
                                vs precio pedido:{' '}
                                {item.pricePerUnit >= item.basePricePerUnit ? '+' : ''}
                                {(item.pricePerUnit - item.basePricePerUnit).toFixed(2)} €/
                                {unitPriceCatalogSuffix[item.unit]}
                              </p>
                            ) : null}
                            {isDualKgReception &&
                            item.receivedWeightKg != null &&
                            item.receivedWeightKg > 0 &&
                            item.receivedPricePerKg != null &&
                            item.receivedPricePerKg > 0 ? (
                              <p className="mt-1 text-[10px] text-zinc-500">
                                Comprobación: {item.receivedWeightKg.toFixed(3)} kg × {item.receivedPricePerKg.toFixed(4)}{' '}
                                €/kg
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {renderSentOrderReceiveAndIncident(order, { showExpandHint: false })}
                </div>
              ) : null}

            </div>
          ))}
        </div>
      </details>

      <details
        id="pedidos-historico-recibidos"
        className={[
          'overflow-hidden rounded-3xl transition-all duration-300 ease-out',
          historicoRecibidosAccordionOpen
            ? 'bg-white shadow-lg shadow-zinc-200/60 ring-2 ring-zinc-900/5'
            : 'bg-zinc-50/80 ring-1 ring-zinc-200/90 hover:bg-white hover:ring-zinc-300',
        ].join(' ')}
        open={historicoRecibidosAccordionOpen}
        onToggle={(e) => setHistoricoRecibidosAccordionOpen(e.currentTarget.open)}
      >
        <summary className="flex w-full cursor-pointer list-none flex-col items-center px-4 py-2 text-center outline-none transition active:bg-zinc-50/50 focus-visible:ring-2 focus-visible:ring-[#D32F2F]/40 focus-visible:ring-offset-2 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Almacén</span>
          <span className="mt-0.5 text-center text-base font-semibold leading-tight tracking-tight text-zinc-900 sm:text-lg">
            Histórico recibidos
          </span>
          <span className={`mx-auto mt-1 w-16 ${CHEF_ONE_TAPER_LINE_CLASS}`} aria-hidden />
          <span className="mt-1 text-lg font-black tabular-nums text-zinc-900 sm:text-xl">
            {receivedOrders.length}
          </span>
          <span className="mt-1 flex flex-wrap items-center justify-center gap-x-1.5 text-[11px] text-zinc-500">
            {receivedOrders.length === 0 ? (
              <span>Sin pedidos recibidos</span>
            ) : (
              <>
                <span>
                  {receivedOrders.length} pedido{receivedOrders.length === 1 ? '' : 's'}
                </span>
                <span className="text-zinc-400">·</span>
                <span>Agrupado por mes · verde OK · rojo incidencia</span>
              </>
            )}
          </span>
          <span className="mt-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#D32F2F]">
            {historicoRecibidosAccordionOpen ? 'Ocultar' : 'Ver pedidos'}
            <ChevronDown
              className={[
                'h-3.5 w-3.5 transition-transform duration-300',
                historicoRecibidosAccordionOpen ? 'rotate-180' : '',
              ].join(' ')}
              aria-hidden
            />
          </span>
        </summary>
        <div className="space-y-2 border-t border-zinc-100 bg-gradient-to-b from-zinc-50/90 to-white px-2 pb-2 pt-2 sm:px-3">
          {receivedOrders.length === 0 ? (
            <p className="py-4 text-center text-xs text-zinc-500">No hay pedidos recibidos.</p>
          ) : null}
          {historicoReceivedByMonth.map(({ key: monthKey, label: monthLabel, orders: monthOrders }, monthIdx) => (
            <details
              key={monthKey}
              open={historicoMonthOpen[monthKey] ?? monthIdx === 0}
              onToggle={(e) => {
                const el = e.currentTarget;
                setHistoricoMonthOpen((p) => ({ ...p, [monthKey]: el.open }));
              }}
              className="group/month overflow-hidden rounded-xl border border-zinc-200/90 bg-white/70 ring-1 ring-zinc-100/80"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-1.5 text-left outline-none transition hover:bg-zinc-50/80 [&::-webkit-details-marker]:hidden">
                <span className="text-xs font-bold capitalize text-zinc-900">{monthLabel}</span>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold tabular-nums text-zinc-500">
                  {monthOrders.length}
                  <ChevronDown
                    className="h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform group-open/month:rotate-180"
                    aria-hidden
                  />
                </span>
              </summary>
              <div className="space-y-1.5 border-t border-zinc-100 bg-zinc-50/40 px-1.5 pb-1.5 pt-1.5">
                {monthOrders.map((order) => {
                  const needsAttention = receivedOrderHasAttention(order);
                  const incidentFooterText = historicoIncidentFooterText(order);
                  const detailOpen = expandedHistoricoId === order.id;
                  const totals = totalsWithVatForOrderListDisplay(order);
                  return (
                    <div
                      key={order.id}
                      className={[
                        'overflow-hidden rounded-lg transition-colors',
                        needsAttention
                          ? detailOpen
                            ? 'bg-red-50 ring-1 ring-red-400/90'
                            : 'bg-red-50/90 ring-1 ring-red-400/70 hover:bg-red-50'
                          : detailOpen
                            ? 'bg-emerald-50 ring-1 ring-emerald-600/75'
                            : 'bg-emerald-50/90 ring-1 ring-emerald-500/65 hover:bg-emerald-50',
                      ].join(' ')}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedHistoricoId((prev) => (prev === order.id ? null : order.id))}
                        className={[
                          'w-full px-2.5 py-1.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[#D32F2F]/35 focus-visible:ring-offset-1',
                          needsAttention ? 'active:bg-red-100/40' : 'active:bg-emerald-100/40',
                        ].join(' ')}
                        aria-expanded={detailOpen}
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="truncate text-sm font-bold text-zinc-900">{order.supplierName}</span>
                              <span
                                className={[
                                  'shrink-0 rounded px-1.5 py-0 text-[9px] font-black uppercase tracking-wide text-white',
                                  needsAttention ? 'bg-red-600' : 'bg-emerald-600',
                                ].join(' ')}
                              >
                                {needsAttention ? 'Incidencia' : 'Correcto'}
                              </span>
                            </div>
                            <p className="text-[10px] text-zinc-500">
                              Recibido{' '}
                              <span className="font-medium text-zinc-700">
                                {order.receivedAt ? new Date(order.receivedAt).toLocaleDateString('es-ES') : '—'}
                              </span>
                            </p>
                          </div>
                          <div
                            className="shrink-0 text-right text-[10px] leading-tight tabular-nums text-zinc-600 sm:min-w-[7.5rem]"
                            aria-label="Importes del pedido"
                          >
                            <div className="flex justify-end gap-x-2">
                              <span className="text-zinc-400">s/IVA</span>
                              <span className="font-semibold text-zinc-900">{totals.base.toFixed(2)} €</span>
                            </div>
                            <div className="flex justify-end gap-x-2">
                              <span className="text-zinc-400">IVA</span>
                              <span className="font-semibold text-zinc-900">{totals.vat.toFixed(2)} €</span>
                            </div>
                            <div className="flex justify-end gap-x-2 border-t border-zinc-200/80 pt-0.5 font-black text-zinc-950">
                              <span className="text-zinc-500">Total c/IVA</span>
                              <span>{totals.total.toFixed(2)} €</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-1 flex items-center justify-center gap-1 border-t border-zinc-200/40 pt-1 text-[9px] font-semibold uppercase tracking-wide text-[#B91C1C]">
                          {detailOpen ? 'Ocultar líneas' : 'Ver líneas'}
                          <ChevronDown
                            className={['h-3 w-3 transition-transform', detailOpen ? 'rotate-180' : ''].join(' ')}
                            aria-hidden
                          />
                        </div>
                      </button>
                      <div
                        className={[
                          'flex flex-wrap items-center justify-end gap-1 border-t px-2 py-1',
                          needsAttention ? 'border-red-200/70 bg-white/60' : 'border-emerald-200/70 bg-white/60',
                        ].join(' ')}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            void (async () => {
                              if (!localId) return;
                              const ok = await appConfirm(
                                '¿Devolver este pedido a «Pendientes de entrega»? Volverá a la bandeja de revisión de precios (las líneas no se borran).',
                              );
                              if (!ok) return;
                              const supabase = getSupabaseClient();
                              if (!supabase) return;
                              void reopenReceivedOrderToSent(supabase, localId, order.id)
                                .then(() => {
                                  clearPendingReceivedOrder(order.id);
                                  setMessage('Pedido devuelto a enviados.');
                                  dispatchPedidosDataChanged();
                                })
                                .catch((err: Error) => setMessage(err.message));
                            })();
                          }}
                          className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-center text-[10px] font-semibold text-zinc-800"
                        >
                          A enviados
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (
                              !(await confirmDestructiveOperation(profileRole, '¿Confirmar eliminación de este pedido?'))
                            ) {
                              return;
                            }
                            if (!localId) return;
                            if (!(await appConfirm('¿Seguro que quieres eliminar este pedido?'))) return;
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
                                dispatchPedidosDataChanged();
                              })
                              .catch((err: Error) => setMessage(err.message));
                          }}
                          className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-center text-[10px] font-semibold text-[#B91C1C]"
                        >
                          Eliminar
                        </button>
                      </div>
                      {expandedHistoricoId === order.id ? (
                        <div
                          className={[
                            'space-y-1.5 border-t px-2 pb-2 pt-1.5 text-left',
                            needsAttention
                              ? 'border-red-200/60 bg-red-50/40'
                              : 'border-emerald-200/60 bg-emerald-50/35',
                          ].join(' ')}
                        >
                          <p className="text-center text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                            Líneas
                          </p>
                          {order.notes?.trim() ? (
                            <div className="rounded border border-zinc-200/90 bg-white px-2 py-1">
                              <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Notas</p>
                              <p className="mt-0.5 text-[11px] leading-snug text-zinc-800">{order.notes.trim()}</p>
                            </div>
                          ) : null}
                          {order.items.map((item) => {
                            const inc = Boolean(item.incidentType) || Boolean(item.incidentNotes?.trim());
                            const isBad = inc;
                            const isOk = !inc && item.receivedQuantity >= item.quantity && item.quantity > 0;
                            const histSummary = receptionBillingSummary(item);
                            const lineSub = lineSubtotalForOrderListDisplay(item);
                            return (
                              <div
                                key={item.id}
                                className="rounded-md border border-zinc-200/90 bg-white px-2 py-1 shadow-sm"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="min-w-0 flex-1 text-[11px] font-bold leading-tight text-zinc-900">
                                    {item.productName}
                                  </p>
                                  <span
                                    className={[
                                      'grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-black leading-none',
                                      isOk
                                        ? 'border-emerald-600 bg-emerald-600 text-white'
                                        : isBad
                                          ? 'border-red-600 bg-red-600 text-white'
                                          : 'border-zinc-300 bg-white text-zinc-400',
                                    ].join(' ')}
                                    title={isOk ? 'Recibido OK' : isBad ? 'Incidencia' : 'Parcial'}
                                    aria-hidden
                                  >
                                    {isOk ? '\u2713' : isBad ? '\u2715' : '\u00B7'}
                                  </span>
                                </div>
                                <div className="mt-1 grid grid-cols-1 gap-x-2 gap-y-0.5 text-[10px] leading-snug text-zinc-600 sm:grid-cols-2">
                                  <p>
                                    <span className="font-semibold text-zinc-500">Pedido</span>{' '}
                                    {formatQuantityWithUnit(item.quantity, item.unit)}
                                  </p>
                                  <p>
                                    <span className="font-semibold text-zinc-500">Recibido</span> {histSummary.recibido}
                                  </p>
                                  <p className="sm:col-span-2">
                                    <span className="font-semibold text-zinc-500">Precio</span> {histSummary.precioAplicado}
                                    {histSummary.precioEquivCatalogo ? (
                                      <span className="text-zinc-500"> · {histSummary.precioEquivCatalogo}</span>
                                    ) : null}
                                  </p>
                                  <p className="sm:col-span-2 flex flex-wrap items-baseline justify-between gap-1 border-t border-zinc-100 pt-0.5">
                                    <span className="font-semibold text-zinc-500">Subtotal línea</span>
                                    <span className="font-bold tabular-nums text-zinc-900">{lineSub.toFixed(2)} €</span>
                                  </p>
                                </div>
                                {unitCanDeclareScaleKgOnReception(item.unit) &&
                                item.receivedWeightKg != null &&
                                item.receivedWeightKg > 0 ? (
                                  <p className="mt-0.5 text-[10px] text-zinc-600">
                                    Báscula:{' '}
                                    <span className="font-semibold text-zinc-800">
                                      {item.receivedWeightKg.toFixed(3)} kg
                                    </span>
                                  </p>
                                ) : null}
                              </div>
                            );
                          })}
                          {needsAttention && incidentFooterText ? (
                            <div className="rounded-md border border-red-200 bg-red-50/70 px-2 py-1.5 text-left ring-1 ring-red-100/80">
                              <p className="text-[9px] font-bold uppercase tracking-wide text-red-800">Incidencia</p>
                              <p className="mt-0.5 text-[10px] leading-snug text-zinc-800 whitespace-pre-wrap">
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
          ))}
        </div>
      </details>

      <PedidosAlbaranOcrModal
        order={ocrOrder}
        open={ocrOrder != null}
        onClose={() => setOcrOrder(null)}
        onApplied={() => {
          dispatchPedidosDataChanged();
          setMessage('Albarán OCR guardado. Revisa cantidades y precios en el pedido.');
        }}
      />
    </div>
  );
}
