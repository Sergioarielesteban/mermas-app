'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChefHat, ChevronDown, Edit3, Printer, X } from 'lucide-react';
import RecipePriceSimulatorPanel from '@/components/escandallos/RecipePriceSimulatorPanel';
import {
  buildFamilyPriceBenchmark,
  compareRecipeToFamily,
  type FamilyBenchmarkRow,
  type FamilyComparison,
  type FamilyPriceBenchmark,
} from '@/lib/escandallo-price-simulator';
import { fetchRecipeAllergensForLocal, type RecipeAllergenRow } from '@/lib/appcc-allergens-supabase';
import type { EscandalloCentralKitchenCatalogItem } from '@/lib/central-kitchen-public-catalog';
import {
  fetchEscandalloTechnicalSheetWithSteps,
  getOfficialRecipePhotoUrl,
  type EscandalloTechnicalSheet,
  type EscandalloTechnicalSheetStep,
} from '@/lib/escandallos-technical-sheet-supabase';
import {
  type EscandalloLine,
  type EscandalloProcessedProduct,
  type EscandalloRawProduct,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import { resolveEscandalloLineCost } from '@/lib/escandallos-cost-engine';
import { formatMoneyEur, formatUnitPriceEur } from '@/lib/money-format';
import { computeProductionRecipeCostBreakdown } from '@/lib/production-recipe-cost';
import {
  prGetRecipeLines,
  type ProductionRecipeLineRow,
  type ProductionRecipeRow,
} from '@/lib/production-recipes-supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type EscandalloPayload = {
  mode: 'escandallo';
  recipe: EscandalloRecipe;
  lines: EscandalloLine[];
  rawById: Map<string, EscandalloRawProduct>;
  processedById: Map<string, EscandalloProcessedProduct>;
  recipesById: Map<string, EscandalloRecipe>;
  linesByRecipe: Record<string, EscandalloLine[]>;
  technicalSheetsByRecipe: Map<string, EscandalloTechnicalSheet>;
  centralKitchenById?: Map<string, EscandalloCentralKitchenCatalogItem>;
  costPerYieldEur?: number | null;
  saleGrossEur?: number | null;
  foodCostPct?: number | null;
  marginPct?: number | null;
  /** Familia carta del plato (de escandallo_technical_sheets.categoria). */
  familyName?: string | null;
  /** Todas las rows de platos del local (para calcular benchmark). */
  allDashboardRows?: FamilyBenchmarkRow[];
};

type CentralPayload = {
  mode: 'central_kitchen';
  recipe: ProductionRecipeRow;
};

export type RecipeQuickViewModalProps = {
  open: boolean;
  readonly?: boolean;
  localId: string | null;
  supabase: SupabaseClient | null;
  onClose: () => void;
  onPrint?: () => void;
  editHref?: string | null;
} & (EscandalloPayload | CentralPayload);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function pctLabel(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? `${Math.round(value * 10) / 10} %` : '—';
}

function fcToneClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'text-zinc-500';
  if (value <= 30) return 'text-emerald-700';
  if (value <= 35) return 'text-amber-700';
  return 'text-red-700';
}

function marginToneClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'text-zinc-500';
  if (value >= 65) return 'text-emerald-700';
  if (value >= 55) return 'text-amber-700';
  return 'text-red-700';
}

function barWidth(pct: number | null | undefined, max = 50): string {
  if (pct == null || !Number.isFinite(pct)) return '0%';
  return `${Math.min(100, Math.max(6, (pct / max) * 100))}%`;
}

function sourceBadge(line: EscandalloLine): { label: string; cls: string } | null {
  if (line.sourceType === 'subrecipe')
    return { label: 'BASE', cls: 'bg-[#4A6B3A]/10 text-[#35502A] ring-[#4A6B3A]/20' };
  if (line.sourceType === 'processed')
    return { label: 'ELAB.', cls: 'bg-zinc-100 text-zinc-600 ring-zinc-200' };
  if (line.sourceType === 'central_kitchen')
    return { label: 'COCINA CENTRAL', cls: 'bg-amber-50 text-amber-800 ring-amber-100' };
  return null;
}

