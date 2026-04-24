'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Layers, Plus, Search, Sparkles } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getDemoEscandalloPack } from '@/lib/demo-dataset';
import { isDemoMode } from '@/lib/demo-mode';
import { buildEscandalloDashboardRows, bucketLabel, type EscandalloRecipeDashboardRow } from '@/lib/escandallos-analytics';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  fetchEscandalloLines,
  fetchEscandalloRecipes,
  fetchProcessedProductsForEscandallo,
  fetchEscandalloRawProductsWithWeightedPurchasePrices,
  type EscandalloLine,
  type EscandalloProcessedProduct,
  type EscandalloRawProduct,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import { formatMoneyEur } from '@/lib/money-format';

type CatFilter = string;
type PvpFilter = 'all' | 'with' | 'without';
type FcFilter = 'all' | 'high' | 'normal';
type LinesFilter = 'all' | 'with' | 'without';

export default function EscandallosRecetasLibroClient() {
  const { localId, profileReady } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const demoPack = isDemoMode() && Boolean(localId) && !supabaseOk;

  const [recipes, setRecipes] = useState<EscandalloRecipe[]>([]);
  const [linesByRecipe, setLinesByRecipe] = useState<Record<string, EscandalloLine[]>>({});
  const [rawProducts, setRawProducts] = useState<EscandalloRawProduct[]>([]);
  const [processedProducts, setProcessedProducts] = useState<EscandalloProcessedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<CatFilter>('__all__');
  const [pvp, setPvp] = useState<PvpFilter>('all');
  const [fc, setFc] = useState<FcFilter>('all');
  const [linesF, setLinesF] = useState<LinesFilter>('all');

  const load = useCallback(async () => {
    if (!localId) {
      setRecipes([]);
      setLinesByRecipe({});
      setRawProducts([]);
      setProcessedProducts([]);
      setLoading(false);
      return;
    }
    if (demoPack) {
      const pack = getDemoEscandalloPack();
      setRecipes(pack.recipes);
      setLinesByRecipe(pack.linesByRecipe);
      setRawProducts(pack.rawProducts);
      setProcessedProducts(pack.processed);
      setLoading(false);
      return;
    }
    if (!supabaseOk) {
      setRecipes([]);
      setLinesByRecipe({});
      setRawProducts([]);
      setProcessedProducts([]);
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const [r, raw, processed] = await Promise.all([
        fetchEscandalloRecipes(supabase, localId),
        fetchEscandalloRawProductsWithWeightedPurchasePrices(supabase, localId),
        fetchProcessedProductsForEscandallo(supabase, localId),
      ]);
      setRecipes(r);
      setRawProducts(raw);
      setProcessedProducts(processed);
      const entries = await Promise.all(
        r.map(async (rec) => {
          const ls = await fetchEscandalloLines(supabase, localId, rec.id);
          return [rec.id, ls] as const;
        }),
      );
      setLinesByRecipe(Object.fromEntries(entries));
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudieron cargar las recetas.');
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk, demoPack]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const rawById = useMemo(() => new Map(rawProducts.map((p) => [p.id, p])), [rawProducts]);
  const processedById = useMemo(() => new Map(processedProducts.map((p) => [p.id, p])), [processedProducts]);

  const rows = useMemo(
    () => buildEscandalloDashboardRows(recipes, linesByRecipe, rawById, processedById),
    [recipes, linesByRecipe, rawById, processedById],
  );

  const mainRows = useMemo(() => rows.filter((r) => !r.isSubRecipe), [rows]);

  const categories = useMemo(() => {
    const labels = new Set(mainRows.map((r) => r.yieldLabel).filter(Boolean));
    return ['__all__', ...Array.from(labels).sort((a, b) => a.localeCompare(b, 'es'))];
  }, [mainRows]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return mainRows.filter((r) => {
      if (qq && !r.name.toLowerCase().includes(qq)) return false;
      if (cat !== '__all__' && r.yieldLabel !== cat) return false;
      if (pvp === 'with' && (r.saleGrossEur == null || r.saleGrossEur <= 0)) return false;
      if (pvp === 'without' && r.saleGrossEur != null && r.saleGrossEur > 0) return false;
      if (fc === 'high' && r.bucket !== 'high') return false;
      if (fc === 'normal' && (r.bucket === 'high' || r.bucket === 'no_lines' || r.bucket === 'no_pvp' || r.bucket === 'sub'))
        return false;
      if (linesF === 'with' && r.lineCount === 0) return false;
      if (linesF === 'without' && r.lineCount > 0) return false;
      return true;
    });
  }, [mainRows, q, cat, pvp, fc, linesF]);

  const statusForRow = (r: EscandalloRecipeDashboardRow) => {
    if (r.lineCount === 0) return { label: 'Sin ingredientes', className: 'bg-zinc-500' };
    if (r.bucket === 'no_pvp') return { label: 'Sin PVP', className: 'bg-zinc-600' };
    if (r.bucket === 'high') return { label: 'Food cost alto', className: 'bg-red-600' };
    if (r.bucket === 'watch') return { label: 'Atención', className: 'bg-amber-600' };
    if (r.bucket === 'optimal') return { label: 'Activo', className: 'bg-emerald-600' };
    return { label: bucketLabel(r.bucket), className: 'bg-zinc-500' };
  };

  if (!profileReady) {
    return <p className="text-sm text-zinc-600">Cargando sesión…</p>;
  }

  if (!localId || (!supabaseOk && !demoPack)) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Escandallos no disponibles.</p>
      </section>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      <MermasStyleHero
        eyebrow="Escandallos"
        title="Libro de recetas"
        description="Listado ligero de platos de carta. Los números y el cierre mensual siguen en el centro de escandallos."
        compact
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Link
          href="/escandallos"
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-800 shadow-sm ring-1 ring-zinc-100 transition hover:bg-zinc-50"
        >
          Centro de mando
        </Link>
        {!demoPack ? (
          <Link
            href="/escandallos/recetas/nuevo"
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#D32F2F] px-5 text-sm font-black text-white shadow-lg shadow-red-900/20 transition hover:bg-[#B91C1C] sm:max-w-xs"
          >
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            Nueva receta
          </Link>
        ) : null}
        <Link
          href="/escandallos/recetas/bases"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50/80 px-4 text-sm font-bold text-violet-950 ring-1 ring-violet-100 transition hover:bg-violet-100"
        >
          <Layers className="h-4 w-4 shrink-0" aria-hidden />
          Bases y elaborados
        </Link>
      </div>

      {banner ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{banner}</div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm ring-1 ring-zinc-100 sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar plato…"
            className="w-full rounded-xl border border-zinc-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#D32F2F]/20"
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-semibold text-zinc-600">
            Presentación / unidad
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm"
            >
              <option value="__all__">Todas</option>
              {categories
                .filter((c) => c !== '__all__')
                .map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-zinc-600">
            PVP
            <select
              value={pvp}
              onChange={(e) => setPvp(e.target.value as PvpFilter)}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="with">Con PVP</option>
              <option value="without">Sin PVP</option>
            </select>
          </label>
          <label className="block text-xs font-semibold text-zinc-600">
            Food cost
            <select
              value={fc}
              onChange={(e) => setFc(e.target.value as FcFilter)}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="high">Alto (&gt;35 %)</option>
              <option value="normal">Normal / óptimo</option>
            </select>
          </label>
          <label className="block text-xs font-semibold text-zinc-600">
            Ingredientes
            <select
              value={linesF}
              onChange={(e) => setLinesF(e.target.value as LinesFilter)}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="with">Con líneas</option>
              <option value="without">Sin líneas</option>
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/80 py-12 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-zinc-400" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-zinc-700">No hay recetas con estos filtros</p>
          {!demoPack ? (
            <Link
              href="/escandallos/recetas/nuevo"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-bold text-white"
            >
              <Plus className="h-4 w-4" />
              Nueva receta
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => {
            const st = statusForRow(r);
            const margin = r.foodCostPct != null ? Math.round((100 - r.foodCostPct) * 10) / 10 : null;
            return (
              <li
                key={r.id}
                className="flex flex-col rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm ring-1 ring-zinc-100 transition hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-black tracking-tight text-zinc-900">{r.name}</h3>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {r.yieldQty} {r.yieldLabel}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${st.className}`}>
                    {st.label}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-zinc-50 px-2 py-1.5">
                    <dt className="font-semibold text-zinc-500">Coste / ud.</dt>
                    <dd className="font-bold tabular-nums text-zinc-900">{formatMoneyEur(r.costPerYieldEur)}</dd>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-2 py-1.5">
                    <dt className="font-semibold text-zinc-500">PVP</dt>
                    <dd className="font-bold tabular-nums text-zinc-900">
                      {r.saleGrossEur != null ? formatMoneyEur(r.saleGrossEur) : '—'}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-2 py-1.5">
                    <dt className="font-semibold text-zinc-500">Food cost</dt>
                    <dd className="font-bold tabular-nums text-zinc-900">
                      {r.foodCostPct != null ? `${r.foodCostPct.toFixed(1)} %` : '—'}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-2 py-1.5">
                    <dt className="font-semibold text-zinc-500">Margen</dt>
                    <dd className="font-bold tabular-nums text-zinc-900">{margin != null ? `${margin} %` : '—'}</dd>
                  </div>
                </dl>
                {!demoPack ? (
                  <Link
                    href={`/escandallos/recetas/${r.id}/editar`}
                    className="mt-4 block w-full rounded-xl bg-zinc-900 py-2.5 text-center text-sm font-bold text-white transition hover:bg-zinc-800"
                  >
                    Editar
                  </Link>
                ) : (
                  <p className="mt-4 text-center text-xs text-zinc-500">Demo · solo lectura</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
