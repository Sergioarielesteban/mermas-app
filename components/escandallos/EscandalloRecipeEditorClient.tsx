'use client';

import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  FileText,
  Plus,
  RefreshCw,
  Save,
  StickyNote,
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
  effectiveRecipeYieldQtyForCost,
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

function fcValueClass(pct: number | null): string {
  if (pct == null) return 'text-[#7E7468]';
  if (pct > 30) return 'text-[#D32F2F]';
  return 'text-emerald-700';
}

function lineSourceBadge(type: EscandalloLine['sourceType']): string {
  switch (type) {
    case 'raw':
      return 'CRUDO';
    case 'processed':
      return 'ELABORADO';
    case 'subrecipe':
      return 'BASE';
    default:
      return 'MANUAL';
  }
}

function lineBadgeTone(type: EscandalloLine['sourceType']): string {
  switch (type) {
    case 'raw':
      return 'bg-[#F7F3EE] text-[#7E7468] ring-[rgba(10,9,8,0.06)]';
    case 'processed':
      return 'bg-violet-50 text-violet-800 ring-violet-100';
    case 'subrecipe':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-100';
    default:
      return 'bg-zinc-100 text-zinc-600 ring-zinc-200';
  }
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
  const [techOpen, setTechOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
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
    setDraftFinalWeightQty(r.finalWeightQty != null ? String(r.finalWeightQty) : '');
    setDraftFinalWeightUnit(r.finalWeightUnit === 'l' ? 'l' : 'kg');
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
      setDraftFinalWeightQty(stored.draftFinalWeightQty ?? (recipe.finalWeightQty != null ? String(recipe.finalWeightQty) : ''));
      setDraftFinalWeightUnit(stored.draftFinalWeightUnit === 'l' ? 'l' : recipe.finalWeightUnit === 'l' ? 'l' : 'kg');
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
    <div className="min-h-0 space-y-3 overflow-x-hidden pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))]">
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

            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-lg py-1 text-left transition hover:bg-[#FAFAF9]/80"
            >
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.12em] text-[#7E7468]">
                Precio y rendimiento
              </span>
              {!detailsOpen ? (
                <span className="min-w-0 flex-1 truncate text-[10px] font-medium tabular-nums text-[#0A0908]">
                  {recipe.isSubRecipe ? (
                    <>
                      {draftYieldQty || recipe.yieldQty} {draftYieldLabel || recipe.yieldLabel}
                      {finalWeightLive != null && finalWeightLive > 0
                        ? ` · ${finalWeightLive} ${draftFinalWeightUnit}`
                        : ''}
                    </>
                  ) : (
                    <>
                      {draftYieldQty || recipe.yieldQty} {draftYieldLabel || recipe.yieldLabel}
                      {grossLive != null && grossLive > 0 ? ` · ${formatMoneyEur(grossLive)}` : ' · sin PVP'}
                      {grossLive != null && grossLive > 0 ? ` · IVA ${draftSaleVat || '10'}%` : ''}
                      {draftPosArticleCode.trim() ? ` · TPV ${draftPosArticleCode.trim()}` : ''}
                    </>
                  )}
                </span>
              ) : (
                <span className="min-w-0 flex-1" />
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-[#7E7468] transition ${detailsOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {detailsOpen ? (
              <div className="mt-1 space-y-1.5 border-t border-[rgba(10,9,8,0.06)] pt-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <span className="w-full text-[8px] font-bold uppercase tracking-[0.1em] text-[#7E7468] sm:w-auto sm:mr-0.5">
                    Rendimiento
                  </span>
                  <input
                    value={draftYieldQty}
                    disabled={demoReadonly}
                    onChange={(e) => setDraftYieldQty(e.target.value)}
                    className="h-8 w-12 rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-1.5 text-center text-[13px] font-black tabular-nums text-[#0A0908] outline-none focus:border-[#D32F2F]/35 focus:ring-1 focus:ring-[#D32F2F]/15"
                    inputMode="decimal"
                    aria-label="Cantidad de rendimiento"
                  />
                  <input
                    value={draftYieldLabel}
                    disabled={demoReadonly}
                    onChange={(e) => setDraftYieldLabel(e.target.value)}
                    className="h-8 min-w-[4.5rem] flex-1 rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-2 text-[12px] font-semibold text-[#0A0908] outline-none focus:border-[#D32F2F]/35 focus:ring-1 focus:ring-[#D32F2F]/15 sm:max-w-[7rem]"
                    placeholder="raciones"
                    aria-label="Unidad de rendimiento"
                  />
                </div>

                {recipe.isSubRecipe ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <span className="w-full text-[8px] font-bold uppercase tracking-[0.1em] text-[#7E7468] sm:w-auto">
                      Peso final
                    </span>
                    <input
                      value={draftFinalWeightQty}
                      disabled={demoReadonly}
                      onChange={(e) => setDraftFinalWeightQty(e.target.value)}
                      className="h-8 w-16 rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-1.5 text-center text-[13px] font-black tabular-nums text-[#0A0908] outline-none focus:border-[#D32F2F]/35 focus:ring-1 focus:ring-[#D32F2F]/15"
                      inputMode="decimal"
                      placeholder="0"
                      aria-label="Peso final"
                    />
                    <select
                      value={draftFinalWeightUnit}
                      disabled={demoReadonly}
                      onChange={(e) => setDraftFinalWeightUnit(e.target.value === 'l' ? 'l' : 'kg')}
                      className="h-8 rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-2 text-[11px] font-bold uppercase text-[#0A0908] outline-none focus:border-[#D32F2F]/35"
                      aria-label="Unidad peso final"
                    >
                      <option value="kg">kg</option>
                      <option value="l">L</option>
                    </select>
                    {rendimientoPct != null ? (
                      <span className="text-[10px] font-semibold tabular-nums text-[#7E7468]">
                        {rendimientoPct.toFixed(1)}% rend.
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {!recipe.isSubRecipe ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <span className="w-full text-[8px] font-bold uppercase tracking-[0.1em] text-[#7E7468] sm:w-auto">
                      Carta
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-semibold text-[#7E7468]">€</span>
                      <input
                        value={draftSaleGross}
                        disabled={demoReadonly}
                        onChange={(e) => setDraftSaleGross(e.target.value)}
                        className="h-8 w-[4.5rem] rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-1.5 text-[13px] font-black tabular-nums text-[#0A0908] outline-none focus:border-[#D32F2F]/35 focus:ring-1 focus:ring-[#D32F2F]/15"
                        inputMode="decimal"
                        placeholder="PVP"
                        aria-label="PVP con IVA"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold uppercase text-[#7E7468]">IVA</span>
                      <input
                        value={draftSaleVat}
                        disabled={demoReadonly}
                        onChange={(e) => setDraftSaleVat(e.target.value)}
                        className="h-8 w-11 rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-1 text-center text-[12px] font-bold tabular-nums text-[#0A0908] outline-none focus:border-[#D32F2F]/35 focus:ring-1 focus:ring-[#D32F2F]/15"
                        inputMode="decimal"
                        aria-label="IVA porcentaje"
                      />
                      <span className="text-[11px] text-[#7E7468]">%</span>
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-1 sm:max-w-[9rem]">
                      <span className="shrink-0 text-[9px] font-bold uppercase text-[#7E7468]">TPV</span>
                      <input
                        value={draftPosArticleCode}
                        disabled={demoReadonly}
                        onChange={(e) => setDraftPosArticleCode(e.target.value)}
                        className="h-8 min-w-0 flex-1 rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-2 font-mono text-[11px] text-[#0A0908] outline-none focus:border-[#D32F2F]/35 focus:ring-1 focus:ring-[#D32F2F]/15"
                        placeholder="00042"
                        aria-label="Código TPV"
                      />
                    </div>
                  </div>
                ) : null}

                {recipe.isSubRecipe && pesoEntradaKg > 0 && finalWeightLive != null && finalWeightLive > pesoEntradaKg ? (
                  <p className="text-[9px] font-medium text-amber-700">El peso final supera la entrada.</p>
                ) : null}
                {recipe.isSubRecipe && (finalWeightLive == null || finalWeightLive <= 0) ? (
                  <p className="text-[9px] text-amber-700">Indica peso final para coste preciso.</p>
                ) : null}
              </div>
            ) : null}

          </article>

          <section className="rounded-xl border border-[rgba(10,9,8,0.06)] bg-white px-2.5 py-2 ring-1 ring-[rgba(10,9,8,0.04)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-[11px] font-black uppercase tracking-wide text-[#0A0908]">Ingredientes</h2>
              <span className="text-[10px] font-semibold tabular-nums text-[#7E7468]">{sortedLines.length}</span>
            </div>
            {sortedLines.length === 0 ? (
              <p className="text-[12px] text-[#7E7468]">Sin ingredientes. Busca abajo para añadir el primero.</p>
            ) : (
              <ul className="space-y-1.5">
                {sortedLines.map((line, idx) => {
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
                      className="rounded-xl border border-[rgba(10,9,8,0.06)] bg-[#FAFAF9]/80 px-2.5 py-2"
                    >
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.1em] ring-1 ${lineBadgeTone(line.sourceType)}`}>
                          {lineSourceBadge(line.sourceType)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-[12px] font-bold leading-tight text-[#0A0908]">{parsed.name}</p>
                          {parsed.supplier ? (
                            <p className="mt-0.5 truncate text-[10px] text-[#7E7468]">{parsed.supplier}</p>
                          ) : null}
                          <p className="mt-0.5 text-[10px] tabular-nums text-[#7E7468]">
                            {line.qty} {line.unit} · {formatUnitPriceEur(unitEur, line.unit)}
                          </p>
                        </div>
                        <p className="shrink-0 text-[14px] font-black tabular-nums text-[#0A0908]">{formatMoneyEur(lineCost)}</p>
                      </div>
                      <div className="mt-2 flex justify-end gap-0.5 border-t border-[rgba(10,9,8,0.06)] pt-1.5">
                        <button
                          type="button"
                          disabled={idx === 0 || busyId === 'reorder' || demoReadonly}
                          onClick={() => void swapLineOrder(idx, idx - 1)}
                          className="grid h-7 w-7 place-items-center rounded-md text-[#7E7468] hover:bg-white disabled:opacity-25"
                          aria-label="Subir"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx >= sortedLines.length - 1 || busyId === 'reorder' || demoReadonly}
                          onClick={() => void swapLineOrder(idx, idx + 1)}
                          className="grid h-7 w-7 place-items-center rounded-md text-[#7E7468] hover:bg-white disabled:opacity-25"
                          aria-label="Bajar"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={busyId === line.id || demoReadonly}
                          onClick={() => void handleDeleteLine(line.id)}
                          className="grid h-7 w-7 place-items-center rounded-md text-[#D32F2F] hover:bg-[#D32F2F]/10 disabled:opacity-40"
                          aria-label="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {subLines.length > 0 ? (
                        <ul className="mt-2 space-y-0.5 border-t border-dashed border-[rgba(10,9,8,0.08)] pt-1.5 text-[10px] text-[#7E7468]">
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
          </section>

          <section className="rounded-xl border border-[rgba(10,9,8,0.06)] bg-white px-2.5 py-2.5 ring-1 ring-[rgba(10,9,8,0.04)]">
            <h2 className="text-[11px] font-black uppercase tracking-wide text-[#0A0908]">Añadir ingrediente</h2>
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
                addButtonLabel="Otra línea pendiente"
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
          </section>

          <div className="rounded-xl border border-[rgba(10,9,8,0.06)] bg-white ring-1 ring-[rgba(10,9,8,0.04)]">
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
            >
              <StickyNote className="h-4 w-4 shrink-0 text-[#7E7468]" />
              <span className="flex-1 text-[11px] font-bold text-[#0A0908]">Notas internas</span>
              <ChevronDown className={`h-4 w-4 text-[#7E7468] transition ${notesOpen ? 'rotate-180' : ''}`} />
            </button>
            {notesOpen ? (
              <div className="border-t border-[rgba(10,9,8,0.06)] px-3 pb-3 pt-2">
                <textarea
                  value={draftRecipeNotes}
                  disabled={demoReadonly}
                  onChange={(e) => setDraftRecipeNotes(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-2.5 py-2 text-[12px] text-[#0A0908] outline-none focus:border-[#D32F2F]/35 focus:ring-2 focus:ring-[#D32F2F]/10"
                  placeholder="Notas de cocina, mise en place, avisos…"
                />
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-[rgba(10,9,8,0.06)] bg-white ring-1 ring-[rgba(10,9,8,0.04)]">
            <button
              type="button"
              onClick={() => setTechOpen((v) => !v)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
            >
              <FileText className="h-4 w-4 shrink-0 text-[#7E7468]" />
              <span className="flex-1 text-[11px] font-bold text-[#0A0908]">Ficha técnica y alérgenos</span>
              {recipeAllergens.length > 0 ? (
                <span className="rounded-full bg-[#F7F3EE] px-1.5 py-0.5 text-[9px] font-bold text-[#7E7468]">
                  {recipeAllergens.length}
                </span>
              ) : null}
              <ChevronDown className={`h-4 w-4 shrink-0 text-[#7E7468] transition ${techOpen ? 'rotate-180' : ''}`} />
            </button>
            {techOpen && recipe ? (
              <div className="border-t border-[rgba(10,9,8,0.06)] px-2 pb-2 pt-1">
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
              </div>
            ) : null}
          </div>

          <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[rgba(10,9,8,0.08)] bg-white/95 px-3 py-2.5 shadow-[0_-6px_24px_rgba(10,9,8,0.1)] backdrop-blur-md max-lg:pb-[calc(0.65rem+env(safe-area-inset-bottom,0px))]">
            <div className="mx-auto max-w-lg">
              <div className="grid grid-cols-4 gap-1 rounded-lg bg-[#FAFAF9] py-1.5 ring-1 ring-[rgba(10,9,8,0.04)]">
                <EditorMetric label="Coste" value={formatMoneyEur(totalCostLive)} />
                <EditorMetric
                  label="Food cost"
                  value={!recipe.isSubRecipe && fcPct != null ? `${fcPct.toFixed(1)}%` : '—'}
                  valueClassName={fcValueClass(fcPct)}
                />
                <EditorMetric
                  label="Margen"
                  value={marginPct != null ? `${marginPct}%` : '—'}
                  valueClassName={fcPct != null && fcPct <= 30 ? 'text-emerald-700' : 'text-[#0A0908]'}
                />
                <EditorMetric label="Ing." value={String(sortedLines.length)} />
              </div>
              {alerts.length > 0 ? (
                <p className="mt-1.5 truncate text-center text-[9px] font-semibold text-amber-800">{alerts.slice(0, 2).join(' · ')}</p>
              ) : null}
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  disabled={busyId === recipe.id || demoReadonly}
                  onClick={() => void handleSaveRecipeMeta()}
                  className="col-span-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#D32F2F] text-[12px] font-bold text-white transition hover:bg-[#B91C1C] disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {busyId === recipe.id ? 'Guardando…' : 'Guardar cambios'}
                </button>
                <button
                  type="button"
                  disabled={busyId === 'refresh' || demoReadonly}
                  onClick={() => void handleRefreshCosts()}
                  className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-[rgba(10,9,8,0.08)] bg-white text-[10px] font-semibold text-[#0A0908]"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${busyId === 'refresh' ? 'animate-spin' : ''}`} />
                  Actualizar
                </button>
                <button
                  type="button"
                  disabled={busyId === recipe.id || demoReadonly}
                  onClick={() => void handleDeleteRecipe()}
                  className="col-span-2 inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-[#D32F2F]/20 bg-[#D32F2F]/5 text-[10px] font-semibold text-[#B91C1C]"
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
