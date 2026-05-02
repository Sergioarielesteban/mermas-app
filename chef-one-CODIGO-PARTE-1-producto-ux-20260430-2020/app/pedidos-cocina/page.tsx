'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Package, Search } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canPlaceCentralSupplyOrder } from '@/lib/cocina-central-permissions';
import {
  formatSupplyUnitLabel,
  type CentralSupplyCatalogRow,
  formatEur,
} from '@/lib/cocina-central-supply-supabase';

function defaultEntregaIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function PedidosCocinaPage() {
  const router = useRouter();
  const { profileReady, isCentralKitchen, localId } = useAuth();
  const supabase = getSupabaseClient();
  const allowed = canPlaceCentralSupplyOrder(isCentralKitchen, localId);

  const [catalog, setCatalog] = useState<CentralSupplyCatalogRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [qtyByCatalogId, setQtyByCatalogId] = useState<Record<string, number>>({});
  const [fecha, setFecha] = useState(defaultEntregaIsoDate);
  const [notas, setNotas] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadErr(null);
    try {
      const { ccFetchSupplyCatalog } = await import('@/lib/cocina-central-supply-supabase');
      const rows = await ccFetchSupplyCatalog(supabase);
      setCatalog(rows);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'No se pudo cargar el catálogo');
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (r) =>
        r.nombre_producto.toLowerCase().includes(q) ||
        r.descripcion.toLowerCase().includes(q) ||
        r.unidad_venta.toLowerCase().includes(q),
    );
  }, [catalog, query]);

  const cartLines = useMemo(() => {
    const lines: Array<{ row: CentralSupplyCatalogRow; qty: number; line: number }> = [];
    for (const row of catalog) {
      const qty = qtyByCatalogId[row.catalog_product_id] ?? 0;
      if (qty > 0) {
        const line = Math.round(qty * Number(row.precio_venta) * 100) / 100;
        lines.push({ row, qty, line });
      }
    }
    return lines.sort((a, b) => a.row.nombre_producto.localeCompare(b.row.nombre_producto, 'es'));
  }, [catalog, qtyByCatalogId]);

  const cartTotal = useMemo(
    () => Math.round(cartLines.reduce((s, l) => s + l.line, 0) * 100) / 100,
    [cartLines],
  );

  const setQty = (catalogProductId: string, value: number) => {
    setQtyByCatalogId((prev) => {
      const next = { ...prev };
      if (value <= 0) delete next[catalogProductId];
      else next[catalogProductId] = value;
      return next;
    });
  };

  const onSubmit = async () => {
    if (!supabase || cartLines.length === 0) return;
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const { ccSubmitSupplyOrder } = await import('@/lib/cocina-central-supply-supabase');
      const id = await ccSubmitSupplyOrder(supabase, {
        fechaEntrega: fecha,
        items: cartLines.map((l) => ({
          catalog_product_id: l.row.catalog_product_id,
          cantidad: l.qty,
        })),
        notas: notas.trim() || null,
      });
      router.push(`/pedidos-cocina/${id}`);
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : 'No se pudo enviar el pedido');
    } finally {
      setSubmitting(false);
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

  if (!allowed) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-800">
          <p className="font-extrabold text-zinc-900">Pedidos a cocina central</p>
          <p className="mt-2 leading-snug text-zinc-700">
            Esta pantalla es para <strong>sedes satélite</strong>. En cocina central gestionas los pedidos
            entrantes desde el módulo correspondiente.
          </p>
        </div>
        <Link
          href="/cocina-central/pedidos-sedes"
          className="flex h-12 items-center justify-center rounded-2xl bg-[#D32F2F] text-sm font-extrabold text-white"
        >
          Ir a pedidos de sedes
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-900">Pedir a cocina central</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Catálogo de productos y precios publicados por cocina central. Sin stock en pantalla: el total se confirma
            al enviar.
          </p>
        </div>
        <Link
          href="/pedidos-cocina/historial"
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-800 ring-1 ring-zinc-200/80 hover:bg-zinc-50"
        >
          <ClipboardList className="h-4 w-4 text-[#D32F2F]" />
          Historial
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">Fecha de entrega deseada</span>
          <input
            type="date"
            value={fecha}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setFecha(e.target.value)}
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-900"
          />
        </label>
        <label className="block rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100 sm:col-span-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">Notas (opcional)</span>
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ej. entregar en frío…"
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
      </div>

      {loadErr ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{loadErr}</div>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar producto…"
          className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 pl-10 pr-3 text-sm ring-1 ring-zinc-100"
        />
      </div>

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando catálogo…</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => {
            const q = qtyByCatalogId[row.catalog_product_id] ?? 0;
            return (
              <li
                key={row.catalog_product_id}
                className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 ring-1 ring-zinc-100 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-zinc-900">{row.nombre_producto}</p>
                  {row.descripcion.trim() ? (
                    <p className="mt-0.5 text-xs text-zinc-500">{row.descripcion.trim()}</p>
                  ) : null}
                  <p className="mt-0.5 text-xs font-medium text-zinc-600">
                    {formatEur(Number(row.precio_venta))} / {formatSupplyUnitLabel(row.unidad_venta)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQty(row.catalog_product_id, q - 1)}
                    className="grid h-10 w-10 place-items-center rounded-xl border border-zinc-300 bg-white text-lg font-bold text-zinc-800"
                    aria-label="Menos"
                  >
                    −
                  </button>
                  <span className="w-10 text-center text-sm font-extrabold text-zinc-900">{q}</span>
                  <button
                    type="button"
                    onClick={() => setQty(row.catalog_product_id, q + 1)}
                    className="grid h-10 w-10 place-items-center rounded-xl bg-[#D32F2F] text-lg font-bold text-white"
                    aria-label="Más"
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 rounded-2xl border border-zinc-200 bg-white p-4 shadow-lg ring-1 ring-zinc-200/80">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">Tu pedido</p>
            <p className="text-lg font-extrabold text-zinc-900">
              {cartLines.length} líneas · {formatEur(cartTotal)}
            </p>
            {cartLines.length > 0 ? (
              <p className="mt-1 line-clamp-2 text-xs text-zinc-600">
                {cartLines.map((l) => `${l.qty}× ${l.row.nombre_producto}`).join(' · ')}
              </p>
            ) : (
              <p className="mt-1 text-xs text-zinc-500">Añade cantidades en el catálogo.</p>
            )}
          </div>
          <button
            type="button"
            disabled={submitting || cartLines.length === 0}
            onClick={() => void onSubmit()}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#D32F2F] px-6 text-sm font-extrabold text-white disabled:opacity-45"
          >
            <Package className="h-4 w-4" />
            {submitting ? 'Enviando…' : 'Enviar pedido'}
          </button>
        </div>
        {submitErr ? <p className="mt-3 text-xs font-semibold text-red-700">{submitErr}</p> : null}
      </div>
    </div>
  );
}
