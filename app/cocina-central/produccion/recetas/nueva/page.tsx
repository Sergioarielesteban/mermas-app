'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canCocinaCentralOperate } from '@/lib/cocina-central-permissions';
import { validateEscandalloUsageUnitInput, ESCANDALLO_USAGE_UNIT_PRESETS } from '@/lib/escandallo-ingredient-units';
import MasterArticleSearchInput from '@/components/cocina-central/MasterArticleSearchInput';
import { suggestLotCodePrefixFromName } from '@/lib/cocina-central-production-meta';
import {
  filterArticlesForInternalRecipeIngredients,
  syncPurchaseArticleFromProductionRecipe,
} from '@/lib/cocina-central-master-article-sync';
import {
  prInsertRecipe,
  prReplaceLines,
  type ProductionRecipeCategory,
} from '@/lib/production-recipes-supabase';
import { fetchPurchaseArticles, type PurchaseArticle } from '@/lib/purchase-articles-supabase';

const FINAL_UNITS = ['kg', 'l', 'ud', 'bandeja', 'ración', 'g', 'ml', 'porción', 'bolsa', 'bolsas'] as const;

const RECIPE_CATEGORIES: { id: ProductionRecipeCategory; label: string }[] = [
  { id: 'salsa', label: 'Salsa' },
  { id: 'base', label: 'Base' },
  { id: 'elaborado', label: 'Elaborado' },
  { id: 'postre', label: 'Postre' },
  { id: 'otro', label: 'Otro' },
];

type LineDraft = { id: string; articleId: string; quantity: string; unit: string };

function newLineId() {
  return `tmp-${Math.random().toString(36).slice(2)}`;
}

