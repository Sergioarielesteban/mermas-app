'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, Plus, Search, Trash2 } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  deleteEscandalloLine,
  deleteEscandalloRecipe,
  deleteProcessedProductForEscandallo,
  fetchEscandalloLines,
  fetchProcessedProductsForEscandallo,
  fetchEscandalloRecipes,
  fetchProductsForEscandallo,
  escandalloRecipeUnitForRawProduct,
  foodCostPercentOfNetSale,
  insertEscandalloLinesBatch,
  insertEscandalloRecipe,
  insertProcessedProductForEscandallo,
  lineUnitPriceEur,
  rawProductPickerSummaryLine,
  recipeTotalCostEur,
  saleNetPerUnitFromGross,
  updateEscandalloRecipe,
  type EscandalloLine,
  type EscandalloLineInsertPayload,
  type EscandalloProcessedProduct,
  type EscandalloRawProduct,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import type { Unit } from '@/lib/types';

const UNITS: { value: Unit; label: string }[] = [
  { value: 'kg', label: 'kg' },
  { value: 'ud', label: 'ud' },
  { value: 'bolsa', label: 'bolsa' },
  { value: 'racion', label: 'ración' },
];

const VAT_PRESETS = [
  { value: '4', label: '4 %' },
  { value: '10', label: '10 %' },
  { value: '21', label: '21 %' },
];

