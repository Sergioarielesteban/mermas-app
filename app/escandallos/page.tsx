'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Calculator,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Eye,
  MoreHorizontal,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Upload,
  UtensilsCrossed,
} from 'lucide-react';
import {
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
} from 'recharts';
import { useAuth } from '@/components/AuthProvider';
import EscandalloQuickCalculatorModal from '@/components/escandallos/EscandalloQuickCalculatorModal';
import { isDemoMode } from '@/lib/demo-mode';
import { getDemoEscandalloPack } from '@/lib/demo-dataset';
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
  fetchEscandalloRawProductsWithWeightedPurchasePrices,
  fetchProcessedProductsForEscandallo,
  upsertEscandalloMonthlySalesBatch,
  type EscandalloLine,
  type EscandalloProcessedProduct,
  type EscandalloRawProduct,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import { formatMoneyEur } from '@/lib/money-format';

const BUCKET_COLOR: Record<string, string> = {
  optimal: '#16a34a',
  watch: '#d97706',
  high: '#D32F2F',
  no_pvp: '#d97706',
  no_lines: '#D32F2F',
  sub: '#16a34a',
};

type RecipeFilter = 'all' | 'plates' | 'bases' | 'high' | 'incomplete';

function parseDecimal(raw: string): number | null {
  const t = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function formatMargin(foodCostPct: number | null) {
  return foodCostPct != null ? `${Math.round((100 - foodCostPct) * 10) / 10} %` : '—';
}

function statusBadgeLabel(bucket: EscandalloRecipeDashboardRow['bucket']): string {
  switch (bucket) {
    case 'optimal':
      return 'OK';
    case 'watch':
      return 'ATENCIÓN';
    case 'high':
      return 'ALTO';
    case 'no_pvp':
      return 'SIN PVP';
    case 'no_lines':
      return 'SIN ING.';
    case 'sub':
      return 'BASE';
    default:
      return bucketLabel(bucket);
  }
}

function statusBadgeTone(bucket: EscandalloRecipeDashboardRow['bucket']): 'neutral' | 'terracotta' | 'olive' | 'amber' | 'red' {
  if (bucket === 'high' || bucket === 'no_lines' || bucket === 'watch' || bucket === 'no_pvp') return 'red';
  if (bucket === 'optimal' || bucket === 'sub') return 'olive';
  return 'neutral';
}

function formatRecipeUpdatedLabel(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diffDays <= 0) return 'hoy';
  if (diffDays === 1) return 'ayer';
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function foodCostValueClass(pct: number | null): string {
  if (pct == null) return 'text-[#7E7468]';
  if (pct > 30) return 'text-[#D32F2F]';
  return 'text-emerald-700';
}

function marginValueClass(pct: number | null): string {
  if (pct == null) return 'text-[#0A0908]';
  if (pct <= 30) return 'text-emerald-700';
  return 'text-[#0A0908]';
}

function accentClass(tone: 'terracotta' | 'olive' | 'amber' | 'red' | 'neutral') {
  switch (tone) {
    case 'olive':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
    case 'amber':
    case 'red':
    case 'terracotta':
      return 'bg-[#D32F2F]/10 text-[#B91C1C] ring-[#D32F2F]/15';
    default:
      return 'bg-[#F7F3EE] text-[#7E7468] ring-[rgba(10,9,8,0.06)]';
  }
}

function MiniCard({
  title,
  value,
  hint,
  Icon,
  accent,
  compact = false,
}: {
  title: string;
  value: string;
  hint?: string;
  Icon: LucideIcon;
  accent: 'red' | 'emerald' | 'amber' | 'zinc' | 'olive';
  compact?: boolean;
}) {
  const iconClass =
    accent === 'emerald'
      ? 'text-emerald-700 bg-emerald-50 ring-emerald-100'
      : accent === 'amber'
        ? 'text-amber-700 bg-amber-50 ring-amber-100'
        : accent === 'olive'
          ? 'text-zinc-700 bg-zinc-100 ring-zinc-200'
          : accent === 'zinc'
            ? 'text-zinc-700 bg-zinc-100 ring-zinc-200'
            : 'text-[#B91C1C] bg-[#D32F2F]/10 ring-[#D32F2F]/15';
  return (
    <div
      className={[
        'bg-white shadow-sm ring-1 ring-zinc-200/80',
        compact ? 'rounded-xl p-1.5' : 'rounded-[1.35rem] p-2.5',
      ].join(' ')}
    >
      <div
        className={[
          `grid place-items-center ring-1 ${iconClass}`,
          compact ? 'h-[1.35rem] w-[1.35rem] rounded-lg' : 'h-8 w-8 rounded-2xl',
        ].join(' ')}
      >
        <Icon className={compact ? 'h-3 w-3' : 'h-4 w-4'} strokeWidth={2.2} />
      </div>
      <p
        className={[
          'font-bold uppercase text-zinc-500',
          compact ? 'mt-1 text-[7px] tracking-[0.1em]' : 'mt-1.5 text-[10px] tracking-[0.14em]',
        ].join(' ')}
      >
        {title}
      </p>
      <p
        className={[
          'font-black tabular-nums tracking-tight text-zinc-950',
          compact ? 'mt-0.5 text-[1.1rem] leading-none' : 'mt-0.5 text-[1.55rem]',
        ].join(' ')}
      >
        {value}
      </p>
      {hint ? (
        <p className={['leading-snug text-[#7E7468]', compact ? 'mt-0.5 text-[7px]' : 'mt-0.5 text-[10px]'].join(' ')}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Badge({
  children,
  tone = 'neutral',
  dense = false,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'terracotta' | 'olive' | 'amber' | 'red';
  dense?: boolean;
}) {
  return (
    <span
      className={[
        'inline-flex shrink-0 rounded-full font-bold uppercase ring-1',
        dense ? 'px-1.5 py-0.5 text-[7px] tracking-[0.1em]' : 'px-2.5 py-1 text-[10px] tracking-[0.12em]',
        accentClass(tone),
      ].join(' ')}
    >
      {children}
    </span>
  );
}

function SectionHeader({
  title,
  icon: Icon,
  open,
  onToggle,
  accent,
  compact = false,
}: {
  title: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
  accent: 'red' | 'emerald' | 'amber' | 'zinc' | 'olive';
  compact?: boolean;
}) {
  const iconClass =
    accent === 'emerald'
      ? 'text-emerald-700 bg-emerald-50 ring-emerald-100'
      : accent === 'amber'
        ? 'text-[#B91C1C] bg-[#D32F2F]/10 ring-[#D32F2F]/15'
        : accent === 'olive'
          ? 'text-emerald-700 bg-emerald-50 ring-emerald-100'
          : accent === 'zinc'
            ? 'text-[#7E7468] bg-[#F7F3EE] ring-[rgba(10,9,8,0.06)]'
            : 'text-[#B91C1C] bg-[#D32F2F]/10 ring-[#D32F2F]/15';
  if (compact) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full min-h-[52px] max-h-[68px] items-center gap-2.5 py-1 text-left"
      >
        <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ring-1 ${iconClass}`}>
          <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
        </div>
        <span className="min-w-0 flex-1 truncate font-[Cormorant_Garamond] text-[17px] font-normal leading-none text-[#0A0908]">
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#7E7468] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-3 px-1 py-1 text-left"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1 ${iconClass}`}>
          <Icon className="h-4 w-4" strokeWidth={2.2} />
        </div>
        <p className="min-w-0 truncate text-[1.05rem] font-black leading-tight text-zinc-950">{title}</p>
      </div>
      <span className="grid h-6 w-6 shrink-0 place-items-center text-zinc-400">
        <ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} />
      </span>
    </button>
  );
}

function RecipeMetric({
  label,
  value,
  valueClassName = 'text-[#0A0908]',
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 px-1 text-center first:pl-0 last:pr-0">
      <p className="text-[7px] font-bold uppercase tracking-[0.12em] text-[#7E7468]">{label}</p>
      <p className={`mt-0.5 truncate text-[13px] font-black tabular-nums leading-none ${valueClassName}`}>{value}</p>
    </div>
  );
}

function RecipeCard({
  r,
  actionHref,
  updatedLabel,
  onRefresh,
}: {
  r: EscandalloRecipeDashboardRow;
  actionHref?: string;
  updatedLabel?: string;
  onRefresh?: () => void;
}) {
  const editHref = actionHref ?? `/escandallos/recetas/${r.id}/editar`;
  const badgeTone = statusBadgeTone(r.bucket);
  const kindLabel = r.isSubRecipe ? 'BASE' : 'PLATO';

  return (
    <article className="group rounded-xl border border-[rgba(10,9,8,0.06)] bg-white px-2.5 py-2 shadow-[0_1px_0_rgba(10,9,8,0.04)] transition-[box-shadow,transform] active:scale-[0.995] hover:shadow-[0_2px_10px_rgba(10,9,8,0.05)]">
      <div className="flex items-start gap-2">
        <Badge tone={badgeTone} dense>
          {statusBadgeLabel(r.bucket)}
        </Badge>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[13px] font-bold leading-[1.15] tracking-tight text-[#0A0908]">{r.name}</h3>
          <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7E7468]">
            {kindLabel} · {r.yieldQty} {r.yieldLabel}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {updatedLabel ? (
            <p className="text-[8px] font-medium tabular-nums text-[#7E7468]">{updatedLabel}</p>
          ) : null}
          <Link
            href={editHref}
            className="grid h-7 w-7 place-items-center rounded-lg text-[#7E7468] transition hover:bg-[#F7F3EE] active:bg-[#F7F3EE]"
            aria-label="Opciones de receta"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-4 divide-x divide-[rgba(10,9,8,0.06)] rounded-lg bg-[#FAFAF9] py-1.5 ring-1 ring-[rgba(10,9,8,0.04)]">
        <RecipeMetric label="Coste/ración" value={formatMoneyEur(r.costPerYieldEur)} />
        <RecipeMetric label="PVP" value={r.saleGrossEur != null ? formatMoneyEur(r.saleGrossEur) : '—'} />
        <RecipeMetric
          label="Food cost"
          value={r.foodCostPct != null ? `${r.foodCostPct.toFixed(1)} %` : '—'}
          valueClassName={foodCostValueClass(r.foodCostPct)}
        />
        <RecipeMetric label="Margen" value={formatMargin(r.foodCostPct)} valueClassName={marginValueClass(r.foodCostPct)} />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <Link
          href={editHref}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[rgba(10,9,8,0.08)] bg-white px-1.5 text-[10px] font-semibold text-[#0A0908] transition hover:bg-[#F7F3EE] active:bg-[#F7F3EE]"
        >
          <PencilLine className="h-3 w-3 shrink-0" />
          <span className="truncate">Editar</span>
        </Link>
        <Link
          href={editHref}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[rgba(10,9,8,0.08)] bg-white px-1.5 text-[10px] font-semibold text-[#0A0908] transition hover:bg-[#F7F3EE] active:bg-[#F7F3EE]"
        >
          <Eye className="h-3 w-3 shrink-0" />
          <span className="truncate">Ver coste</span>
        </Link>
        <button
          type="button"
          onClick={() => (onRefresh ? onRefresh() : window.location.reload())}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-[#D32F2F] px-1.5 text-[10px] font-semibold text-white transition hover:bg-[#B91C1C] active:scale-[0.98]"
        >
          <RefreshCw className="h-3 w-3 shrink-0" />
          <span className="truncate">Actualizar</span>
        </button>
      </div>

      <p className="mt-1.5 text-[8px] leading-snug text-[#7E7468]">
        {r.saleGrossEur != null ? `Último PVP ${formatMoneyEur(r.saleGrossEur)}` : 'Sin PVP registrado'}
        <span className="mx-1 text-[rgba(10,9,8,0.2)]">·</span>
        {updatedLabel ? `Actualizado ${updatedLabel}` : 'Sin fecha de actualización'}
        <span className="mx-1 text-[rgba(10,9,8,0.2)]">·</span>
        {r.lineCount} {r.lineCount === 1 ? 'ingrediente' : 'ingredientes'}
      </p>
    </article>
  );
}

export default function EscandallosPage() {
  const searchParams = useSearchParams();
  const { localId, profileReady } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const [recipes, setRecipes] = useState<EscandalloRecipe[]>([]);
  const [linesByRecipe, setLinesByRecipe] = useState<Record<string, EscandalloLine[]>>({});
  const [rawProducts, setRawProducts] = useState<EscandalloRawProduct[]>([]);
  const [processedProducts, setProcessedProducts] = useState<EscandalloProcessedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [salesYearMonth, setSalesYearMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [salesQtyDraft, setSalesQtyDraft] = useState<Record<string, string>>({});
  const [salesBusy, setSalesBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<SalesImportMatchedRow[] | null>(null);
  const [quickCalcOpen, setQuickCalcOpen] = useState(false);
  const [recipeFilter, setRecipeFilter] = useState<RecipeFilter>('all');
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeBookOpen, setRecipeBookOpen] = useState(true);
  const recipeFiltersRef = useRef<HTMLDivElement>(null);
  const [basesOpen, setBasesOpen] = useState(false);
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const lastActivityRef = useRef<number>(0);
  const libroSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (searchParams.get('libro') === '1') {
      setRecipeBookOpen(true);
    }
    if (searchParams.get('bases') === '1') {
      setBasesOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get('libro') !== '1' && searchParams.get('bases') !== '1') return;
    if (loading) return;
    const t = window.setTimeout(() => {
      libroSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => window.clearTimeout(t);
  }, [searchParams, loading]);

  const touchActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);
  const load = useCallback(async () => {
    if (!localId || (!supabaseOk && !isDemoMode())) {
      setRecipes([]);
      setLinesByRecipe({});
      setRawProducts([]);
      setProcessedProducts([]);
      setLoading(false);
      return;
    }
    if (isDemoMode() && localId) {
      setLoading(true);
      setBanner(null);
      const pack = getDemoEscandalloPack();
      setRecipes(pack.recipes);
      setLinesByRecipe(pack.linesByRecipe);
      setRawProducts(pack.rawProducts);
      setProcessedProducts(pack.processed);
      setSalesQtyDraft({ 'demo-recipe-1': '380', 'demo-recipe-2': '140' });
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
      const linesEntries = await Promise.all(r.map(async (recipe) => [recipe.id, await fetchEscandalloLines(supabase, localId, recipe.id)] as const));
      setLinesByRecipe(Object.fromEntries(linesEntries));
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudieron cargar datos. Revisa conexión y migraciones de escandallos.');
      setRecipes([]);
      setLinesByRecipe({});
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

  useEffect(() => {
    if (!profileReady) return;
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [profileReady, load]);

  useEffect(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    const hasOpenBlocks = recipeBookOpen || basesOpen || monthlyOpen;
    if (!hasOpenBlocks) return;
    const interval = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      const busy = loading || salesBusy || importPreview != null || importError != null;
      if (busy || idleMs < 45_000) return;
      setRecipeBookOpen(false);
      setBasesOpen(false);
      setMonthlyOpen(false);
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [recipeBookOpen, basesOpen, monthlyOpen, loading, salesBusy, importPreview, importError]);

  const rawById = useMemo(() => new Map(rawProducts.map((p) => [p.id, p])), [rawProducts]);
  const processedById = useMemo(() => new Map(processedProducts.map((p) => [p.id, p])), [processedProducts]);
  const rows = useMemo(() => buildEscandalloDashboardRows(recipes, linesByRecipe, rawById, processedById), [recipes, linesByRecipe, rawById, processedById]);
  const mainRows = useMemo(() => rows.filter((r) => !r.isSubRecipe), [rows]);
  const subRows = useMemo(() => rows.filter((r) => r.isSubRecipe), [rows]);

  const kpis = useMemo(() => {
    const withFc = mainRows.filter((r) => r.foodCostPct != null);
    const avgFc = withFc.length ? Math.round((withFc.reduce((a, r) => a + (r.foodCostPct ?? 0), 0) / withFc.length) * 10) / 10 : null;
    const noPvp = mainRows.filter((r) => r.bucket === 'no_pvp').length;
    const noLines = mainRows.filter((r) => r.bucket === 'no_lines').length;
    const withCost = mainRows.filter((r) => r.lineCount > 0);
    const avgCost = withCost.length ? Math.round((withCost.reduce((a, r) => a + r.costPerYieldEur, 0) / withCost.length) * 100) / 100 : null;
    const optimal = mainRows.filter((r) => r.bucket === 'optimal').length;
    const high = mainRows.filter((r) => r.bucket === 'high').length;
    return { mainCount: mainRows.length, subCount: subRows.length, avgFc, noPvp, noLines, avgCost, optimal, high, withFcCount: withFc.length };
  }, [mainRows, subRows]);

  const barChartData = useMemo(() => mainRows.filter((r) => r.foodCostPct != null).map((r) => ({
    name: r.name.length > 22 ? `${r.name.slice(0, 20)}…` : r.name,
    fullName: r.name,
    pct: Math.round((r.foodCostPct ?? 0) * 10) / 10,
    fill: (r.foodCostPct ?? 0) < 28 ? BUCKET_COLOR.optimal : (r.foodCostPct ?? 0) <= 35 ? BUCKET_COLOR.watch : BUCKET_COLOR.high,
  })).sort((a, b) => b.pct - a.pct).slice(0, 12), [mainRows]);

  const pieData = useMemo(() => {
    const keys: EscandalloRecipeDashboardRow['bucket'][] = ['optimal', 'watch', 'high', 'no_pvp', 'no_lines'];
    return keys.map((k) => ({ name: bucketLabel(k), key: k, value: mainRows.filter((r) => r.bucket === k).length, fill: BUCKET_COLOR[k] })).filter((d) => d.value > 0);
  }, [mainRows]);

  const compareTheoryReal = useMemo(() => {
    const qtyByRecipe: Record<string, number> = {};
    for (const r of mainRows) {
      const n = parseDecimal(salesQtyDraft[r.id] ?? '');
      if (n != null && n > 0) qtyByRecipe[r.id] = n;
    }
    const mix = computeMonthlyMixFoodCost(mainRows, qtyByRecipe, kpis.avgFc);
    return {
      mix,
      chart: mix.theoreticalAvgFoodCostPct != null || mix.realFoodCostPct != null ? [
        { name: 'Teórico', pct: mix.theoreticalAvgFoodCostPct ?? 0, fill: '#5A534B' },
        { name: 'Real', pct: mix.realFoodCostPct ?? 0, fill: '#D32F2F' },
      ] : [],
    };
  }, [mainRows, salesQtyDraft, kpis.avgFc]);

  const recipeUpdatedById = useMemo(() => new Map(recipes.map((r) => [r.id, r.updatedAt])), [recipes]);

  const filteredRecipeRows = useMemo(() => {
    const q = recipeSearch.trim().toLowerCase();
    return [...mainRows]
      .filter((r) => {
        if (recipeFilter === 'all') return true;
        if (recipeFilter === 'plates') return !r.isSubRecipe;
        if (recipeFilter === 'bases') return r.isSubRecipe;
        if (recipeFilter === 'high') return r.bucket === 'high' || r.bucket === 'no_pvp';
        return r.bucket === 'no_pvp' || r.bucket === 'no_lines';
      })
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [mainRows, recipeFilter, recipeSearch]);

  const baseRows = useMemo(() => [...subRows].sort((a, b) => a.name.localeCompare(b.name, 'es')), [subRows]);

  useEffect(() => {
    if (!localId || !supabaseOk || loading || isDemoMode()) return;
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
            for (const r of mainRows) if (!(r.id in next)) next[r.id] = '';
            return next;
          });
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [localId, supabaseOk, salesYearMonth, loading, mainRows]);

  const handleSaveMonthlySales = async () => {
    if (!localId) return;
    if (isDemoMode()) {
      setBanner('Modo demo: los cambios se quedan solo en esta pantalla.');
      window.setTimeout(() => setBanner(null), 4000);
      return;
    }
    if (!supabaseOk) return;
    const supabase = getSupabaseClient()!;
    setSalesBusy(true);
    setBanner(null);
    try {
      const rows = mainRows.map((r) => ({ recipeId: r.id, quantitySold: Math.max(0, parseDecimal(salesQtyDraft[r.id] ?? '') ?? 0) }));
      await upsertEscandalloMonthlySalesBatch(supabase, localId, salesYearMonth, rows);
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se guardaron ventas. ¿Ejecutaste la migración de monthly sales?');
    } finally {
      setSalesBusy(false);
    }
  };

  const handleDownloadSalesTemplate = useCallback(() => {
    downloadSalesTemplateCsv(mainRows.map((r) => ({ id: r.id, name: r.name, posArticleCode: r.posArticleCode })), salesYearMonth);
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
        if (parsed.error) return setImportError(parsed.error);
        raw = parsed.rows;
      } else if (low.endsWith('.xlsx') || low.endsWith('.xls')) {
        const buf = await f.arrayBuffer();
        const parsed = await parseSalesImportExcel(buf);
        if (parsed.error && parsed.rows.length === 0) return setImportError(parsed.error);
        raw = parsed.rows;
      } else {
        setImportError('Usa .csv, .xlsx o .xls.');
        return;
      }
      if (raw.length === 0) {
        setImportError('No hay filas con cantidad y plato.');
        return;
      }
      setImportPreview(matchSalesImportToRecipes(raw, mainRows.map((r) => ({ id: r.id, name: r.name, posArticleCode: r.posArticleCode }))));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
    }
  };

  const handleApplyImport = () => {
    if (!importPreview) return;
    setSalesQtyDraft((prev) => {
      const next = { ...prev };
      for (const row of importPreview) if (row.status === 'ok' && row.matchedRecipeId) next[row.matchedRecipeId] = String(row.qty);
      return next;
    });
    setImportPreview(null);
    setImportError(null);
    setBanner('Importación aplicada. Revisa y guarda las ventas del mes.');
    window.setTimeout(() => setBanner(null), 6000);
  };

  if (!profileReady) {
    return <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200"><p className="text-sm text-zinc-600">Cargando sesión…</p></section>;
  }

  if (!localId || (!supabaseOk && !isDemoMode())) {
    return <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200"><p className="text-sm font-semibold text-zinc-900">Escandallos no disponibles</p><p className="pt-1 text-sm text-zinc-600">Inicia sesión con un local configurado en Supabase.</p></section>;
  }

  return (
    <div
      className="space-y-5 bg-[#FAFAF9] pb-10"
      onPointerDownCapture={touchActivity}
      onFocusCapture={touchActivity}
      onInputCapture={touchActivity}
      onChangeCapture={touchActivity}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => setQuickCalcOpen(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 shadow-sm sm:w-auto"
        >
          <Calculator className="h-4 w-4" />
          Calculadora rápida
        </button>
        <Link
          href="/escandallos/recetas/nuevo"
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D32F2F] px-4 py-3 text-sm font-semibold text-white shadow-sm sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          Nueva receta
        </Link>
      </div>

      <EscandalloQuickCalculatorModal open={quickCalcOpen} onClose={() => setQuickCalcOpen(false)} rawProducts={rawProducts} localId={localId} />

      <section className="grid grid-cols-2 gap-1.5 sm:gap-2 lg:grid-cols-4">
        <MiniCard compact title="Food cost medio" value={kpis.avgFc != null ? `${kpis.avgFc} %` : '—'} hint={kpis.withFcCount > 0 ? `${kpis.withFcCount} platos con PVP` : 'Completa PVP para calcularlo'} Icon={TrendingUp} accent={kpis.avgFc != null && kpis.avgFc <= 30 ? 'emerald' : 'amber'} />
        <MiniCard compact title="Platos en riesgo" value={String(kpis.high)} hint={`${kpis.noPvp} sin PVP · ${kpis.noLines} sin ingredientes`} Icon={AlertTriangle} accent="red" />
        <MiniCard compact title="Recetas incompletas" value={String(kpis.noPvp + kpis.noLines)} hint="Sin precio o sin líneas" Icon={AlertCircle} accent="amber" />
        <MiniCard compact title="Bases activas" value={String(kpis.subCount)} hint="Elaboraciones reutilizables" Icon={UtensilsCrossed} accent="olive" />
      </section>

      {banner ? <div className="rounded-[1.25rem] border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 ring-1 ring-zinc-200/80">{banner}</div> : null}

      {loading ? (
        <p className="text-center text-sm text-[#7E7468]">Cargando escandallos…</p>
      ) : mainRows.length === 0 && subRows.length === 0 ? (
        <div className="rounded-[1.75rem] bg-white py-10 text-center shadow-sm ring-1 ring-zinc-200/80">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#D32F2F]/10 text-[#B91C1C] ring-1 ring-[#D32F2F]/15">
            <Sparkles className="h-8 w-8" aria-hidden />
          </div>
          <p className="mt-4 text-base font-bold text-zinc-900">Aún no hay recetas</p>
          <Link href="/escandallos/recetas/nuevo" className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#D32F2F] px-5 py-3 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Nueva receta</Link>
        </div>
      ) : (
        <>
          <section
            ref={libroSectionRef}
            className="rounded-xl border border-[rgba(10,9,8,0.06)] bg-white p-2.5 shadow-[0_1px_0_rgba(10,9,8,0.04)] ring-1 ring-[rgba(10,9,8,0.04)]"
          >
            <SectionHeader
              title="Libro de recetas"
              icon={Sparkles}
              accent="amber"
              compact
              open={recipeBookOpen}
              onToggle={() => setRecipeBookOpen((v) => !v)}
            />
            {recipeBookOpen ? (
              <>
                <div
                  ref={recipeFiltersRef}
                  className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {[['all', 'Todas'], ['plates', 'Platos'], ['bases', 'Bases'], ['high', 'Alto coste'], ['incomplete', 'Sin completar']].map(
                    ([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setRecipeFilter(key as RecipeFilter)}
                        className={[
                          'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-tight transition',
                          recipeFilter === key
                            ? 'bg-[#0A0908] text-white'
                            : 'border border-[rgba(10,9,8,0.06)] bg-[#F7F3EE] text-[#0A0908] hover:bg-[#F0EBE4]',
                        ].join(' ')}
                      >
                        {label}
                      </button>
                    ),
                  )}
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <label className="flex min-h-[36px] min-w-0 flex-1 items-center gap-2 rounded-lg border border-[rgba(10,9,8,0.08)] bg-white px-2.5 ring-1 ring-[rgba(10,9,8,0.03)]">
                    <Search className="h-3.5 w-3.5 shrink-0 text-[#7E7468]" aria-hidden />
                    <input
                      value={recipeSearch}
                      onChange={(e) => setRecipeSearch(e.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-[12px] text-[#0A0908] outline-none placeholder:text-[#7E7468]/80"
                      placeholder="Buscar receta..."
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => recipeFiltersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
                    className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#F7F3EE] px-2.5 text-[10px] font-semibold text-[#0A0908] transition hover:bg-[#F0EBE4] active:scale-[0.98]"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Filtros
                  </button>
                </div>
                <div className="mt-2 flex flex-col gap-2">
                  {filteredRecipeRows.length === 0 ? (
                    <p className="rounded-lg bg-[#FAFAF9] px-3 py-4 text-center text-[12px] text-[#7E7468]">
                      No hay recetas con este filtro.
                    </p>
                  ) : (
                    filteredRecipeRows.map((r) => (
                      <RecipeCard
                        key={r.id}
                        r={r}
                        actionHref={`/escandallos/recetas/${r.id}/editar`}
                        updatedLabel={formatRecipeUpdatedLabel(recipeUpdatedById.get(r.id))}
                        onRefresh={() => void load()}
                      />
                    ))
                  )}
                </div>
              </>
            ) : null}
          </section>

          <section className="rounded-[1.5rem] bg-white p-3 shadow-sm ring-1 ring-zinc-200/80">
            <SectionHeader title="Bases y elaboraciones" icon={UtensilsCrossed} accent="olive" open={basesOpen} onToggle={() => setBasesOpen((v) => !v)} />
            {basesOpen ? (
              <div className="mt-3 grid items-stretch gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {baseRows.map((r) => (
                  <article key={r.id} className="flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm ring-1 ring-zinc-200/80">
                    <Badge tone="neutral">{bucketLabel(r.bucket)}</Badge>
                    <h3 className="mt-2 font-serif text-[1.03rem] font-normal text-zinc-950">{r.name}</h3>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500">Base · {r.yieldQty} {r.yieldLabel}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">Coste / ud.</p><p className="mt-1 text-[1.1rem] font-black tabular-nums text-zinc-950">{formatMoneyEur(r.costPerYieldEur)}</p></div>
                      <div><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">Uso</p><p className="mt-1 text-[1.1rem] font-black tabular-nums text-zinc-950">{r.lineCount} recetas</p></div>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-[1.5rem] bg-white p-3 shadow-sm ring-1 ring-zinc-200/80">
            <SectionHeader title="Cierre mensual" icon={BarChart3} accent="emerald" open={monthlyOpen} onToggle={() => setMonthlyOpen((v) => !v)} />
            {monthlyOpen ? <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="flex h-full flex-col rounded-[1.25rem] bg-zinc-50 p-3 ring-1 ring-zinc-200/80">
                <div className="flex flex-wrap items-center gap-3">
                  <input type="month" value={salesYearMonth} onChange={(e) => setSalesYearMonth(e.target.value)} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold" />
                  <button type="button" disabled={salesBusy || mainRows.length === 0} onClick={() => void handleSaveMonthlySales()} className="rounded-2xl bg-[#D32F2F] px-4 py-2.5 text-[12px] font-semibold text-white disabled:opacity-50">
                    {salesBusy ? 'Guardando…' : 'Guardar ventas'}
                  </button>
                  <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-[12px] font-semibold text-zinc-900">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar datos
                  </button>
                </div>
                <div className="mt-3 flex-1 rounded-[1.25rem] border border-dashed border-zinc-200 bg-white p-3">
                  <p className="font-serif text-[1rem] font-normal text-zinc-900">Importar CSV / Excel</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={mainRows.length === 0} onClick={handleDownloadSalesTemplate} className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-[12px] font-semibold text-zinc-900">Descargar plantilla</button>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-[#D32F2F] px-4 py-2 text-[12px] font-semibold text-white">
                      <Upload className="h-4 w-4" /> Subir archivo
                      <input type="file" accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="sr-only" disabled={mainRows.length === 0} onChange={(ev) => void handlePickImportFile(ev)} />
                    </label>
                  </div>
                  {importError ? <p className="mt-3 text-sm text-[#B91C1C]">{importError}</p> : null}
                  {importPreview && importPreview.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Vista previa de importación</p>
                      <div className="max-h-56 overflow-auto rounded-2xl ring-1 ring-zinc-200/80">
                        <table className="w-full text-left text-xs">
                          <tbody>
                            {importPreview.map((row) => (
                              <tr key={row.sourceLine} className="border-t border-black/5">
                                <td className="px-2 py-2">{row.rawLabel || '—'}</td>
                                <td className="px-2 py-2">{row.qty}</td>
                                <td className="px-2 py-2">{row.matchedRecipeName ?? '—'}</td>
                                <td className="px-2 py-2">{row.status}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={handleApplyImport} disabled={!importPreview.some((r) => r.status === 'ok')} className="rounded-2xl bg-[#D32F2F] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50">Aplicar</button>
                        <button type="button" onClick={() => { setImportPreview(null); setImportError(null); }} className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-[12px] font-semibold text-zinc-900">Descartar</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="flex h-full flex-col rounded-[1.25rem] bg-zinc-50 p-3 ring-1 ring-zinc-200/80">
                {compareTheoryReal.mix.totalUnitsSold > 0 ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <MiniCard title="Food cost teórico" value={compareTheoryReal.mix.theoreticalAvgFoodCostPct != null ? `${compareTheoryReal.mix.theoreticalAvgFoodCostPct} %` : '—'} hint="Media simple de carta" Icon={TrendingDown} accent="zinc" />
                    <MiniCard title="Food cost real" value={compareTheoryReal.mix.realFoodCostPct != null ? `${compareTheoryReal.mix.realFoodCostPct} %` : '—'} hint={`${compareTheoryReal.mix.recipesInMix} platos con ventas`} Icon={TrendingUp} accent="red" />
                    <MiniCard title="Diferencia" value={compareTheoryReal.mix.deltaVsTheoreticalPct != null ? `${compareTheoryReal.mix.deltaVsTheoreticalPct > 0 ? '+' : ''}${compareTheoryReal.mix.deltaVsTheoreticalPct} pp` : '—'} hint="Real menos teórico" Icon={Sparkles} accent="olive" />
                  </div>
                ) : null}
                {compareTheoryReal.chart.length > 0 && compareTheoryReal.mix.totalUnitsSold > 0 ? (
                  <div className="mt-3 h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={compareTheoryReal.chart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e7ddd4" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} unit=" %" />
                        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e7ddd4' }} />
                        <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
                          {compareTheoryReal.chart.map((entry, i) => <Cell key={`${entry.name}-${i}`} fill={entry.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : null}
              </div>
            </div> : null}
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <article className="flex h-full flex-col rounded-[1.5rem] bg-white p-3 shadow-sm ring-1 ring-zinc-200/80">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-serif text-[1.35rem] font-normal tracking-tight text-zinc-950">Food cost por plato</h2>
                <Badge tone="neutral">Análisis</Badge>
              </div>
              {barChartData.length > 0 ? (
                <div className="mt-3 h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={barChartData} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7ddd4" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} unit=" %" />
                      <YAxis type="category" dataKey="name" width={108} tick={{ fontSize: 10 }} interval={0} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e7ddd4' }} />
                      <Bar dataKey="pct" radius={[0, 6, 6, 0]} maxBarSize={22}>
                        {barChartData.map((_, i) => <Cell key={i} fill={barChartData[i].fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
            </article>
            <article className="flex h-full flex-col rounded-[1.5rem] bg-white p-3 shadow-sm ring-1 ring-zinc-200/80">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-serif text-[1.35rem] font-normal tracking-tight text-zinc-950">Mix de carta</h2>
                <Badge tone="neutral">Resumen</Badge>
              </div>
              {pieData.length > 0 ? (
                <div className="mt-3 h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={84} paddingAngle={2}>
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} stroke="#fff" strokeWidth={2} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e7ddd4' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
            </article>
          </section>
        </>
      )}
    </div>
  );
}
