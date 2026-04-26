'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canCocinaCentralOperate } from '@/lib/cocina-central-permissions';
import type { CcPreparationUnit, CcUnit } from '@/lib/cocina-central-supabase';
import {
  ccFetchProductionOrders,
  ccInsertPreparation,
  ccListPreparations,
  ccProductName,
  ccRegisterProductionBatch,
  ccReplacePreparationIngredients,
} from '@/lib/cocina-central-supabase';

const UNITS: CcUnit[] = ['kg', 'ud', 'bolsa', 'racion', 'litros', 'unidades'];
const PREP_UNITS: CcPreparationUnit[] = ['kg', 'ud', 'bolsa', 'racion', 'litros', 'unidades'];

function todayMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

export default function RegistroManualLotePage() {
  const { localId, profileReady, isCentralKitchen, profileRole } = useAuth();
  const canUse = canCocinaCentralOperate(isCentralKitchen, profileRole);
  const supabase = getSupabaseClient();

  const [orders, setOrders] = useState<Awaited<ReturnType<typeof ccFetchProductionOrders>>>([]);
  const [preparations, setPreparations] = useState<Awaited<ReturnType<typeof ccListPreparations>>>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [batchOrderId, setBatchOrderId] = useState<string>('');
  const [batchPreparation, setBatchPreparation] = useState('');
  const [batchSearch, setBatchSearch] = useState('');
  const [batchElab, setBatchElab] = useState(todayMadrid);
  const [batchCad, setBatchCad] = useState('');
  const [batchQty, setBatchQty] = useState('1');
  const [batchUnit, setBatchUnit] = useState<CcUnit>('kg');
  const [ingRows, setIngRows] = useState<Array<{ preparation_id: string; cantidad: string; unidad: CcUnit }>>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createNombre, setCreateNombre] = useState('');
  const [createCategoria, setCreateCategoria] = useState('General');
  const [createUnidad, setCreateUnidad] = useState<CcPreparationUnit>('kg');
  const [createDescripcion, setCreateDescripcion] = useState('');
  const [createRendimiento, setCreateRendimiento] = useState('');
  const [createCadDias, setCreateCadDias] = useState('');
  const [createObs, setCreateObs] = useState('');
  const [createActivo, setCreateActivo] = useState(true);
  const [createIngs, setCreateIngs] = useState<Array<{ preparation_id: string; cantidad: string; unidad: CcPreparationUnit }>>([]);

  const reload = useCallback(async () => {
    if (!supabase || !localId || !canUse) return;
    setErr(null);
    try {
      const [o, p] = await Promise.all([
        ccFetchProductionOrders(supabase, localId),
        ccListPreparations(supabase, localId, { onlyActive: true }),
      ]);
      setOrders(o);
      setPreparations(p);
      if (p[0]) {
        setBatchPreparation((prev) => prev || p[0].id);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al cargar');
    }
  }, [supabase, localId, canUse]);

  useEffect(() => {
    void reload();
  }, [reload]);

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

  const lower = (x: string) => x.trim().toLowerCase();
  const batchFiltered = preparations.filter((p) => lower(p.nombre).includes(lower(batchSearch)));
  const batchExists = preparations.some((p) => lower(p.nombre) === lower(batchSearch));

  const addIng = () =>
    setIngRows((r) => [...r, { preparation_id: preparations[0]?.id ?? '', cantidad: '1', unidad: batchUnit }]);

  const submitBatch = async () => {
    if (!localId) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const q = Number(batchQty.replace(',', '.'));
      if (!batchPreparation || !Number.isFinite(q) || q <= 0) throw new Error('Revisa elaboración y cantidad de lote');
      const ingredients = ingRows
        .filter((r) => r.preparation_id && Number(r.cantidad.replace(',', '.')) > 0)
        .map((r) => ({
          preparation_id: r.preparation_id,
          cantidad: Number(r.cantidad.replace(',', '.')),
          unidad: r.unidad,
        }));
      const id = await ccRegisterProductionBatch(supabase, {
        orderId: batchOrderId.trim() ? batchOrderId.trim() : null,
        preparationId: batchPreparation,
        localCentralId: localId,
        fechaElaboracion: batchElab,
        fechaCaducidad: batchCad.trim() ? batchCad.trim() : null,
        cantidad: q,
        unidad: batchUnit,
        ingredients,
      });
      setMsg(`Lote registrado. Código interno: ${id.slice(0, 8)}…`);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const openCreate = (initialName: string) => {
    setCreateNombre(initialName.trim());
    setCreateOpen(true);
  };

  const savePreparation = async () => {
    if (!supabase || !localId) return;
    if (!createNombre.trim()) {
      setErr('Nombre de elaboración obligatorio');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const rendimiento = createRendimiento.trim() ? Number(createRendimiento.replace(',', '.')) : null;
      const cadDias = createCadDias.trim() ? Number(createCadDias) : null;
      if (rendimiento != null && (!Number.isFinite(rendimiento) || rendimiento <= 0)) {
        throw new Error('Rendimiento inválido');
      }
      if (cadDias != null && (!Number.isInteger(cadDias) || cadDias < 0)) {
        throw new Error('Días de caducidad inválidos');
      }
      const created = await ccInsertPreparation(supabase, {
        local_central_id: localId,
        nombre: createNombre,
        categoria: createCategoria,
        unidad_base: createUnidad,
        descripcion: createDescripcion,
        rendimiento,
        caducidad_dias: cadDias,
        observaciones: createObs,
        activo: createActivo,
      });
      const baseIngredients = createIngs
        .filter((x) => x.preparation_id && Number(x.cantidad.replace(',', '.')) > 0)
        .map((x) => ({
          ingredient_preparation_id: x.preparation_id,
          cantidad: Number(x.cantidad.replace(',', '.')),
          unidad: x.unidad,
        }));
      await ccReplacePreparationIngredients(supabase, created.id, baseIngredients);
      await reload();
      setBatchPreparation(created.id);
      setBatchSearch(created.nombre);
      setCreateOpen(false);
      setCreateNombre('');
      setCreateCategoria('General');
      setCreateUnidad('kg');
      setCreateDescripcion('');
      setCreateRendimiento('');
      setCreateCadDias('');
      setCreateObs('');
      setCreateActivo(true);
      setCreateIngs([]);
      setMsg('Elaboración creada.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al crear elaboración');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/cocina-central/produccion" className="text-sm font-semibold text-[#D32F2F]">
          ← Producción
        </Link>
        <h1 className="mt-2 text-xl font-extrabold text-zinc-900">Registro manual de lote</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Uso excepcional: registrar un lote en central con elaboración interna, sin pasar por una orden desde escandallo. El flujo
          recomendado es <Link href="/cocina-central/produccion/nueva">Nueva orden de producción</Link>.
        </p>
      </div>

      {msg ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
          {msg}
        </div>
      ) : null}
      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{err}</div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-extrabold text-zinc-900">Registrar lote (stock en central)</h2>
        <p className="mt-1 text-xs text-zinc-500">Genera código de lote, QR y movimiento de producción. La orden es opcional.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 sm:col-span-2">
            Orden (opcional)
            <select
              className="mt-1 h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold"
              value={batchOrderId}
              onChange={(e) => setBatchOrderId(e.target.value)}
            >
              <option value="">— Sin orden —</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.fecha} · {String(o.cantidad_objetivo)} ·{' '}
                  {ccProductName((Array.isArray(o.central_preparations) ? o.central_preparations[0] : o.central_preparations) ?? o.products)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 sm:col-span-2">
            Buscar elaboración
            <input
              type="text"
              className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-base font-semibold"
              value={batchSearch}
              onChange={(e) => setBatchSearch(e.target.value)}
              placeholder="Filtra por nombre"
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 sm:col-span-2">
            Seleccionar elaboración
            <select
              className="mt-1 h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 text-base font-semibold"
              value={batchPreparation}
              onChange={(e) => setBatchPreparation(e.target.value)}
            >
              {batchFiltered.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          {batchSearch.trim() && !batchExists ? (
            <button
              type="button"
              onClick={() => openCreate(batchSearch)}
              className="h-12 rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm font-bold text-zinc-800 sm:col-span-2"
            >
              Crear elaboración: {batchSearch.trim()}
            </button>
          ) : null}
          <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500">
            Fecha de elaboración
            <input
              type="date"
              className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-base font-semibold"
              value={batchElab}
              onChange={(e) => setBatchElab(e.target.value)}
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500">
            Caducidad (opcional)
            <input
              type="date"
              className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-base font-semibold"
              value={batchCad}
              onChange={(e) => setBatchCad(e.target.value)}
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500">
            Cantidad
            <input
              type="text"
              inputMode="decimal"
              className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-base font-semibold"
              value={batchQty}
              onChange={(e) => setBatchQty(e.target.value)}
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500">
            Unidad
            <select
              className="mt-1 h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 text-base font-semibold"
              value={batchUnit}
              onChange={(e) => setBatchUnit(e.target.value as CcUnit)}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 border-t border-zinc-100 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-zinc-800">Ingredientes / origen (opcional)</h3>
            <button
              type="button"
              onClick={addIng}
              className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-bold"
            >
              + Línea
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {ingRows.map((row, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-3">
                <select
                  className="h-11 rounded-lg border border-zinc-300 text-sm font-semibold"
                  value={row.preparation_id}
                  onChange={(e) => {
                    const v = e.target.value;
                    setIngRows((r) => r.map((x, j) => (j === i ? { ...x, preparation_id: v } : x)));
                  }}
                >
                  {preparations.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  inputMode="decimal"
                  className="h-11 rounded-lg border border-zinc-300 px-2 text-sm"
                  value={row.cantidad}
                  onChange={(e) => {
                    const v = e.target.value;
                    setIngRows((r) => r.map((x, j) => (j === i ? { ...x, cantidad: v } : x)));
                  }}
                />
                <select
                  className="h-11 rounded-lg border border-zinc-300 text-sm"
                  value={row.unidad}
                  onChange={(e) => {
                    const v = e.target.value as CcUnit;
                    setIngRows((r) => r.map((x, j) => (j === i ? { ...x, unidad: v } : x)));
                  }}
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void submitBatch()}
          className="mt-6 h-14 w-full rounded-2xl bg-[#D32F2F] text-base font-extrabold text-white shadow-sm disabled:opacity-50"
        >
          Registrar lote
        </button>
      </section>

      {createOpen ? (
        <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <h2 className="text-base font-extrabold text-zinc-900">Nueva elaboración (interna)</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 sm:col-span-2">
              Nombre
              <input
                type="text"
                value={createNombre}
                onChange={(e) => setCreateNombre(e.target.value)}
                className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-base font-semibold"
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500">
              Categoría
              <input
                type="text"
                value={createCategoria}
                onChange={(e) => setCreateCategoria(e.target.value)}
                className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-base font-semibold"
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500">
              Unidad base
              <select
                value={createUnidad}
                onChange={(e) => setCreateUnidad(e.target.value as CcPreparationUnit)}
                className="mt-1 h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 text-base font-semibold"
              >
                {PREP_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500">
              Rendimiento (opcional)
              <input
                type="text"
                inputMode="decimal"
                value={createRendimiento}
                onChange={(e) => setCreateRendimiento(e.target.value)}
                className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-base font-semibold"
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500">
              Caducidad (días)
              <input
                type="text"
                inputMode="numeric"
                value={createCadDias}
                onChange={(e) => setCreateCadDias(e.target.value)}
                className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-base font-semibold"
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 sm:col-span-2">
              Descripción
              <textarea
                value={createDescripcion}
                onChange={(e) => setCreateDescripcion(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 sm:col-span-2">
              Observaciones
              <textarea
                value={createObs}
                onChange={(e) => setCreateObs(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-700 sm:col-span-2">
              <input
                type="checkbox"
                checked={createActivo}
                onChange={(e) => setCreateActivo(e.target.checked)}
              />
              Activa
            </label>
          </div>

          <div className="mt-4 border-t border-zinc-200 pt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Ingredientes base (opcional)</p>
              <button
                type="button"
                onClick={() =>
                  setCreateIngs((rows) => [
                    ...rows,
                    { preparation_id: preparations[0]?.id ?? '', cantidad: '1', unidad: 'kg' },
                  ])
                }
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs font-bold"
              >
                + Ingrediente
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {createIngs.map((row, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-3">
                  <select
                    className="h-11 rounded-lg border border-zinc-300 text-sm font-semibold"
                    value={row.preparation_id}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCreateIngs((r) => r.map((x, j) => (j === i ? { ...x, preparation_id: v } : x)));
                    }}
                  >
                    {preparations.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="h-11 rounded-lg border border-zinc-300 px-2 text-sm"
                    value={row.cantidad}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCreateIngs((r) => r.map((x, j) => (j === i ? { ...x, cantidad: v } : x)));
                    }}
                  />
                  <select
                    className="h-11 rounded-lg border border-zinc-300 text-sm"
                    value={row.unidad}
                    onChange={(e) => {
                      const v = e.target.value as CcPreparationUnit;
                      setCreateIngs((r) => r.map((x, j) => (j === i ? { ...x, unidad: v } : x)));
                    }}
                  >
                    {PREP_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="h-11 rounded-xl border border-zinc-300 bg-white text-sm font-bold"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void savePreparation()}
              disabled={busy}
              className="h-11 rounded-xl bg-[#D32F2F] text-sm font-extrabold text-white disabled:opacity-50"
            >
              Crear elaboración
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
