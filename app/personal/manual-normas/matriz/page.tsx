'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { PersonalSectionNav } from '@/components/staff/StaffPersonalShell';
import { useAuth } from '@/components/AuthProvider';
import {
  fetchAllergensMaster,
  fetchCartaRecipesWithReviewStatus,
  fetchRecipeAllergensForLocal,
  presenceLabel,
  type RecipeAllergenRow,
} from '@/lib/appcc-allergens-supabase';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';

function allergenSummaryForRecipe(rows: RecipeAllergenRow[], recipeId: string): string[] {
  const byId = new Map<string, RecipeAllergenRow>();
  for (const r of rows) {
    if (r.recipe_id !== recipeId || r.status === 'excluded') continue;
    const prev = byId.get(r.allergen_id);
    if (!prev) {
      byId.set(r.allergen_id, r);
      continue;
    }
    const rank = (p: string) => (p === 'contains' ? 0 : p === 'traces' ? 1 : 2);
    if (rank(r.presence_type) < rank(prev.presence_type)) byId.set(r.allergen_id, r);
  }
  return [...byId.values()]
    .map((r) => {
      const name = r.allergen?.name ?? 'Alérgeno';
      return `${name} (${presenceLabel(r.presence_type)})`;
    })
    .sort((a, b) => a.localeCompare(b, 'es'));
}

export default function PersonalMatrizAlergenosPage() {
  const { localId, profileReady } = useAuth();
  const supabaseOk = isSupabaseEnabled() && !!getSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [recipeNames, setRecipeNames] = useState<Array<{ id: string; name: string }>>([]);
  const [allergenRows, setAllergenRows] = useState<RecipeAllergenRow[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!profileReady) return;
    if (!localId || !supabaseOk) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    let active = true;
    const run = async () => {
      setLoading(true);
      setBanner(null);
      try {
        const [recipes, , ra] = await Promise.all([
          fetchCartaRecipesWithReviewStatus(supabase, localId),
          fetchAllergensMaster(supabase),
          fetchRecipeAllergensForLocal(supabase, localId),
        ]);
        if (!active) return;
        setRecipeNames(recipes.map((r) => ({ id: r.id, name: r.name })));
        setAllergenRows(ra);
      } catch (e: unknown) {
        if (active) setBanner(e instanceof Error ? e.message : 'No se pudo cargar la matriz.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [profileReady, localId, supabaseOk]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recipeNames.filter((r) => (q ? r.name.toLowerCase().includes(q) : true));
  }, [recipeNames, search]);

  if (!profileReady || loading) {
    return (
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Cargando matriz de alérgenos…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <MermasStyleHero eyebrow="Solo lectura" title="Matriz de alérgenos" compact />
      <PersonalSectionNav />
      <div className="flex flex-wrap gap-2">
        <Link href="/personal/manual-normas" className="text-sm font-bold text-zinc-600 hover:text-[#D32F2F]">
          ← Manual y normas
        </Link>
        <span className="text-zinc-300">·</span>
        <Link href="/appcc/carta-alergenos/matriz" className="text-sm font-semibold text-zinc-500 hover:text-[#D32F2F]">
          Vista técnica APPCC
        </Link>
      </div>
      <p className="text-xs leading-relaxed text-zinc-600">
        Datos tomados de escandallos y carta de alérgenos del local. Aquí no se puede editar.
      </p>
      {banner ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {banner}
        </div>
      ) : null}
      {!localId || !supabaseOk ? (
        <p className="text-sm text-zinc-600">Inicia sesión con un local configurado para ver la matriz.</p>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto o plato…"
              className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
            />
          </div>
          <ul className="space-y-2">
            {filtered.length === 0 ? (
              <li className="rounded-xl bg-zinc-50 px-3 py-4 text-sm text-zinc-600 ring-1 ring-zinc-200">
                No hay resultados.
              </li>
            ) : (
              filtered.map((r) => {
                const allergens = allergenSummaryForRecipe(allergenRows, r.id);
                return (
                  <li key={r.id} className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm ring-1 ring-zinc-100">
                    <p className="text-sm font-extrabold text-zinc-900">{r.name}</p>
                    {allergens.length === 0 ? (
                      <p className="mt-2 text-xs text-zinc-500">Sin alérgenos registrados o todos excluidos.</p>
                    ) : (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {allergens.map((label) => (
                          <li
                            key={label}
                            className="rounded-lg bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-800"
                          >
                            {label}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </>
      )}
    </div>
  );
}
