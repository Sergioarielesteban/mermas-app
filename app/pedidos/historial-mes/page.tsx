'use client';

import Link from 'next/link';
import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { CHEF_ONE_TAPER_LINE_CLASS } from '@/components/ChefOneGlowLine';
import { getSupabaseClient } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { usePedidosDataChangedListener } from '@/hooks/usePedidosDataChangedListener';
import { formatQuantityWithUnit } from '@/lib/pedidos-format';
import { fetchOrders, type PedidoOrder } from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';

function totalsWithVat(order: PedidoOrder) {
  const base = order.items.reduce((acc, item) => acc + item.lineTotal, 0);
  const vat = order.items.reduce((acc, item) => acc + item.lineTotal * (item.vatRate ?? 0), 0);
  return { base, vat, total: base + vat };
}

export default function PedidosHistorialMesPage() {
  const { localCode, localName, localId, email } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const [orders, setOrders] = React.useState<PedidoOrder[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [month, setMonth] = React.useState(() => new Date().toISOString().slice(0, 7));

  const reload = React.useCallback(() => {
    if (!canUse || !localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchOrders(supabase, localId)
      .then((rows) => setOrders(rows))
      .catch((err: Error) => setMessage(err.message));
  }, [canUse, localId]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  usePedidosDataChangedListener(reload, Boolean(hasPedidosEntry && canUse));

  const accountingOrders = React.useMemo(
    () => orders.filter((row) => row.status === 'sent' || row.status === 'received'),
    [orders],
  );

  const monthlyBySupplier = React.useMemo(() => {
    const bySupplier = new Map<
      string,
      {
        supplierName: string;
        totalWithVat: number;
        orderCount: number;
        byProduct: Map<string, { unit: string; quantity: number }>;
      }
    >();

    for (const order of accountingOrders) {
      const pivotDate = (order.receivedAt ?? order.sentAt ?? order.createdAt).slice(0, 7);
      if (pivotDate !== month) continue;

      const existing = bySupplier.get(order.supplierId) ?? {
        supplierName: order.supplierName,
        totalWithVat: 0,
        orderCount: 0,
        byProduct: new Map<string, { unit: string; quantity: number }>(),
      };

      const totals = totalsWithVat(order);
      existing.totalWithVat += totals.total;
      existing.orderCount += 1;

      for (const item of order.items) {
        const prod = existing.byProduct.get(item.productName) ?? { unit: item.unit, quantity: 0 };
        prod.quantity += order.status === 'received' ? item.receivedQuantity : item.quantity;
        existing.byProduct.set(item.productName, prod);
      }
      bySupplier.set(order.supplierId, existing);
    }

    return Array.from(bySupplier.entries())
      .map(([supplierId, row]) => ({
        supplierId,
        supplierName: row.supplierName,
        orderCount: row.orderCount,
        totalWithVat: Math.round(row.totalWithVat * 100) / 100,
        products: Array.from(row.byProduct.entries())
          .map(([name, data]) => ({
            name,
            unit: data.unit,
            quantity: Math.round(data.quantity * 100) / 100,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'es')),
      }))
      .sort((a, b) => b.totalWithVat - a.totalWithVat);
  }, [accountingOrders, month]);

  const [expandedSupplierId, setExpandedSupplierId] = React.useState<string | null>(null);

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

      <section className="rounded-3xl bg-zinc-950 px-6 py-8 text-white shadow-xl shadow-zinc-900/20">
        <h1 className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Historial</h1>
        <p className="mt-2 text-center text-2xl font-light tracking-tight text-white sm:text-3xl">Compras del mes</p>
        <p className="mx-auto mt-3 max-w-sm text-center text-sm leading-relaxed text-zinc-400">
          Pulsa sobre el nombre del proveedor para desplegar el listado de productos
        </p>
      </section>

      {message ? (
        <section className="rounded-2xl bg-white p-4 text-sm text-[#B91C1C] ring-1 ring-zinc-200">{message}</section>
      ) : null}

      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/80">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4">
          <label className="text-xs font-medium text-zinc-500">
            <span className="block text-[10px] uppercase tracking-wider text-zinc-400">Período</span>
            <input
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setExpandedSupplierId(null);
              }}
              className="mt-1 h-11 rounded-2xl border-0 bg-zinc-100 px-4 text-base font-semibold text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
          </label>
        </div>
        <div className="mt-5 space-y-4">
          {monthlyBySupplier.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">No hay compras registradas en este mes.</p>
          ) : null}
          {monthlyBySupplier.map((supplier) => {
            const open = expandedSupplierId === supplier.supplierId;
            return (
              <div
                key={supplier.supplierId}
                className={[
                  'overflow-hidden rounded-3xl transition-all duration-300 ease-out',
                  open
                    ? 'bg-white shadow-lg shadow-zinc-200/60 ring-2 ring-zinc-900/5'
                    : 'bg-zinc-50/80 ring-1 ring-zinc-200/90 hover:bg-white hover:ring-zinc-300',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedSupplierId((id) => (id === supplier.supplierId ? null : supplier.supplierId))
                  }
                  className="flex w-full flex-col items-center px-6 py-8 text-center outline-none active:bg-zinc-50/50 focus-visible:ring-2 focus-visible:ring-[#D32F2F]/40 focus-visible:ring-offset-2"
                  aria-expanded={open}
                  id={`historial-proveedor-${supplier.supplierId}`}
                >
                  <span className="text-center text-2xl font-semibold leading-[1.15] tracking-tight text-zinc-900 sm:text-[1.75rem] sm:leading-tight">
                    {supplier.supplierName}
                  </span>
                  <span
                    className={`mx-auto mt-4 w-24 ${CHEF_ONE_TAPER_LINE_CLASS}`}
                    aria-hidden
                  />
                  <span className="mt-4 flex items-center gap-1.5 text-xs text-zinc-500">
                    <span className="tabular-nums">{supplier.totalWithVat.toFixed(2)} €</span>
                    <span className="text-zinc-400">·</span>
                    <span>
                      {supplier.orderCount} pedido{supplier.orderCount === 1 ? '' : 's'} · IVA incl.
                    </span>
                  </span>
                  <span className="mt-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#D32F2F]">
                    {open ? 'Ocultar productos' : 'Ver listado de productos'}
                    <ChevronDown
                      className={[
                        'h-4 w-4 transition-transform duration-300',
                        open ? 'rotate-180' : '',
                      ].join(' ')}
                      aria-hidden
                    />
                  </span>
                </button>
                {open ? (
                  <div
                    id={`historial-productos-${supplier.supplierId}`}
                    role="region"
                    aria-labelledby={`historial-proveedor-${supplier.supplierId}`}
                    className="border-t border-zinc-100 bg-gradient-to-b from-zinc-50/90 to-zinc-100/50 px-4 pb-5 pt-4 sm:px-6"
                  >
                    <p className="mb-4 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                      Productos · cantidades del mes
                    </p>
                    <ul className="space-y-2.5">
                      {supplier.products.map((product) => (
                        <li
                          key={`${supplier.supplierId}-${product.name}`}
                          className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-100 bg-white px-4 py-3.5 shadow-sm"
                        >
                          <span className="min-w-0 flex-1 text-left text-[15px] font-medium leading-snug text-zinc-800">
                            {product.name}
                          </span>
                          <span className="shrink-0 text-right text-[15px] font-semibold text-zinc-900">
                            {formatQuantityWithUnit(product.quantity, product.unit as Unit)}
                          </span>
                        </li>
                      ))}
                    </ul>
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
