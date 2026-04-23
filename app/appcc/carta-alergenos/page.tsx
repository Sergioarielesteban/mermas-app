'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Grid3X3, Search, ShieldAlert, Table2, Tags } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  fetchCartaRecipesWithReviewStatus,
  fetchProductAllergensForLocal,
  fetchRecipeAllergensForLocal,
  refreshRecipeAllergens,
  type CartaRecipeRow,
  type RecipeAllergenRow,
  type RecipeReviewStatus,
} from '@/lib/appcc-allergens-supabase';
import { ReviewStatusBadge, SmallDateLabel } from '@/components/appcc/AllergenUi';

type RecipeCard = CartaRecipeRow & { allergens: RecipeAllergenRow[] };

function KpiCard({ label, value, tone = 'zinc' }: { label: string; value: number; tone?: 'zinc' | 'red' | 'amber' }) {
  const toneCls =
    tone === 'red'
      ? 'bg-red-50 ring-red-200 text-red-900'
      : tone === 'amber'
        ? 'bg-amber-50 ring-amber-200 text-amber-900'
        : 'bg-white ring-zinc-200 text-zinc-900';
  return (
    <div className={['rounded-2xl px-3 py-3 ring-1', toneCls].join(' ')}>
      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums">{value}</p>
    </div>
  );
}

