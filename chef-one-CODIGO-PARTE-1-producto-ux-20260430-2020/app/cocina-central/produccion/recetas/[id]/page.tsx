'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canCocinaCentralOperate } from '@/lib/cocina-central-permissions';
import { validateEscandalloUsageUnitInput, ESCANDALLO_USAGE_UNIT_PRESETS } from '@/lib/escandallo-ingredient-units';
import { suggestLotCodePrefixFromName } from '@/lib/cocina-central-production-meta';
import {
  prGetRecipe,
  prGetRecipeLines,
  prListAllRecipes,
  prReplaceLines,
  prUpdateRecipe,
  type ProductionRecipeCategory,
  type ProductionRecipeLineRow,
  type ProductionRecipeRow,
} from '@/lib/production-recipes-supabase';
import MasterArticleSearchInput from '@/components/cocina-central/MasterArticleSearchInput';
import {
  filterArticlesForInternalRecipeIngredients,
  syncPurchaseArticleFromProductionRecipe,
} from '@/lib/cocina-central-master-article-sync';
import { fetchPurchaseArticles, type PurchaseArticle } from '@/lib/purchase-articles-supabase';

const FINAL_UNITS = ['kg', 'l', 'ud', 'bandeja', 'ración', 'g', 'ml', 'porción', 'bolsa', 'bolsas'] as const;

const RECIPE_CATEGORIES: { id: ProductionRecipeCategory; label: string }[] = [
  { id: 'salsa', label: 'Salsa' },
  { id: 'base', label: 'Base' },
  { id: 'elaborado', label: 'Elaborado' },
  { id: 'postre', label: 'Postre' },
  { id: 'otro', label: 'Otro' },
];

type LineKindLocal = 'articulo_master' | 'receta_cc_interna' | 'manual';

type LineDraft = {
  key: string;
  lineId: string | null;
  lineKind: LineKindLocal;
  articleId: string;
  nestedRecipeId: string;
  manualUnitCost: string;
  quantity: string;
  unit: string;
};

function newKey() {
  return `k-${Math.random().toString(36).slice(2)}`;
}