function parseDecimal(raw: string): number | null {
  const t = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function newDraftKey() {
  return `d-${Math.random().toString(36).slice(2, 11)}`;
}

type IngredientDraftRow = {
  key: string;
  sourceType: 'raw' | 'processed' | 'subrecipe' | 'manual';
  rawSearch: string;
  rawDropdownOpen: boolean;
  rawId: string;
  processedId: string;
  subRecipeId: string;
  manualLabel: string;
  manualPrice: string;
  qty: string;
  unit: Unit;
};

function emptyIngredientDraft(): IngredientDraftRow {
  return {
    key: newDraftKey(),
    sourceType: 'raw',
    rawSearch: '',
    rawDropdownOpen: false,
    rawId: '',
    processedId: '',
    subRecipeId: '',
    manualLabel: '',
    manualPrice: '',
    qty: '1',
    unit: 'kg',
  };
}

function foodCostStatus(pct: number | null): { text: string; className: string } {
  if (pct == null) return { text: 'Sin PVP', className: 'text-zinc-500' };
  if (pct < 28) return { text: 'Food cost contenido', className: 'text-emerald-700' };
  if (pct <= 35) return { text: 'Revisar márgenes', className: 'text-amber-800' };
  return { text: 'Food cost alto', className: 'text-red-700' };
}

function draftRowsToPayloads(
  rows: IngredientDraftRow[],
  rawById: Map<string, EscandalloRawProduct>,
  processedById: Map<string, EscandalloProcessedProduct>,
  recipesById: Map<string, EscandalloRecipe>,
   recipeId: string | null,
): { ok: true; payloads: EscandalloLineInsertPayload[] } | { ok: false; message: string } {
  const payloads: EscandalloLineInsertPayload[] = [];
  for (const row of rows) {
    const qty = parseDecimal(row.qty);
    if (qty == null || qty <= 0) continue;
    const raw = row.rawId ? rawById.get(row.rawId) : undefined;
    const processed = row.processedId ? processedById.get(row.processedId) : undefined;
    const subRec = row.subRecipeId ? recipesById.get(row.subRecipeId) : undefined;
    const label =
      row.sourceType === 'raw'
        ? raw?.name ?? ''
        : row.sourceType === 'processed'
          ? processed?.name ?? ''
          : row.sourceType === 'subrecipe'
            ? subRec?.name ?? ''
            : row.manualLabel.trim();
    if (!label) continue;
    let manual: number | null = null;
    if (row.sourceType === 'manual') {
      const m = parseDecimal(row.manualPrice);
      if (m == null || m < 0) return { ok: false, message: 'En filas manuales, precio €/ud debe ser válido.' };
      manual = Math.round(m * 10000) / 10000;
    }
    if (row.sourceType === 'raw' && !raw) return { ok: false, message: 'Selecciona producto crudo en cada fila rellena.' };
    if (row.sourceType === 'processed' && !processed)
      return { ok: false, message: 'Selecciona elaborado en cada fila rellena.' };
    if (row.sourceType === 'subrecipe') {
      if (!subRec) return { ok: false, message: 'Selecciona sub-receta en cada fila rellena.' };
      if (recipeId != null && subRec.id === recipeId)
        return { ok: false, message: 'Una receta no puede referenciarse a sí misma.' };
    }
    payloads.push({
      sourceType: row.sourceType,
      label,
      qty,
      unit:
        row.sourceType === 'raw'
          ? raw
            ? escandalloRecipeUnitForRawProduct(raw)
            : row.unit
          : row.sourceType === 'processed'
            ? processed?.outputUnit ?? row.unit
            : row.unit,
      rawSupplierProductId: row.sourceType === 'raw' ? raw?.id ?? null : null,
      processedProductId: row.sourceType === 'processed' ? processed?.id ?? null : null,
      subRecipeId: row.sourceType === 'subrecipe' ? subRec?.id ?? null : null,
      manualPricePerUnit: row.sourceType === 'manual' ? manual : null,
    });
  }
  return { ok: true, payloads };
}

type DraftEditorProps = {
  drafts: IngredientDraftRow[];
  onChange: (next: IngredientDraftRow[]) => void;
  sortedRaw: EscandalloRawProduct[];
  processedProducts: EscandalloProcessedProduct[];
  recipes: EscandalloRecipe[];
  excludeRecipeId: string | null;
  disabled: boolean;
};

function IngredientDraftEditor({
  drafts,
  onChange,
  sortedRaw,
  processedProducts,
  recipes,
  excludeRecipeId,
  disabled,
}: DraftEditorProps) {
  const updateRow = (key: string, patch: Partial<IngredientDraftRow>) => {
    onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const removeRow = (key: string) => {
    if (drafts.length <= 1) {
      onChange([emptyIngredientDraft()]);
      return;
    }
    onChange(drafts.filter((d) => d.key !== key));
  };

  const filteredRaw = (q: string) => {
    const s = q.trim().toLowerCase();
    if (!s) return sortedRaw;
    return sortedRaw.filter((p) => `${p.name} ${p.supplierName}`.toLowerCase().includes(s));
  };

  return (
    <div className="space-y-3">
      {drafts.map((row) => (
        <div
          key={row.key}
          className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 ring-1 ring-zinc-100"
        >
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={row.sourceType}
              disabled={disabled}
              onChange={(e) =>
                updateRow(row.key, {
                  sourceType: e.target.value as IngredientDraftRow['sourceType'],
                  rawId: '',
                  processedId: '',
                  subRecipeId: '',
                  rawSearch: '',
                  rawDropdownOpen: false,
                })
              }
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-800"
            >
              <option value="raw">Crudo</option>
              <option value="processed">Elaborado</option>
              <option value="subrecipe">Sub-receta</option>
              <option value="manual">Manual</option>
            </select>
            <input
              value={row.qty}
              disabled={disabled}
              onChange={(e) => updateRow(row.key, { qty: e.target.value })}
              className="w-20 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
              inputMode="decimal"
              placeholder="Cant."
            />
            {row.sourceType === 'subrecipe' || row.sourceType === 'manual' ? (
              <select
                value={row.unit}
                disabled={disabled}
                onChange={(e) => updateRow(row.key, { unit: e.target.value as Unit })}
                className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
              >
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeRow(row.key)}
              className="ml-auto rounded-lg p-1.5 text-red-700 hover:bg-red-50"
              aria-label="Quitar fila"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {row.sourceType === 'raw' ? (
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
              <input
                value={row.rawSearch}
                disabled={disabled}
                onFocus={() => updateRow(row.key, { rawDropdownOpen: true })}
                onChange={(e) => {
                  updateRow(row.key, {
                    rawSearch: e.target.value,
                    rawDropdownOpen: true,
                    rawId: '',
                  });
                }}
                placeholder="Buscar crudo de proveedor…"
                className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm"
              />
              {row.rawDropdownOpen ? (
                <div className="absolute z-30 mt-1 max-h-40 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
                  {filteredRaw(row.rawSearch).length === 0 ? (
                    <p className="px-3 py-2 text-xs text-zinc-500">Sin resultados</p>
                  ) : (
                    filteredRaw(row.rawSearch).map((p) => {
                      const lab = rawProductPickerSummaryLine(p);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            updateRow(row.key, {
                              rawId: p.id,
                              rawSearch: lab,
                              rawDropdownOpen: false,
                              unit: escandalloRecipeUnitForRawProduct(p),
                            })
                          }
                          className="block w-full px-3 py-2 text-left text-xs text-zinc-800 hover:bg-zinc-50"
                        >
                          {lab}
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {row.sourceType === 'processed' ? (
            <select
              value={row.processedId}
              disabled={disabled}
              onChange={(e) => {
                const id = e.target.value;
                const p = processedProducts.find((x) => x.id === id);
                updateRow(row.key, { processedId: id, unit: p?.outputUnit ?? 'kg' });
              }}
              className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm"
            >
              <option value="">Elaborado…</option>
              {processedProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : null}

          {row.sourceType === 'subrecipe' ? (
            <select
              value={row.subRecipeId}
              disabled={disabled}
              onChange={(e) => updateRow(row.key, { subRecipeId: e.target.value })}
              className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm"
            >
              <option value="">Receta base…</option>
              {recipes
                .filter((r) => r.id !== excludeRecipeId)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.isSubRecipe ? ' (base)' : ''}
                  </option>
                ))}
            </select>
          ) : null}

          {row.sourceType === 'manual' ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                value={row.manualLabel}
                disabled={disabled}
                onChange={(e) => updateRow(row.key, { manualLabel: e.target.value })}
                placeholder="Nombre (ej. vino)"
                className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
              />
              <input
                value={row.manualPrice}
                disabled={disabled}
                onChange={(e) => updateRow(row.key, { manualPrice: e.target.value })}
                placeholder="€ / unidad"
                className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                inputMode="decimal"
              />
            </div>
          ) : null}
        </div>
      ))}

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...drafts, emptyIngredientDraft()])}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
      >
        <Plus className="h-4 w-4" />
        Otra fila de ingrediente
      </button>
    </div>
  );
}

export default function EscandallosRecetasPage() {
  const { localId, profileReady } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const [recipes, setRecipes] = useState<EscandalloRecipe[]>([]);
  const [linesByRecipe, setLinesByRecipe] = useState<Record<string, EscandalloLine[]>>({});
  const [rawProducts, setRawProducts] = useState<EscandalloRawProduct[]>([]);
  const [processedProducts, setProcessedProducts] = useState<EscandalloProcessedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newYieldQty, setNewYieldQty] = useState('1');
  const [newYieldLabel, setNewYieldLabel] = useState('raciones');

  const [draftRecipeName, setDraftRecipeName] = useState('');
  const [draftRecipeNotes, setDraftRecipeNotes] = useState('');
  const [draftYieldQty, setDraftYieldQty] = useState('');
  const [draftYieldLabel, setDraftYieldLabel] = useState('');
  const [draftSaleGross, setDraftSaleGross] = useState('');
  const [draftSaleVat, setDraftSaleVat] = useState('10');
  const [draftPosArticleCode, setDraftPosArticleCode] = useState('');
  const [ingredientDrafts, setIngredientDrafts] = useState<IngredientDraftRow[]>([emptyIngredientDraft()]);

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
  const mainRecipes = useMemo(() => recipes.filter((r) => !r.isSubRecipe), [recipes]);
  const subRecipes = useMemo(() => recipes.filter((r) => r.isSubRecipe), [recipes]);

  const filteredProcRawProducts = useMemo(() => {
    const q = procRawSearch.trim().toLowerCase();
    if (!q) return sortedRawProducts;
    return sortedRawProducts.filter((p) =>
      `${p.name} ${p.supplierName}`.toLowerCase().includes(q),
    );
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
        fetchProductsForEscandallo(supabase, localId),
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
      const msg =
        e instanceof Error
          ? e.message
          : 'No se pudieron cargar escandallos. ¿Ejecutaste supabase-escandallos-schema.sql y la migración de precio/sub-receta?';
      setBanner(msg);
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

  const hydrateDraftFromRecipe = (recipe: EscandalloRecipe) => {
    setDraftRecipeName(recipe.name);
    setDraftRecipeNotes(recipe.notes);
    setDraftYieldQty(String(recipe.yieldQty));
    setDraftYieldLabel(recipe.yieldLabel);
    setDraftSaleGross(recipe.salePriceGrossEur != null ? String(recipe.salePriceGrossEur) : '');
    setDraftSaleVat(recipe.saleVatRatePct != null ? String(recipe.saleVatRatePct) : '10');
    setDraftPosArticleCode(recipe.posArticleCode ?? '');
    setIngredientDrafts([emptyIngredientDraft()]);
  };

  const toggleExpand = (recipe: EscandalloRecipe) => {
    if (expandedId === recipe.id) {
      setExpandedId(null);
      return;
    }
    hydrateDraftFromRecipe(recipe);
    setExpandedId(recipe.id);
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
    if (!window.confirm('¿Eliminar este elaborado interno?')) return;
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

  const handleCreateRecipe = async (isSubRecipe: boolean) => {
    if (!localId || !supabaseOk) return;
    const name = (isSubRecipe ? subNewName : newName).trim();
    if (!name) {
      setBanner(isSubRecipe ? 'Escribe nombre de la sub-receta.' : 'Escribe un nombre para la receta.');
      return;
    }
    const y = parseDecimal(isSubRecipe ? subNewYieldQty : newYieldQty);
    const supabase = getSupabaseClient()!;
    setBusyId(isSubRecipe ? 'sub-new' : 'new');
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
        yieldLabel: (isSubRecipe ? subNewYieldLabel : newYieldLabel).trim() || (isSubRecipe ? 'kg' : 'raciones'),
        isSubRecipe,
      });
      setRecipes((prev) => [...prev, recipe].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      setLinesByRecipe((prev) => ({ ...prev, [recipe.id]: [] }));
      if (isSubRecipe && subPayloads && subPayloads.length > 0) {
        await insertEscandalloLinesBatch(supabase, localId, recipe.id, subPayloads, 0);
        await refreshRecipeLines(recipe.id);
      }
      if (isSubRecipe) {
        setSubNewName('');
        setSubNewYieldQty('1');
        setSubNewYieldLabel('kg');
        setSubIngredientDrafts([emptyIngredientDraft()]);
      } else {
        setNewName('');
        setNewYieldQty('1');
        setNewYieldLabel('raciones');
      }
      setExpandedId(recipe.id);
      hydrateDraftFromRecipe(recipe);
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudo crear la receta.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveRecipeMeta = async (recipeId: string) => {
    if (!localId || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    const y = parseDecimal(draftYieldQty);
    const gross = parseDecimal(draftSaleGross);
    const vat = parseDecimal(draftSaleVat);
    setBusyId(recipeId);
    setBanner(null);
    try {
      const patch: Parameters<typeof updateEscandalloRecipe>[3] = {
        name: draftRecipeName,
        notes: draftRecipeNotes,
        yieldQty: y != null && y > 0 ? y : undefined,
        yieldLabel: draftYieldLabel,
      };
      const recipe = recipesById.get(recipeId);
      if (recipe && !recipe.isSubRecipe) {
        patch.posArticleCode = draftPosArticleCode.trim() === '' ? null : draftPosArticleCode.trim();
        if (gross != null && gross > 0) {
          patch.saleVatRatePct = vat != null && vat >= 0 ? vat : 10;
          patch.salePriceGrossEur = gross;
        } else {
          patch.saleVatRatePct = null;
          patch.salePriceGrossEur = null;
        }
      }
      await updateEscandalloRecipe(supabase, localId, recipeId, patch);
      setRecipes((prev) =>
        prev
          .map((r) =>
            r.id === recipeId
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
                  posArticleCode: r.isSubRecipe ? r.posArticleCode : draftPosArticleCode.trim() === '' ? null : draftPosArticleCode.trim(),
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

  const handleDeleteRecipe = async (recipeId: string) => {
    if (!localId || !supabaseOk) return;
    if (!window.confirm('¿Eliminar esta receta y todos sus ingredientes?')) return;
    const supabase = getSupabaseClient()!;
    setBusyId(recipeId);
    try {
      await deleteEscandalloRecipe(supabase, localId, recipeId);
      setRecipes((prev) => prev.filter((r) => r.id !== recipeId));
      setLinesByRecipe((prev) => {
        const next = { ...prev };
        delete next[recipeId];
        return next;
      });
      if (expandedId === recipeId) setExpandedId(null);
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudo eliminar.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAddLinesBatch = async (recipeId: string) => {
    if (!localId || !supabaseOk) return;
    const built = draftRowsToPayloads(ingredientDrafts, rawById, processedById, recipesById, recipeId);
    if (!built.ok) {
      setBanner(built.message);
      return;
    }
    if (built.payloads.length === 0) {
      setBanner('Añade al menos una fila con cantidad e ingrediente válidos.');
      return;
    }
    const existing = linesByRecipe[recipeId] ?? [];
    const startOrder = existing.length;
    const supabase = getSupabaseClient()!;
    setBusyId(`batch-${recipeId}`);
    setBanner(null);
    try {
      await insertEscandalloLinesBatch(supabase, localId, recipeId, built.payloads, startOrder);
      await refreshRecipeLines(recipeId);
      setIngredientDrafts([emptyIngredientDraft()]);
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudieron añadir las líneas.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteLine = async (recipeId: string, lineId: string) => {
    if (!localId || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    setBusyId(lineId);
    try {
      await deleteEscandalloLine(supabase, localId, lineId);
      await refreshRecipeLines(recipeId);
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudo eliminar la línea.');
    } finally {
      setBusyId(null);
    }
  };

  const renderRecipeCard = (recipe: EscandalloRecipe, variant: 'main' | 'sub') => {
    const lines = linesByRecipe[recipe.id] ?? [];
    const total = recipeTotalCostEur(lines, rawById, processedById, {
      linesByRecipe,
      recipesById,
      recipeId: recipe.id,
    });
    const perYield = recipe.yieldQty > 0 ? Math.round((total / recipe.yieldQty) * 100) / 100 : 0;
    const open = expandedId === recipe.id;
    const priceInner = { linesByRecipe, recipesById, expanding: new Set<string>([recipe.id]) };

    const vatPct = recipe.saleVatRatePct ?? 10;
    const netSale =
      recipe.salePriceGrossEur != null && recipe.saleVatRatePct != null
        ? saleNetPerUnitFromGross(recipe.salePriceGrossEur, recipe.saleVatRatePct)
        : recipe.salePriceGrossEur != null
          ? saleNetPerUnitFromGross(recipe.salePriceGrossEur, vatPct)
          : null;
    const fcPct = !recipe.isSubRecipe
      ? foodCostPercentOfNetSale(total, recipe.yieldQty, netSale)
      : null;
    const fcHint = foodCostStatus(fcPct);

    const headerPad = variant === 'main' ? 'px-4 py-3.5' : 'px-3 py-2.5';
    const titleClass = variant === 'main' ? 'text-base' : 'text-sm';

    return (
      <div
        key={recipe.id}
        className={[
          'overflow-hidden rounded-2xl ring-1 transition-shadow',
          open ? 'bg-white shadow-md ring-zinc-300' : 'bg-zinc-50/90 ring-zinc-200',
          variant === 'sub' ? 'text-[13px]' : '',
        ].join(' ')}
      >
        <button
          type="button"
          onClick={() => toggleExpand(recipe)}
          className={`flex w-full items-center justify-between gap-2 text-left ${headerPad}`}
        >
          <div className="min-w-0">
            <p className={`font-semibold text-zinc-900 ${titleClass}`}>{recipe.name}</p>
            <p className="text-xs text-zinc-600">
              Coste ~{perYield.toFixed(2)} € / {recipe.yieldLabel}
              {!recipe.isSubRecipe && fcPct != null ? (
                <>
                  {' '}
                  · Food cost{' '}
                  <span className={fcHint.className}>{fcPct.toFixed(1)} %</span>
                </>
              ) : null}
            </p>
            {!recipe.isSubRecipe && recipe.posArticleCode ? (
              <p className="mt-0.5 text-[11px] text-zinc-500">
                TPV <span className="font-mono tabular-nums">{recipe.posArticleCode}</span>
              </p>
            ) : null}
            {!recipe.isSubRecipe && recipe.salePriceGrossEur != null ? (
              <p className="mt-0.5 text-[11px] text-zinc-500">
                PVP {recipe.salePriceGrossEur.toFixed(2)} € IVA incl. → neto ~{netSale?.toFixed(2) ?? '—'} €
              </p>
            ) : null}
          </div>
          <ChevronDown
            className={['h-5 w-5 shrink-0 text-zinc-400 transition-transform', open ? 'rotate-180' : ''].join(' ')}
          />
        </button>
        {open ? (
          <div className="space-y-3 border-t border-zinc-200 bg-white px-3 pb-4 pt-3 sm:px-4">
            <div className="space-y-2 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-100">
              <p className="text-[10px] font-bold uppercase text-zinc-500">Ficha</p>
              <input
                value={draftRecipeName}
                onChange={(e) => setDraftRecipeName(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                placeholder="Nombre"
              />
              <textarea
                value={draftRecipeNotes}
                onChange={(e) => setDraftRecipeNotes(e.target.value)}
                rows={2}
                placeholder="Notas (opcional)"
                className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <input
                  value={draftYieldQty}
                  onChange={(e) => setDraftYieldQty(e.target.value)}
                  className="w-24 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                  inputMode="decimal"
                  placeholder="Rend."
                />
                <input
                  value={draftYieldLabel}
                  onChange={(e) => setDraftYieldLabel(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                  placeholder="Unidad (raciones, kg…)"
                />
              </div>

              {!recipe.isSubRecipe ? (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
                  <p className="text-[10px] font-bold uppercase text-emerald-900">Precio carta & food cost</p>
                  <p className="mt-1 text-[11px] text-emerald-900/80">
                    Introduce el PVP con IVA por {draftYieldLabel || 'unidad de venta'}. El neto y el % food cost se
                    calculan solos (food cost = coste / venta neta).
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="text-[10px] font-semibold text-zinc-600">PVP (€ IVA incl.)</label>
                      <input
                        value={draftSaleGross}
                        onChange={(e) => setDraftSaleGross(e.target.value)}
                        className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                        inputMode="decimal"
                        placeholder="Ej. 14,50"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-zinc-600">IVA %</label>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {VAT_PRESETS.map((p) => (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => setDraftSaleVat(p.value)}
                            className={[
                              'rounded-md px-2 py-1 text-[11px] font-semibold ring-1',
                              draftSaleVat === p.value
                                ? 'bg-zinc-900 text-white ring-zinc-900'
                                : 'bg-white text-zinc-700 ring-zinc-200',
                            ].join(' ')}
                          >
                            {p.label}
                          </button>
                        ))}
                        <input
                          value={draftSaleVat}
                          onChange={(e) => setDraftSaleVat(e.target.value)}
                          className="w-14 rounded-md border border-zinc-200 px-1 py-1 text-center text-xs"
                          inputMode="decimal"
                        />
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const g = parseDecimal(draftSaleGross);
                    const v = parseDecimal(draftSaleVat) ?? 10;
                    const n = g != null && g > 0 ? saleNetPerUnitFromGross(g, v) : null;
                    const t = recipeTotalCostEur(lines, rawById, processedById, {
                      linesByRecipe,
                      recipesById,
                      recipeId: recipe.id,
                    });
                    const y = parseDecimal(draftYieldQty) ?? recipe.yieldQty;
                    const previewFc = foodCostPercentOfNetSale(t, y > 0 ? y : 1, n);
                    const st = foodCostStatus(previewFc);
                    return (
                      <div className="mt-3 grid gap-2 rounded-lg bg-white/80 px-3 py-2 text-sm ring-1 ring-emerald-100 sm:grid-cols-2">
                        <div>
                          <p className="text-[10px] font-semibold uppercase text-zinc-500">Precio neto (sin IVA)</p>
                          <p className="text-lg font-bold tabular-nums text-zinc-900">{n != null ? `${n.toFixed(2)} €` : '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase text-zinc-500">Food cost (preview)</p>
                          <p className={`text-lg font-bold tabular-nums ${st.className}`}>
                            {previewFc != null ? `${previewFc.toFixed(1)} %` : '—'}
                          </p>
                          <p className="text-[10px] text-zinc-500">{st.text}</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : null}

              {!recipe.isSubRecipe ? (
                <div className="rounded-lg border border-zinc-200 bg-white p-3">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Código TPV / POS</label>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    Mismo valor que la columna <span className="font-medium">Articulo</span> (o código) del export. Así
                    puedes importar ventas sin usar el UUID de receta.
                  </p>
                  <input
                    value={draftPosArticleCode}
                    onChange={(e) => setDraftPosArticleCode(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-zinc-200 px-2 py-1.5 font-mono text-sm tabular-nums"
                    placeholder="Ej. 00042"
                    autoComplete="off"
                  />
                </div>
              ) : null}

              <button
                type="button"
                disabled={busyId === recipe.id}
                onClick={() => void handleSaveRecipeMeta(recipe.id)}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
              >
                Guardar ficha
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px] font-bold uppercase text-zinc-500">Ingredientes en receta</p>
                <p className="text-xs font-semibold text-zinc-700">
                  Total ~{total.toFixed(2)} €
                </p>
              </div>
              {lines.length === 0 ? (
                <p className="text-xs text-zinc-500">Aún sin líneas. Usa el bloque inferior para añadir varias a la vez.</p>
              ) : (
                <ul className="space-y-2">
                  {lines.map((line) => {
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
                    return (
                      <li
                        key={line.id}
                        className="flex items-start justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-900">{line.label}</p>
                          <p className="text-xs text-zinc-600">
                            {line.qty} {line.unit} × {unitEur.toFixed(2)} € ({src}) → {lineCost.toFixed(2)} €
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busyId === line.id}
                          onClick={() => void handleDeleteLine(recipe.id, line.id)}
                          className="shrink-0 rounded-lg p-1.5 text-[#B91C1C] hover:bg-red-50 disabled:opacity-50"
                          aria-label="Eliminar línea"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-3">
              <p className="text-[10px] font-bold uppercase text-zinc-500">Añadir varios ingredientes</p>
              <p className="mt-1 text-xs text-zinc-600">
                Rellena las filas que necesites y pulsa una sola vez para volcar todas en la receta.
              </p>
              <div className="mt-3">
                <IngredientDraftEditor
                  drafts={ingredientDrafts}
                  onChange={setIngredientDrafts}
                  sortedRaw={sortedRawProducts}
                  processedProducts={processedProducts}
                  recipes={recipes}
                  excludeRecipeId={recipe.id}
                  disabled={busyId !== null}
                />
              </div>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void handleAddLinesBatch(recipe.id)}
                className="mt-3 w-full rounded-lg bg-[#D32F2F] py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                Añadir todas las filas a la receta
              </button>
            </div>

            <button
              type="button"
              disabled={busyId === recipe.id}
              onClick={() => void handleDeleteRecipe(recipe.id)}
              className="w-full rounded-xl border border-red-200 bg-red-50 py-2 text-sm font-semibold text-red-800"
            >
              Eliminar receta
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  if (!profileReady) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Cargando sesión…</p>
      </section>
    );
  }

  if (!localId || !supabaseOk) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-semibold text-zinc-900">Escandallos no disponibles</p>
        <p className="pt-1 text-sm text-zinc-600">
          Inicia sesión con un usuario con local en Supabase para usar recetas e ingredientes.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <MermasStyleHero
        eyebrow="Operaciones"
        title="Escandallos"
        description="Coste por ración en vivo, precio de carta con IVA y food cost. Sub-recetas y elaborados al final."
        compact
      />

      <section>
        <Link
          href="/escandallos"
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 shadow-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Centro
        </Link>
      </section>

      {banner ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-100">
          {banner}
        </div>
      ) : null}

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Recetas principales</p>
            <p className="mt-1 text-sm text-zinc-600">Platos de carta: coste, PVP, IVA, neto y food cost.</p>
          </div>
        </div>
        <div className="mt-4 space-y-3 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-100">
          <p className="text-[10px] font-bold uppercase text-zinc-500">Nueva receta principal</p>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre (ej. Nachos BBQ)"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#D32F2F]/25"
          />
          <div className="flex flex-wrap gap-2">
            <input
              value={newYieldQty}
              onChange={(e) => setNewYieldQty(e.target.value)}
              placeholder="Raciones"
              className="w-24 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#D32F2F]/25"
              inputMode="decimal"
            />
            <input
              value={newYieldLabel}
              onChange={(e) => setNewYieldLabel(e.target.value)}
              placeholder="Etiqueta (raciones)"
              className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#D32F2F]/25"
            />
          </div>
          <button
            type="button"
            disabled={busyId !== null}
            onClick={() => void handleCreateRecipe(false)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D32F2F] py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Crear receta principal
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-center text-sm text-zinc-500">Cargando…</p>
        ) : mainRecipes.length === 0 ? (
          <p className="mt-4 rounded-xl bg-zinc-50 p-4 text-center text-sm text-zinc-600 ring-1 ring-zinc-200">
            Aún no hay recetas principales. Crea la primera arriba.
          </p>
        ) : (
          <div className="mt-4 space-y-3">{mainRecipes.map((r) => renderRecipeCard(r, 'main'))}</div>
        )}
      </section>

      <section className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-600">Bases y elaborados</p>
        <p className="mt-1 text-sm text-zinc-600">
          Sub-recetas con varios ingredientes (picadillo, fondos…) y transformaciones de un solo crudo.
        </p>

        <div className="mt-4 space-y-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-zinc-200">
          <p className="text-[10px] font-bold uppercase text-zinc-500">Nueva sub-receta (varios ingredientes)</p>
          <input
            value={subNewName}
            onChange={(e) => setSubNewName(e.target.value)}
            placeholder="Nombre (ej. Picadillo mexicano)"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <input
              value={subNewYieldQty}
              onChange={(e) => setSubNewYieldQty(e.target.value)}
              placeholder="Rendimiento"
              className="w-28 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              inputMode="decimal"
            />
            <input
              value={subNewYieldLabel}
              onChange={(e) => setSubNewYieldLabel(e.target.value)}
              placeholder="Unidad (kg, raciones…)"
              className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <IngredientDraftEditor
            drafts={subIngredientDrafts}
            onChange={setSubIngredientDrafts}
            sortedRaw={sortedRawProducts}
            processedProducts={processedProducts}
            recipes={recipes}
            excludeRecipeId={null}
            disabled={busyId !== null}
          />
          <button
            type="button"
            disabled={busyId !== null}
            onClick={() => void handleCreateRecipe(true)}
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            Guardar sub-receta (y volcar ingredientes)
          </button>
        </div>

        {subRecipes.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-[10px] font-bold uppercase text-zinc-500">Tus sub-recetas</p>
            {subRecipes.map((r) => renderRecipeCard(r, 'sub'))}
          </div>
        ) : (
          !loading && (
            <p className="mt-3 text-xs text-zinc-500">Aún no hay sub-recetas guardadas.</p>
          )
        )}

        <div className="mt-6 border-t border-zinc-200 pt-4">
          <p className="text-[10px] font-bold uppercase text-zinc-500">Elaborado simple (1 crudo → transformado)</p>
          <p className="mt-1 text-xs text-zinc-600">
            La entrada va en la misma unidad que el pedido (caja, kg…). Se recalcula si cambia el precio del crudo en
            Proveedores.
          </p>
          <div className="mt-2 space-y-2 rounded-xl bg-white p-3 ring-1 ring-zinc-100">
            <input
              value={procName}
              onChange={(e) => setProcName(e.target.value)}
              placeholder="Nombre (ej. Cebolla caramelizada)"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
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
                placeholder="Producto crudo proveedor…"
                className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm"
              />
              {procRawDropdownOpen ? (
                <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
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
                placeholder="Entrada qty"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <input
                value={procOutputQty}
                onChange={(e) => setProcOutputQty(e.target.value)}
                placeholder="Salida qty"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={procOutputUnit}
                onChange={(e) => setProcOutputUnit(e.target.value as Unit)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
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
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => void handleCreateProcessed()}
              className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
            >
              Guardar elaborado
            </button>
            {processedProducts.length > 0 ? (
              <ul className="space-y-2 pt-2">
                {processedProducts.map((p) => {
                  const raw = rawById.get(p.sourceSupplierProductId);
                  const cost =
                    raw && p.outputQty > 0
                      ? ((raw.pricePerUnit * p.inputQty + p.extraCostEur) / p.outputQty).toFixed(2)
                      : '0.00';
                  return (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200"
                    >
                      <p className="text-xs text-zinc-700">
                        <span className="font-semibold text-zinc-900">{p.name}</span> · {p.inputQty}→{p.outputQty}{' '}
                        {p.outputUnit} · {cost} €/{p.outputUnit}
                      </p>
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => void handleDeleteProcessed(p.id)}
                        className="rounded p-1 text-[#B91C1C]"
                        aria-label="Eliminar elaborado"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
