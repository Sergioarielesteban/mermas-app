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
  Plus,
  Refrigerator,
  Save,
  ShieldCheck,
  StickyNote,
  Trash2,
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
import {
  fetchEscandalloTechnicalSheetsMap,
  insertEscandalloTechnicalSheet,
  replaceEscandalloTechnicalSheetSteps,
  updateEscandalloTechnicalSheet,
  type EscandalloTechnicalSheetUpdate,
  type EscandalloTechnicalSheet,
  type TechnicalSheetStepDraft,
} from '@/lib/escandallos-technical-sheet-supabase';
import { fetchEscandalloRecipeCategoriasMap } from '@/lib/finanzas-rentabilidad-escandallo';
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
import {
  computeMermaPct,
  computeOperationalCost,
  computeYieldCostPerUnit,
  convertQuantity,
  inferUsageTypeFromUnit,
  type EscandalloOperationalUsageType,
  type EscandalloYieldUnit,
} from '@/lib/escandallo-operational-usage';
import { totalInputWeightKg } from '@/lib/escandallo-input-weight';

type RecipeKind = 'plato' | 'base' | 'elaboracion';
type NewStepDraft = TechnicalSheetStepDraft & {
  key: string;
  isCritical?: boolean;
  targetTemperature?: string;
  targetTime?: string;
  controlObservation?: string;
};

const RECIPE_KIND_OPTIONS: Array<{ value: RecipeKind; label: string; defaultYieldLabel: string }> = [
  { value: 'plato', label: 'Plato', defaultYieldLabel: 'raciones' },
  { value: 'base', label: 'Base', defaultYieldLabel: 'kg' },
  { value: 'elaboracion', label: 'Elaboración', defaultYieldLabel: 'kg' },
];

function newStepDraft(): NewStepDraft {
  return {
    key: `s-${Math.random().toString(36).slice(2, 11)}`,
    titulo: '',
    descripcion: '',
    isCritical: false,
    targetTemperature: '',
    targetTime: '',
    controlObservation: '',
  };
}

