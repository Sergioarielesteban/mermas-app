'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canManageDeliveries } from '@/lib/cocina-central-permissions';
import { ccFetchDeliveriesOrigin } from '@/lib/cocina-central-supabase';
import type { DeliveryRow } from '@/lib/cocina-central-supabase';

export default function CocinaCentralEntregasPage() {
  const { localId, profileReady, isCentralKitchen, profileRole } = useAuth();
  const supabase = getSupabaseClient();
  const can = canManageDeliveries(isCentralKitchen, profileRole);
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !localId || !can) return;
    setErr(null);
    try {
      const r = await ccFetchDeliveriesOrigin(supabase, localId);
      setRows(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    }
  }, [supabase, localId, can]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!isSupabaseEnabled() || !supabase || !localId) {
    return <p className="text-sm text-zinc-600">Sin sesión.</p>;
  }
  if (!can) {
    return (
      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        <p>
          Las <strong>entregas a otras sedes</strong> solo las gestionan perfiles{' '}
          <strong>administrador</strong> o <strong>encargado</strong> (<code>manager</code>) en Supabase.
        </p>
        <p className="text-xs text-zinc-600">
          Si eres <strong>operario</strong> (<code>staff</code>), usa Producción y Lotes en el hub. Para cambiar tu
          rol: tabla <code>profiles</code> en Supabase → columna <code>role</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-900">Entregas</h1>
          <p className="mt-1 text-sm text-zinc-600">Desde tu cocina central hacia otras sedes.</p>
        </div>
        <Link
          href="/cocina-central/entregas/nueva"
          className="rounded-xl bg-[#D32F2F] px-4 py-2.5 text-sm font-extrabold text-white"
        >
          Nueva
        </Link>
      </div>
      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}
      <ul className="space-y-2">
        {rows.map((d) => (
          <li key={d.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
            <Link href={`/cocina-central/entregas/${d.id}`} className="block">
              <p className="font-extrabold text-zinc-900">
                {d.local_destino_label ?? d.local_destino_id.slice(0, 8) + '…'}
              </p>
              <p className="text-xs font-semibold text-zinc-500">
                {d.fecha} · {d.estado}
                {d.firmado ? ' · Firmado' : ''}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <p className="text-sm text-zinc-500">Sin entregas todavía.</p> : null}
    </div>
  );
}
