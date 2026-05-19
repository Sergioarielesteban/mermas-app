'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Calculator,
  ChevronDown,
  ChevronRight,
  Eye,
  MoreHorizontal,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trash2,
  Upload,
  UtensilsCrossed,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import EscandalloQuickCalculatorModal from '@/components/escandallos/EscandalloQuickCalculatorModal';
import { isDemoMode } from '@/lib/demo-mode';
import { getDemoEscandalloPack } from '@/lib/demo-dataset';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { appConfirm } from '@/lib/app-dialog-bridge';
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
  deleteEscandalloRecipe,
  lineUnitPriceEur,
  upsertEscandalloMonthlySalesBatch,
  type EscandalloLine,
  type EscandalloProcessedProduct,
  type EscandalloRawProduct,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import { formatMoneyEur } from '@/lib/money-format';

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

function foodCostTone(pct: number | null): { bar: string; soft: string; text: string } {
  if (pct == null) return { bar: '#7E7468', soft: 'bg-[#F7F3EE] text-[#7E7468] ring-[rgba(10,9,8,0.06)]', text: 'text-[#7E7468]' };
  if (pct < 30) return { bar: '#4A6B3A', soft: 'bg-[#4A6B3A]/10 text-[#35502A] ring-[#4A6B3A]/15', text: 'text-[#4A6B3A]' };
  if (pct <= 35) return { bar: '#B8872A', soft: 'bg-[#B8872A]/10 text-[#7A5518] ring-[#B8872A]/15', text: 'text-[#B8872A]' };
  if (pct <= 40) return { bar: '#C4531F', soft: 'bg-[#C4531F]/10 text-[#9F3E18] ring-[#C4531F]/15', text: 'text-[#C4531F]' };
  return { bar: '#D32F2F', soft: 'bg-[#D32F2F]/10 text-[#B91C1C] ring-[#D32F2F]/15', text: 'text-[#D32F2F]' };
}

