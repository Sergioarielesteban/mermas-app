'use client';

import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CocinaCentralForceDeleteModal } from '@/components/cocina-central/CocinaCentralForceDeleteModal';
import { useAuth } from '@/components/AuthProvider';
import { appConfirm } from '@/lib/app-dialog-bridge';
import { canUseCocinaCentralForceDelete, ccForceDeleteProductionOrder } from '@/lib/cocina-central-force-delete';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canCocinaCentralOperate } from '@/lib/cocina-central-permissions';
import {
  ccDeleteProductionOrder,
  ccFetchBatchesCentral,
  ccFetchProductionOrders,
  ccProductName,
} from '@/lib/cocina-central-supabase';
import type { ProductionOrderRow } from '@/lib/cocina-central-supabase';
const STATE_ES: Record<string, string> = {
  borrador: 'Pendiente',
  en_curso: 'En curso',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

function orderTitle(o: ProductionOrderRow): string {
  const pr = o.production_recipes;
  const fromInternal = Array.isArray(pr) ? pr[0]?.name : pr?.name;
  if (fromInternal) return fromInternal;
  return ccProductName(
    (Array.isArray(o.central_preparations) ? o.central_preparations[0] : o.central_preparations) ?? o.products,
  );
}

export default function CocinaCentralProduccionHubPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { localId, profileReady, isCentralKitchen, profileRole } = useAuth();
  const canUse = canCocinaCentralOperate(isCentralKitchen, profileRole);
  const supabase = getSupabaseClient();

  const [orders, setOrders] = useState<ProductionOrderRow[]>([]);
  const [lotes, setLotes] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [forceDeleteOrder, setForceDeleteOrder] = useState<ProductionOrderRow | null>(null);
  const canForceDelete = canUseCocinaCentralForceDelete();

  const reload = useCallback(async () => {
    if (!supabase || !localId || !canUse) return;
    setErr(null);
    try {
      const [o, b] = await Promise.all([
        ccFetchProductionOrders(supabase, localId),
        ccFetchBatchesCentral(supabase, localId).catch(() => []),
      ]);
      setOrders(o);
      setLotes(b.length);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al cargar');
    }
  }, [supabase, localId, canUse]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (searchParams.get('eliminado') !== '1') return;
    setToast('Registro eliminado correctamente');
    void reload();
    router.replace('/cocina-central/produccion', { scroll: false });
  }, [searchParams, router, reload]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const canDeleteOrder = (o: ProductionOrderRow) =>
    canForceDelete || o.estado === 'cancelada' || o.estado === 'completada';

  const runLegacyDelete = async (o: ProductionOrderRow) => {
    if (!supabase) return;
    if (o.estado !== 'completada' && o.estado !== 'cancelada') return;
    const ok1 = await appConfirm('¿Eliminar esta producción?');
    if (!ok1) return;
    if (o.estado === 'completada') {
      const ok2 = await appConfirm(
        'Esta orden generó un lote. Se eliminarán la orden, el lote y los movimientos de stock asociados en central. ¿Continuar?',
      );
      if (!ok2) return;
    }
    setDeletingId(o.id);
    setErr(null);
    try {
      await ccDeleteProductionOrder(supabase, o.id);
      setToast('Producción eliminada');
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  const openDelete = (o: ProductionOrderRow) => {
    if (canForceDelete) {
      setForceDeleteOrder(o);
      return;
    }
    void runLegacyDelete(o);
  };

  const confirmForceDelete = async () => {
    if (!supabase || !forceDeleteOrder) return;
    setDeletingId(forceDeleteOrder.id);
    setErr(null);
    try {
      await ccForceDeleteProductionOrder(supabase, forceDeleteOrder.id);
      setToast('Registro eliminado correctamente');
      setForceDeleteOrder(null);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!isSupabaseEnabled() || !supabase) {
    return <p className="text-sm text-amber-800">Supabase no disponible.</p>;
  }
  if (!localId) return <p className="text-sm text-zinc-500">Sin local en el perfil.</p>;
  if (!canUse) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        Solo cocina central puede usar esta pantalla.
      </div>
    );
  }

  return (
    <div className="relative space-y-8">
      <CocinaCentralForceDeleteModal
        open={!!forceDeleteOrder}
        onClose={() => {
          if (!deletingId) setForceDeleteOrder(null);
        }}
        onConfirm={confirmForceDelete}
        entity="orden"
        busy={deletingId === forceDeleteOrder?.id}
      />
      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}
      <div>
        <h1 className="text-xl font-extrabold text-zinc-900">Producción</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Flujo: fórmula de producción interna → orden → ingredientes y lotes (Artículos Máster) → lote final en stock central.
        </p>
      </div>
      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link
          href="/cocina-central/produccion/nueva"
          className="inline-flex h-12 min-w-[200px] items-center justify-center rounded-2xl bg-[#D32F2F] px-4 text-sm font-extrabold text-white"
        >
          Nueva orden de producción
        </Link>
        <Link
          href="/cocina-central/produccion/recetas"
          className="inline-flex h-12 min-w-[200px] items-center justify-center rounded-2xl border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-800"
        >
          Fórmulas de producción
        </Link>
        <a
          href="#ordenes-recientes"
          className="inline-flex h-12 min-w-[200px] items-center justify-center rounded-2xl border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-800"
        >
          Ver órdenes recientes
        </a>
        <Link
          href="/cocina-central/lotes"
          className="inline-flex h-12 min-w-[200px] items-center justify-center rounded-2xl border border-zinc-300 bg-zinc-50 px-4 text-sm font-bold text-zinc-800"
        >
          Ver lotes producidos ({lotes})
        </Link>
        <Link
          href="/cocina-central/produccion/manual"
          className="inline-flex h-12 min-w-[200px] items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-600"
        >
          Registro manual de lote
        </Link>
      </div>

      <section id="ordenes-recientes" className="scroll-mt-4">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-500">Órdenes recientes</h2>
        <ul className="mt-2 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
          {orders.length === 0 ? (
            <li className="px-4 py-6 text-sm text-zinc-500">Sin órdenes. Crea la primera con «Nueva orden de producción».</li>
          ) : (
            orders.slice(0, 24).map((o) => {
              const name = orderTitle(o);
              const canDel = canDeleteOrder(o);
              return (
                <li
                  key={o.id}
                  className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-zinc-900">{name.toUpperCase()}</p>
                    <p className="text-xs text-zinc-600">
                      {o.fecha} · {STATE_ES[o.estado] ?? o.estado} · objetivo {o.cantidad_objetivo}
                      {o.cantidad_producida != null ? ` · producida ${o.cantidad_producida}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                    {o.estado === 'completada' ? (
                      <span className="text-xs font-semibold text-emerald-700 sm:max-w-[200px] sm:text-right">
                        Orden completada (ver lote en Lotes)
                      </span>
                    ) : null}
                    <Link
                      href={`/cocina-central/produccion/${o.id}`}
                      className="text-xs font-bold text-[#D32F2F] underline"
                    >
                      Abrir detalle
                    </Link>
                    {canDel ? (
                      <button
                        type="button"
                        title="Eliminar producción"
                        disabled={deletingId === o.id}
                        onClick={() => void openDelete(o)}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-800 transition hover:bg-red-100 disabled:opacity-50"
                        aria-label="Eliminar producción"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={2.2} />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </section>
    </div>
  );
}
