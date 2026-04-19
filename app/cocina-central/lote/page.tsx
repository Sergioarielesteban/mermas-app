'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  ccFetchBatchByQrToken,
  ccFetchIngredientTrace,
  ccFetchForwardTrace,
  ccFetchStockForBatch,
  ccProductName,
} from '@/lib/cocina-central-supabase';

function LoteTokenBody() {
  const params = useSearchParams();
  const token = params.get('token')?.trim() ?? '';
  const { localId, profileReady } = useAuth();
  const supabase = getSupabaseClient();
  const [err, setErr] = useState<string | null>(null);
  const [batch, setBatch] = useState<Awaited<ReturnType<typeof ccFetchBatchByQrToken>>>(null);
  const [ing, setIng] = useState<Awaited<ReturnType<typeof ccFetchIngredientTrace>>>([]);
  const [fwd, setFwd] = useState<Awaited<ReturnType<typeof ccFetchForwardTrace>>>([]);
  const [stock, setStock] = useState<Awaited<ReturnType<typeof ccFetchStockForBatch>>>([]);

  useEffect(() => {
    if (!supabase || !token) return;
    let cancelled = false;
    void (async () => {
      setErr(null);
      try {
        const b = await ccFetchBatchByQrToken(supabase, token);
        if (cancelled) return;
        setBatch(b);
        if (!b) {
          setErr('Lote no encontrado');
          return;
        }
        const [i, f, s] = await Promise.all([
          ccFetchIngredientTrace(supabase, b.id),
          ccFetchForwardTrace(supabase, b.id),
          ccFetchStockForBatch(supabase, b.id),
        ]);
        if (cancelled) return;
        setIng(i);
        setFwd(f);
        setStock(s);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, token]);

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!isSupabaseEnabled() || !supabase || !localId) {
    return <p className="text-sm text-zinc-600">Inicia sesión para ver la ficha.</p>;
  }

  if (!token) {
    return <p className="text-sm text-zinc-600">Falta el parámetro ?token= en la URL.</p>;
  }

  if (!batch) {
    return <p className="text-sm text-zinc-600">{err ?? 'Buscando…'}</p>;
  }

  const here = stock.find((s) => s.local_id === localId);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-extrabold text-zinc-900">
        {ccProductName((Array.isArray(batch.central_preparations) ? batch.central_preparations[0] : batch.central_preparations) ?? batch.products)}
      </h1>
      <p className="text-sm font-semibold text-zinc-600">
        {batch.codigo_lote} · {batch.estado}
      </p>
      <p className="text-xs text-zinc-500">
        Elab. {batch.fecha_elaboracion}
        {batch.fecha_caducidad ? ` · Cad. ${batch.fecha_caducidad}` : ''}
      </p>
      {here != null ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">
          Stock en tu sede: {here.cantidad} {batch.unidad}
        </p>
      ) : (
        <p className="text-xs text-zinc-500">Sin stock registrado en tu sede para este lote.</p>
      )}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-extrabold">Ingredientes</h2>
        <ul className="mt-2 text-sm text-zinc-700">
          {ing.length === 0 ? (
            <li className="text-zinc-500">—</li>
          ) : (
            ing.map((r) => (
              <li key={r.id}>
                {ccProductName((Array.isArray(r.central_preparations) ? r.central_preparations[0] : r.central_preparations) ?? r.products)} · {r.cantidad} {r.unidad}
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-extrabold">Envíos</h2>
        <ul className="mt-2 text-sm text-zinc-700">
          {fwd.length === 0 ? (
            <li className="text-zinc-500">—</li>
          ) : (
            fwd.map((r, i) => {
              const d = Array.isArray(r.deliveries) ? r.deliveries[0] : r.deliveries;
              return (
                <li key={i}>
                  {r.cantidad} {r.unidad} → {d?.local_destino_label ?? '—'}
                </li>
              );
            })
          )}
        </ul>
      </section>

      <Link
        href={`/cocina-central/lotes/${batch.id}`}
        className="block h-12 rounded-2xl bg-[#D32F2F] py-3 text-center text-sm font-extrabold text-white"
      >
        Abrir ficha completa
      </Link>
    </div>
  );
}

export default function CocinaCentralLoteQrPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Cargando…</p>}>
      <LoteTokenBody />
    </Suspense>
  );
}
