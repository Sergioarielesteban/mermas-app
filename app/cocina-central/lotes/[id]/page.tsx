'use client';

import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CocinaCentralForceDeleteModal } from '@/components/cocina-central/CocinaCentralForceDeleteModal';
import { useAuth } from '@/components/AuthProvider';
import { ccForceDeleteProductionBatch, isForceDeleteTestDataEnabled } from '@/lib/cocina-central-force-delete';
import { canCocinaCentralOperate } from '@/lib/cocina-central-permissions';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { computeBatchProductionCost, type BatchProductionCostResult } from '@/lib/cocina-central-batch-cost';
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

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

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
  const router = useRouter();
  const { localId, userId, profileReady, isCentralKitchen, profileRole } = useAuth();
  const canUse = canCocinaCentralOperate(isCentralKitchen, profileRole);
  const supabase = getSupabaseClient();
  const forceTest = isForceDeleteTestDataEnabled();
  const [err, setErr] = useState<string | null>(null);
  const [forceDeleteOpen, setForceDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [batch, setBatch] = useState<Awaited<ReturnType<typeof ccFetchBatchById>>>(null);
  const [stock, setStock] = useState<Awaited<ReturnType<typeof ccFetchStockForBatch>>>([]);
  const [ing, setIng] = useState<Awaited<ReturnType<typeof ccFetchIngredientTrace>>>([]);
  const [mov, setMov] = useState<Awaited<ReturnType<typeof ccFetchMovements>>>([]);
  const [fwd, setFwd] = useState<Awaited<ReturnType<typeof ccFetchForwardTrace>>>([]);
  const [incDesc, setIncDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [costData, setCostData] = useState<BatchProductionCostResult | null>(null);
  const [costErr, setCostErr] = useState<string | null>(null);

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

  useEffect(() => {
    if (!supabase || !localId || !batch) {
      setCostData(null);
      setCostErr(null);
      return;
    }
    let cancel = false;
    setCostErr(null);
    void (async () => {
      try {
        const c = await computeBatchProductionCost(supabase, localId, batch, ing);
        if (!cancel) setCostData(c);
      } catch (e) {
        if (!cancel) {
          setCostData(null);
          setCostErr(e instanceof Error ? e.message : 'No se pudo calcular el coste');
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [supabase, localId, batch, ing]);

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

  const confirmForceBatchDelete = async () => {
    if (!supabase || !id) return;
    setDeleteBusy(true);
    setErr(null);
    try {
      await ccForceDeleteProductionBatch(supabase, id);
      setForceDeleteOpen(false);
      router.push('/cocina-central/lotes?eliminado=1');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setDeleteBusy(false);
    }
  };

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!isSupabaseEnabled() || !supabase || !localId) {
    return <p className="text-sm text-zinc-600">Sin sesión.</p>;
  }

  if (!batch) {
    return <div className="text-sm text-zinc-600">{err ? err : 'Lote no encontrado o sin acceso.'}</div>;
  }

  return (
    <div className="space-y-6">
      <CocinaCentralForceDeleteModal
        open={forceDeleteOpen}
        onClose={() => {
          if (!deleteBusy) setForceDeleteOpen(false);
        }}
        onConfirm={confirmForceBatchDelete}
        entity="lote"
        busy={deleteBusy}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-900">
            {ccProductName((Array.isArray(batch.central_preparations) ? batch.central_preparations[0] : batch.central_preparations) ?? batch.products)}
          </h1>
          <p className="mt-1 text-sm font-semibold text-zinc-800">
            {batch.codigo_lote} · <span className="capitalize">{String(batch.estado).replaceAll('_', ' ')}</span>
          </p>
          <p className="text-xs text-zinc-500">
            QR token: <span className="font-mono">{batch.qr_token}</span>
          </p>
        </div>
        {forceTest && canUse && batch.local_central_id === localId ? (
          <button
            type="button"
            title="Eliminar lote"
            disabled={busy || deleteBusy}
            onClick={() => setForceDeleteOpen(true)}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-bold text-red-900 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2.2} />
            Eliminar
          </button>
        ) : null}
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-extrabold text-zinc-900">Stock por sede</h2>
        <ul className="mt-2 text-sm text-zinc-800">
          {stock.map((s) => (
            <li key={s.local_id}>
              {s.local_id === localId ? 'Este local' : `Sede ${s.local_id.slice(0, 8)}…`}: {s.cantidad}{' '}
              {batch.unidad}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-[#D32F2F]/30 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-900">Coste de producción</h2>
        {costErr ? (
          <p className="mt-2 text-sm text-amber-800">{costErr}</p>
        ) : !costData ? (
          <p className="mt-2 text-sm text-zinc-500">Calculando costes…</p>
        ) : (
          <div className="mt-3 space-y-2 text-sm text-zinc-800">
            <p>
              <span className="font-semibold text-zinc-900">Coste total (ingredientes, máster actual):</span>{' '}
              {costData.totalIngredientsEur != null ? (
                eur.format(costData.totalIngredientsEur)
              ) : (
                <span className="text-zinc-500">coste no disponible (sin artículo máster en trazas)</span>
              )}
            </p>
            <p>
              <span className="font-semibold text-zinc-900">Cantidad producida:</span> {costData.cantidadProducida}{' '}
              {costData.unidadLote}
            </p>
            <p>
              <span className="font-semibold text-zinc-900">Coste por {costData.costPerOutputLabel}:</span>{' '}
              {costData.costPerOutputUnit != null ? (
                <>
                  {eur.format(costData.costPerOutputUnit)} /{costData.costPerOutputLabel}
                </>
              ) : (
                <span className="text-zinc-500">—</span>
              )}
            </p>
            {costData.sumOrderEstimated != null || costData.sumOrderReal != null ? (
              <div className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-700">
                <p className="font-bold text-zinc-900">Registrado en la orden (si aplica)</p>
                {costData.sumOrderEstimated != null ? (
                  <p>
                    Suma teórica en orden: {eur.format(costData.sumOrderEstimated)}
                  </p>
                ) : null}
                {costData.sumOrderReal != null ? (
                  <p>
                    Suma real en orden: {eur.format(costData.sumOrderReal)}
                  </p>
                ) : null}
                {costData.diffOrderTheoreticalVsReal != null ? (
                  <p>
                    Diferencia (real − teórico) en líneas: {eur.format(costData.diffOrderTheoreticalVsReal)}
                  </p>
                ) : null}
                {costData.diffRealVsCalculated != null ? (
                  <p>
                    Diferencia (real de orden vs coste máster trazas): {eur.format(costData.diffRealVsCalculated)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-extrabold text-zinc-900">Cambiar estado</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {ESTADOS.map((e) => {
            const isOn = batch.estado === e;
            return (
              <button
                key={e}
                type="button"
                disabled={busy || isOn}
                onClick={() => void setEstado(e)}
                className={`cc-ui-btn rounded-xl px-3 py-2 text-xs font-bold capitalize ${isOn ? 'cc-ui-btn--on' : ''}`}
                aria-pressed={isOn}
              >
                {e.replaceAll('_', ' ')}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-extrabold text-zinc-900">Trazabilidad atrás (ingredientes)</h2>
        <ul className="mt-2 space-y-2 text-sm text-zinc-800">
          {ing.length === 0 ? (
            <li className="text-zinc-500">Sin ingredientes registrados.</li>
          ) : (
            costData
              ? costData.lines.map((row) => {
                  const c =
                    row.lineCostEur != null
                      ? eur.format(row.lineCostEur)
                      : 'coste no disponible';
                  return (
                    <li key={row.id} className="leading-snug">
                      <span className="text-zinc-500">·</span>{' '}
                      <span className="font-semibold text-zinc-900">{row.label}</span> — {row.cantidad} {row.unidad} — {c}
                    </li>
                  );
                })
              : ing.map((r) => (
                  <li key={r.id} className="leading-snug text-zinc-800">
                    {ccProductName(
                      (Array.isArray(r.central_preparations) ? r.central_preparations[0] : r.central_preparations) ?? r.products,
                    )}{' '}
                    — {r.cantidad} {r.unidad}
                  </li>
                ))
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-extrabold text-zinc-900">Hacia delante (entregas)</h2>
        <ul className="mt-2 space-y-1 text-sm text-zinc-800">
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
        <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs text-zinc-800">
          {mov.map((m) => (
            <li key={m.id}>
              {m.movimiento_en.slice(0, 16)} · {m.tipo} · {m.cantidad} (from {m.local_from?.slice(0, 6) ?? '—'} → to{' '}
              {m.local_to?.slice(0, 6) ?? '—'})
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4">
        <h2 className="text-sm font-extrabold text-amber-950">Incidencia</h2>
        <textarea
          className="mt-2 w-full rounded-xl border border-amber-200 bg-white p-3 text-sm text-zinc-900"
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
            className="cc-preserve-dark h-11 rounded-xl bg-zinc-900 px-4 text-xs font-bold text-white"
          >
            Registrar + bloquear lote
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void setEstado('bloqueado')}
            className="cc-ui-btn h-11 rounded-xl px-4 text-xs font-bold"
          >
            Solo bloquear
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void setEstado('retirado')}
            className="h-11 rounded-xl border border-red-300 bg-red-50 px-4 text-xs font-bold text-red-950"
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
