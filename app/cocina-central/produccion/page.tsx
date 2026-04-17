'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canCocinaCentralOperate } from '@/lib/cocina-central-permissions';
import type { CcUnit } from '@/lib/cocina-central-supabase';
import {
  ccFetchProductionOrders,
  ccInsertProductionOrder,
  ccFetchProductsForLocal,
  ccRegisterProductionBatch,
} from '@/lib/cocina-central-supabase';

const UNITS: CcUnit[] = ['kg', 'ud', 'bolsa', 'racion'];

function todayMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

export default function CocinaCentralProduccionPage() {
  const { localId, userId, profileReady, isCentralKitchen } = useAuth();
  const canUse = canCocinaCentralOperate(isCentralKitchen);
  const supabase = getSupabaseClient();

  const [orders, setOrders] = useState<Awaited<ReturnType<typeof ccFetchProductionOrders>>>([]);
  const [products, setProducts] = useState<Awaited<ReturnType<typeof ccFetchProductsForLocal>>>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [orderProduct, setOrderProduct] = useState('');
  const [orderQty, setOrderQty] = useState('10');
  const [orderFecha, setOrderFecha] = useState(todayMadrid);

  const [batchOrderId, setBatchOrderId] = useState<string>('');
  const [batchProduct, setBatchProduct] = useState('');
  const [batchElab, setBatchElab] = useState(todayMadrid);
  const [batchCad, setBatchCad] = useState('');
  const [batchQty, setBatchQty] = useState('1');
  const [batchUnit, setBatchUnit] = useState<CcUnit>('kg');
  const [ingRows, setIngRows] = useState<Array<{ product_id: string; cantidad: string; unidad: CcUnit }>>([]);

  const reload = useCallback(async () => {
    if (!supabase || !localId || !canUse) return;
    setErr(null);
    try {
      const [o, p] = await Promise.all([
        ccFetchProductionOrders(supabase, localId),
        ccFetchProductsForLocal(supabase, localId),
      ]);
      setOrders(o);
      setProducts(p);
      if (p[0]) {
        setBatchProduct((prev) => prev || p[0].id);
        setOrderProduct((prev) => prev || p[0].id);
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

  const addIng = () =>
    setIngRows((r) => [...r, { product_id: products[0]?.id ?? '', cantidad: '1', unidad: batchUnit }]);

  const submitOrder = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const q = Number(orderQty.replace(',', '.'));
      if (!orderProduct || !Number.isFinite(q) || q <= 0) throw new Error('Revisa producto y cantidad');
      await ccInsertProductionOrder(supabase, {
        product_id: orderProduct,
        local_central_id: localId,
        fecha: orderFecha,
        cantidad_objetivo: q,
        estado: 'en_curso',
        created_by: userId,
      });
      setMsg('Orden creada.');
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const submitBatch = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const q = Number(batchQty.replace(',', '.'));
      if (!batchProduct || !Number.isFinite(q) || q <= 0) throw new Error('Revisa cantidad de lote');
      const ingredients = ingRows
        .filter((r) => r.product_id && Number(r.cantidad.replace(',', '.')) > 0)
        .map((r) => ({
          product_id: r.product_id,
          cantidad: Number(r.cantidad.replace(',', '.')),
          unidad: r.unidad,
        }));
      const id = await ccRegisterProductionBatch(supabase, {
        orderId: batchOrderId.trim() ? batchOrderId.trim() : null,
        productId: batchProduct,
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-900">Producción</h1>
          <p className="mt-1 text-sm text-zinc-600">Órdenes simples y alta de lote con trazabilidad de ingredientes.</p>
        </div>
        <Link
          href="/cocina-central/lotes"
          className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white"
        >
          Ver lotes
        </Link>
      </div>

      {msg ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
          {msg}
        </div>
      ) : null}
      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          {err}
        </div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-extrabold text-zinc-900">Nueva orden de producción</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500">
            Producto
            <select
              className="mt-1 h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 text-base font-semibold"
              value={orderProduct}
              onChange={(e) => setOrderProduct(e.target.value)}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500">
            Cantidad objetivo
            <input
              type="text"
              inputMode="decimal"
              className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-base font-semibold"
              value={orderQty}
              onChange={(e) => setOrderQty(e.target.value)}
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 sm:col-span-2">
            Fecha
            <input
              type="date"
              className="mt-1 h-12 w-full rounded-xl border border-zinc-300 px-3 text-base font-semibold"
              value={orderFecha}
              onChange={(e) => setOrderFecha(e.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submitOrder()}
          className="mt-4 h-12 w-full rounded-xl bg-[#D32F2F] text-sm font-extrabold text-white disabled:opacity-50"
        >
          Guardar orden
        </button>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-extrabold text-zinc-900">Registrar lote (stock en central)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Genera código de lote, QR y movimiento de producción. La orden es opcional.
        </p>
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
                  {(Array.isArray(o.products) ? o.products[0] : o.products)?.name ?? '—'}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 sm:col-span-2">
            Producto elaborado
            <select
              className="mt-1 h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 text-base font-semibold"
              value={batchProduct}
              onChange={(e) => setBatchProduct(e.target.value)}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500">
            Elaboración
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
                  value={row.product_id}
                  onChange={(e) => {
                    const v = e.target.value;
                    setIngRows((r) => r.map((x, j) => (j === i ? { ...x, product_id: v } : x)));
                  }}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
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

      <section>
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-500">Órdenes recientes</h2>
        <ul className="mt-2 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
          {orders.length === 0 ? (
            <li className="px-4 py-6 text-sm text-zinc-500">Sin órdenes.</li>
          ) : (
            orders.slice(0, 12).map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-bold text-zinc-900">
                  {(Array.isArray(o.products) ? o.products[0] : o.products)?.name ?? '—'}
                </span>
                <span className="text-zinc-600">
                  {o.fecha} · {o.estado} · obj. {o.cantidad_objetivo}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
