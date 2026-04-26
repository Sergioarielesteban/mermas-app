'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canCocinaCentralOperate } from '@/lib/cocina-central-permissions';
import { ccFetchBatchesCentral, ccFetchProductionOrders, ccProductName } from '@/lib/cocina-central-supabase';
import type { ProductionOrderRow } from '@/lib/cocina-central-supabase';
import { fetchEscandalloRecipes } from '@/lib/escandallos-supabase';

const STATE_ES: Record<string, string> = {
  borrador: 'Pendiente',
  en_curso: 'En curso',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

function recipeNameForOrder(
  o: ProductionOrderRow,
  recipeNames: Map<string, string>,
): string {
  const eid = o.escandallo_recipe_id;
  if (eid && recipeNames.has(eid)) return recipeNames.get(eid)!;
  return ccProductName(
    (Array.isArray(o.central_preparations) ? o.central_preparations[0] : o.central_preparations) ?? o.products,
  );
}

export default function CocinaCentralProduccionHubPage() {
  const { localId, profileReady, isCentralKitchen, profileRole } = useAuth();
  const canUse = canCocinaCentralOperate(isCentralKitchen, profileRole);
  const supabase = getSupabaseClient();

  const [orders, setOrders] = useState<ProductionOrderRow[]>([]);
  const [recipeNames, setRecipeNames] = useState<Map<string, string>>(() => new Map());
  const [lotes, setLotes] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!supabase || !localId || !canUse) return;
    setErr(null);
    try {
      const [o, rList, b] = await Promise.all([
        ccFetchProductionOrders(supabase, localId),
        fetchEscandalloRecipes(supabase, localId).catch(() => []),
        ccFetchBatchesCentral(supabase, localId).catch(() => []),
      ]);
      setOrders(o);
      setLotes(b.length);
      setRecipeNames(new Map((rList ?? []).map((r) => [r.id, r.name])));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al cargar');
    }
  }, [supabase, localId, canUse]);

  useEffect(() => {
    void reload();
  }, [reload]);

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
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-extrabold text-zinc-900">Producción</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Flujo: receta/escandallo (referencia) → orden → ingredientes y lotes → lote final en stock central. Las elaboraciones
          viven en cocina central; el escandallo no se modifica aquí.
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
              const name = recipeNameForOrder(o, recipeNames);
              return (
                <li key={o.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-bold text-zinc-900">{name.toUpperCase()}</p>
                    <p className="text-xs text-zinc-600">
                      {o.fecha} · {STATE_ES[o.estado] ?? o.estado} · objetivo {o.cantidad_objetivo}
                      {o.cantidad_producida != null ? ` · producida ${o.cantidad_producida}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {o.estado === 'completada' ? (
                      <span className="text-xs font-semibold text-emerald-700">Orden completada (ver lote en Lotes)</span>
                    ) : null}
                    <Link
                      href={`/cocina-central/produccion/${o.id}`}
                      className="text-xs font-bold text-[#D32F2F] underline"
                    >
                      Abrir detalle
                    </Link>
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
