'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canCocinaCentralOperate } from '@/lib/cocina-central-permissions';
import { validateEscandalloUsageUnitInput, ESCANDALLO_USAGE_UNIT_PRESETS } from '@/lib/escandallo-ingredient-units';
import { prInsertRecipe, prReplaceLines } from '@/lib/production-recipes-supabase';
import { fetchPurchaseArticles, type PurchaseArticle } from '@/lib/purchase-articles-supabase';

const FINAL_UNITS = ['kg', 'l', 'ud', 'bandeja', 'ración', 'g', 'ml', 'porción'] as const;

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
  const [lines, setLines] = useState<LineDraft[]>([]);
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

  const addLine = () => {
    const first = articles[0];
    setLines((prev) => [
      ...prev,
      {
        id: newLineId(),
        articleId: first?.id ?? '',
        quantity: '1',
        unit: first?.unidadUso?.trim() || 'ud',
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
      const rec = await prInsertRecipe(supabase, {
        local_central_id: localId,
        name: n,
        final_unit: fu,
        base_yield_quantity: y,
        base_yield_unit: fu,
        default_expiry_days: exp,
        is_active: true,
        restricted_visibility: true,
        created_by: userId,
      });
      await prReplaceLines(supabase, rec.id, built);
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
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold uppercase text-zinc-500">
            Unidad final
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
            Rendimiento esperado (receta base)
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
              <label className="min-w-0 flex-1 text-xs font-bold uppercase text-zinc-500">
                Artículo
                <select
                  className="mt-1 h-11 w-full rounded-lg border border-zinc-300 text-sm"
                  value={line.articleId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const a = articles.find((x) => x.id === id);
                    setLines((prev) =>
                      prev.map((x) =>
                        x.id === line.id
                          ? { ...x, articleId: id, unit: a?.unidadUso?.trim() || x.unit }
                          : x,
                      ),
                    );
                  }}
                >
                  <option value="">— Elegir —</option>
                  {articles.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </label>
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
