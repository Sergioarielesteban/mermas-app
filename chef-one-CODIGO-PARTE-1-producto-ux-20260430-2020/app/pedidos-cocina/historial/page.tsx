'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canPlaceCentralSupplyOrder } from '@/lib/cocina-central-permissions';
import {
  SUPPLY_ORDER_ESTADO_LABEL,
  type CentralSupplyOrderRow,
  formatEur,
} from '@/lib/cocina-central-supply-supabase';

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

export default function PedidosCocinaHistorialPage() {
  const { profileReady, isCentralKitchen, localId } = useAuth();
  const supabase = getSupabaseClient();
  const allowed = canPlaceCentralSupplyOrder(isCentralKitchen, localId);

  const [rows, setRows] = useState<CentralSupplyOrderRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const { ccListMySupplyOrders } = await import('@/lib/cocina-central-supply-supabase');
      setRows(await ccListMySupplyOrders(supabase));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al cargar');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, allowed]);

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
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-800">
        Solo disponible para sedes satélite.
        <Link href="/cocina-central/pedidos-sedes" className="mt-2 block font-bold text-[#D32F2F]">
          Ver pedidos de sedes (central)
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-900">Mis pedidos</h1>
          <p className="mt-1 text-sm text-zinc-600">Historial y totales enviados a cocina central.</p>
        </div>
        <Link
          href="/pedidos-cocina"
          className="rounded-xl bg-[#D32F2F] px-4 py-2 text-xs font-extrabold text-white"
        >
          Nuevo pedido
        </Link>
      </div>

      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{err}</div>
      ) : null}

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
          Aún no hay pedidos.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((o) => (
            <li key={o.id}>
              <Link
                href={`/pedidos-cocina/${o.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100 transition hover:bg-zinc-50"
              >
                <div className="min-w-0">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-[#D32F2F]">
                    {SUPPLY_ORDER_ESTADO_LABEL[o.estado]}
                  </p>
                  <p className="mt-1 truncate font-bold text-zinc-900">
                    Entrega {fmtDate(o.fecha_entrega_deseada)} · {formatEur(Number(o.total_eur))}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Pedido {fmtDate(o.created_at)} · {o.local_central_label ?? 'Central'}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
