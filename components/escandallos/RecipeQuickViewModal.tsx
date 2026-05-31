'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChefHat, Edit3, Printer, X } from 'lucide-react';
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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function pctLabel(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? `${Math.round(value * 10) / 10} %` : '—';
}

function toneClass(value: number | null | undefined, inverse = false): string {
  if (value == null || !Number.isFinite(value)) return 'text-zinc-500';
  if (inverse) {
    if (value >= 65) return 'text-emerald-700';
    if (value >= 55) return 'text-amber-700';
    return 'text-red-700';
  }
  if (value <= 30) return 'text-emerald-700';
  if (value <= 35) return 'text-amber-700';
  return 'text-red-700';
}

function sourceBadge(line: EscandalloLine): string | null {
  if (line.sourceType === 'subrecipe') return 'BASE';
  if (line.sourceType === 'processed') return 'ELAB.';
  if (line.sourceType === 'central_kitchen') return 'COCINA CENTRAL';
  return null;
}

function escandalloTypeLabel(recipe: EscandalloRecipe, sheet: EscandalloTechnicalSheet | null): string {
  if (recipe.isSubRecipe) return 'Base / elaboración';
  return sheet?.categoria?.trim() || 'Plato';
}

function fcBarWidth(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return '0%';
  return `${Math.min(100, Math.max(6, (pct / 50) * 100))}%`;
}

function fcBarColor(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return '#a1a1aa';
  if (pct <= 30) return '#4A6B3A';
  if (pct <= 35) return '#B8872A';
  return '#D32F2F';
}

