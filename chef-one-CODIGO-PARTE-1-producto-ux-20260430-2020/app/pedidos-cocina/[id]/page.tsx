'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canPlaceCentralSupplyOrder } from '@/lib/cocina-central-permissions';
import {
  SUPPLY_ORDER_ESTADO_LABEL,
  formatSupplyUnitLabel,
  type CentralSupplyOrderItemRow,
  type CentralSupplyOrderRow,
  formatEur,
} from '@/lib/cocina-central-supply-supabase';

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

export default function PedidoCocinaDetallePage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const { profileReady, isCentralKitchen, localId } = useAuth();
  const supabase = getSupabaseClient();
  const allowed = canPlaceCentralSupplyOrder(isCentralKitchen, localId);

  const [order, setOrder] = useState<CentralSupplyOrderRow | null>(null);
  const [items, setItems] = useState<CentralSupplyOrderItemRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase || !id || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const { ccFetchSupplyOrderWithItems } = await import('@/lib/cocina-central-supply-supabase');
      const res = await ccFetchSupplyOrderWithItems(supabase, id);
      setOrder(res.order);
      setItems(res.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo cargar el pedido');
      setOrder(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, id, allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!profileReady) {
    return <p className="text-center text-sm text-zinc-500">Cargando perfil…</p>;
  }

  if (!isSupabaseEnabled() || !supabase) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Supabase no está configurado.
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm">
        <Link href="/cocina-central/pedidos-sedes" className="font-bold text-[#D32F2F]">
          Ver en cocina central
        </Link>
      </div>
    );
  }

  if (loading) {
    return <p className="text-center text-sm text-zinc-500">Cargando pedido…</p>;
  }

  if (err || !order) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-700">{err ?? 'Pedido no encontrado.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">Detalle del pedido</p>
          <h1 className="text-xl font-extrabold text-zinc-900">{SUPPLY_ORDER_ESTADO_LABEL[order.estado]}</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Entrega deseada: <strong>{fmtDate(order.fecha_entrega_deseada)}</strong>
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 ring-1 ring-zinc-100">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-zinc-700">Total a pagar (este pedido)</p>
          <p className="text-2xl font-extrabold text-zinc-900">{formatEur(Number(order.total_eur))}</p>
        </div>
        <p className="mt-2 text-xs text-zinc-600">
          Precios según catálogo central en el momento del envío. Cocina: {order.local_central_label ?? '—'}.
        </p>
        {order.notas?.trim() ? (
          <p className="mt-3 border-t border-zinc-200 pt-3 text-sm text-zinc-800">
            <span className="font-bold">Notas: </span>
            {order.notas.trim()}
          </p>
        ) : null}
      </div>

      <div>
        <h2 className="text-sm font-extrabold text-zinc-900">Líneas</h2>
        <ul className="mt-2 divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white ring-1 ring-zinc-100">
          {items.map((it) => (
            <li key={it.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-zinc-900">{it.product_name}</p>
                <p className="text-xs text-zinc-600">
                  {it.cantidad} {formatSupplyUnitLabel(it.unidad)} × {formatEur(Number(it.precio_unitario_eur))}
                </p>
              </div>
              <p className="text-sm font-extrabold text-zinc-900">{formatEur(Number(it.line_total_eur))}</p>
            </li>
          ))}
        </ul>
      </div>

      <Link
        href="/pedidos-cocina"
        className="flex h-12 items-center justify-center rounded-2xl border border-zinc-300 bg-white text-sm font-bold text-zinc-800"
      >
        Hacer otro pedido
      </Link>
    </div>
  );
}
