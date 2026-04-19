'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canManageDeliveries } from '@/lib/cocina-central-permissions';
import type { CcUnit } from '@/lib/cocina-central-supabase';
import {
  ccListDestinations,
  ccFetchBatchesWithStockHere,
  ccInsertDelivery,
  ccInsertDeliveryItem,
  ccProductName,
  type DestinationLocal,
  type ProductionBatchRow,
  type BatchStockRow,
} from '@/lib/cocina-central-supabase';

function todayMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

type Line = { batchId: string; qty: string };

export default function CocinaCentralEntregaNuevaPage() {
  const router = useRouter();
  const { localId, localName, userId, profileReady, isCentralKitchen, profileRole } = useAuth();
  const supabase = getSupabaseClient();
  const can = canManageDeliveries(isCentralKitchen, profileRole);

  const [destinos, setDestinos] = useState<DestinationLocal[]>([]);
  const [batches, setBatches] = useState<Array<ProductionBatchRow & { batch_stock?: BatchStockRow[] }>>([]);
  const [destId, setDestId] = useState('');
  const [fecha, setFecha] = useState(todayMadrid);
  const [lines, setLines] = useState<Line[]>([{ batchId: '', qty: '1' }]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !localId || !can) return;
    setErr(null);
    try {
      const [d, b] = await Promise.all([
        ccListDestinations(supabase),
        ccFetchBatchesWithStockHere(supabase, localId),
      ]);
      setDestinos(d);
      setBatches(b);
      setDestId((cur) => cur || d[0]?.id || '');
      setLines((prev) => {
        if (prev[0]?.batchId || !b[0]) return prev;
        return [{ batchId: b[0].id, qty: '1' }];
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    }
  }, [supabase, localId, can]);

  useEffect(() => {
    void load();
  }, [load]);

  const stockOf = (batchId: string, lid: string) => {
    const row = batches.find((x) => x.id === batchId);
    const stocksRaw = row?.batch_stock;
    const stocks = Array.isArray(stocksRaw) ? stocksRaw : stocksRaw ? [stocksRaw] : [];
    const hit = stocks.find((s) => s.local_id === lid);
    return hit ? Number(hit.cantidad) : 0;
  };

  const submit = async () => {
    if (!supabase || !localId) return;
    setBusy(true);
    setErr(null);
    try {
      const dest = destinos.find((x) => x.id === destId);
      if (!dest) throw new Error('Elige destino');
      const origenLabel = localName?.trim() || null;
      const destinoLabel = `${dest.name} (${dest.code})`;

      const agg = new Map<string, number>();
      for (const ln of lines) {
        if (!ln.batchId) continue;
        const q = Number(ln.qty.replace(',', '.'));
        if (!Number.isFinite(q) || q <= 0) continue;
        agg.set(ln.batchId, (agg.get(ln.batchId) ?? 0) + q);
      }
      if (agg.size === 0) throw new Error('Añade al menos una línea válida');

      for (const [bid, need] of agg) {
        const avail = stockOf(bid, localId);
        if (need > avail) throw new Error('Cantidad superior al stock disponible en central');
      }

      const deliveryId = await ccInsertDelivery(supabase, {
        local_origen_id: localId,
        local_destino_id: dest.id,
        fecha,
        local_origen_label: origenLabel,
        local_destino_label: destinoLabel,
        created_by: userId,
      });

      for (const [batchId, cantidad] of agg) {
        const batch = batches.find((b) => b.id === batchId);
        if (!batch) throw new Error('Lote inválido');
        await ccInsertDeliveryItem(supabase, {
          delivery_id: deliveryId,
          batch_id: batchId,
          product_id: batch.product_id,
          preparation_id: batch.preparation_id,
          cantidad,
          unidad: batch.unidad as CcUnit,
        });
      }

      router.push(`/cocina-central/entregas/${deliveryId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!isSupabaseEnabled() || !supabase || !localId) {
    return <p className="text-sm text-zinc-600">Sin sesión.</p>;
  }
  if (!can) {
    return (
      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        <p>Solo <strong>admin</strong> o <strong>manager</strong> pueden crear entregas salientes.</p>
        <Link href="/cocina-central" className="inline-block text-sm font-bold text-[#D32F2F]">
          ← Hub
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/cocina-central/entregas" className="text-sm font-bold text-[#D32F2F]">
        ← Entregas
      </Link>
      <h1 className="text-xl font-extrabold text-zinc-900">Nueva entrega</h1>
      <p className="text-sm text-zinc-600">
        No se descuenta stock hasta confirmar la salida en el detalle. Aquí solo queda en borrador.
      </p>
      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}

      <label className="block text-xs font-bold uppercase text-zinc-500">
        Destino
        <select
          className="mt-1 h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 text-base font-semibold"
          value={destId}
          onChange={(e) => setDestId(e.target.value)}
        >
          {destinos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.code})
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-bold uppercase text-zinc-500">
        Fecha
        <input
          type="date"
          className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-base font-semibold"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
      </label>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-extrabold text-zinc-900">Líneas</span>
          <button
            type="button"
            onClick={() => setLines((l) => [...l, { batchId: batches[0]?.id ?? '', qty: '1' }])}
            className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs font-bold"
          >
            + Línea
          </button>
        </div>
        {lines.map((ln, i) => (
          <div key={i} className="grid gap-2 rounded-2xl border border-zinc-200 bg-white p-3 sm:grid-cols-2">
            <select
              className="h-11 rounded-lg border border-zinc-300 text-sm font-semibold"
              value={ln.batchId}
              onChange={(e) => {
                const v = e.target.value;
                setLines((r) => r.map((x, j) => (j === i ? { ...x, batchId: v } : x)));
              }}
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.codigo_lote} · {ccProductName((Array.isArray(b.central_preparations) ? b.central_preparations[0] : b.central_preparations) ?? b.products)} (disp. {stockOf(b.id, localId)} {b.unidad})
                </option>
              ))}
            </select>
            <input
              type="text"
              inputMode="decimal"
              className="h-11 rounded-lg border border-zinc-300 px-2 text-sm"
              value={ln.qty}
              onChange={(e) => {
                const v = e.target.value;
                setLines((r) => r.map((x, j) => (j === i ? { ...x, qty: v } : x)));
              }}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="h-14 w-full rounded-2xl bg-[#D32F2F] text-base font-extrabold text-white disabled:opacity-50"
      >
        Crear borrador
      </button>
    </div>
  );
}
