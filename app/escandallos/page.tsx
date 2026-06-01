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
  ChevronRight,
  Eye,
  MoreHorizontal,
  PencilLine,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import EscandalloQuickCalculatorModal from '@/components/escandallos/EscandalloQuickCalculatorModal';
import RecipeQuickViewModal from '@/components/escandallos/RecipeQuickViewModal';
import { isDemoMode } from '@/lib/demo-mode';
import { getDemoEscandalloPack } from '@/lib/demo-dataset';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { fetchRecipeAllergensForLocal, type RecipeAllergenRow } from '@/lib/appcc-allergens-supabase';
import {
  buildEscandalloDashboardRows,
  bucketLabel,
  type EscandalloRecipeDashboardRow,
} from '@/lib/escandallos-analytics';
import {
  fetchEscandalloTechnicalSheetWithSteps,
  fetchEscandalloTechnicalSheetsMap,
  getOfficialRecipePhotoUrl,
  type EscandalloTechnicalSheet,
  type EscandalloTechnicalSheetStep,
} from '@/lib/escandallos-technical-sheet-supabase';
import { printRecipePDF, type RecipePrintPayload } from '@/lib/escandallo-recipe-print-pdf';
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
import { fetchCentralKitchenPublicCatalog, type EscandalloCentralKitchenCatalogItem } from '@/lib/central-kitchen-public-catalog';

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

function formatQuantityLabel(value: number | null | undefined, unit: string | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0 || !unit) return null;
  const formatted = value.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${formatted} ${unit}`;
}

function baseOperationalUsageLabel(sheet: EscandalloTechnicalSheet | null | undefined): string | null {
  if (!sheet || sheet.operationalCost == null || sheet.operationalCost <= 0) return null;
  const qtyLabel = formatQuantityLabel(sheet.operationalQuantity, sheet.operationalUnit);
  if (sheet.operationalUsageType === 'standard_portion') {
    return qtyLabel ? `ración ${qtyLabel}` : 'ración';
  }
  if (qtyLabel) return qtyLabel;
  if (sheet.operationalUnit) return sheet.operationalUnit;
  return null;
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

function EscIconWell({
  icon: Icon,
  tone,
}: {
  icon: LucideIcon;
  tone: 'violet' | 'emerald' | 'amber' | 'terra' | 'zinc';
}) {
  const toneClass =
    tone === 'violet'
      ? 'bg-violet-100 text-violet-800'
      : tone === 'emerald'
        ? 'bg-emerald-50 text-emerald-700'
        : tone === 'amber'
          ? 'bg-amber-50 text-amber-800'
          : tone === 'terra'
            ? 'bg-[#C4531F]/10 text-[#9F3E18]'
            : 'bg-zinc-100 text-zinc-600';
  return (
    <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 ring-white/70 sm:h-12 sm:w-12 ${toneClass}`}>
      <Icon className="h-5 w-5 sm:h-[1.35rem] sm:w-[1.35rem]" strokeWidth={2.1} aria-hidden />
    </div>
  );
}

function EscMiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{label}</p>
      <p className="mt-0.5 font-mono text-[15px] font-bold tabular-nums leading-none text-zinc-900">{value}</p>
    </div>
  );
}

