'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canCocinaCentralOperate } from '@/lib/cocina-central-permissions';
import { prListAllRecipes, type ProductionRecipeRow } from '@/lib/production-recipes-supabase';

export default function FormulasProduccionListPage() {
  const { localId, profileReady, isCentralKitchen, profileRole } = useAuth();
  const canUse = canCocinaCentralOperate(isCentralKitchen, profileRole);
  const supabase = getSupabaseClient();

  const [rows, setRows] = useState<ProductionRecipeRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !localId || !canUse) return;
    setErr(null);
    try {
      const r = await prListAllRecipes(supabase, localId);
      setRows(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al cargar');
    }
  }, [supabase, localId, canUse]);

  useEffect(() => {
    void load();
  }, [load]);

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
    <div className="space-y-6">
      <div>
        <Link href="/cocina-central/produccion" className="text-sm font-semibold text-[#D32F2F]">
          ← Producción
        </Link>
        <h1 className="mt-2 text-xl font-extrabold text-zinc-900">Fórmulas de producción</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Recetas internas solo para Cocina Central. No aparecen en escandallos ni en carta. Los ingredientes se eligen en Artículos
          Máster.
        </p>
      </div>
      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link
          href="/cocina-central/produccion/recetas/nueva"
          className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#D32F2F] px-4 text-sm font-extrabold text-white"
        >
          Nueva fórmula
        </Link>
        <Link
          href="/cocina-central/produccion/nueva"
          className="inline-flex h-12 items-center justify-center rounded-2xl border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-800"
        >
          Nueva orden
        </Link>
      </div>

      <ul className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
        {rows.length === 0 ? (
          <li className="px-4 py-6 text-sm text-zinc-500">Aún no hay fórmulas. Crea la primera con «Nueva fórmula».</li>
        ) : (
          rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-zinc-900">{r.name}</p>
                <p className="text-xs text-zinc-600">
                  {r.base_yield_quantity} {r.final_unit} · cad. {r.default_expiry_days != null ? `${r.default_expiry_days} d` : '—'}
                  {r.is_active ? '' : ' · inactiva'}
                  {r.restricted_visibility ? ' · visibilidad restringida' : ''}
                </p>
              </div>
              <Link
                href={`/cocina-central/produccion/recetas/${r.id}`}
                className="text-xs font-bold text-[#D32F2F] underline"
              >
                Editar
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
