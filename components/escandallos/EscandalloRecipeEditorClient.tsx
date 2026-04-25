'use client';

import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChefHat,
  ChevronDown,
  Plus,
  Trash2,
} from 'lucide-react';
import RecipeTechnicalSheetPanel from '@/components/escandallos/RecipeTechnicalSheetPanel';
import EscandalloIngredientDraftEditor from '@/components/escandallos/EscandalloIngredientDraftEditor';
import { useAuth } from '@/components/AuthProvider';
import { fetchRecipeAllergens, type RecipeAllergenRow } from '@/lib/appcc-allergens-supabase';
import { appConfirm } from '@/lib/app-dialog-bridge';
import { getDemoEscandalloPack } from '@/lib/demo-dataset';
import { isDemoMode } from '@/lib/demo-mode';
import {
  emptyIngredientDraft,
  foodCostStatus,
  parseDecimal,
  draftRowsToPayloads,
  type IngredientDraftRow,
} from '@/lib/escandallos-recipe-draft-utils';
import {
  fetchEscandalloTechnicalSheetWithSteps,
  insertEscandalloTechnicalSheet,
  replaceEscandalloTechnicalSheetSteps,
  updateEscandalloTechnicalSheet,
  type EscandalloTechnicalSheet,
  type EscandalloTechnicalSheetStep,
  type EscandalloTechnicalSheetUpdate,
  type TechnicalSheetStepDraft,
} from '@/lib/escandallos-technical-sheet-supabase';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  clearEscandalloRecipeEditorDraft,
  readEscandalloRecipeEditorDraft,
  writeEscandalloRecipeEditorDraft,
} from '@/lib/escandallo-session-persist';
import {
  deleteEscandalloLine,
  deleteEscandalloRecipe,
  fetchEscandalloLines,
  fetchEscandalloRecipes,
  fetchProcessedProductsForEscandallo,
  fetchEscandalloRawProductsWithWeightedPurchasePrices,
  foodCostPercentOfNetSale,
  insertEscandalloLinesBatch,
  lineUnitPriceEur,
  recipeTotalCostEur,
  saleNetPerUnitFromGross,
  updateEscandalloLine,
  updateEscandalloRecipe,
  type EscandalloLine,
  type EscandalloProcessedProduct,
  type EscandalloRawProduct,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import { formatMoneyEur, formatUnitPriceEur } from '@/lib/money-format';

type RecipeTechBundle = {
  sheet: EscandalloTechnicalSheet | null;
  steps: EscandalloTechnicalSheetStep[];
  loading: boolean;
};

export default function EscandalloRecipeEditorClient({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const { localId, profileReady } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const demoReadonly = isDemoMode() && Boolean(localId) && !supabaseOk;

  const [recipes, setRecipes] = useState<EscandalloRecipe[]>([]);
  const [linesByRecipe, setLinesByRecipe] = useState<Record<string, EscandalloLine[]>>({});
  const [rawProducts, setRawProducts] = useState<EscandalloRawProduct[]>([]);
  const [processedProducts, setProcessedProducts] = useState<EscandalloProcessedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [draftRecipeName, setDraftRecipeName] = useState('');
  const [draftRecipeNotes, setDraftRecipeNotes] = useState('');
  const [draftYieldQty, setDraftYieldQty] = useState('');
  const [draftYieldLabel, setDraftYieldLabel] = useState('');
  const [draftSaleGross, setDraftSaleGross] = useState('');
  const [draftSaleVat, setDraftSaleVat] = useState('10');
  const [draftPosArticleCode, setDraftPosArticleCode] = useState('');
  const [ingredientDrafts, setIngredientDrafts] = useState<IngredientDraftRow[]>([emptyIngredientDraft()]);

  const [techBundle, setTechBundle] = useState<RecipeTechBundle>({ sheet: null, steps: [], loading: false });
  const [recipeAllergens, setRecipeAllergens] = useState<RecipeAllergenRow[]>([]);
  const [techOpen, setTechOpen] = useState(false);
  const hydratedRecipeId = useRef<string | null>(null);

  const rawById = useMemo(() => new Map(rawProducts.map((p) => [p.id, p])), [rawProducts]);
  const processedById = useMemo(() => new Map(processedProducts.map((p) => [p.id, p])), [processedProducts]);
  const recipesById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const sortedRawProducts = useMemo(
    () => [...rawProducts].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [rawProducts],
  );

  const recipe = recipesById.get(recipeId) ?? null;
  const lines = recipe ? (linesByRecipe[recipe.id] ?? []) : [];
  const priceInner = useMemo(
    () => ({ linesByRecipe, recipesById, expanding: new Set<string>(recipe ? [recipe.id] : []) }),
    [linesByRecipe, recipesById, recipe],
  );

  const hydrateDraftFromRecipe = useCallback((r: EscandalloRecipe) => {
    setDraftRecipeName(r.name);
    setDraftRecipeNotes(r.notes);
    setDraftYieldQty(String(r.yieldQty));
    setDraftYieldLabel(r.yieldLabel);
    setDraftSaleGross(r.salePriceGrossEur != null ? String(r.salePriceGrossEur) : '');
    setDraftSaleVat(r.saleVatRatePct != null ? String(r.saleVatRatePct) : '10');
    setDraftPosArticleCode(r.posArticleCode ?? '');
    setIngredientDrafts([emptyIngredientDraft()]);
  }, []);

  /** Refetch de catálogo sin bloquear la pantalla con "Cargando…" si ya había datos. */
  const catalogHydratedRef = useRef(false);
  useEffect(() => {
    catalogHydratedRef.current = false;
  }, [localId]);

  const load = useCallback(async () => {
    if (!localId) {
      setRecipes([]);
      setLinesByRecipe({});
      setRawProducts([]);
      setProcessedProducts([]);
      setLoading(false);
      return;
    }
    if (demoReadonly) {
      setLoading(true);
      setBanner(null);
      const pack = getDemoEscandalloPack();
      setRecipes(pack.recipes);
      setLinesByRecipe(pack.linesByRecipe);
      setRawProducts(pack.rawProducts);
      setProcessedProducts(pack.processed);
      setLoading(false);
      catalogHydratedRef.current = true;
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
    if (!catalogHydratedRef.current) {
      setLoading(true);
    }
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
      const linesEntries = await Promise.all(
        r.map(async (rec) => {
          const ls = await fetchEscandalloLines(supabase, localId, rec.id);
          return [rec.id, ls] as const;
        }),
      );
      setLinesByRecipe(Object.fromEntries(linesEntries));
      catalogHydratedRef.current = true;
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudieron cargar los datos.');
      setRecipes([]);
      setLinesByRecipe({});
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk, demoReadonly]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  useEffect(() => {
    hydratedRecipeId.current = null;
  }, [recipeId]);

  useEffect(() => {
    if (!recipe || loading) return;
    if (hydratedRecipeId.current === recipe.id) return;
    hydratedRecipeId.current = recipe.id;
    const stored = localId ? readEscandalloRecipeEditorDraft(localId, recipeId) : null;
    if (stored) {
      setDraftRecipeName(stored.draftRecipeName);
      setDraftRecipeNotes(stored.draftRecipeNotes);
      setDraftYieldQty(stored.draftYieldQty);
      setDraftYieldLabel(stored.draftYieldLabel);
      setDraftSaleGross(stored.draftSaleGross);
      setDraftSaleVat(stored.draftSaleVat);
      setDraftPosArticleCode(stored.draftPosArticleCode);
      setIngredientDrafts(stored.ingredientDrafts);
    } else {
      hydrateDraftFromRecipe(recipe);
    }
  }, [recipe, loading, hydrateDraftFromRecipe, localId, recipeId]);

  const canPersistEditorDraft = Boolean(localId && recipe && !loading && !demoReadonly);
  useEffect(() => {
    if (!canPersistEditorDraft) return;
    writeEscandalloRecipeEditorDraft({
      v: 1,
      localId: localId!,
      recipeId,
      draftRecipeName,
      draftRecipeNotes,
      draftYieldQty,
      draftYieldLabel,
      draftSaleGross,
      draftSaleVat,
      draftPosArticleCode,
      ingredientDrafts,
      updatedAt: Date.now(),
    });
  }, [
    canPersistEditorDraft,
    localId,
    recipeId,
    draftRecipeName,
    draftRecipeNotes,
    draftYieldQty,
    draftYieldLabel,
    draftSaleGross,
    draftSaleVat,
    draftPosArticleCode,
    ingredientDrafts,
  ]);

  const refreshRecipeLines = async (rid: string) => {
    if (!localId || !supabaseOk || demoReadonly) return;
    const supabase = getSupabaseClient()!;
    const ls = await fetchEscandalloLines(supabase, localId, rid);
    setLinesByRecipe((prev) => ({ ...prev, [rid]: ls }));
  };

  const loadAux = useCallback(async () => {
    if (!localId || !recipeId) return;
    if (demoReadonly) {
      setTechBundle({ sheet: null, steps: [], loading: false });
      setRecipeAllergens([]);
      return;
    }
    if (!supabaseOk) return;
    const supabase = getSupabaseClient()!;
    setTechBundle((prev) => ({ ...prev, loading: true }));
    let sheet: EscandalloTechnicalSheet | null = null;
    let steps: EscandalloTechnicalSheetStep[] = [];
    try {
      const t = await fetchEscandalloTechnicalSheetWithSteps(supabase, localId, recipeId);
      sheet = t.sheet;
      steps = t.steps;
    } catch {
      sheet = null;
      steps = [];
    }
    setTechBundle({ sheet, steps, loading: false });
    try {
      const allergens = await fetchRecipeAllergens(supabase, localId, recipeId);
      setRecipeAllergens(allergens);
    } catch {
      setRecipeAllergens([]);
    }
  }, [localId, supabaseOk, recipeId, demoReadonly]);

  useEffect(() => {
    if (!profileReady || !recipe) return;
    void loadAux();
  }, [profileReady, recipe, loadAux]);

  const totalCostLive = useMemo(() => {
    if (!recipe) return 0;
    return recipeTotalCostEur(lines, rawById, processedById, {
      linesByRecipe,
      recipesById,
      recipeId: recipe.id,
    });
  }, [lines, rawById, processedById, linesByRecipe, recipesById, recipe]);

  const yLive = parseDecimal(draftYieldQty) ?? recipe?.yieldQty ?? 1;
  const costPerYield = yLive > 0 ? Math.round((totalCostLive / yLive) * 100) / 100 : 0;
  const grossLive = parseDecimal(draftSaleGross);
  const vatLive = parseDecimal(draftSaleVat) ?? 10;
  const netSale =
    recipe && !recipe.isSubRecipe && grossLive != null && grossLive > 0
      ? saleNetPerUnitFromGross(grossLive, vatLive)
      : null;
  const fcPct =
    recipe && !recipe.isSubRecipe ? foodCostPercentOfNetSale(totalCostLive, yLive > 0 ? yLive : 1, netSale) : null;
  const fcHint = foodCostStatus(fcPct);
  const marginPct = fcPct != null ? Math.round((100 - fcPct) * 10) / 10 : null;

  const statusLabel = useMemo(() => {
    if (!recipe) return '—';
    if (recipe.isSubRecipe) return lines.length ? 'Base lista' : 'Sin ingredientes';
    if (lines.length === 0) return 'Sin ingredientes';
    if (grossLive == null || grossLive <= 0) return 'Sin PVP';
    if (fcPct != null && fcPct > 35) return 'Food cost alto';
    if (fcPct != null && fcPct > 28) return 'Atención';
    return 'Activo';
  }, [recipe, lines.length, grossLive, fcPct]);

  const handleSaveRecipeMeta = async () => {
    if (!recipe) {
      setBanner('La receta no está cargada. Espera un momento o vuelve al libro.');
      return;
    }
    if (!localId) {
      setBanner('No hay local en sesión. Cierra sesión y entra de nuevo.');
      return;
    }
    if (demoReadonly) {
      setBanner('Modo demo: la cabecera no se puede guardar.');
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setBanner('Conexión a datos no disponible en este dispositivo.');
      return;
    }
    const y = parseDecimal(draftYieldQty);
    const gross = parseDecimal(draftSaleGross);
    const vat = parseDecimal(draftSaleVat);
    setBusyId(recipe.id);
    setBanner(null);
    setSuccessMsg(null);
    try {
      const patch: Parameters<typeof updateEscandalloRecipe>[3] = {
        name: draftRecipeName,
        notes: draftRecipeNotes,
        yieldQty: y != null && y > 0 ? y : undefined,
        yieldLabel: draftYieldLabel,
      };
      if (!recipe.isSubRecipe) {
        patch.posArticleCode = draftPosArticleCode.trim() === '' ? null : draftPosArticleCode.trim();
        if (gross != null && gross > 0) {
          patch.saleVatRatePct = vat != null && vat >= 0 ? vat : 10;
          patch.salePriceGrossEur = gross;
        } else {
          patch.saleVatRatePct = null;
          patch.salePriceGrossEur = null;
        }
      }
      await updateEscandalloRecipe(supabase, localId, recipe.id, patch);
      setSuccessMsg('Cabecera guardada.');
      window.setTimeout(() => setSuccessMsg(null), 3200);
      setRecipes((prev) =>
        prev
          .map((r) =>
            r.id === recipe.id
              ? {
                  ...r,
                  name: draftRecipeName.trim(),
                  notes: draftRecipeNotes.trim(),
                  yieldQty: y != null && y > 0 ? Math.round(y * 100) / 100 : r.yieldQty,
                  yieldLabel: draftYieldLabel.trim() || 'raciones',
                  saleVatRatePct:
                    r.isSubRecipe
                      ? r.saleVatRatePct
                      : gross != null && gross > 0
                        ? vat != null && vat >= 0
                          ? Math.round(vat * 100) / 100
                          : 10
                        : null,
                  salePriceGrossEur:
                    r.isSubRecipe
                      ? r.salePriceGrossEur
                      : gross != null && gross > 0
                        ? Math.round(gross * 10000) / 10000
                        : null,
                  posArticleCode:
                    r.isSubRecipe
                      ? r.posArticleCode
                      : draftPosArticleCode.trim() === ''
                        ? null
                        : draftPosArticleCode.trim(),
                }
              : r,
          )
          .sort((a, b) => a.name.localeCompare(b.name, 'es')),
      );
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAddLinesBatch = async () => {
    if (!localId || !recipe || demoReadonly) return;
    const built = draftRowsToPayloads(ingredientDrafts, rawById, processedById, recipesById, recipe.id);
    if (!built.ok) {
      setBanner(built.message);
      return;
    }
    if (built.payloads.length === 0) {
      setBanner('Añade al menos una fila con cantidad e ingrediente válidos.');
      return;
    }
    const existing = linesByRecipe[recipe.id] ?? [];
    const startOrder = existing.length;
    const supabase = getSupabaseClient()!;
    setBusyId(`batch-${recipe.id}`);
    setBanner(null);
    try {
      await insertEscandalloLinesBatch(supabase, localId, recipe.id, built.payloads, startOrder);
      await refreshRecipeLines(recipe.id);
      setIngredientDrafts([emptyIngredientDraft()]);
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudieron añadir las líneas.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteLine = async (lineId: string) => {
    if (!localId || !recipe || demoReadonly) return;
    const supabase = getSupabaseClient()!;
    setBusyId(lineId);
    try {
      await deleteEscandalloLine(supabase, localId, lineId);
      await refreshRecipeLines(recipe.id);
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudo eliminar la línea.');
    } finally {
      setBusyId(null);
    }
  };

  const sortedLines = useMemo(
    () => [...lines].sort((a, b) => a.sortOrder - b.sortOrder),
    [lines],
  );

  const swapLineOrder = async (i: number, j: number) => {
    if (!localId || !recipe || demoReadonly) return;
    const a = sortedLines[i];
    const b = sortedLines[j];
    if (!a || !b) return;
    const supabase = getSupabaseClient()!;
    setBusyId('reorder');
    try {
      const soA = a.sortOrder;
      const soB = b.sortOrder;
      await updateEscandalloLine(supabase, localId, a.id, { sortOrder: soB });
      await updateEscandalloLine(supabase, localId, b.id, { sortOrder: soA });
      await refreshRecipeLines(recipe.id);
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudo reordenar.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteRecipe = async () => {
    if (!localId || !recipe || demoReadonly) return;
    if (!(await appConfirm('¿Eliminar esta receta y todos sus ingredientes?'))) return;
    const supabase = getSupabaseClient()!;
    setBusyId(recipe.id);
    try {
      await deleteEscandalloRecipe(supabase, localId, recipe.id);
      clearEscandalloRecipeEditorDraft(localId, recipe.id);
      setRecipes((prev) => prev.filter((r) => r.id !== recipe.id));
      router.push(recipe.isSubRecipe ? '/escandallos/recetas/bases' : '/escandallos/recetas');
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudo eliminar.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateTechnicalSheet = async () => {
    if (!localId || demoReadonly || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    setBusyId(`tech-${recipeId}`);
    setBanner(null);
    try {
      const sheet = await insertEscandalloTechnicalSheet(supabase, localId, recipeId);
      setTechBundle({ sheet, steps: [], loading: false });
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudo crear la ficha.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveTechnicalSheet = async (
    sheetId: string,
    patch: EscandalloTechnicalSheetUpdate,
    stepDrafts: TechnicalSheetStepDraft[],
  ) => {
    if (!localId || demoReadonly || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    setBusyId(`tech-${recipeId}`);
    setBanner(null);
    try {
      const sheet = await updateEscandalloTechnicalSheet(supabase, localId, sheetId, patch);
      const steps = await replaceEscandalloTechnicalSheetSteps(supabase, localId, sheetId, stepDrafts);
      setTechBundle({ sheet, steps, loading: false });
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudo guardar la ficha técnica.');
    } finally {
      setBusyId(null);
    }
  };

  if (!profileReady) {
    return <p className="text-sm text-zinc-600">Cargando sesión…</p>;
  }

  if (!localId || (!supabaseOk && !demoReadonly)) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Escandallos no disponibles.</p>
      </section>
    );
  }

  if (!loading && !recipe) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-600">No se encontró la receta.</p>
      </div>
    );
  }

  const alerts: string[] = [];
  if (recipe && !recipe.isSubRecipe) {
    if (lines.length === 0) alerts.push('Sin ingredientes');
    if (grossLive == null || grossLive <= 0) alerts.push('Sin PVP');
    if (fcPct != null && fcPct > 35) alerts.push('Food cost alto');
    if (lines.length === 0 || grossLive == null || grossLive <= 0) alerts.push('Receta incompleta para carta');
  } else if (recipe?.isSubRecipe && lines.length === 0) {
    alerts.push('Base sin ingredientes');
  }

  return (
    <div className="min-h-0 h-auto space-y-5 overflow-x-hidden overflow-y-visible pb-8 max-lg:pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] lg:overflow-visible lg:pb-8">
      {demoReadonly ? (
        <div className="flex justify-end">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">Demo · solo lectura</span>
        </div>
      ) : null}

      {banner ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{banner}</div>
      ) : null}
      {successMsg ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950">
          {successMsg}
        </div>
      ) : null}

      {loading || !recipe ? (
        <p className="text-sm text-zinc-500">Cargando receta…</p>
      ) : (
        <>
          {/* Bloque A — cabecera */}
          <header className="relative z-0 space-y-4 rounded-2xl border border-zinc-200/90 bg-white/95 p-4 shadow-sm ring-1 ring-zinc-100 backdrop-blur-md sm:p-5 lg:sticky lg:top-0 lg:z-20">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  <ChefHat className="h-3.5 w-3.5 text-[#B91C1C]" aria-hidden />
                  {recipe.isSubRecipe ? 'Base / elaborado' : 'Plato carta'}
                </div>
                <input
                  value={draftRecipeName}
                  disabled={demoReadonly}
                  onChange={(e) => setDraftRecipeName(e.target.value)}
                  className="mt-1 w-full border-0 border-b border-transparent bg-transparent text-2xl font-black tracking-tight text-zinc-900 outline-none transition placeholder:text-zinc-300 focus:border-zinc-200 sm:text-3xl"
                  placeholder="Nombre del plato"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Rendimiento y categoría de presentación: unidad en carta (ej. raciones, kg).
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-zinc-900 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                {statusLabel}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block rounded-xl bg-zinc-50/80 px-3 py-2 ring-1 ring-zinc-100">
                <span className="text-[10px] font-bold uppercase text-zinc-500">Raciones / rendimiento</span>
                <div className="mt-1 flex gap-2">
                  <input
                    value={draftYieldQty}
                    disabled={demoReadonly}
                    onChange={(e) => setDraftYieldQty(e.target.value)}
                    className="w-20 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm font-semibold tabular-nums"
                    inputMode="decimal"
                  />
                  <input
                    value={draftYieldLabel}
                    disabled={demoReadonly}
                    onChange={(e) => setDraftYieldLabel(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                    placeholder="raciones, kg…"
                  />
                </div>
              </label>
              {!recipe.isSubRecipe ? (
                <label className="block rounded-xl bg-zinc-50/80 px-3 py-2 ring-1 ring-zinc-100">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">PVP (€ IVA inc.)</span>
                  <input
                    value={draftSaleGross}
                    disabled={demoReadonly}
                    onChange={(e) => setDraftSaleGross(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm font-semibold tabular-nums"
                    inputMode="decimal"
                  />
                </label>
              ) : null}
              {!recipe.isSubRecipe ? (
                <label className="block rounded-xl bg-zinc-50/80 px-3 py-2 ring-1 ring-zinc-100">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">IVA %</span>
                  <input
                    value={draftSaleVat}
                    disabled={demoReadonly}
                    onChange={(e) => setDraftSaleVat(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm tabular-nums"
                    inputMode="decimal"
                  />
                </label>
              ) : null}
              <div className="rounded-xl bg-gradient-to-br from-[#B91C1C]/12 via-white to-white px-3 py-2 ring-1 ring-[#D32F2F]/15">
                <span className="text-[10px] font-bold uppercase text-zinc-500">Coste / {draftYieldLabel || recipe.yieldLabel}</span>
                <p className="mt-1 text-xl font-black tabular-nums text-zinc-900">{formatMoneyEur(costPerYield)}</p>
                <p className="text-[11px] text-zinc-500">Total batch {formatMoneyEur(totalCostLive)}</p>
              </div>
            </div>

            {!recipe.isSubRecipe ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-zinc-100 bg-white px-3 py-2">
                  <p className="text-[10px] font-bold uppercase text-zinc-500">Food cost</p>
                  <p className={`text-lg font-black tabular-nums ${fcHint.className}`}>
                    {fcPct != null ? `${fcPct.toFixed(1)} %` : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-100 bg-white px-3 py-2">
                  <p className="text-[10px] font-bold uppercase text-zinc-500">Margen bruto</p>
                  <p className="text-lg font-black tabular-nums text-zinc-900">
                    {marginPct != null ? `${marginPct} %` : '—'}
                  </p>
                </div>
                <label className="block rounded-xl border border-zinc-100 bg-white px-3 py-2">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">Código TPV</span>
                  <input
                    value={draftPosArticleCode}
                    disabled={demoReadonly}
                    onChange={(e) => setDraftPosArticleCode(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50/50 px-2 py-1.5 font-mono text-sm"
                    placeholder="00042"
                  />
                </label>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                disabled={busyId === recipe.id || demoReadonly}
                onClick={() => void handleSaveRecipeMeta()}
                className="min-h-[48px] w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50 sm:w-auto sm:py-2"
              >
                {busyId === recipe.id ? 'Guardando…' : 'Guardar cabecera'}
              </button>
              <button
                type="button"
                disabled={busyId === recipe.id || demoReadonly}
                onClick={() => void handleDeleteRecipe()}
                className="min-h-[44px] w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-800 disabled:opacity-50 sm:w-auto"
              >
                Eliminar receta
              </button>
            </div>
          </header>

          {/* Bloque B — líneas existentes */}
          <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm ring-1 ring-zinc-100 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-black uppercase tracking-wide text-zinc-800">Ingredientes</h2>
              <span className="text-xs tabular-nums text-zinc-500">{sortedLines.length} líneas</span>
            </div>
            {sortedLines.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">Aún no hay líneas. Usa el formulario inferior.</p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {sortedLines.map((line, idx) => {
                  const unitEur = lineUnitPriceEur(line, rawById, processedById, priceInner);
                  const lineCost = Math.round(line.qty * unitEur * 100) / 100;
                  const src =
                    line.sourceType === 'raw'
                      ? 'Crudo'
                      : line.sourceType === 'processed'
                        ? 'Elaborado'
                        : line.sourceType === 'subrecipe'
                          ? 'Sub-receta'
                          : 'Manual';
                  const subLines = line.sourceType === 'subrecipe' && line.subRecipeId
                    ? (linesByRecipe[line.subRecipeId] ?? [])
                    : [];
                  return (
                    <li
                      key={line.id}
                      className="flex flex-col gap-1 rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase text-zinc-500 ring-1 ring-zinc-200">
                          {src}
                        </span>
                        <span className="min-w-0 flex-1 font-semibold text-zinc-900">{line.label}</span>
                        <span className="shrink-0 tabular-nums text-zinc-600">
                          {line.qty} {line.unit} × {formatUnitPriceEur(unitEur, line.unit)}
                        </span>
                        <span className="shrink-0 font-bold tabular-nums text-zinc-900">{formatMoneyEur(lineCost)}</span>
                        <div className="flex shrink-0 gap-0.5">
                          <button
                            type="button"
                            disabled={idx === 0 || busyId === 'reorder' || demoReadonly}
                            onClick={() => void swapLineOrder(idx, idx - 1)}
                            className="rounded-lg p-1 text-zinc-500 hover:bg-white disabled:opacity-30"
                            aria-label="Subir"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={idx >= sortedLines.length - 1 || busyId === 'reorder' || demoReadonly}
                            onClick={() => void swapLineOrder(idx, idx + 1)}
                            className="rounded-lg p-1 text-zinc-500 hover:bg-white disabled:opacity-30"
                            aria-label="Bajar"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={busyId === line.id || demoReadonly}
                            onClick={() => void handleDeleteLine(line.id)}
                            className="rounded-lg p-1 text-red-700 hover:bg-red-50 disabled:opacity-40"
                            aria-label="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {subLines.length > 0 ? (
                        <details className="text-xs text-zinc-600">
                          <summary className="cursor-pointer font-medium text-zinc-500 hover:text-zinc-800">
                            Desglose base ({subLines.length})
                          </summary>
                          <ul className="mt-1 space-y-0.5 pl-2">
                            {subLines.map((sl) => (
                              <li key={sl.id} className="truncate">
                                {sl.label} · {sl.qty} {sl.unit}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Añadir filas */}
          <section className="rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-zinc-50/80 to-white p-4 ring-1 ring-zinc-100 sm:p-5">
            <h2 className="text-sm font-black uppercase tracking-wide text-zinc-700">Añadir al escandallo</h2>
            <div className="mt-3">
              <EscandalloIngredientDraftEditor
                drafts={ingredientDrafts}
                onChange={setIngredientDrafts}
                sortedRaw={sortedRawProducts}
                processedProducts={processedProducts}
                recipes={recipes}
                excludeRecipeId={recipe.id}
                disabled={busyId !== null || demoReadonly}
                linesByRecipe={linesByRecipe}
                rawById={rawById}
                processedById={processedById}
                recipesById={recipesById}
              />
            </div>
            <button
              type="button"
              disabled={busyId !== null || demoReadonly}
              onClick={() => void handleAddLinesBatch()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#D32F2F] py-3 text-sm font-black text-white shadow-md transition hover:bg-[#B91C1C] disabled:opacity-50"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden />
              Añadir ingredientes a la receta
            </button>
          </section>

          <details className="rounded-2xl border border-zinc-200 bg-white ring-1 ring-zinc-100">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
              <span className="inline-flex items-center gap-2">
                <ChevronDown className="h-4 w-4 opacity-60" aria-hidden />
                Notas internas
              </span>
            </summary>
            <div className="border-t border-zinc-100 px-4 pb-4 pt-2">
              <textarea
                value={draftRecipeNotes}
                disabled={demoReadonly}
                onChange={(e) => setDraftRecipeNotes(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Opcional"
              />
            </div>
          </details>

          <button
            type="button"
            onClick={() => setTechOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm font-semibold text-zinc-800 ring-1 ring-zinc-100 hover:bg-zinc-50"
          >
            Ficha técnica y alérgenos
            <ChevronDown className={`h-4 w-4 transition ${techOpen ? 'rotate-180' : ''}`} />
          </button>
          {techOpen && recipe ? (
            <RecipeTechnicalSheetPanel
              recipe={recipe}
              lines={lines}
              sheet={techBundle.sheet}
              steps={techBundle.steps}
              recipeAllergens={recipeAllergens}
              loading={techBundle.loading}
              saving={busyId === `tech-${recipeId}`}
              onCreate={() => handleCreateTechnicalSheet()}
              onSave={(patch, drafts) => {
                if (!techBundle.sheet) return Promise.resolve();
                return handleSaveTechnicalSheet(techBundle.sheet.id, patch, drafts);
              }}
            />
          ) : null}

          {/* Bloque D — móvil: en flujo (un solo scroll); lg: sticky cabecera sigue siendo la de arriba */}
          <div className="relative z-0 mt-1 rounded-2xl border border-zinc-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-md max-lg:shadow-[0_-2px_16px_rgba(0,0,0,0.06)] lg:mt-0 lg:pb-3">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 text-sm text-zinc-800 sm:text-sm">
              <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums text-zinc-700">
                <span>
                  <span className="text-zinc-500">Coste total</span>{' '}
                  <strong className="text-zinc-900">{formatMoneyEur(totalCostLive)}</strong>
                </span>
                <span>
                  <span className="text-zinc-500">/ {draftYieldLabel || recipe.yieldLabel}</span>{' '}
                  <strong className="text-zinc-900">{formatMoneyEur(costPerYield)}</strong>
                </span>
                {!recipe.isSubRecipe ? (
                  <>
                    <span>
                      <span className="text-zinc-500">Food cost</span>{' '}
                      <strong className={fcHint.className}>{fcPct != null ? `${fcPct.toFixed(1)} %` : '—'}</strong>
                    </span>
                    <span>
                      <span className="text-zinc-500">Margen</span>{' '}
                      <strong>{marginPct != null ? `${marginPct} %` : '—'}</strong>
                    </span>
                  </>
                ) : null}
                <span className="text-zinc-500">{sortedLines.length} ingredientes</span>
              </div>
              {alerts.length > 0 ? (
                <span className="text-[11px] font-semibold text-amber-800">{alerts.slice(0, 2).join(' · ')}</span>
              ) : (
                <span className="text-[11px] font-semibold text-emerald-700">Listo para carta</span>
              )}
            </div>
          </div>

        </>
      )}
    </div>
  );
}
