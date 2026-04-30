'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canCocinaCentralOperate } from '@/lib/cocina-central-permissions';
import {
  PRODUCTION_RECIPE_DELETE_BLOCKED_NESTED,
  prDeleteRecipe,
  prDuplicateRecipe,
  prListAllRecipes,
  prUpdateRecipe,
  type ProductionRecipeRow,
} from '@/lib/production-recipes-supabase';
import { computeProductionRecipeCostBreakdown } from '@/lib/production-recipe-cost';

const CAT_LABEL: Record<string, string> = {
  salsa: 'Salsa',
  base: 'Base',
  elaborado: 'Elaborado',
  postre: 'Postre',
  otro: 'Otro',
};

export default function RecetarioCentralPage() {
  const { localId, profileReady, isCentralKitchen, profileRole } = useAuth();
  const canUse = canCocinaCentralOperate(isCentralKitchen, profileRole);
  const supabase = getSupabaseClient();

  const [rows, setRows] = useState<ProductionRecipeRow[]>([]);
  const [costById, setCostById] = useState<Record<string, { unit: number | null; total: number | null }>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busyDup, setBusyDup] = useState<string | null>(null);
  const [busyToggle, setBusyToggle] = useState<string | null>(null);
  const [busyDelete, setBusyDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !localId || !canUse) return;
    setErr(null);
    try {
      const r = await prListAllRecipes(supabase, localId);
      setRows(r);
      const nextCosts: Record<string, { unit: number | null; total: number | null }> = {};
      await Promise.all(
        r.map(async (rec) => {
          try {
            const b = await computeProductionRecipeCostBreakdown(supabase, localId, rec.id);
            nextCosts[rec.id] = {
              unit: b.costPerYieldUnitEur,
              total: b.totalIngredientsEur > 0 ? b.totalIngredientsEur : null,
            };
          } catch {
            nextCosts[rec.id] = { unit: null, total: null };
          }
        }),
      );
      setCostById(nextCosts);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al cargar');
    }
  }, [supabase, localId, canUse]);

  useEffect(() => {
    void load();
  }, [load]);

  const duplicate = async (id: string) => {
    if (!supabase || !localId || !canUse) return;
    setBusyDup(id);
    setErr(null);
    try {
      await prDuplicateRecipe(supabase, localId, id, null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo duplicar');
    } finally {
      setBusyDup(null);
    }
  };

  const removeRecipe = async (r: ProductionRecipeRow) => {
    if (!supabase || !localId || !canUse) return;
    if (!window.confirm('¿Eliminar esta receta definitivamente?')) return;
    setBusyDelete(r.id);
    setErr(null);
    try {
      await prDeleteRecipe(supabase, r.id, localId);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo eliminar';
      if (msg === PRODUCTION_RECIPE_DELETE_BLOCKED_NESTED) {
        setErr('No se puede eliminar porque está vinculada a otros módulos. Desactívala en su lugar.');
      } else {
        setErr(msg);
      }
    } finally {
      setBusyDelete(null);
    }
  };

  const toggleActive = async (r: ProductionRecipeRow) => {
    if (!supabase || !localId || !canUse) return;
    setBusyToggle(r.id);
    setErr(null);
    try {
      await prUpdateRecipe(supabase, r.id, localId, { is_active: !r.is_active });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo actualizar');
    } finally {
      setBusyToggle(null);
    }
  };

  const sorted = useMemo(() => [...rows].sort((a, b) => a.name.localeCompare(b.name, 'es')), [rows]);

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!isSupabaseEnabled() || !supabase) {
    return <p className="text-sm text-amber-800">Supabase no disponible.</p>;
  }
  if (!localId) return <p className="text-sm text-zinc-500">Sin local en el perfil.</p>;
  if (!canUse) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        Solo cocina central puede usar el Recetario.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/cocina-central" className="text-sm font-semibold text-[#D32F2F]">
          ← Cocina central
        </Link>
        <h1 className="mt-2 text-center text-xl font-extrabold text-zinc-900">Recetario Central</h1>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link
          href="/cocina-central/produccion/recetas/nueva"
          className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#D32F2F] px-4 text-sm font-extrabold text-white"
        >
          Nueva receta
        </Link>
        <Link
          href="/cocina-central/produccion/recetas"
          className="inline-flex h-12 items-center justify-center rounded-2xl border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-800"
        >
          Lista clásica (fórmulas)
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-8 text-sm text-zinc-500 sm:col-span-2 xl:col-span-3">
            Aún no hay recetas. Crea la primera con «Nueva receta».
          </div>
        ) : (
          sorted.map((r) => {
            const cat = String(r.recipe_category ?? 'otro');
            const costs = costById[r.id];
            const unitCost = costs?.unit ?? null;
            const totalCost = costs?.total ?? null;
            const yq = Number(r.base_yield_quantity);
            const fmtLabel = r.operative_format_label?.trim();
            let costPerFormat: number | null = null;
            if (
              unitCost != null &&
              Number.isFinite(unitCost) &&
              r.weight_kg_per_base_yield != null &&
              Number(r.weight_kg_per_base_yield) > 0
            ) {
              costPerFormat = Math.round(unitCost * Number(r.weight_kg_per_base_yield) * 100) / 100;
            }

            return (
              <div
                key={r.id}
                className={`flex flex-col rounded-2xl border bg-white p-4 shadow-sm ${
                  r.is_active ? 'border-zinc-200' : 'border-zinc-300 opacity-80'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-extrabold text-zinc-900">{r.name}</p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      {CAT_LABEL[cat] ?? cat}
                      {fmtLabel ? ` · ${fmtLabel}` : ''}
                    </p>
                  </div>
                  {!r.is_active ? (
                    <span className="shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700">
                      Inactiva
                    </span>
                  ) : null}
                </div>
                <dl className="mt-3 space-y-1 text-xs text-zinc-700">
                  <div className="flex justify-between gap-2">
                    <dt className="text-zinc-500">Salida</dt>
                    <dd className="font-semibold tabular-nums">
                      {Number.isFinite(yq) ? yq : '—'} {r.final_unit}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-zinc-500">Coste ingredientes</dt>
                    <dd className="font-semibold tabular-nums">
                      {totalCost != null ? `${totalCost.toFixed(2)} €` : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-zinc-500">€ / ud salida</dt>
                    <dd className="font-semibold tabular-nums text-[#D32F2F]">
                      {unitCost != null ? `${unitCost.toFixed(4)} €` : '—'}
                    </dd>
                  </div>
                  {costPerFormat != null ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-zinc-500">Coste por formato (peso base)</dt>
                      <dd className="font-semibold tabular-nums">{costPerFormat.toFixed(2)} €</dd>
                    </div>
                  ) : null}
                </dl>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                  <Link
                    href={`/cocina-central/produccion/recetas/${r.id}`}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-bold text-zinc-900 min-[360px]:flex-none"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </Link>
                  <button
                    type="button"
                    disabled={busyDup === r.id}
                    onClick={() => void duplicate(r.id)}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-800 min-[360px]:flex-none disabled:opacity-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {busyDup === r.id ? '…' : 'Duplicar'}
                  </button>
                  <button
                    type="button"
                    disabled={busyToggle === r.id}
                    onClick={() => void toggleActive(r)}
                    className="inline-flex flex-1 items-center justify-center rounded-xl border border-zinc-300 px-3 py-2 text-xs font-bold text-zinc-800 min-[360px]:flex-none disabled:opacity-50"
                  >
                    {busyToggle === r.id ? '…' : r.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    disabled={busyDelete === r.id}
                    onClick={() => void removeRecipe(r)}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-[#B91C1C] min-[360px]:flex-none disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    {busyDelete === r.id ? '…' : 'Eliminar'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