function escandalloTypeLabel(recipe: EscandalloRecipe, sheet: EscandalloTechnicalSheet | null): string {
  if (recipe.isSubRecipe) return 'Base / elaboración';
  return sheet?.categoria?.trim() || 'Plato';
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-zinc-100 bg-zinc-50/70 px-4 py-2.5">
      <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">{children}</h3>
    </div>
  );
}

function MetricCard({
  label,
  value,
  valueClass = 'text-zinc-950',
  bar,
  barColor,
}: {
  label: string;
  value: string;
  valueClass?: string;
  bar?: number | null;
  barColor?: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-zinc-200/70">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{label}</p>
      <p className={`mt-1 font-mono text-[1.05rem] font-bold tabular-nums leading-none ${valueClass}`}>
        {value}
      </p>
      {bar != null && Number.isFinite(bar) ? (
        <span className="mt-2 block h-1 overflow-hidden rounded-full bg-zinc-100">
          <span
            className="block h-full rounded-full"
            style={{ width: barWidth(bar), backgroundColor: barColor ?? '#a1a1aa', transition: 'width 300ms' }}
          />
        </span>
      ) : null}
    </div>
  );
}

function ConservationSection({ sheet }: { sheet: EscandalloTechnicalSheet }) {
  const rows = [
    { label: 'Tipo conservación', value: sheet.tipoConservacion },
    { label: 'Temperatura', value: sheet.temperaturaConservacion },
    { label: 'Vida útil', value: sheet.vidaUtil },
    { label: 'Regeneración', value: sheet.regeneracion },
    { label: 'Temp. servicio', value: sheet.temperaturaServicio },
  ].filter((r) => r.value.trim());

  if (rows.length === 0) return null;

  return (
    <section className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/80">
      <SectionHeader>Conservación y servicio</SectionHeader>
      <dl className="divide-y divide-zinc-100">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
            <dt className="text-[11px] font-semibold text-zinc-500">{r.label}</dt>
            <dd className="text-right text-[12px] font-semibold text-zinc-900">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PhotoPlaceholder() {
  return (
    <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 py-8 text-center">
      <ChefHat className="h-9 w-9 text-zinc-300" strokeWidth={1.5} />
      <p className="text-[10px] font-medium text-zinc-400">Sin foto de emplatado</p>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function RecipeQuickViewModal(props: RecipeQuickViewModalProps) {
  const { open, localId, supabase, onClose } = props;
  const mode = props.mode;
  const recipeId = props.recipe.id;

  const [sheet, setSheet] = useState<EscandalloTechnicalSheet | null>(null);
  const [steps, setSteps] = useState<EscandalloTechnicalSheetStep[]>([]);
  const [allergens, setAllergens] = useState<RecipeAllergenRow[]>([]);
  const [centralLines, setCentralLines] = useState<ProductionRecipeLineRow[]>([]);
  const [centralCost, setCentralCost] = useState<{ total: number; unit: number | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);

  useEffect(() => {
    if (!open || !localId || !supabase) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      if (mode === 'escandallo') {
        void Promise.all([
          fetchEscandalloTechnicalSheetWithSteps(supabase, localId, recipeId).catch(() => ({
            sheet: null,
            steps: [],
          })),
          fetchRecipeAllergensForLocal(supabase, localId).catch(() => [] as RecipeAllergenRow[]),
        ])
          .then(([pack, rows]) => {
            if (cancelled) return;
            setSheet(pack.sheet);
            setSteps(pack.steps);
            setAllergens(rows.filter((row) => row.recipe_id === recipeId));
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      } else {
        void Promise.all([
          prGetRecipeLines(supabase, recipeId).catch(() => [] as ProductionRecipeLineRow[]),
          computeProductionRecipeCostBreakdown(supabase, localId, recipeId).catch(() => null),
        ])
          .then(([lines, cost]) => {
            if (cancelled) return;
            setCentralLines(lines);
            setCentralCost(cost ? { total: cost.totalIngredientsEur, unit: cost.costPerYieldUnitEur } : null);
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, localId, supabase, mode, recipeId]);

  const escandalloResolved = useMemo(() => {
    if (props.mode !== 'escandallo') return [];
    const centralKitchenById = props.centralKitchenById ?? new Map();
    return props.lines.map((line) => {
      const resolved = resolveEscandalloLineCost({
        line,
        rawProductById: props.rawById,
        processedById: props.processedById,
        context: {
          linesByRecipe: props.linesByRecipe,
          recipesById: props.recipesById,
          technicalSheetsByRecipe: props.technicalSheetsByRecipe,
          centralKitchenById,
          recipeId: props.recipe.id,
        },
      });
      return { line, resolved };
    });
  }, [props]);

  if (!open) return null;

  const isEsc = props.mode === 'escandallo';

  // ── Benchmark familiar para el simulador ──────────────────────────────────
  const simFamilyName =
    isEsc && !props.recipe.isSubRecipe ? (props.familyName?.trim() || null) : null;

  const simBenchmarkRows: FamilyBenchmarkRow[] = isEsc ? (props.allDashboardRows ?? []) : [];

  const simFamilyBenchmark: FamilyPriceBenchmark | null = simFamilyName && simBenchmarkRows.length > 0
    ? buildFamilyPriceBenchmark({
        familyName: simFamilyName,
        rows: simBenchmarkRows,
        excludeRecipeId: props.recipe.id,
        minSampleWithFc: 3,
      })
    : null;

  const simFamilyComparison: FamilyComparison | null =
    simFamilyBenchmark?.sufficient && isEsc
      ? compareRecipeToFamily({
          foodCostPct: props.foodCostPct ?? null,
          marginPct: props.marginPct ?? null,
          pvpGrossEur: props.saleGrossEur ?? null,
          benchmark: simFamilyBenchmark,
        })
      : null;
  // ──────────────────────────────────────────────────────────────────────────
  const title = props.recipe.name;
  const updatedAt = isEsc ? props.recipe.updatedAt : props.recipe.updated_at;
  const photoUrl = isEsc ? getOfficialRecipePhotoUrl(sheet) : null;
  const costPerUnit = isEsc ? (props.costPerYieldEur ?? null) : (centralCost?.unit ?? null);
  const pvp = isEsc ? (props.saleGrossEur ?? null) : null;
  const foodCost = isEsc ? (props.foodCostPct ?? null) : null;
  const margin = isEsc ? (props.marginPct ?? null) : null;
  const typeLabel = isEsc
    ? escandalloTypeLabel(props.recipe, sheet)
    : (props.recipe.recipe_category ?? 'Cocina Central');
  const familyLabel = isEsc
    ? props.recipe.yieldLabel
    : (props.recipe.operative_format_label ?? props.recipe.final_unit);
  const yieldLabel = isEsc
    ? `${props.recipe.yieldQty} ${props.recipe.yieldLabel}`
    : `${props.recipe.base_yield_quantity} ${props.recipe.final_unit}`;

  const fcColor = foodCost != null ? (foodCost <= 30 ? '#4A6B3A' : foodCost <= 35 ? '#B8872A' : '#D32F2F') : '#a1a1aa';
  const marginColor = margin != null ? (margin >= 65 ? '#4A6B3A' : margin >= 55 ? '#B8872A' : '#D32F2F') : '#a1a1aa';

  const hasConservation =
    isEsc &&
    sheet &&
    [sheet.tipoConservacion, sheet.temperaturaConservacion, sheet.vidaUtil, sheet.regeneracion, sheet.temperaturaServicio].some(
      (v) => v?.trim(),
    );

  const hasEmplatado =
    isEsc && sheet && (sheet.emplatadoDescripcion || sheet.emplatadoDecoracion || sheet.emplatadoMenaje);

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
        <section className="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-[2rem] bg-[#F7F3EE] shadow-[0_-8px_60px_rgba(0,0,0,0.18)] sm:max-h-[90vh] sm:max-w-2xl sm:rounded-[2rem] sm:shadow-[0_24px_80px_rgba(0,0,0,0.2)]">

          {/* ── Cabecera ── */}
          <header className="relative bg-gradient-to-b from-white to-[#F7F3EE]">
            {/* Cierre */}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/95 text-zinc-700 shadow-sm ring-1 ring-zinc-200/90 transition hover:scale-[1.04] active:scale-[0.97]"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Móvil: foto arriba centrada, texto debajo */}
            <div className="px-4 pb-3 pt-4 sm:hidden">
              {/* Foto — altura máxima en la propia img; sin overflow-hidden que recorte */}
              <div className="rounded-[1.25rem] bg-[#F7F3EE] p-3 shadow-[0_6px_24px_rgba(0,0,0,0.07)] ring-1 ring-zinc-200/70">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrl}
                    alt={title}
                    loading="lazy"
                    className="mx-auto block h-auto w-full max-h-[min(52dvh,480px)] object-contain object-center"
                  />
                ) : (
                  <PhotoPlaceholder />
                )}
              </div>
              <div className="mt-3 pr-8">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  {typeLabel}
                </p>
                <h2 className="mt-1 font-serif text-[1.35rem] font-normal leading-tight tracking-tight text-zinc-950">
                  {title}
                </h2>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Chip>{familyLabel}</Chip>
                  <Chip>{yieldLabel}</Chip>
                  <Chip muted>Act. {formatDate(updatedAt)}</Chip>
                  <Chip active>{isEsc ? 'Activo' : props.recipe.is_active ? 'Activo' : 'Inactivo'}</Chip>
                </div>
              </div>
            </div>

            {/* Desktop: foto lateral cuadrada + datos */}
            <div className="relative hidden gap-5 p-5 sm:grid sm:grid-cols-[11rem_1fr]">
              <div className="flex w-44 items-center justify-center rounded-[1.25rem] bg-[#F7F3EE] p-2 shadow-[0_8px_28px_rgba(0,0,0,0.08)] ring-1 ring-zinc-200/70">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrl}
                    alt={title}
                    loading="lazy"
                    className="mx-auto block h-auto w-full max-h-44 object-contain object-center"
                  />
                ) : (
                  <PhotoPlaceholder />
                )}
              </div>
              <div className="min-w-0 pr-10">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  {typeLabel}
                </p>
                <h2 className="mt-1 font-serif text-[1.6rem] font-normal leading-[1.1] tracking-tight text-zinc-950">
                  {title}
                </h2>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Chip>{familyLabel}</Chip>
                  <Chip>{yieldLabel}</Chip>
                  <Chip muted>Act. {formatDate(updatedAt)}</Chip>
                  <Chip active>{isEsc ? 'Activo' : props.recipe.is_active ? 'Activo' : 'Inactivo'}</Chip>
                </div>
              </div>
            </div>
          </header>

          {/* ── Cuerpo scrollable ── */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
            {loading ? (
              <p className="rounded-2xl bg-white px-4 py-3 text-center text-[12px] text-zinc-400 shadow-sm ring-1 ring-zinc-100">
                Cargando ficha técnica…
              </p>
            ) : null}

            {/* ── Métricas de coste ── */}
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricCard
                label={isEsc ? 'Coste/ración' : 'Coste unitario'}
                value={costPerUnit != null ? formatMoneyEur(costPerUnit) : '—'}
              />
              <MetricCard label="PVP" value={pvp != null ? formatMoneyEur(pvp) : '—'} />
              <MetricCard
                label="Food cost"
                value={pctLabel(foodCost)}
                valueClass={fcToneClass(foodCost)}
                bar={foodCost}
                barColor={fcColor}
              />
              <MetricCard
                label="Margen"
                value={pctLabel(margin)}
                valueClass={marginToneClass(margin)}
                bar={margin}
                barColor={marginColor}
              />
            </section>

            {/* ── Ingredientes ── */}
            <section className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/80">
              <SectionHeader>Ingredientes</SectionHeader>
              {isEsc ? (
                escandalloResolved.length > 0 ? (
                  <ul className="divide-y divide-zinc-100">
                    {escandalloResolved.map(({ line, resolved }) => {
                      const badge = sourceBadge(line);
                      return (
                        <li
                          key={line.id}
                          className="flex items-start justify-between gap-3 px-4 py-2.5 transition hover:bg-zinc-50/60"
                        >
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold leading-snug text-zinc-900">
                              <span className="mr-1.5 font-mono text-[11px] font-bold tabular-nums text-zinc-400">
                                {line.qty} {resolved.displayUnit}
                              </span>
                              {line.label}
                            </p>
                            {badge ? (
                              <span
                                className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] ring-1 ${badge.cls}`}
                              >
                                {badge.label}
                              </span>
                            ) : null}
                          </div>
                          <p className="shrink-0 font-mono text-[13px] font-bold tabular-nums text-zinc-900">
                            {formatMoneyEur(resolved.totalCost)}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="px-4 py-4 text-[12px] text-zinc-400">Sin ingredientes registrados.</p>
                )
              ) : centralLines.length > 0 ? (
                <ul className="divide-y divide-zinc-100">
                  {centralLines.map((line) => (
                    <li
                      key={line.id}
                      className="flex items-start justify-between gap-3 px-4 py-2.5"
                    >
                      <p className="min-w-0 text-[13px] font-semibold text-zinc-900">
                        <span className="mr-1.5 font-mono text-[11px] font-bold tabular-nums text-zinc-400">
                          {line.quantity} {line.unit}
                        </span>
                        {line.ingredient_name_snapshot}
                      </p>
                      {line.manual_unit_cost_eur != null ? (
                        <p className="shrink-0 font-mono text-[13px] font-bold tabular-nums text-zinc-900">
                          {formatUnitPriceEur(line.manual_unit_cost_eur, line.unit)}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-4 text-[12px] text-zinc-400">Sin ingredientes.</p>
              )}
            </section>

            {/* ── Producción / salida ── */}
            {(() => {
              const salida = isEsc
                ? sheet?.yieldQuantity && sheet.yieldUnit
                  ? `${sheet.yieldQuantity} ${sheet.yieldUnit}`
                  : yieldLabel
                : yieldLabel;
              const merma = isEsc ? pctLabel(sheet?.yieldMermaPct) : null;
              const costeSalida =
                isEsc && sheet?.yieldCostPerUnit != null && sheet.yieldUnit
                  ? formatUnitPriceEur(sheet.yieldCostPerUnit, sheet.yieldUnit)
                  : centralCost?.unit != null
                    ? formatUnitPriceEur(centralCost.unit, isEsc ? 'ud' : props.recipe.final_unit)
                    : null;

              if (!costeSalida && merma == null) return null;

              return (
                <section className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-zinc-200/80">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Salida</p>
                    <p className="mt-1 font-mono text-[0.95rem] font-bold text-zinc-950">{salida}</p>
                  </div>
                  {merma ? (
                    <div className="rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-zinc-200/80">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Merma</p>
                      <p className="mt-1 font-mono text-[0.95rem] font-bold text-zinc-950">{merma}</p>
                    </div>
                  ) : null}
                  {costeSalida ? (
                    <div className="rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-zinc-200/80">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Coste salida</p>
                      <p className="mt-1 font-mono text-[0.95rem] font-bold text-zinc-950">{costeSalida}</p>
                    </div>
                  ) : null}
                </section>
              );
            })()}

            {/* ── Proceso ── */}
            <section className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/80">
              <SectionHeader>Proceso de elaboración</SectionHeader>
              <div className="px-4 py-3">
                {isEsc ? (
                  steps.length > 0 ? (
                    <ol className="space-y-3">
                      {steps.map((step, i) => (
                        <li key={step.id} className="flex gap-3">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-[#C4531F] text-[11px] font-bold text-white shadow-sm">
                            {i + 1}
                          </span>
                          <div className="min-w-0 pt-0.5">
                            {step.titulo ? (
                              <p className="text-[13px] font-bold text-zinc-900">{step.titulo}</p>
                            ) : null}
                            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-600">
                              {step.descripcion}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : sheet?.notasChef || sheet?.puntosCriticos ? (
                    <div className="space-y-2 text-[13px] leading-relaxed text-zinc-600">
                      {sheet.notasChef ? <p className="whitespace-pre-wrap">{sheet.notasChef}</p> : null}
                      {sheet.puntosCriticos ? (
                        <p className="whitespace-pre-wrap">{sheet.puntosCriticos}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-[12px] text-zinc-400">Sin pasos definidos.</p>
                  )
                ) : props.recipe.procedure_notes ? (
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-600">
                    {props.recipe.procedure_notes}
                  </p>
                ) : (
                  <p className="text-[12px] text-zinc-400">Sin procedimiento registrado.</p>
                )}
              </div>
            </section>

            {/* ── Emplatado ── */}
            {hasEmplatado ? (
              <section className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/80">
                <SectionHeader>Emplatado</SectionHeader>
                <div className="space-y-2 px-4 py-3 text-[13px] leading-relaxed text-zinc-600">
                  {sheet!.emplatadoDescripcion ? (
                    <p>
                      <span className="font-semibold text-zinc-800">Montaje:</span>{' '}
                      {sheet!.emplatadoDescripcion}
                    </p>
                  ) : null}
                  {sheet!.emplatadoDecoracion ? (
                    <p>
                      <span className="font-semibold text-zinc-800">Decoración:</span>{' '}
                      {sheet!.emplatadoDecoracion}
                    </p>
                  ) : null}
                  {sheet!.emplatadoMenaje ? (
                    <p>
                      <span className="font-semibold text-zinc-800">Soporte:</span>{' '}
                      {sheet!.emplatadoMenaje}
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}

            {/* ── Conservación ── */}
            {hasConservation ? <ConservationSection sheet={sheet!} /> : null}

            {/* ── Alérgenos ── */}
            {isEsc && allergens.length > 0 ? (
              <section className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-amber-100">
                <div className="border-b border-amber-100 bg-amber-50/80 px-4 py-2.5">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-800">
                    Alérgenos
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2 px-4 py-3">
                  {allergens.map((row) => (
                    <span
                      key={row.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-900 ring-1 ring-amber-200"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {row.allergen?.name ?? row.allergen_id}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {/* ── Simulador precio recomendado (solo platos) ── */}
            {isEsc && !props.recipe.isSubRecipe ? (
              <section className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/80">
                <button
                  type="button"
                  onClick={() => setSimulatorOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-zinc-50/60"
                >
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">Precio recomendado</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">Simula PVP, food cost y margen</p>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${simulatorOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {simulatorOpen ? (
                  <div className="border-t border-zinc-100 px-3 pb-3 pt-2">
                    <RecipePriceSimulatorPanel
                      totalCostEur={props.costPerYieldEur != null && props.recipe.yieldQty > 0
                        ? props.costPerYieldEur * props.recipe.yieldQty
                        : 0}
                      yieldQty={props.recipe.yieldQty > 0 ? props.recipe.yieldQty : 1}
                      vatRatePct={props.recipe.saleVatRatePct ?? 10}
                      currentPvpGrossEur={props.saleGrossEur ?? null}
                      familyName={simFamilyName}
                      familyBenchmark={simFamilyBenchmark}
                      familyComparison={simFamilyComparison}
                      hasIngredients={props.lines.length > 0}
                      readonly
                      embedded
                    />
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* Espacio al fondo */}
            <div className="h-3" />
          </div>

          {/* ── Footer sticky ── */}
          <footer className="flex gap-2 border-t border-zinc-200/80 bg-white/95 px-4 pb-[max(0.875rem,env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur-sm">
            {props.editHref ? (
              <Link
                href={props.editHref}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white py-3 text-[13px] font-bold text-zinc-900 shadow-sm transition hover:bg-zinc-50 active:scale-[0.99]"
              >
                <Edit3 className="h-4 w-4" />
                Editar
              </Link>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-zinc-100 bg-zinc-50 py-3 text-[13px] font-semibold text-zinc-300">
                Editar
              </div>
            )}
            <button
              type="button"
              onClick={props.onPrint}
              disabled={!props.onPrint}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white py-3 text-[13px] font-bold text-zinc-900 shadow-sm transition hover:bg-zinc-50 active:scale-[0.99] disabled:opacity-40"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex flex-1 items-center justify-center rounded-2xl bg-[#4A6B3A] py-3 text-[13px] font-bold text-white shadow-[0_4px_14px_rgba(74,107,58,0.25)] transition hover:bg-[#3d5a30] active:scale-[0.99]"
            >
              Cerrar
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
}

// Chip inline helper — evita repetir className
function Chip({
  children,
  muted,
  active,
}: {
  children: React.ReactNode;
  muted?: boolean;
  active?: boolean;
}) {
  if (active) {
    return (
      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
        {children}
      </span>
    );
  }
  return (
    <span
      className={`rounded-full bg-white px-2.5 py-1 text-[10px] shadow-sm ring-1 ring-zinc-200/80 ${
        muted ? 'font-medium tabular-nums text-zinc-500' : 'font-semibold text-zinc-700'
      }`}
    >
      {children}
    </span>
  );
}
