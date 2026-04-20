'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { appConfirm } from '@/lib/app-dialog-bridge';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canManageDeliveries } from '@/lib/cocina-central-permissions';
import type {
  CentralCatalogProductRow,
  CentralInventoryProductRow,
} from '@/lib/cocina-central-catalog-supabase';
import {
  ccDeleteCatalogProduct,
  ccInsertCatalogProduct,
  ccListCatalogProductsAdmin,
  ccListInventoryProducts,
  ccUpdateCatalogProduct,
} from '@/lib/cocina-central-catalog-supabase';
import { formatEur } from '@/lib/cocina-central-supply-supabase';

type CatDraft = {
  nombre_producto: string;
  descripcion: string;
  precio_venta: string;
  unidad_venta: string;
  orden: string;
  activo: boolean;
  visible_para_locales: boolean;
  inventory_product_id: string;
};

function toDraft(r: CentralCatalogProductRow): CatDraft {
  return {
    nombre_producto: r.nombre_producto,
    descripcion: r.descripcion ?? '',
    precio_venta: String(r.precio_venta),
    unidad_venta: r.unidad_venta,
    orden: String(r.orden),
    activo: r.activo,
    visible_para_locales: r.visible_para_locales,
    inventory_product_id: r.inventory_product_id ?? '',
  };
}

