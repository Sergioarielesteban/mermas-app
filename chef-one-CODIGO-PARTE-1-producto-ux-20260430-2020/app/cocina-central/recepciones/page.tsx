'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { ccFetchDeliveriesDestination } from '@/lib/cocina-central-supabase';
import type { DeliveryRow } from '@/lib/cocina-central-supabase';

export default function CocinaCentralRecepcionesPage() {
  const { localId, profileReady, isCentralKitchen } = useAuth();
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !localId) return;
    setErr(null);
    try {
      const r = await ccFetchDeliveriesDestination(supabase, localId);
      setRows(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    }
  }, [supabase, localId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!isSupabaseEnabled() || !supabase || !localId) {
    return <p className="text-sm text-zinc-600">Sin sesión.</p>;
  }

  const pendingSign = rows.filter((d) => d.estado === 'entregado');
  const historial = rows.filter((d) => d.estado === 'firmado' || d.estado === 'entregado');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-zinc-900">Recepciones</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Entregas entrantes a tu sede{isCentralKitchen ? ' (también como central)' : ''}.
        </p>
      </div>
      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}

      <h2 className="text-sm font-extrabold uppercase tracking-wide text-amber-800">Pendiente de firma</h2>
      <ul className="space-y-2">
        {pendingSign.map((d) => (
          <li key={d.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <Link href={`/cocina-central/entregas/${d.id}`} className="block font-bold text-amber-950">
              Desde {d.local_origen_label ?? 'central'}
            </Link>
            <p className="text-xs text-amber-900">
              {d.fecha} · {d.estado}
            </p>
          </li>
        ))}
      </ul>
      {pendingSign.length === 0 ? <p className="text-sm text-zinc-500">Nada pendiente.</p> : null}

      <h2 className="pt-4 text-sm font-extrabold uppercase tracking-wide text-zinc-500">Historial reciente</h2>
      <ul className="space-y-2">
        {historial.slice(0, 20).map((d) => (
          <li key={d.id} className="rounded-2xl border border-zinc-200 bg-white p-3">
            <Link href={`/cocina-central/entregas/${d.id}`} className="text-sm font-bold text-zinc-900">
              {d.fecha} · {d.local_origen_label ?? 'Origen'}
            </Link>
            <p className="text-xs text-zinc-500">{d.estado}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
