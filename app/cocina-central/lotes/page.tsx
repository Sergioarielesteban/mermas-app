'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  ccFetchBatchesCentral,
  ccFetchBatchesWithStockHere,
  ccProductName,
  type BatchStockRow,
} from '@/lib/cocina-central-supabase';

function stockLine(stocks: BatchStockRow[] | undefined, localId: string | null) {
  if (!stocks?.length) return '—';
  const here = stocks.find((s) => s.local_id === localId);
  const parts = stocks.filter((s) => Number(s.cantidad) > 0).map((s) => `${s.local_id.slice(0, 6)}…:${s.cantidad}`);
  const hint = here != null ? ` · Aquí: ${here.cantidad}` : '';
  return parts.join(' · ') + hint;
}

export default function CocinaCentralLotesPage() {
  const { localId, profileReady, isCentralKitchen } = useAuth();
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof ccFetchBatchesCentral>>>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !localId) return;
    setErr(null);
    try {
      const data = isCentralKitchen
        ? await ccFetchBatchesCentral(supabase, localId)
        : await ccFetchBatchesWithStockHere(supabase, localId);
      setRows(
        data.filter((b) => {
          const stocks = b.batch_stock;
          const arr = Array.isArray(stocks) ? stocks : stocks ? [stocks] : [];
          if (isCentralKitchen) return true;
          return arr.some((s) => s.local_id === localId && Number(s.cantidad) > 0);
        }),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    }
  }, [supabase, localId, isCentralKitchen]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!isSupabaseEnabled() || !supabase || !localId) {
    return <p className="text-sm text-zinc-600">Sin conexión o local.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-900">Lotes</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {isCentralKitchen
              ? 'Producidos en tu cocina central (stock por sede).'
              : 'Lotes con stock en tu sede.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-800"
        >
          Actualizar
        </button>
      </div>
      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}
      <ul className="space-y-2">
        {rows.map((b) => {
          const stocksRaw = b.batch_stock;
          const stocks = Array.isArray(stocksRaw) ? stocksRaw : stocksRaw ? [stocksRaw] : [];
          return (
            <li key={b.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-extrabold text-zinc-900">{ccProductName(b.products)}</p>
                  <p className="text-xs font-semibold text-zinc-500">
                    {b.codigo_lote} · {b.estado}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Elab. {b.fecha_elaboracion}
                    {b.fecha_caducidad ? ` · Cad. ${b.fecha_caducidad}` : ''}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">Stock: {stockLine(stocks, localId)}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Link
                    href={`/cocina-central/lotes/${b.id}`}
                    className="rounded-xl bg-zinc-900 px-3 py-2 text-center text-xs font-bold text-white"
                  >
                    Ficha
                  </Link>
                  {isCentralKitchen ? (
                    <Link
                      href={`/cocina-central/etiquetas/${b.id}`}
                      className="rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-center text-xs font-bold text-zinc-800"
                    >
                      Etiqueta
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 ? <p className="text-sm text-zinc-500">No hay lotes que mostrar.</p> : null}
    </div>
  );
}
