'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useMermasStore } from '@/components/MermasStoreProvider';
import { useAuth } from '@/components/AuthProvider';
import { appConfirm } from '@/lib/app-dialog-bridge';
import { confirmDestructiveOperation } from '@/lib/ops-role-confirm';
import {
  fetchEscandalloLines,
  fetchEscandalloRawProductsWithWeightedPurchasePrices,
  fetchEscandalloRecipes,
  fetchProcessedProductsForEscandallo,
  recipeTotalCostEur,
  type EscandalloLine,
} from '@/lib/escandallos-supabase';
import { fetchPurchaseArticles } from '@/lib/purchase-articles-supabase';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import type { Unit } from '@/lib/types';

type CompositionLineDraft = {
  id: string;
  componentType: 'master' | 'escandallo' | 'base_subreceta';
  componentId: string;
  componentKind?: 'recipe' | 'processed' | null;
  qty: string;
  unit: Unit;
};

export default function ProductosPage() {
  const { profileRole } = useAuth();
  const { localId } = useAuth();
  const { products, addProduct, updateProduct, removeProduct } = useMermasStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<Unit>('ud');
  const [price, setPrice] = useState('0');
  const [originType, setOriginType] = useState<'manual' | 'master' | 'escandallo' | 'base_subreceta' | 'composicion'>('manual');
  const [masterArticleId, setMasterArticleId] = useState<string>('');
  const [escandalloId, setEscandalloId] = useState<string>('');
  const [baseSubrecipeId, setBaseSubrecipeId] = useState<string>('');
  const [baseSubrecipeKind, setBaseSubrecipeKind] = useState<'recipe' | 'processed'>('recipe');
  const [compositionLines, setCompositionLines] = useState<CompositionLineDraft[]>([]);
  const [masterSearch, setMasterSearch] = useState('');
  const [escandalloSearch, setEscandalloSearch] = useState('');
  const [masterOptions, setMasterOptions] = useState<Array<{ id: string; nombre: string }>>([]);
  const [escandalloOptions, setEscandalloOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [baseSubrecipeOptions, setBaseSubrecipeOptions] = useState<Array<{ id: string; name: string; kind: 'recipe' | 'processed' }>>([]);
  const [escandalloAutoPrice, setEscandalloAutoPrice] = useState<number | null>(null);
  const [baseSubrecipeAutoPrice, setBaseSubrecipeAutoPrice] = useState<number | null>(null);
  const [escandalloPriceLoading, setEscandalloPriceLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showDeletedBanner, setShowDeletedBanner] = useState(false);
  const deletedBannerTimeoutRef = React.useRef<number | null>(null);
  const [search, setSearch] = useState('');

  const resolveEscandalloUnitCost = async (
    recipeId: string,
  ): Promise<number | null> => {
    if (!localId || !isSupabaseEnabled()) return null;
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const [recipes, rawProducts, processedProducts] = await Promise.all([
      fetchEscandalloRecipes(supabase, localId),
      fetchEscandalloRawProductsWithWeightedPurchasePrices(supabase, localId),
      fetchProcessedProductsForEscandallo(supabase, localId),
    ]);
    const recipe = recipes.find((r) => r.id === recipeId);
    if (!recipe || recipe.yieldQty <= 0) return null;

    const linesByRecipe: Record<string, EscandalloLine[]> = {};
    const recipesById = new Map(recipes.map((r) => [r.id, r]));
    const toVisit = [recipeId];
    const visited = new Set<string>();
    while (toVisit.length > 0) {
      const current = toVisit.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const lines = await fetchEscandalloLines(supabase, localId, current);
      linesByRecipe[current] = lines;
      for (const ln of lines) {
        if (ln.sourceType === 'subrecipe' && ln.subRecipeId && !visited.has(ln.subRecipeId)) {
          toVisit.push(ln.subRecipeId);
        }
      }
    }

    const total = recipeTotalCostEur(
      linesByRecipe[recipe.id] ?? [],
      new Map(rawProducts.map((x) => [x.id, x])),
      new Map(processedProducts.map((x) => [x.id, x])),
      { linesByRecipe, recipesById, recipeId: recipe.id },
    );
    if (!Number.isFinite(total) || total <= 0) return null;
    const perUnit = Math.round((total / recipe.yieldQty) * 10000) / 10000;
    return perUnit > 0 ? perUnit : null;
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const filteredMasterOptions = useMemo(() => {
    const q = masterSearch.trim().toLowerCase();
    if (!q) return masterOptions;
    return masterOptions.filter((x) => x.nombre.toLowerCase().includes(q));
  }, [masterOptions, masterSearch]);
  const filteredEscandalloOptions = useMemo(() => {
    const q = escandalloSearch.trim().toLowerCase();
    if (!q) return escandalloOptions;
    return escandalloOptions.filter((x) => x.name.toLowerCase().includes(q));
  }, [escandalloOptions, escandalloSearch]);

  useEffect(() => {
    if (!localId || !isSupabaseEnabled()) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    void (async () => {
      try {
        const [articles, recipes, processed] = await Promise.all([
          fetchPurchaseArticles(supabase, localId),
          fetchEscandalloRecipes(supabase, localId),
          fetchProcessedProductsForEscandallo(supabase, localId),
        ]);
        if (!active) return;
        setMasterOptions(articles.map((a) => ({ id: a.id, nombre: a.nombre })));
        setEscandalloOptions(recipes.map((r) => ({ id: r.id, name: r.name })));
        setBaseSubrecipeOptions([
          ...recipes.filter((r) => r.isSubRecipe).map((r) => ({ id: r.id, name: r.name, kind: 'recipe' as const })),
          ...processed.map((p) => ({ id: p.id, name: p.name, kind: 'processed' as const })),
        ]);
      } catch {
        if (!active) return;
        setMasterOptions([]);
        setEscandalloOptions([]);
        setBaseSubrecipeOptions([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [localId]);

  useEffect(() => {
    if (originType !== 'escandallo' || !escandalloId || !localId || !isSupabaseEnabled()) {
      setEscandalloAutoPrice(null);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setEscandalloAutoPrice(null);
      return;
    }
    let active = true;
    void (async () => {
      setEscandalloPriceLoading(true);
      try {
        if (!active) return;
        const perUnit = await resolveEscandalloUnitCost(escandalloId);
        if (!active) return;
        setEscandalloAutoPrice(perUnit);
      } catch {
        if (!active) return;
        setEscandalloAutoPrice(null);
      } finally {
        if (active) setEscandalloPriceLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [originType, escandalloId, localId]);

  useEffect(() => {
    if (originType !== 'base_subreceta' || !baseSubrecipeId || !localId || !isSupabaseEnabled()) {
      setBaseSubrecipeAutoPrice(null);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setBaseSubrecipeAutoPrice(null);
      return;
    }
    let active = true;
    void (async () => {
      setEscandalloPriceLoading(true);
      try {
        const [recipes, rawProducts, processedProducts] = await Promise.all([
          fetchEscandalloRecipes(supabase, localId),
          fetchEscandalloRawProductsWithWeightedPurchasePrices(supabase, localId),
          fetchProcessedProductsForEscandallo(supabase, localId),
        ]);
        if (!active) return;
        if (baseSubrecipeKind === 'processed') {
          const p = processedProducts.find((x) => x.id === baseSubrecipeId);
          const raw = p ? rawProducts.find((x) => x.id === p.sourceSupplierProductId) : null;
          if (!p || !raw || p.outputQty <= 0) {
            setBaseSubrecipeAutoPrice(null);
            return;
          }
          const unitPrice = ((raw.pricePerUnit > 0 ? raw.pricePerUnit : 0) * p.inputQty + p.extraCostEur) / p.outputQty;
          setBaseSubrecipeAutoPrice(Math.round(Math.max(0, unitPrice) * 10000) / 10000);
          return;
        }
        const recipe = recipes.find((r) => r.id === baseSubrecipeId);
        if (!recipe || recipe.yieldQty <= 0) {
          setBaseSubrecipeAutoPrice(null);
          return;
        }
        const linesByRecipe: Record<string, EscandalloLine[]> = {};
        const linesList = await Promise.all(recipes.map((r) => fetchEscandalloLines(supabase, localId, r.id)));
        if (!active) return;
        recipes.forEach((r, i) => {
          linesByRecipe[r.id] = linesList[i];
        });
        const total = recipeTotalCostEur(
          linesByRecipe[recipe.id] ?? [],
          new Map(rawProducts.map((x) => [x.id, x])),
          new Map(processedProducts.map((x) => [x.id, x])),
          { linesByRecipe, recipesById: new Map(recipes.map((x) => [x.id, x])), recipeId: recipe.id },
        );
        setBaseSubrecipeAutoPrice(total > 0 ? Math.round((total / recipe.yieldQty) * 10000) / 10000 : 0);
      } catch {
        if (!active) return;
        setBaseSubrecipeAutoPrice(null);
      } finally {
        if (active) setEscandalloPriceLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [originType, baseSubrecipeId, baseSubrecipeKind, localId]);

  useEffect(() => {
    if (originType !== 'escandallo' && originType !== 'base_subreceta') return;
    const next = originType === 'escandallo' ? escandalloAutoPrice ?? 0 : baseSubrecipeAutoPrice ?? 0;
    setPrice(next.toFixed(2));
  }, [originType, escandalloAutoPrice, baseSubrecipeAutoPrice]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric =
      originType === 'escandallo'
        ? Math.max(0, escandalloAutoPrice ?? 0)
        : originType === 'base_subreceta'
          ? Math.max(0, baseSubrecipeAutoPrice ?? 0)
          : Number(price);
    const trimmed = name.trim();
    if (!trimmed || !Number.isFinite(numeric) || numeric < 0) return;
    if (originType === 'manual' && numeric <= 0) {
      setMessage('Indica un precio manual mayor que 0.');
      return;
    }
    if (originType === 'master' && !masterArticleId) {
      setMessage('Selecciona un Artículo Máster para este origen.');
      return;
    }
    if (originType === 'escandallo' && !escandalloId) {
      setMessage('Selecciona un escandallo para usar precio automático.');
      return;
    }
    if (originType === 'escandallo' && (!Number.isFinite(escandalloAutoPrice ?? NaN) || (escandalloAutoPrice ?? 0) <= 0)) {
      setMessage('No se pudo resolver el coste del escandallo seleccionado.');
      return;
    }
    if (originType === 'base_subreceta' && !baseSubrecipeId) {
      setMessage('Selecciona una base/subreceta/elaborado para este origen.');
      return;
    }
    if (originType === 'composicion') {
      const valid = compositionLines.filter(
        (x) => x.componentId && Number.isFinite(Number(x.qty)) && Number(x.qty) > 0 && x.unit,
      );
      if (valid.length === 0) {
        setMessage('Añade al menos una línea válida en la composición.');
        return;
      }
    }
    const duplicate = products.some(
      (p) =>
        p.name.trim().toLowerCase() === trimmed.toLowerCase() &&
        (editingId ? p.id !== editingId : true),
    );
    if (duplicate) {
      setMessage('Ya existe un producto con ese nombre.');
      return;
    }

    if (editingId) {
      updateProduct(editingId, {
        name,
        unit,
        pricePerUnit: numeric,
        typeOrigin: originType,
        masterArticleId: originType === 'master' ? masterArticleId || null : null,
        escandalloId: originType === 'escandallo' ? escandalloId || null : null,
        baseSubrecipeId: originType === 'base_subreceta' ? baseSubrecipeId || null : null,
        baseSubrecipeKind: originType === 'base_subreceta' ? baseSubrecipeKind : null,
        manualPricePerUnit: originType === 'manual' ? numeric : null,
        compositionLines:
          originType === 'composicion'
            ? compositionLines
                .filter((x) => x.componentId && Number.isFinite(Number(x.qty)) && Number(x.qty) > 0 && x.unit)
                .map((x) => ({
                  id: x.id,
                  componentType: x.componentType,
                  componentId: x.componentId,
                  componentKind: x.componentKind ?? null,
                  qty: Number(x.qty),
                  unit: x.unit,
                }))
            : [],
      });
      setMessage('Producto actualizado.');
    } else {
      addProduct({
        name,
        unit,
        pricePerUnit: numeric,
        typeOrigin: originType,
        masterArticleId: originType === 'master' ? masterArticleId || null : null,
        escandalloId: originType === 'escandallo' ? escandalloId || null : null,
        baseSubrecipeId: originType === 'base_subreceta' ? baseSubrecipeId || null : null,
        baseSubrecipeKind: originType === 'base_subreceta' ? baseSubrecipeKind : null,
        manualPricePerUnit: originType === 'manual' ? numeric : null,
        compositionLines:
          originType === 'composicion'
            ? compositionLines
                .filter((x) => x.componentId && Number.isFinite(Number(x.qty)) && Number(x.qty) > 0 && x.unit)
                .map((x) => ({
                  id: x.id,
                  componentType: x.componentType,
                  componentId: x.componentId,
                  componentKind: x.componentKind ?? null,
                  qty: Number(x.qty),
                  unit: x.unit,
                }))
            : [],
      });
      setMessage('Producto añadido.');
    }
    setName('');
    setUnit('ud');
    setPrice('0');
    setOriginType('manual');
    setMasterArticleId('');
    setEscandalloId('');
    setBaseSubrecipeId('');
    setMasterSearch('');
    setEscandalloSearch('');
    setCompositionLines([]);
    setEscandalloAutoPrice(null);
    setEditingId(null);
    setOpen(false);
  };

  React.useEffect(
    () => () => {
      if (deletedBannerTimeoutRef.current) window.clearTimeout(deletedBannerTimeoutRef.current);
    },
    [],
  );

  return (
    <div className="relative">
      {showDeletedBanner ? (
        <div className="pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-black/25 px-6">
          <div className="rounded-2xl bg-[#D32F2F] px-7 py-5 text-center shadow-2xl ring-2 ring-white/75">
            <p className="text-xl font-black uppercase tracking-wide text-white">ELIMINADO</p>
          </div>
        </div>
      ) : null}
      <div className="mb-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Catalogo de Productos</p>
        <p className="pt-1 text-sm text-zinc-700">Gestiona nombre, unidad y precio por producto.</p>
        <label className="mt-3 flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
          />
        </label>
      </div>
      {message ? (
        <div className="mb-3 rounded-xl bg-white p-3 text-sm text-zinc-700 ring-1 ring-zinc-200">
          {message}
        </div>
      ) : null}

      <div className="space-y-3 pb-20">
        {filteredProducts.map((p) => (
          <div
            key={p.id}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-4 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-extrabold uppercase text-zinc-900">{p.name}</p>
                <p className="pt-1 text-sm text-zinc-600">
                  {p.pricePerUnit.toFixed(2)} €/{p.unit}
                </p>
                <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Origen:{' '}
                  {p.typeOrigin === 'master'
                    ? 'Artículo Máster'
                    : p.typeOrigin === 'escandallo'
                      ? 'Escandallo'
                      : p.typeOrigin === 'base_subreceta'
                        ? 'Base/Subreceta'
                      : p.typeOrigin === 'composicion'
                        ? 'Composición'
                        : 'Manual'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(p.id);
                    setName(p.name);
                    setUnit(p.unit);
                    setPrice(String(p.manualPricePerUnit ?? p.pricePerUnit));
                    setOriginType(p.typeOrigin ?? 'manual');
                    setMasterArticleId(p.masterArticleId ?? '');
                    setEscandalloId(p.escandalloId ?? '');
                    setBaseSubrecipeId(p.baseSubrecipeId ?? '');
                    setBaseSubrecipeKind((p.baseSubrecipeKind ?? 'recipe') as 'recipe' | 'processed');
                    setMasterSearch('');
                    setEscandalloSearch('');
                    setEscandalloAutoPrice(null);
                    setCompositionLines(
                      (p.compositionLines ?? []).map((x) => ({
                        id: x.id,
                        componentType: x.componentType,
                        componentId: x.componentId,
                        componentKind: x.componentKind ?? null,
                        qty: String(x.qty),
                        unit: x.unit as Unit,
                      })),
                    );
                    setOpen(true);
                    setMessage(null);
                  }}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                  aria-label={`Editar ${p.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const confirmed = await appConfirm(`¿Eliminar "${p.name}"?`);
                    if (!confirmed) return;
                    if (!(await confirmDestructiveOperation(profileRole, '¿Confirmar eliminación de este producto?'))) {
                      return;
                    }
                    const result = removeProduct(p.id);
                    setMessage(result.ok ? 'Producto eliminado.' : result.reason ?? 'No se pudo eliminar.');
                    if (result.ok) {
                      setShowDeletedBanner(true);
                      if (deletedBannerTimeoutRef.current) window.clearTimeout(deletedBannerTimeoutRef.current);
                      deletedBannerTimeoutRef.current = window.setTimeout(() => {
                        setShowDeletedBanner(false);
                        deletedBannerTimeoutRef.current = null;
                      }, 1000);
                    }
                  }}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                  aria-label={`Eliminar ${p.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {filteredProducts.length === 0 ? (
          <div className="rounded-xl bg-white p-4 text-sm text-zinc-500 ring-1 ring-zinc-200">
            No hay productos que coincidan con la búsqueda.
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setEditingId(null);
          setName('');
          setUnit('ud');
          setPrice('0');
          setOriginType('manual');
          setMasterArticleId('');
          setEscandalloId('');
          setBaseSubrecipeId('');
          setMasterSearch('');
          setEscandalloSearch('');
          setCompositionLines([]);
          setEscandalloAutoPrice(null);
          setMessage(null);
        }}
        className="fixed bottom-24 right-6 z-40 grid h-16 w-16 place-items-center rounded-full bg-gradient-to-r from-[#B91C1C] to-[#D32F2F] text-white shadow-xl"
        aria-label="Añadir producto"
      >
        <Plus className="h-8 w-8" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-800">
                {editingId ? 'Editar Producto' : 'Nuevo Producto'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setEditingId(null);
                  setName('');
                  setUnit('ud');
                  setPrice('0');
                  setOriginType('manual');
                  setMasterArticleId('');
                  setEscandalloId('');
                  setBaseSubrecipeId('');
                  setMasterSearch('');
                  setEscandalloSearch('');
                  setCompositionLines([]);
                  setEscandalloAutoPrice(null);
                }}
                className="grid h-9 w-9 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-100"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form className="space-y-3" onSubmit={handleSubmit}>
              <label className="block text-xs font-semibold text-zinc-700">
                Nombre del Producto
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                  placeholder="Ej: Alitas de Pollo"
                />
              </label>

              <label className="block text-xs font-semibold text-zinc-700">
                Unidad de Medida
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as Unit)}
                  className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                >
                  <option value="kg">kg</option>
                  <option value="ud">ud</option>
                  <option value="bolsa">bolsa</option>
                  <option value="racion">racion</option>
                </select>
              </label>

              <label className="block text-xs font-semibold text-zinc-700">
                Precio por Unidad
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  readOnly={originType !== 'manual'}
                  disabled={originType !== 'manual'}
                  className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                  placeholder="0.00"
                />
                {originType !== 'manual' ? (
                  <p className="mt-1 text-[11px] font-semibold text-zinc-500">
                    {escandalloPriceLoading
                      ? 'Calculando precio automático…'
                      : originType === 'escandallo'
                        ? 'Precio automático desde escandallo'
                        : 'Precio automático'}
                  </p>
                ) : null}
              </label>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs font-semibold text-zinc-700">Origen del coste</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                  {([
                    { id: 'manual', label: 'Manual' },
                    { id: 'master', label: 'Artículo Máster' },
                    { id: 'escandallo', label: 'Escandallo' },
                    { id: 'base_subreceta', label: 'Base/Subreceta' },
                    { id: 'composicion', label: 'Composición' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setOriginType(opt.id)}
                      className={[
                        'rounded-lg border px-2 py-2 text-xs font-semibold',
                        originType === opt.id
                          ? 'border-[#D32F2F] bg-[#D32F2F]/10 text-zinc-900'
                          : 'border-zinc-200 bg-white text-zinc-700',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {originType === 'master' ? (
                  <div className="mt-3 space-y-2">
                    <input
                      value={masterSearch}
                      onChange={(e) => setMasterSearch(e.target.value)}
                      placeholder="Buscar artículo máster..."
                      className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                    />
                    <select
                      value={masterArticleId}
                      onChange={(e) => setMasterArticleId(e.target.value)}
                      className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                    >
                      <option value="">Selecciona artículo máster…</option>
                      {filteredMasterOptions.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {originType === 'escandallo' ? (
                  <div className="mt-3 space-y-2">
                    <input
                      value={escandalloSearch}
                      onChange={(e) => setEscandalloSearch(e.target.value)}
                      placeholder="Buscar escandallo..."
                      className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                    />
                    <select
                      value={escandalloId}
                      onChange={(e) => setEscandalloId(e.target.value)}
                      className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                    >
                      <option value="">Selecciona escandallo…</option>
                      {filteredEscandalloOptions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {originType === 'base_subreceta' ? (
                  <div className="mt-3 space-y-2">
                    <select
                      value={`${baseSubrecipeKind}:${baseSubrecipeId}`}
                      onChange={(e) => {
                        const [kind, id] = e.target.value.split(':');
                        setBaseSubrecipeKind((kind === 'processed' ? 'processed' : 'recipe') as 'recipe' | 'processed');
                        setBaseSubrecipeId(id || '');
                      }}
                      className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                    >
                      <option value=":">Selecciona base/subreceta/elaborado…</option>
                      {baseSubrecipeOptions.map((r) => (
                        <option key={`${r.kind}-${r.id}`} value={`${r.kind}:${r.id}`}>
                          {r.kind === 'processed' ? 'Elaborado · ' : 'Base/Subreceta · '}
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {originType === 'composicion' ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-semibold text-zinc-700">Composición de merma</p>
                    {compositionLines.map((line, idx) => (
                      <div key={line.id} className="grid grid-cols-12 gap-2 rounded-lg border border-zinc-200 bg-white p-2">
                        <select
                          value={line.componentType}
                          onChange={(e) =>
                            setCompositionLines((prev) =>
                              prev.map((x) =>
                                x.id === line.id
                                  ? { ...x, componentType: e.target.value as CompositionLineDraft['componentType'], componentId: '' }
                                  : x,
                              ),
                            )
                          }
                          className="col-span-12 h-10 rounded-lg border border-zinc-200 px-2 text-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                        >
                          <option value="master">Artículo Máster</option>
                          <option value="escandallo">Escandallo final</option>
                          <option value="base_subreceta">Base/Subreceta/Elaborado</option>
                        </select>
                        <select
                          value={line.componentId}
                          onChange={(e) =>
                            setCompositionLines((prev) =>
                              prev.map((x) =>
                                x.id === line.id
                                  ? {
                                      ...x,
                                      componentId: e.target.value,
                                      componentKind:
                                        line.componentType === 'base_subreceta'
                                          ? (e.target.selectedOptions[0]?.getAttribute('data-kind') as 'recipe' | 'processed' | null)
                                          : null,
                                    }
                                  : x,
                              ),
                            )
                          }
                          className="col-span-12 h-10 rounded-lg border border-zinc-200 px-2 text-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                        >
                          <option value="">
                            {line.componentType === 'master'
                              ? 'Artículo Máster…'
                              : line.componentType === 'escandallo'
                                ? 'Escandallo…'
                                : 'Base/Subreceta/Elaborado…'}
                          </option>
                          {line.componentType === 'master'
                            ? masterOptions.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.nombre}
                                </option>
                              ))
                            : line.componentType === 'escandallo'
                              ? escandalloOptions.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                  </option>
                                ))
                              : baseSubrecipeOptions.map((r) => (
                                  <option key={`${r.kind}-${r.id}`} value={r.id} data-kind={r.kind}>
                                    {r.kind === 'processed' ? 'Elaborado · ' : 'Base/Subreceta · '}
                                    {r.name}
                                  </option>
                                ))}
                        </select>
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={line.qty}
                          onChange={(e) =>
                            setCompositionLines((prev) =>
                              prev.map((x) => (x.id === line.id ? { ...x, qty: e.target.value } : x)),
                            )
                          }
                          placeholder="Cantidad"
                          className="col-span-5 h-10 rounded-lg border border-zinc-200 px-2 text-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                        />
                        <select
                          value={line.unit}
                          onChange={(e) =>
                            setCompositionLines((prev) =>
                              prev.map((x) => (x.id === line.id ? { ...x, unit: e.target.value as Unit } : x)),
                            )
                          }
                          className="col-span-4 h-10 rounded-lg border border-zinc-200 px-2 text-sm outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                        >
                          <option value="ud">ud</option>
                          <option value="kg">kg</option>
                          <option value="g">g</option>
                          <option value="litro">litro</option>
                          <option value="ml">ml</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setCompositionLines((prev) => prev.filter((x) => x.id !== line.id))}
                          className="col-span-3 h-10 rounded-lg border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50"
                          aria-label={`Eliminar línea ${idx + 1}`}
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setCompositionLines((prev) => [
                          ...prev,
                          {
                            id: `${Date.now()}-${Math.random()}`,
                            componentType: 'master',
                            componentId: '',
                            componentKind: null,
                            qty: '',
                            unit: 'ud',
                          },
                        ])
                      }
                      className="h-10 w-full rounded-lg border border-zinc-300 bg-white text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                    >
                      + Añadir línea
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                type="submit"
                className="h-12 w-full rounded-xl bg-[#D32F2F] text-sm font-extrabold uppercase text-white"
              >
                {editingId ? 'Guardar Cambios' : 'Guardar Producto'}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

