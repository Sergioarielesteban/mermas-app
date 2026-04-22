'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Layers, Search, Trash2 } from 'lucide-react';
import EscandalloIngredientDraftEditor from '@/components/escandallos/EscandalloIngredientDraftEditor';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { appConfirm } from '@/lib/app-dialog-bridge';
import {
  emptyIngredientDraft,
  parseDecimal,
  draftRowsToPayloads,
  type IngredientDraftRow,
} from '@/lib/escandallos-recipe-draft-utils';
import { ESCANDALLOS_WEIGHTED_PRICE_WINDOW_DAYS } from '@/lib/escandallos-weighted-purchase-prices';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  deleteProcessedProductForEscandallo,
  fetchEscandalloLines,
  fetchEscandalloRecipes,
  fetchProcessedProductsForEscandallo,
  fetchEscandalloRawProductsWithWeightedPurchasePrices,
  insertEscandalloLinesBatch,
  insertEscandalloRecipe,
  insertProcessedProductForEscandallo,
  rawProductPickerSummaryLine,
  recipeTotalCostEur,
  type EscandalloLine,
  type EscandalloLineInsertPayload,
  type EscandalloProcessedProduct,
  type EscandalloRawProduct,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import type { Unit } from '@/lib/types';

export default function EscandallosBasesLabClient() {
  const { localId, profileReady } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const [recipes, setRecipes] = useState<EscandalloRecipe[]>([]);
  const [linesByRecipe, setLinesByRecipe] = useState<Record<string, EscandalloLine[]>>({});
  const [rawProducts, setRawProducts] = useState<EscandalloRawProduct[]>([]);
  const [processedProducts, setProcessedProducts] = useState<EscandalloProcessedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [subNewName, setSubNewName] = useState('');
  const [subNewYieldQty, setSubNewYieldQty] = useState('1');
  const [subNewYieldLabel, setSubNewYieldLabel] = useState('kg');
  const [subIngredientDrafts, setSubIngredientDrafts] = useState<IngredientDraftRow[]>([emptyIngredientDraft()]);

  const [procName, setProcName] = useState('');
  const [procRawId, setProcRawId] = useState('');
  const [procRawSearch, setProcRawSearch] = useState('');
  const [procRawDropdownOpen, setProcRawDropdownOpen] = useState(false);
  const [procInputQty, setProcInputQty] = useState('5');
  const [procOutputQty, setProcOutputQty] = useState('3.5');
  const [procOutputUnit, setProcOutputUnit] = useState<Unit>('kg');
  const [procExtraCost, setProcExtraCost] = useState('0');

  const rawById = useMemo(() => new Map(rawProducts.map((p) => [p.id, p])), [rawProducts]);
  const processedById = useMemo(() => new Map(processedProducts.map((p) => [p.id, p])), [processedProducts]);
  const recipesById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const sortedRawProducts = useMemo(
    () => [...rawProducts].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [rawProducts],
  );
  const subRecipes = useMemo(() => recipes.filter((r) => r.isSubRecipe), [recipes]);

  const filteredProcRawProducts = useMemo(() => {
    const q = procRawSearch.trim().toLowerCase();
    if (!q) return sortedRawProducts;
    return sortedRawProducts.filter((p) => `${p.name} ${p.supplierName}`.toLowerCase().includes(q));
  }, [procRawSearch, sortedRawProducts]);

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
        r.map(async (recipe) => {
          const lines = await fetchEscandalloLines(supabase, localId, recipe.id);
          return [recipe.id, lines] as const;
        }),
      );
      setLinesByRecipe(Object.fromEntries(linesEntries));
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudieron cargar datos.');
      setRecipes([]);
      setLinesByRecipe({});
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const refreshRecipeLines = async (recipeId: string) => {
    if (!localId || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    const lines = await fetchEscandalloLines(supabase, localId, recipeId);
    setLinesByRecipe((prev) => ({ ...prev, [recipeId]: lines }));
  };

  const handleCreateRecipe = async (isSubRecipe: boolean) => {
    if (!localId || !supabaseOk) return;
    const name = subNewName.trim();
    if (!name) {
      setBanner('Escribe nombre de la sub-receta.');
      return;
    }
    const y = parseDecimal(subNewYieldQty);
    const supabase = getSupabaseClient()!;
    setBusyId('sub-new');
    setBanner(null);
    try {
      let subPayloads: EscandalloLineInsertPayload[] | null = null;
      if (isSubRecipe) {
        const built = draftRowsToPayloads(subIngredientDrafts, rawById, processedById, recipesById, null);
        if (!built.ok) {
          setBanner(built.message);
          return;
        }
        subPayloads = built.payloads;
      }
      const recipe = await insertEscandalloRecipe(supabase, localId, name, {
        yieldQty: y != null && y > 0 ? y : 1,
        yieldLabel: subNewYieldLabel.trim() || 'kg',
        isSubRecipe,
      });
      setRecipes((prev) => [...prev, recipe].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      setLinesByRecipe((prev) => ({ ...prev, [recipe.id]: [] }));
      if (isSubRecipe && subPayloads && subPayloads.length > 0) {
        await insertEscandalloLinesBatch(supabase, localId, recipe.id, subPayloads, 0);
        await refreshRecipeLines(recipe.id);
      }
      setSubNewName('');
      setSubNewYieldQty('1');
      setSubNewYieldLabel('kg');
      setSubIngredientDrafts([emptyIngredientDraft()]);
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudo crear la receta.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateProcessed = async () => {
    if (!localId || !supabaseOk) return;
    if (!procRawId) {
      setBanner('Elige un producto crudo de proveedor para el elaborado.');
      return;
    }
    const input = parseDecimal(procInputQty);
    const output = parseDecimal(procOutputQty);
    const extra = parseDecimal(procExtraCost);
    if (!procName.trim()) {
      setBanner('Escribe nombre del elaborado.');
      return;
    }
    if (input == null || input <= 0 || output == null || output <= 0) {
      setBanner('Input y output deben ser mayores de 0.');
      return;
    }
    const supabase = getSupabaseClient()!;
    setBusyId('processed-new');
    try {
      const row = await insertProcessedProductForEscandallo(supabase, localId, {
        name: procName,
        sourceSupplierProductId: procRawId,
        inputQty: input,
        outputQty: output,
        outputUnit: procOutputUnit,
        extraCostEur: extra != null && extra >= 0 ? extra : 0,
      });
      setProcessedProducts((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      setProcName('');
      setProcRawId('');
      setProcRawSearch('');
      setProcRawDropdownOpen(false);
      setProcInputQty('5');
      setProcOutputQty('3.5');
      setProcExtraCost('0');
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudo crear el elaborado.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteProcessed = async (id: string) => {
    if (!localId || !supabaseOk) return;
    if (!(await appConfirm('¿Eliminar este elaborado interno?'))) return;
    const supabase = getSupabaseClient()!;
    setBusyId(id);
    try {
      await deleteProcessedProductForEscandallo(supabase, localId, id);
      setProcessedProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudo eliminar elaborado.');
    } finally {
      setBusyId(null);
    }
  };

  const UNITS: { value: Unit; label: string }[] = [
    { value: 'kg', label: 'kg' },
    { value: 'ud', label: 'ud' },
    { value: 'bolsa', label: 'bolsa' },
    { value: 'racion', label: 'ración' },
  ];

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
    <div className="space-y-5 pb-8">
      <MermasStyleHero
        eyebrow="Escandallos"
        title="Bases y elaborados"
        description={`Sub-recetas reutilizables y elaborados simples. Los crudos usan PMP de compras (${ESCANDALLOS_WEIGHTED_PRICE_WINDOW_DAYS} días) cuando hay albaranes.`}
        compact
      />

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

      <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm ring-1 ring-zinc-100 sm:p-6">
        <h2 className="text-base font-black text-zinc-900">Nueva sub-receta</h2>
        <p className="mt-1 text-sm text-zinc-600">Opcional: añade ingredientes al crear. Luego puedes refinar en el editor.</p>
        <input
          value={subNewName}
          onChange={(e) => setSubNewName(e.target.value)}
          placeholder="Nombre"
          className="mt-3 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm outline-none focus:border-zinc-400 focus:bg-white"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={subNewYieldQty}
            onChange={(e) => setSubNewYieldQty(e.target.value)}
            placeholder="Rendimiento"
            className="w-28 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm tabular-nums outline-none"
            inputMode="decimal"
          />
          <input
            value={subNewYieldLabel}
            onChange={(e) => setSubNewYieldLabel(e.target.value)}
            placeholder="Unidad (kg, l…)"
            className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm outline-none"
          />
        </div>
        <div className="mt-3">
          <EscandalloIngredientDraftEditor
            drafts={subIngredientDrafts}
            onChange={setSubIngredientDrafts}
            sortedRaw={sortedRawProducts}
            processedProducts={processedProducts}
            recipes={recipes}
            excludeRecipeId={null}
            disabled={busyId !== null}
            linesByRecipe={linesByRecipe}
            rawById={rawById}
            processedById={processedById}
            recipesById={recipesById}
          />
        </div>
        <button
          type="button"
          disabled={busyId !== null}
          onClick={() => void handleCreateRecipe(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-black text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-60"
        >
          <Layers className="h-4 w-4 shrink-0" aria-hidden />
          Crear base
          <ChevronRight className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
        </button>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm ring-1 ring-zinc-100 sm:p-6">
        <h2 className="text-base font-black text-zinc-900">Elaborado simple</h2>
        <div className="mt-3 space-y-2">
          <input
            value={procName}
            onChange={(e) => setProcName(e.target.value)}
            placeholder="Nombre del elaborado"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
          />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
            <input
              value={procRawSearch}
              onFocus={() => setProcRawDropdownOpen(true)}
              onChange={(e) => {
                setProcRawSearch(e.target.value);
                setProcRawDropdownOpen(true);
                setProcRawId('');
              }}
              placeholder="Crudo de proveedor…"
              className="w-full rounded-xl border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            />
            {procRawDropdownOpen ? (
              <div className="absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-xl border border-zinc-200 bg-white shadow-lg">
                {filteredProcRawProducts.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-zinc-500">Sin resultados</p>
                ) : (
                  filteredProcRawProducts.map((p) => {
                    const label = rawProductPickerSummaryLine(p);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setProcRawId(p.id);
                          setProcRawSearch(label);
                          setProcRawDropdownOpen(false);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-50"
                      >
                        {label}
                      </button>
                    );
                  })
                )}
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={procInputQty}
              onChange={(e) => setProcInputQty(e.target.value)}
              placeholder="Entrada"
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
            <input
              value={procOutputQty}
              onChange={(e) => setProcOutputQty(e.target.value)}
              placeholder="Salida"
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={procOutputUnit}
              onChange={(e) => setProcOutputUnit(e.target.value as Unit)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
            <input
              value={procExtraCost}
              onChange={(e) => setProcExtraCost(e.target.value)}
              placeholder="Extra €"
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={busyId !== null}
            onClick={() => void handleCreateProcessed()}
            className="w-full rounded-xl bg-zinc-800 py-2.5 text-sm font-bold text-white transition hover:bg-zinc-900 disabled:opacity-60"
          >
            Guardar elaborado
          </button>
        </div>
        {processedProducts.length > 0 ? (
          <ul className="mt-4 space-y-1.5">
            {processedProducts.map((p) => {
              const raw = rawById.get(p.sourceSupplierProductId);
              const cost =
                raw && p.outputQty > 0
                  ? ((raw.pricePerUnit * p.inputQty + p.extraCostEur) / p.outputQty).toFixed(2)
                  : '0.00';
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50/80 px-2.5 py-1.5"
                >
                  <p className="min-w-0 truncate text-xs text-zinc-700">
                    <span className="font-semibold text-zinc-900">{p.name}</span>{' '}
                    <span className="text-zinc-500">
                      {p.inputQty}→{p.outputQty} {p.outputUnit} · {cost} €/{p.outputUnit}
                    </span>
                  </p>
                  <button
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() => void handleDeleteProcessed(p.id)}
                    className="shrink-0 rounded p-1 text-[#B91C1C]"
                    aria-label="Eliminar elaborado"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <section className="rounded-3xl border border-violet-200/80 bg-violet-50/30 p-4 ring-1 ring-violet-100 sm:p-6">
        <h2 className="text-base font-black text-zinc-900">Tus bases</h2>
        {loading ? (
          <p className="mt-3 text-sm text-zinc-500">Cargando…</p>
        ) : subRecipes.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">Sin sub-recetas aún.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {subRecipes
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name, 'es'))
              .map((r) => {
                const ls = linesByRecipe[r.id] ?? [];
                const total = recipeTotalCostEur(ls, rawById, processedById, {
                  linesByRecipe,
                  recipesById,
                  recipeId: r.id,
                });
                const per = r.yieldQty > 0 ? Math.round((total / r.yieldQty) * 100) / 100 : 0;
                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white bg-white/90 px-3 py-2.5 shadow-sm ring-1 ring-violet-100"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-900">{r.name}</p>
                      <p className="text-xs text-zinc-600">
                        {r.yieldQty} {r.yieldLabel} · {ls.length} líneas · {total.toFixed(2)} € batch · {per.toFixed(2)}{' '}
                        € / ud.
                      </p>
                    </div>
                    <Link
                      href={`/escandallos/recetas/${r.id}/editar`}
                      className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-800"
                    >
                      Editar
                    </Link>
                  </li>
                );
              })}
          </ul>
        )}
      </section>
    </div>
  );
}
