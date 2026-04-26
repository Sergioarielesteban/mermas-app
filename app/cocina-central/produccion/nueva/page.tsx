'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canCocinaCentralOperate } from '@/lib/cocina-central-permissions';
import { prCreateOrderFromInternalRecipe, prListActiveRecipes, type ProductionRecipeRow } from '@/lib/production-recipes-supabase';

function todayMadridYmd(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

export default function NuevaOrdenProduccionPage() {
  const router = useRouter();
  const { localId, userId, profileReady, isCentralKitchen, profileRole } = useAuth();
  const canUse = canCocinaCentralOperate(isCentralKitchen, profileRole);
  const supabase = getSupabaseClient();

  const [recipes, setRecipes] = useState<ProductionRecipeRow[]>([]);
  const [recipeId, setRecipeId] = useState('');
  const [targetQty, setTargetQty] = useState('10');
  const [fecha, setFecha] = useState(todayMadridYmd);
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !localId || !canUse) return;
    setErr(null);
    try {
      const r = await prListActiveRecipes(supabase, localId);
      setRecipes(r);
      setRecipeId((prev) => prev || r[0]?.id || '');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al cargar recetas');
    }
  }, [supabase, localId, canUse]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = recipes.find((r) => r.id === recipeId);

  const submit = async () => {
    if (!supabase || !localId) return;
    setBusy(true);
    setErr(null);
    const tq = Number(String(targetQty).replace(',', '.'));
    if (!recipeId || !Number.isFinite(tq) || tq <= 0) {
      setErr('Selecciona receta y cantidad objetivo válida.');
      setBusy(false);
      return;
    }
    try {
      const orderId = await prCreateOrderFromInternalRecipe(supabase, {
        localCentralId: localId,
        userId,
        productionRecipeId: recipeId,
        targetQuantity: tq,
        fecha,
        notes: notes.trim() || null,
      });
      router.push(`/cocina-central/produccion/${orderId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al crear la orden');
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
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href="/cocina-central/produccion" className="text-sm font-semibold text-[#D32F2F]">
          ← Producción
        </Link>
        <h1 className="mt-2 text-xl font-extrabold text-zinc-900">Nueva orden de producción</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Parte de una fórmula de producción interna (Cocina Central). Los ingredientes se toman de Artículos Máster; al generar
          la orden se sincronizan elaboraciones y costes al vuelo.
        </p>
      </div>
      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}
      <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-zinc-600">
          <Link href="/cocina-central/produccion/recetas" className="font-bold text-[#D32F2F] underline">
            Gestionar fórmulas de producción
          </Link>
        </p>
        <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500">
          Seleccionar fórmula
          <select
            className="mt-1 h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 text-base font-semibold"
            value={recipeId}
            onChange={(e) => setRecipeId(e.target.value)}
          >
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <p className="text-xs text-zinc-600">
            Rendimiento de referencia: {selected.base_yield_quantity} {selected.final_unit} (base: {selected.base_yield_unit}).
          </p>
        ) : null}
        <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500">
          Cantidad objetivo (misma unidad lógica que el rendimiento de la fórmula)
          <input
            type="text"
            inputMode="decimal"
            className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-base font-semibold"
            value={targetQty}
            onChange={(e) => setTargetQty(e.target.value)}
            placeholder="10"
          />
        </label>
        <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500">
          Fecha de producción
          <input
            type="date"
            className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-base font-semibold"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </label>
        <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500">
          Observaciones (opcional)
          <textarea
            className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="h-12 w-full rounded-xl bg-[#D32F2F] text-sm font-extrabold text-white disabled:opacity-50"
        >
          Generar orden de producción
        </button>
      </div>
    </div>
  );
}
