'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import type { BatchEstado } from '@/lib/cocina-central-supabase';
import {
  ccFetchBatchById,
  ccFetchIngredientTrace,
  ccFetchMovements,
  ccFetchForwardTrace,
  ccFetchStockForBatch,
  ccProductName,
  ccSetBatchEstado,
  ccInsertIncident,
} from '@/lib/cocina-central-supabase';

const ESTADOS: BatchEstado[] = [
  'disponible',
  'abierto',
  'consumido',
  'congelado',
  'descongelado',
  'expedido',
  'bloqueado',
  'retirado',
];

export default function CocinaCentralLoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { localId, userId, profileReady } = useAuth();
  const supabase = getSupabaseClient();
  const [err, setErr] = useState<string | null>(null);
  const [batch, setBatch] = useState<Awaited<ReturnType<typeof ccFetchBatchById>>>(null);
  const [stock, setStock] = useState<Awaited<ReturnType<typeof ccFetchStockForBatch>>>([]);
  const [ing, setIng] = useState<Awaited<ReturnType<typeof ccFetchIngredientTrace>>>([]);
  const [mov, setMov] = useState<Awaited<ReturnType<typeof ccFetchMovements>>>([]);
  const [fwd, setFwd] = useState<Awaited<ReturnType<typeof ccFetchForwardTrace>>>([]);
  const [incDesc, setIncDesc] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !id) return;
    setErr(null);
    try {
      const [b, s, i, m, f] = await Promise.all([
        ccFetchBatchById(supabase, id),
        ccFetchStockForBatch(supabase, id),
        ccFetchIngredientTrace(supabase, id),
        ccFetchMovements(supabase, id),
        ccFetchForwardTrace(supabase, id),
      ]);
      setBatch(b);
      setStock(s);
      setIng(i);
      setMov(m);
      setFwd(f);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    }
  }, [supabase, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const setEstado = async (estado: BatchEstado) => {
    if (!supabase || !id) return;
    setBusy(true);
    setErr(null);
    try {
      await ccSetBatchEstado(supabase, id, estado);
      await load();
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

  if (!batch) {
    return (
      <div className="text-sm text-zinc-600">
        {err ? err : 'Lote no encontrado o sin acceso.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/cocina-central/lotes" className="text-sm font-bold text-[#D32F2F]">
          ← Lotes
        </Link>
        <h1 className="mt-2 text-xl font-extrabold text-zinc-900">
          {ccProductName((Array.isArray(batch.central_preparations) ? batch.central_preparations[0] : batch.central_preparations) ?? batch.products)}
        </h1>
        <p className="mt-1 text-sm font-semibold text-zinc-600">
          {batch.codigo_lote} · {batch.estado}
        </p>
        <p className="text-xs text-zinc-500">
          QR token: <span className="font-mono">{batch.qr_token}</span>
        </p>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-extrabold text-zinc-900">Stock por sede</h2>
        <ul className="mt-2 text-sm text-zinc-700">
          {stock.map((s) => (
            <li key={s.local_id}>
              {s.local_id === localId ? 'Este local' : `Sede ${s.local_id.slice(0, 8)}…`}: {s.cantidad}{' '}
              {batch.unidad}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-extrabold text-zinc-900">Cambiar estado</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {ESTADOS.map((e) => (
            <button
              key={e}
              type="button"
              disabled={busy || batch.estado === e}
              onClick={() => void setEstado(e)}
              className="rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-bold capitalize disabled:opacity-40"
            >
              {e.replace('_', ' ')}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-extrabold text-zinc-900">Trazabilidad atrás (ingredientes)</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {ing.length === 0 ? (
            <li className="text-zinc-500">Sin ingredientes registrados.</li>
          ) : (
            ing.map((r) => (
              <li key={r.id}>
                {ccProductName((Array.isArray(r.central_preparations) ? r.central_preparations[0] : r.central_preparations) ?? r.products)} — {r.cantidad} {r.unidad}
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-extrabold text-zinc-900">Hacia delante (entregas)</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {fwd.length === 0 ? (
            <li className="text-zinc-500">Sin envíos registrados con este lote.</li>
          ) : (
            fwd.map((r, idx) => {
              const d = Array.isArray(r.deliveries) ? r.deliveries[0] : r.deliveries;
              return (
                <li key={idx}>
                  {r.cantidad} {r.unidad} → {d?.local_destino_label ?? d?.id ?? '—'} ({d?.estado})
                </li>
              );
            })
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-extrabold text-zinc-900">Movimientos</h2>
        <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs text-zinc-700">
          {mov.map((m) => (
            <li key={m.id}>
              {m.movimiento_en.slice(0, 16)} · {m.tipo} · {m.cantidad} (from {m.local_from?.slice(0, 6) ?? '—'}{' '}
              → to {m.local_to?.slice(0, 6) ?? '—'})
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4">
        <h2 className="text-sm font-extrabold text-amber-950">Incidencia</h2>
        <textarea
          className="mt-2 w-full rounded-xl border border-amber-200 bg-white p-3 text-sm"
          rows={3}
          placeholder="Descripción breve"
          value={incDesc}
          onChange={(e) => setIncDesc(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void (async () => {
                if (!supabase || !id) return;
                setBusy(true);
                setErr(null);
                try {
                  await ccInsertIncident(supabase, {
                    batch_id: id,
                    tipo: 'bloqueo_calidad',
                    descripcion: incDesc.trim() || null,
                    created_by: userId,
                  });
                  await ccSetBatchEstado(supabase, id, 'bloqueado');
                  setIncDesc('');
                  await load();
                } catch (e) {
                  setErr(e instanceof Error ? e.message : 'Error');
                } finally {
                  setBusy(false);
                }
              })()
            }
            className="h-11 rounded-xl bg-zinc-900 px-4 text-xs font-bold text-white"
          >
            Registrar + bloquear lote
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void setEstado('bloqueado')}
            className="h-11 rounded-xl border border-zinc-400 px-4 text-xs font-bold"
          >
            Solo bloquear
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void setEstado('retirado')}
            className="h-11 rounded-xl border border-red-300 bg-red-50 px-4 text-xs font-bold text-red-900"
          >
            Marcar retirado
          </button>
        </div>
      </section>

      <Link
        href={`/cocina-central/etiquetas/${batch.id}`}
        className="block h-12 rounded-2xl bg-[#D32F2F] py-3 text-center text-sm font-extrabold text-white"
      >
        Ver etiqueta / QR
      </Link>
    </div>
  );
}