export default function EditarFormulaProduccionPage() {
  const params = useParams();
  const recipeId = String(params.id ?? '');
  const router = useRouter();
  const { localId, profileReady, isCentralKitchen, profileRole } = useAuth();
  const canUse = canCocinaCentralOperate(isCentralKitchen, profileRole);
  const supabase = getSupabaseClient();

  const [recipe, setRecipe] = useState<ProductionRecipeRow | null>(null);
  const [articles, setArticles] = useState<PurchaseArticle[]>([]);
  const [name, setName] = useState('');
  const [finalUnit, setFinalUnit] = useState<string>('kg');
  const [baseYield, setBaseYield] = useState('1');
  const [expiryDays, setExpiryDays] = useState('');
  const [lotCodePrefix, setLotCodePrefix] = useState('');
  const [weightKgPerBase, setWeightKgPerBase] = useState('');
  const [recipeCategory, setRecipeCategory] = useState<ProductionRecipeCategory>('otro');
  const [operativeFormat, setOperativeFormat] = useState('');
  const [procedureNotes, setProcedureNotes] = useState('');
  const [ccRecipesAll, setCcRecipesAll] = useState<ProductionRecipeRow[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const mapLines = useCallback((lr: ProductionRecipeLineRow[]): LineDraft[] =>
    lr.map((l) => {
      const lk = (l.line_kind ?? 'articulo_master') as LineKindLocal;
      return {
        key: l.id,
        lineId: l.id,
        lineKind: lk,
        articleId: l.article_id ?? '',
        nestedRecipeId: l.nested_production_recipe_id ?? '',
        manualUnitCost: l.manual_unit_cost_eur != null ? String(l.manual_unit_cost_eur) : '',
        quantity: String(l.quantity),
        unit: l.unit,
      };
    }), []);

  const load = useCallback(async () => {
    if (!supabase || !localId || !recipeId || !canUse) return;
    setLoadErr(null);
    try {
      const [r, list, art, allCc] = await Promise.all([
        prGetRecipe(supabase, recipeId, localId),
        prGetRecipeLines(supabase, recipeId),
        fetchPurchaseArticles(supabase, localId),
        prListAllRecipes(supabase, localId),
      ]);
      if (!r) {
        setRecipe(null);
        return;
      }
      setRecipe(r);
      setName(r.name);
      setFinalUnit(r.final_unit);
      setBaseYield(String(r.base_yield_quantity));
      setExpiryDays(r.default_expiry_days != null ? String(r.default_expiry_days) : '');
      setLotCodePrefix(r.lot_code_prefix?.trim() ?? '');
      setWeightKgPerBase(
        r.weight_kg_per_base_yield != null && Number.isFinite(r.weight_kg_per_base_yield)
          ? String(r.weight_kg_per_base_yield)
          : '',
      );
      setIsActive(r.is_active);
      setRecipeCategory((r.recipe_category as ProductionRecipeCategory) ?? 'otro');
      setOperativeFormat(r.operative_format_label?.trim() ?? '');
      setProcedureNotes(r.procedure_notes?.trim() ?? '');
      setCcRecipesAll(allCc);
      setArticles(art.filter((a) => a.activo));
      setLines(mapLines(list));
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'Error al cargar');
    }
  }, [supabase, localId, recipeId, canUse, mapLines]);

  useEffect(() => {
    void load();
  }, [load]);

  const ingredientArticles = useMemo(() => filterArticlesForInternalRecipeIngredients(articles), [articles]);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        lineId: null,
        lineKind: 'articulo_master',
        articleId: '',
        nestedRecipeId: '',
        manualUnitCost: '',
        quantity: '1',
        unit: 'ud',
      },
    ]);
  };

  const save = async () => {
    if (!supabase || !localId || !recipe) return;
    setBusy(true);
    setErr(null);
    const n = name.trim();
    if (!n) {
      setErr('Indica un nombre de elaboración.');
      setBusy(false);
      return;
    }
    const y = Number(String(baseYield).replace(',', '.'));
    if (!Number.isFinite(y) || y <= 0) {
      setErr('Rendimiento base inválido.');
      setBusy(false);
      return;
    }
    if (lines.length === 0) {
      setErr('Añade al menos un ingrediente.');
      setBusy(false);
      return;
    }
    const built: Parameters<typeof prReplaceLines>[2] = [];
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i]!;
      const q = Number(String(L.quantity).replace(',', '.'));
      if (!Number.isFinite(q) || q <= 0) {
        setErr('Cantidad inválida en ingredientes.');
        setBusy(false);
        return;
      }
      const uErr = validateEscandalloUsageUnitInput(L.unit);
      if (uErr) {
        setErr(uErr);
        setBusy(false);
        return;
      }
      if (L.lineKind === 'articulo_master') {
        if (!L.articleId) {
          setErr('Selecciona un artículo máster en cada línea de tipo «Artículo máster».');
          setBusy(false);
          return;
        }
        const art = articles.find((a) => a.id === L.articleId);
        if (art?.origenArticulo === 'cocina_central') {
          setErr(
            'No puedes usar como ingrediente un producto elaborado en Cocina Central (usa una línea «Receta CC» si necesitas otra elaboración).',
          );
          setBusy(false);
          return;
        }
        built.push({
          line_kind: 'articulo_master',
          article_id: L.articleId,
          ingredient_name_snapshot: art?.nombre?.trim() || 'Artículo',
          quantity: q,
          unit: L.unit.trim(),
          sort_order: i,
        });
      } else if (L.lineKind === 'receta_cc_interna') {
        if (!L.nestedRecipeId) {
          setErr('Selecciona la receta interna enlazada.');
          setBusy(false);
          return;
        }
        if (L.nestedRecipeId === recipe.id) {
          setErr('Una receta no puede referenciarse a sí misma.');
          setBusy(false);
          return;
        }
        const nested = ccRecipesAll.find((x) => x.id === L.nestedRecipeId);
        built.push({
          line_kind: 'receta_cc_interna',
          nested_production_recipe_id: L.nestedRecipeId,
          ingredient_name_snapshot: nested?.name?.trim() || 'Receta Cocina Central',
          quantity: q,
          unit: L.unit.trim(),
          sort_order: i,
        });
      } else {
        const mu = Number(String(L.manualUnitCost).replace(',', '.'));
        if (!Number.isFinite(mu) || mu <= 0) {
          setErr('En líneas manuales indica un coste €/ud válido.');
          setBusy(false);
          return;
        }
        built.push({
          line_kind: 'manual',
          ingredient_name_snapshot: 'Manual excepcional',
          quantity: q,
          unit: L.unit.trim(),
          manual_unit_cost_eur: mu,
          sort_order: i,
        });
      }
    }
    const exp = expiryDays.trim() ? Number(expiryDays) : null;
    if (exp != null && (!Number.isFinite(exp) || exp < 0)) {
      setErr('Días de caducidad no válidos.');
      setBusy(false);
      return;
    }
    const fu = finalUnit.trim();
    if (!fu) {
      setErr('Indica unidad final.');
      setBusy(false);
      return;
    }
    const wkg = weightKgPerBase.trim() ? Number(String(weightKgPerBase).replace(',', '.')) : null;
    if (wkg != null && (!Number.isFinite(wkg) || wkg <= 0)) {
      setErr('Peso por rendimiento base no válido.');
      setBusy(false);
      return;
    }
    const prefix = lotCodePrefix.trim() || suggestLotCodePrefixFromName(n);
    try {
      await prUpdateRecipe(supabase, recipe.id, localId, {
        name: n,
        recipe_category: recipeCategory,
        operative_format_label: operativeFormat.trim() ? operativeFormat.trim() : null,
        procedure_notes: procedureNotes.trim() ? procedureNotes.trim() : null,
        final_unit: fu,
        base_yield_quantity: y,
        base_yield_unit: fu,
        weight_kg_per_base_yield: wkg,
        lot_code_prefix: prefix,
        default_expiry_days: exp,
        is_active: isActive,
      });
      await prReplaceLines(supabase, recipe.id, built);
      try {
        await syncPurchaseArticleFromProductionRecipe(supabase, localId, recipe.id);
      } catch (syncE) {
        setErr(
          syncE instanceof Error
            ? `Cambios guardados, pero no se actualizó Artículos Máster: ${syncE.message}`
            : 'Cambios guardados, pero falló la sincronización con Artículos Máster.',
        );
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setBusy(false);
    }
  };

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!isSupabaseEnabled() || !supabase) {
    return <p className="text-sm text-amber-800">Supabase no disponible.</p>;
  }
  if (!localId) return <p className="text-sm text-zinc-500">Sin local en el perfil.</p>;
  if (!canUse) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        Solo cocina central puede usar esta pantalla.
      </div>
    );
  }
  if (loadErr) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-800">{loadErr}</p>
        <Link href="/cocina-central/produccion/recetas" className="text-sm font-bold text-[#D32F2F]">
          Volver
        </Link>
      </div>
    );
  }
  if (!recipe) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-zinc-600">Fórmula no encontrada.</p>
        <Link href="/cocina-central/produccion/recetas" className="text-sm font-bold text-[#D32F2F]">
          Volver
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="flex flex-wrap gap-3 text-sm font-semibold text-[#D32F2F]">
          <Link href="/cocina-central/recetario">← Recetario Central</Link>
          <Link href="/cocina-central/produccion/recetas">Lista fórmulas</Link>
        </div>
        <h1 className="mt-2 text-xl font-extrabold text-zinc-900">Fórmula de producción</h1>
        {recipe.restricted_visibility ? (
          <p className="mt-1 text-xs text-zinc-500">Visibilidad restringida (solo Cocina Central).</p>
        ) : null}
      </div>
      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}

      <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <label className="block text-xs font-bold uppercase text-zinc-500">
          Nombre
          <input
            className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-base font-semibold"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-xs font-bold uppercase text-zinc-500">
          Categoría (Recetario Central)
          <select
            className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-sm font-semibold"
            value={recipeCategory}
            onChange={(e) => setRecipeCategory(e.target.value as ProductionRecipeCategory)}
          >
            {RECIPE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-bold uppercase text-zinc-500">
          Formato operativo (opcional)
          <input
            className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-sm font-semibold"
            value={operativeFormat}
            onChange={(e) => setOperativeFormat(e.target.value)}
            placeholder="Ej. bolsa 4 kg"
          />
        </label>
        <label className="block text-xs font-bold uppercase text-zinc-500">
          Procedimiento (privado; solo Cocina Central)
          <textarea
            className="mt-1 min-h-[88px] w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
            value={procedureNotes}
            onChange={(e) => setProcedureNotes(e.target.value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold uppercase text-zinc-500">
            Unidad final
            <select
              className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-sm font-semibold"
              value={finalUnit}
              onChange={(e) => setFinalUnit(e.target.value)}
            >
              {finalUnit && !FINAL_UNITS.includes(finalUnit as (typeof FINAL_UNITS)[number]) ? (
                <option value={finalUnit}>{finalUnit}</option>
              ) : null}
              {FINAL_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold uppercase text-zinc-500">
            Rendimiento base (receta base)
            <input
              type="text"
              inputMode="decimal"
              className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-base font-semibold"
              value={baseYield}
              onChange={(e) => setBaseYield(e.target.value)}
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold uppercase text-zinc-500">
            Peso salida (kg) para ese rendimiento base
            <input
              type="text"
              inputMode="decimal"
              className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-base font-semibold"
              value={weightKgPerBase}
              onChange={(e) => setWeightKgPerBase(e.target.value)}
              placeholder="Ej. 4"
            />
          </label>
          <label className="block text-xs font-bold uppercase text-zinc-500">
            Prefijo código de lote (opcional)
            <input
              className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 font-mono text-sm font-semibold uppercase"
              value={lotCodePrefix}
              onChange={(e) => setLotCodePrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              maxLength={8}
            />
          </label>
        </div>
        <label className="block text-xs font-bold uppercase text-zinc-500">
          Días de caducidad por defecto (opcional)
          <input
            type="text"
            inputMode="numeric"
            className="mt-1 h-12 w-full max-w-xs rounded-xl border border-zinc-300 px-3 text-base font-semibold"
            value={expiryDays}
            onChange={(e) => setExpiryDays(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Activa (visible en el selector de nuevas órdenes)
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-zinc-900">Ingredientes de la receta</h2>
          <button type="button" onClick={() => addLine()} className="text-xs font-bold text-[#D32F2F] underline">
            Añadir fila
          </button>
        </div>
        <p className="text-xs text-zinc-600">
          Distinto del Escandallo: aquí usa «Artículo máster» (proveedor), «Receta CC» (otra elaboración interna) o
          «Manual» para costes excepcionales.
        </p>
        <datalist id="cc-prod-units-edit">
          {ESCANDALLO_USAGE_UNIT_PRESETS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <div className="space-y-3">
          {lines.map((line) => (
            <div key={line.key} className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3">
              <label className="block w-full text-xs font-bold uppercase text-zinc-500">
                Tipo de línea
                <select
                  className="mt-1 h-11 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm font-semibold"
                  value={line.lineKind}
                  onChange={(e) => {
                    const v = e.target.value as LineKindLocal;
                    setLines((prev) =>
                      prev.map((x) =>
                        x.key === line.key
                          ? {
                              ...x,
                              lineKind: v,
                              articleId: v === 'articulo_master' ? x.articleId : '',
                              nestedRecipeId: v === 'receta_cc_interna' ? x.nestedRecipeId : '',
                              manualUnitCost: v === 'manual' ? x.manualUnitCost : '',
                            }
                          : x,
                      ),
                    );
                  }}
                >
                  <option value="articulo_master">Artículo máster</option>
                  <option value="receta_cc_interna">Receta Cocina Central (subreceta interna)</option>
                  <option value="manual">Manual (€/ud excepcional)</option>
                </select>
              </label>
              {line.lineKind === 'articulo_master' ? (
                <div className="min-w-0">
                  <span className="text-xs font-bold uppercase text-zinc-500">Artículo</span>
                  <MasterArticleSearchInput
                    className="mt-1"
                    articles={ingredientArticles}
                    value={line.articleId}
                    onSelect={(a) =>
                      setLines((prev) =>
                        prev.map((x) =>
                          x.key === line.key
                            ? { ...x, articleId: a.id, unit: a.unidadUso?.trim() || x.unit }
                            : x,
                        ),
                      )
                    }
                    onClear={() =>
                      setLines((prev) => prev.map((x) => (x.key === line.key ? { ...x, articleId: '' } : x)))
                    }
                    disabled={ingredientArticles.length === 0}
                  />
                </div>
              ) : null}
              {line.lineKind === 'receta_cc_interna' ? (
                <label className="block w-full text-xs font-bold uppercase text-zinc-500">
                  Receta interna (no es Escandallo)
                  <select
                    className="mt-1 h-11 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm font-semibold"
                    value={line.nestedRecipeId}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((x) =>
                          x.key === line.key ? { ...x, nestedRecipeId: e.target.value } : x,
                        ),
                      )
                    }
                  >
                    <option value="">— Elegir —</option>
                    {ccRecipesAll
                      .filter((r) => r.id !== recipe.id)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
              {line.lineKind === 'manual' ? (
                <label className="block w-full text-xs font-bold uppercase text-zinc-500">
                  Coste € por unidad de línea
                  <input
                    type="text"
                    inputMode="decimal"
                    className="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-2 text-sm"
                    value={line.manualUnitCost}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((x) =>
                          x.key === line.key ? { ...x, manualUnitCost: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
              ) : null}
              <div className="flex flex-wrap gap-2 sm:flex-row sm:items-end">
                <label className="w-full text-xs font-bold uppercase text-zinc-500 sm:w-24">
                  Cant.
                  <input
                    type="text"
                    inputMode="decimal"
                    className="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-2 text-sm"
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((x) => (x.key === line.key ? { ...x, quantity: e.target.value } : x)),
                      )
                    }
                  />
                </label>
                <label className="w-full text-xs font-bold uppercase text-zinc-500 sm:w-32">
                  Unidad
                  <input
                    className="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-2 text-sm"
                    value={line.unit}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((x) => (x.key === line.key ? { ...x, unit: e.target.value } : x)),
                      )
                    }
                    list="cc-prod-units-edit"
                  />
                </label>
                <button
                  type="button"
                  className="h-11 shrink-0 text-sm font-bold text-red-800 sm:mb-0.5"
                  onClick={() => setLines((prev) => prev.filter((x) => x.key !== line.key))}
                >
                  Quitar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="h-12 flex-1 rounded-xl bg-[#D32F2F] text-sm font-extrabold text-white disabled:opacity-50"
        >
          Guardar cambios
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => router.push('/cocina-central/produccion/nueva')}
          className="h-12 flex-1 rounded-xl border border-zinc-300 bg-white text-sm font-bold text-zinc-800"
        >
          Usar en orden
        </button>
      </div>
    </div>
  );
}
