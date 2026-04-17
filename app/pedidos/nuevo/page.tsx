'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { usePedidosOrders } from '@/components/PedidosOrdersProvider';
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
import { formatQuantityWithUnit, unitPriceCatalogSuffix } from '@/lib/pedidos-format';
import {
  readSuppliersSessionCache,
  writeSuppliersSessionCache,
} from '@/lib/pedidos-session-cache';
import {
  fetchOrderById,
  fetchOrders,
  fetchSuppliersWithProducts,
  saveOrder,
  unitSupportsReceivedWeightKg,
  type PedidoOrderItem,
  type PedidoSupplier,
} from '@/lib/pedidos-supabase';
import { actorLabel, notifyPedidoEnviado } from '@/services/notifications';

type QtyMap = Record<string, number>;

const basketSessionKey = (localId: string) => `chefone_pedidos_basket:${localId}`;

function shortUnitChip(unit: string): string {
  const u = unit.toLowerCase();
  if (u === 'paquete') return 'PAQ.';
  if (u === 'caja') return 'CAJ.';
  if (u === 'bolsa') return 'BOL.';
  if (u === 'racion') return 'RAC.';
  return unit.toUpperCase();
}

function normalizeWhatsappNumber(raw: string | undefined) {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  return digits || null;
}

function normalizeLocalForWhatsapp(raw: string) {
  const cleaned = raw.replace(/\bCAN\b/gi, '').replace(/\s+/g, ' ').trim();
  return cleaned || 'CHEF-ONE MATARO';
}

function buildWhatsappDraftMessage(input: {
  supplierName: string;
  createdAtIso: string;
  deliveryDate: string;
  localName: string;
  requestedBy: string;
  notes: string;
  items: PedidoOrderItem[];
}) {
  const fechaPedido = new Date(input.createdAtIso).toLocaleDateString('es-ES');
  return [
    `Proveedor: ${input.supplierName}`,
    `Fecha pedido: ${fechaPedido}`,
    `Fecha entrega: ${input.deliveryDate}`,
    `Local: ${normalizeLocalForWhatsapp(input.localName || 'CHEF-ONE MATARO')}`,
    `Pedido por: ${input.requestedBy}`,
    '------------------------------',
    'PEDIDO:',
    '------------------------------',
    ...input.items.map((item) => `- ${item.productName}: ${formatQuantityWithUnit(item.quantity, item.unit)}`),
    '------------------------------',
    input.notes ? `Notas: ${input.notes}` : '',
    'Por favor, confirmar pedido. Gracias.',
  ]
    .filter(Boolean)
    .join('\n');
}

