'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardList,
  ChevronDown,
  Plus,
  RefreshCw,
  Save,
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
  effectiveRecipeYieldQtyForCost,
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

function fcValueClass(pct: number | null): string {
  if (pct == null) return 'text-[#7E7468]';
  if (pct > 30) return 'text-[#D32F2F]';
  return 'text-emerald-700';
}

function parseLineLabel(label: string): { supplier?: string; name: string } {
  const sep = label.indexOf(' · ');
  if (sep > 0) return { supplier: label.slice(0, sep), name: label.slice(sep + 3) };
  return { name: label };
}

function EditorMetric({
  label,
  value,
  valueClassName = 'text-[#0A0908]',
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 flex-1 px-0.5 text-center">
      <p className="text-[7px] font-bold uppercase tracking-[0.12em] text-[#7E7468]">{label}</p>
      <p className={`mt-0.5 truncate text-[12px] font-black tabular-nums leading-none ${valueClassName}`}>{value}</p>
    </div>
  );
}

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
  const [draftFinalWeightQty, setDraftFinalWeightQty] = useState('');
  const [draftFinalWeightUnit, setDraftFinalWeightUnit] = useState<'kg' | 'l'>('kg');
  const [ingredientDrafts, setIngredientDrafts] = useState<IngredientDraftRow[]>([emptyIngredientDraft()]);

  const [techBundle, setTechBundle] = useState<RecipeTechBundle>({ sheet: null, steps: [], loading: false });
  const [recipeAllergens, setRecipeAllergens] = useState<RecipeAllergenRow[]>([]);
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const hydratedRecipeId = useRef<string | null>(null);

  const rawById = useMemo(() => new Map(rawProducts.map((p) => [p.id, p])), [rawProducts]);
  const processedById = useMemo(() => new Map(processedProducts.map((p) => [p.id, p])), [processedProducts]);
  const recipesById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const sortedRawProducts = useMemo(
    () => [...rawProducts].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [rawProducts],
  );

  const recipe = recipesById.get(recipeId) ?? null;
  const lines = useMemo(() => (recipe ? (linesByRecipe[recipe.id] ?? []) : []), [linesByRecipe, recipe]);
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
    setDraftFinalWeightQty(r.finalWeightQty != null ? String(r.finalWeightQty) : '');
    setDraftFinalWeightUnit(r.finalWeightUnit === 'l' ? 'l' : 'kg');
    setIngredientDrafts([emptyIngredientDraft()]);
  }, []);

  const hydrateDraftFromRecipeWithStored = useCallback(
    (r: EscandalloRecipe, stored: ReturnType<typeof readEscandalloRecipeEditorDraft>) => {
      setDraftRecipeName(stored?.draftRecipeName?.trim() ? stored.draftRecipeName : r.name);
      setDraftRecipeNotes(stored?.draftRecipeNotes != null ? stored.draftRecipeNotes : r.notes);
      setDraftYieldQty(stored?.draftYieldQty?.trim() ? stored.draftYieldQty : String(r.yieldQty));
      setDraftYieldLabel(stored?.draftYieldLabel?.trim() ? stored.draftYieldLabel : r.yieldLabel);
      setDraftSaleGross(stored?.draftSaleGross?.trim() ? stored.draftSaleGross : r.salePriceGrossEur != null ? String(r.salePriceGrossEur) : '');
      setDraftSaleVat(
        stored?.draftSaleVat?.trim()
          ? stored.draftSaleVat
          : r.saleVatRatePct != null
            ? String(r.saleVatRatePct)
            : '10',
      );
      setDraftPosArticleCode(stored?.draftPosArticleCode != null ? stored.draftPosArticleCode : r.posArticleCode ?? '');
      setDraftFinalWeightQty(
        stored?.draftFinalWeightQty?.trim()
          ? stored.draftFinalWeightQty
          : r.finalWeightQty != null
            ? String(r.finalWeightQty)
            : '',
      );
      setDraftFinalWeightUnit(
        stored?.draftFinalWeightUnit === 'l' ? 'l' : r.finalWeightUnit === 'l' ? 'l' : 'kg',
      );
      setIngredientDrafts(stored?.ingredientDrafts?.length ? stored.ingredientDrafts : [emptyIngredientDraft()]);
    },
    [],
  );

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
      hydrateDraftFromRecipeWithStored(recipe, stored);
    } else {
      hydrateDraftFromRecipe(recipe);
    }
  }, [recipe, loading, hydrateDraftFromRecipe, hydrateDraftFromRecipeWithStored, localId, recipeId]);

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
      draftFinalWeightQty,
      draftFinalWeightUnit,
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
    draftFinalWeightQty,
    draftFinalWeightUnit,
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
  const finalWeightLive = parseDecimal(draftFinalWeightQty);
  const effectiveYieldForCost =
    recipe?.isSubRecipe
      ? finalWeightLive != null && finalWeightLive > 0
        ? finalWeightLive
        : recipe
          ? effectiveRecipeYieldQtyForCost(recipe)
          : yLive
      : yLive;
  const costPerYield = effectiveYieldForCost > 0 ? Math.round((totalCostLive / effectiveYieldForCost) * 100) / 100 : 0;
  const pesoEntradaKg = useMemo(() => {
    const toKg = (qty: number, unit: EscandalloLine['unit']): number => {
      if (!Number.isFinite(qty) || qty <= 0) return 0;
      if (unit === 'kg') return qty;
      if (unit === 'g') return qty / 1000;
      return 0;
    };
    return Math.round(lines.reduce((acc, line) => acc + toKg(line.qty, line.unit), 0) * 1000) / 1000;
  }, [lines]);
  const rendimientoPct =
    recipe?.isSubRecipe && finalWeightLive != null && finalWeightLive > 0 && pesoEntradaKg > 0
      ? Math.round((finalWeightLive / pesoEntradaKg) * 10000) / 100
      : null;
  const grossLive = parseDecimal(draftSaleGross);
  const vatLive = parseDecimal(draftSaleVat) ?? 10;
  const netSale =
    recipe && !recipe.isSubRecipe && grossLive != null && grossLive > 0
      ? saleNetPerUnitFromGross(grossLive, vatLive)
      : null;
  const fcPct =
    recipe && !recipe.isSubRecipe ? foodCostPercentOfNetSale(totalCostLive, yLive > 0 ? yLive : 1, netSale) : null;
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
    const finalWeight = parseDecimal(draftFinalWeightQty);
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
      if (recipe.isSubRecipe) {
        if (finalWeight != null && finalWeight > 0) {
          if (pesoEntradaKg > 0 && finalWeight > pesoEntradaKg) {
            setBanner('El peso final no puede superar el peso de entrada.');
            return;
          }
          patch.finalWeightQty = finalWeight;
          patch.finalWeightUnit = draftFinalWeightUnit;
        } else {
          patch.finalWeightQty = null;
          patch.finalWeightUnit = null;
        }
      }
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
                  finalWeightQty:
                    r.isSubRecipe
                      ? finalWeight != null && finalWeight > 0
                        ? Math.round(finalWeight * 10000) / 10000
                        : null
                      : r.finalWeightQty,
                  finalWeightUnit: r.isSubRecipe ? (finalWeight != null && finalWeight > 0 ? draftFinalWeightUnit : null) : r.finalWeightUnit,
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

  const handleRefreshCosts = async () => {
    if (!recipe) return;
    setBusyId('refresh');
    setBanner(null);
    try {
      await load();
      if (!demoReadonly && localId && supabaseOk) {
        await refreshRecipeLines(recipe.id);
      }
      setSuccessMsg('Costes actualizados.');
      window.setTimeout(() => setSuccessMsg(null), 2800);
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudieron actualizar los costes.');
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
      router.push(recipe.isSubRecipe ? '/escandallos?bases=1' : '/escandallos?libro=1');
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

  const kindLabel = recipe?.isSubRecipe ? 'BASE' : 'PLATO';
  const statusTone =
    fcPct != null && fcPct > 30
      ? 'bg-[#D32F2F]/10 text-[#B91C1C] ring-[#D32F2F]/15'
      : fcPct != null
        ? 'bg-emerald-50 text-emerald-800 ring-emerald-100'
        : 'bg-[#F7F3EE] text-[#7E7468] ring-[rgba(10,9,8,0.06)]';

  return (
    <div className="min-h-0 space-y-2 overflow-x-hidden pb-[calc(6.75rem+env(safe-area-inset-bottom,0px))]">
      {demoReadonly ? (
        <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-900 ring-1 ring-amber-200">
          Demo · solo lectura
        </span>
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
          <article className="rounded-xl border border-[rgba(10,9,8,0.06)] bg-white px-2.5 py-2 shadow-[0_1px_0_rgba(10,9,8,0.04)] ring-1 ring-[rgba(10,9,8,0.04)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <input
                  value={draftRecipeName}
                  disabled={demoReadonly}
                  onChange={(e) => setDraftRecipeName(e.target.value)}
                  className="w-full border-0 bg-transparent text-[15px] font-bold leading-tight tracking-tight text-[#0A0908] outline-none placeholder:text-[#7E7468]/50"
                  placeholder="Nombre de la receta"
                />
                <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7E7468]">
                  {kindLabel} · {draftYieldQty || recipe.yieldQty} {draftYieldLabel || recipe.yieldLabel}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.1em] ring-1 ${statusTone}`}>
                {statusLabel}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-4 divide-x divide-[rgba(10,9,8,0.06)] rounded-lg bg-[#FAFAF9] py-1.5 ring-1 ring-[rgba(10,9,8,0.04)]">
              <EditorMetric label="Coste/rac." value={formatMoneyEur(costPerYield)} />
              {!recipe.isSubRecipe ? (
                <EditorMetric label="PVP" value={grossLive != null && grossLive > 0 ? formatMoneyEur(grossLive) : '—'} />
              ) : (
                <EditorMetric label="Total" value={formatMoneyEur(totalCostLive)} />
              )}
              {!recipe.isSubRecipe ? (
                <EditorMetric label="Food cost" value={fcPct != null ? `${fcPct.toFixed(1)} %` : '—'} valueClassName={fcValueClass(fcPct)} />
              ) : (
                <EditorMetric label="Rendim." value={rendimientoPct != null ? `${rendimientoPct.toFixed(1)} %` : '—'} />
              )}
              {!recipe.isSubRecipe ? (
                <EditorMetric label="Margen" value={marginPct != null ? `${marginPct} %` : '—'} valueClassName={fcPct != null && fcPct <= 30 ? 'text-emerald-700' : 'text-[#0A0908]'} />
              ) : (
                <EditorMetric label="Entrada" value={`${pesoEntradaKg.toFixed(2)} kg`} />
              )}
            </div>

          </article>

          <section className="overflow-hidden rounded-xl border border-[rgba(10,9,8,0.06)] bg-white ring-1 ring-[rgba(10,9,8,0.04)]">
            <button
              type="button"
              onClick={() => setIngredientsOpen((v) => !v)}
              className="flex min-h-11 w-full items-center gap-2 px-2.5 py-2 text-left transition hover:bg-[#FAFAF9]"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#F7F3EE] text-[#7E7468] ring-1 ring-[rgba(10,9,8,0.06)]">
                <ClipboardList className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-black uppercase tracking-wide text-[#0A0908]">Ingredientes</span>
                <span className="block truncate text-[10px] font-medium text-[#7E7468]">
                  {sortedLines.length > 0 ? `${sortedLines.length} ingredientes` : 'Sin ingredientes'}
                </span>
              </span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[#7E7468] transition ${ingredientsOpen ? 'rotate-180' : ''}`} />
            </button>
            {ingredientsOpen ? (
              <div className="border-t border-[rgba(10,9,8,0.06)] px-2.5 py-2">
                {sortedLines.length === 0 ? (
                  <p className="text-[12px] text-[#7E7468]">Sin ingredientes. Busca abajo para añadir el primero.</p>
                ) : (
                  <ul className="space-y-1">
                    {sortedLines.map((line) => {
                      const unitEur = lineUnitPriceEur(line, rawById, processedById, priceInner);
                      const lineCost = Math.round(line.qty * unitEur * 100) / 100;
                      const parsed = parseLineLabel(line.label);
                      const subLines =
                        line.sourceType === 'subrecipe' && line.subRecipeId
                          ? (linesByRecipe[line.subRecipeId] ?? [])
                          : [];
                      return (
                        <li
                          key={line.id}
                          className="rounded-lg border border-[rgba(10,9,8,0.06)] bg-[#FAFAF9]/80 px-2 py-1.5"
                        >
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-2 text-[12px] font-bold leading-snug text-[#0A0908]">{parsed.name}</p>
                              {parsed.supplier ? (
                                <p className="truncate text-[9px] text-[#7E7468]">{parsed.supplier}</p>
                              ) : null}
                              <p className="text-[10px] tabular-nums text-[#7E7468]">
                                {line.qty} {line.unit} · {formatUnitPriceEur(unitEur, line.unit)}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-0.5">
                              <p className="text-[13px] font-black tabular-nums leading-none text-[#0A0908]">
                                {formatMoneyEur(lineCost)}
                              </p>
                              <button
                                type="button"
                                disabled={busyId === line.id || demoReadonly}
                                onClick={() => void handleDeleteLine(line.id)}
                                className="grid h-6 w-6 place-items-center rounded-md text-[#D32F2F] transition hover:bg-[#D32F2F]/10 disabled:opacity-40"
                                aria-label="Eliminar ingrediente"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          {subLines.length > 0 ? (
                            <ul className="mt-1 space-y-0.5 border-t border-dashed border-[rgba(10,9,8,0.08)] pt-1 text-[9px] text-[#7E7468]">
                              {subLines.map((sl) => (
                                <li key={sl.id} className="tabular-nums">
                                  {sl.label} · {sl.qty} {sl.unit}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="mt-2 border-t border-[rgba(10,9,8,0.06)] pt-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#7E7468]">Añadir ingrediente</p>
                  <div className="mt-2">
                    <EscandalloIngredientDraftEditor
                      variant="editor"
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
                    className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#D32F2F] text-[12px] font-bold text-white transition hover:bg-[#B91C1C] active:scale-[0.99] disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4 shrink-0" aria-hidden />
                    Añadir a la receta
                  </button>
                </div>
              </div>
            ) : null}
          </section>

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

          <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[rgba(10,9,8,0.08)] bg-white/92 px-3 py-2 shadow-[0_-4px_18px_rgba(10,9,8,0.08)] backdrop-blur-md max-lg:pb-[calc(0.55rem+env(safe-area-inset-bottom,0px))]">
            <div className="mx-auto max-w-lg">
              <div className="grid grid-cols-4 gap-1 rounded-lg bg-[#FAFAF9] px-1 py-1 ring-1 ring-[rgba(10,9,8,0.04)]">
                <EditorMetric label="Coste" value={formatMoneyEur(totalCostLive)} />
                <EditorMetric
                  label="FC"
                  value={!recipe.isSubRecipe && fcPct != null ? `${fcPct.toFixed(1)}%` : '—'}
                  valueClassName={fcValueClass(fcPct)}
                />
                <EditorMetric
                  label="MRG"
                  value={marginPct != null ? `${marginPct}%` : '—'}
                  valueClassName={fcPct != null && fcPct <= 30 ? 'text-emerald-700' : 'text-[#0A0908]'}
                />
                <EditorMetric label="Ing." value={String(sortedLines.length)} />
              </div>
              {alerts.length > 0 ? (
                <p className="mt-1 truncate text-center text-[8px] font-semibold text-amber-800">{alerts.slice(0, 2).join(' · ')}</p>
              ) : null}
              <div className="mt-1.5 grid grid-cols-3 gap-1">
                <button
                  type="button"
                  disabled={busyId === recipe.id || demoReadonly}
                  onClick={() => void handleSaveRecipeMeta()}
                  className="col-span-3 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#D32F2F] text-[12px] font-bold text-white transition hover:bg-[#B91C1C] disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {busyId === recipe.id ? 'Guardando…' : 'Guardar cambios'}
                </button>
                <button
                  type="button"
                  disabled={busyId === 'refresh' || demoReadonly}
                  onClick={() => void handleRefreshCosts()}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[rgba(10,9,8,0.08)] bg-white text-[9px] font-semibold text-[#0A0908]"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${busyId === 'refresh' ? 'animate-spin' : ''}`} />
                  Actualizar
                </button>
                <button
                  type="button"
                  disabled={busyId === recipe.id || demoReadonly}
                  onClick={() => void handleDeleteRecipe()}
                  className="col-span-2 inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[#D32F2F]/20 bg-[#D32F2F]/5 text-[9px] font-semibold text-[#B91C1C]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar receta
                </button>
              </div>
            </div>
          </div>

        </>
      )}
    </div>
  );
}