export default function NuevaFormulaProduccionPage() {
  const router = useRouter();
  const { localId, userId, profileReady, isCentralKitchen, profileRole } = useAuth();
  const canUse = canCocinaCentralOperate(isCentralKitchen, profileRole);
  const supabase = getSupabaseClient();

  const [articles, setArticles] = useState<PurchaseArticle[]>([]);
  const [name, setName] = useState('');
  const [finalUnit, setFinalUnit] = useState<string>('kg');
  const [baseYield, setBaseYield] = useState('1');
  const [expiryDays, setExpiryDays] = useState('');
  const [lotCodePrefix, setLotCodePrefix] = useState('');
  const [weightKgPerBase, setWeightKgPerBase] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [recipeCategory, setRecipeCategory] = useState<ProductionRecipeCategory>('otro');
  const [operativeFormat, setOperativeFormat] = useState('');
  const [procedureNotes, setProcedureNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadArticles = useCallback(async () => {
    if (!supabase || !localId || !canUse) return;
    try {
      const list = await fetchPurchaseArticles(supabase, localId);
      setArticles(list.filter((a) => a.activo));
    } catch {
      setArticles([]);
    }
  }, [supabase, localId, canUse]);

  useEffect(() => {
    void loadArticles();
  }, [loadArticles]);

  const ingredientArticles = useMemo(() => filterArticlesForInternalRecipeIngredients(articles), [articles]);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: newLineId(),
        articleId: '',
        quantity: '1',
        unit: 'ud',
      },
    ]);
  };

  const save = async () => {
    if (!supabase || !localId) return;
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
      setErr('Añade al menos un ingrediente desde Artículos Máster.');
      setBusy(false);
      return;
    }
    const built: Array<{
      line_kind: 'articulo_master';
      article_id: string;
      ingredient_name_snapshot: string;
      quantity: number;
      unit: string;
      sort_order: number;
    }> = [];
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i]!;
      if (!L.articleId) {
        setErr('Selecciona un artículo en todas las filas.');
        setBusy(false);
        return;
      }
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
      const art = articles.find((a) => a.id === L.articleId);
      if (art?.origenArticulo === 'cocina_central') {
        setErr('No puedes usar como ingrediente un producto elaborado en Cocina Central (solo materias de Artículos Máster de proveedor).');
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
      const rec = await prInsertRecipe(supabase, {
        local_central_id: localId,
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
        is_active: true,
        restricted_visibility: true,
        created_by: userId,
      });
      await prReplaceLines(supabase, rec.id, built);
      try {
        await syncPurchaseArticleFromProductionRecipe(supabase, localId, rec.id);
      } catch (syncE) {
        setErr(
          syncE instanceof Error
            ? `Fórmula creada, pero no se publicó en Artículos Máster: ${syncE.message}`
            : 'Fórmula creada, pero falló la sincronización con Artículos Máster.',
        );
      }
      router.replace(`/cocina-central/produccion/recetas/${rec.id}`);
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/cocina-central/produccion/recetas" className="text-sm font-semibold text-[#D32F2F]">
          ← Fórmulas
        </Link>
        <h1 className="mt-2 text-xl font-extrabold text-zinc-900">Nueva fórmula de producción</h1>
      </div>
      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}

      <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <label className="block text-xs font-bold uppercase text-zinc-500">
          Nombre de la elaboración
          <input
            className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-base font-semibold"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Salsa brava"
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
            placeholder="Ej. bolsa 4 kg, cubo 10 L"
          />
        </label>
        <label className="block text-xs font-bold uppercase text-zinc-500">
          Procedimiento (privado; solo Cocina Central)
          <textarea
            className="mt-1 min-h-[88px] w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
            value={procedureNotes}
            onChange={(e) => setProcedureNotes(e.target.value)}
            placeholder="Pasos de elaboración…"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold uppercase text-zinc-500">
            Unidad final (de envasado / conteo)
            <select
              className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-sm font-semibold"
              value={finalUnit}
              onChange={(e) => setFinalUnit(e.target.value)}
            >
              {FINAL_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold uppercase text-zinc-500">
            Rendimiento base (cantidad de esa unidad para la receta base)
            <input
              type="text"
              inputMode="decimal"
              className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-base font-semibold"
              value={baseYield}
              onChange={(e) => setBaseYield(e.target.value)}
              placeholder="Ej. 1"
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
              placeholder="Ej. 4 (1 bolsa = 4 kg)"
            />
          </label>
          <label className="block text-xs font-bold uppercase text-zinc-500">
            Prefijo código de lote (opcional)
            <input
              className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 font-mono text-sm font-semibold uppercase"
              value={lotCodePrefix}
              onChange={(e) => setLotCodePrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="Vacío = sugerido del nombre"
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
            placeholder="Ej. 3"
          />
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-zinc-900">Ingredientes (Artículos Máster)</h2>
          <button
            type="button"
            onClick={() => addLine()}
            className="text-xs font-bold text-[#D32F2F] underline"
          >
            Añadir fila
          </button>
        </div>
        {articles.length === 0 ? (
          <p className="text-sm text-zinc-500">No hay artículos máster en este local. Créalos en Pedidos → Artículos.</p>
        ) : ingredientArticles.length === 0 ? (
          <p className="text-sm text-amber-900">
            No hay artículos de proveedor disponibles como ingredientes (los elaborados en Cocina Central no pueden usarse
            dentro de otra fórmula).
          </p>
        ) : null}
        <datalist id="cc-prod-units">
          {ESCANDALLO_USAGE_UNIT_PRESETS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <div className="space-y-3">
          {lines.map((line) => (
            <div
              key={line.id}
              className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 sm:flex-row sm:items-end sm:flex-wrap"
            >
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold uppercase text-zinc-500">Artículo</span>
                <MasterArticleSearchInput
                  className="mt-1"
                  articles={ingredientArticles}
                  value={line.articleId}
                  onSelect={(a) =>
                    setLines((prev) =>
                      prev.map((x) =>
                        x.id === line.id
                          ? { ...x, articleId: a.id, unit: a.unidadUso?.trim() || x.unit }
                          : x,
                      ),
                    )
                  }
                  onClear={() =>
                    setLines((prev) => prev.map((x) => (x.id === line.id ? { ...x, articleId: '' } : x)))
                  }
                  disabled={ingredientArticles.length === 0}
                />
              </div>
              <label className="w-full text-xs font-bold uppercase text-zinc-500 sm:w-24">
                Cant.
                <input
                  type="text"
                  inputMode="decimal"
                  className="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-2 text-sm"
                  value={line.quantity}
                  onChange={(e) =>
                    setLines((prev) => prev.map((x) => (x.id === line.id ? { ...x, quantity: e.target.value } : x)))
                  }
                />
              </label>
              <label className="w-full text-xs font-bold uppercase text-zinc-500 sm:w-32">
                Unidad
                <input
                  className="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-2 text-sm"
                  value={line.unit}
                  onChange={(e) =>
                    setLines((prev) => prev.map((x) => (x.id === line.id ? { ...x, unit: e.target.value } : x)))
                  }
                  list="cc-prod-units"
                />
              </label>
              <button
                type="button"
                className="h-11 shrink-0 text-sm font-bold text-red-800 sm:mb-0.5"
                onClick={() => setLines((prev) => prev.filter((x) => x.id !== line.id))}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="h-12 w-full rounded-xl bg-[#D32F2F] text-sm font-extrabold text-white disabled:opacity-50"
      >
        Guardar fórmula
      </button>
    </div>
  );
}
