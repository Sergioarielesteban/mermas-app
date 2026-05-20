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
  type EscandalloRecipeDashboardRow,
} from '@/lib/escandallos-analytics';
import {
  fetchEscandalloLines,
  fetchEscandalloRecipes,
  fetchEscandalloRawProductsWithWeightedPurchasePrices,
  fetchProcessedProductsForEscandallo,
  deleteEscandalloRecipe,
  type EscandalloLine,
  type EscandalloProcessedProduct,
  type EscandalloRawProduct,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import { fetchEscandalloRecipeCategoriasMap } from '@/lib/finanzas-rentabilidad-escandallo';
import { formatMoneyEur } from '@/lib/money-format';

type RecipeFilter = 'all' | 'plates' | 'bases' | 'high' | 'incomplete';

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

function buildMiniSparklinePoints(values: number[]): string {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const spread = Math.max(1, max - min);
  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 100;
      const y = 100 - ((value - min) / spread) * 100;
      return `${x},${y}`;
    })
    .join(' ');
}

function buildFamilyTrendSeed(label: string, fc: number, margin: number): number[] {
  const hash = [...label].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return Array.from({ length: 8 }, (_, index) => {
    const drift = ((hash + index * 17) % 9) - 4;
    return Math.max(8, Math.round(margin - fc / 5 + drift + index * 0.8));
  });
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
  const [quickCalcOpen, setQuickCalcOpen] = useState(false);
  const [baseBusyId, setBaseBusyId] = useState<string | null>(null);
  const [familyByRecipeId, setFamilyByRecipeId] = useState<Map<string, string>>(() => new Map());
  const [selectedFamily, setSelectedFamily] = useState<string>('Todas');
  const [recipeFilter, setRecipeFilter] = useState<RecipeFilter>('all');
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeBookOpen, setRecipeBookOpen] = useState(false);
  const recipeFiltersRef = useRef<HTMLDivElement>(null);
  const [basesOpen, setBasesOpen] = useState(false);
  const [topProfitableOpen, setTopProfitableOpen] = useState(false);
  const [topLeastProfitableOpen, setTopLeastProfitableOpen] = useState(false);
  const [familyProfitabilityOpen, setFamilyProfitabilityOpen] = useState(false);
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
      setFamilyByRecipeId(
        new Map(
          pack.recipes
            .filter((recipe) => !recipe.isSubRecipe)
            .map((recipe, index) => [
              recipe.id,
              ['Burgers', 'Tapas', 'Ensaladas', 'Postres', 'Principales'][index % 5],
            ]),
        ),
      );
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const [r, raw, processed, categoryMap] = await Promise.all([
        fetchEscandalloRecipes(supabase, localId),
        fetchEscandalloRawProductsWithWeightedPurchasePrices(supabase, localId),
        fetchProcessedProductsForEscandallo(supabase, localId),
        fetchEscandalloRecipeCategoriasMap(supabase, localId),
      ]);
      setRecipes(r);
      setRawProducts(raw);
      setProcessedProducts(processed);
      setFamilyByRecipeId(categoryMap);
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
    if (recipeBookOpen || basesOpen || topProfitableOpen || topLeastProfitableOpen || familyProfitabilityOpen) {
      lastActivityRef.current = Date.now();
    }
  }, [recipeBookOpen, basesOpen, topProfitableOpen, topLeastProfitableOpen, familyProfitabilityOpen]);

  useEffect(() => {
    const hasOpenBlocks =
      recipeBookOpen || basesOpen || topProfitableOpen || topLeastProfitableOpen || familyProfitabilityOpen;
    if (!hasOpenBlocks) return;
    const idleMs = 60_000;
    const interval = window.setInterval(() => {
      if (loading) return;
      if (Date.now() - lastActivityRef.current < idleMs) return;
      setRecipeBookOpen(false);
      setBasesOpen(false);
      setTopProfitableOpen(false);
      setTopLeastProfitableOpen(false);
      setFamilyProfitabilityOpen(false);
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [recipeBookOpen, basesOpen, topProfitableOpen, topLeastProfitableOpen, familyProfitabilityOpen, loading]);

  const rawById = useMemo(() => new Map(rawProducts.map((p) => [p.id, p])), [rawProducts]);
  const processedById = useMemo(() => new Map(processedProducts.map((p) => [p.id, p])), [processedProducts]);
  const rows = useMemo(() => buildEscandalloDashboardRows(recipes, linesByRecipe, rawById, processedById), [recipes, linesByRecipe, rawById, processedById]);
  const mainRows = useMemo(() => rows.filter((r) => !r.isSubRecipe), [rows]);
  const subRows = useMemo(() => rows.filter((r) => r.isSubRecipe), [rows]);
  const familyOptions = useMemo(() => {
    const families = [...new Set(mainRows.map((row) => familyByRecipeId.get(row.id)?.trim() || 'Sin familia'))].sort((a, b) =>
      a.localeCompare(b, 'es'),
    );
    return ['Todas', ...families];
  }, [mainRows, familyByRecipeId]);

  const activeFamily = familyOptions.includes(selectedFamily) ? selectedFamily : 'Todas';

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
  const familyScopedRows = useMemo(() => {
    if (activeFamily === 'Todas') return mainRows;
    return mainRows.filter((row) => (familyByRecipeId.get(row.id)?.trim() || 'Sin familia') === activeFamily);
  }, [mainRows, familyByRecipeId, activeFamily]);
  const topProfitableRows = useMemo(
    () =>
      [...familyScopedRows]
        .filter((row) => row.foodCostPct != null)
        .map((row) => ({ ...row, marginPct: Math.max(0, 100 - (row.foodCostPct ?? 0)) }))
        .sort((a, b) => (b.marginPct ?? 0) - (a.marginPct ?? 0))
        .slice(0, 5),
    [familyScopedRows],
  );
  const topLeastProfitableRows = useMemo(
    () =>
      [...familyScopedRows]
        .filter((row) => row.foodCostPct != null)
        .sort((a, b) => (b.foodCostPct ?? 0) - (a.foodCostPct ?? 0))
        .slice(0, 5),
    [familyScopedRows],
  );
  const familySummaryRows = useMemo(() => {
    const groups = new Map<
      string,
      { count: number; fcValues: number[]; marginValues: number[] }
    >();
    for (const row of mainRows) {
      const family = familyByRecipeId.get(row.id)?.trim() || 'Sin familia';
      const bucket = groups.get(family) ?? { count: 0, fcValues: [], marginValues: [] };
      bucket.count += 1;
      if (row.foodCostPct != null) {
        bucket.fcValues.push(row.foodCostPct);
        bucket.marginValues.push(Math.max(0, 100 - row.foodCostPct));
      }
      groups.set(family, bucket);
    }
    return [...groups.entries()]
      .map(([family, data]) => {
        const avgFc =
          data.fcValues.length > 0
            ? Math.round((data.fcValues.reduce((sum, value) => sum + value, 0) / data.fcValues.length) * 10) / 10
            : null;
        const avgMargin =
          data.marginValues.length > 0
            ? Math.round((data.marginValues.reduce((sum, value) => sum + value, 0) / data.marginValues.length) * 10) / 10
            : null;
        return { family, count: data.count, avgFc, avgMargin };
      })
      .sort((a, b) => (a.avgMargin ?? -999) < (b.avgMargin ?? -999) ? 1 : -1)
      .slice(0, 8);
  }, [mainRows, familyByRecipeId]);
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

  if (!profileReady) {
    return <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200"><p className="text-sm text-zinc-600">Cargando sesión…</p></section>;
  }

  if (!localId || (!supabaseOk && !isDemoMode())) {
    return <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200"><p className="text-sm font-semibold text-zinc-900">Escandallos no disponibles</p><p className="pt-1 text-sm text-zinc-600">Inicia sesión con un local configurado en Supabase.</p></section>;
  }

  const openRecipeFilter = (filter: RecipeFilter) => {
    touchActivity();
    setRecipeBookOpen(true);
    setRecipeFilter(filter);
  };

  const openBasesBlock = () => {
    touchActivity();
    setBasesOpen(true);
  };

  return (
    <div
      className="space-y-5 bg-[#FAFAF9] pb-10"
      onPointerDownCapture={touchActivity}
      onFocusCapture={touchActivity}
      onInputCapture={touchActivity}
      onChangeCapture={touchActivity}
      onScrollCapture={touchActivity}
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
        <div className="min-h-[102px] rounded-[20px] border border-[rgba(10,9,8,0.07)] bg-white p-2.5 text-left shadow-[0_1px_0_rgba(10,9,8,0.04)] ring-1 ring-[rgba(10,9,8,0.035)]">
          <span className={`grid h-7 w-7 place-items-center rounded-full ring-1 ${foodCostTone(kpis.avgFc).soft}`}>
            <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden />
          </span>
          <p className="mt-2.5 text-[9px] font-semibold uppercase tracking-[0.11em] text-[#5A534B]">Food cost medio</p>
          <p className="mt-1 text-[21px] font-black leading-none tracking-tight text-[#0A0908]">{kpis.avgFc != null ? `${kpis.avgFc} %` : '—'}</p>
          <p className="mt-1.5 min-h-[1.7em] text-[10px] font-medium leading-tight text-[#7E7468]">Objetivo &lt; 35%</p>
          <span className="mt-2.5 block h-1 rounded-full bg-[rgba(10,9,8,0.08)]">
            <span className="block h-full rounded-full" style={{ width: pctBarWidth(kpis.avgFc, 45), backgroundColor: foodCostTone(kpis.avgFc).bar }} />
          </span>
        </div>

        <button
          type="button"
          onClick={() => openRecipeFilter('high')}
          className="min-h-[102px] rounded-[20px] border border-[rgba(10,9,8,0.07)] bg-white p-2.5 text-left shadow-[0_1px_0_rgba(10,9,8,0.04)] ring-1 ring-[rgba(10,9,8,0.035)] transition active:scale-[0.99]"
        >
          <span className={`grid h-7 w-7 place-items-center rounded-full ring-1 ${foodCostTone(42).soft}`}>
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden />
          </span>
          <p className="mt-2.5 text-[9px] font-semibold uppercase tracking-[0.11em] text-[#5A534B]">Platos en riesgo</p>
          <p className="mt-1 text-[21px] font-black leading-none tracking-tight text-[#0A0908]">{kpis.high}</p>
          <p className="mt-1.5 min-h-[1.7em] text-[10px] font-medium leading-tight text-[#7E7468]">Superan FC objetivo</p>
          <span className="mt-2.5 block h-1 rounded-full bg-[rgba(10,9,8,0.08)]">
            <span className="block h-full rounded-full" style={{ width: pctBarWidth(kpis.high, Math.max(1, mainRows.length)), backgroundColor: foodCostTone(42).bar }} />
          </span>
        </button>

        <button
          type="button"
          onClick={() => openRecipeFilter('incomplete')}
          className="min-h-[102px] rounded-[20px] border border-[rgba(10,9,8,0.07)] bg-white p-2.5 text-left shadow-[0_1px_0_rgba(10,9,8,0.04)] ring-1 ring-[rgba(10,9,8,0.035)] transition active:scale-[0.99]"
        >
          <span className={`grid h-7 w-7 place-items-center rounded-full ring-1 ${foodCostTone(34).soft}`}>
            <AlertCircle className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden />
          </span>
          <p className="mt-2.5 text-[9px] font-semibold uppercase tracking-[0.11em] text-[#5A534B]">Recetas incompletas</p>
          <p className="mt-1 text-[21px] font-black leading-none tracking-tight text-[#0A0908]">{kpis.noPvp + kpis.noLines}</p>
          <p className="mt-1.5 min-h-[1.7em] text-[10px] font-medium leading-tight text-[#7E7468]">Sin precio / ingredientes / ficha</p>
          <span className="mt-2.5 block h-1 rounded-full bg-[rgba(10,9,8,0.08)]">
            <span className="block h-full rounded-full" style={{ width: pctBarWidth(kpis.noPvp + kpis.noLines, Math.max(1, mainRows.length)), backgroundColor: foodCostTone(34).bar }} />
          </span>
        </button>

        <button
          type="button"
          onClick={openBasesBlock}
          className="min-h-[102px] rounded-[20px] border border-[rgba(10,9,8,0.07)] bg-white p-2.5 text-left shadow-[0_1px_0_rgba(10,9,8,0.04)] ring-1 ring-[rgba(10,9,8,0.035)] transition active:scale-[0.99]"
        >
          <span className={`grid h-7 w-7 place-items-center rounded-full ring-1 ${foodCostTone(24).soft}`}>
            <UtensilsCrossed className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden />
          </span>
          <p className="mt-2.5 text-[9px] font-semibold uppercase tracking-[0.11em] text-[#5A534B]">Bases activas</p>
          <p className="mt-1 text-[21px] font-black leading-none tracking-tight text-[#0A0908]">{kpis.subCount}</p>
          <p className="mt-1.5 min-h-[1.7em] text-[10px] font-medium leading-tight text-[#7E7468]">Utilizadas en {totalBaseUsage} recetas</p>
          <span className="mt-2.5 block h-1 rounded-full bg-[rgba(10,9,8,0.08)]">
            <span className="block h-full rounded-full" style={{ width: pctBarWidth(kpis.subCount, Math.max(1, kpis.subCount + 1)), backgroundColor: foodCostTone(24).bar }} />
          </span>
        </button>
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
              onToggle={() => {
                touchActivity();
                setRecipeBookOpen((v) => !v);
              }}
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
            <SectionHeader
              title="Bases y elaboraciones"
              icon={UtensilsCrossed}
              accent="olive"
              compact
              open={basesOpen}
              onToggle={() => {
                touchActivity();
                setBasesOpen((v) => !v);
              }}
            />
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

          <div className="space-y-3">
            {(
              [
              {
                title: 'Top 5 más rentables',
                suffix: '% = Margen bruto',
                rows: topProfitableRows,
                open: topProfitableOpen,
                setOpen: setTopProfitableOpen,
                icon: TrendingUp,
                accent: 'emerald' as const,
                barMax: 45,
                value: (row: EscandalloRecipeDashboardRow & { marginPct?: number | null }) => row.marginPct ?? null,
                colorValue: (pct: number | null) => foodCostTone(pct != null ? Math.max(20, 100 - pct) : null),
              },
              {
                title: 'Top 5 menos rentables',
                suffix: '% = Food cost',
                rows: topLeastProfitableRows,
                open: topLeastProfitableOpen,
                setOpen: setTopLeastProfitableOpen,
                icon: TrendingDown,
                accent: 'amber' as const,
                barMax: 50,
                value: (row: EscandalloRecipeDashboardRow) => row.foodCostPct,
                colorValue: (pct: number | null) => foodCostTone(pct),
              },
              ] as const
            ).map((block) => (
              <section
                key={block.title}
                className="rounded-xl border border-[rgba(10,9,8,0.06)] bg-white p-2.5 shadow-[0_1px_0_rgba(10,9,8,0.04)] ring-1 ring-[rgba(10,9,8,0.04)]"
              >
                <SectionHeader
                  title={block.title}
                  icon={block.icon}
                  accent={block.accent}
                  compact
                  open={block.open}
                  onToggle={() => {
                    touchActivity();
                    block.setOpen((v) => !v);
                  }}
                />
                {block.open ? (
                  <>
                    <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
                      <select
                        value={activeFamily}
                        onChange={(e) => setSelectedFamily(e.target.value)}
                        className="h-7 rounded-lg border border-[rgba(10,9,8,0.08)] bg-white px-2.5 text-[10px] font-semibold text-[#0A0908] outline-none focus:border-[#D32F2F]/35"
                        aria-label="Filtrar por familia"
                      >
                        {familyOptions.map((family) => (
                          <option key={family} value={family}>
                            {family}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          touchActivity();
                          setRecipeBookOpen(true);
                          libroSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className="rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#F7F3EE] px-2.5 py-1 text-[10px] font-semibold text-[#0A0908] transition hover:bg-[#F0EBE4]"
                      >
                        Ver todos
                      </button>
                    </div>
                    <div className="mt-2 divide-y divide-[rgba(10,9,8,0.07)]">
                      {block.rows.length === 0 ? (
                        <p className="py-4 text-center text-[12px] text-[#7E7468]">Sin datos suficientes para esta familia.</p>
                      ) : (
                        block.rows.map((row) => {
                          const pct = block.value(row as never);
                          const tone = block.colorValue(pct);
                          return (
                            <Link
                              key={row.id}
                              href={`/escandallos/recetas/${row.id}/editar`}
                              className="grid grid-cols-[1fr_auto_34%_auto] items-center gap-2 py-2"
                            >
                              <span className="min-w-0 truncate text-[12px] font-bold text-[#0A0908]">{row.name}</span>
                              <span className={`text-[12px] font-black tabular-nums ${tone.text}`}>
                                {pct != null ? `${pct.toFixed(0)} %` : '—'}
                              </span>
                              <span className="h-2 rounded-full bg-[rgba(10,9,8,0.08)]">
                                <span
                                  className="block h-full rounded-full"
                                  style={{ width: pctBarWidth(pct, block.barMax), backgroundColor: tone.bar }}
                                />
                              </span>
                              <ChevronRight className="h-3.5 w-3.5 text-[#7E7468]" />
                            </Link>
                          );
                        })
                      )}
                    </div>
                    <p className="mt-1.5 text-[9px] font-medium text-[#7E7468]">{block.suffix}</p>
                  </>
                ) : null}
              </section>
            ))}

            <section className="rounded-xl border border-[rgba(10,9,8,0.06)] bg-white p-2.5 shadow-[0_1px_0_rgba(10,9,8,0.04)] ring-1 ring-[rgba(10,9,8,0.04)]">
              <SectionHeader
                title="Rentabilidad por familia"
                icon={BarChart3}
                accent="zinc"
                compact
                open={familyProfitabilityOpen}
                onToggle={() => {
                  touchActivity();
                  setFamilyProfitabilityOpen((v) => !v);
                }}
              />
              {familyProfitabilityOpen ? (
                <>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        touchActivity();
                        setSelectedFamily('Todas');
                      }}
                      className="rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#F7F3EE] px-2.5 py-1 text-[10px] font-semibold text-[#0A0908] transition hover:bg-[#F0EBE4]"
                    >
                      Ver todas
                    </button>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    {familySummaryRows.map((family) => {
                      const tone = foodCostTone(family.avgFc);
                      const trendValues = buildFamilyTrendSeed(family.family, family.avgFc ?? 0, family.avgMargin ?? 0);
                      return (
                        <button
                          key={family.family}
                          type="button"
                          onClick={() => {
                            touchActivity();
                            setSelectedFamily(family.family);
                          }}
                          className="rounded-[18px] border border-[rgba(10,9,8,0.07)] bg-white p-2.5 text-left ring-1 ring-[rgba(10,9,8,0.025)] transition active:scale-[0.99]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.11em] text-[#0A0908]">{family.family}</p>
                              <p className="mt-0.5 text-[9px] font-medium text-[#7E7468]">
                                {family.count} {family.count === 1 ? 'plato' : 'platos'}
                              </p>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-[9px] font-bold ring-1 ${tone.soft}`}>
                              FC {family.avgFc != null ? `${family.avgFc.toFixed(0)} %` : '—'}
                            </span>
                          </div>
                          <div className="mt-2.5 flex items-end justify-between gap-2">
                            <div>
                              <p className="text-[9px] font-medium text-[#7E7468]">Margen medio</p>
                              <p className="mt-1 text-[19px] font-black leading-none text-[#0A0908]">
                                {family.avgMargin != null ? `${family.avgMargin.toFixed(0)} %` : '—'}
                              </p>
                            </div>
                            <span
                              className={`text-[11px] font-bold ${family.avgMargin != null && family.avgMargin >= 35 ? 'text-[#4A6B3A]' : family.avgMargin != null && family.avgMargin < 20 ? 'text-[#D32F2F]' : 'text-[#B8872A]'}`}
                            >
                              {family.avgMargin != null
                                ? `${family.avgMargin >= 35 ? '↑' : family.avgMargin < 20 ? '↓' : '→'} ${Math.abs((family.avgMargin ?? 0) - 35).toFixed(0)} %`
                                : '—'}
                            </span>
                          </div>
                          <div className="mt-2 h-7">
                            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                              <polyline
                                fill="none"
                                stroke={tone.bar}
                                strokeWidth="4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                points={buildMiniSparklinePoints(trendValues)}
                              />
                            </svg>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </section>
          </div>

        </>
      )}
    </div>
  );
}
