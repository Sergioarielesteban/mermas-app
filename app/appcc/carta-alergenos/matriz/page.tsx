'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import AppccCompactHero from '@/components/AppccCompactHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  fetchAllergensMaster,
  fetchCartaRecipesWithReviewStatus,
  fetchRecipeAllergensForLocal,
  type RecipeReviewStatus,
} from '@/lib/appcc-allergens-supabase';
import { ReviewStatusBadge } from '@/components/appcc/AllergenUi';

export default function AppccCartaAlergenosMatrizPage() {
  const { localId, profileReady, profileRole } = useAuth();
  const isManager = profileRole === 'manager';
  const supabaseReady = isSupabaseEnabled() && !!getSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<
    Array<{ id: string; name: string; allergens_review_status: RecipeReviewStatus }>
  >([]);
  const [allergens, setAllergens] = useState<Array<{ id: string; name: string; icon: string }>>([]);
  const [cells, setCells] = useState<Map<string, { presence: string; status: string }>>(new Map());
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | RecipeReviewStatus>('all');

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
        setRecipes(r.map((x) => ({ id: x.id, name: x.name, allergens_review_status: x.allergens_review_status })));
        setAllergens(a.map((x) => ({ id: x.id, name: x.name, icon: x.icon })));
        const map = new Map<string, { presence: string; status: string }>();
        ra.forEach((row) => {
          if (row.status === 'excluded') return;
          map.set(`${row.recipe_id}:${row.allergen_id}`, { presence: row.presence_type, status: row.status });
        });
        setCells(map);
      } catch (e: unknown) {
        setBanner(e instanceof Error ? e.message : 'No se pudo cargar matriz.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [profileReady, localId, supabaseReady]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recipes.filter((r) => {
      if (status !== 'all' && r.allergens_review_status !== status) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q);
    });
  }, [recipes, search, status]);

  if (!profileReady || loading) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Cargando matriz…</p>
      </section>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <AppccCompactHero title="Matriz carta y alérgenos" />
      {isManager ? (
        <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-600 ring-1 ring-zinc-100">
          Vista solo consulta. La edición y revisión de platos corresponde a administración del local.
        </p>
      ) : null}
      {banner ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-100">
          {banner}
        </div>
      ) : null}
      <section className="rounded-2xl border border-zinc-200 bg-white p-3 ring-1 ring-zinc-100">
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar plato…" className="w-full rounded-xl border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as 'all' | RecipeReviewStatus)} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold">
            <option value="all">Todos</option>
            <option value="reviewed">Revisado</option>
            <option value="pending_review">Pendiente</option>
            <option value="stale">Desactualizado</option>
            <option value="incomplete">Incompleto</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left text-xs font-black uppercase tracking-wide text-zinc-500">Plato</th>
                {allergens.map((a) => (
                  <th key={a.id} className="px-1.5 py-2 text-center text-[11px] font-bold text-zinc-600" title={a.name}>
                    <span>{a.icon}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-zinc-100">
                  <td className="sticky left-0 z-10 bg-white px-2 py-2">
                    <div className="flex items-center gap-2">
                      {!isManager ? (
                        <Link
                          href={`/appcc/carta-alergenos/${r.id}`}
                          className="text-sm font-semibold text-zinc-900 hover:text-[#D32F2F]"
                        >
                          {r.name}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-zinc-900">{r.name}</span>
                      )}
                      <ReviewStatusBadge status={r.allergens_review_status} />
                    </div>
                  </td>
                  {allergens.map((a) => {
                    const val = cells.get(`${r.id}:${a.id}`);
                    const cls =
                      !val
                        ? 'bg-white'
                        : val.presence === 'contains'
                          ? 'bg-red-100'
                          : val.presence === 'traces'
                            ? 'bg-amber-100'
                            : 'bg-zinc-200';
                    return (
                      <td key={`${r.id}:${a.id}`} className="px-1 py-2">
                        <div className={['mx-auto h-6 w-6 rounded-md ring-1 ring-zinc-200', cls].join(' ')} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
