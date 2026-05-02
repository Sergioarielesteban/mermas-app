'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { usePedidosOrders } from '@/components/PedidosOrdersProvider';
import { getDemoPedidoSuppliers } from '@/lib/demo-dataset';
import { isDemoMode } from '@/lib/demo-mode';
import { uid } from '@/lib/id';
import { appConfirm } from '@/lib/app-dialog-bridge';
import { getSupabaseClient } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { dispatchPedidosDataChanged, usePedidosDataChangedListener } from '@/hooks/usePedidosDataChangedListener';
import {
  coverageDateRangeLabel,
  coverageDaysUntilNextDelivery,
  isDeliveryDateOnConfiguredCycle,
  suggestedOrderQuantityForPar,
  weeklyParScaledToCoverageDays,
} from '@/lib/pedidos-coverage';
import PedidosNuevoCatalogLine from '@/components/PedidosNuevoCatalogLine';
import { buildPedidoWhatsappMessage } from '@/lib/pedidos-whatsapp-message';
import { applyQuantityTapDelta, parseQuantityManualInput } from '@/lib/pedidos-order-quantity';
import {
  readSuppliersSessionCache,
  writeSuppliersSessionCache,
} from '@/lib/pedidos-session-cache';
import {
  fetchOrderById,
  fetchSuppliersWithProducts,
  saveOrder,
  supplierProductHasDistinctBilling,
  unitSupportsReceivedWeightKg,
  type PedidoOrderItem,
  type PedidoOrder,
  type PedidoSupplier,
} from '@/lib/pedidos-supabase';
import { actorLabel, notifyPedidoEnviado } from '@/services/notifications';
import { normalizeWhatsappPhone, openWhatsAppMessage } from '@/lib/whatsapp';

type QtyMap = Record<string, number>;

const basketSessionKey = (localId: string) => `chefone_pedidos_basket:${localId}`;

function buildWhatsappDraftMessage(input: {
  createdAtIso: string;
  deliveryDate: string;
  localName: string;
  requestedBy: string;
  notes: string;
  items: PedidoOrderItem[];
  contentRevisedAfterSent?: boolean;
}) {
  return buildPedidoWhatsappMessage({
    localDisplayName: input.localName || 'CHEF-ONE MATARO',
    fechaPedidoDisplay: new Date(input.createdAtIso).toLocaleDateString('es-ES'),
    fechaEntregaDisplay: input.deliveryDate,
    responsable: input.requestedBy.trim() || '—',
    items: input.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      unit: item.unit,
    })),
    contentRevisedAfterSent: input.contentRevisedAfterSent,
    notes: input.notes?.trim() || undefined,
  });
}

