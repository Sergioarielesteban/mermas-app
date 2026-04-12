'use client';

import Link from 'next/link';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { usePedidosOrders } from '@/components/PedidosOrdersProvider';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import type { PedidoOrder } from '@/lib/pedidos-supabase';

type CalendarGroup = { date: string; orders: PedidoOrder[] };

export default function PedidosCalendarioPage() {
  const { localCode, localName, localId, email } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const { orders: allOrders } = usePedidosOrders();
  const orders = React.useMemo(() => allOrders.filter((o) => o.status === 'sent'), [allOrders]);

  const groups = React.useMemo<CalendarGroup[]>(() => {
    const map = new Map<string, PedidoOrder[]>();
    for (const order of orders) {
      const date = order.deliveryDate ?? order.createdAt.slice(0, 10);
      const list = map.get(date) ?? [];
      list.push(order);
      map.set(date, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, rows]) => ({ date, orders: rows }));
  }, [orders]);

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
        <Link href="/pedidos" className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700">
          ← Atras
        </Link>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-lg font-black text-zinc-900">Calendario de entregas</h1>
        <p className="pt-1 text-sm text-zinc-600">Vista por fecha de entrega para organizar recepción.</p>
      </section>

      <section className="space-y-3">
        {groups.length === 0 ? (
          <div className="rounded-2xl bg-white p-4 text-sm text-zinc-500 ring-1 ring-zinc-200">No hay pedidos enviados en calendario.</div>
        ) : null}
        {groups.map((group) => (
          <div key={group.date} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
            <p className="text-sm font-black text-zinc-900">
              {new Date(`${group.date}T00:00:00`).toLocaleDateString('es-ES')}
            </p>
            <div className="mt-2 space-y-2">
              {group.orders.map((order) => (
                <div key={order.id} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                  <p className="text-sm font-semibold text-zinc-900">{order.supplierName}</p>
                  <p className="text-xs text-zinc-500">{order.items.length} líneas</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

