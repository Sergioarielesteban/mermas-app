'use client';

import Link from 'next/link';
import {
  ccFetchForwardTrace,
  ccFetchIngredientTrace,
  ccFetchStockForBatch,
  ccProductName,
  type ProductionBatchRow,
} from '@/lib/cocina-central-supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

type Props = {
  supabase: SupabaseClient;
  batch: ProductionBatchRow;
  localId: string | null;
};

export default function LoteQrFichaContent({ supabase, batch, localId }: Props) {
  const [ing, setIng] = useState<Awaited<ReturnType<typeof ccFetchIngredientTrace>>>([]);
  const [fwd, setFwd] = useState<Awaited<ReturnType<typeof ccFetchForwardTrace>>>([]);
  const [stock, setStock] = useState<Awaited<ReturnType<typeof ccFetchStockForBatch>>>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setErr(null);
      try {
        const [i, f, s] = await Promise.all([
          ccFetchIngredientTrace(supabase, batch.id),
          ccFetchForwardTrace(supabase, batch.id),
          ccFetchStockForBatch(supabase, batch.id),
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
  }, [supabase, batch.id]);

  const here = localId != null ? stock.find((s) => s.local_id === localId) : undefined;

  return (
    <div className="space-y-5">
      {err ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</div>
      ) : null}
      <h1 className="text-xl font-extrabold text-zinc-900">
        {ccProductName(
          (Array.isArray(batch.central_preparations) ? batch.central_preparations[0] : batch.central_preparations) ??
            batch.products,
        )}
      </h1>
      <p className="text-sm font-semibold text-zinc-600">
        {batch.codigo_lote} · {batch.estado}
      </p>
      <p className="text-xs text-zinc-500">
        Elab. {batch.fecha_elaboracion}
        {batch.fecha_caducidad ? ` · Cad. ${batch.fecha_caducidad}` : ''}
      </p>
      {localId == null ? (
        <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          Inicia sesión y asocia un local al perfil para ver el stock en tu sede.
        </p>
      ) : here != null ? (
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
                {ccProductName(
                  (Array.isArray(r.central_preparations) ? r.central_preparations[0] : r.central_preparations) ??
                    r.products,
                )}{' '}
                · {r.cantidad} {r.unidad}
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
