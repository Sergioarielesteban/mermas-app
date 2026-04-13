'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  deleteEscandalloLine,
  deleteEscandalloRecipe,
  fetchEscandalloLines,
  fetchEscandalloRecipes,
  fetchProductsForEscandallo,
  insertEscandalloLine,
  insertEscandalloRecipe,
  lineUnitPriceEur,
  recipeTotalCostEur,
  updateEscandalloRecipe,
  type EscandalloLine,
  type EscandalloProductPick,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import type { Unit } from '@/lib/types';

const UNITS: { value: Unit; label: string }[] = [
  { value: 'kg', label: 'kg' },
  { value: 'ud', label: 'ud' },
  { value: 'bolsa', label: 'bolsa' },
  { value: 'racion', label: 'ración' },
];

function parseDecimal(raw: string): number | null {
  const t = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function EscandallosPage() {
  const { localId, profileReady } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const [recipes, setRecipes] = useState<EscandalloRecipe[]>([]);
  const [linesByRecipe, setLinesByRecipe] = useState<Record<string, EscandalloLine[]>>({});
  const [products, setProducts] = useState<EscandalloProductPick[]>([]);
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

  const [addProductId, setAddProductId] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [addQty, setAddQty] = useState('1');
  const [addUnit, setAddUnit] = useState<Unit>('kg');
  const [addManualPrice, setAddManualPrice] = useState('');

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setRecipes([]);
      setLinesByRecipe({});
      setProducts([]);
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const [r, p] = await Promise.all([
        fetchEscandalloRecipes(supabase, localId),
        fetchProductsForEscandallo(supabase, localId),
      ]);
      setRecipes(r);
      setProducts(p);
      const linesEntries = await Promise.all(
        r.map(async (recipe) => {
          const lines = await fetchEscandalloLines(supabase, localId, recipe.id);
          return [recipe.id, lines] as const;
        }),
      );
      setLinesByRecipe(Object.fromEntries(linesEntries));
    } catch (e: unknown) {
      setBanner(
        e instanceof Error
          ? e.message
          : 'No se pudieron cargar escandallos. ¿Ejecutaste supabase-escandallos-schema.sql?',
      );
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

  const openRecipe = (recipe: EscandalloRecipe) => {
    setExpandedId((id) => (id === recipe.id ? null : recipe.id));
    setDraftRecipeName(recipe.name);
    setDraftRecipeNotes(recipe.notes);
    setDraftYieldQty(String(recipe.yieldQty));
    setDraftYieldLabel(recipe.yieldLabel);
    setAddProductId('');
    setAddLabel('');
    setAddQty('1');
    setAddUnit('kg');
    setAddManualPrice('');
  };

  const handleCreateRecipe = async () => {
    if (!localId || !supabaseOk) return;
    const name = newName.trim();
    if (!name) {
      setBanner('Escribe un nombre para la receta.');
      return;
    }
    const y = parseDecimal(newYieldQty);
    const supabase = getSupabaseClient()!;
    setBusyId('new');
    setBanner(null);
    try {
      const recipe = await insertEscandalloRecipe(supabase, localId, name, {
        yieldQty: y != null && y > 0 ? y : 1,
        yieldLabel: newYieldLabel.trim() || 'raciones',
      });
      setRecipes((prev) => [...prev, recipe].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      setLinesByRecipe((prev) => ({ ...prev, [recipe.id]: [] }));
      setNewName('');
      setNewYieldQty('1');
      setNewYieldLabel('raciones');
      setExpandedId(recipe.id);
      openRecipe(recipe);
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
    setBusyId(recipeId);
    setBanner(null);
    try {
      await updateEscandalloRecipe(supabase, localId, recipeId, {
        name: draftRecipeName,
        notes: draftRecipeNotes,
        yieldQty: y != null && y > 0 ? y : undefined,
        yieldLabel: draftYieldLabel,
      });
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

  const handleAddLine = async (recipeId: string) => {
    if (!localId || !supabaseOk) return;
    const qty = parseDecimal(addQty);
    if (qty == null || qty <= 0) {
      setBanner('Cantidad inválida.');
      return;
    }
    const picked = addProductId ? productById.get(addProductId) : undefined;
    const label = (picked ? picked.name : addLabel.trim()) || '';
    if (!label) {
      setBanner('Elige un producto del registro o escribe un nombre.');
      return;
    }
    let manual: number | null = null;
    if (!picked) {
      const m = parseDecimal(addManualPrice);
      if (m == null || m < 0) {
        setBanner('Sin producto enlazado, indica precio €/unidad manual.');
        return;
      }
      manual = Math.round(m * 10000) / 10000;
    }
    const supabase = getSupabaseClient()!;
    const existing = linesByRecipe[recipeId] ?? [];
    const sortOrder = existing.length;
    setBusyId(`line-${recipeId}`);
    setBanner(null);
    try {
      await insertEscandalloLine(supabase, localId, recipeId, {
        label,
        qty,
        unit: picked ? picked.unit : addUnit,
        productId: picked ? picked.id : null,
        manualPricePerUnit: picked ? null : manual,
        sortOrder,
      });
      await refreshRecipeLines(recipeId);
      setAddProductId('');
      setAddLabel('');
      setAddQty('1');
      setAddManualPrice('');
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudo añadir la línea.');
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
        eyebrow="Costes"
        title="Escandallos"
        description="Recetas del local: ingredientes enlazados al registro Mermas o precio manual. Coste por ración según el rendimiento."
        compact
      />

      <section>
        <Link
          href="/panel"
          className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700"
        >
          ← Panel de control
        </Link>
      </section>

      {banner ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-100">
          {banner}
        </div>
      ) : null}

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Nueva receta</p>
        <div className="mt-2 space-y-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre (ej. Arroz meloso)"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#D32F2F]/25"
          />
          <div className="flex flex-wrap gap-2">
            <input
              value={newYieldQty}
              onChange={(e) => setNewYieldQty(e.target.value)}
              placeholder="Raciones"
              className="w-24 rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#D32F2F]/25"
              inputMode="decimal"
            />
            <input
              value={newYieldLabel}
              onChange={(e) => setNewYieldLabel(e.target.value)}
              placeholder="Etiqueta (raciones)"
              className="min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#D32F2F]/25"
            />
          </div>
          <button
            type="button"
            disabled={busyId !== null}
            onClick={() => void handleCreateRecipe()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D32F2F] py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Crear receta
          </button>
        </div>
      </section>

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : recipes.length === 0 ? (
        <p className="rounded-2xl bg-zinc-50 p-4 text-center text-sm text-zinc-600 ring-1 ring-zinc-200">
          Aún no hay recetas. Crea la primera arriba.
        </p>
      ) : (
        <div className="space-y-3">
          {recipes.map((recipe) => {
            const lines = linesByRecipe[recipe.id] ?? [];
            const total = recipeTotalCostEur(lines, productById);
            const perYield = recipe.yieldQty > 0 ? Math.round((total / recipe.yieldQty) * 100) / 100 : 0;
            const open = expandedId === recipe.id;
            return (
              <div
                key={recipe.id}
                className={[
                  'overflow-hidden rounded-2xl ring-1 transition-shadow',
                  open ? 'bg-white shadow-md ring-zinc-300' : 'bg-zinc-50/90 ring-zinc-200',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() => openRecipe(recipe)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900">{recipe.name}</p>
                    <p className="text-xs text-zinc-600">
                      Coste total ~{total.toFixed(2)} € · ~{perYield.toFixed(2)} € / {recipe.yieldLabel} (
                      {recipe.yieldQty})
                    </p>
                  </div>
                  <ChevronDown
                    className={['h-5 w-5 shrink-0 text-zinc-400 transition-transform', open ? 'rotate-180' : ''].join(
                      ' ',
                    )}
                  />
                </button>
                {open ? (
                  <div className="space-y-3 border-t border-zinc-200 bg-white px-3 pb-4 pt-3">
                    <div className="space-y-2 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-100">
                      <p className="text-[10px] font-bold uppercase text-zinc-500">Datos de la receta</p>
                      <input
                        value={draftRecipeName}
                        onChange={(e) => setDraftRecipeName(e.target.value)}
                        className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
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
                          className="w-20 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                          inputMode="decimal"
                        />
                        <input
                          value={draftYieldLabel}
                          onChange={(e) => setDraftYieldLabel(e.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={busyId === recipe.id}
                        onClick={() => void handleSaveRecipeMeta(recipe.id)}
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                      >
                        Guardar datos
                      </button>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase text-zinc-500">Ingredientes</p>
                      {lines.length === 0 ? (
                        <p className="text-xs text-zinc-500">Sin líneas. Añade abajo.</p>
                      ) : (
                        <ul className="space-y-2">
                          {lines.map((line) => {
                            const unitEur = lineUnitPriceEur(line, productById);
                            const lineCost = Math.round(line.qty * unitEur * 100) / 100;
                            const src = line.productId ? 'Mermas' : 'Manual';
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
                      <p className="text-[10px] font-bold uppercase text-zinc-500">Añadir ingrediente</p>
                      <label className="mt-2 block text-[10px] font-semibold text-zinc-500">Desde registro Mermas</label>
                      <select
                        value={addProductId}
                        onChange={(e) => {
                          setAddProductId(e.target.value);
                          if (e.target.value) {
                            const p = productById.get(e.target.value);
                            if (p) {
                              setAddLabel('');
                              setAddUnit(p.unit);
                              setAddManualPrice('');
                            }
                          }
                        }}
                        className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm"
                      >
                        <option value="">— Ninguno (manual) —</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.pricePerUnit.toFixed(2)} €/{p.unit})
                          </option>
                        ))}
                      </select>
                      {!addProductId ? (
                        <>
                          <label className="mt-2 block text-[10px] font-semibold text-zinc-500">Nombre manual</label>
                          <input
                            value={addLabel}
                            onChange={(e) => setAddLabel(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                            placeholder="Ej. Vino blanco"
                          />
                          <label className="mt-2 block text-[10px] font-semibold text-zinc-500">Unidad</label>
                          <select
                            value={addUnit}
                            onChange={(e) => setAddUnit(e.target.value as Unit)}
                            className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-2 text-sm"
                          >
                            {UNITS.map((u) => (
                              <option key={u.value} value={u.value}>
                                {u.label}
                              </option>
                            ))}
                          </select>
                          <label className="mt-2 block text-[10px] font-semibold text-zinc-500">
                            Precio € / unidad (manual)
                          </label>
                          <input
                            value={addManualPrice}
                            onChange={(e) => setAddManualPrice(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                            inputMode="decimal"
                            placeholder="0,00"
                          />
                        </>
                      ) : null}
                      <label className="mt-2 block text-[10px] font-semibold text-zinc-500">Cantidad</label>
                      <input
                        value={addQty}
                        onChange={(e) => setAddQty(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                        inputMode="decimal"
                      />
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void handleAddLine(recipe.id)}
                        className="mt-3 w-full rounded-lg bg-[#D32F2F] py-2 text-sm font-bold text-white disabled:opacity-60"
                      >
                        Añadir a la receta
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
          })}
        </div>
      )}
    </div>
  );
}
