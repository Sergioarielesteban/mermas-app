'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  ChefHat,
  ChevronRight,
  FileSpreadsheet,
  LayoutDashboard,
  PieChart as PieChartIcon,
  Receipt,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Upload,
} from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { CHEF_ONE_TAPER_LINE_CLASS } from '@/components/ChefOneGlowLine';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  buildEscandalloDashboardRows,
  bucketLabel,
  computeMonthlyMixFoodCost,
  type EscandalloRecipeDashboardRow,
} from '@/lib/escandallos-analytics';
import {
  downloadSalesTemplateCsv,
  matchSalesImportToRecipes,
  parseSalesImportCsv,
  parseSalesImportExcel,
  type SalesImportMatchedRow,
  type SalesImportRawRow,
} from '@/lib/escandallos-sales-import';
import {
  fetchEscandalloLines,
  fetchEscandalloMonthlySales,
  fetchEscandalloRecipes,
  fetchProcessedProductsForEscandallo,
  fetchProductsForEscandallo,
  upsertEscandalloMonthlySalesBatch,
  type EscandalloLine,
  type EscandalloProcessedProduct,
  type EscandalloRawProduct,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';

const TAPER = `mx-auto w-20 ${CHEF_ONE_TAPER_LINE_CLASS}`;

const BUCKET_COLOR: Record<string, string> = {
  optimal: '#059669',
  watch: '#D97706',
  high: '#DC2626',
  no_pvp: '#71717a',
  no_lines: '#a1a1aa',
  sub: '#6366f1',
};

function parseDecimal(raw: string): number | null {
  const t = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function KpiCard({
  title,
  value,
  hint,
  Icon,
  accent = 'red',
}: {
  title: string;
  value: string;
  hint?: string;
  Icon: LucideIcon;
  accent?: 'red' | 'emerald' | 'amber' | 'zinc' | 'violet';
}) {
  const ring =
    accent === 'emerald'
      ? 'from-emerald-500/20 via-white to-white'
      : accent === 'amber'
        ? 'from-amber-500/20 via-white to-white'
        : accent === 'violet'
          ? 'from-violet-500/20 via-white to-white'
          : accent === 'zinc'
            ? 'from-zinc-400/15 via-white to-white'
            : 'from-[#B91C1C]/18 via-white to-white';
  const iconC =
    accent === 'emerald'
      ? 'text-emerald-600'
      : accent === 'amber'
        ? 'text-amber-600'
        : accent === 'violet'
          ? 'text-violet-600'
          : accent === 'zinc'
            ? 'text-zinc-500'
            : 'text-[#D32F2F]';

  return (
    <div className={`rounded-2xl bg-gradient-to-br p-[1px] shadow-sm ${ring}`}>
      <div className="rounded-2xl bg-white px-4 py-4 ring-1 ring-zinc-200/80">
        <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">
          <Icon className={`h-3.5 w-3.5 ${iconC}`} />
          {title}
        </div>
        <p className="mt-2 text-2xl font-black tabular-nums tracking-tight text-zinc-900">{value}</p>
        {hint ? <p className="mt-1 text-[11px] font-medium leading-snug text-zinc-500">{hint}</p> : null}
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-gradient-to-b from-zinc-50/90 to-white p-4 shadow-sm ring-1 ring-zinc-200/90 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#D32F2F]/10 text-[#B91C1C] ring-1 ring-[#D32F2F]/20">
          <Icon className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold tracking-tight text-zinc-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-zinc-600">{subtitle}</p> : null}
        </div>
      </div>
      <div className={`${TAPER} mt-4`} aria-hidden />
      <div className="mt-4">{children}</div>
    </section>
  );
}

type SortKey = 'name' | 'foodCost' | 'cost' | 'net' | 'gross';

export default function EscandallosPage() {
  const { localId, profileReady } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const [recipes, setRecipes] = useState<EscandalloRecipe[]>([]);
  const [linesByRecipe, setLinesByRecipe] = useState<Record<string, EscandalloLine[]>>({});
  const [rawProducts, setRawProducts] = useState<EscandalloRawProduct[]>([]);
  const [processedProducts, setProcessedProducts] = useState<EscandalloProcessedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('foodCost');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [salesYearMonth, setSalesYearMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [salesQtyDraft, setSalesQtyDraft] = useState<Record<string, string>>({});
  const [salesBusy, setSalesBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<SalesImportMatchedRow[] | null>(null);

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
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
        fetchProductsForEscandallo(supabase, localId),
        fetchProcessedProductsForEscandallo(supabase, localId),
      ]);
      setRecipes(r);
      setRawProducts(raw);
      setProcessedProducts(processed);
      const linesEntries = await Promise.all(
        r.map(async (recipe) => {
          const lines = await fetchEscandalloLines(supabase, localId, recipe.id);
          return [recipe.id, lines] as const;
        }),
      );
      setLinesByRecipe(Object.fromEntries(linesEntries));
    } catch (e: unknown) {
      setBanner(
        e instanceof Error ? e.message : 'No se pudieron cargar datos. Revisa conexión y migraciones de escandallos.',
      );
      setRecipes([]);
      setLinesByRecipe({});
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

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
  const subRows = useMemo(() => rows.filter((r) => r.isSubRecipe), [rows]);

  const kpis = useMemo(() => {
    const withFc = mainRows.filter((r) => r.foodCostPct != null);
    const avgFc =
      withFc.length > 0
        ? Math.round((withFc.reduce((a, r) => a + (r.foodCostPct ?? 0), 0) / withFc.length) * 10) / 10
        : null;
    const noPvp = mainRows.filter((r) => r.bucket === 'no_pvp').length;
    const noLines = mainRows.filter((r) => r.bucket === 'no_lines').length;
    const withCost = mainRows.filter((r) => r.lineCount > 0);
    const avgCost =
      withCost.length > 0
        ? Math.round((withCost.reduce((a, r) => a + r.costPerYieldEur, 0) / withCost.length) * 100) / 100
        : null;
    const optimal = mainRows.filter((r) => r.bucket === 'optimal').length;
    const high = mainRows.filter((r) => r.bucket === 'high').length;
    return {
      mainCount: mainRows.length,
      subCount: subRows.length,
      avgFc,
      noPvp,
      noLines,
      avgCost,
      optimal,
      high,
      withFcCount: withFc.length,
    };
  }, [mainRows, subRows]);

  const barChartData = useMemo(() => {
    const data = mainRows
      .filter((r) => r.foodCostPct != null)
      .map((r) => ({
        name: r.name.length > 22 ? `${r.name.slice(0, 20)}…` : r.name,
        fullName: r.name,
        pct: Math.round((r.foodCostPct ?? 0) * 10) / 10,
        fill:
          (r.foodCostPct ?? 0) < 28 ? BUCKET_COLOR.optimal : (r.foodCostPct ?? 0) <= 35 ? BUCKET_COLOR.watch : BUCKET_COLOR.high,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 16);
    return data;
  }, [mainRows]);

  const pieData = useMemo(() => {
    const keys: EscandalloRecipeDashboardRow['bucket'][] = ['optimal', 'watch', 'high', 'no_pvp', 'no_lines'];
    return keys
      .map((k) => {
        const n = mainRows.filter((r) => r.bucket === k).length;
        return { name: bucketLabel(k), key: k, value: n, fill: BUCKET_COLOR[k] };
      })
      .filter((d) => d.value > 0);
  }, [mainRows]);

  const sortedTable = useMemo(() => {
    const list = [...mainRows];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return dir * a.name.localeCompare(b.name, 'es');
        case 'foodCost': {
          const av = a.foodCostPct ?? -1;
          const bv = b.foodCostPct ?? -1;
          return dir * (av - bv);
        }
        case 'cost':
          return dir * (a.costPerYieldEur - b.costPerYieldEur);
        case 'net':
          return dir * ((a.saleNetEur ?? -1) - (b.saleNetEur ?? -1));
        case 'gross':
          return dir * ((a.saleGrossEur ?? -1) - (b.saleGrossEur ?? -1));
        default:
          return 0;
      }
    });
    return list;
  }, [mainRows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  useEffect(() => {
    if (!localId || !supabaseOk || loading) return;
    const supabase = getSupabaseClient()!;
    let cancel = false;
    void (async () => {
      if (mainRows.length === 0) {
        setSalesQtyDraft({});
        return;
      }
      try {
        const s = await fetchEscandalloMonthlySales(supabase, localId, salesYearMonth);
        if (cancel) return;
        const next: Record<string, string> = {};
        for (const r of mainRows) {
          const hit = s.find((x) => x.recipeId === r.id);
          next[r.id] = hit ? String(hit.quantitySold) : '';
        }
        setSalesQtyDraft(next);
      } catch {
        if (!cancel) {
          setSalesQtyDraft((prev) => {
            const next = { ...prev };
            for (const r of mainRows) {
              if (!(r.id in next)) next[r.id] = '';
            }
            return next;
          });
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [localId, supabaseOk, salesYearMonth, loading, mainRows]);

  const quantitySoldByRecipe = useMemo(() => {
    const o: Record<string, number> = {};
    for (const r of mainRows) {
      const n = parseDecimal(salesQtyDraft[r.id] ?? '');
      if (n != null && n > 0) o[r.id] = n;
    }
    return o;
  }, [mainRows, salesQtyDraft]);

  const mixMetrics = useMemo(
    () => computeMonthlyMixFoodCost(mainRows, quantitySoldByRecipe, kpis.avgFc),
    [mainRows, quantitySoldByRecipe, kpis.avgFc],
  );

  const compareTheoryReal = useMemo(() => {
    const t = mixMetrics.theoreticalAvgFoodCostPct;
    const r = mixMetrics.realFoodCostPct;
    if (t == null && r == null) return [];
    return [
      { name: 'Teórico (media carta)', pct: t ?? 0, fill: '#52525b' },
      { name: 'Real (mix del mes)', pct: r ?? 0, fill: '#D32F2F' },
    ];
  }, [mixMetrics]);

  const handleSaveMonthlySales = async () => {
    if (!localId || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    setSalesBusy(true);
    setBanner(null);
    try {
      const rows = mainRows.map((r) => ({
        recipeId: r.id,
        quantitySold: Math.max(0, parseDecimal(salesQtyDraft[r.id] ?? '') ?? 0),
      }));
      await upsertEscandalloMonthlySalesBatch(supabase, localId, salesYearMonth, rows);
    } catch (e: unknown) {
      setBanner(
        e instanceof Error
          ? e.message
          : 'No se guardaron ventas. ¿Ejecutaste supabase-escandallos-migration-monthly-sales.sql?',
      );
    } finally {
      setSalesBusy(false);
    }
  };

  const handleDownloadSalesTemplate = useCallback(() => {
    downloadSalesTemplateCsv(
      mainRows.map((r) => ({ id: r.id, name: r.name, posArticleCode: r.posArticleCode })),
      salesYearMonth,
    );
  }, [mainRows, salesYearMonth]);

  const handlePickImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || mainRows.length === 0) return;
    setImportError(null);
    setImportPreview(null);
    try {
      const low = f.name.toLowerCase();
      let raw: SalesImportRawRow[] = [];
      if (low.endsWith('.csv')) {
        const text = await f.text();
        const parsed = parseSalesImportCsv(text);
        if (parsed.error) {
          setImportError(parsed.error);
          return;
        }
        raw = parsed.rows;
      } else if (low.endsWith('.xlsx') || low.endsWith('.xls')) {
        const buf = await f.arrayBuffer();
        const parsed = await parseSalesImportExcel(buf);
        if (parsed.error && parsed.rows.length === 0) {
          setImportError(parsed.error);
          return;
        }
        raw = parsed.rows;
      } else {
        setImportError('Usa .csv, .xlsx o .xls.');
        return;
      }
      if (raw.length === 0) {
        setImportError('No hay filas con cantidad y plato.');
        return;
      }
      const matched = matchSalesImportToRecipes(
        raw,
        mainRows.map((r) => ({ id: r.id, name: r.name, posArticleCode: r.posArticleCode })),
      );
      setImportPreview(matched);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
    }
  };

  const handleApplyImport = () => {
    if (!importPreview) return;
    setSalesQtyDraft((prev) => {
      const next = { ...prev };
      for (const row of importPreview) {
        if (row.status === 'ok' && row.matchedRecipeId) {
          next[row.matchedRecipeId] = String(row.qty);
        }
      }
      return next;
    });
    setImportPreview(null);
    setImportError(null);
    setBanner('Importación aplicada. Revisa la tabla y pulsa «Guardar ventas del mes».');
    window.setTimeout(() => setBanner(null), 6000);
  };

  if (!profileReady) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Cargando sesión…</p>
      </section>
    );
  }

  if (!localId || !supabaseOk) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-semibold text-zinc-900">Escandallos no disponibles</p>
        <p className="pt-1 text-sm text-zinc-600">Inicia sesión con un local configurado en Supabase.</p>
      </section>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      <MermasStyleHero
        eyebrow="Inteligencia de carta"
        title="Escandallos"
        description="Centro de mando: costes, food cost por plato y cierre mensual con ventas reales (teórico vs mix del mes)."
        compact
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between sm:gap-4">
        <Link
          href="/escandallos/recetas"
          className="group relative flex min-h-[5.75rem] flex-1 items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[#B91C1C] via-[#C62828] to-[#7F1D1D] px-5 py-4 text-white shadow-lg shadow-red-900/25 ring-2 ring-white/20 transition hover:shadow-xl hover:ring-white/35 active:scale-[0.99] sm:min-w-[min(100%,22rem)] sm:max-w-xl"
        >
          <span
            className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/10 blur-2xl"
            aria-hidden
          />
          <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 ring-2 ring-white/25 backdrop-blur-sm">
            <BookOpen className="h-7 w-7 text-white" strokeWidth={2.25} aria-hidden />
          </span>
          <span className="relative min-w-0 flex-1 text-left">
            <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-white/80">Libro de recetas</span>
            <span className="mt-0.5 block text-lg font-black leading-tight tracking-tight">Crear y editar recetas</span>
            <span className="mt-1 block text-xs font-medium leading-snug text-white/85">
              Platos de carta, ingredientes, PVP y food cost.
            </span>
          </span>
          <ChevronRight
            className="relative h-6 w-6 shrink-0 text-white/90 transition group-hover:translate-x-0.5"
            strokeWidth={2.5}
            aria-hidden
          />
        </Link>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-[3.25rem] items-center justify-center gap-2 self-stretch rounded-2xl bg-zinc-950 px-5 text-sm font-semibold text-white shadow-md ring-1 ring-zinc-800/80 transition hover:bg-zinc-900 disabled:opacity-50 sm:min-w-[11rem] sm:self-auto"
        >
          <RefreshCw className={`h-4 w-4 shrink-0 ${loading ? 'animate-spin' : ''}`} />
          Actualizar datos
        </button>
      </div>

      {banner ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-100">
          {banner}
        </div>
      ) : null}

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando escandallos…</p>
      ) : mainRows.length === 0 && subRows.length === 0 ? (
        <div className="rounded-3xl bg-gradient-to-b from-zinc-50 to-white py-10 text-center ring-1 ring-zinc-200">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#D32F2F]/10 text-[#B91C1C] ring-1 ring-[#D32F2F]/20">
            <BookOpen className="h-8 w-8" strokeWidth={2} aria-hidden />
          </div>
          <p className="mt-4 text-base font-bold text-zinc-900">Aún no hay recetas</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-600">
            Abre el libro de recetas para dar de alta platos de carta y sus ingredientes.
          </p>
          <Link
            href="/escandallos/recetas"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#D32F2F] px-5 py-3 text-sm font-bold text-white shadow-md ring-1 ring-red-900/20 transition hover:bg-[#B91C1C]"
          >
            <BookOpen className="h-4 w-4" aria-hidden />
            Ir al libro de recetas
            <ChevronRight className="h-4 w-4 opacity-90" aria-hidden />
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              title="Platos en carta"
              value={String(kpis.mainCount)}
              hint={`${kpis.optimal} óptimo · ${kpis.high} food cost alto`}
              Icon={ChefHat}
              accent="red"
            />
            <KpiCard
              title="Food cost medio"
              value={kpis.avgFc != null ? `${kpis.avgFc} %` : '—'}
              hint={
                kpis.withFcCount > 0
                  ? `Sobre ${kpis.withFcCount} platos con PVP`
                  : 'Indica PVP en cada plato'
              }
              Icon={kpis.avgFc != null && kpis.avgFc <= 30 ? TrendingDown : TrendingUp}
              accent={kpis.avgFc != null && kpis.avgFc <= 30 ? 'emerald' : 'amber'}
            />
            <KpiCard
              title="Coste medio / ración"
              value={kpis.avgCost != null ? `${kpis.avgCost.toFixed(2)} €` : '—'}
              hint="Platos con al menos un ingrediente"
              Icon={Calculator}
              accent="zinc"
            />
            <KpiCard
              title="Bases (sub-recetas)"
              value={String(kpis.subCount)}
              hint={`${kpis.noPvp} platos sin PVP · ${kpis.noLines} sin ingredientes`}
              Icon={LayoutDashboard}
              accent="violet"
            />
          </div>

          {(kpis.noPvp > 0 || kpis.noLines > 0) && (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-950 ring-1 ring-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <span className="font-semibold">Atención:</span> {kpis.noPvp} plato{kpis.noPvp !== 1 ? 's' : ''} sin
                precio de venta y {kpis.noLines} sin ingredientes. El food cost y los gráficos quedarán incompletos hasta
                completarlos.
              </p>
            </div>
          )}

          <Section
            title="Cierre mensual · ventas por plato"
            subtitle="Ventas del mes por receta."
            icon={Receipt}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Mes contable</label>
                <input
                  type="month"
                  value={salesYearMonth}
                  onChange={(e) => setSalesYearMonth(e.target.value)}
                  className="mt-1 block rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm"
                />
              </div>
              <button
                type="button"
                disabled={salesBusy || mainRows.length === 0}
                onClick={() => void handleSaveMonthlySales()}
                className="h-10 rounded-xl bg-[#D32F2F] px-5 text-sm font-bold text-white shadow-md shadow-[#D32F2F]/18 disabled:opacity-50"
              >
                {salesBusy ? 'Guardando…' : 'Guardar ventas del mes'}
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-dashed border-zinc-300/90 bg-zinc-50/70 p-4 ring-1 ring-zinc-100">
              <div className="flex flex-wrap items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-[#B91C1C]" aria-hidden />
                <p className="text-sm font-bold text-zinc-900">Importar Excel / CSV</p>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  disabled={mainRows.length === 0}
                  onClick={handleDownloadSalesTemplate}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-800 shadow-sm disabled:opacity-50"
                >
                  <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
                  Descargar plantilla CSV
                </button>
                <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-50">
                  <Upload className="h-4 w-4 shrink-0" aria-hidden />
                  Subir archivo
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="sr-only"
                    disabled={mainRows.length === 0}
                    onChange={(ev) => void handlePickImportFile(ev)}
                  />
                </label>
              </div>
              {importError ? <p className="mt-3 text-sm font-medium text-red-700">{importError}</p> : null}
              {importPreview && importPreview.length > 0 ? (
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Vista previa · {importPreview.filter((r) => r.status === 'ok').length} aplicables ·{' '}
                    {importPreview.filter((r) => r.status === 'no_match').length} sin coincidencia
                  </p>
                  <div className="max-h-52 overflow-auto rounded-xl ring-1 ring-zinc-200">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-zinc-100">
                        <tr className="text-[10px] font-extrabold uppercase text-zinc-600">
                          <th className="px-2 py-2">Fila</th>
                          <th className="px-2 py-2">En archivo</th>
                          <th className="px-2 py-2">Ud.</th>
                          <th className="px-2 py-2">Receta</th>
                          <th className="px-2 py-2">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.map((row) => (
                          <tr key={row.sourceLine} className="border-t border-zinc-100">
                            <td className="px-2 py-1.5 tabular-nums text-zinc-500">{row.sourceLine}</td>
                            <td className="max-w-[140px] truncate px-2 py-1.5 text-zinc-800" title={row.rawLabel}>
                              {row.rawLabel || '—'}
                            </td>
                            <td className="px-2 py-1.5 tabular-nums">{row.qty}</td>
                            <td className="max-w-[120px] truncate px-2 py-1.5 text-zinc-700" title={row.matchedRecipeName ?? ''}>
                              {row.matchedRecipeName ?? '—'}
                            </td>
                            <td className="px-2 py-1.5">
                              {row.status === 'ok' ? (
                                <span className="font-semibold text-emerald-700">Ok</span>
                              ) : row.status === 'no_match' ? (
                                <span className="font-semibold text-red-600">Sin match</span>
                              ) : (
                                <span className="text-zinc-400">{row.status}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleApplyImport}
                      disabled={!importPreview.some((r) => r.status === 'ok')}
                      className="rounded-xl bg-[#D32F2F] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      Aplicar a la tabla
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImportPreview(null);
                        setImportError(null);
                      }}
                      className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700"
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {mixMetrics.totalUnitsSold > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-zinc-900 px-4 py-3 text-white ring-1 ring-zinc-800">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Food cost teórico</p>
                  <p className="mt-1 text-2xl font-black tabular-nums">
                    {mixMetrics.theoreticalAvgFoodCostPct != null
                      ? `${mixMetrics.theoreticalAvgFoodCostPct} %`
                      : '—'}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-400">Media simple de platos con PVP</p>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-[#B91C1C] to-[#7f1d1d] px-4 py-3 text-white shadow-lg shadow-[#B91C1C]/22">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">Food cost real (mix)</p>
                  <p className="mt-1 text-2xl font-black tabular-nums">
                    {mixMetrics.realFoodCostPct != null ? `${mixMetrics.realFoodCostPct} %` : '—'}
                  </p>
                  <p className="mt-1 text-[11px] text-white/85">
                    Σ coste / Σ venta neta · {mixMetrics.recipesInMix} plato{mixMetrics.recipesInMix !== 1 ? 's' : ''} con
                    ventas
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 ring-1 ring-zinc-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Diferencia</p>
                  <p
                    className={`mt-1 text-2xl font-black tabular-nums ${
                      mixMetrics.deltaVsTheoreticalPct == null
                        ? 'text-zinc-400'
                        : mixMetrics.deltaVsTheoreticalPct > 0
                          ? 'text-red-600'
                          : 'text-emerald-600'
                    }`}
                  >
                    {mixMetrics.deltaVsTheoreticalPct != null
                      ? `${mixMetrics.deltaVsTheoreticalPct > 0 ? '+' : ''}${mixMetrics.deltaVsTheoreticalPct} pp`
                      : '—'}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">Real menos teórico (puntos porcentuales)</p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-600">
                Introduce cantidades en la tabla inferior. Hace falta PVP en cada plato para cerrar el food cost real del
                mix.
              </p>
            )}

            {mixMetrics.skippedNoPvpUnits > 0 ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
                {mixMetrics.skippedNoPvpUnits} unidades en platos sin PVP no entran en la venta neta del cierre:{' '}
                {mixMetrics.skippedNoPvpRecipeNames.slice(0, 5).join(', ')}
                {mixMetrics.skippedNoPvpRecipeNames.length > 5 ? '…' : ''}.
              </div>
            ) : null}

            {compareTheoryReal.some((d) => d.pct > 0) && mixMetrics.totalUnitsSold > 0 ? (
              <div className="mt-5 h-44 w-full min-h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={compareTheoryReal} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} unit=" %" domain={[0, 'auto']} />
                    <Tooltip
                      formatter={(value) => [
                        value != null && value !== '' ? `${Number(value)} %` : '—',
                        'Food cost',
                      ]}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e4e4e7' }}
                    />
                    <Bar dataKey="pct" radius={[6, 6, 0, 0]} maxBarSize={52}>
                      {compareTheoryReal.map((entry, i) => (
                        <Cell key={`${entry.name}-${i}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : null}

            {mainRows.length > 0 ? (
              <div className="mt-5 overflow-x-auto rounded-2xl ring-1 ring-zinc-200">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-100/90 text-[10px] font-extrabold uppercase tracking-wider text-zinc-600">
                      <th className="px-3 py-2.5">Plato</th>
                      <th className="px-3 py-2.5">Ud. vendidas</th>
                      <th className="px-3 py-2.5">€ coste / ud.</th>
                      <th className="px-3 py-2.5">€ neto / ud.</th>
                      <th className="px-3 py-2.5">Ext. coste</th>
                      <th className="px-3 py-2.5">Ext. neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mainRows
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
                      .map((r) => {
                        const q = parseDecimal(salesQtyDraft[r.id] ?? '') ?? 0;
                        const extCost = Math.round(q * r.costPerYieldEur * 100) / 100;
                        const extNet =
                          r.saleNetEur != null ? Math.round(q * r.saleNetEur * 100) / 100 : null;
                        return (
                          <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50/80">
                            <td className="px-3 py-2 font-medium text-zinc-900">{r.name}</td>
                            <td className="px-3 py-2">
                              <input
                                value={salesQtyDraft[r.id] ?? ''}
                                onChange={(e) =>
                                  setSalesQtyDraft((prev) => ({ ...prev, [r.id]: e.target.value }))
                                }
                                className="w-24 rounded-lg border border-zinc-200 px-2 py-1 text-sm tabular-nums"
                                inputMode="decimal"
                                placeholder="0"
                              />
                            </td>
                            <td className="px-3 py-2 tabular-nums text-zinc-700">
                              {r.costPerYieldEur.toFixed(2)} €
                            </td>
                            <td className="px-3 py-2 tabular-nums text-zinc-700">
                              {r.saleNetEur != null ? `${r.saleNetEur.toFixed(2)} €` : '—'}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-zinc-800">{extCost.toFixed(2)} €</td>
                            <td className="px-3 py-2 tabular-nums text-zinc-800">
                              {extNet != null ? `${extNet.toFixed(2)} €` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-zinc-50 font-bold text-zinc-900">
                      <td className="px-3 py-2" colSpan={4}>
                        Totales mix (según cantidades)
                      </td>
                      <td className="px-3 py-2 tabular-nums">{mixMetrics.totalCostEur.toFixed(2)} €</td>
                      <td className="px-3 py-2 tabular-nums">
                        {mixMetrics.totalNetRevenueEur > 0 ? `${mixMetrics.totalNetRevenueEur.toFixed(2)} €` : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : null}
          </Section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Section
              title="Food cost por plato"
              subtitle="Ordenado de mayor a menor. Colores: óptimo, atención, alto."
              icon={LayoutDashboard}
            >
              {barChartData.length === 0 ? (
                <p className="text-sm text-zinc-500">Añade PVP e ingredientes para ver el ranking.</p>
              ) : (
                <div className="h-[min(28rem,70vh)] w-full min-h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={barChartData} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} unit=" %" domain={[0, 'auto']} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={108}
                        tick={{ fontSize: 10 }}
                        interval={0}
                      />
                      <Tooltip
                        formatter={(value) => [
                          value != null && value !== '' ? `${Number(value)} %` : '—',
                          'Food cost',
                        ]}
                        labelFormatter={(_, payload) =>
                          payload?.[0]?.payload?.fullName ? String(payload[0].payload.fullName) : ''
                        }
                        contentStyle={{ borderRadius: 12, border: '1px solid #e4e4e7' }}
                      />
                      <Bar dataKey="pct" radius={[0, 6, 6, 0]} maxBarSize={22}>
                        {barChartData.map((_, i) => (
                          <Cell key={i} fill={barChartData[i].fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Section>

            <Section
              title="Distribución de platos"
              subtitle="Cómo está la carta respecto al food cost y datos faltantes."
              icon={PieChartIcon}
            >
              {pieData.length === 0 ? (
                <p className="text-sm text-zinc-500">Sin datos para el reparto.</p>
              ) : (
                <div className="h-[min(22rem,55vh)] w-full min-h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={84}
                        paddingAngle={2}
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} stroke="#fff" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [value != null ? Number(value) : '—', 'Platos']}
                        contentStyle={{ borderRadius: 12, border: '1px solid #e4e4e7' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              <ul className="mt-2 flex flex-wrap justify-center gap-2 text-[11px] font-semibold">
                {pieData.map((d) => (
                  <li
                    key={d.key}
                    className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 ring-1 ring-zinc-200/80"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: d.fill }} />
                    {d.name}: {d.value}
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <Section
            title="Tabla maestra de platos"
            subtitle="Coste por unidad de rendimiento, PVP bruto y neto, food cost y margen bruta aproximada (100 % − food cost)."
            icon={Calculator}
          >
            <div className="overflow-x-auto rounded-2xl ring-1 ring-zinc-200">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-100/80 text-[10px] font-extrabold uppercase tracking-wider text-zinc-600">
                    <th className="px-3 py-2.5">
                      <button type="button" onClick={() => toggleSort('name')} className="font-extrabold text-zinc-700">
                        Plato {sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th className="px-3 py-2.5">
                      <button type="button" onClick={() => toggleSort('cost')} className="font-extrabold text-zinc-700">
                        Coste / ud. {sortKey === 'cost' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th className="px-3 py-2.5">
                      <button type="button" onClick={() => toggleSort('gross')} className="font-extrabold text-zinc-700">
                        PVP IVA inc. {sortKey === 'gross' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th className="px-3 py-2.5">
                      <button type="button" onClick={() => toggleSort('net')} className="font-extrabold text-zinc-700">
                        Neto {sortKey === 'net' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggleSort('foodCost')}
                        className="font-extrabold text-zinc-700"
                      >
                        Food cost {sortKey === 'foodCost' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th className="px-3 py-2.5">Margen*</th>
                    <th className="px-3 py-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTable.map((r) => {
                    const margin =
                      r.foodCostPct != null ? Math.round((100 - r.foodCostPct) * 10) / 10 : null;
                    return (
                      <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50/80">
                        <td className="px-3 py-2.5 font-semibold text-zinc-900">
                          {r.name}
                          <span className="ml-1 text-[10px] font-normal text-zinc-500">
                            ({r.yieldQty} {r.yieldLabel})
                          </span>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-zinc-800">{r.costPerYieldEur.toFixed(2)} €</td>
                        <td className="px-3 py-2.5 tabular-nums text-zinc-800">
                          {r.saleGrossEur != null ? `${r.saleGrossEur.toFixed(2)} €` : '—'}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-zinc-800">
                          {r.saleNetEur != null ? `${r.saleNetEur.toFixed(2)} €` : '—'}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums font-semibold">
                          {r.foodCostPct != null ? (
                            <span
                              className={
                                r.foodCostPct < 28
                                  ? 'text-emerald-700'
                                  : r.foodCostPct <= 35
                                    ? 'text-amber-700'
                                    : 'text-red-700'
                              }
                            >
                              {r.foodCostPct.toFixed(1)} %
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-zinc-700">
                          {margin != null ? `${margin} %` : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                            style={{ background: BUCKET_COLOR[r.bucket] ?? '#71717a' }}
                          >
                            {bucketLabel(r.bucket)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              * Margen aproximado solo sobre coste de ingredientes (sin mano de obra ni otros costes fijos).
            </p>
          </Section>

          {subRows.length > 0 ? (
            <Section
              title="Bases y sub-recetas"
              subtitle="Coste total del batch y coste por unidad de rendimiento. Usa estas bases como ingrediente en los platos."
              icon={ChefHat}
            >
              <div className="overflow-x-auto rounded-2xl ring-1 ring-zinc-200">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-violet-50/80 text-[10px] font-extrabold uppercase tracking-wider text-violet-900/80">
                      <th className="px-3 py-2.5">Base</th>
                      <th className="px-3 py-2.5">Rendimiento</th>
                      <th className="px-3 py-2.5">Líneas</th>
                      <th className="px-3 py-2.5">Coste batch</th>
                      <th className="px-3 py-2.5">€ / ud.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subRows
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
                      .map((r) => (
                        <tr key={r.id} className="border-b border-zinc-100 hover:bg-violet-50/40">
                          <td className="px-3 py-2.5 font-semibold text-zinc-900">{r.name}</td>
                          <td className="px-3 py-2.5 text-zinc-700">
                            {r.yieldQty} {r.yieldLabel}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-zinc-700">{r.lineCount}</td>
                          <td className="px-3 py-2.5 tabular-nums text-zinc-800">{r.totalCostEur.toFixed(2)} €</td>
                          <td className="px-3 py-2.5 tabular-nums font-semibold text-zinc-900">
                            {r.costPerYieldEur.toFixed(2)} €
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}
