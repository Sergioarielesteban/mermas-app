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
  const { localCode, localName, localId, email } = useAuth();
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
  const filteredProducts = supplierProducts
    .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  React.useEffect(() => {
    if (!editingId) return;
    if (!localId) return;
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

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-center text-lg font-black text-zinc-900">NUEVO PEDIDO</h1>
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
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Buscar producto
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar..."
          className="mt-2 h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
        />
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-center text-sm font-bold text-zinc-800">CATALOGO</p>
        <div className="mt-2 space-y-2">
          {selectedSupplier && filteredProducts.length === 0 ? (
            <p className="text-sm text-zinc-500">Este proveedor no tiene productos activos. Revísalo en Proveedores.</p>
          ) : null}
          {filteredProducts.map((p) => {
            const qty = qtyByProductId[p.id] ?? 0;
            const lineTotal = Math.round(qty * p.pricePerUnit * 100) / 100;
            return (
              <div key={p.id} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-800">{p.name}</p>
                    <p className="text-xs text-zinc-500">
                      {p.pricePerUnit.toFixed(2)} €/{unitPriceCatalogSuffix[p.unit]}
                    </p>
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
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Notas</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
          placeholder="Observaciones del pedido..."
        />
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Fecha entrega</label>
        <input
          type="date"
          value={deliveryDate}
          onChange={(e) => setDeliveryDate(e.target.value)}
          className="mt-2 h-10 w-full min-w-0 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-sans text-zinc-900 outline-none"
        />
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Quien pide</label>
        <input
          value={requestedBy}
          onChange={(e) => setRequestedBy(e.target.value)}
          placeholder="Nombre de quien pide"
          className="mt-2 h-10 w-full min-w-0 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-sans text-zinc-900 placeholder:text-zinc-500 outline-none"
        />
        <div className="mt-4 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
          <div className="flex items-center justify-between text-sm text-zinc-700">
            <span>Subtotal</span>
            <span className="font-semibold">{totalBase.toFixed(2)} €</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm text-zinc-700">
            <span>IVA</span>
            <span className="font-semibold">{totalVat.toFixed(2)} €</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-base font-black text-zinc-900">
            <span>Total</span>
            <span>{total.toFixed(2)} €</span>
          </div>
        </div>
        {message ? <p className="mt-3 text-sm text-[#B91C1C]">{message}</p> : null}
      </section>

      <section className="sticky bottom-2 z-20 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-lg backdrop-blur">
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
            className="h-11 rounded-xl border border-[#2563EB] bg-white text-sm font-bold text-[#2563EB]"
          >
            Enviar pedido por WhatsApp
          </button>
        </div>
      </section>
    </div>
  );
}
