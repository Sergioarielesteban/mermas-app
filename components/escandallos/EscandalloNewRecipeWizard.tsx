'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  ChevronDown,
  ClipboardList,
  Flame,
  Refrigerator,
  Save,
  ShieldCheck,
  StickyNote,
  Utensils,
} from 'lucide-react';
import EscandalloIngredientDraftEditor from '@/components/escandallos/EscandalloIngredientDraftEditor';
import { useAuth } from '@/components/AuthProvider';
import {
  emptyIngredientDraft,
  foodCostStatus,
  parseDecimal,
  draftRowsToPayloads,
  insertPayloadsToTempLines,
  type IngredientDraftRow,
} from '@/lib/escandallos-recipe-draft-utils';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  fetchEscandalloLines,
  fetchEscandalloRecipes,
  fetchProcessedProductsForEscandallo,
  fetchEscandalloRawProductsWithWeightedPurchasePrices,
  foodCostPercentOfNetSale,
  insertEscandalloLinesBatch,
  insertEscandalloRecipe,
  recipeTotalCostEur,
  saleNetPerUnitFromGross,
  type EscandalloLine,
  type EscandalloProcessedProduct,
  type EscandalloRawProduct,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import { writeEscandalloWizardBeforeArticulosNav } from '@/lib/escandallo-articulos-nav';
import {
  clearEscandalloQuickCalcPrefill,
  readEscandalloQuickCalcPrefill,
} from '@/lib/escandallo-quick-calc-prefill';
import {
  clearEscandalloWizardDraft,
  readEscandalloWizardDraft,
  writeEscandalloWizardDraft,
} from '@/lib/escandallo-session-persist';
import { formatMoneyEur } from '@/lib/money-format';

type RecipeKind = 'plato' | 'base' | 'subelaboracion';

const RECIPE_KIND_OPTIONS: Array<{ value: RecipeKind; label: string; defaultYieldLabel: string }> = [
  { value: 'plato', label: 'Plato', defaultYieldLabel: 'raciones' },
  { value: 'base', label: 'Base', defaultYieldLabel: 'kg' },
  { value: 'subelaboracion', label: 'Sub-elaboración', defaultYieldLabel: 'ud' },
];

