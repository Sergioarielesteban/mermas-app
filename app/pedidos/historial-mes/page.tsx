'use client';

import Link from 'next/link';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import { canAccessPedidos } from '@/lib/pedidos-access';
import { fetchOrders, type PedidoOrder } from '@/lib/pedidos-supabase';

function totalsWithVat(order: PedidoOrder) {
  const base = order.items.reduce((acc, item) => acc + item.lineTotal, 0);
  const vat = order.items.reduce((acc, item) => acc + item.lineTotal * (item.vatRate ?? 0), 0);
  return { base, vat, total: base + vat };
}

export default function PedidosHistorialMesPage() {
  const { localCode, localName, localId, email } = useAuth();
  const canUse = canAccessPedidos(localCode, email, localName, localId);
  const [orders, setOrders] = React.useState<PedidoOrder[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [month, setMonth] = React.useState(() => new Date().toISOString().slice(0, 7));

  React.useEffect(() => {
    if (!canUse || !localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchOrders(supabase, localId)
      .then((rows) => setOrders(rows))
      .catch((err: Error) => setMessage(err.message));
  }, [canUse, localId]);

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
        byProduct: Map<string, { unit: string; quantity: number }>;
      }
    >();

    for (const order of accountingOrders) {
      const pivotDate = (order.receivedAt ?? order.sentAt ?? order.createdAt).slice(0, 7);
      if (pivotDate !== month) continue;

      const existing = bySupplier.get(order.supplierId) ?? {
        supplierName: order.supplierName,
        totalWithVat: 0,
        byProduct: new Map<string, { unit: string; quantity: number }>(),
      };

      const totals = totalsWithVat(order);
      existing.totalWithVat += totals.total;

      for (const item of order.items) {
        const prod = existing.byProduct.get(item.productName) ?? { unit: item.unit, quantity: 0 };
        prod.quantity += order.status === 'received' ? item.receivedQuantity : item.quantity;
        existing.byProduct.set(item.productName, prod);
      }
      bySupplier.set(order.supplierId, existing);
    }

    return Array.from(bySupplier.values())
      .map((row) => ({
        ...row,
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
      <section>
        <Link
          href="/pedidos"
          className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700"
        >
          ← Atras
        </Link>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-center text-lg font-black text-zinc-900">HISTORIAL MES</h1>
        <p className="pt-1 text-center text-xs text-zinc-600">Total por proveedor (IVA incl.) y cantidades acumuladas por producto</p>
      </section>

      {message ? (
        <section className="rounded-2xl bg-white p-4 text-sm text-[#B91C1C] ring-1 ring-zinc-200">{message}</section>
      ) : null}

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-zinc-800">Mes</p>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-800 outline-none"
          />
        </div>
        <div className="mt-3 space-y-2">
          {monthlyBySupplier.length === 0 ? (
            <p className="text-sm text-zinc-500">No hay compras de pedidos para ese mes.</p>
          ) : null}
          {monthlyBySupplier.map((supplier) => (
            <div key={supplier.supplierName} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
              <p className="text-sm font-bold text-zinc-900">{supplier.supplierName}</p>
              <p className="pt-1 text-xs text-zinc-600">
                Total del mes (IVA incluido):{' '}
                <span className="font-black text-zinc-900">{supplier.totalWithVat.toFixed(2)} €</span>
              </p>
              <div className="mt-2 space-y-1">
                {supplier.products.map((product) => (
                  <p key={`${supplier.supplierName}-${product.name}`} className="text-xs text-zinc-700">
                    {product.name}:{' '}
                    <span className="font-semibold">
                      {product.quantity.toFixed(product.unit === 'kg' ? 2 : 0)} {product.unit}
                    </span>
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