function pctBarWidth(pct: number | null, max = 65): string {
  if (pct == null) return '0%';
  return `${Math.min(100, Math.max(4, (pct / max) * 100))}%`;
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
  const [baseBusyId, setBaseBusyId] = useState<string | null>(null);
  const [recipeFilter, setRecipeFilter] = useState<RecipeFilter>('all');
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeBookOpen, setRecipeBookOpen] = useState(true);
  const recipeFiltersRef = useRef<HTMLDivElement>(null);
  const [basesOpen, setBasesOpen] = useState(false);
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const [advancedAnalyticsOpen, setAdvancedAnalyticsOpen] = useState(false);
  const lastActivityRef = useRef<number>(0);
  const libroSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchParams.get('libro') === '1') {
        setRecipeBookOpen(true);
      }
      if (searchParams.get('bases') === '1') {
        setBasesOpen(true);
      }
    }, 0);
    return () => window.clearTimeout(t);
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
  const recipesById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
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

  const compareTheoryReal = useMemo(() => {
    const qtyByRecipe: Record<string, number> = {};
    for (const r of mainRows) {
      const n = parseDecimal(salesQtyDraft[r.id] ?? '');
      if (n != null && n > 0) qtyByRecipe[r.id] = n;
    }
    const mix = computeMonthlyMixFoodCost(mainRows, qtyByRecipe, kpis.avgFc);
    return { mix };
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
  const baseUsageById = useMemo(() => {
    const usage = new Map<string, Set<string>>();
    for (const recipe of recipes) {
      const lines = linesByRecipe[recipe.id] ?? [];
      for (const line of lines) {
        if (line.sourceType !== 'subrecipe' || !line.subRecipeId || line.subRecipeId === recipe.id) continue;
        const set = usage.get(line.subRecipeId) ?? new Set<string>();
        set.add(recipe.id);
        usage.set(line.subRecipeId, set);
      }
    }
    return new Map([...usage.entries()].map(([id, set]) => [id, set.size]));
  }, [recipes, linesByRecipe]);
  const totalBaseUsage = useMemo(() => [...baseUsageById.values()].reduce((acc, n) => acc + n, 0), [baseUsageById]);
  const topWorstFoodCostRows = useMemo(
    () =>
      [...mainRows]
        .filter((r) => r.foodCostPct != null)
        .sort((a, b) => (b.foodCostPct ?? 0) - (a.foodCostPct ?? 0))
        .slice(0, 5),
    [mainRows],
  );
  const profitabilityStats = useMemo(() => {
    const withMargin = mainRows
      .map((r) => ({ ...r, marginPct: r.foodCostPct != null ? 100 - r.foodCostPct : null }))
      .filter((r) => r.marginPct != null);
    return {
      very: withMargin.filter((r) => (r.marginPct ?? 0) >= 35).length,
      review: withMargin.filter((r) => (r.marginPct ?? 0) >= 20 && (r.marginPct ?? 0) < 35).length,
      critical: withMargin.filter((r) => (r.marginPct ?? 0) < 20).length,
    };
  }, [mainRows]);
  const ingredientCostRows = useMemo(() => {
    const byName = new Map<string, number>();
    for (const recipe of mainRows) {
      const lines = linesByRecipe[recipe.id] ?? [];
      for (const line of lines) {
        const name = line.label.trim() || 'Ingrediente';
        const unitCost = lineUnitPriceEur(line, rawById, processedById, {
          linesByRecipe,
          recipesById,
          expanding: new Set([recipe.id]),
        });
        byName.set(name, Math.round(((byName.get(name) ?? 0) + line.qty * unitCost) * 100) / 100);
      }
    }
    return [...byName.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [mainRows, linesByRecipe, rawById, processedById, recipesById]);
  const supplierCostRows = useMemo(() => {
    const bySupplier = new Map<string, number>();
    for (const recipe of mainRows) {
      const lines = linesByRecipe[recipe.id] ?? [];
      for (const line of lines) {
        if (line.sourceType !== 'raw' || !line.rawSupplierProductId) continue;
        const raw = rawById.get(line.rawSupplierProductId);
        if (!raw) continue;
        const unitCost = lineUnitPriceEur(line, rawById, processedById);
        bySupplier.set(raw.supplierName || 'Proveedor', Math.round(((bySupplier.get(raw.supplierName) ?? 0) + line.qty * unitCost) * 100) / 100);
      }
    }
    const total = [...bySupplier.values()].reduce((acc, n) => acc + n, 0);
    return [...bySupplier.entries()]
      .map(([name, value]) => ({ name, pct: total > 0 ? Math.round((value / total) * 100) : 0 }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
  }, [mainRows, linesByRecipe, rawById, processedById]);

  const handleDeleteBase = async (base: EscandalloRecipeDashboardRow) => {
    if (!localId || !supabaseOk || isDemoMode()) return;
    const usageCount = baseUsageById.get(base.id) ?? 0;
    const message =
      usageCount > 0
        ? `Esta base está siendo usada en ${usageCount} ${usageCount === 1 ? 'receta' : 'recetas'}.\n\n¿Eliminarla igualmente?`
        : `¿Eliminar la base "${base.name}"?`;
    if (!(await appConfirm(message))) return;
    const supabase = getSupabaseClient()!;
    setBaseBusyId(base.id);
    setBanner(null);
    try {
      await deleteEscandalloRecipe(supabase, localId, base.id);
      setRecipes((prev) => prev.filter((r) => r.id !== base.id));
      setLinesByRecipe((prev) => {
        const next = { ...prev };
        delete next[base.id];
        return next;
      });
      setBanner('Base eliminada.');
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudo eliminar la base.');
    } finally {
      setBaseBusyId(null);
    }
  };

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

  const openRecipeFilter = (filter: RecipeFilter) => {
    setRecipeBookOpen(true);
    setRecipeFilter(filter);
  };

  const openBasesBlock = () => {
    setBasesOpen(true);
  };

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

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          {
            title: 'Food cost medio',
            value: kpis.avgFc != null ? `${kpis.avgFc} %` : '—',
            hint: 'Objetivo < 35%',
            icon: TrendingUp,
            tone: foodCostTone(kpis.avgFc),
            width: pctBarWidth(kpis.avgFc, 45),
            onClick: undefined,
          },
          {
            title: 'Platos en riesgo',
            value: String(kpis.high),
            hint: 'Superan FC objetivo',
            icon: AlertTriangle,
            tone: foodCostTone(42),
            width: pctBarWidth(kpis.high, Math.max(1, mainRows.length)),
            onClick: () => openRecipeFilter('high'),
          },
          {
            title: 'Recetas incompletas',
            value: String(kpis.noPvp + kpis.noLines),
            hint: 'Sin precio / ingredientes / ficha',
            icon: AlertCircle,
            tone: foodCostTone(34),
            width: pctBarWidth(kpis.noPvp + kpis.noLines, Math.max(1, mainRows.length)),
            onClick: () => openRecipeFilter('incomplete'),
          },
          {
            title: 'Bases activas',
            value: String(kpis.subCount),
            hint: `Utilizadas en ${totalBaseUsage} recetas`,
            icon: UtensilsCrossed,
            tone: foodCostTone(24),
            width: pctBarWidth(kpis.subCount, Math.max(1, kpis.subCount + 1)),
            onClick: openBasesBlock,
          },
        ].map(({ title, value, hint, icon: Icon, tone, width, onClick }) => {
          const Comp = onClick ? 'button' : 'div';
          return (
            <Comp
              key={title}
              type={onClick ? 'button' : undefined}
              onClick={onClick}
              className="min-h-[116px] rounded-[20px] border border-[rgba(10,9,8,0.07)] bg-white p-3 text-left shadow-[0_1px_0_rgba(10,9,8,0.04)] ring-1 ring-[rgba(10,9,8,0.035)] transition active:scale-[0.99]"
            >
              <span className={`grid h-8 w-8 place-items-center rounded-full ring-1 ${tone.soft}`}>
                <Icon className="h-4 w-4" strokeWidth={2.1} aria-hidden />
              </span>
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.11em] text-[#5A534B]">{title}</p>
              <p className="mt-1 text-[24px] font-black leading-none tracking-tight text-[#0A0908]">{value}</p>
              <p className="mt-2 min-h-[1.8em] text-[11px] font-medium leading-tight text-[#7E7468]">{hint}</p>
              <span className="mt-3 block h-1 rounded-full bg-[rgba(10,9,8,0.08)]">
                <span className="block h-full rounded-full" style={{ width, backgroundColor: tone.bar }} />
              </span>
            </Comp>
          );
        })}
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

          <section className="rounded-xl border border-[rgba(10,9,8,0.06)] bg-white p-2.5 shadow-[0_1px_0_rgba(10,9,8,0.04)] ring-1 ring-[rgba(10,9,8,0.04)]">
            <SectionHeader title="Bases y elaboraciones" icon={UtensilsCrossed} accent="olive" compact open={basesOpen} onToggle={() => setBasesOpen((v) => !v)} />
            {basesOpen ? (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-2 px-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#7E7468]">Bases ({baseRows.length})</p>
                  <Link
                    href="/escandallos/recetas/nuevo?tipo=base"
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full bg-[#D32F2F] px-3 text-[11px] font-black text-white shadow-[0_2px_8px_rgba(211,47,47,0.18)] transition hover:bg-[#B91C1C] active:scale-[0.98]"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Nueva base
                  </Link>
                </div>
                {baseRows.length === 0 ? (
                  <p className="rounded-xl bg-[#FAFAF9] px-3 py-4 text-center text-[12px] text-[#7E7468]">Aún no hay bases.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {baseRows.map((r) => {
                      const usageCount = baseUsageById.get(r.id) ?? 0;
                      const updatedLabel = formatRecipeUpdatedLabel(recipeUpdatedById.get(r.id));
                      return (
                        <article
                          key={r.id}
                          className="rounded-xl border border-[rgba(10,9,8,0.07)] bg-white px-2.5 py-2 shadow-[0_1px_0_rgba(10,9,8,0.04)] ring-1 ring-[rgba(10,9,8,0.035)] transition active:scale-[0.995]"
                        >
                          <div className="min-w-0">
                              <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <h3 className="line-clamp-2 text-[13px] font-bold leading-[1.15] tracking-tight text-[#0A0908]">
                                    {r.name}
                                  </h3>
                                  <p className="mt-0.5 line-clamp-1 text-[9px] font-semibold uppercase tracking-[0.11em] text-[#7E7468]">
                                    {r.yieldQty} {r.yieldLabel} · utilizada en{' '}
                                    <span className={usageCount > 0 ? 'font-bold text-[#C4531F]' : 'font-semibold text-[#7E7468]'}>
                                      {usageCount} {usageCount === 1 ? 'receta' : 'recetas'}
                                    </span>
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1 pt-0.5">
                                  <Link
                                    href={`/escandallos/recetas/${r.id}/editar`}
                                    className="grid h-7 w-7 place-items-center rounded-full bg-[#F7F3EE] text-[#5A534B] ring-1 ring-[rgba(10,9,8,0.06)] transition hover:bg-[#F0EBE4]"
                                    aria-label="Configurar base"
                                  >
                                    <Settings className="h-3.5 w-3.5" />
                                  </Link>
                                  <Link
                                    href={`/escandallos/recetas/${r.id}/editar`}
                                    className="grid h-7 w-7 place-items-center rounded-full bg-[#F7F3EE] text-[#5A534B] ring-1 ring-[rgba(10,9,8,0.06)] transition hover:bg-[#F0EBE4]"
                                    aria-label="Editar base"
                                  >
                                    <PencilLine className="h-3.5 w-3.5" />
                                  </Link>
                                  <button
                                    type="button"
                                    disabled={baseBusyId === r.id}
                                    onClick={() => void handleDeleteBase(r)}
                                    className="grid h-7 w-7 place-items-center rounded-full bg-[#D32F2F]/10 text-[#D32F2F] ring-1 ring-[#D32F2F]/12 transition hover:bg-[#D32F2F]/15 disabled:opacity-50"
                                    aria-label="Eliminar base"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <p className="text-[12px] font-black leading-none tracking-tight text-[#0A0908]">
                                  {formatMoneyEur(r.costPerYieldEur)}<span className="text-[10px] font-semibold text-[#0A0908]">/{r.yieldLabel || 'ud'}</span>
                                </p>
                                <span className="text-[9px] font-medium text-[#7E7468]">·</span>
                                <p className="text-[9px] font-medium text-[#7E7468]">Act.: {updatedLabel}</p>
                              </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
                <div className="rounded-xl border border-[rgba(211,47,47,0.08)] bg-[#D32F2F]/5 px-3 py-2 text-[11px] font-medium leading-snug text-[#7E7468]">
                  <span className="font-bold text-[#C4531F]">Info:</span> las bases se recalculan automáticamente cuando cambian los costes de sus ingredientes.
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-[rgba(10,9,8,0.06)] bg-white p-2.5 shadow-[0_1px_0_rgba(10,9,8,0.04)] ring-1 ring-[rgba(10,9,8,0.04)]">
            <SectionHeader title="Cierre mensual" icon={BarChart3} accent="emerald" compact open={monthlyOpen} onToggle={() => setMonthlyOpen((v) => !v)} />
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
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#7E7468]">Ventas vs rentabilidad</p>
                {compareTheoryReal.mix.totalUnitsSold > 0 ? (
                  <div className="mt-3 space-y-3">
                    {[
                      { label: 'Food cost teórico', value: compareTheoryReal.mix.theoreticalAvgFoodCostPct, color: '#5A534B' },
                      { label: 'Food cost real', value: compareTheoryReal.mix.realFoodCostPct, color: '#D32F2F' },
                    ].map((row) => (
                      <div key={row.label}>
                        <div className="flex items-center justify-between text-[11px] font-semibold text-[#0A0908]">
                          <span>{row.label}</span>
                          <span className="tabular-nums">{row.value != null ? `${row.value} %` : '—'}</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-[rgba(10,9,8,0.08)]">
                          <div className="h-full rounded-full" style={{ width: pctBarWidth(row.value, 55), backgroundColor: row.color }} />
                        </div>
                      </div>
                    ))}
                    <p className="text-[11px] font-medium text-[#7E7468]">
                      {compareTheoryReal.mix.recipesInMix} platos con ventas · {compareTheoryReal.mix.totalUnitsSold} unidades
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl bg-white px-3 py-4 text-center text-[12px] text-[#7E7468]">
                    Importa ventas para ver el mix real.
                  </p>
                )}
              </div>
            </div> : null}
          </section>

          <section className="rounded-[20px] border border-[rgba(10,9,8,0.07)] bg-white p-3 shadow-[0_1px_0_rgba(10,9,8,0.04)] ring-1 ring-[rgba(10,9,8,0.035)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-[Cormorant_Garamond] text-[18px] font-semibold leading-none text-[#0A0908]">Top 5 platos con peor food cost</h2>
              <button
                type="button"
                onClick={() => {
                  setRecipeBookOpen(true);
                  setRecipeFilter('high');
                  libroSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="rounded-xl border border-[rgba(10,9,8,0.08)] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#0A0908]"
              >
                Ver todos
              </button>
            </div>
            <div className="mt-3 divide-y divide-[rgba(10,9,8,0.07)]">
              {topWorstFoodCostRows.length === 0 ? (
                <p className="py-4 text-center text-[12px] text-[#7E7468]">Completa PVP para calcular food cost.</p>
              ) : (
                topWorstFoodCostRows.map((r) => {
                  const tone = foodCostTone(r.foodCostPct);
                  return (
                    <Link key={r.id} href={`/escandallos/recetas/${r.id}/editar`} className="grid grid-cols-[1fr_auto_34%_auto] items-center gap-2 py-2.5">
                      <span className="min-w-0 truncate text-[13px] font-bold text-[#0A0908]">{r.name}</span>
                      <span className={`text-[13px] font-black tabular-nums ${tone.text}`}>{r.foodCostPct?.toFixed(0)} %</span>
                      <span className="h-2 rounded-full bg-[rgba(10,9,8,0.08)]">
                        <span className="block h-full rounded-full" style={{ width: pctBarWidth(r.foodCostPct), backgroundColor: tone.bar }} />
                      </span>
                      <ChevronRight className="h-4 w-4 text-[#7E7468]" />
                    </Link>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-[20px] border border-[rgba(10,9,8,0.07)] bg-white p-3 shadow-[0_1px_0_rgba(10,9,8,0.04)] ring-1 ring-[rgba(10,9,8,0.035)]">
            <h2 className="font-[Cormorant_Garamond] text-[18px] font-semibold leading-none text-[#0A0908]">Rentabilidad de carta</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                { label: 'Muy rentables', value: `${profitabilityStats.very} platos`, hint: 'Margen > 35%', icon: TrendingUp, tone: foodCostTone(24) },
                { label: 'Revisar precio', value: `${profitabilityStats.review} platos`, hint: 'Margen 20% - 35%', icon: AlertCircle, tone: foodCostTone(34) },
                { label: 'Margen crítico', value: `${profitabilityStats.critical} platos`, hint: 'Margen < 20%', icon: TrendingDown, tone: foodCostTone(42) },
              ].map(({ label, value, hint, icon: Icon, tone }) => (
                <button key={label} type="button" className="flex items-center gap-3 rounded-xl border border-[rgba(10,9,8,0.07)] bg-white p-3 text-left ring-1 ring-[rgba(10,9,8,0.025)]">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ring-1 ${tone.soft}`}>
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <span>
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.11em] text-[#5A534B]">{label}</span>
                    <span className="mt-1 block text-[18px] font-black leading-none text-[#0A0908]">{value}</span>
                    <span className="mt-1 block text-[11px] font-medium text-[#7E7468]">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-[20px] border border-[rgba(10,9,8,0.07)] bg-white shadow-[0_1px_0_rgba(10,9,8,0.04)] ring-1 ring-[rgba(10,9,8,0.035)]">
            <button
              type="button"
              onClick={() => setAdvancedAnalyticsOpen((v) => !v)}
              className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left"
            >
              <BarChart3 className="h-5 w-5 shrink-0 text-[#5A534B]" />
              <span className="min-w-0 flex-1">
                <span className="block font-[Cormorant_Garamond] text-[18px] font-semibold leading-none text-[#0A0908]">Analítica avanzada</span>
                <span className="mt-1 block truncate text-[11px] font-medium text-[#7E7468]">Evolución de costes, ingredientes, proveedores y rentabilidad.</span>
              </span>
              <ChevronDown className={`h-4 w-4 text-[#7E7468] transition ${advancedAnalyticsOpen ? 'rotate-180' : ''}`} />
            </button>
            {advancedAnalyticsOpen ? (
              <div className="grid gap-2 border-t border-[rgba(10,9,8,0.06)] p-3 sm:grid-cols-2">
                <div className="rounded-xl bg-[#FAFAF9] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#7E7468]">Evolución costes</p>
                  <div className="mt-3 flex items-end gap-1.5">
                    {[32, 46, 42, 58, 54, 70].map((h, i) => (
                      <span key={i} className="w-full rounded-full bg-[#C4531F]/80" style={{ height: `${h}px` }} />
                    ))}
                  </div>
                </div>
                <div className="rounded-xl bg-[#FAFAF9] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#7E7468]">Top ingredientes coste</p>
                  <div className="mt-2 space-y-2">
                    {ingredientCostRows.map((row) => (
                      <div key={row.name} className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="truncate font-semibold text-[#0A0908]">{row.name}</span>
                        <span className="font-black tabular-nums text-[#0A0908]">{formatMoneyEur(row.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl bg-[#FAFAF9] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#7E7468]">Dependencia proveedores</p>
                  <div className="mt-2 space-y-2">
                    {supplierCostRows.map((row) => (
                      <div key={row.name}>
                        <div className="flex justify-between gap-2 text-[12px] font-semibold text-[#0A0908]"><span className="truncate">{row.name}</span><span>{row.pct}%</span></div>
                        <div className="mt-1 h-1.5 rounded-full bg-[rgba(10,9,8,0.08)]"><div className="h-full rounded-full bg-[#4A6B3A]" style={{ width: `${row.pct}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl bg-[#FAFAF9] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#7E7468]">Ventas vs rentabilidad</p>
                  <div className="mt-2 space-y-2">
                    <div className="text-[12px] font-semibold text-[#0A0908]">Ventas</div>
                    <div className="h-2 rounded-full bg-[rgba(10,9,8,0.08)]"><div className="h-full w-3/4 rounded-full bg-[#C4531F]" /></div>
                    <div className="text-[12px] font-semibold text-[#0A0908]">Margen</div>
                    <div className="h-2 rounded-full bg-[rgba(10,9,8,0.08)]"><div className="h-full w-1/2 rounded-full bg-[#4A6B3A]" /></div>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
