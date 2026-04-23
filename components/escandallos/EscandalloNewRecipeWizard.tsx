'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight } from 'lucide-react';
import EscandalloIngredientDraftEditor from '@/components/escandallos/EscandalloIngredientDraftEditor';
import MermasStyleHero from '@/components/MermasStyleHero';
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

const STEPS = ['Datos', 'Ingredientes', 'Revisión', 'Guardar'] as const;

export default function EscandalloNewRecipeWizard() {
  const router = useRouter();
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

  const rawById = useMemo(() => new Map(rawProducts.map((p) => [p.id, p])), [rawProducts]);
  const processedById = useMemo(() => new Map(processedProducts.map((p) => [p.id, p])), [processedProducts]);
  const recipesById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const sortedRaw = useMemo(
    () => [...rawProducts].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [rawProducts],
  );

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
    setLoading(true);
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

  const previewPayloads = previewBuilt.ok ? previewBuilt.payloads : [];
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
        isSubRecipe: false,
        saleVatRatePct: gross != null && gross > 0 ? vat : null,
        salePriceGrossEur: gross != null && gross > 0 ? gross : null,
      });
      if (previewPayloads.length > 0) {
        await insertEscandalloLinesBatch(supabase, localId, recipe.id, previewPayloads, 0);
      }
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

  return (
    <div className="space-y-5 pb-28 max-sm:pb-[calc(7rem+env(safe-area-inset-bottom,0px))]">
      <MermasStyleHero eyebrow="Escandallos" title="Nueva receta" description="Cuatro pasos. Sin mezclar con el dashboard." compact />

      <Link
        href="/escandallos/recetas"
        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-800 shadow-sm ring-1 ring-zinc-100 transition hover:bg-zinc-50"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" />
        Libro de recetas
      </Link>

      {banner ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{banner}</div>
      ) : null}

      <nav className="flex flex-wrap gap-2" aria-label="Pasos">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={[
              'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide',
              i === step ? 'bg-[#D32F2F] text-white shadow-md' : i < step ? 'bg-emerald-100 text-emerald-900' : 'bg-zinc-100 text-zinc-500',
            ].join(' ')}
          >
            {i < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span className="tabular-nums">{i + 1}</span>}
            {label}
          </div>
        ))}
      </nav>

      {loading ? (
        <p className="text-sm text-zinc-500">Cargando catálogo…</p>
      ) : (
        <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm ring-1 ring-zinc-100 sm:p-6">
          {step === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-[10px] font-bold uppercase text-zinc-500">Nombre del plato</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-lg font-semibold text-zinc-900 outline-none focus:ring-2 focus:ring-[#D32F2F]/25"
                  placeholder="Ej. Carrillera al vino"
                  autoFocus
                />
              </label>
              <label>
                <span className="text-[10px] font-bold uppercase text-zinc-500">Raciones / rendimiento</span>
                <input
                  value={yieldQty}
                  onChange={(e) => setYieldQty(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold tabular-nums"
                  inputMode="decimal"
                />
              </label>
              <label>
                <span className="text-[10px] font-bold uppercase text-zinc-500">Unidad (presentación)</span>
                <input
                  value={yieldLabel}
                  onChange={(e) => setYieldLabel(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="raciones, bandejas…"
                />
              </label>
              <label>
                <span className="text-[10px] font-bold uppercase text-zinc-500">PVP € (IVA inc.)</span>
                <input
                  value={saleGross}
                  onChange={(e) => setSaleGross(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm tabular-nums"
                  inputMode="decimal"
                  placeholder="Opcional en este paso"
                />
              </label>
              <label>
                <span className="text-[10px] font-bold uppercase text-zinc-500">IVA %</span>
                <input
                  value={saleVat}
                  onChange={(e) => setSaleVat(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm tabular-nums"
                  inputMode="decimal"
                />
              </label>
            </div>
          ) : null}

          {step === 1 ? (
            <div>
              <p className="text-base leading-snug text-zinc-700 sm:text-sm">
                Busca crudos, elaborados o bases. Puedes dejar filas vacías.
              </p>
              <div className="mt-4">
                <EscandalloIngredientDraftEditor
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
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              {!previewBuilt.ok ? (
                <p className="text-sm font-semibold text-red-700">{previewBuilt.message}</p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100">
                  <p className="text-[10px] font-bold uppercase text-zinc-500">Coste total (preview)</p>
                  <p className="text-xl font-black tabular-nums">{totalCost.toFixed(2)} €</p>
                </div>
                <div className="rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100">
                  <p className="text-[10px] font-bold uppercase text-zinc-500">Coste / {yieldLabel || 'ud.'}</p>
                  <p className="text-xl font-black tabular-nums">{perYield.toFixed(2)} €</p>
                </div>
                <div className="rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100">
                  <p className="text-[10px] font-bold uppercase text-zinc-500">Food cost</p>
                  <p className={`text-xl font-black tabular-nums ${fcHint.className}`}>
                    {fcPct != null ? `${fcPct.toFixed(1)} %` : '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100">
                  <p className="text-[10px] font-bold uppercase text-zinc-500">Margen bruto</p>
                  <p className="text-xl font-black tabular-nums text-zinc-900">{marginPct != null ? `${marginPct} %` : '—'}</p>
                </div>
              </div>
              <ul className="text-sm text-zinc-600">
                {previewPayloads.length === 0 ? <li>Sin ingredientes aún (puedes añadirlos después en el editor).</li> : null}
                {gross == null || gross <= 0 ? <li className="text-amber-800">Sin PVP: el food cost no se calculará hasta que indiques precio.</li> : null}
                {fcPct != null && fcPct > 35 ? <li className="font-semibold text-red-700">Food cost alto: revisa precio o receta.</li> : null}
              </ul>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-zinc-600">
                Se creará <strong className="text-zinc-900">{name.trim() || '…'}</strong> y se abrirá el editor completo
                para ajustes finos, TPV y ficha técnica.
              </p>
              <button
                type="button"
                disabled={!canFinish}
                onClick={() => void handleSave()}
                className="inline-flex w-full max-w-md items-center justify-center gap-2 rounded-2xl bg-[#D32F2F] py-3.5 text-sm font-black text-white shadow-lg transition hover:bg-[#B91C1C] disabled:opacity-50 sm:w-auto sm:px-10"
              >
                Guardar y abrir editor
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-zinc-100 pt-4">
            <button
              type="button"
              disabled={step === 0 || saving}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
            >
              Atrás
            </button>
            {step < 3 ? (
              <button
                type="button"
                disabled={(step === 0 && !canStep1) || (step === 1 && saving) || saving}
                onClick={() => {
                  if (step === 1 && !previewBuilt.ok) {
                    setBanner(previewBuilt.message);
                    return;
                  }
                  setBanner(null);
                  setStep((s) => s + 1);
                }}
                className="rounded-xl bg-zinc-900 px-5 py-2 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                Siguiente
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