export default function AppccCartaAlergenosPage() {
  const { localId, profileReady } = useAuth();
  const supabaseReady = isSupabaseEnabled() && !!getSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<CartaRecipeRow[]>([]);
  const [recipeAllergens, setRecipeAllergens] = useState<RecipeAllergenRow[]>([]);
  const [productsWithoutSheet, setProductsWithoutSheet] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RecipeReviewStatus>('all');

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
        const fetchedRecipes = await fetchCartaRecipesWithReviewStatus(supabase, localId);
        await Promise.all(fetchedRecipes.map((r) => refreshRecipeAllergens(supabase, r.id)));
        const [recipesAfter, allergens, productRows, lineRows, processedRows] = await Promise.all([
          fetchCartaRecipesWithReviewStatus(supabase, localId),
          fetchRecipeAllergensForLocal(supabase, localId),
          fetchProductAllergensForLocal(supabase, localId),
          supabase
            .from('escandallo_recipe_lines')
            .select('raw_supplier_product_id,processed_product_id,source_type')
            .eq('local_id', localId),
          supabase
            .from('escandallo_processed_products')
            .select('id,source_supplier_product_id')
            .eq('local_id', localId),
        ]);
        if (!active) return;
        if (lineRows.error) throw new Error(lineRows.error.message);
        if (processedRows.error) throw new Error(processedRows.error.message);

        const processedById = new Map<string, string>(
          (processedRows.data ?? []).map((p: { id: string; source_supplier_product_id: string }) => [
            p.id,
            p.source_supplier_product_id,
          ]),
        );
        const usedProducts = new Set<string>();
        for (const row of (lineRows.data ?? []) as Array<{
          raw_supplier_product_id: string | null;
          processed_product_id: string | null;
          source_type: string;
        }>) {
          if (row.source_type === 'raw' && row.raw_supplier_product_id) usedProducts.add(row.raw_supplier_product_id);
          if (row.source_type === 'processed' && row.processed_product_id) {
            const p = processedById.get(row.processed_product_id);
            if (p) usedProducts.add(p);
          }
        }
        const productsWithSheet = new Set(productRows.map((r) => r.product_id));
        let without = 0;
        usedProducts.forEach((p) => {
          if (!productsWithSheet.has(p)) without += 1;
        });

        setRecipes(recipesAfter);
        setRecipeAllergens(allergens);
        setProductsWithoutSheet(without);
      } catch (e: unknown) {
        setBanner(e instanceof Error ? e.message : 'No se pudo cargar Carta y alérgenos.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [profileReady, localId, supabaseReady]);

  const cards = useMemo<RecipeCard[]>(() => {
    const byRecipe = new Map<string, RecipeAllergenRow[]>();
    recipeAllergens.forEach((ra) => {
      if (!byRecipe.has(ra.recipe_id)) byRecipe.set(ra.recipe_id, []);
      byRecipe.get(ra.recipe_id)!.push(ra);
    });
    return recipes.map((r) => ({ ...r, allergens: byRecipe.get(r.id) ?? [] }));
  }, [recipes, recipeAllergens]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((r) => {
      if (statusFilter !== 'all' && r.allergens_review_status !== statusFilter) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q);
    });
  }, [cards, search, statusFilter]);

  const kpis = useMemo(() => {
    const total = cards.length;
    const reviewed = cards.filter((r) => r.allergens_review_status === 'reviewed').length;
    const pending = cards.filter((r) => r.allergens_review_status === 'pending_review').length;
    const stale = cards.filter((r) => r.allergens_review_status === 'stale').length;
    const incomplete = cards.filter((r) => r.allergens_review_status === 'incomplete').length;
    return { total, reviewed, pending, stale, incomplete };
  }, [cards]);

  if (!profileReady || loading) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Cargando carta y alérgenos…</p>
      </section>
    );
  }

  if (!localId || !supabaseReady) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-semibold text-zinc-900">Módulo no disponible</p>
        <p className="pt-1 text-sm text-zinc-600">Necesitas sesión de local activa con Supabase.</p>
      </section>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <MermasStyleHero
        eyebrow="APPCC"
        title="Carta y alérgenos"
        description="Control híbrido: herencia automática desde ingredientes y revisión profesional por plato."
        compact
      />

      {banner ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-100">
          {banner}
        </div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <KpiCard label="Total platos" value={kpis.total} />
          <KpiCard label="Revisados" value={kpis.reviewed} tone="zinc" />
          <KpiCard label="Pendientes" value={kpis.pending} tone="amber" />
          <KpiCard label="Desactualizados" value={kpis.stale} tone="amber" />
          <KpiCard label="Incompletos" value={kpis.incomplete} tone="red" />
          <KpiCard label="Ingredientes sin ficha" value={productsWithoutSheet} tone="red" />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Link href="/appcc/carta-alergenos/matriz" className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-white">
            <Table2 className="h-4 w-4" />
            Ver matriz completa
          </Link>
          <Link href="/appcc/carta-alergenos/incidencias" className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-white">
            <ShieldAlert className="h-4 w-4" />
            Ver incidencias
          </Link>
          <Link href="/appcc/carta-alergenos/productos" className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-white">
            <Tags className="h-4 w-4" />
            Ficha de ingredientes
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar plato…"
              className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#D32F2F]/40 focus:ring-2 focus:ring-[#D32F2F]/15"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | RecipeReviewStatus)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-700"
          >
            <option value="all">Todos los estados</option>
            <option value="reviewed">Revisado</option>
            <option value="pending_review">Pendiente</option>
            <option value="stale">Desactualizado</option>
            <option value="incomplete">Incompleto</option>
          </select>
        </div>

        <div className="mt-3 space-y-2">
          {filtered.length === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-500">Sin platos para ese filtro.</p>
          ) : null}
          {filtered.map((recipe) => (
            <article key={recipe.id} className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3 ring-1 ring-zinc-100">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-bold text-zinc-900">{recipe.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <ReviewStatusBadge status={recipe.allergens_review_status} />
                    <SmallDateLabel iso={recipe.allergens_reviewed_at} />
                  </div>
                </div>
                <Link href={`/appcc/carta-alergenos/${recipe.id}`} className="inline-flex items-center gap-1 rounded-lg bg-[#D32F2F] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#B91C1C]">
                  Revisar
                </Link>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {recipe.allergens
                  .filter((a) => a.status !== 'excluded')
                  .slice(0, 8)
                  .map((a) => (
                    <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 ring-1 ring-zinc-200">
                      <span aria-hidden>{a.allergen?.icon ?? '•'}</span>
                      <span>{a.allergen?.name ?? 'Alérgeno'}</span>
                    </span>
                  ))}
                {recipe.allergens.filter((a) => a.status !== 'excluded').length > 8 ? (
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-zinc-600 ring-1 ring-zinc-200">
                    +{recipe.allergens.filter((a) => a.status !== 'excluded').length - 8}
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100">
        <p className="text-sm font-bold text-zinc-900">Revisión rápida en secuencia</p>
        <p className="mt-1 text-sm text-zinc-600">Empieza por platos pendientes para cerrar revisiones del día sin salir del flujo operativo.</p>
        <div className="mt-2">
          <Link
            href={
              filtered.find((r) => r.allergens_review_status === 'pending_review' || r.allergens_review_status === 'stale')
                ? `/appcc/carta-alergenos/${filtered.find((r) => r.allergens_review_status === 'pending_review' || r.allergens_review_status === 'stale')!.id}`
                : '/appcc/carta-alergenos/matriz'
            }
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-bold text-white hover:bg-black"
          >
            <Grid3X3 className="h-4 w-4" />
            Revisar siguientes platos
          </Link>
        </div>
        {productsWithoutSheet > 0 ? (
          <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Hay ingredientes sin ficha de alérgenos; algunos platos no podrán quedar revisados sin forzar.
          </p>
        ) : null}
      </section>
    </div>
  );
}