function EscModuleCard({
  title,
  subtitle,
  icon,
  iconTone,
  open,
  onToggle,
  metrics,
  preview,
  children,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  iconTone: 'violet' | 'emerald' | 'amber' | 'terra' | 'zinc';
  open: boolean;
  onToggle: () => void;
  metrics?: { label: string; value: string }[];
  preview?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className={[
        'overflow-hidden rounded-3xl bg-white ring-1 ring-zinc-200/80 transition-all duration-200',
        open
          ? 'shadow-[0_6px_24px_rgba(0,0,0,0.06)]'
          : 'shadow-sm hover:scale-[1.01] hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)]',
      ].join(' ')}
    >
      <button type="button" onClick={onToggle} className="flex w-full items-stretch gap-3 p-3.5 text-left sm:gap-3.5 sm:p-4">
        <EscIconWell icon={icon} tone={iconTone} />
        <div className="min-w-0 flex-1">
          <p className="font-serif text-[16px] font-normal leading-tight text-zinc-900">{title}</p>
          <p className="mt-0.5 text-[11px] font-medium leading-snug text-zinc-500">{subtitle}</p>
          {!open && metrics && metrics.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2">{metrics.map((m) => <EscMiniMetric key={m.label} {...m} />)}</div>
          ) : null}
          {!open && preview ? <div className="mt-2.5">{preview}</div> : null}
        </div>
        <span className="flex shrink-0 items-center self-center text-zinc-300">
          <ChevronRight className={`h-5 w-5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} aria-hidden />
        </span>
      </button>
      {open ? (
        <div className="border-t border-zinc-100/90 bg-gradient-to-b from-zinc-50/40 to-white px-3.5 pb-4 pt-3 sm:px-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function EscTopDishPreview({
  row,
  pct,
  tone,
  badgeLabel,
  badgeTone,
  barMax,
}: {
  row: EscandalloRecipeDashboardRow | undefined;
  pct: number | null;
  tone: ReturnType<typeof foodCostTone>;
  badgeLabel: string;
  badgeTone: 'olive' | 'terracotta' | 'red';
  barMax: number;
}) {
  if (!row || pct == null) {
    return <p className="text-[11px] text-zinc-500">Sin datos suficientes para esta familia.</p>;
  }
  return (
    <div className="rounded-2xl bg-zinc-50/80 px-2.5 py-2 ring-1 ring-zinc-200/60">
      <div className="flex items-center gap-2">
        <Badge tone={badgeTone} dense>
          {badgeLabel}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-zinc-800">{row.name}</span>
        <span className={`font-mono text-[14px] font-black tabular-nums ${tone.text}`}>{pct.toFixed(0)} %</span>
      </div>
      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-zinc-200/80">
        <span className="block h-full rounded-full transition-all duration-200" style={{ width: pctBarWidth(pct, barMax), backgroundColor: tone.bar }} />
      </span>
    </div>
  );
}

function EscFamilyBarsPreview({ rows }: { rows: { family: string; avgMargin: number | null }[] }) {
  if (rows.length === 0) {
    return <p className="text-[11px] text-zinc-500">Sin familias con margen calculado.</p>;
  }
  return (
    <div className="space-y-1.5">
      {rows.slice(0, 4).map((family) => {
        const tone = foodCostTone(family.avgMargin != null ? Math.max(20, 100 - family.avgMargin) : null);
        return (
          <div key={family.family} className="flex items-center gap-2">
            <span className="w-[5.5rem] shrink-0 truncate text-[9px] font-bold uppercase tracking-wide text-zinc-600">{family.family}</span>
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-200/80">
              <span
                className="block h-full rounded-full"
                style={{ width: pctBarWidth(family.avgMargin, 85), backgroundColor: tone.bar }}
              />
            </span>
            <span className={`w-9 shrink-0 text-right font-mono text-[11px] font-bold tabular-nums ${tone.text}`}>
              {family.avgMargin != null ? `${family.avgMargin.toFixed(0)}%` : '—'}
            </span>
          </div>
        );
      })}
    </div>
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
  photoUrl,
  actionHref,
  updatedLabel,
  onView,
  onRefresh,
  onPrint,
  printing = false,
}: {
  r: EscandalloRecipeDashboardRow;
  photoUrl?: string | null;
  actionHref?: string;
  updatedLabel?: string;
  onView?: () => void;
  onRefresh?: () => void;
  onPrint?: () => void;
  printing?: boolean;
}) {
  const editHref = actionHref ?? `/escandallos/recetas/${r.id}/editar`;
  const badgeTone = statusBadgeTone(r.bucket);
  const kindLabel = r.isSubRecipe ? 'BASE' : 'PLATO';

  return (
    <article
      role={onView ? 'button' : undefined}
      tabIndex={onView ? 0 : undefined}
      onClick={onView}
      onKeyDown={(event) => {
        if (!onView) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onView();
      }}
      className="group rounded-xl border border-[rgba(10,9,8,0.06)] bg-white px-2.5 py-2 shadow-[0_1px_0_rgba(10,9,8,0.04)] transition-[box-shadow,transform] active:scale-[0.995] hover:shadow-[0_2px_10px_rgba(10,9,8,0.05)]"
    >
      <div className="flex items-start gap-2">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[16px] bg-[#FAFAF9] ring-1 ring-[rgba(10,9,8,0.06)]">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-full w-full object-cover [aspect-ratio:1/1]" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_top,_rgba(211,47,47,0.08),_transparent_60%)] text-center">
              <span className="px-1 text-[7px] font-bold uppercase tracking-[0.14em] text-[#7E7468]">Sin foto</span>
            </div>
          )}
        </div>
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
            onClick={(event) => event.stopPropagation()}
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

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onView?.();
          }}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[rgba(10,9,8,0.08)] bg-white px-1.5 text-[10px] font-semibold text-[#0A0908] transition hover:bg-[#F7F3EE] active:bg-[#F7F3EE]"
        >
          <Eye className="h-3 w-3 shrink-0" />
          <span className="truncate">Ver</span>
        </button>
        <Link
          href={editHref}
          onClick={(event) => event.stopPropagation()}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[rgba(10,9,8,0.08)] bg-white px-1.5 text-[10px] font-semibold text-[#0A0908] transition hover:bg-[#F7F3EE] active:bg-[#F7F3EE]"
        >
          <PencilLine className="h-3 w-3 shrink-0" />
          <span className="truncate">Editar</span>
        </Link>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onPrint?.();
          }}
          disabled={printing}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[rgba(10,9,8,0.08)] bg-white px-1.5 text-[10px] font-semibold text-[#0A0908] transition hover:bg-[#F7F3EE] active:bg-[#F7F3EE] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Printer className="h-3 w-3 shrink-0" />
          <span className="truncate">{printing ? 'Imprimiendo…' : 'Imprimir'}</span>
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            return onRefresh ? onRefresh() : window.location.reload();
          }}
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
  const [centralKitchenProducts, setCentralKitchenProducts] = useState<EscandalloCentralKitchenCatalogItem[]>([]);
  const [technicalSheetsByRecipe, setTechnicalSheetsByRecipe] = useState<Map<string, EscandalloTechnicalSheet>>(new Map());
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [printingRecipeId, setPrintingRecipeId] = useState<string | null>(null);
  const [quickViewRecipeId, setQuickViewRecipeId] = useState<string | null>(null);
  const [quickCalcOpen, setQuickCalcOpen] = useState(false);
  const [baseBusyId, setBaseBusyId] = useState<string | null>(null);
  const [deleteConfirmBase, setDeleteConfirmBase] = useState<{
    base: EscandalloRecipeDashboardRow;
    usageCount: number;
  } | null>(null);
  const [familyByRecipeId, setFamilyByRecipeId] = useState<Map<string, string>>(() => new Map());
  const [selectedFamily, setSelectedFamily] = useState<string>('Todas');
  const [recipeFilter, setRecipeFilter] = useState<RecipeFilter>('all');
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeBookOpen, setRecipeBookOpen] = useState(false);
  const [basesOpen, setBasesOpen] = useState(false);
  const [topProfitableOpen, setTopProfitableOpen] = useState(false);
  const [topLeastProfitableOpen, setTopLeastProfitableOpen] = useState(false);
  const [familyProfitabilityOpen, setFamilyProfitabilityOpen] = useState(false);
  const lastActivityRef = useRef<number>(0);
  const libroSectionRef = useRef<HTMLDivElement>(null);

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
      setTechnicalSheetsByRecipe(new Map());
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
      setCentralKitchenProducts([]);
      setTechnicalSheetsByRecipe(new Map());
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
      const [r, raw, processed, categoryMap, sheetsMapResult, centralCatalog] = await Promise.all([
        fetchEscandalloRecipes(supabase, localId),
        fetchEscandalloRawProductsWithWeightedPurchasePrices(supabase, localId),
        fetchProcessedProductsForEscandallo(supabase, localId),
        fetchEscandalloRecipeCategoriasMap(supabase, localId),
        fetchEscandalloTechnicalSheetsMap(supabase, localId).catch(() => new Map<string, EscandalloTechnicalSheet>()),
        fetchCentralKitchenPublicCatalog(supabase, localId).catch(() => [] as EscandalloCentralKitchenCatalogItem[]),
      ]);
      setRecipes(r);
      setRawProducts(raw);
      setProcessedProducts(processed);
      setCentralKitchenProducts(centralCatalog);
      setTechnicalSheetsByRecipe(sheetsMapResult);
      setFamilyByRecipeId(categoryMap);
      const linesEntries = await Promise.all(r.map(async (recipe) => [recipe.id, await fetchEscandalloLines(supabase, localId, recipe.id)] as const));
      setLinesByRecipe(Object.fromEntries(linesEntries));
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudieron cargar datos. Revisa conexión y migraciones de escandallos.');
      setRecipes([]);
      setLinesByRecipe({});
      setTechnicalSheetsByRecipe(new Map());
      setCentralKitchenProducts([]);
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
  const centralKitchenById = useMemo(
    () => new Map(centralKitchenProducts.map((item) => [item.id, item])),
    [centralKitchenProducts],
  );
  const recipesById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const rows = useMemo(
    () =>
      buildEscandalloDashboardRows(
        recipes,
        linesByRecipe,
        rawById,
        processedById,
        technicalSheetsByRecipe,
        centralKitchenById,
      ),
    [recipes, linesByRecipe, rawById, processedById, technicalSheetsByRecipe, centralKitchenById],
  );
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
  const quickViewRecipe = quickViewRecipeId ? recipesById.get(quickViewRecipeId) ?? null : null;
  const quickViewRow = quickViewRecipeId ? rows.find((row) => row.id === quickViewRecipeId) ?? null : null;

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

  const handlePrintRecipe = useCallback(
    async (recipeId: string) => {
      if (!localId) return;
      const recipe = recipesById.get(recipeId);
      if (!recipe) return;

      setPrintingRecipeId(recipeId);
      setBanner(null);
      try {
        let sheet: EscandalloTechnicalSheet | null = null;
        let steps: EscandalloTechnicalSheetStep[] = [];
        let recipeAllergens: RecipeAllergenRow[] = [];

        if (!isDemoMode()) {
          const supabase = getSupabaseClient();
          if (!supabase) throw new Error('No se pudo iniciar la impresión.');
          const [sheetPack, allergens] = await Promise.all([
            fetchEscandalloTechnicalSheetWithSteps(supabase, localId, recipeId),
            fetchRecipeAllergensForLocal(supabase, localId),
          ]);
          sheet = sheetPack.sheet;
          steps = sheetPack.steps;
          recipeAllergens = allergens.filter((row) => row.recipe_id === recipeId);
        }

        const payload: RecipePrintPayload = {
          recipe,
          lines: linesByRecipe[recipeId] ?? [],
          sheet,
          steps,
          recipeAllergens,
          rawById,
          processedById,
          recipesById,
          technicalSheetsByRecipe: new Map(),
          centralKitchenById,
          linesByRecipe,
          productionTotalCost: rows.find((row) => row.id === recipeId)?.totalCostEur ?? 0,
          creatorName: null,
          localName: null,
        };

        await printRecipePDF(payload);
      } catch (error: unknown) {
        setBanner(error instanceof Error ? error.message : 'No se pudo generar el PDF.');
      } finally {
        setPrintingRecipeId(null);
      }
    },
    [centralKitchenById, linesByRecipe, localId, processedById, rawById, recipesById, rows],
  );

  const handleDeleteBase = async (base: EscandalloRecipeDashboardRow) => {
    const usageCount = baseUsageById.get(base.id) ?? 0;
    setDeleteConfirmBase({ base, usageCount });
  };

  const handleConfirmDeleteBase = async () => {
    if (!localId || !supabaseOk || isDemoMode()) return;
    const modalState = deleteConfirmBase;
    if (!modalState) return;
    const base = modalState.base;
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
      setDeleteConfirmBase(null);
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

  const incompleteRecipeCount = kpis.noPvp + kpis.noLines;
  const topProfitableHero = topProfitableRows[0];
  const topLeastProfitableHero = topLeastProfitableRows[0];
  const topProfitableHeroPct = topProfitableHero?.marginPct ?? null;
  const topLeastProfitableHeroPct = topLeastProfitableHero?.foodCostPct ?? null;

  return (
    <div
      className="space-y-4 bg-[#f5f5f7] pb-10"
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

      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="min-h-[102px] rounded-3xl bg-white p-3 text-left shadow-sm ring-1 ring-zinc-200/80">
          <span className={`grid h-8 w-8 place-items-center rounded-2xl ring-1 ring-white/70 ${foodCostTone(kpis.avgFc).soft}`}>
            <TrendingUp className="h-4 w-4" strokeWidth={2.1} aria-hidden />
          </span>
          <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Food cost medio</p>
          <p className="mt-1 font-mono text-[21px] font-bold tabular-nums leading-none text-zinc-900">{kpis.avgFc != null ? `${kpis.avgFc} %` : '—'}</p>
          <p className="mt-1.5 min-h-[1.7em] text-[10px] font-medium leading-tight text-zinc-500">Objetivo &lt; 35%</p>
          <span className="mt-2 block h-1 overflow-hidden rounded-full bg-zinc-200/80">
            <span className="block h-full rounded-full transition-all duration-200" style={{ width: pctBarWidth(kpis.avgFc, 45), backgroundColor: foodCostTone(kpis.avgFc).bar }} />
          </span>
        </div>

        <button
          type="button"
          onClick={() => openRecipeFilter('high')}
          className="min-h-[102px] rounded-3xl bg-white p-3 text-left shadow-sm ring-1 ring-zinc-200/80 transition duration-200 hover:scale-[1.01] hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] active:scale-[0.99]"
        >
          <span className={`grid h-8 w-8 place-items-center rounded-2xl ring-1 ring-white/70 ${foodCostTone(42).soft}`}>
            <AlertTriangle className="h-4 w-4" strokeWidth={2.1} aria-hidden />
          </span>
          <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Platos en riesgo</p>
          <p className="mt-1 font-mono text-[21px] font-bold tabular-nums leading-none text-zinc-900">{kpis.high}</p>
          <p className="mt-1.5 min-h-[1.7em] text-[10px] font-medium leading-tight text-zinc-500">Superan FC objetivo</p>
          <span className="mt-2 block h-1 overflow-hidden rounded-full bg-zinc-200/80">
            <span className="block h-full rounded-full transition-all duration-200" style={{ width: pctBarWidth(kpis.high, Math.max(1, mainRows.length)), backgroundColor: foodCostTone(42).bar }} />
          </span>
        </button>

        <button
          type="button"
          onClick={() => openRecipeFilter('incomplete')}
          className="min-h-[102px] rounded-3xl bg-white p-3 text-left shadow-sm ring-1 ring-zinc-200/80 transition duration-200 hover:scale-[1.01] hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] active:scale-[0.99]"
        >
          <span className={`grid h-8 w-8 place-items-center rounded-2xl ring-1 ring-white/70 ${foodCostTone(34).soft}`}>
            <AlertCircle className="h-4 w-4" strokeWidth={2.1} aria-hidden />
          </span>
          <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Recetas incompletas</p>
          <p className="mt-1 font-mono text-[21px] font-bold tabular-nums leading-none text-zinc-900">{kpis.noPvp + kpis.noLines}</p>
          <p className="mt-1.5 min-h-[1.7em] text-[10px] font-medium leading-tight text-zinc-500">Sin precio / ingredientes / ficha</p>
          <span className="mt-2 block h-1 overflow-hidden rounded-full bg-zinc-200/80">
            <span className="block h-full rounded-full transition-all duration-200" style={{ width: pctBarWidth(kpis.noPvp + kpis.noLines, Math.max(1, mainRows.length)), backgroundColor: foodCostTone(34).bar }} />
          </span>
        </button>

        <button
          type="button"
          onClick={openBasesBlock}
          className="min-h-[102px] rounded-3xl bg-white p-3 text-left shadow-sm ring-1 ring-zinc-200/80 transition duration-200 hover:scale-[1.01] hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] active:scale-[0.99]"
        >
          <span className={`grid h-8 w-8 place-items-center rounded-2xl ring-1 ring-white/70 ${foodCostTone(24).soft}`}>
            <UtensilsCrossed className="h-4 w-4" strokeWidth={2.1} aria-hidden />
          </span>
          <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Bases activas</p>
          <p className="mt-1 font-mono text-[21px] font-bold tabular-nums leading-none text-zinc-900">{kpis.subCount}</p>
          <p className="mt-1.5 min-h-[1.7em] text-[10px] font-medium leading-tight text-zinc-500">Utilizadas en {totalBaseUsage} recetas</p>
          <span className="mt-2 block h-1 overflow-hidden rounded-full bg-zinc-200/80">
            <span className="block h-full rounded-full transition-all duration-200" style={{ width: pctBarWidth(kpis.subCount, Math.max(1, kpis.subCount + 1)), backgroundColor: foodCostTone(24).bar }} />
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
          <div ref={libroSectionRef}>
            <EscModuleCard
              title="Libro de recetas"
              subtitle="Gestiona recetas y fichas técnicas"
              icon={Sparkles}
              iconTone="violet"
              open={recipeBookOpen}
              onToggle={() => {
                touchActivity();
                setRecipeBookOpen((v) => !v);
              }}
              metrics={[
                { label: 'Recetas', value: String(kpis.mainCount) },
                { label: 'Sin completar', value: String(incompleteRecipeCount) },
              ]}
            >
              <label className="flex min-h-[40px] items-center gap-2 rounded-2xl border border-zinc-200/80 bg-white px-3 ring-1 ring-zinc-100/80">
                <Search className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                <input
                  value={recipeSearch}
                  onChange={(e) => setRecipeSearch(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-900 outline-none placeholder:text-zinc-400"
                  placeholder="Buscar receta…"
                />
              </label>
              <div className="mt-3 flex flex-col gap-2.5">
                {filteredRecipeRows.length === 0 ? (
                  <p className="rounded-2xl bg-white px-3 py-5 text-center text-[12px] text-zinc-500 ring-1 ring-zinc-200/70">
                    No hay recetas que coincidan.
                  </p>
                ) : (
                  filteredRecipeRows.map((r) => (
                    <RecipeCard
                      key={r.id}
                      r={r}
                      photoUrl={getOfficialRecipePhotoUrl(technicalSheetsByRecipe.get(r.id))}
                      actionHref={`/escandallos/recetas/${r.id}/editar`}
                      updatedLabel={formatRecipeUpdatedLabel(recipeUpdatedById.get(r.id))}
                      onView={() => setQuickViewRecipeId(r.id)}
                      onRefresh={() => void load()}
                      onPrint={() => void handlePrintRecipe(r.id)}
                      printing={printingRecipeId === r.id}
                    />
                  ))
                )}
              </div>
            </EscModuleCard>
          </div>

          <EscModuleCard
            title="Bases y elaboraciones"
            subtitle="Gestiona bases reutilizables"
            icon={UtensilsCrossed}
            iconTone="emerald"
            open={basesOpen}
            onToggle={() => {
              touchActivity();
              setBasesOpen((v) => !v);
            }}
            metrics={[
              { label: 'Bases activas', value: String(kpis.subCount) },
              { label: 'Usos', value: String(totalBaseUsage) },
            ]}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">{baseRows.length} bases</p>
              <Link
                href="/escandallos/recetas/nuevo?tipo=base"
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full bg-[#D32F2F] px-3 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#B91C1C] active:scale-[0.98]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Nueva base
              </Link>
            </div>
            {baseRows.length === 0 ? (
              <p className="mt-3 rounded-2xl bg-white px-3 py-5 text-center text-[12px] text-zinc-500 ring-1 ring-zinc-200/70">Aún no hay bases.</p>
            ) : (
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {baseRows.map((r) => {
                  const usageCount = baseUsageById.get(r.id) ?? 0;
                  const updatedLabel = formatRecipeUpdatedLabel(recipeUpdatedById.get(r.id));
                  const sheet = technicalSheetsByRecipe.get(r.id);
                  const realYieldQty = sheet?.yieldQuantity ?? null;
                  const realYieldUnit = sheet?.yieldUnit ?? null;
                  const realYieldLabel = formatQuantityLabel(realYieldQty, realYieldUnit);
                  const realCostPerUnit =
                    realYieldQty != null && realYieldQty > 0 && realYieldUnit
                      ? Math.round((r.totalCostEur / realYieldQty) * 100) / 100
                      : null;
                  const operationalUsage = baseOperationalUsageLabel(sheet);
                  return (
                    <article
                      key={r.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setQuickViewRecipeId(r.id)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        setQuickViewRecipeId(r.id);
                      }}
                      className="rounded-2xl border border-zinc-200/70 bg-white px-3 py-2.5 shadow-sm ring-1 ring-zinc-100/80 transition duration-200 hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] active:scale-[0.995]"
                    >
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 font-serif text-[14px] font-semibold leading-snug text-zinc-900">{r.name}</h3>
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.07em] text-zinc-500">
                          BASE · {realYieldLabel ?? 'Salida pendiente'} · {usageCount} {usageCount === 1 ? 'uso' : 'usos'}
                        </p>
                        <p className="mt-0.5 text-[8px] text-zinc-400">Act. {updatedLabel}</p>
                      </div>

                      <div className="mt-2 grid grid-cols-2 divide-x divide-zinc-200/80 rounded-2xl border border-zinc-200/80 bg-white px-2 py-2 ring-1 ring-zinc-100/70">
                        <div className="min-w-0 px-2">
                          <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Coste real</p>
                          {realCostPerUnit != null && realYieldUnit ? (
                            <p className="mt-1 font-mono text-[15px] font-bold tabular-nums leading-none text-zinc-900">
                              {formatMoneyEur(realCostPerUnit)}
                              <span className="ml-0.5 text-[11px] font-bold text-zinc-500">/{realYieldUnit}</span>
                            </p>
                          ) : (
                            <p className="mt-1 truncate text-[12px] font-semibold leading-none text-zinc-500">Salida pendiente</p>
                          )}
                        </div>
                        <div className="min-w-0 px-2">
                          <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Coste operativo</p>
                          {sheet?.operationalCost != null && sheet.operationalCost > 0 && operationalUsage ? (
                            <p className="mt-1 truncate font-mono text-[15px] font-bold tabular-nums leading-none text-zinc-900">
                              {formatMoneyEur(sheet.operationalCost)}
                              <span className="ml-0.5 text-[11px] font-bold text-zinc-500">/ {operationalUsage}</span>
                            </p>
                          ) : (
                            <p className="mt-1 truncate text-[12px] font-semibold leading-none text-zinc-500">Uso pendiente</p>
                          )}
                        </div>
                      </div>

                      <div className="mt-2.5 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setQuickViewRecipeId(r.id);
                          }}
                          className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-2 text-[10px] font-bold text-zinc-700 transition hover:bg-zinc-50"
                        >
                          <Eye className="h-3.5 w-3.5 shrink-0" />
                          <span>Ver</span>
                        </button>
                        <Link
                          href={`/escandallos/recetas/${r.id}/editar`}
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-2 text-[10px] font-bold text-zinc-700 transition hover:bg-zinc-50"
                        >
                          <PencilLine className="h-3.5 w-3.5 shrink-0" />
                          <span>Editar</span>
                        </Link>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handlePrintRecipe(r.id);
                          }}
                          disabled={printingRecipeId === r.id}
                          className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-2 text-[10px] font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                        >
                          <Printer className="h-3.5 w-3.5 shrink-0" />
                          <span>{printingRecipeId === r.id ? 'Imprimiendo…' : 'Imprimir'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={baseBusyId === r.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeleteBase(r);
                          }}
                          className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-2xl border border-red-200 bg-red-50 px-2 text-[10px] font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5 shrink-0" />
                          <span>Eliminar</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            <p className="mt-3 rounded-2xl border border-[#D32F2F]/10 bg-[#D32F2F]/5 px-3 py-2 text-[11px] leading-snug text-zinc-600">
              <span className="font-semibold text-[#C4531F]">Info:</span> las bases se recalculan cuando cambian los costes de sus ingredientes.
            </p>
          </EscModuleCard>

          <EscModuleCard
            title="Top 5 más rentables"
            subtitle="Platos con mejor margen bruto"
            icon={TrendingUp}
            iconTone="emerald"
            open={topProfitableOpen}
            onToggle={() => {
              touchActivity();
              setTopProfitableOpen((v) => !v);
            }}
            preview={
              <EscTopDishPreview
                row={topProfitableHero}
                pct={topProfitableHeroPct}
                tone={foodCostTone(topProfitableHeroPct != null ? Math.max(20, 100 - topProfitableHeroPct) : null)}
                badgeLabel="Margen"
                badgeTone="olive"
                barMax={45}
              />
            }
          >
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  touchActivity();
                  setRecipeBookOpen(true);
                  libroSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="text-[11px] font-semibold text-zinc-500 underline-offset-2 transition hover:text-zinc-800 hover:underline"
              >
                Ver todos
              </button>
            </div>
            <div className="divide-y divide-zinc-100 rounded-2xl bg-white ring-1 ring-zinc-200/70">
              {topProfitableRows.length === 0 ? (
                <p className="px-3 py-5 text-center text-[12px] text-zinc-500">Sin datos suficientes.</p>
              ) : (
                topProfitableRows.map((row) => {
                  const pct = row.marginPct ?? null;
                  const tone = foodCostTone(pct != null ? Math.max(20, 100 - pct) : null);
                  return (
                    <Link
                      key={row.id}
                      href={`/escandallos/recetas/${row.id}/editar`}
                      className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-zinc-50/80"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-zinc-900">{row.name}</p>
                        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-zinc-100">
                          <span className="block h-full rounded-full" style={{ width: pctBarWidth(pct, 45), backgroundColor: tone.bar }} />
                        </span>
                      </div>
                      <Badge tone="olive" dense>
                        Margen
                      </Badge>
                      <span className={`font-mono text-[14px] font-black tabular-nums ${tone.text}`}>
                        {pct != null ? `${pct.toFixed(0)} %` : '—'}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />
                    </Link>
                  );
                })
              )}
            </div>
          </EscModuleCard>

          <EscModuleCard
            title="Top 5 menos rentables"
            subtitle="Platos con food cost más alto"
            icon={TrendingDown}
            iconTone="terra"
            open={topLeastProfitableOpen}
            onToggle={() => {
              touchActivity();
              setTopLeastProfitableOpen((v) => !v);
            }}
            preview={
              <EscTopDishPreview
                row={topLeastProfitableHero}
                pct={topLeastProfitableHeroPct}
                tone={foodCostTone(topLeastProfitableHeroPct)}
                badgeLabel="Food cost"
                badgeTone="terracotta"
                barMax={50}
              />
            }
          >
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  touchActivity();
                  setRecipeBookOpen(true);
                  libroSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="text-[11px] font-semibold text-zinc-500 underline-offset-2 transition hover:text-zinc-800 hover:underline"
              >
                Ver todos
              </button>
            </div>
            <div className="divide-y divide-zinc-100 rounded-2xl bg-white ring-1 ring-zinc-200/70">
              {topLeastProfitableRows.length === 0 ? (
                <p className="px-3 py-5 text-center text-[12px] text-zinc-500">Sin datos suficientes.</p>
              ) : (
                topLeastProfitableRows.map((row) => {
                  const pct = row.foodCostPct;
                  const tone = foodCostTone(pct);
                  return (
                    <Link
                      key={row.id}
                      href={`/escandallos/recetas/${row.id}/editar`}
                      className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-zinc-50/80"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-zinc-900">{row.name}</p>
                        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-zinc-100">
                          <span className="block h-full rounded-full" style={{ width: pctBarWidth(pct, 50), backgroundColor: tone.bar }} />
                        </span>
                      </div>
                      <Badge tone="terracotta" dense>
                        Food cost
                      </Badge>
                      <span className={`font-mono text-[14px] font-black tabular-nums ${tone.text}`}>
                        {pct != null ? `${pct.toFixed(0)} %` : '—'}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />
                    </Link>
                  );
                })
              )}
            </div>
          </EscModuleCard>

          <EscModuleCard
            title="Rentabilidad por familia"
            subtitle="Margen medio por categoría de carta"
            icon={BarChart3}
            iconTone="zinc"
            open={familyProfitabilityOpen}
            onToggle={() => {
              touchActivity();
              setFamilyProfitabilityOpen((v) => !v);
            }}
            preview={<EscFamilyBarsPreview rows={familySummaryRows} />}
          >
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  touchActivity();
                  setSelectedFamily('Todas');
                }}
                className="text-[11px] font-semibold text-zinc-500 underline-offset-2 transition hover:text-zinc-800 hover:underline"
              >
                Ver todas
              </button>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
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
                    className="rounded-2xl border border-zinc-200/70 bg-white p-3 text-left shadow-sm ring-1 ring-zinc-100/80 transition duration-200 hover:scale-[1.01] hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-800">{family.family}</p>
                        <p className="mt-0.5 text-[10px] text-zinc-500">
                          {family.count} {family.count === 1 ? 'plato' : 'platos'}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide ring-1 ${tone.soft}`}>
                        FC {family.avgFc != null ? `${family.avgFc.toFixed(0)}%` : '—'}
                      </span>
                    </div>
                    <p className="mt-2 text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Margen medio</p>
                    <p className="mt-0.5 font-mono text-[22px] font-black tabular-nums leading-none text-zinc-900">
                      {family.avgMargin != null ? `${family.avgMargin.toFixed(0)} %` : '—'}
                    </p>
                    <div className="mt-2 h-8 rounded-lg bg-zinc-50 px-1 py-1">
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
          </EscModuleCard>
        </>
      )}

      {quickViewRecipe && quickViewRow ? (
        <RecipeQuickViewModal
          open
          mode="escandallo"
          readonly
          localId={localId}
          supabase={isDemoMode() ? null : getSupabaseClient()}
          onClose={() => setQuickViewRecipeId(null)}
          onPrint={() => void handlePrintRecipe(quickViewRecipe.id)}
          editHref={`/escandallos/recetas/${quickViewRecipe.id}/editar`}
          recipe={quickViewRecipe}
          lines={linesByRecipe[quickViewRecipe.id] ?? []}
          rawById={rawById}
          processedById={processedById}
          recipesById={recipesById}
          linesByRecipe={linesByRecipe}
          technicalSheetsByRecipe={technicalSheetsByRecipe}
          centralKitchenById={centralKitchenById}
          costPerYieldEur={quickViewRow.costPerYieldEur}
          saleGrossEur={quickViewRow.saleGrossEur}
          foodCostPct={quickViewRow.foodCostPct}
          marginPct={quickViewRow.foodCostPct != null ? 100 - quickViewRow.foodCostPct : null}
          familyName={familyByRecipeId.get(quickViewRecipe.id)?.trim() || null}
          allDashboardRows={mainRows.map((r) => ({
            recipeId: r.id,
            foodCostPct: r.foodCostPct,
            marginPct: r.foodCostPct != null ? Math.round((100 - r.foodCostPct) * 10) / 10 : null,
            saleGrossEur: r.saleGrossEur,
          }))}
        />
      ) : null}

      {deleteConfirmBase ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(10,9,8,0.45)] px-4 py-6 sm:items-center">
          <div className="w-full max-w-md rounded-[1.75rem] bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] ring-1 ring-zinc-200">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-red-50 text-red-600 ring-1 ring-red-100">
                <AlertTriangle className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <h3 className="text-[20px] font-black text-zinc-950">Eliminar base</h3>
                <p className="mt-1 text-sm text-zinc-600">Esta acción no se puede deshacer.</p>
                {deleteConfirmBase.usageCount > 0 ? (
                  <p className="mt-3 text-sm text-zinc-700">
                    Esta base se usa en {deleteConfirmBase.usageCount}{' '}
                    {deleteConfirmBase.usageCount === 1 ? 'receta' : 'recetas'}. Si la eliminas, esas recetas perderán este componente.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmBase(null)}
                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={baseBusyId === deleteConfirmBase.base.id}
                onClick={() => void handleConfirmDeleteBase()}
                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-[#D32F2F] px-4 text-sm font-bold text-white transition hover:bg-[#B91C1C] disabled:opacity-60"
              >
                {baseBusyId === deleteConfirmBase.base.id ? 'Eliminando…' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
