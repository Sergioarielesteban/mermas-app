'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { Eye, PencilLine } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import RecipeQuickViewModal from '@/components/escandallos/RecipeQuickViewModal';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canCocinaCentralOperate } from '@/lib/cocina-central-permissions';
import { prListAllRecipes, type ProductionRecipeRow } from '@/lib/production-recipes-supabase';

export default function FormulasProduccionListPage() {
  const { localId, profileReady, isCentralKitchen, profileRole } = useAuth();
  const canUse = canCocinaCentralOperate(isCentralKitchen, profileRole);
  const supabase = getSupabaseClient();

  const [rows, setRows] = useState<ProductionRecipeRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [quickViewRecipeId, setQuickViewRecipeId] = useState<string | null>(null);

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
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
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

  const quickViewRecipe = quickViewRecipeId ? rows.find((row) => row.id === quickViewRecipeId) ?? null : null;

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
            <li
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => setQuickViewRecipeId(r.id)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                setQuickViewRecipeId(r.id);
              }}
              className="flex flex-col gap-3 px-4 py-3 text-sm transition hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-bold text-zinc-900">{r.name}</p>
                <p className="text-xs text-zinc-600">
                  {r.base_yield_quantity} {r.final_unit} · cad. {r.default_expiry_days != null ? `${r.default_expiry_days} d` : '—'}
                  {r.is_active ? '' : ' · inactiva'}
                  {r.restricted_visibility ? ' · visibilidad restringida' : ''}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setQuickViewRecipeId(r.id);
                  }}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-800"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Ver
                </button>
                <Link
                  href={`/cocina-central/produccion/recetas/${r.id}`}
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-[#D32F2F]"
                >
                  <PencilLine className="h-3.5 w-3.5" />
                  Editar
                </Link>
              </div>
            </li>
          ))
        )}
      </ul>

      {quickViewRecipe ? (
        <RecipeQuickViewModal
          open
          mode="central_kitchen"
          readonly
          localId={localId}
          supabase={supabase}
          onClose={() => setQuickViewRecipeId(null)}
          editHref={`/cocina-central/produccion/recetas/${quickViewRecipe.id}`}
          recipe={quickViewRecipe}
        />
      ) : null}
    </div>
  );
}