export default function NuevoPedidoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { localCode, localName, localId, email, userId, displayName, loginUsername } = useAuth();
  const { upsertOrder, orders } = usePedidosOrders();

  const pullNewOrderIntoStore = React.useCallback(
    async (orderId: string) => {
      if (!localId) return;
      const supabase = getSupabaseClient();
      if (!supabase) return;
      for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 300 + attempt * 200));
        try {
          const o = await fetchOrderById(supabase, localId, orderId);
          if (o) {
            upsertOrder(o);
            return;
          }
        } catch {
          /* réplica u error transitorio: reintentar */
        }
      }
    },
    [localId, upsertOrder],
  );
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const editingId = searchParams.get('id');
  const [suppliers, setSuppliers] = React.useState<PedidoSupplier[]>([]);
  const [supplierId, setSupplierId] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [qtyByProductId, setQtyByProductId] = React.useState<QtyMap>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [deliveryDate, setDeliveryDate] = React.useState('');
  const [requestedBy, setRequestedBy] = React.useState('');
  const [loadingSuppliers, setLoadingSuppliers] = React.useState(false);
  const [isLoadedEdit, setIsLoadedEdit] = React.useState(false);
  const [existingCreatedAt, setExistingCreatedAt] = React.useState<string | null>(null);
  const [existingSentAt, setExistingSentAt] = React.useState<string | null>(null);
  const [existingOrderId, setExistingOrderId] = React.useState<string | null>(null);
  const [existingOrderUpdatedAt, setExistingOrderUpdatedAt] = React.useState<string | null>(null);
  const [editSourceItems, setEditSourceItems] = React.useState<PedidoOrderItem[] | null>(null);
  const [editBlockedReason, setEditBlockedReason] = React.useState<string | null>(null);
  const [hadContentRevisionFlag, setHadContentRevisionFlag] = React.useState(false);

  const clearBasketDraft = React.useCallback(() => {
    if (!localId) return;
    try {
      sessionStorage.removeItem(basketSessionKey(localId));
    } catch {
      /* ignore */
    }
  }, [localId]);

  const resetPedidoFormAfterSuccess = React.useCallback(() => {
    clearBasketDraft();
    setNotes('');
    setQtyByProductId({});
    setSearch('');
    setDeliveryDate('');
    setRequestedBy('');
    setMessage(null);
    setExistingOrderId(null);
    setExistingCreatedAt(null);
    setExistingSentAt(null);
    setExistingOrderUpdatedAt(null);
    setEditSourceItems(null);
    setEditBlockedReason(null);
    setHadContentRevisionFlag(false);
    setIsLoadedEdit(false);
    setSupplierId((sid) => suppliers[0]?.id ?? sid);
  }, [clearBasketDraft, suppliers]);

  const reloadSuppliers = React.useCallback(() => {
    if (!canUse || !localId) return;
    if (isDemoMode()) {
      const rows = getDemoPedidoSuppliers();
      setSuppliers(rows);
      setSupplierId((prev) => prev || rows[0]?.id || '');
      setLoadingSuppliers(false);
      return;
    }
    const lid = localId;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoadingSuppliers(true);
    void fetchSuppliersWithProducts(supabase, lid)
      .then((rows) => {
        setSuppliers(rows);
        setSupplierId((prev) => prev || rows[0]?.id || '');
        writeSuppliersSessionCache(lid, rows);
      })
      .catch((err: Error) => setMessage(err.message))
      .finally(() => setLoadingSuppliers(false));
  }, [canUse, localId]);

  React.useEffect(() => {
    if (!canUse || !localId) return;
    const cached = readSuppliersSessionCache(localId);
    if (cached !== null) {
      setSuppliers(cached);
      setSupplierId((prev) => prev || cached[0]?.id || '');
    }
    reloadSuppliers();
  }, [canUse, localId, reloadSuppliers]);

  /** Restaurar antes del paint para no pisar la cesta con el guardado/reconciliación del primer commit. */
  React.useLayoutEffect(() => {
    if (!canUse || !localId || editingId) return;
    try {
      const raw = sessionStorage.getItem(basketSessionKey(localId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        supplierId?: string;
        qtyByProductId?: QtyMap;
        notes?: string;
        deliveryDate?: string;
        requestedBy?: string;
      };
      if (parsed.supplierId) setSupplierId(parsed.supplierId);
      if (parsed.qtyByProductId && typeof parsed.qtyByProductId === 'object') {
        setQtyByProductId(parsed.qtyByProductId);
      }
      if (typeof parsed.notes === 'string') setNotes(parsed.notes);
      if (typeof parsed.deliveryDate === 'string') setDeliveryDate(parsed.deliveryDate);
      if (typeof parsed.requestedBy === 'string') setRequestedBy(parsed.requestedBy);
    } catch {
      /* ignore */
    }
  }, [canUse, localId, editingId]);

  React.useEffect(() => {
    if (!canUse || !localId || editingId) return;
    try {
      sessionStorage.setItem(
        basketSessionKey(localId),
        JSON.stringify({
          supplierId,
          qtyByProductId,
          notes,
          deliveryDate,
          requestedBy,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [canUse, localId, editingId, supplierId, qtyByProductId, notes, deliveryDate, requestedBy]);

  usePedidosDataChangedListener(reloadSuppliers, Boolean(hasPedidosEntry && canUse));

  const selectedSupplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const supplierProducts = React.useMemo(() => selectedSupplier?.products ?? [], [selectedSupplier]);

  const coverageDays = React.useMemo(() => {
    if (!deliveryDate.trim() || !selectedSupplier) return null;
    return coverageDaysUntilNextDelivery(
      deliveryDate,
      selectedSupplier.deliveryCycleWeekdays ?? [],
      selectedSupplier.deliveryExceptionDates ?? [],
    );
  }, [deliveryDate, selectedSupplier]);

  const coverageRangeLabel = React.useMemo(() => {
    if (!deliveryDate.trim() || coverageDays == null) return null;
    return coverageDateRangeLabel(deliveryDate, coverageDays);
  }, [deliveryDate, coverageDays]);

  const deliveryDayMismatch = React.useMemo(() => {
    if (!deliveryDate.trim() || !selectedSupplier) return false;
    return !isDeliveryDateOnConfiguredCycle(
      deliveryDate,
      selectedSupplier.deliveryCycleWeekdays ?? [],
      selectedSupplier.deliveryExceptionDates ?? [],
    );
  }, [deliveryDate, selectedSupplier]);

  const selectedDateIsException = React.useMemo(() => {
    if (!deliveryDate.trim() || !selectedSupplier) return false;
    return (selectedSupplier.deliveryExceptionDates ?? []).includes(deliveryDate);
  }, [deliveryDate, selectedSupplier]);

  const qSearch = search.trim().toLowerCase();
  const filteredProducts = supplierProducts
    .filter((p) => {
      if (!qSearch) return true;
      if (p.name.toLowerCase().includes(qSearch)) return true;
      if (p.articleMasterName?.toLowerCase().includes(qSearch)) return true;
      if (p.articleAliasInterno?.toLowerCase().includes(qSearch)) return true;
      return false;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  React.useEffect(() => {
    if (!editingId) {
      setEditSourceItems(null);
      setEditBlockedReason(null);
      setHadContentRevisionFlag(false);
      setIsLoadedEdit(false);
      return;
    }
    if (!localId) return;
    setExistingOrderUpdatedAt(null);
    setEditBlockedReason(null);
    if (isDemoMode()) {
      const draft = orders.find((o) => o.id === editingId) ?? null;
      if (!draft) {
        setMessage('No se encontró el pedido en la demo.');
        setIsLoadedEdit(true);
        return;
      }
      if (draft.status === 'received') {
        setEditBlockedReason(
          'Este pedido está marcado como recibido. Para ajustarlo usa Recepción o vuelve a «enviado» desde el histórico.',
        );
        setEditSourceItems(null);
        setIsLoadedEdit(true);
        return;
      }
      setEditSourceItems(draft.items);
      setHadContentRevisionFlag(Boolean(draft.contentRevisedAfterSentAt));
      setExistingOrderId(draft.id);
      setSupplierId(draft.supplierId);
      setNotes(draft.notes);
      setDeliveryDate(draft.deliveryDate ?? '');
      setExistingCreatedAt(draft.createdAt);
      setExistingSentAt(draft.sentAt ?? null);
      setExistingOrderUpdatedAt(draft.updatedAt ?? null);
      setQtyByProductId(
        draft.items.reduce<QtyMap>((acc, item) => {
          if (item.supplierProductId) acc[item.supplierProductId] = item.quantity;
          return acc;
        }, {}),
      );
      setIsLoadedEdit(true);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchOrderById(supabase, localId, editingId)
      .then((draft) => {
        if (!draft) {
          setMessage('No se encontro el borrador para editar.');
          setIsLoadedEdit(true);
          return;
        }
        if (draft.status === 'received') {
          setEditBlockedReason(
            'Este pedido está marcado como recibido. Para ajustarlo usa Recepción o vuelve a «enviado» desde el histórico.',
          );
          setEditSourceItems(null);
          setIsLoadedEdit(true);
          return;
        }
        setEditSourceItems(draft.items);
        setHadContentRevisionFlag(Boolean(draft.contentRevisedAfterSentAt));
        setExistingOrderId(draft.id);
        setSupplierId(draft.supplierId);
        setNotes(draft.notes);
        setDeliveryDate(draft.deliveryDate ?? '');
        setExistingCreatedAt(draft.createdAt);
        setExistingSentAt(draft.sentAt ?? null);
        setExistingOrderUpdatedAt(draft.updatedAt ?? null);
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
  }, [editingId, localId, orders]);

  React.useEffect(() => {
    setSearch('');
    if (editingId && !isLoadedEdit) return;
    /** Mientras el catálogo del proveedor no está cargado, no reconciliar: si no, prev queda {} y borra la cesta restaurada desde sessionStorage. */
    if (supplierProducts.length === 0) return;
    setQtyByProductId((prev) => {
      const next: QtyMap = {};
      for (const product of supplierProducts) {
        next[product.id] = prev[product.id] ?? 0;
      }
      return next;
    });
  }, [supplierId, supplierProducts, editingId, isLoadedEdit]);

  const setQtyFromInput = React.useCallback((productId: string, unit: PedidoOrderItem['unit'], raw: string) => {
    const parsed = parseQuantityManualInput(unit, raw);
    if (parsed === null) return;
    setQtyByProductId((prev) => ({ ...prev, [productId]: parsed }));
  }, []);

  const adjustQty = React.useCallback((productId: string, unit: PedidoOrderItem['unit'], delta: number) => {
    setQtyByProductId((prev) => {
      const current = prev[productId] ?? 0;
      const next = applyQuantityTapDelta(unit, current, delta);
      return { ...prev, [productId]: next };
    });
  }, []);

  const existingByProductId = React.useMemo(() => {
    const map = new Map<string, PedidoOrderItem>();
    for (const item of editSourceItems ?? []) {
      if (item.supplierProductId) map.set(item.supplierProductId, item);
    }
    return map;
  }, [editSourceItems]);

  const items: PedidoOrderItem[] = supplierProducts
    .map((p) => {
      const quantity = qtyByProductId[p.id] ?? 0;
      const prev = existingByProductId.get(p.id);
      const lineTotal = Math.round(quantity * p.pricePerUnit * 100) / 100;
      const receivedRaw = prev?.receivedQuantity ?? 0;
      const receivedQuantity =
        quantity <= 0 ? 0 : receivedRaw > 0 ? Math.min(receivedRaw, quantity) : 0;
      const billingSnap =
        prev != null &&
        (prev.billingUnit != null ||
          prev.billingQtyPerOrderUnit != null ||
          prev.pricePerBillingUnit != null)
          ? {
              ...(prev.billingUnit != null ? { billingUnit: prev.billingUnit } : {}),
              ...(prev.billingQtyPerOrderUnit != null
                ? { billingQtyPerOrderUnit: prev.billingQtyPerOrderUnit }
                : {}),
              ...(prev.pricePerBillingUnit != null ? { pricePerBillingUnit: prev.pricePerBillingUnit } : {}),
            }
          : supplierProductHasDistinctBilling(p)
            ? {
                billingUnit: p.billingUnit!,
                ...(p.billingQtyPerOrderUnit != null ? { billingQtyPerOrderUnit: p.billingQtyPerOrderUnit } : {}),
                ...(p.pricePerBillingUnit != null ? { pricePerBillingUnit: p.pricePerBillingUnit } : {}),
              }
            : {};
      return {
        id: p.id,
        supplierProductId: p.id,
        productName: p.name,
        unit: p.unit,
        quantity,
        receivedQuantity,
        pricePerUnit: p.pricePerUnit,
        vatRate: p.vatRate ?? 0,
        lineTotal,
        ...billingSnap,
        ...(unitSupportsReceivedWeightKg(p.unit) && p.estimatedKgPerUnit != null && p.estimatedKgPerUnit > 0
          ? { estimatedKgPerUnit: p.estimatedKgPerUnit }
          : {}),
        ...(prev?.basePricePerUnit != null && Number.isFinite(prev.basePricePerUnit)
          ? { basePricePerUnit: prev.basePricePerUnit }
          : {}),
        receivedWeightKg: prev?.receivedWeightKg ?? null,
        receivedPricePerKg: prev?.receivedPricePerKg ?? null,
        incidentType: prev?.incidentType ?? null,
        incidentNotes: prev?.incidentNotes,
        excludeFromPriceEvolution: Boolean(prev?.excludeFromPriceEvolution),
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
    const editingSent = Boolean(existingSentAt && existingOrderId);
    const effectiveStatus: 'draft' | 'sent' = editingSent ? 'sent' : nextStatus;
    const markContentRevisedAfterSent = editingSent && effectiveStatus === 'sent';

    if (isDemoMode()) {
      const orderId = existingOrderId ?? `demo-order-${uid('o')}`;
      const created = existingCreatedAt ?? new Date().toISOString();
      const lineTotalSum = Math.round(items.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
      const order: PedidoOrder = {
        id: orderId,
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        supplierContact: selectedSupplier.contact,
        status: effectiveStatus,
        notes: notes.trim(),
        createdAt: created,
        ...(effectiveStatus === 'sent' ? { sentAt: existingSentAt ?? new Date().toISOString() } : {}),
        deliveryDate: deliveryDate || undefined,
        updatedAt: new Date().toISOString(),
        ...(markContentRevisedAfterSent ? { contentRevisedAfterSentAt: new Date().toISOString() } : {}),
        items: items.map((item) => ({
          ...item,
          id: item.id || `demo-li-${uid('i')}`,
        })),
        total: lineTotalSum,
        ...(actorLabel(displayName, loginUsername).trim()
          ? { usuarioNombre: actorLabel(displayName, loginUsername).trim() }
          : {}),
      };
      resetPedidoFormAfterSuccess();
      upsertOrder(order);
      dispatchPedidosDataChanged();
      router.replace(`/pedidos?${markContentRevisedAfterSent ? 'pedido=actualizado' : 'pedido=borrador'}`);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setMessage('Sin conexión con Supabase.');
      return;
    }
    const usuarioNombrePedido = actorLabel(displayName, loginUsername).trim();
    void saveOrder(supabase, localId, {
      orderId: existingOrderId ?? undefined,
      supplierId: selectedSupplier.id,
      status: effectiveStatus,
      notes: notes.trim(),
      createdAt: existingCreatedAt ?? new Date().toISOString(),
      sentAt: effectiveStatus === 'sent' ? existingSentAt ?? new Date().toISOString() : undefined,
      deliveryDate: deliveryDate || undefined,
      expectedOrderUpdatedAt: existingOrderUpdatedAt ?? undefined,
      markContentRevisedAfterSent,
      ...(usuarioNombrePedido ? { usuarioNombre: usuarioNombrePedido } : {}),
      items: items.map((item) => ({
        supplierProductId: item.supplierProductId,
        productName: item.productName,
        unit: item.unit,
        quantity: item.quantity,
        receivedQuantity: item.receivedQuantity,
        pricePerUnit: item.pricePerUnit,
        vatRate: item.vatRate,
        lineTotal: item.lineTotal,
        estimatedKgPerUnit: item.estimatedKgPerUnit ?? null,
        receivedWeightKg: item.receivedWeightKg ?? null,
        basePricePerUnit: item.basePricePerUnit ?? item.pricePerUnit,
        incidentType: item.incidentType ?? null,
        incidentNotes: item.incidentNotes?.trim() ? item.incidentNotes.trim() : null,
        receivedPricePerKg: item.receivedPricePerKg ?? null,
        billingUnit: item.billingUnit ?? null,
        billingQtyPerOrderUnit: item.billingQtyPerOrderUnit ?? null,
        pricePerBillingUnit: item.pricePerBillingUnit ?? null,
        excludeFromPriceEvolution: Boolean(item.excludeFromPriceEvolution),
      })),
    })
      .then((orderId) => {
        const qp = markContentRevisedAfterSent ? 'pedido=actualizado' : 'pedido=borrador';
        resetPedidoFormAfterSuccess();
        void pullNewOrderIntoStore(orderId);
        dispatchPedidosDataChanged();
        router.replace(`/pedidos?${qp}`);
      })
      .catch((err: Error) => setMessage(err.message));
  };

  const sendToWhatsappInOneStep = () => {
    if (!selectedSupplier) return setMessage('Selecciona proveedor.');
    if (items.length === 0) return setMessage('Añade al menos un producto.');
    if (!localId) return setMessage('Perfil del local aún cargando.');
    if (!deliveryDate.trim()) return setMessage('Fecha de entrega obligatoria.');
    if (!requestedBy.trim()) return setMessage('Indica quién pide.');
    const phone = normalizeWhatsappPhone(selectedSupplier.contact);
    if (!phone) return setMessage('El proveedor no tiene teléfono válido en contacto.');
    const parsed = new Date(`${deliveryDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return setMessage('Fecha de entrega inválida. Usa AAAA-MM-DD.');
    const editingSentWhatsapp = Boolean(existingSentAt && existingOrderId);
    const markRevWhatsapp = editingSentWhatsapp;

    if (isDemoMode()) {
      const orderId = existingOrderId ?? `demo-order-${uid('o')}`;
      const created = existingCreatedAt ?? new Date().toISOString();
      const lineTotalSum = Math.round(items.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
      const order: PedidoOrder = {
        id: orderId,
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        supplierContact: selectedSupplier.contact,
        status: 'sent',
        notes: notes.trim(),
        createdAt: created,
        sentAt: existingSentAt ?? new Date().toISOString(),
        deliveryDate,
        updatedAt: new Date().toISOString(),
        ...(markRevWhatsapp ? { contentRevisedAfterSentAt: new Date().toISOString() } : {}),
        items: items.map((item) => ({
          ...item,
          id: item.id || `demo-li-${uid('i')}`,
        })),
        total: lineTotalSum,
        ...(actorLabel(displayName, loginUsername).trim()
          ? { usuarioNombre: actorLabel(displayName, loginUsername).trim() }
          : {}),
      };
      resetPedidoFormAfterSuccess();
      upsertOrder(order);
      dispatchPedidosDataChanged();
      setMessage('Demo: pedido guardado como enviado (no se abre WhatsApp).');
      window.setTimeout(() => setMessage(null), 4000);
      router.replace('/pedidos?pedido=enviado');
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Sin conexión con Supabase.');
    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      setMessage('Tu navegador bloqueó WhatsApp. Permite ventanas emergentes e inténtalo de nuevo.');
      return;
    }

    const usuarioNombreWhatsapp = actorLabel(displayName, loginUsername).trim();
    void saveOrder(supabase, localId, {
      orderId: existingOrderId ?? undefined,
      supplierId: selectedSupplier.id,
      status: 'sent',
      notes: notes.trim(),
      createdAt: existingCreatedAt ?? new Date().toISOString(),
      sentAt: existingSentAt ?? new Date().toISOString(),
      deliveryDate,
      expectedOrderUpdatedAt: existingOrderUpdatedAt ?? undefined,
      markContentRevisedAfterSent: markRevWhatsapp,
      ...(usuarioNombreWhatsapp ? { usuarioNombre: usuarioNombreWhatsapp } : {}),
      items: items.map((item) => ({
        supplierProductId: item.supplierProductId,
        productName: item.productName,
        unit: item.unit,
        quantity: item.quantity,
        receivedQuantity: item.receivedQuantity,
        pricePerUnit: item.pricePerUnit,
        vatRate: item.vatRate,
        lineTotal: item.lineTotal,
        estimatedKgPerUnit: item.estimatedKgPerUnit ?? null,
        receivedWeightKg: item.receivedWeightKg ?? null,
        basePricePerUnit: item.basePricePerUnit ?? item.pricePerUnit,
        incidentType: item.incidentType ?? null,
        incidentNotes: item.incidentNotes?.trim() ? item.incidentNotes.trim() : null,
        receivedPricePerKg: item.receivedPricePerKg ?? null,
        billingUnit: item.billingUnit ?? null,
        billingQtyPerOrderUnit: item.billingQtyPerOrderUnit ?? null,
        pricePerBillingUnit: item.pricePerBillingUnit ?? null,
        excludeFromPriceEvolution: Boolean(item.excludeFromPriceEvolution),
      })),
    })
      .then((orderId) => {
        const supa = getSupabaseClient();
        if (supa && localId && selectedSupplier) {
          void notifyPedidoEnviado(supa, {
            localId,
            userId,
            actorName: actorLabel(displayName, loginUsername),
            supplierName: selectedSupplier.name,
            orderId,
          });
        }
        resetPedidoFormAfterSuccess();
        void pullNewOrderIntoStore(orderId);
        const whatsappMessage = buildWhatsappDraftMessage({
          createdAtIso: existingCreatedAt ?? new Date().toISOString(),
          deliveryDate: parsed.toLocaleDateString('es-ES'),
          localName: localName ?? 'MATARO',
          requestedBy: requestedBy.trim(),
          notes: notes.trim(),
          items,
          contentRevisedAfterSent: markRevWhatsapp || Boolean(hadContentRevisionFlag),
        });
        openWhatsAppMessage(phone, whatsappMessage, { popupWindow: popup });
        dispatchPedidosDataChanged();
        router.replace('/pedidos?pedido=enviado');
      })
      .catch((err: Error) => {
        popup.close();
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

  if (editingId && editBlockedReason) {
    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-100">
          {editBlockedReason}
        </section>
      </div>
    );
  }

  if (editingId && !isLoadedEdit) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-600">Cargando pedido…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {existingSentAt && editingId ? (
        <section
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-950 shadow-sm ring-1 ring-amber-100"
          role="status"
        >
          <p>Este pedido ya fue enviado. Puedes modificarlo y volver a enviarlo.</p>
          {hadContentRevisionFlag ? (
            <p className="mt-1.5 font-bold uppercase tracking-wide text-amber-900">Modificado tras envío</p>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-2xl bg-white px-3 py-2.5 ring-1 ring-zinc-200 sm:px-3.5 sm:py-3">
        <label className="text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">Proveedor</label>
        {loadingSuppliers ? <p className="mt-1 text-[10px] font-semibold text-zinc-500">Cargando catálogo…</p> : null}
        <select
          value={supplierId}
          disabled={Boolean(existingSentAt && existingOrderId)}
          onChange={(e) => setSupplierId(e.target.value)}
          className="mt-1 h-9 w-full rounded-lg border border-zinc-300 bg-white px-2.5 text-sm font-medium text-zinc-900 outline-none disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
        >
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="mt-2">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">Fecha de entrega</p>
          <div className="relative mt-1 w-full min-w-0">
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              aria-label="Fecha de entrega del pedido"
              className={[
                'box-border h-9 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-2.5 text-sm font-medium text-zinc-900 outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/25',
                deliveryDate ? 'text-zinc-900' : 'text-transparent',
              ].join(' ')}
            />
            {!deliveryDate ? (
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                Elegir fecha
              </span>
            ) : null}
          </div>
        </div>
        {selectedDateIsException ? (
          <p className="mt-1.5 text-[10px] font-semibold text-emerald-700">Fecha excepcional válida para este proveedor.</p>
        ) : null}
        {coverageRangeLabel ? (
          <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/90 px-2 py-1.5 text-[10px] text-emerald-950 ring-1 ring-emerald-100 sm:text-[11px]">
            <p className="text-center font-bold uppercase tracking-wide text-emerald-900">Cobertura de este pedido</p>
            <p className="mt-0.5 text-center font-medium capitalize leading-tight">{coverageRangeLabel}</p>
          </div>
        ) : deliveryDate.trim() !== '' ? null : (
          <p className="mt-1.5 text-[10px] text-zinc-500">
            Elige fecha de entrega para ver el tramo y los objetivos por línea.
          </p>
        )}
        {deliveryDayMismatch ? (
          <p className="mt-1.5 text-[10px] font-semibold text-amber-800 sm:text-[11px]">
            Esta fecha no es un día de reparto marcado para el proveedor. Revisa Proveedores o la fecha del albarán.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-center text-sm font-bold text-zinc-800">CATALOGO</p>
        <label className="mt-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Buscar producto</label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar..."
          className="mt-2 h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
        />
        <div className="mt-2 space-y-2">
          {selectedSupplier && filteredProducts.length === 0 ? (
            <p className="text-sm text-zinc-500">Este proveedor no tiene productos activos. Revísalo en Proveedores.</p>
          ) : null}
          {filteredProducts.map((p) => {
            const qty = qtyByProductId[p.id] ?? 0;
            const lineTotal = Math.round(qty * p.pricePerUnit * 100) / 100;
            const segmentTarget =
              coverageDays != null ? weeklyParScaledToCoverageDays(p.parStock ?? 0, coverageDays) : null;
            const suggestedQty = segmentTarget != null ? suggestedOrderQuantityForPar(p.unit, segmentTarget) : null;
            return (
              <PedidosNuevoCatalogLine
                key={p.id}
                product={p}
                qty={qty}
                lineTotal={lineTotal}
                suggestedQty={coverageDays != null && suggestedQty != null ? suggestedQty : null}
                onDelta={(d) => adjustQty(p.id, p.unit, d)}
                onManual={(raw) => setQtyFromInput(p.id, p.unit, raw)}
              />
            );
          })}
        </div>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Quién pide</label>
        <input
          value={requestedBy}
          onChange={(e) => setRequestedBy(e.target.value)}
          placeholder="Nombre de quien pide"
          className="mt-2 h-10 w-full min-w-0 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-sans text-zinc-900 placeholder:text-zinc-500 outline-none"
        />
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <label className="mt-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Notas</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
          placeholder="Observaciones del pedido..."
        />
        {message ? <p className="mt-3 text-sm text-[#B91C1C]">{message}</p> : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm ring-1 ring-zinc-100">
        <div className="rounded-xl bg-zinc-50 p-2 ring-1 ring-zinc-200">
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
        <div className="mt-2 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => {
              void (async () => {
                if (!(await appConfirm('¿Cancelar pedido y vaciar cesta?'))) return;
                resetPedidoFormAfterSuccess();
                router.push('/pedidos');
              })();
            }}
            className="h-11 rounded-xl border border-zinc-300 bg-white text-sm font-bold text-zinc-700"
          >
            Cancelar
          </button>
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
            className="inline-flex h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-[#25D366] px-1.5 py-1 text-[10px] font-semibold leading-tight text-white shadow-sm ring-1 ring-[#128C7E]/40 sm:flex-row sm:gap-1.5 sm:px-2.5 sm:text-xs"
            aria-label="Enviar pedido por WhatsApp"
          >
            <svg className="h-4 w-4 shrink-0 text-white" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="currentColor"
                d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
              />
            </svg>
            <span className="text-center leading-tight sm:hidden">
              Enviar por
              <br />
              WhatsApp
            </span>
            <span className="hidden sm:inline">Enviar WhatsApp</span>
          </button>
        </div>
      </section>
    </div>
  );
}
