'use client';

import Link from 'next/link';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { canAccessPedidos } from '@/lib/pedidos-access';
import { getPedidoDrafts } from '@/lib/pedidos-storage';

export default function PedidosPage() {
  const { localCode, email } = useAuth();
  const canUse = canAccessPedidos(localCode, email);
  const [draftsCount, setDraftsCount] = React.useState(0);
  const [draftsTotal, setDraftsTotal] = React.useState(0);

  React.useEffect(() => {
    if (!canUse) return;
    const drafts = getPedidoDrafts();
    setDraftsCount(drafts.length);
    setDraftsTotal(drafts.reduce((acc, d) => acc + d.total, 0));
  }, [canUse]);

  if (!canUse) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-black text-zinc-900">Modulo no habilitado</p>
        <p className="pt-1 text-sm text-zinc-600">Pedidos esta disponible solo para el local de Mataro.</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-lg font-black text-zinc-900">Pedidos</h1>
        <p className="pt-1 text-sm text-zinc-600">
          Gestion de pedidos de compra, recepcion de mercancia y control de incidencias.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Borradores</p>
          <p className="pt-2 text-2xl font-black text-zinc-900">{draftsCount}</p>
          <p className="pt-1 text-xs text-zinc-500">Total: {draftsTotal.toFixed(2)} EUR</p>
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pendientes recepcion</p>
          <p className="pt-2 text-2xl font-black text-zinc-900">0</p>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Accesos</p>
        <div className="mt-3 grid grid-cols-1 gap-2">
          <Link
            href="/pedidos/nuevo"
            className="rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-3 text-sm font-semibold text-zinc-800"
          >
            Nuevo pedido
          </Link>
          <Link
            href="/pedidos/proveedores"
            className="rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-3 text-sm font-semibold text-zinc-800"
          >
            Proveedores y catalogo
          </Link>
          <Link
            href="/pedidos/recepcion"
            className="rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-3 text-sm font-semibold text-zinc-800"
          >
            Recepcion de albaranes
          </Link>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-sm font-bold text-zinc-800">Proximo paso</p>
        <p className="pt-1 text-sm text-zinc-600">
          En el siguiente sprint conectamos estas pantallas con Supabase para crear pedidos reales.
        </p>
      </section>
    </div>
  );
}
