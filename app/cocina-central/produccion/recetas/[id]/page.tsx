'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canCocinaCentralOperate } from '@/lib/cocina-central-permissions';
import { validateEscandalloUsageUnitInput, ESCANDALLO_USAGE_UNIT_PRESETS } from '@/lib/escandallo-ingredient-units';
import {
  prGetRecipe,
  prGetRecipeLines,
  prReplaceLines,
  prUpdateRecipe,
  type ProductionRecipeLineRow,
  type ProductionRecipeRow,
} from '@/lib/production-recipes-supabase';
import MasterArticleSearchInput from '@/components/cocina-central/MasterArticleSearchInput';
import { fetchPurchaseArticles, type PurchaseArticle } from '@/lib/purchase-articles-supabase';

const FINAL_UNITS = ['kg', 'l', 'ud', 'bandeja', 'ración', 'g', 'ml', 'porción'] as const;

type LineDraft = { key: string; lineId: string | null; articleId: string; quantity: string; unit: string };

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
  const [isActive, setIsActive] = useState(true);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const mapLines = useCallback((lr: ProductionRecipeLineRow[]): LineDraft[] =>
    lr.map((l) => ({
      key: l.id,
      lineId: l.id,
      articleId: l.article_id,
      quantity: String(l.quantity),
      unit: l.unit,
    })), []);

  const load = useCallback(async () => {
    if (!supabase || !localId || !recipeId || !canUse) return;
    setLoadErr(null);
    try {
      const [r, list, art] = await Promise.all([
        prGetRecipe(supabase, recipeId, localId),
        prGetRecipeLines(supabase, recipeId),
        fetchPurchaseArticles(supabase, localId),
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
      setIsActive(r.is_active);
      setArticles(art.filter((a) => a.activo));
      setLines(mapLines(list));
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'Error al cargar');
    }
  }, [supabase, localId, recipeId, canUse, mapLines]);

  useEffect(() => {
    void load();
  }, [load]);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        lineId: null,
        articleId: '',
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
    const built: Array<{
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
      built.push({
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
    try {
      await prUpdateRecipe(supabase, recipe.id, localId, {
        name: n,
        final_unit: fu,
        base_yield_quantity: y,
        base_yield_unit: fu,
        default_expiry_days: exp,
        is_active: isActive,
      });
      await prReplaceLines(supabase, recipe.id, built);
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
        <Link href="/cocina-central/produccion/recetas" className="text-sm font-semibold text-[#D32F2F]">
          ← Fórmulas
        </Link>
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
            Rendimiento base
            <input
              type="text"
              inputMode="decimal"
              className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-base font-semibold"
              value={baseYield}
              onChange={(e) => setBaseYield(e.target.value)}
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
          <h2 className="text-sm font-extrabold text-zinc-900">Ingredientes (Artículos Máster)</h2>
          <button type="button" onClick={() => addLine()} className="text-xs font-bold text-[#D32F2F] underline">
            Añadir fila
          </button>
        </div>
        <datalist id="cc-prod-units-edit">
          {ESCANDALLO_USAGE_UNIT_PRESETS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <div className="space-y-3">
          {lines.map((line) => (
            <div
              key={line.key}
              className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 sm:flex-row sm:items-end sm:flex-wrap"
            >
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold uppercase text-zinc-500">Artículo</span>
                <MasterArticleSearchInput
                  className="mt-1"
                  articles={articles}
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
                  disabled={articles.length === 0}
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
                    setLines((prev) => prev.map((x) => (x.key === line.key ? { ...x, quantity: e.target.value } : x)))
                  }
                />
              </label>
              <label className="w-full text-xs font-bold uppercase text-zinc-500 sm:w-32">
                Unidad
                <input
                  className="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-2 text-sm"
                  value={line.unit}
                  onChange={(e) =>
                    setLines((prev) => prev.map((x) => (x.key === line.key ? { ...x, unit: e.target.value } : x)))
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