function QuickMetric({
  label,
  value,
  valueClassName = 'text-zinc-950',
  barPct,
  barColor,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  barPct?: number | null;
  barColor?: string;
}) {
  return (
    <div className="rounded-2xl bg-white px-2.5 py-2.5 shadow-sm ring-1 ring-zinc-200/80 sm:px-3 sm:py-3">
      <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-zinc-400 sm:text-[9px] sm:tracking-[0.14em]">{label}</p>
      <p className={`mt-0.5 font-mono text-base font-bold tabular-nums leading-none sm:mt-1 sm:text-[1.15rem] ${valueClassName}`}>{value}</p>
      {barPct != null && Number.isFinite(barPct) ? (
        <span className="mt-2 block h-1 overflow-hidden rounded-full bg-zinc-100">
          <span
            className="block h-full rounded-full transition-all duration-300"
            style={{ width: fcBarWidth(barPct), backgroundColor: barColor ?? fcBarColor(barPct) }}
          />
        </span>
      ) : null}
    </div>
  );
}

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

  useEffect(() => {
    if (!open || !localId || !supabase) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      if (mode === 'escandallo') {
        void Promise.all([
          fetchEscandalloTechnicalSheetWithSteps(supabase, localId, recipeId).catch(() => ({ sheet: null, steps: [] })),
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
  const title = isEsc ? props.recipe.name : props.recipe.name;
  const updatedAt = isEsc ? props.recipe.updatedAt : props.recipe.updated_at;
  const photoUrl = isEsc ? getOfficialRecipePhotoUrl(sheet) : null;
  const costPerUnit = isEsc ? props.costPerYieldEur ?? null : centralCost?.unit ?? null;
  const pvp = isEsc ? props.saleGrossEur ?? null : null;
  const foodCost = isEsc ? props.foodCostPct ?? null : null;
  const margin = isEsc ? props.marginPct ?? null : null;
  const typeLabel = isEsc ? escandalloTypeLabel(props.recipe, sheet) : props.recipe.recipe_category ?? 'Cocina Central';
  const familyLabel = isEsc ? props.recipe.yieldLabel : props.recipe.operative_format_label ?? props.recipe.final_unit;
  const yieldLabel = isEsc
    ? `${props.recipe.yieldQty} ${props.recipe.yieldLabel}`
    : `${props.recipe.base_yield_quantity} ${props.recipe.final_unit}`;

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
        <section className="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-[2rem] bg-[#f5f5f7] shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:max-h-[88vh] sm:max-w-3xl sm:rounded-[2rem]">
          <header className="relative overflow-hidden bg-gradient-to-b from-white via-white to-[#f5f5f7]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(ellipse_at_top,rgba(74,107,58,0.08),transparent_70%)] sm:h-24" />
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/95 text-zinc-900 shadow-sm ring-1 ring-zinc-200/90 transition hover:scale-[1.03] active:scale-[0.98]"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Móvil: foto ancha, plato completo */}
            <div className="relative px-4 pb-1 pt-3 sm:hidden">
              <div className="overflow-hidden rounded-[1.35rem] bg-gradient-to-b from-[#F7F3EE] via-white to-[#FAFAF9] px-3 py-4 shadow-[0_8px_28px_rgba(0,0,0,0.06)] ring-1 ring-zinc-200/80">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrl}
                    alt=""
                    loading="lazy"
                    className="mx-auto block max-h-[min(52vw,240px)] w-full object-contain object-center"
                  />
                ) : (
                  <div className="grid min-h-[180px] w-full place-items-center">
                    <ChefHat className="h-10 w-10 text-zinc-300" strokeWidth={1.8} />
                  </div>
                )}
              </div>
              <div className="mt-3 pr-8 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">{typeLabel}</p>
                <h2 className="mt-1 font-serif text-[1.4rem] font-normal leading-[1.1] tracking-tight text-zinc-950">
                  {title}
                </h2>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-zinc-600 shadow-sm ring-1 ring-zinc-200/80">
                    {familyLabel}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-zinc-600 shadow-sm ring-1 ring-zinc-200/80">
                    {yieldLabel}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-medium tabular-nums text-zinc-500 shadow-sm ring-1 ring-zinc-200/80">
                    Act. {formatDate(updatedAt)}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-100/90">
                    {isEsc ? 'Activo' : props.recipe.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
            </div>

            {/* Escritorio: foto + datos en fila */}
            <div className="relative hidden gap-5 p-5 sm:grid sm:grid-cols-[12.5rem_1fr]">
              <div className="mx-auto aspect-square w-52 overflow-hidden rounded-[1.35rem] bg-[#F7F3EE] shadow-[0_8px_28px_rgba(0,0,0,0.08)] ring-1 ring-zinc-200/80">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[#F7F3EE] to-white text-center">
                    <ChefHat className="h-10 w-10 text-zinc-300" strokeWidth={1.8} />
                  </div>
                )}
              </div>
              <div className="min-w-0 pr-9">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">{typeLabel}</p>
                <h2 className="mt-1 font-serif text-[1.65rem] font-normal leading-[1.12] tracking-tight text-zinc-950">
                  {title}
                </h2>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-zinc-600 shadow-sm ring-1 ring-zinc-200/80">
                    {familyLabel}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-zinc-600 shadow-sm ring-1 ring-zinc-200/80">
                    {yieldLabel}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-medium tabular-nums text-zinc-500 shadow-sm ring-1 ring-zinc-200/80">
                    Act. {formatDate(updatedAt)}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-100/90">
                    {isEsc ? 'Activo' : props.recipe.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
            {loading ? (
              <p className="rounded-2xl bg-white p-4 text-center text-sm text-zinc-500 shadow-sm ring-1 ring-zinc-200/80">
                Cargando ficha…
              </p>
            ) : null}

            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <QuickMetric label="Coste/ración" value={costPerUnit != null ? formatMoneyEur(costPerUnit) : '—'} />
              <QuickMetric label="PVP" value={pvp != null ? formatMoneyEur(pvp) : '—'} />
              <QuickMetric
                label="Food cost"
                value={pctLabel(foodCost)}
                valueClassName={toneClass(foodCost)}
                barPct={foodCost}
                barColor={fcBarColor(foodCost)}
              />
              <QuickMetric
                label="Margen"
                value={pctLabel(margin)}
                valueClassName={toneClass(margin, true)}
                barPct={margin}
                barColor={margin != null && margin >= 65 ? '#4A6B3A' : margin != null && margin >= 55 ? '#B8872A' : '#D32F2F'}
              />
            </section>

            <section className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/80">
              <div className="border-b border-zinc-100 bg-zinc-50/70 px-4 py-2.5">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Ingredientes</h3>
              </div>
              {isEsc ? (
                <ul className="divide-y divide-zinc-100">
                  {escandalloResolved.map(({ line, resolved }) => {
                    const badge = sourceBadge(line);
                    return (
                      <li key={line.id} className="flex items-start justify-between gap-3 px-4 py-2.5 transition hover:bg-zinc-50/60">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold leading-snug text-zinc-900">
                            <span className="mr-1.5 font-mono text-[12px] font-bold tabular-nums text-zinc-500">
                              {line.qty} {resolved.displayUnit}
                            </span>
                            {line.label}
                          </p>
                          {badge ? (
                            <span
                              className={[
                                'mt-1 inline-flex rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] ring-1',
                                badge === 'BASE'
                                  ? 'bg-[#4A6B3A]/10 text-[#35502A] ring-[#4A6B3A]/15'
                                  : badge === 'COCINA CENTRAL'
                                    ? 'bg-amber-50 text-amber-800 ring-amber-100'
                                    : 'bg-zinc-100 text-zinc-600 ring-zinc-200',
                              ].join(' ')}
                            >
                              {badge}
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
                <ul className="divide-y divide-zinc-100">
                  {centralLines.map((line) => (
                    <li key={line.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                      <p className="min-w-0 text-[13px] font-semibold text-zinc-900">
                        <span className="mr-1.5 font-mono text-[12px] font-bold tabular-nums text-zinc-500">
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
              )}
            </section>

            <section className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                {
                  label: 'Salida',
                  value: isEsc
                    ? sheet?.yieldQuantity && sheet.yieldUnit
                      ? `${sheet.yieldQuantity} ${sheet.yieldUnit}`
                      : yieldLabel
                    : yieldLabel,
                },
                { label: 'Merma', value: isEsc ? pctLabel(sheet?.yieldMermaPct) : '—' },
                {
                  label: 'Coste salida',
                  value:
                    isEsc && sheet?.yieldCostPerUnit != null && sheet.yieldUnit
                      ? formatUnitPriceEur(sheet.yieldCostPerUnit, sheet.yieldUnit)
                      : centralCost?.unit != null
                        ? formatUnitPriceEur(centralCost.unit, isEsc ? 'ud' : props.recipe.final_unit)
                        : '—',
                },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-zinc-200/80">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{item.label}</p>
                  <p className="mt-1 font-mono text-base font-bold tabular-nums text-zinc-950">{item.value}</p>
                </div>
              ))}
            </section>

            <section className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/80">
              <div className="border-b border-zinc-100 bg-zinc-50/70 px-4 py-2.5">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Proceso</h3>
              </div>
              <div className="px-4 py-3">
                {isEsc ? (
                  steps.length > 0 ? (
                    <ol className="space-y-3">
                      {steps.map((step, i) => (
                        <li key={step.id} className="flex gap-3">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-[#D32F2F] text-[11px] font-bold text-white shadow-sm">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            {step.titulo ? <p className="text-sm font-semibold text-zinc-900">{step.titulo}</p> : null}
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">{step.descripcion}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : sheet?.notasChef || sheet?.puntosCriticos ? (
                    <div className="space-y-2 text-sm leading-relaxed text-zinc-600">
                      {sheet.notasChef ? <p className="whitespace-pre-wrap">{sheet.notasChef}</p> : null}
                      {sheet.puntosCriticos ? <p className="whitespace-pre-wrap">{sheet.puntosCriticos}</p> : null}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">Sin proceso registrado.</p>
                  )
                ) : props.recipe.procedure_notes ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">{props.recipe.procedure_notes}</p>
                ) : (
                  <p className="text-sm text-zinc-500">Sin procedimiento registrado.</p>
                )}
              </div>
            </section>

            {isEsc && sheet && (sheet.emplatadoDescripcion || sheet.emplatadoDecoracion || sheet.emplatadoMenaje) ? (
              <section className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/80">
                <div className="border-b border-zinc-100 bg-zinc-50/70 px-4 py-2.5">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Emplatado</h3>
                </div>
                <div className="space-y-2 px-4 py-3 text-sm leading-relaxed text-zinc-600">
                  {sheet.emplatadoDescripcion ? (
                    <p>
                      <span className="font-semibold text-zinc-800">Montaje:</span> {sheet.emplatadoDescripcion}
                    </p>
                  ) : null}
                  {sheet.emplatadoDecoracion ? (
                    <p>
                      <span className="font-semibold text-zinc-800">Decoración:</span> {sheet.emplatadoDecoracion}
                    </p>
                  ) : null}
                  {sheet.emplatadoMenaje ? (
                    <p>
                      <span className="font-semibold text-zinc-800">Soporte:</span> {sheet.emplatadoMenaje}
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}

            {isEsc && allergens.length > 0 ? (
              <section className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-amber-100">
                <div className="border-b border-amber-100 bg-amber-50/80 px-4 py-2.5">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-800">Alérgenos</h3>
                </div>
                <div className="flex flex-wrap gap-2 px-4 py-3">
                  {allergens.map((row) => (
                    <span
                      key={row.id}
                      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-900 ring-1 ring-amber-100"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {row.allergen?.name ?? row.allergen_id}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <footer className="grid grid-cols-3 gap-2 border-t border-zinc-200/80 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] backdrop-blur-sm">
            {props.editHref ? (
              <Link
                href={props.editHref}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-zinc-200/90 bg-white text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-50 active:scale-[0.99]"
              >
                <Edit3 className="h-4 w-4" />
                Editar
              </Link>
            ) : (
              <span className="inline-flex h-11 items-center justify-center rounded-2xl border border-zinc-100 bg-zinc-50 text-sm font-semibold text-zinc-400">
                Editar
              </span>
            )}
            <button
              type="button"
              onClick={props.onPrint}
              disabled={!props.onPrint}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-zinc-200/90 bg-white text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-50 active:scale-[0.99] disabled:opacity-40"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#D32F2F] text-sm font-semibold text-white shadow-[0_4px_14px_rgba(211,47,47,0.28)] transition hover:bg-[#B91C1C] active:scale-[0.99]"
            >
              Cerrar
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
}
