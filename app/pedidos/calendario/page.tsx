'use client';

import Link from 'next/link';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { canAccessPedidos } from '@/lib/pedidos-access';
import { fetchOrders, type PedidoOrder } from '@/lib/pedidos-supabase';
import { getSupabaseClient } from '@/lib/supabase-client';

type CalendarGroup = { date: string; orders: PedidoOrder[] };

export default function PedidosCalendarioPage() {
  const { localCode, localName, localId, email } = useAuth();
  const canUse = canAccessPedidos(localCode, email, localName, localId);
  const [orders, setOrders] = React.useState<PedidoOrder[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!canUse || !localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchOrders(supabase, localId)
      .then((rows) => setOrders(rows.filter((o) => o.status === 'sent')))
      .catch((err: Error) => setMessage(err.message));
  }, [canUse, localId]);

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
        <Link href="/pedidos" className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700">
          ← Atras
        </Link>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-lg font-black text-zinc-900">Calendario de entregas</h1>
        <p className="pt-1 text-sm text-zinc-600">Vista por fecha de entrega para organizar recepción.</p>
        {message ? <p className="pt-2 text-sm text-[#B91C1C]">{message}</p> : null}
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