export default function NuevoPedidoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { localCode, localName, localId, email, userId, displayName, loginUsername } = useAuth();
  const { upsertOrder } = usePedidosOrders();

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

  const clearBasketDraft = React.useCallback(() => {
    if (!localId) return;
    try {
      sessionStorage.removeItem(basketSessionKey(localId));
    } catch {
      /* ignore */
    }
  }, [localId]);

  const reloadSuppliers = React.useCallback(() => {
    if (!canUse || !localId) return;
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

  React.useEffect(() => {
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

  const filteredProducts = supplierProducts
    .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  React.useEffect(() => {
    if (!editingId) return;
    if (!localId) return;
    setExistingOrderUpdatedAt(null);
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchOrders(supabase, localId)
      .then((rows) => {
        const draft = rows.find((row) => row.id === editingId);
        if (!draft) {
          setMessage('No se encontro el borrador para editar.');
          setIsLoadedEdit(true);
          return;
        }
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
  }, [editingId, localId]);

  React.useEffect(() => {
    setSearch('');
    if (editingId && !isLoadedEdit) return;
    setQtyByProductId((prev) => {
      const next: QtyMap = {};
      for (const product of supplierProducts) {
        next[product.id] = prev[product.id] ?? 0;
      }
      return next;
    });
  }, [supplierId, supplierProducts, editingId, isLoadedEdit]);

  const setQtyFromInput = (productId: string, unit: PedidoOrderItem['unit'], raw: string) => {
    if (raw.trim() === '') {
      setQtyByProductId((prev) => ({ ...prev, [productId]: 0 }));
      return;
    }
    const num = Number(raw.replace(',', '.'));
    if (Number.isNaN(num) || num < 0) return;
    const next = unit === 'kg' ? Math.round(num * 100) / 100 : Math.floor(num);
    setQtyByProductId((prev) => ({ ...prev, [productId]: next }));
  };

  const adjustQty = (productId: string, unit: PedidoOrderItem['unit'], delta: number) => {
    setQtyByProductId((prev) => {
      const current = prev[productId] ?? 0;
      const step = unit === 'kg' ? 0.01 : 1;
      const raw = current + delta * step;
      const next =
        unit === 'kg' ? Math.max(0, Math.round(raw * 100) / 100) : Math.max(0, Math.floor(raw));
      return { ...prev, [productId]: next };
    });
  };

  const items: PedidoOrderItem[] = supplierProducts
    .map((p) => {
      const quantity = qtyByProductId[p.id] ?? 0;
      const lineTotal = Math.round(quantity * p.pricePerUnit * 100) / 100;
      return {
        id: p.id,
        supplierProductId: p.id,
        productName: p.name,
        unit: p.unit,
        quantity,
        receivedQuantity: 0,
        pricePerUnit: p.pricePerUnit,
        vatRate: p.vatRate ?? 0,
        lineTotal,
        ...(unitSupportsReceivedWeightKg(p.unit) && p.estimatedKgPerUnit != null && p.estimatedKgPerUnit > 0
          ? { estimatedKgPerUnit: p.estimatedKgPerUnit }
          : {}),
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
    const supabase = getSupabaseClient();
    if (!supabase) {
      setMessage('Sin conexión con Supabase.');
      return;
    }
    void saveOrder(supabase, localId, {
      orderId: existingOrderId ?? undefined,
      supplierId: selectedSupplier.id,
      status: nextStatus,
      notes: notes.trim(),
      createdAt: existingCreatedAt ?? new Date().toISOString(),
      sentAt: nextStatus === 'sent' ? existingSentAt ?? new Date().toISOString() : undefined,
      deliveryDate: deliveryDate || undefined,
      expectedOrderUpdatedAt: existingOrderUpdatedAt ?? undefined,
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
      })),
    })
      .then((orderId) => {
        clearBasketDraft();
        void pullNewOrderIntoStore(orderId);
        dispatchPedidosDataChanged();
        router.push('/pedidos');
      })
      .catch((err: Error) => setMessage(err.message));
  };

  const sendToWhatsappInOneStep = () => {
    if (!selectedSupplier) return setMessage('Selecciona proveedor.');
    if (items.length === 0) return setMessage('Añade al menos un producto.');
    if (!localId) return setMessage('Perfil del local aún cargando.');
    if (!deliveryDate.trim()) return setMessage('Fecha de entrega obligatoria.');
    if (!requestedBy.trim()) return setMessage('Indica quién pide.');
    const phone = normalizeWhatsappNumber(selectedSupplier.contact);
    if (!phone) return setMessage('El proveedor no tiene teléfono válido en contacto.');
    const parsed = new Date(`${deliveryDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return setMessage('Fecha de entrega inválida. Usa AAAA-MM-DD.');
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Sin conexión con Supabase.');
    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      setMessage('Tu navegador bloqueó WhatsApp. Permite ventanas emergentes e inténtalo de nuevo.');
      return;
    }

    void saveOrder(supabase, localId, {
      orderId: existingOrderId ?? undefined,
      supplierId: selectedSupplier.id,
      status: 'sent',
      notes: notes.trim(),
      createdAt: existingCreatedAt ?? new Date().toISOString(),
      sentAt: existingSentAt ?? new Date().toISOString(),
      deliveryDate,
      expectedOrderUpdatedAt: existingOrderUpdatedAt ?? undefined,
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
        clearBasketDraft();
        void pullNewOrderIntoStore(orderId);
        const text = encodeURIComponent(
          buildWhatsappDraftMessage({
            supplierName: selectedSupplier.name,
            createdAtIso: existingCreatedAt ?? new Date().toISOString(),
            deliveryDate: parsed.toLocaleDateString('es-ES'),
            localName: localName ?? 'MATARO',
            requestedBy: requestedBy.trim(),
            notes: notes.trim(),
            items,
          }),
        );
        popup.location.href = `https://wa.me/${phone}?text=${text}`;
        dispatchPedidosDataChanged();
        router.push('/pedidos');
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

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Proveedor</label>
        {loadingSuppliers ? <p className="mt-2 text-xs font-semibold text-zinc-500">Cargando catálogo de proveedores...</p> : null}
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="mt-2 h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 outline-none"
        >
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="mx-auto mt-4 w-full max-w-sm rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-zinc-50 to-white px-4 py-3 text-center shadow-sm ring-1 ring-zinc-100">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">Fecha de entrega</p>
          <p className="mt-1.5 text-[11px] font-medium leading-snug text-zinc-600">
            {deliveryDate
              ? 'Esta fecha es la que llevará el pedido al enviarlo: el proveedor la verá como día de entrega.'
              : 'Elige el día de entrega. Al enviar, el pedido saldrá con esa misma fecha.'}
          </p>
          <div className="relative mx-auto mt-3 w-full max-w-[17.5rem]">
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              aria-label="Fecha de entrega del pedido"
              className={[
                'box-border h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/25',
                deliveryDate ? 'text-zinc-900' : 'text-transparent',
              ].join(' ')}
            />
            {!deliveryDate ? (
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                Seleccionar fecha
              </span>
            ) : null}
          </div>
        </div>
        {selectedDateIsException ? (
          <p className="mt-3 text-[11px] font-semibold text-emerald-700">Fecha excepcional válida para este proveedor.</p>
        ) : null}
        {coverageRangeLabel ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 text-[11px] text-emerald-950 ring-1 ring-emerald-100">
            <p className="text-center font-bold uppercase tracking-wide text-emerald-900">Cobertura de este pedido</p>
            <p className="mt-1 text-center font-medium capitalize">{coverageRangeLabel}</p>
          </div>
        ) : deliveryDate.trim() !== '' ? null : (
          <p className="mt-3 text-[11px] text-zinc-500">
            Elige fecha de entrega para ver el tramo hasta el siguiente reparto y los objetivos por línea.
          </p>
        )}
        {deliveryDayMismatch ? (
          <p className="mt-2 text-[11px] font-semibold text-amber-800">
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
            const u = unitPriceCatalogSuffix[p.unit];
            return (
              <div key={p.id} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-800">{p.name}</p>
                    <p className="text-xs text-zinc-500">
                      {p.pricePerUnit.toFixed(2)} €/{u}
                    </p>
                    {coverageDays != null && suggestedQty != null ? (
                      <p className="mt-1 text-[11px] font-semibold text-zinc-700">
                        Cant. tramo: {formatQuantityWithUnit(suggestedQty, p.unit)}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-zinc-900">
                    {lineTotal.toFixed(2)} €
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-[2.25rem_2.75rem_2.25rem_2.75rem] items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => adjustQty(p.id, p.unit, -1)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-zinc-300 bg-white text-lg font-semibold leading-none text-zinc-400 shadow-sm active:bg-zinc-50"
                    aria-label={`Quitar una unidad de ${p.name}`}
                  >
                    {'\u2212'}
                  </button>
                  <input
                    type="number"
                    min={0}
                    step={p.unit === 'kg' ? 0.01 : 1}
                    inputMode="decimal"
                    aria-label={`Cantidad ${p.name}`}
                    className="h-9 w-11 shrink-0 rounded-lg border border-zinc-300 bg-white px-1 text-center text-sm font-semibold text-zinc-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    value={qty === 0 ? '' : p.unit === 'kg' ? qty : Math.round(qty)}
                    onChange={(e) => setQtyFromInput(p.id, p.unit, e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => adjustQty(p.id, p.unit, 1)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#D32F2F] text-lg font-semibold leading-none text-white shadow-sm active:bg-[#B71C1C]"
                    aria-label={`Añadir una unidad de ${p.name}`}
                  >
                    +
                  </button>
                  <span className="w-11 text-left text-[10px] font-semibold uppercase text-zinc-500">
                    {shortUnitChip(p.unit)}
                  </span>
                </div>
              </div>
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
              if (!window.confirm('¿Cancelar pedido y vaciar cesta?')) return;
              clearBasketDraft();
              router.push('/pedidos');
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
