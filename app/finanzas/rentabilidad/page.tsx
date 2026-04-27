'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, BookOpen, RefreshCw } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getDemoEscandalloPack } from '@/lib/demo-dataset';
import { isDemoMode } from '@/lib/demo-mode';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import {
  buildFamiliaMargenRows,
  buildRentabilidadAlerts,
  buildRentabilidadKpis,
  buildRentabilidadRecipeRows,
  collectIngredientPriceDrifts,
  fetchEscandalloRecipeCategoriasMap,
  type RentabilidadAlert,
  type RentabilidadRecipeAnalisis,
} from '@/lib/finanzas-rentabilidad-escandallo';
import {
  fetchEscandalloLines,
  fetchEscandalloMonthlySales,
  fetchEscandalloRawProductsWithWeightedPurchasePrices,
  fetchEscandalloRecipes,
  fetchProcessedProductsForEscandallo,
  fetchProductsForEscandallo,
  type EscandalloLine,
  type EscandalloProcessedProduct,
  type EscandalloRawProduct,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import { ESCANDALLOS_WEIGHTED_PRICE_WINDOW_DAYS } from '@/lib/escandallos-weighted-purchase-prices';

function priorityClass(p: RentabilidadAlert['priority']): string {
  if (p === 'P1') return 'bg-red-600 text-white';
  if (p === 'P2') return 'bg-amber-500 text-white';
  return 'bg-zinc-500 text-white';
}

function MiniList({
  title,
  rows,
  renderRow,
}: {
  title: string;
  rows: RentabilidadRecipeAnalisis[];
  renderRow: (r: RentabilidadRecipeAnalisis) => React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{title}</p>
      <ul className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <li className="text-sm text-zinc-500">Sin datos suficientes.</li>
        ) : (
          rows.map((r) => (
            <li key={r.recipeId} className="flex flex-col gap-0.5 border-t border-zinc-100 pt-2 first:border-t-0 first:pt-0">
              {renderRow(r)}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export default function FinanzasRentabilidadPage() {
  const { localCode, localName, localId, email, profileReady } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const rentabilidadDataOk = supabaseOk || isDemoMode();

  const [recipes, setRecipes] = useState<EscandalloRecipe[]>([]);
  const [linesByRecipe, setLinesByRecipe] = useState<Record<string, EscandalloLine[]>>({});
  const [rawCatalog, setRawCatalog] = useState<EscandalloRawProduct[]>([]);
  const [rawPmp, setRawPmp] = useState<EscandalloRawProduct[]>([]);
  const [processed, setProcessed] = useState<EscandalloProcessedProduct[]>([]);
  const [qtyByRecipe, setQtyByRecipe] = useState<Record<string, number>>({});
  const [categoriaByRecipeId, setCategoriaByRecipeId] = useState<Map<string, string>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [yearMonth, setYearMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    if (!localId || !rentabilidadDataOk) {
      setRecipes([]);
      setLinesByRecipe({});
      setRawCatalog([]);
      setRawPmp([]);
      setProcessed([]);
      setQtyByRecipe({});
      setCategoriaByRecipeId(new Map());
      setLoading(false);
      return;
    }
    if (isDemoMode() && localId) {
      setLoading(true);
      setBanner(null);
      const pack = getDemoEscandalloPack();
      setRecipes(pack.recipes);
      setLinesByRecipe(pack.linesByRecipe);
      setRawCatalog(pack.rawProducts);
      setRawPmp(pack.rawProducts);
      setProcessed(pack.processed);
      setQtyByRecipe({ 'demo-recipe-1': 420, 'demo-recipe-2': 180 });
      setCategoriaByRecipeId(
        new Map([
          ['demo-recipe-1', 'Platos'],
          ['demo-recipe-2', 'Ensaladas'],
        ]),
      );
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const [rList, rawCat, rawOperational, proc, sales, catMap] = await Promise.all([
        fetchEscandalloRecipes(supabase, localId),
        fetchProductsForEscandallo(supabase, localId),
        fetchEscandalloRawProductsWithWeightedPurchasePrices(supabase, localId),
        fetchProcessedProductsForEscandallo(supabase, localId),
        fetchEscandalloMonthlySales(supabase, localId, yearMonth),
        fetchEscandalloRecipeCategoriasMap(supabase, localId),
      ]);

      const linesEntries = await Promise.all(
        rList.map(async (recipe) => {
          const lines = await fetchEscandalloLines(supabase, localId, recipe.id);
          return [recipe.id, lines] as const;
        }),
      );
      const linesMap: Record<string, EscandalloLine[]> = {};
      for (const [id, lines] of linesEntries) linesMap[id] = lines;

      const qMap: Record<string, number> = {};
      for (const s of sales) {
        qMap[s.recipeId] = (qMap[s.recipeId] ?? 0) + s.quantitySold;
      }

      setRecipes(rList);
      setRawCatalog(rawCat);
      setRawPmp(rawOperational);
      setProcessed(proc);
      setLinesByRecipe(linesMap);
      setQtyByRecipe(qMap);
      setCategoriaByRecipeId(catMap);
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'Error al cargar.');
      setRecipes([]);
      setLinesByRecipe({});
    } finally {
      setLoading(false);
    }
  }, [localId, rentabilidadDataOk, yearMonth]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const analysisRows = useMemo(() => {
    if (recipes.length === 0) return [];
    return buildRentabilidadRecipeRows(
      recipes,
      linesByRecipe,
      new Map(rawCatalog.map((p) => [p.id, p])),
      new Map(rawPmp.map((p) => [p.id, p])),
      new Map(processed.map((p) => [p.id, p])),
      categoriaByRecipeId,
    );
  }, [recipes, linesByRecipe, rawCatalog, rawPmp, processed, categoriaByRecipeId]);

  const drifts = useMemo(
    () => collectIngredientPriceDrifts(linesByRecipe, new Map(rawCatalog.map((p) => [p.id, p])), new Map(rawPmp.map((p) => [p.id, p]))),
    [linesByRecipe, rawCatalog, rawPmp],
  );

  const alerts = useMemo(() => buildRentabilidadAlerts(analysisRows, drifts), [analysisRows, drifts]);
  const kpis = useMemo(() => buildRentabilidadKpis(analysisRows, qtyByRecipe), [analysisRows, qtyByRecipe]);
  const familias = useMemo(() => buildFamiliaMargenRows(analysisRows).slice(0, 8), [analysisRows]);

  const mains = useMemo(() => analysisRows.filter((r) => !r.isSubRecipe && r.lineCount > 0), [analysisRows]);

  const topRentables = useMemo(() => {
    const withM = mains.filter((r) => r.marginRealPct != null);
    return [...withM].sort((a, b) => (b.marginRealPct ?? -999) - (a.marginRealPct ?? -999)).slice(0, 5);
  }, [mains]);

  const menosRentables = useMemo(() => {
    const withM = mains.filter((r) => r.marginRealPct != null);
    return [...withM].sort((a, b) => (a.marginRealPct ?? 999) - (b.marginRealPct ?? 999)).slice(0, 5);
  }, [mains]);

  const mayorDesviacion = useMemo(() => {
    return [...mains].sort((a, b) => b.costDeviationEurPerYield - a.costDeviationEurPerYield).slice(0, 5);
  }, [mains]);

  if (!profileReady) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Cargando…</p>
      </section>
    );
  }
  if (!hasPedidosEntry) return <PedidosPremiaLockedScreen />;
  if (!canUse || !localId || !rentabilidadDataOk) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Finanzas no disponible en esta sesión.</p>
      </section>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <MermasStyleHero
        slim
        eyebrow="Finanzas"
        title="Márgenes y desviaciones"
        description="Rentabilidad operativa por plato: margen sobre PVP neto y diferencia entre coste teórico (ficha proveedor) y coste con PMP reciente."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/escandallos"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800"
        >
          <BookOpen className="h-4 w-4 text-[#D32F2F]" aria-hidden />
          Escandallos y ventas
        </Link>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          Actualizar
        </button>
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <span className="font-semibold">Mes ventas</span>
          <input
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm font-semibold"
          />
        </label>
      </div>

      <div className="rounded-2xl border border-sky-100 bg-sky-50/80 p-4 text-sm text-sky-950 ring-1 ring-sky-100">
        <p className="font-bold">Cómo se calcula (MVP)</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sky-900/90">
          <li>
            <strong>Precio venta</strong>: PVP con IVA de la receta → venta neta por ración (sin IVA) con el tipo configurado
            (por defecto 10 %).
          </li>
          <li>
            <strong>Coste teórico</strong>: suma de líneas del escandallo valoradas al <strong>precio de catálogo</strong> del
            proveedor (ficha).
          </li>
          <li>
            <strong>Coste real (operativo)</strong>: mismas cantidades con <strong>PMP</strong> en ventana de{' '}
            {ESCANDALLOS_WEIGHTED_PRICE_WINDOW_DAYS} días (misma lógica que Escandallos / Pedidos).
          </li>
          <li>
            <strong>Limitación</strong>: no hay líneas de TPV por ticket en esta vista; el mix mensual opcional viene del
            import en Escandallos (<code className="rounded bg-white/80 px-1">escandallo_monthly_sales</code>). Sin unidades
            vendidas, la &quot;pérdida estimada por desviaciones&quot; no aplica.
          </li>
        </ul>
      </div>

      {banner ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{banner}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-600">Cargando análisis…</p>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase text-zinc-500">Margen bruto medio (PMP)</p>
              <p className="mt-2 text-2xl font-black tabular-nums text-zinc-900">
                {kpis.avgMarginRealPct != null ? `${kpis.avgMarginRealPct.toFixed(1)} %` : '—'}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                vs teórico (ficha){' '}
                {kpis.avgMarginTheoreticalPct != null ? `${kpis.avgMarginTheoreticalPct.toFixed(1)} %` : '—'}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase text-zinc-500">Platos con desviación ≥3 %</p>
              <p className="mt-2 text-2xl font-black tabular-nums text-zinc-900">{kpis.productsWithCostDeviation}</p>
              <p className="mt-1 text-xs text-zinc-500">de {kpis.mainRecipesAnalyzed} principales con líneas</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase text-zinc-500">Escandallos “desactualizados”</p>
              <p className="mt-2 text-2xl font-black tabular-nums text-amber-800">{kpis.recipesOutdatedCost}</p>
              <p className="mt-1 text-xs text-zinc-500">coste PMP ≥8 % sobre ficha</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase text-zinc-500">Pérdida estimada (mes)</p>
              <p className="mt-2 text-2xl font-black tabular-nums text-zinc-900">
                {kpis.estimatedMonthlyLossFromDeviationEur != null
                  ? `${kpis.estimatedMonthlyLossFromDeviationEur.toFixed(2)} €`
                  : '—'}
              </p>
              <p className="mt-1 text-xs text-zinc-500">Σ max(0, Δ coste/unidad) × unidades importadas</p>
            </div>
          </section>

          <section className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 shadow-sm ring-1 ring-amber-100">
            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-amber-950">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              Alertas de rentabilidad
            </h2>
            {alerts.length === 0 ? (
              <p className="mt-3 text-sm text-amber-900/90">Sin alertas con los umbrales actuales.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {alerts.slice(0, 12).map((a) => (
                  <li
                    key={a.id}
                    className="rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm"
                  >
                    <span className={`mr-2 inline-flex rounded px-1.5 py-0.5 text-[10px] font-black ${priorityClass(a.priority)}`}>
                      {a.priority}
                    </span>
                    <span className="font-bold">{a.title}</span>
                    <span className="text-zinc-600"> — {a.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <MiniList
              title="Top rentables (margen % neto, PMP)"
              rows={topRentables}
              renderRow={(r) => (
                <>
                  <span className="font-semibold text-zinc-900">{r.name}</span>
                  <span className="text-xs tabular-nums text-emerald-700">
                    {r.marginRealPct != null ? `${r.marginRealPct.toFixed(1)} %` : '—'} margen · food cost{' '}
                    {r.foodCostPctReal != null ? `${r.foodCostPctReal.toFixed(1)} %` : '—'}
                  </span>
                </>
              )}
            />
            <MiniList
              title="Menos rentables"
              rows={menosRentables}
              renderRow={(r) => (
                <>
                  <span className="font-semibold text-zinc-900">{r.name}</span>
                  <span className="text-xs tabular-nums text-red-700">
                    {r.marginRealPct != null ? `${r.marginRealPct.toFixed(1)} %` : '—'} margen · Δ coste{' '}
                    {r.costDeviationPct != null ? `+${r.costDeviationPct.toFixed(1)} %` : '—'}
                  </span>
                </>
              )}
            />
            <MiniList
              title="Mayor desviación €/yield (PMP vs ficha)"
              rows={mayorDesviacion}
              renderRow={(r) => (
                <>
                  <span className="font-semibold text-zinc-900">{r.name}</span>
                  <span className="text-xs tabular-nums text-amber-900">
                    +{r.costDeviationEurPerYield.toFixed(2)} €/ud ·{' '}
                    {r.costDeviationPct != null ? `${r.costDeviationPct.toFixed(1)} %` : '—'}
                  </span>
                </>
              )}
            />
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Familias / categoría (peor margen)</p>
              <ul className="mt-3 space-y-2">
                {familias.length === 0 ? (
                  <li className="text-sm text-zinc-500">Sin categorías en fichas técnicas o sin datos.</li>
                ) : (
                  familias.map((f) => (
                    <li key={f.categoria} className="flex justify-between gap-2 border-t border-zinc-100 pt-2 text-sm first:border-t-0 first:pt-0">
                      <span className="font-medium text-zinc-900">
                        {f.categoria}{' '}
                        <span className="font-normal text-zinc-500">({f.n})</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-zinc-700">
                        {f.avgMarginRealPct != null ? `${f.avgMarginRealPct.toFixed(1)} %` : '—'} margen
                      </span>
                    </li>
                  ))
                )}
              </ul>
              <p className="mt-2 text-[11px] text-zinc-500">
                Categoría desde ficha técnica del escandallo, si está rellena.
              </p>
            </div>
          </div>

          <section className="rounded-2xl border border-zinc-200 bg-zinc-50/50 p-4">
            <h2 className="flex items-center gap-2 text-xs font-black uppercase text-zinc-600">
              <BarChart3 className="h-4 w-4" aria-hidden />
              Artículos que más mueven el coste (ficha vs PMP)
            </h2>
            <ul className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
              {drifts.slice(0, 8).map((d) => (
                <li key={d.supplierProductId} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
                  <span className="font-medium text-zinc-900">{d.label}</span>
                  <span className={`tabular-nums font-semibold ${d.driftPct > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                    {d.driftPct > 0 ? '+' : ''}
                    {d.driftPct.toFixed(1)} %
                  </span>
                </li>
              ))}
              {drifts.length === 0 ? (
                <li className="px-3 py-4 text-sm text-zinc-500">Sin desviaciones relevantes entre ficha y PMP.</li>
              ) : null}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