function normalizeRecipeKind(value: string | null | undefined): RecipeKind {
  if (value === 'base') return 'base';
  if (value === 'elaboracion' || value === 'subelaboracion') return 'elaboracion';
  return 'plato';
}

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
  const [technicalSheetsByRecipe, setTechnicalSheetsByRecipe] = useState<Map<string, EscandalloTechnicalSheet>>(new Map());
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [yieldQty, setYieldQty] = useState('1');
  const [yieldLabel, setYieldLabel] = useState('raciones');
  const [saleGross, setSaleGross] = useState('');
  const [saleVat, setSaleVat] = useState('10');
  const [finalWeightQty, setFinalWeightQty] = useState('');
  const [finalWeightUnit, setFinalWeightUnit] = useState<EscandalloYieldUnit>('kg');
  const [operationalUsageType, setOperationalUsageType] = useState<EscandalloOperationalUsageType>('standard_portion');
  const [operationalQuantity, setOperationalQuantity] = useState('');
  const [operationalUnit, setOperationalUnit] = useState<EscandalloYieldUnit>('g');
  const [ingredientDrafts, setIngredientDrafts] = useState<IngredientDraftRow[]>([emptyIngredientDraft()]);
  const [recipeKind, setRecipeKind] = useState<RecipeKind>('plato');
  const [photoPreview, setPhotoPreview] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [familyOptions, setFamilyOptions] = useState<string[]>([]);
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const [rendimientoTotal, setRendimientoTotal] = useState('');
  const [numeroRaciones, setNumeroRaciones] = useState('');
  const [gramajePorRacion, setGramajePorRacion] = useState('');
  const [tPrep, setTPrep] = useState('');
  const [tCocc, setTCocc] = useState('');
  const [tReposo, setTReposo] = useState('');
  const [tempServicio, setTempServicio] = useState('');
  const [tipoCons, setTipoCons] = useState('');
  const [tempCons, setTempCons] = useState('');
  const [vidaUtil, setVidaUtil] = useState('');
  const [regeneracion, setRegeneracion] = useState('');
  const [alergManual, setAlergManual] = useState('');
  const [emplDesc, setEmplDesc] = useState('');
  const [emplDeco, setEmplDeco] = useState('');
  const [emplMenaje, setEmplMenaje] = useState('');
  const [emplFoto, setEmplFoto] = useState('');
  const [notasChef, setNotasChef] = useState('');
  const [stepDrafts, setStepDrafts] = useState<NewStepDraft[]>([newStepDraft()]);

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
      setFinalWeightQty(d.finalWeightQty ?? '');
      setFinalWeightUnit(d.finalWeightUnit ?? 'kg');
      setOperationalUsageType(d.operationalUsageType ?? 'standard_portion');
      setOperationalQuantity(d.operationalQuantity ?? '');
      setOperationalUnit(d.operationalUnit ?? 'g');
      setIngredientDrafts(d.ingredientDrafts);
      setRecipeKind(normalizeRecipeKind(d.recipeKind));
    } else {
      const tipo = searchParams.get('tipo');
      if (tipo === 'base' || tipo === 'elaboracion' || tipo === 'subelaboracion') {
        const nextKind = normalizeRecipeKind(tipo);
        const nextOption = RECIPE_KIND_OPTIONS.find((option) => option.value === nextKind);
        setRecipeKind(nextKind);
        setYieldLabel(nextOption?.defaultYieldLabel ?? 'kg');
      }
    }
    setWizardSessionReady(true);
  }, [profileReady, localId, searchParams]);

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
      finalWeightQty,
      finalWeightUnit,
      operationalUsageType,
      operationalQuantity,
      operationalUnit,
      ingredientDrafts,
      updatedAt: Date.now(),
    });
  }, [profileReady, localId, wizardSessionReady, step, name, yieldQty, yieldLabel, saleGross, saleVat, recipeKind, finalWeightQty, finalWeightUnit, operationalUsageType, operationalQuantity, operationalUnit, ingredientDrafts]);

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setRecipes([]);
      setLinesByRecipe({});
      setRawProducts([]);
      setProcessedProducts([]);
      setTechnicalSheetsByRecipe(new Map());
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    if (!catalogHydratedRef.current) {
      setLoading(true);
    }
    try {
      const [r, raw, processed, categoryMap, sheetsMap] = await Promise.all([
        fetchEscandalloRecipes(supabase, localId),
        fetchEscandalloRawProductsWithWeightedPurchasePrices(supabase, localId),
        fetchProcessedProductsForEscandallo(supabase, localId),
        fetchEscandalloRecipeCategoriasMap(supabase, localId),
        fetchEscandalloTechnicalSheetsMap(supabase, localId),
      ]);
      setRecipes(r);
      setRawProducts(raw);
      setProcessedProducts(processed);
      setTechnicalSheetsByRecipe(sheetsMap);
      setFamilyOptions(
        [...new Set([...categoryMap.values()].map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
          a.localeCompare(b, 'es'),
        ),
      );
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
  const selectedRecipeKind = RECIPE_KIND_OPTIONS.find((option) => option.value === recipeKind) ?? RECIPE_KIND_OPTIONS[0];
  const isPlateRecipe = recipeKind === 'plato';

  const yNum = parseDecimal(yieldQty) ?? 1;
  const gross = parseDecimal(saleGross);
  const vat = parseDecimal(saleVat) ?? 10;
  const finalWeightNum = parseDecimal(finalWeightQty);
  const operationalQtyNum = parseDecimal(operationalQuantity);
  const netSale = gross != null && gross > 0 ? saleNetPerUnitFromGross(gross, vat) : null;
  const inputWeight = useMemo(() => totalInputWeightKg(tempLines, rawById), [tempLines, rawById]);
  const pesoEntradaKg = Math.round(inputWeight.kg * 1000) / 1000;
  const hasVolumeWithoutWeightConversion = inputWeight.missingConversionLines.length > 0;
  const effectiveYieldForCost =
    !isPlateRecipe && finalWeightNum != null && finalWeightNum > 0 ? finalWeightNum : yNum;
  const totalCost = useMemo(() => {
    if (!previewBuilt.ok) return 0;
    return recipeTotalCostEur(tempLines, rawById, processedById, {
      linesByRecipe,
      recipesById,
      recipeId: tempRecipeId,
    });
  }, [previewBuilt.ok, tempLines, rawById, processedById, linesByRecipe, recipesById]);
  const perYield = effectiveYieldForCost > 0 ? Math.round((totalCost / effectiveYieldForCost) * 100) / 100 : 0;
  const mermaPct =
    !isPlateRecipe && finalWeightNum != null && finalWeightNum > 0 && pesoEntradaKg > 0
      ? computeMermaPct(pesoEntradaKg, 'kg', finalWeightNum, finalWeightUnit)
      : null;
  const yieldCostPerUnit =
    !isPlateRecipe && finalWeightNum != null && finalWeightNum > 0
      ? computeYieldCostPerUnit(totalCost, finalWeightNum)
      : null;
  const operationalCost =
    !isPlateRecipe && yieldCostPerUnit != null && operationalQtyNum != null && operationalQtyNum > 0
      ? computeOperationalCost(yieldCostPerUnit, finalWeightUnit, operationalQtyNum, operationalUnit)
      : null;
  const fcPct = foodCostPercentOfNetSale(totalCost, yNum > 0 ? yNum : 1, netSale);
  const fcHint = foodCostStatus(fcPct);
  const marginPct = fcPct != null ? Math.round((100 - fcPct) * 10) / 10 : null;
  const canStep1 = name.trim().length > 0 && yNum > 0;
  const canFinish = canStep1 && (!isPlateRecipe || familyName.trim().length > 0) && !saving;

  const parseOptInt = (raw: string): number | null => {
    const t = raw.trim();
    if (t === '') return null;
    const n = Math.round(Number(t.replace(',', '.')));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const parseOptDecimal = (raw: string): number | null => {
    const t = raw.trim().replace(',', '.');
    if (t === '') return null;
    const match = t.match(/\d+(?:\.\d+)?/);
    const n = match ? Number(match[0]) : Number(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 10000) / 10000 : null;
  };

  const buildCriticalStepSummaries = (): string[] =>
    stepDrafts
      .filter((d) => d.isCritical)
      .map((d, idx) => {
        const title = d.titulo.trim() || `Paso ${idx + 1}`;
        const details = [
          d.targetTemperature?.trim() ? `Temp. ${d.targetTemperature.trim()}` : '',
          d.targetTime?.trim() ? `Tiempo ${d.targetTime.trim()}` : '',
          d.controlObservation?.trim(),
        ].filter(Boolean);
        return details.length > 0 ? `${title}: ${details.join(' · ')}` : title;
      });

  const buildTechnicalPatch = (): EscandalloTechnicalSheetUpdate => ({
    categoria: isPlateRecipe ? familyName.trim() : '',
    fotoUrl: photoPreview.trim() === '' ? null : photoPreview.trim(),
    activa: true,
    rendimientoTotal: rendimientoTotal.trim(),
    numeroRaciones: parseOptDecimal(numeroRaciones),
    gramajePorRacionG: parseOptDecimal(gramajePorRacion),
    tiempoPreparacionMin: parseOptInt(tPrep),
    tiempoCoccionMin: parseOptInt(tCocc),
    tiempoReposoMin: parseOptInt(tReposo),
    temperaturaServicio: tempServicio.trim(),
    tipoConservacion: tipoCons.trim(),
    temperaturaConservacion: tempCons.trim(),
    vidaUtil: vidaUtil.trim(),
    regeneracion: regeneracion.trim(),
    alergenosManual: alergManual
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
    emplatadoDescripcion: isPlateRecipe ? emplDesc.trim() : '',
    emplatadoDecoracion: isPlateRecipe ? emplDeco.trim() : '',
    emplatadoMenaje: isPlateRecipe ? emplMenaje.trim() : '',
    emplatadoFotoUrl: isPlateRecipe && emplFoto.trim() !== '' ? emplFoto.trim() : null,
    notasChef: notasChef.trim(),
    puntosCriticos: buildCriticalStepSummaries().join('\n'),
    yieldQuantity: !isPlateRecipe && finalWeightNum != null && finalWeightNum > 0 ? finalWeightNum : null,
    yieldUnit: !isPlateRecipe && finalWeightNum != null && finalWeightNum > 0 ? finalWeightUnit : null,
    yieldMermaPct: !isPlateRecipe ? mermaPct : null,
    yieldCostTotal: !isPlateRecipe ? totalCost : null,
    yieldCostPerUnit: !isPlateRecipe ? yieldCostPerUnit : null,
    operationalUsageType: !isPlateRecipe ? operationalUsageType : null,
    operationalQuantity:
      !isPlateRecipe && operationalQtyNum != null && operationalQtyNum > 0 ? operationalQtyNum : null,
    operationalUnit:
      !isPlateRecipe && operationalQtyNum != null && operationalQtyNum > 0 ? operationalUnit : null,
    operationalCost: !isPlateRecipe ? operationalCost : null,
  });

  const buildStepDrafts = (): TechnicalSheetStepDraft[] =>
    stepDrafts
      .filter((d) => d.titulo.trim() !== '' || d.descripcion.trim() !== '' || d.isCritical)
      .map((d, idx) => {
        const appccLines = d.isCritical
          ? [
              'APPCC: punto crítico',
              d.targetTemperature?.trim() ? `Temperatura objetivo: ${d.targetTemperature.trim()}` : '',
              d.targetTime?.trim() ? `Tiempo objetivo: ${d.targetTime.trim()}` : '',
              d.controlObservation?.trim() ? `Control: ${d.controlObservation.trim()}` : '',
            ].filter(Boolean)
          : [];
        return {
          titulo: d.titulo.trim() || `Paso ${idx + 1}`,
          descripcion: [d.descripcion.trim(), appccLines.join('\n')].filter(Boolean).join('\n\n'),
        };
      });

  const handleSave = async () => {
    if (!localId || !supabaseOk) return;
    if (!previewBuilt.ok) {
      setBanner(previewBuilt.message);
      return;
    }
    if (isPlateRecipe && !familyName.trim()) {
      setBanner('Añade una familia de carta para guardar la receta.');
      return;
    }
    setSaving(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      const outputInKg =
        !isPlateRecipe && finalWeightNum != null && finalWeightNum > 0
          ? convertQuantity(finalWeightNum, finalWeightUnit, 'kg')
          : null;
      if (!isPlateRecipe && outputInKg != null && pesoEntradaKg > 0 && outputInKg > pesoEntradaKg) {
        setBanner('El peso de salida no puede superar el peso de entrada.');
        return;
      }
      const recipe = await insertEscandalloRecipe(supabase, localId, name.trim(), {
        yieldQty: yNum,
        yieldLabel: yieldLabel.trim() || 'raciones',
        isSubRecipe: recipeKind !== 'plato',
        saleVatRatePct: gross != null && gross > 0 ? vat : null,
        salePriceGrossEur: gross != null && gross > 0 ? gross : null,
        finalWeightQty: !isPlateRecipe && finalWeightNum != null && finalWeightNum > 0 ? finalWeightNum : null,
        finalWeightUnit: !isPlateRecipe && finalWeightNum != null && finalWeightNum > 0 ? finalWeightUnit : null,
      });
      if (previewPayloads.length > 0) {
        await insertEscandalloLinesBatch(supabase, localId, recipe.id, previewPayloads, 0);
      }
      const sheet = await insertEscandalloTechnicalSheet(supabase, localId, recipe.id);
      await updateEscandalloTechnicalSheet(supabase, localId, sheet.id, buildTechnicalPatch());
      await replaceEscandalloTechnicalSheetSteps(supabase, localId, sheet.id, buildStepDrafts());
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

  const readImageFile = (file: File, onReady: (dataUrl: string) => void = setPhotoPreview) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onReady(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const createdIngredientCount = previewPayloads.length;
  const inputCls =
    'h-8 w-full rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-2 text-[12px] font-semibold text-[#0A0908] outline-none focus:border-[#C4531F]/45 focus:ring-1 focus:ring-[#C4531F]/15';
  const textareaCls =
    'min-h-14 w-full resize-none rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-2 py-1.5 text-[12px] leading-snug text-[#0A0908] outline-none focus:border-[#C4531F]/45 focus:ring-1 focus:ring-[#C4531F]/15';
  const labelCls = 'text-[8px] font-black uppercase tracking-[0.11em] text-[#7E7468]';
  const namePlaceholder =
    recipeKind === 'base' ? 'Nombre de la base' : recipeKind === 'elaboracion' ? 'Nombre de la elaboración' : 'Nombre del plato';
  const saveLabel =
    recipeKind === 'base' ? 'Guardar base' : recipeKind === 'elaboracion' ? 'Guardar elaboración' : 'Guardar receta';
  const criticalStepSummaries = buildCriticalStepSummaries();
  const allergenChips = alergManual
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
  const operationalSelectValue =
    operationalUsageType === 'standard_portion' ? 'standard_portion' : operationalUsageType === 'unit' ? 'unit' : 'custom';
  const totalTime = [tPrep, tCocc, tReposo].reduce((acc, n) => acc + (Number(n.replace(',', '.')) || 0), 0);
  const productionSummary = [
    isPlateRecipe && (numeroRaciones.trim() || yieldQty.trim()) ? `${numeroRaciones.trim() || yieldQty.trim()} rac.` : '',
    isPlateRecipe ? gramajePorRacion.trim() : finalWeightNum != null && finalWeightNum > 0 ? `${finalWeightNum} ${finalWeightUnit}` : '',
    totalTime > 0 ? `${totalTime} min` : '',
  ].filter(Boolean).join(' · ');
  const conservationSummary = [tipoCons.trim() || 'Tipo', tempCons.trim(), vidaUtil.trim()].filter(Boolean).join(' · ');
  const allergensSummary = allergenChips.slice(0, 3).join(' · ');
  const platingSummary = [emplDesc.trim() ? 'Montaje' : '', emplDeco.trim(), emplFoto.trim() ? 'foto' : ''].filter(Boolean).join(' · ');
  const observationsSummary = notasChef.trim() ? 1 : 0;
  const secondaryBlocks = [
    {
      id: 'production',
      title: 'Producción',
      summary: productionSummary || (isPlateRecipe ? `${yieldQty || '1'} ${yieldLabel || 'raciones'}` : 'Pasos y controles'),
      icon: Flame,
      tone: 'bg-[#D32F2F]/8 text-[#B91C1C] ring-[#D32F2F]/12',
    },
    {
      id: 'conservation',
      title: 'Conservación',
      summary: conservationSummary,
      icon: Refrigerator,
      tone: 'bg-[#4A6B3A]/10 text-[#35502A] ring-[#4A6B3A]/15',
    },
    {
      id: 'allergens',
      title: 'Alérgenos',
      summary: allergensSummary || 'Sin alérgenos',
      icon: AlertTriangle,
      tone: 'bg-[#B8872A]/10 text-[#7A5518] ring-[#B8872A]/15',
    },
    {
      id: 'plating',
      title: 'Emplatado',
      summary: platingSummary || 'Montaje, decoración, foto',
      icon: Utensils,
      tone: 'bg-[#F7F3EE] text-[#7E7468] ring-[rgba(10,9,8,0.06)]',
    },
    {
      id: 'appcc',
      title: 'APPCC',
      summary: criticalStepSummaries.length > 0 ? `${criticalStepSummaries.length} puntos críticos` : 'Sin puntos críticos',
      icon: ShieldCheck,
      tone: 'bg-[#4A6B3A]/10 text-[#35502A] ring-[#4A6B3A]/15',
    },
    {
      id: 'observations',
      title: 'Observaciones',
      summary: observationsSummary > 0 ? `${observationsSummary} notas` : 'Notas internas',
      icon: StickyNote,
      tone: 'bg-[#F7F3EE] text-[#7E7468] ring-[rgba(10,9,8,0.06)]',
    },
  ].filter((block) => isPlateRecipe || block.id !== 'plating');

  return (
    <div className="min-h-0 space-y-2 overflow-x-hidden pb-[calc(11.5rem+env(safe-area-inset-bottom,0px))]">
      {banner ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{banner}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Cargando catálogo…</p>
      ) : (
        <>
          <section className="rounded-xl border border-[rgba(10,9,8,0.06)] bg-white px-2.5 py-2 shadow-[0_1px_0_rgba(10,9,8,0.04)] ring-1 ring-[rgba(10,9,8,0.04)]">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 w-full rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-2.5 text-[17px] font-bold leading-tight text-[#0A0908] outline-none focus:border-[#D32F2F]/35 focus:ring-1 focus:ring-[#D32F2F]/10"
              placeholder={namePlaceholder}
              autoFocus
            />
            <div className="mt-2 grid grid-cols-[4.75rem_1fr] gap-2">
              <label className="grid h-[4.75rem] cursor-pointer place-items-center rounded-xl border border-dashed border-[rgba(10,9,8,0.14)] bg-[#FAFAF9] text-center text-[9px] font-bold text-[#7E7468]">
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

              <div className="min-w-0 space-y-2">
                  <div className={isPlateRecipe ? 'grid gap-1.5 sm:grid-cols-[11rem_1fr_auto]' : 'grid gap-1.5'}>
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
                      className="h-8 w-full rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-2 text-[12px] font-semibold text-[#0A0908] outline-none focus:border-[#D32F2F]/35 focus:ring-1 focus:ring-[#D32F2F]/10"
                      aria-label="Categoría de receta"
                    >
                      {RECIPE_KIND_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {isPlateRecipe ? (
                      <>
                        <input
                          list="escandallo-family-options"
                          value={familyName}
                          onChange={(e) => setFamilyName(e.target.value)}
                          className="h-8 min-w-0 rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-2 text-[12px] font-semibold text-[#0A0908] outline-none focus:border-[#D32F2F]/35 focus:ring-1 focus:ring-[#D32F2F]/10"
                          aria-label="Familia de carta"
                          placeholder="Familia carta"
                        />
                        <datalist id="escandallo-family-options">
                          {familyOptions.map((option) => (
                            <option key={option} value={option} />
                          ))}
                        </datalist>
                        <button
                          type="button"
                          onClick={() => {
                            if (!familyName.trim()) return;
                            setFamilyOptions((prev) =>
                              prev.includes(familyName.trim())
                                ? prev
                                : [...prev, familyName.trim()].sort((a, b) => a.localeCompare(b, 'es')),
                            );
                          }}
                          className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-[rgba(10,9,8,0.08)] bg-white px-2 text-[11px] font-bold text-[#C4531F]"
                        >
                          + Crear
                        </button>
                      </>
                    ) : null}
                  </div>

                {isPlateRecipe ? (
                  <div className="rounded-lg border border-[rgba(10,9,8,0.06)] bg-[#FAFAF9]/70 p-2">
                    <p className="mb-1.5 text-[8px] font-black uppercase tracking-[0.14em] text-[#7E7468]">Venta</p>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      <label className="space-y-1">
                        <span className={labelCls}>Raciones</span>
                        <input value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} className={inputCls} inputMode="decimal" />
                      </label>
                      <label className="space-y-1">
                        <span className={labelCls}>Unidad</span>
                        <input value={yieldLabel} onChange={(e) => setYieldLabel(e.target.value)} className={inputCls} />
                      </label>
                      <label className="space-y-1">
                        <span className={labelCls}>PVP</span>
                        <input value={saleGross} onChange={(e) => setSaleGross(e.target.value)} className={inputCls} inputMode="decimal" />
                      </label>
                      <label className="space-y-1">
                        <span className={labelCls}>IVA</span>
                        <input value={saleVat} onChange={(e) => setSaleVat(e.target.value)} className={inputCls} inputMode="decimal" />
                      </label>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg border border-[rgba(10,9,8,0.06)] bg-[#FAFAF9]/70 p-2">
                      <p className="mb-1.5 text-[8px] font-black uppercase tracking-[0.14em] text-[#7E7468]">Producción</p>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                        <label className="space-y-1">
                          <span className={labelCls}>Entrada total</span>
                          <input
                            value={pesoEntradaKg > 0 ? `${pesoEntradaKg.toFixed(2)} kg` : ''}
                            readOnly
                            className={`${inputCls} bg-white text-[#7E7468]`}
                          />
                        </label>
                        <label className="space-y-1">
                          <span className={labelCls}>Salida real</span>
                          <input value={finalWeightQty} onChange={(e) => setFinalWeightQty(e.target.value)} className={inputCls} inputMode="decimal" />
                        </label>
                        <label className="space-y-1">
                          <span className={labelCls}>Unidad salida</span>
                          <select
                            value={finalWeightUnit}
                            onChange={(e) => setFinalWeightUnit(e.target.value as EscandalloYieldUnit)}
                            className={inputCls}
                          >
                            <option value="kg">kg</option>
                            <option value="g">g</option>
                            <option value="l">l</option>
                            <option value="ml">ml</option>
                            <option value="ud">ud</option>
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className={labelCls}>Merma</span>
                          <input
                            value={mermaPct != null ? `${mermaPct.toFixed(2)} %` : ''}
                            readOnly
                            className={`${inputCls} bg-white text-[#7E7468]`}
                          />
                        </label>
                      </div>
                      {hasVolumeWithoutWeightConversion ? (
                        <p className="mt-1.5 rounded-lg bg-[#B8872A]/10 px-2 py-1 text-[10px] font-semibold text-[#7A5518]">
                          Configura equivalencia L → kg para incluir este ingrediente en la entrada total.
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-lg border border-[rgba(10,9,8,0.06)] bg-[#FAFAF9]/70 p-2">
                      <p className="mb-1.5 text-[8px] font-black uppercase tracking-[0.14em] text-[#7E7468]">Uso operativo</p>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        <label className="space-y-1 sm:col-span-1">
                          <span className={labelCls}>Tipo</span>
                          <select
                            value={operationalSelectValue}
                            onChange={(e) => {
                              const next = e.target.value;
                              if (next === 'standard_portion') setOperationalUsageType('standard_portion');
                              else if (next === 'unit') setOperationalUsageType('unit');
                              else setOperationalUsageType(inferUsageTypeFromUnit(operationalUnit) ?? 'weight');
                            }}
                            className={inputCls}
                          >
                            <option value="standard_portion">Ración estándar</option>
                            <option value="unit">Unidad</option>
                            <option value="custom">Personalizado</option>
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className={labelCls}>Cantidad</span>
                          <input value={operationalQuantity} onChange={(e) => setOperationalQuantity(e.target.value)} className={inputCls} inputMode="decimal" />
                        </label>
                        <label className="space-y-1">
                          <span className={labelCls}>Unidad</span>
                          <select
                            value={operationalUnit}
                            onChange={(e) => {
                              const next = e.target.value as EscandalloYieldUnit;
                              setOperationalUnit(next);
                              if (operationalUsageType !== 'standard_portion') {
                                const inferred = inferUsageTypeFromUnit(next);
                                if (inferred) setOperationalUsageType(inferred);
                              }
                            }}
                            className={inputCls}
                          >
                            <option value="g">g</option>
                            <option value="kg">kg</option>
                            <option value="ml">ml</option>
                            <option value="l">l</option>
                            <option value="ud">ud</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="mt-2 grid divide-x divide-[rgba(10,9,8,0.06)] rounded-lg bg-[#FAFAF9] py-1.5 ring-1 ring-[rgba(10,9,8,0.04)] grid-cols-4">
              {isPlateRecipe ? (
                <>
                  <div className="text-center">
                    <p className="text-[7px] font-bold uppercase tracking-[0.12em] text-[#7E7468]">Coste / rac.</p>
                    <p className="mt-0.5 text-[15px] font-black tabular-nums text-[#0A0908]">{formatMoneyEur(perYield)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[7px] font-bold uppercase tracking-[0.12em] text-[#7E7468]">PVP</p>
                    <p className="mt-0.5 text-[15px] font-black tabular-nums text-[#0A0908]">
                      {gross != null && gross > 0 ? formatMoneyEur(gross) : '—'}
                    </p>
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
                </>
              ) : (
                <>
                  <div className="text-center">
                    <p className="text-[7px] font-bold uppercase tracking-[0.12em] text-[#7E7468]">Coste total</p>
                    <p className="mt-0.5 text-[15px] font-black tabular-nums text-[#0A0908]">{formatMoneyEur(totalCost)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[7px] font-bold uppercase tracking-[0.12em] text-[#7E7468]">Coste real</p>
                    <p className="mt-0.5 text-[15px] font-black tabular-nums text-[#0A0908]">
                      {yieldCostPerUnit != null ? `${yieldCostPerUnit.toFixed(2)} €/` + finalWeightUnit : '—'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[7px] font-bold uppercase tracking-[0.12em] text-[#7E7468]">Coste operativo</p>
                    <p className="mt-0.5 text-[15px] font-black tabular-nums text-[#4A6B3A]">
                      {operationalCost != null ? `${operationalCost.toFixed(2)} €` : '—'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[7px] font-bold uppercase tracking-[0.12em] text-[#7E7468]">Merma</p>
                    <p className="mt-0.5 text-[15px] font-black tabular-nums text-[#4A6B3A]">
                      {mermaPct != null ? `${mermaPct.toFixed(1)} %` : '— %'}
                    </p>
                  </div>
                </>
              )}
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
                technicalSheetsByRecipe={technicalSheetsByRecipe}
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
                    {id === 'production' ? (
                      <div className="grid gap-2">
                        {isPlateRecipe ? (
                          <div className="grid grid-cols-3 gap-1.5">
                            <label className="space-y-1">
                              <span className={labelCls}>Raciones</span>
                              <input value={numeroRaciones} onChange={(e) => setNumeroRaciones(e.target.value)} className={inputCls} inputMode="decimal" />
                            </label>
                            <label className="space-y-1">
                              <span className={labelCls}>Gramaje</span>
                              <input value={gramajePorRacion} onChange={(e) => setGramajePorRacion(e.target.value)} className={inputCls} />
                            </label>
                            <label className="space-y-1">
                              <span className={labelCls}>Total min</span>
                              <input value={totalTime > 0 ? String(totalTime) : ''} readOnly className={`${inputCls} bg-white text-[#7E7468]`} />
                            </label>
                            <label className="space-y-1">
                              <span className={labelCls}>Prep</span>
                              <input value={tPrep} onChange={(e) => setTPrep(e.target.value)} className={inputCls} inputMode="numeric" />
                            </label>
                            <label className="space-y-1">
                              <span className={labelCls}>Cocción</span>
                              <input value={tCocc} onChange={(e) => setTCocc(e.target.value)} className={inputCls} inputMode="numeric" />
                            </label>
                            <label className="space-y-1">
                              <span className={labelCls}>Reposo</span>
                              <input value={tReposo} onChange={(e) => setTReposo(e.target.value)} className={inputCls} inputMode="numeric" />
                            </label>
                            <div className="col-span-3 grid grid-cols-2 gap-1.5">
                              <label className="space-y-1">
                                <span className={labelCls}>Temp. servicio</span>
                                <input value={tempServicio} onChange={(e) => setTempServicio(e.target.value)} className={inputCls} />
                              </label>
                              <label className="space-y-1">
                                <span className={labelCls}>Rendimiento total</span>
                                <input value={rendimientoTotal} onChange={(e) => setRendimientoTotal(e.target.value)} className={inputCls} />
                              </label>
                            </div>
                          </div>
                        ) : null}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className={labelCls}>Pasos de producción</span>
                            <button type="button" onClick={() => setStepDrafts((prev) => [...prev, newStepDraft()])} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[rgba(10,9,8,0.16)] px-2 py-1 text-[10px] font-bold text-[#0A0908]">
                              <Plus className="h-3 w-3" aria-hidden />
                              Paso
                            </button>
                          </div>
                          {stepDrafts.map((stepDraft, idx) => (
                            <div key={stepDraft.key} className="rounded-lg border border-[rgba(10,9,8,0.06)] bg-[#FAFAF9] p-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#0A0908] text-[10px] font-black text-white">{idx + 1}</span>
                                <input
                                  value={stepDraft.titulo}
                                  onChange={(e) => setStepDrafts((prev) => prev.map((s, i) => (i === idx ? { ...s, titulo: e.target.value } : s)))}
                                  className={`${inputCls} min-w-0 flex-1 bg-white`}
                                  aria-label={`Título del paso ${idx + 1}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => setStepDrafts((prev) => (prev.length <= 1 ? [newStepDraft()] : prev.filter((_, i) => i !== idx)))}
                                  className="p-1 text-[#D32F2F]"
                                  aria-label="Eliminar paso"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <textarea
                                value={stepDraft.descripcion}
                                onChange={(e) => setStepDrafts((prev) => prev.map((s, i) => (i === idx ? { ...s, descripcion: e.target.value } : s)))}
                                rows={2}
                                className={`${textareaCls} mt-1 bg-white`}
                                aria-label={`Descripción del paso ${idx + 1}`}
                              />
                              <label className="mt-1.5 flex items-center gap-2 rounded-md bg-white px-2 py-1 text-[10px] font-bold text-[#0A0908] ring-1 ring-[rgba(10,9,8,0.06)]">
                                <input
                                  type="checkbox"
                                  checked={Boolean(stepDraft.isCritical)}
                                  onChange={(e) => setStepDrafts((prev) => prev.map((s, i) => (i === idx ? { ...s, isCritical: e.target.checked } : s)))}
                                  className="h-3.5 w-3.5 accent-[#C4531F]"
                                />
                                Punto crítico
                              </label>
                              {stepDraft.isCritical ? (
                                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                                  <label className="space-y-1">
                                    <span className={labelCls}>Temp. objetivo</span>
                                    <input
                                      value={stepDraft.targetTemperature ?? ''}
                                      onChange={(e) => setStepDrafts((prev) => prev.map((s, i) => (i === idx ? { ...s, targetTemperature: e.target.value } : s)))}
                                      className={`${inputCls} bg-white`}
                                    />
                                  </label>
                                  <label className="space-y-1">
                                    <span className={labelCls}>Tiempo objetivo</span>
                                    <input
                                      value={stepDraft.targetTime ?? ''}
                                      onChange={(e) => setStepDrafts((prev) => prev.map((s, i) => (i === idx ? { ...s, targetTime: e.target.value } : s)))}
                                      className={`${inputCls} bg-white`}
                                    />
                                  </label>
                                  <label className="col-span-2 space-y-1">
                                    <span className={labelCls}>Observación control</span>
                                    <input
                                      value={stepDraft.controlObservation ?? ''}
                                      onChange={(e) => setStepDrafts((prev) => prev.map((s, i) => (i === idx ? { ...s, controlObservation: e.target.value } : s)))}
                                      className={`${inputCls} bg-white`}
                                    />
                                  </label>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {id === 'conservation' ? (
                      <div className="grid grid-cols-3 gap-1.5">
                        <label className="space-y-1">
                          <span className={labelCls}>Tipo</span>
                          <input value={tipoCons} onChange={(e) => setTipoCons(e.target.value)} className={inputCls} />
                        </label>
                        <label className="space-y-1">
                          <span className={labelCls}>Temp.</span>
                          <input value={tempCons} onChange={(e) => setTempCons(e.target.value)} className={inputCls} />
                        </label>
                        <label className="space-y-1">
                          <span className={labelCls}>Vida</span>
                          <input value={vidaUtil} onChange={(e) => setVidaUtil(e.target.value)} className={inputCls} />
                        </label>
                        <label className="col-span-3 space-y-1">
                          <span className={labelCls}>Formato / regeneración</span>
                          <textarea value={regeneracion} onChange={(e) => setRegeneracion(e.target.value)} rows={2} className={textareaCls} />
                        </label>
                      </div>
                    ) : null}
                    {id === 'allergens' ? (
                      <div className="space-y-2">
                        {allergenChips.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {allergenChips.map((chip) => (
                              <span key={chip} className="rounded-full bg-[#B8872A]/10 px-2 py-1 text-[10px] font-bold text-[#7A5518] ring-1 ring-[#B8872A]/15">
                                {chip}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <label className="block space-y-1">
                          <span className={labelCls}>Ajuste manual</span>
                          <textarea value={alergManual} onChange={(e) => setAlergManual(e.target.value)} rows={2} className={textareaCls} />
                        </label>
                      </div>
                    ) : null}
                    {id === 'plating' ? (
                      <div className="grid gap-1.5">
                        <label className="space-y-1">
                          <span className={labelCls}>Montaje</span>
                          <textarea value={emplDesc} onChange={(e) => setEmplDesc(e.target.value)} rows={2} className={textareaCls} />
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <label className="space-y-1">
                            <span className={labelCls}>Decoración</span>
                            <input value={emplDeco} onChange={(e) => setEmplDeco(e.target.value)} className={inputCls} />
                          </label>
                          <label className="space-y-1">
                            <span className={labelCls}>Soporte</span>
                            <input value={emplMenaje} onChange={(e) => setEmplMenaje(e.target.value)} className={inputCls} />
                          </label>
                        </div>
                        <label className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-[rgba(10,9,8,0.16)] bg-[#FAFAF9] px-2 text-[11px] font-bold text-[#0A0908]">
                          <Camera className="h-3.5 w-3.5 text-[#C4531F]" aria-hidden />
                          Subir foto emplatado
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              readImageFile(file, setEmplFoto);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        {emplFoto.trim() ? (
                          <div className="flex items-center gap-2 rounded-lg bg-[#FAFAF9] p-1.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={emplFoto.trim()} alt="" className="h-12 w-12 rounded-md object-cover" />
                            <span className="text-[10px] font-semibold text-[#7E7468]">Foto añadida</span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {id === 'appcc' ? (
                      <div className="space-y-1.5">
                        {stepDrafts.filter((s) => s.isCritical).length > 0 ? (
                          stepDrafts
                            .filter((s) => s.isCritical)
                            .map((s, idx) => (
                              <div key={s.key} className="rounded-lg bg-[#FAFAF9] px-2 py-1.5 ring-1 ring-[rgba(10,9,8,0.06)]">
                                <p className="text-[11px] font-black text-[#0A0908]">{s.titulo.trim() || `Paso ${idx + 1}`}</p>
                                <p className="mt-0.5 text-[10px] font-semibold text-[#7E7468]">
                                  {[s.targetTemperature?.trim(), s.targetTime?.trim(), s.controlObservation?.trim()].filter(Boolean).join(' · ') || 'Punto crítico'}
                                </p>
                              </div>
                            ))
                        ) : (
                          <p className="text-[11px] font-semibold text-[#7E7468]">Sin puntos críticos marcados en producción.</p>
                        )}
                      </div>
                    ) : null}
                    {id === 'observations' ? (
                      <div className="grid gap-1.5">
                        <label className="space-y-1">
                          <span className={labelCls}>Notas del chef</span>
                          <textarea value={notasChef} onChange={(e) => setNotasChef(e.target.value)} rows={2} className={textareaCls} />
                        </label>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ))}
          </div>

          <div className="fixed left-0 right-0 z-30 border-t border-[rgba(10,9,8,0.08)] bg-white/92 px-3 py-2 shadow-[0_-4px_18px_rgba(10,9,8,0.08)] backdrop-blur-md bottom-[4.55rem] lg:bottom-0 max-lg:pb-[calc(0.55rem+env(safe-area-inset-bottom,0px))]">
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
                {saveLabel}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