export default function CatalogoSedesPage() {
  const { profileReady, isCentralKitchen, localId, profileRole } = useAuth();
  const supabase = getSupabaseClient();
  const ok = canManageDeliveries(isCentralKitchen, profileRole);

  const [rows, setRows] = useState<CentralCatalogProductRow[]>([]);
  const [inv, setInv] = useState<CentralInventoryProductRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, CatDraft>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [nName, setNName] = useState('');
  const [nDesc, setNDesc] = useState('');
  const [nPrice, setNPrice] = useState('0');
  const [nUnit, setNUnit] = useState('kg');
  const [nOrden, setNOrden] = useState('0');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !localId || !ok) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const [c, i] = await Promise.all([
        ccListCatalogProductsAdmin(supabase, localId),
        ccListInventoryProducts(supabase, localId).catch(() => [] as CentralInventoryProductRow[]),
      ]);
      setRows(c);
      setInv(i);
      setDrafts(Object.fromEntries(c.map((r) => [r.id, toDraft(r)])));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error al cargar');
      setRows([]);
      setDrafts({});
    } finally {
      setLoading(false);
    }
  }, [supabase, localId, ok]);

  useEffect(() => {
    void load();
  }, [load]);

  const invOptions = useMemo(
    () => inv.filter((x) => x.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [inv],
  );

  const patchDraft = (id: string, patch: Partial<CatDraft>) => {
    setDrafts((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  };

  const saveOne = async (id: string) => {
    if (!supabase || !localId) return;
    const d = drafts[id];
    if (!d) return;
    const price = Number(d.precio_venta.replace(',', '.'));
    if (!d.nombre_producto.trim()) {
      setMsg('El nombre no puede estar vacío');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setMsg('Precio inválido');
      return;
    }
    setSavingId(id);
    setMsg(null);
    try {
      await ccUpdateCatalogProduct(supabase, localId, id, {
        nombre_producto: d.nombre_producto,
        descripcion: d.descripcion.trim() || null,
        precio_venta: Math.round(price * 10000) / 10000,
        unidad_venta: d.unidad_venta.trim() || 'ud.',
        orden: Math.max(0, parseInt(d.orden, 10) || 0),
        activo: d.activo,
        visible_para_locales: d.visible_para_locales,
        inventory_product_id: d.inventory_product_id.trim() ? d.inventory_product_id.trim() : null,
      });
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSavingId(null);
    }
  };

  const removeOne = async (id: string) => {
    if (!supabase || !localId) return;
    if (!(await appConfirm('¿Eliminar este producto del catálogo?'))) return;
    setSavingId(id);
    setMsg(null);
    try {
      await ccDeleteCatalogProduct(supabase, localId, id);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo eliminar');
    } finally {
      setSavingId(null);
    }
  };

  const onAdd = async () => {
    if (!supabase || !localId || !nName.trim()) return;
    const price = Number(nPrice.replace(',', '.'));
    if (!Number.isFinite(price) || price < 0) {
      setMsg('Precio inválido');
      return;
    }
    setAdding(true);
    setMsg(null);
    try {
      await ccInsertCatalogProduct(supabase, {
        local_central_id: localId,
        nombre_producto: nName.trim(),
        descripcion: nDesc.trim() || null,
        precio_venta: Math.round(price * 10000) / 10000,
        unidad_venta: nUnit.trim() || 'ud.',
        orden: Math.max(0, parseInt(nOrden, 10) || 0),
        activo: true,
        visible_para_locales: true,
      });
      setNName('');
      setNDesc('');
      setNPrice('0');
      setNUnit('kg');
      setNOrden('0');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo crear');
    } finally {
      setAdding(false);
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
        <p className="mt-2 text-zinc-700">Solo encargados o administradores en cocina central.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">Ventas a sedes</p>
          <h1 className="text-xl font-extrabold text-zinc-900">Catálogo para locales</h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-600">
            Lista de productos y precios que ven las sedes al pedir. No muestra stock: es independiente del inventario
            de lotes.
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
        <h2 className="text-sm font-extrabold text-zinc-900">Añadir producto</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block sm:col-span-2">
            <span className="text-[10px] font-extrabold uppercase text-zinc-500">Nombre</span>
            <input
              value={nName}
              onChange={(e) => setNName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold"
              placeholder="Ej. Salsa ahumada"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-extrabold uppercase text-zinc-500">Precio €</span>
            <input
              value={nPrice}
              onChange={(e) => setNPrice(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-extrabold uppercase text-zinc-500">Unidad venta</span>
            <input
              value={nUnit}
              onChange={(e) => setNUnit(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
              placeholder="kg, L, cubo 4kg…"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-extrabold uppercase text-zinc-500">Orden</span>
            <input
              value={nOrden}
              onChange={(e) => setNOrden(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[10px] font-extrabold uppercase text-zinc-500">Descripción (opcional)</span>
            <input
              value={nDesc}
              onChange={(e) => setNDesc(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={adding || !nName.trim()}
          onClick={() => void onAdd()}
          className="mt-4 h-11 rounded-xl bg-[#D32F2F] px-5 text-sm font-extrabold text-white disabled:opacity-45"
        >
          {adding ? 'Creando…' : 'Añadir al catálogo'}
        </button>
      </section>

      {loading ? (
        <p className="text-sm text-zinc-500">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
          Aún no hay productos. Los locales solo verán lo que añadas aquí.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const d = drafts[r.id] ?? toDraft(r);
            return (
              <li
                key={r.id}
                className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 ring-1 ring-zinc-100"
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                  <label className="sm:col-span-2">
                    <span className="text-[10px] font-extrabold uppercase text-zinc-500">Nombre</span>
                    <input
                      value={d.nombre_producto}
                      onChange={(e) => patchDraft(r.id, { nombre_producto: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold"
                    />
                  </label>
                  <label>
                    <span className="text-[10px] font-extrabold uppercase text-zinc-500">Precio €</span>
                    <input
                      value={d.precio_venta}
                      onChange={(e) => patchDraft(r.id, { precio_venta: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label>
                    <span className="text-[10px] font-extrabold uppercase text-zinc-500">Unidad</span>
                    <input
                      value={d.unidad_venta}
                      onChange={(e) => patchDraft(r.id, { unidad_venta: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label>
                    <span className="text-[10px] font-extrabold uppercase text-zinc-500">Orden</span>
                    <input
                      value={d.orden}
                      onChange={(e) => patchDraft(r.id, { orden: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="sm:col-span-2 lg:col-span-3">
                    <span className="text-[10px] font-extrabold uppercase text-zinc-500">Descripción</span>
                    <input
                      value={d.descripcion}
                      onChange={(e) => patchDraft(r.id, { descripcion: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="sm:col-span-2 lg:col-span-3">
                    <span className="text-[10px] font-extrabold uppercase text-zinc-500">
                      Vincular inventario interno (opcional)
                    </span>
                    <select
                      value={d.inventory_product_id}
                      onChange={(e) => patchDraft(r.id, { inventory_product_id: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">— Ninguno —</option>
                      {invOptions.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nombre} ({x.unidad_base})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                    <input
                      type="checkbox"
                      checked={d.activo}
                      onChange={(e) => patchDraft(r.id, { activo: e.target.checked })}
                    />
                    Activo
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                    <input
                      type="checkbox"
                      checked={d.visible_para_locales}
                      onChange={(e) => patchDraft(r.id, { visible_para_locales: e.target.checked })}
                    />
                    Visible para sedes
                  </label>
                  <span className="text-xs text-zinc-500">
                    Vista previa: {formatEur(Number(d.precio_venta.replace(',', '.')) || 0)} / {d.unidad_venta || '—'}
                  </span>
                  <div className="ml-auto flex gap-2">
                    <button
                      type="button"
                      disabled={savingId === r.id}
                      onClick={() => void saveOne(r.id)}
                      className="h-10 rounded-xl bg-zinc-900 px-4 text-xs font-extrabold text-white disabled:opacity-45"
                    >
                      {savingId === r.id ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button
                      type="button"
                      disabled={savingId === r.id}
                      onClick={() => void removeOne(r.id)}
                      className="h-10 rounded-xl border border-red-300 bg-white px-4 text-xs font-extrabold text-red-800 disabled:opacity-45"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-zinc-500">
        Ejecuta en Supabase el SQL <code className="rounded bg-zinc-100 px-1">supabase-cocina-central-catalog-locales.sql</code>{' '}
        si esta pantalla devuelve error de tablas o funciones.
      </p>
    </div>
  );
}