export default function EscandalloNewRecipeWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { localId, profileReady } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const [step, setStep] = useState(0);
  const [recipes, setRecipes] = useState<EscandalloRecipe[]>([]);
  const [linesByRecipe, setLinesByRecipe] = useState<Record<string, EscandalloLine[]>>({});
  const [rawProducts, setRawProducts] = useState<EscandalloRawProduct[]>([]);
  const [processedProducts, setProcessedProducts] = useState<EscandalloProcessedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [yieldQty, setYieldQty] = useState('1');
  const [yieldLabel, setYieldLabel] = useState('raciones');
  const [saleGross, setSaleGross] = useState('');
  const [saleVat, setSaleVat] = useState('10');
  const [ingredientDrafts, setIngredientDrafts] = useState<IngredientDraftRow[]>([emptyIngredientDraft()]);
  const [recipeKind, setRecipeKind] = useState<RecipeKind>('plato');
  const [photoPreview, setPhotoPreview] = useState('');
  const [openBlock, setOpenBlock] = useState<string | null>(null);

  const rawById = useMemo(() => new Map(rawProducts.map((p) => [p.id, p])), [rawProducts]);
  const processedById = useMemo(() => new Map(processedProducts.map((p) => [p.id, p])), [processedProducts]);
  const recipesById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const sortedRaw = useMemo(
    () => [...rawProducts].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [rawProducts],
  );

  /** Evita pantalla "Cargando catálogo" en refetch cuando ya hay datos (vuelta al foco / refresco de sesión). */
  const catalogHydratedRef = useRef(false);
  useEffect(() => {
    catalogHydratedRef.current = false;
  }, [localId]);

  /** Evita escribir sessionStorage antes de haber leído el borrador (misma vuelta de foco / montaje). */
  const [wizardSessionReady, setWizardSessionReady] = useState(false);
  const pasoIngredientesOnceRef = useRef(false);

  useEffect(() => {
    if (!profileReady) return;
    if (!localId) {
      setWizardSessionReady(false);
      return;
    }
    const d = readEscandalloWizardDraft(localId);
    if (d) {
      setStep(Math.min(3, Math.max(0, d.step)));
      setName(d.name);
      setYieldQty(d.yieldQty);
      setYieldLabel(d.yieldLabel);
      setSaleGross(d.saleGross);
      setSaleVat(d.saleVat);
      setIngredientDrafts(d.ingredientDrafts);
      setRecipeKind(d.recipeKind ?? 'plato');
    }
    setWizardSessionReady(true);
  }, [profileReady, localId]);

  /** Desde calculadora rápida: rellenar nombre, PVP e IVA si no hay borrador con nombre. */
  useEffect(() => {
    if (!wizardSessionReady || !localId) return;
    const d = readEscandalloWizardDraft(localId);
    const p = readEscandalloQuickCalcPrefill();
    if (!p) return;
    if (d?.name?.trim()) {
      clearEscandalloQuickCalcPrefill();
      return;
    }
    setName(p.name);
    setSaleGross(p.saleGross);
    setSaleVat(p.saleVat);
    clearEscandalloQuickCalcPrefill();
  }, [wizardSessionReady, localId]);

  /** Desde Artículos máster: abrir directamente el paso Ingredientes (sin perder borrador). */
  useEffect(() => {
    if (!wizardSessionReady || !localId) return;
    const paso = searchParams.get('paso');
    if (paso !== 'ingredientes') {
      pasoIngredientesOnceRef.current = false;
      return;
    }
    if (pasoIngredientesOnceRef.current) return;
    pasoIngredientesOnceRef.current = true;
    setStep(1);
    router.replace('/escandallos/recetas/nuevo', { scroll: false });
  }, [wizardSessionReady, localId, searchParams, router]);

  useEffect(() => {
    if (!profileReady || !localId || !wizardSessionReady) return;
    writeEscandalloWizardDraft({
      v: 1,
      localId,
      step,
      name,
      yieldQty,
      yieldLabel,
      saleGross,
      saleVat,
      recipeKind,
      ingredientDrafts,
      updatedAt: Date.now(),
    });
  }, [profileReady, localId, wizardSessionReady, step, name, yieldQty, yieldLabel, saleGross, saleVat, recipeKind, ingredientDrafts]);

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
    if (!catalogHydratedRef.current) {
      setLoading(true);
    }
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
      catalogHydratedRef.current = true;
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'Error al cargar.');
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const previewBuilt = useMemo(
    () => draftRowsToPayloads(ingredientDrafts, rawById, processedById, recipesById, null),
    [ingredientDrafts, rawById, processedById, recipesById],
  );

  const previewPayloads = useMemo(() => (previewBuilt.ok ? previewBuilt.payloads : []), [previewBuilt]);
  const tempRecipeId = '__wizard__';
  const tempLines = useMemo(
    () => insertPayloadsToTempLines(tempRecipeId, previewPayloads),
    [previewPayloads],
  );

  const yNum = parseDecimal(yieldQty) ?? 1;
  const gross = parseDecimal(saleGross);
  const vat = parseDecimal(saleVat) ?? 10;
  const netSale = gross != null && gross > 0 ? saleNetPerUnitFromGross(gross, vat) : null;
  const totalCost = useMemo(() => {
    if (!previewBuilt.ok) return 0;
    return recipeTotalCostEur(tempLines, rawById, processedById, {
      linesByRecipe,
      recipesById,
      recipeId: tempRecipeId,
    });
  }, [previewBuilt.ok, tempLines, rawById, processedById, linesByRecipe, recipesById]);
  const perYield = yNum > 0 ? Math.round((totalCost / yNum) * 100) / 100 : 0;
  const fcPct = foodCostPercentOfNetSale(totalCost, yNum > 0 ? yNum : 1, netSale);
  const fcHint = foodCostStatus(fcPct);
  const marginPct = fcPct != null ? Math.round((100 - fcPct) * 10) / 10 : null;

  const canStep1 = name.trim().length > 0 && yNum > 0;
  const canFinish = canStep1 && !saving;

  const handleSave = async () => {
    if (!localId || !supabaseOk) return;
    if (!previewBuilt.ok) {
      setBanner(previewBuilt.message);
      return;
    }
    setSaving(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      const recipe = await insertEscandalloRecipe(supabase, localId, name.trim(), {
        yieldQty: yNum,
        yieldLabel: yieldLabel.trim() || 'raciones',
        isSubRecipe: recipeKind !== 'plato',
        saleVatRatePct: gross != null && gross > 0 ? vat : null,
        salePriceGrossEur: gross != null && gross > 0 ? gross : null,
      });
      if (previewPayloads.length > 0) {
        await insertEscandalloLinesBatch(supabase, localId, recipe.id, previewPayloads, 0);
      }
      clearEscandalloWizardDraft();
      router.push(`/escandallos/recetas/${recipe.id}/editar`);
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  if (!profileReady) {
    return <p className="text-sm text-zinc-600">Cargando sesión…</p>;
  }

  if (!localId || !supabaseOk) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Escandallos no disponibles.</p>
      </section>
    );
  }

  const readImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setPhotoPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const createdIngredientCount = previewPayloads.length;
  const selectedRecipeKind = RECIPE_KIND_OPTIONS.find((option) => option.value === recipeKind) ?? RECIPE_KIND_OPTIONS[0];
  const secondaryBlocks = [
    {
      id: 'production',
      title: 'Producción',
      summary: `${yieldQty || '1'} ${yieldLabel || 'raciones'}`,
      icon: Flame,
      tone: 'bg-[#D32F2F]/8 text-[#B91C1C] ring-[#D32F2F]/12',
    },
    {
      id: 'conservation',
      title: 'Conservación',
      summary: 'Tipo, temperatura, vida útil',
      icon: Refrigerator,
      tone: 'bg-[#4A6B3A]/10 text-[#35502A] ring-[#4A6B3A]/15',
    },
    {
      id: 'allergens',
      title: 'Alérgenos',
      summary: 'Gluten, lactosa, trazas',
      icon: AlertTriangle,
      tone: 'bg-[#B8872A]/10 text-[#7A5518] ring-[#B8872A]/15',
    },
    {
      id: 'plating',
      title: 'Emplatado',
      summary: photoPreview ? 'Foto añadida' : 'Montaje, decoración, foto',
      icon: Utensils,
      tone: 'bg-[#F7F3EE] text-[#7E7468] ring-[rgba(10,9,8,0.06)]',
    },
    {
      id: 'appcc',
      title: 'APPCC',
      summary: 'Completar al guardar',
      icon: ShieldCheck,
      tone: 'bg-[#4A6B3A]/10 text-[#35502A] ring-[#4A6B3A]/15',
    },
    {
      id: 'observations',
      title: 'Observaciones',
      summary: 'Notas internas',
      icon: StickyNote,
      tone: 'bg-[#F7F3EE] text-[#7E7468] ring-[rgba(10,9,8,0.06)]',
    },
  ];

  return (
    <div className="min-h-0 space-y-2 overflow-x-hidden pb-[calc(6.75rem+env(safe-area-inset-bottom,0px))]">
      {banner ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{banner}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Cargando catálogo…</p>
      ) : (
        <>
          <section className="rounded-xl border border-[rgba(10,9,8,0.06)] bg-white px-2.5 py-2 shadow-[0_1px_0_rgba(10,9,8,0.04)] ring-1 ring-[rgba(10,9,8,0.04)]">
            <div className="grid grid-cols-[5.5rem_1fr] gap-2">
              <label className="grid h-[5.5rem] cursor-pointer place-items-center rounded-xl border border-dashed border-[rgba(10,9,8,0.14)] bg-[#FAFAF9] text-center text-[10px] font-bold text-[#7E7468]">
                {photoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoPreview} alt="" className="h-full w-full rounded-xl object-cover" />
                ) : (
                  <span className="grid place-items-center gap-1">
                    <Camera className="h-5 w-5" aria-hidden />
                    Añadir foto
                  </span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    readImageFile(file);
                    e.target.value = '';
                  }}
                />
              </label>

              <div className="min-w-0 space-y-1.5">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-2 text-[16px] font-bold leading-tight text-[#0A0908] outline-none placeholder:text-[#7E7468]/60 focus:border-[#D32F2F]/35 focus:ring-1 focus:ring-[#D32F2F]/10"
                  placeholder="Nombre de la receta"
                  autoFocus
                />
                <select
                  value={recipeKind}
                  onChange={(e) => {
                    const nextKind = e.target.value as RecipeKind;
                    const nextOption = RECIPE_KIND_OPTIONS.find((option) => option.value === nextKind);
                    setRecipeKind(nextKind);
                    if (nextOption && (!yieldLabel.trim() || yieldLabel === selectedRecipeKind.defaultYieldLabel)) {
                      setYieldLabel(nextOption.defaultYieldLabel);
                    }
                  }}
                  className="h-8 w-full rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-2 text-[12px] font-semibold text-[#0A0908] outline-none placeholder:text-[#7E7468]/70 focus:border-[#D32F2F]/35 focus:ring-1 focus:ring-[#D32F2F]/10"
                  aria-label="Categoría de receta"
                >
                  {RECIPE_KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-[1fr_1fr_0.7fr] gap-1.5">
                  <input
                    value={yieldQty}
                    onChange={(e) => setYieldQty(e.target.value)}
                    className="h-8 rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-2 text-[12px] font-bold tabular-nums text-[#0A0908] outline-none"
                    inputMode="decimal"
                    aria-label="Raciones"
                  />
                  <input
                    value={yieldLabel}
                    onChange={(e) => setYieldLabel(e.target.value)}
                    className="h-8 rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-2 text-[12px] font-semibold text-[#0A0908] outline-none"
                    placeholder="raciones"
                    aria-label="Unidad de rendimiento"
                  />
                  <input
                    value={saleGross}
                    onChange={(e) => setSaleGross(e.target.value)}
                    className="h-8 rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-2 text-[12px] font-bold tabular-nums text-[#0A0908] outline-none"
                    inputMode="decimal"
                    placeholder="PVP"
                    aria-label="PVP"
                  />
                </div>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-3 divide-x divide-[rgba(10,9,8,0.06)] rounded-lg bg-[#FAFAF9] py-1.5 ring-1 ring-[rgba(10,9,8,0.04)]">
              <div className="text-center">
                <p className="text-[7px] font-bold uppercase tracking-[0.12em] text-[#7E7468]">Coste / rac.</p>
                <p className="mt-0.5 text-[15px] font-black tabular-nums text-[#0A0908]">{formatMoneyEur(perYield)}</p>
              </div>
              <div className="text-center">
                <p className="text-[7px] font-bold uppercase tracking-[0.12em] text-[#7E7468]">Food cost</p>
                <p className={`mt-0.5 text-[15px] font-black tabular-nums ${fcHint.className}`}>
                  {fcPct != null ? `${fcPct.toFixed(1)} %` : '— %'}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[7px] font-bold uppercase tracking-[0.12em] text-[#7E7468]">Margen</p>
                <p className="mt-0.5 text-[15px] font-black tabular-nums text-[#4A6B3A]">{marginPct != null ? `${marginPct} %` : '— %'}</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[rgba(10,9,8,0.06)] bg-white px-2.5 py-2.5 ring-1 ring-[rgba(10,9,8,0.04)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#B8872A]/10 text-[#7A5518] ring-1 ring-[#B8872A]/15">
                  <ClipboardList className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div>
                  <h2 className="text-[11px] font-black uppercase tracking-wide text-[#0A0908]">Ingredientes</h2>
                  <p className="text-[10px] font-medium text-[#7E7468]">{createdIngredientCount} ingredientes</p>
                </div>
              </div>
              <Link
                href="/pedidos/articulos"
                onClick={() => {
                  if (localId) writeEscandalloWizardBeforeArticulosNav(localId, step);
                }}
                className="text-[10px] font-bold text-[#C4531F]"
              >
                Artículos
              </Link>
            </div>
            {!previewBuilt.ok ? (
              <p className="mb-2 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900">{previewBuilt.message}</p>
            ) : null}
            <div>
              <EscandalloIngredientDraftEditor
                variant="editor"
                drafts={ingredientDrafts}
                onChange={setIngredientDrafts}
                sortedRaw={sortedRaw}
                processedProducts={processedProducts}
                recipes={recipes}
                excludeRecipeId={null}
                disabled={saving}
                linesByRecipe={linesByRecipe}
                rawById={rawById}
                processedById={processedById}
                recipesById={recipesById}
              />
            </div>
          </section>

          <div className="space-y-1.5">
            {secondaryBlocks.map(({ id, title, summary, icon: Icon, tone }) => (
              <section key={id} className="overflow-hidden rounded-lg border border-[rgba(10,9,8,0.07)] bg-white ring-1 ring-[rgba(10,9,8,0.035)]">
                <button
                  type="button"
                  onClick={() => setOpenBlock((current) => (current === id ? null : id))}
                  className="flex min-h-11 w-full items-center gap-2 px-2.5 py-2 text-left transition hover:bg-[#FAFAF9]"
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ${tone}`}>
                    <Icon className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-black uppercase tracking-wide text-[#0A0908]">{title}</span>
                    <span className="block truncate text-[10px] font-medium text-[#7E7468]">{summary}</span>
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[#7E7468] transition ${openBlock === id ? 'rotate-180' : ''}`} />
                </button>
                {openBlock === id ? (
                  <div className="border-t border-[rgba(10,9,8,0.06)] px-2.5 py-2">
                    <p className="text-[11px] font-medium text-[#7E7468]">Se completará en el editor técnico tras guardar la receta.</p>
                  </div>
                ) : null}
              </section>
            ))}
          </div>

          <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[rgba(10,9,8,0.08)] bg-white/92 px-3 py-2 shadow-[0_-4px_18px_rgba(10,9,8,0.08)] backdrop-blur-md max-lg:pb-[calc(0.55rem+env(safe-area-inset-bottom,0px))]">
            <div className="mx-auto grid max-w-lg grid-cols-[1fr_auto] gap-2">
              <div className="grid grid-cols-4 gap-1 rounded-lg bg-[#FAFAF9] px-1 py-1 ring-1 ring-[rgba(10,9,8,0.04)]">
                <div className="text-center">
                  <p className="text-[7px] font-bold uppercase tracking-[0.12em] text-[#7E7468]">Coste</p>
                  <p className="mt-0.5 text-[12px] font-black tabular-nums text-[#0A0908]">{formatMoneyEur(perYield)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[7px] font-bold uppercase tracking-[0.12em] text-[#7E7468]">FC</p>
                  <p className={`mt-0.5 text-[12px] font-black tabular-nums ${fcHint.className}`}>{fcPct != null ? `${fcPct.toFixed(1)}%` : '—'}</p>
                </div>
                <div className="text-center">
                  <p className="text-[7px] font-bold uppercase tracking-[0.12em] text-[#7E7468]">Margen</p>
                  <p className="mt-0.5 text-[12px] font-black tabular-nums text-[#4A6B3A]">{marginPct != null ? `${marginPct}%` : '—'}</p>
                </div>
                <div className="text-center">
                  <p className="text-[7px] font-bold uppercase tracking-[0.12em] text-[#7E7468]">Ing.</p>
                  <p className="mt-0.5 text-[12px] font-black tabular-nums text-[#0A0908]">{createdIngredientCount}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={!canFinish}
                onClick={() => void handleSave()}
                className="inline-flex h-full min-w-[8.5rem] items-center justify-center gap-1.5 rounded-xl bg-[#D32F2F] px-3 text-[12px] font-black text-white transition hover:bg-[#B91C1C] disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" aria-hidden />
                Guardar receta
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
