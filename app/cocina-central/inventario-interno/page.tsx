'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canCocinaCentralOperate } from '@/lib/cocina-central-permissions';
import type {
  CentralInventoryProductRow,
  CentralInventoryUnidadBase,
} from '@/lib/cocina-central-catalog-supabase';
import {
  ccDeleteInventoryProduct,
  ccInsertInventoryProduct,
  ccListInventoryProducts,
  ccUpdateInventoryProduct,
} from '@/lib/cocina-central-catalog-supabase';

const UNIDADES: { value: CentralInventoryUnidadBase; label: string }[] = [
  { value: 'kg', label: 'kg' },
  { value: 'litros', label: 'Litros' },
  { value: 'unidades', label: 'Unidades' },
];

export default function InventarioInternoPage() {
  const { profileReady, isCentralKitchen, localId, profileRole } = useAuth();
  const supabase = getSupabaseClient();
  const ok = canCocinaCentralOperate(isCentralKitchen, profileRole);

  const [rows, setRows] = useState<CentralInventoryProductRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nNombre, setNNombre] = useState('');
  const [nUnidad, setNUnidad] = useState<CentralInventoryUnidadBase>('kg');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !localId || !ok) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      setRows(await ccListInventoryProducts(supabase, localId));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error al cargar');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, localId, ok]);

  useEffect(() => {
    void load();
  }, [load]);

  const onAdd = async () => {
    if (!supabase || !localId || !nNombre.trim()) return;
    setAdding(true);
    setMsg(null);
    try {
      await ccInsertInventoryProduct(supabase, {
        local_central_id: localId,
        nombre: nNombre.trim(),
        unidad_base: nUnidad,
        activo: true,
      });
      setNNombre('');
      setNUnidad('kg');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo crear');
    } finally {
      setAdding(false);
    }
  };

  const toggleActivo = async (r: CentralInventoryProductRow) => {
    if (!supabase || !localId) return;
    setMsg(null);
    try {
      await ccUpdateInventoryProduct(supabase, localId, r.id, { activo: !r.activo });
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo actualizar');
    }
  };

  const remove = async (r: CentralInventoryProductRow) => {
    if (!supabase || !localId) return;
    if (!window.confirm(`¿Eliminar «${r.nombre}»? Si está vinculado en el catálogo, quita antes el vínculo.`)) return;
    setMsg(null);
    try {
      await ccDeleteInventoryProduct(supabase, localId, r.id);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo eliminar');
    }
  };

  if (!profileReady) {
    return <p className="text-center text-sm text-zinc-500">Cargando perfil…</p>;
  }

  if (!isSupabaseEnabled() || !supabase) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Supabase no está configurado.
      </div>
    );
  }

  if (!isCentralKitchen || !ok || !localId) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm">
        <Link href="/cocina-central" className="font-bold text-[#D32F2F]">
          Volver
        </Link>
        <p className="mt-2 text-zinc-700">Solo personal de cocina central con permiso de operación.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">Uso interno</p>
          <h1 className="text-xl font-extrabold text-zinc-900">Inventario (referencia)</h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-600">
            Referencia de productos para enlazar con el catálogo de sedes o con procesos internos. El stock real sigue
            en <strong>lotes</strong>; las sedes no ven esta lista.
          </p>
        </div>
        <Link href="/cocina-central" className="text-sm font-bold text-[#D32F2F]">
          ← Hub
        </Link>
      </div>

      {msg ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{msg}</div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100">
        <h2 className="text-sm font-extrabold text-zinc-900">Nuevo</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1">
            <span className="text-[10px] font-extrabold uppercase text-zinc-500">Nombre</span>
            <input
              value={nNombre}
              onChange={(e) => setNNombre(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold"
              placeholder="Ej. Salsa base cocida"
            />
          </label>
          <label className="w-full sm:w-40">
            <span className="text-[10px] font-extrabold uppercase text-zinc-500">Unidad base</span>
            <select
              value={nUnidad}
              onChange={(e) => setNUnidad(e.target.value as CentralInventoryUnidadBase)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold"
            >
              {UNIDADES.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={adding || !nNombre.trim()}
            onClick={() => void onAdd()}
            className="h-11 shrink-0 rounded-xl bg-[#D32F2F] px-5 text-sm font-extrabold text-white disabled:opacity-45"
          >
            {adding ? 'Añadiendo…' : 'Añadir'}
          </button>
        </div>
      </section>

      {loading ? (
        <p className="text-sm text-zinc-500">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
          Sin referencias todavía. Opcional: úsalo para vincular líneas del catálogo a un concepto interno.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white ring-1 ring-zinc-100">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-zinc-900">{r.nombre}</p>
                <p className="text-xs text-zinc-600">
                  Unidad base: {r.unidad_base} · {r.activo ? 'Activo' : 'Inactivo'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void toggleActivo(r)}
                  className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-800"
                >
                  {r.activo ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(r)}
                  className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-900"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
