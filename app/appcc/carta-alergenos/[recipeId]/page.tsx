'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCcw, ShieldAlert, Trash2 } from 'lucide-react';
import AppccCompactHero from '@/components/AppccCompactHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  addManualRecipeAllergen,
  confirmRecipeAllergens,
  excludeRecipeAllergen,
  fetchAllergensMaster,
  fetchRecipeAllergenReviewLog,
  fetchRecipeAllergens,
  fetchRecipeAllergenSources,
  refreshRecipeAllergens,
  restoreRecipeAllergen,
  type AllergenMasterRow,
  type AllergenPresenceType,
  type RecipeAllergenReviewLogRow,
  type RecipeAllergenRow,
  type RecipeAllergenSourceRow,
} from '@/lib/appcc-allergens-supabase';
import { AllergenChip, PresenceBadge, ReviewStatusBadge } from '@/components/appcc/AllergenUi';

type RecipeLite = {
  id: string;
  local_id: string;
  name: string;
  allergens_review_status: 'reviewed' | 'pending_review' | 'stale' | 'incomplete';
  allergens_reviewed_at: string | null;
};

export default function AppccCartaAlergenosDetailPage({ params }: { params: Promise<{ recipeId: string }> }) {
  const { localId, profileReady, profileRole } = useAuth();
  const supabaseReady = isSupabaseEnabled() && !!getSupabaseClient();

  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<RecipeLite | null>(null);
  const [master, setMaster] = useState<AllergenMasterRow[]>([]);
  const [rows, setRows] = useState<RecipeAllergenRow[]>([]);
  const [sources, setSources] = useState<RecipeAllergenSourceRow[]>([]);
  const [logRows, setLogRows] = useState<RecipeAllergenReviewLogRow[]>([]);
  const [selectedAllergen, setSelectedAllergen] = useState<string>('');
  const [presenceType, setPresenceType] = useState<AllergenPresenceType>('contains');
  const [excludeReason, setExcludeReason] = useState('');
  const [forceReview, setForceReview] = useState(false);
  const [missingProducts, setMissingProducts] = useState<Array<{ line: string; product: string }>>([]);

  useEffect(() => {
    void params.then((p) => setRecipeId(p.recipeId));
  }, [params]);

  const load = useCallback(async () => {
    if (!recipeId || !localId || !supabaseReady) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setBanner(null);
    const supabase = getSupabaseClient()!;
    try {
      await refreshRecipeAllergens(supabase, recipeId);
      const [recipeRes, m, r, s, logs, linesRes, processedRes, productsRes] = await Promise.all([
        supabase
          .from('escandallo_recipes')
          .select('id,local_id,name,allergens_review_status,allergens_reviewed_at')
          .eq('local_id', localId)
          .eq('id', recipeId)
          .single(),
        fetchAllergensMaster(supabase),
        fetchRecipeAllergens(supabase, localId, recipeId),
        fetchRecipeAllergenSources(supabase, localId, recipeId),
        fetchRecipeAllergenReviewLog(supabase, localId, recipeId),
        supabase
          .from('escandallo_recipe_lines')
          .select('label,source_type,raw_supplier_product_id,processed_product_id')
          .eq('local_id', localId)
          .eq('recipe_id', recipeId),
        supabase
          .from('escandallo_processed_products')
          .select('id,source_supplier_product_id')
          .eq('local_id', localId),
        supabase.from('product_allergens').select('product_id').eq('local_id', localId),
      ]);
      if (recipeRes.error) throw new Error(recipeRes.error.message);
      if (linesRes.error) throw new Error(linesRes.error.message);
      if (processedRes.error) throw new Error(processedRes.error.message);
      if (productsRes.error) throw new Error(productsRes.error.message);

      const productWithSheet = new Set((productsRes.data ?? []).map((x: { product_id: string }) => x.product_id));
      const processedMap = new Map<string, string>(
        (processedRes.data ?? []).map((p: { id: string; source_supplier_product_id: string }) => [p.id, p.source_supplier_product_id]),
      );
      const miss: Array<{ line: string; product: string }> = [];
      for (const line of (linesRes.data ?? []) as Array<{
        label: string;
        source_type: string;
        raw_supplier_product_id: string | null;
        processed_product_id: string | null;
      }>) {
        if (line.source_type === 'raw' && line.raw_supplier_product_id && !productWithSheet.has(line.raw_supplier_product_id)) {
          miss.push({ line: line.label, product: line.raw_supplier_product_id });
        }
        if (line.source_type === 'processed' && line.processed_product_id) {
          const baseProduct = processedMap.get(line.processed_product_id);
          if (baseProduct && !productWithSheet.has(baseProduct)) miss.push({ line: line.label, product: baseProduct });
        }
      }

      setRecipe(recipeRes.data as RecipeLite);
      setMaster(m);
      setRows(r);
      setSources(s);
      setLogRows(logs);
      setMissingProducts(miss);
      if (m.length > 0) setSelectedAllergen((prev) => prev || m[0].id);
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudo cargar el detalle.');
    } finally {
      setLoading(false);
    }
  }, [recipeId, localId, supabaseReady]);

  useEffect(() => {
    if (!profileReady) return;
    if (profileRole === 'manager') {
      setLoading(false);
      return;
    }
    void load();
  }, [profileReady, profileRole, load]);

  const groupedOrigins = useMemo(() => {
    const map = new Map<string, string[]>();
    sources.forEach((s) => {
      if (!map.has(s.allergen_id)) map.set(s.allergen_id, []);
      map.get(s.allergen_id)!.push(s.source_label);
    });
    return map;
  }, [sources]);

  const activeRows = rows.filter((r) => r.status !== 'excluded');
  const excludedRows = rows.filter((r) => r.status === 'excluded');

  const withAction = async (fn: () => Promise<void>) => {
    if (!recipeId || !supabaseReady) return;
    setBusy(true);
    setBanner(null);
    try {
      await fn();
      await load();
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  };

  if (!profileReady || loading) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Cargando revisión de alérgenos…</p>
      </section>
    );
  }

  if (profileRole === 'manager') {
    return (
      <div className="space-y-4 pb-8">
        <AppccCompactHero title="Acceso no autorizado" />
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-100">
          No tienes permiso para revisar ni editar platos. Consulta la matriz general de carta y alérgenos.
        </section>
        <Link
          href="/appcc/carta-alergenos/matriz"
          className="inline-flex text-sm font-bold text-[#D32F2F] underline underline-offset-2"
        >
          Ir a la matriz
        </Link>
      </div>
    );
  }

  if (!recipe || !recipeId || !localId || !supabaseReady) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-semibold text-zinc-900">Receta no disponible</p>
      </section>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <AppccCompactHero title="Detalle de carta y alérgenos" />

      {banner ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-100">
          {banner}
        </div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wide text-zinc-500">Plato</p>
            <h2 className="text-lg font-black text-zinc-900">{recipe.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <ReviewStatusBadge status={recipe.allergens_review_status} />
              <span className="text-xs text-zinc-500">
                Última revisión:{' '}
                {recipe.allergens_reviewed_at
                  ? new Date(recipe.allergens_reviewed_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : 'Sin confirmar'}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void withAction(async () => refreshRecipeAllergens(getSupabaseClient()!, recipeId))}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Recalcular
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void withAction(async () => confirmRecipeAllergens(getSupabaseClient()!, recipeId, forceReview))}
              className="inline-flex items-center gap-1 rounded-lg bg-[#D32F2F] px-3 py-2 text-xs font-bold text-white hover:bg-[#B91C1C] disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Confirmar revisión
            </button>
          </div>
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-zinc-700">
          <input type="checkbox" checked={forceReview} onChange={(e) => setForceReview(e.target.checked)} className="h-4 w-4 rounded border-zinc-300 text-[#D32F2F] focus:ring-[#D32F2F]/20" />
          Permitir confirmación forzada si faltan fichas de ingredientes
        </label>
      </section>

      {missingProducts.length > 0 ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4 ring-1 ring-red-100">
          <p className="inline-flex items-center gap-1 text-sm font-bold text-red-900">
            <ShieldAlert className="h-4 w-4" />
            Ingredientes sin ficha de alérgenos ({missingProducts.length})
          </p>
          <ul className="mt-2 space-y-1 text-xs text-red-900">
            {missingProducts.slice(0, 10).map((m, idx) => (
              <li key={`${m.line}-${idx}`}>• {m.line}</li>
            ))}
          </ul>
          <Link href="/appcc/carta-alergenos/productos" className="mt-2 inline-flex text-xs font-bold text-red-800 underline">
            Completar fichas ahora
          </Link>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100">
        <p className="text-sm font-bold text-zinc-900">Alérgenos activos</p>
        <div className="mt-2 space-y-2">
          {activeRows.length === 0 ? <p className="text-sm text-zinc-500">No hay alérgenos activos detectados.</p> : null}
          {activeRows.map((r) => (
            <div key={r.id} className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2">
                  <span className="text-base">{r.allergen?.icon ?? '•'}</span>
                  <span className="text-sm font-bold text-zinc-900">{r.allergen?.name ?? 'Alérgeno'}</span>
                  <PresenceBadge presence={r.presence_type} />
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-600 ring-1 ring-zinc-200">
                    {r.source_type === 'automatic' ? 'Automático' : 'Manual'}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void withAction(async () =>
                      excludeRecipeAllergen(getSupabaseClient()!, recipeId, r.allergen_id, excludeReason),
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </button>
              </div>
              {r.source_type === 'automatic' ? (
                <p className="mt-2 text-xs text-zinc-600">
                  Origen: {(groupedOrigins.get(r.allergen_id) ?? []).slice(0, 5).join(', ') || 'Sin origen detectado'}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100">
        <p className="text-sm font-bold text-zinc-900">Añadir alérgeno manual</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {master.map((a) => (
            <AllergenChip key={a.id} allergen={a} selected={selectedAllergen === a.id} onClick={() => setSelectedAllergen(a.id)} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={presenceType}
            onChange={(e) => setPresenceType(e.target.value as AllergenPresenceType)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            <option value="contains">Contiene</option>
            <option value="traces">Trazas</option>
            <option value="may_contain">Puede contener</option>
          </select>
          <button
            type="button"
            disabled={busy || !selectedAllergen}
            onClick={() =>
              void withAction(async () =>
                addManualRecipeAllergen(getSupabaseClient()!, recipeId, selectedAllergen, presenceType),
              )
            }
            className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-bold text-white hover:bg-black disabled:opacity-50"
          >
            Añadir manual
          </button>
        </div>
        <div className="mt-3">
          <label className="text-xs font-semibold text-zinc-700">Motivo de exclusión (se aplica al botón Excluir)</label>
          <textarea
            value={excludeReason}
            onChange={(e) => setExcludeReason(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
            placeholder="Ej. ingrediente retirado en mise en place actual"
          />
        </div>
      </section>

      {excludedRows.length > 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100">
          <p className="text-sm font-bold text-zinc-900">Alérgenos excluidos manualmente</p>
          <div className="mt-2 space-y-2">
            {excludedRows.map((r) => (
              <div key={r.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-zinc-900">
                    {r.allergen?.icon} {r.allergen?.name}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void withAction(async () => restoreRecipeAllergen(getSupabaseClient()!, recipeId, r.allergen_id))}
                    className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Restaurar
                  </button>
                </div>
                {r.exclusion_reason ? <p className="mt-1 text-xs text-zinc-600">Motivo: {r.exclusion_reason}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100">
        <p className="text-sm font-bold text-zinc-900">Historial de revisión</p>
        <ul className="mt-2 space-y-2">
          {logRows.length === 0 ? <li className="text-xs text-zinc-500">Sin eventos de revisión.</li> : null}
          {logRows.map((l) => (
            <li key={l.id} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <p className="text-xs font-semibold text-zinc-800">{l.action}</p>
              <p className="text-xs text-zinc-600">{l.note || 'Sin detalle'}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {new Date(l.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
