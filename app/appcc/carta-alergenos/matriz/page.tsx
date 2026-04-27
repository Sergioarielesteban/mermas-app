'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import AppccCompactHero from '@/components/AppccCompactHero';
import MatrizPlatoConsultaCard from '@/components/appcc/MatrizPlatoConsultaCard';
import MatrizPlatoConsultaModal from '@/components/appcc/MatrizPlatoConsultaModal';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  fetchAllergensMaster,
  fetchCartaRecipesWithReviewStatus,
  fetchRecipeAllergensForLocal,
  type AllergenMasterRow,
  type CartaRecipeRow,
  type GlutenFreeOption,
  type RecipeAllergenRow,
  type RecipeReviewStatus,
} from '@/lib/appcc-allergens-supabase';
import {
  effectiveGlutenOption,
  resolveMatrizPresenceForAllergen,
  type MatrizPresenceKind,
} from '@/lib/appcc-matriz-consulta';

function buildRowsByRecipe(rows: RecipeAllergenRow[]): Map<string, Map<string, RecipeAllergenRow>> {
  const byRecipe = new Map<string, Map<string, RecipeAllergenRow>>();
  for (const row of rows) {
    if (!byRecipe.has(row.recipe_id)) byRecipe.set(row.recipe_id, new Map());
    byRecipe.get(row.recipe_id)!.set(row.allergen_id, row);
  }
  return byRecipe;
}

function recipeMatchesFilters(
  recipe: CartaRecipeRow,
  byAllergen: Map<string, RecipeAllergenRow | undefined>,
  masterIds: string[],
  q: string,
  review: 'all' | RecipeReviewStatus,
  allergenId: 'all' | string,
  presence: 'all' | MatrizPresenceKind,
  gluten: 'all' | GlutenFreeOption,
): boolean {
  if (q.trim()) {
    const n = q.trim().toLowerCase();
    if (!recipe.name.toLowerCase().includes(n) && !(recipe.carta_category ?? '').toLowerCase().includes(n)) {
      return false;
    }
  }
  if (review !== 'all' && recipe.allergens_review_status !== review) return false;

  const g = effectiveGlutenOption(recipe.gluten_free_option);
  if (gluten !== 'all' && g !== gluten) return false;

  if (allergenId === 'all' && presence === 'all') return true;

  if (allergenId !== 'all' && presence !== 'all') {
    return resolveMatrizPresenceForAllergen(byAllergen, allergenId) === presence;
  }

  if (allergenId !== 'all' && presence === 'all') {
    return resolveMatrizPresenceForAllergen(byAllergen, allergenId) !== 'none';
  }

  if (allergenId === 'all' && presence === 'none') {
    // Sin alérgeno concreto, "no contiene" aplica a casi todos los platos; no filtramos por presencia.
    return true;
  }

  if (allergenId === 'all' && presence !== 'all') {
    for (const id of masterIds) {
      if (resolveMatrizPresenceForAllergen(byAllergen, id) === presence) return true;
    }
    return false;
  }

  return true;
}

