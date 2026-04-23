'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import AppccCompactHero from '@/components/AppccCompactHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { fetchCartaRecipesWithReviewStatus, fetchProductAllergensForLocal } from '@/lib/appcc-allergens-supabase';
import { ReviewStatusBadge } from '@/components/appcc/AllergenUi';

export default function AppccCartaAlergenosIncidenciasPage() {
  const { localId, profileReady } = useAuth();
  const supabaseReady = isSupabaseEnabled() && !!getSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [pendingRecipes, setPendingRecipes] = useState<Array<{ id: string; name: string; status: 'pending_review' | 'stale' | 'incomplete' }>>([]);
  const [ingredientsWithoutSheet, setIngredientsWithoutSheet] = useState<Array<{ id: string; name: string }>>([]);

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
        const [recipes, productSheets, lines, processed] = await Promise.all([
          fetchCartaRecipesWithReviewStatus(supabase, localId),
          fetchProductAllergensForLocal(supabase, localId),
          supabase
            .from('escandallo_recipe_lines')
            .select('raw_supplier_product_id,processed_product_id,source_type')
            .eq('local_id', localId),
          supabase
            .from('escandallo_processed_products')
            .select('id,source_supplier_product_id,name')
            .eq('local_id', localId),
        ]);
        if (lines.error) throw new Error(lines.error.message);
        if (processed.error) throw new Error(processed.error.message);
        const pending = recipes
          .filter((r) => r.allergens_review_status !== 'reviewed')
          .map((r) => ({ id: r.id, name: r.name, status: r.allergens_review_status as 'pending_review' | 'stale' | 'incomplete' }));

        const productsWithSheet = new Set(productSheets.map((p) => p.product_id));
        const processedMap = new Map<string, { source_supplier_product_id: string; name: string }>(
          (processed.data ?? []).map((p: { id: string; source_supplier_product_id: string; name: string }) => [p.id, p]),
        );
        const missingIds = new Set<string>();
        for (const l of (lines.data ?? []) as Array<{ raw_supplier_product_id: string | null; processed_product_id: string | null; source_type: string }>) {
          if (l.source_type === 'raw' && l.raw_supplier_product_id && !productsWithSheet.has(l.raw_supplier_product_id)) {
            missingIds.add(l.raw_supplier_product_id);
          }
          if (l.source_type === 'processed' && l.processed_product_id) {
            const base = processedMap.get(l.processed_product_id);
            if (base && !productsWithSheet.has(base.source_supplier_product_id)) {
              missingIds.add(base.source_supplier_product_id);
            }
          }
        }

        const productsQuery = await supabase
          .from('pedido_supplier_products')
          .select('id,name')
          .eq('local_id', localId)
          .in('id', Array.from(missingIds));
        if (productsQuery.error) throw new Error(productsQuery.error.message);

        if (!active) return;
        setPendingRecipes(pending);
        setIngredientsWithoutSheet((productsQuery.data ?? []) as Array<{ id: string; name: string }>);
      } catch (e: unknown) {
        setBanner(e instanceof Error ? e.message : 'No se pudieron cargar incidencias.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [profileReady, localId, supabaseReady]);

  const counts = useMemo(
    () => ({
      pending: pendingRecipes.filter((x) => x.status === 'pending_review').length,
      stale: pendingRecipes.filter((x) => x.status === 'stale').length,
      incomplete: pendingRecipes.filter((x) => x.status === 'incomplete').length,
    }),
    [pendingRecipes],
  );

  if (!profileReady || loading) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Cargando incidencias…</p>
      </section>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <AppccCompactHero title="Incidencias de carta y alérgenos" />
      {banner ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-100">
          {banner}
        </div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100">
        <p className="text-sm font-bold text-zinc-900">Resumen</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-amber-50 px-2 py-2 ring-1 ring-amber-200">
            <p className="text-[10px] font-black uppercase tracking-wide text-amber-900">Pendientes</p>
            <p className="text-xl font-black text-amber-900">{counts.pending}</p>
          </div>
          <div className="rounded-xl bg-orange-50 px-2 py-2 ring-1 ring-orange-200">
            <p className="text-[10px] font-black uppercase tracking-wide text-orange-900">Desactualizados</p>
            <p className="text-xl font-black text-orange-900">{counts.stale}</p>
          </div>
          <div className="rounded-xl bg-red-50 px-2 py-2 ring-1 ring-red-200">
            <p className="text-[10px] font-black uppercase tracking-wide text-red-900">Incompletos</p>
            <p className="text-xl font-black text-red-900">{counts.incomplete}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-red-200 bg-red-50 p-4 ring-1 ring-red-100">
        <p className="inline-flex items-center gap-1 text-sm font-bold text-red-900">
          <AlertTriangle className="h-4 w-4" />
          Ingredientes sin ficha de alérgenos ({ingredientsWithoutSheet.length})
        </p>
        <ul className="mt-2 space-y-1 text-xs text-red-900">
          {ingredientsWithoutSheet.length === 0 ? <li>Sin incidencias en ingredientes.</li> : null}
          {ingredientsWithoutSheet.map((p) => (
            <li key={p.id}>• {p.name}</li>
          ))}
        </ul>
        <Link href="/appcc/carta-alergenos/productos" className="mt-3 inline-flex rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-red-800 ring-1 ring-red-200">
          Completar fichas
        </Link>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100">
        <p className="text-sm font-bold text-zinc-900">Platos que requieren acción</p>
        <ul className="mt-2 space-y-2">
          {pendingRecipes.length === 0 ? <li className="text-sm text-zinc-500">Todo al día.</li> : null}
          {pendingRecipes.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2">
              <div className="flex items-center gap-2">
                <Link href={`/appcc/carta-alergenos/${r.id}`} className="text-sm font-semibold text-zinc-900 hover:text-[#D32F2F]">
                  {r.name}
                </Link>
                <ReviewStatusBadge status={r.status} />
              </div>
              <Link href={`/appcc/carta-alergenos/${r.id}`} className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] font-bold text-white">
                Revisar
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