export default function AppccCartaAlergenosMatrizPage() {
  const { localId, profileReady, profileRole } = useAuth();
  const isAdmin = profileRole === 'admin';
  const supabaseReady = isSupabaseEnabled() && !!getSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<CartaRecipeRow[]>([]);
  const [allergensMaster, setAllergensMaster] = useState<AllergenMasterRow[]>([]);
  const [rawRows, setRawRows] = useState<RecipeAllergenRow[]>([]);
  const [search, setSearch] = useState('');
  const [reviewStatus, setReviewStatus] = useState<'all' | RecipeReviewStatus>('all');
  const [allergenFilter, setAllergenFilter] = useState<'all' | string>('all');
  const [presenceFilter, setPresenceFilter] = useState<'all' | MatrizPresenceKind>('all');
  const [glutenFilter, setGlutenFilter] = useState<'all' | GlutenFreeOption>('all');
  const [detailRecipe, setDetailRecipe] = useState<CartaRecipeRow | null>(null);

  useEffect(() => {
    if (!profileReady) return;
    if (!localId || !supabaseReady) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    let active = true;
    const run = async () => {
      setLoading(true);
      setBanner(null);
      try {
        const [r, a, ra] = await Promise.all([
          fetchCartaRecipesWithReviewStatus(supabase, localId),
          fetchAllergensMaster(supabase),
          fetchRecipeAllergensForLocal(supabase, localId),
        ]);
        if (!active) return;
        setRecipes(r);
        setAllergensMaster(a);
        setRawRows(ra);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'No se pudo cargar la matriz.';
        setBanner(
          msg.includes('column') && msg.includes('does not exist')
            ? 'Faltan columnas en Supabase. Ejecuta supabase-carta-recipe-gluten-fields.sql en el SQL Editor.'
            : msg,
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [profileReady, localId, supabaseReady]);

  const rowsByRecipe = useMemo(() => buildRowsByRecipe(rawRows), [rawRows]);

  const masterIds = useMemo(() => allergensMaster.map((x) => x.id), [allergensMaster]);

  const filteredRecipes = useMemo(() => {
    return recipes.filter((recipe) => {
      const byA = rowsByRecipe.get(recipe.id) ?? new Map<string, RecipeAllergenRow>();
      const byAllergen: Map<string, RecipeAllergenRow | undefined> = byA;
      return recipeMatchesFilters(
        recipe,
        byAllergen,
        masterIds,
        search,
        reviewStatus,
        allergenFilter,
        presenceFilter,
        glutenFilter,
      );
    });
  }, [recipes, rowsByRecipe, masterIds, search, reviewStatus, allergenFilter, presenceFilter, glutenFilter]);

  const detailMap = detailRecipe ? rowsByRecipe.get(detailRecipe.id) : null;

  if (!profileReady || loading) {
    return (
      <section className="rounded-lg border border-zinc-200/90 bg-white px-3 py-2 ring-1 ring-zinc-100/80">
        <p className="text-xs text-zinc-600">Cargando matriz…</p>
      </section>
    );
  }

  return (
    <div className="space-y-2 pb-4">
      <AppccCompactHero title="MATRIZ CARTA Y ALÉRGENOS" />

      {banner ? (
        <div className="rounded-lg border border-amber-200/90 bg-amber-50 px-2 py-1.5 text-xs text-amber-950 ring-1 ring-amber-100/80">
          {banner}
        </div>
      ) : null}

      <section className="rounded-lg border border-zinc-200/90 bg-white px-2 py-1.5 ring-1 ring-zinc-100/80">
        <div className="grid grid-cols-1 gap-1.5">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar plato…"
              className="h-8 w-full rounded-md border border-zinc-200/90 bg-white py-1 pl-8 pr-2 text-xs outline-none focus:border-zinc-300"
            />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase leading-none text-zinc-500">Alérgeno</span>
              <select
                value={allergenFilter}
                onChange={(e) => setAllergenFilter(e.target.value === 'all' ? 'all' : e.target.value)}
                className="h-8 w-full rounded-md border border-zinc-200/90 bg-white px-2 text-xs font-semibold text-zinc-900"
              >
                <option value="all">Todos</option>
                {allergensMaster.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase leading-none text-zinc-500">Estado</span>
              <select
                value={presenceFilter}
                onChange={(e) => setPresenceFilter(e.target.value as 'all' | MatrizPresenceKind)}
                className="h-8 w-full rounded-md border border-zinc-200/90 bg-white px-2 text-xs font-semibold text-zinc-900"
              >
                <option value="all">Todos</option>
                <option value="contains">Contiene</option>
                <option value="may_contain">Puede contener</option>
                <option value="traces">Trazas</option>
                <option value="none">No contiene</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase leading-none text-zinc-500">Sin gluten</span>
              <select
                value={glutenFilter}
                onChange={(e) => setGlutenFilter(e.target.value as 'all' | GlutenFreeOption)}
                className="h-8 w-full rounded-md border border-zinc-200/90 bg-white px-2 text-xs font-semibold text-zinc-900"
              >
                <option value="all">Todas</option>
                <option value="yes">Sí</option>
                <option value="no">No</option>
                <option value="ask">Consultar</option>
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase leading-none text-zinc-500">Revisión</span>
              <select
                value={reviewStatus}
                onChange={(e) => setReviewStatus(e.target.value as 'all' | RecipeReviewStatus)}
                className="h-8 w-full rounded-md border border-zinc-200/90 bg-white px-2 text-xs font-semibold text-zinc-900"
              >
                <option value="all">Todas</option>
                <option value="reviewed">Revisado</option>
                <option value="pending_review">Pendiente</option>
                <option value="stale">Desactual.</option>
                <option value="incomplete">Incompleto</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section>
        {filteredRecipes.length === 0 ? (
          <p className="rounded-lg border border-zinc-200/90 bg-zinc-50 px-3 py-3 text-center text-xs font-medium text-zinc-600">
            Ningún plato con estos filtros.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 sm:gap-3">
            {filteredRecipes.map((recipe) => {
              const byA = rowsByRecipe.get(recipe.id) ?? new Map<string, RecipeAllergenRow>();
              return (
                <li key={recipe.id}>
                  <MatrizPlatoConsultaCard
                    recipe={recipe}
                    allergensMaster={allergensMaster}
                    rowsByAllergenId={byA}
                    onSelect={() => setDetailRecipe(recipe)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {detailRecipe ? (
        <MatrizPlatoConsultaModal
          recipe={detailRecipe}
          allergensMaster={allergensMaster}
          rowsByAllergenId={detailMap ?? new Map()}
          isAdmin={isAdmin}
          onClose={() => setDetailRecipe(null)}
        />
      ) : null}
    </div>
  );
}
