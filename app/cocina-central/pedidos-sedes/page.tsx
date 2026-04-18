'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, FileDown } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canManageDeliveries } from '@/lib/cocina-central-permissions';
import { downloadCentralSupplyMonthlyInvoicePdf } from '@/lib/cocina-central-supply-pdf';
import {
  aggregateSupplyItemsByProduct,
  formatEur,
  formatMonthLabelEs,
  monthEntregaRange,
  SUPPLY_ORDER_ESTADO_LABEL,
  type CentralSupplyOrderRow,
} from '@/lib/cocina-central-supply-supabase';

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

type LocalOpt = { id: string; label: string };

export default function CocinaCentralPedidosSedesPage() {
  const { profileReady, isCentralKitchen, profileRole } = useAuth();
  const supabase = getSupabaseClient();
  const canDeliver = canManageDeliveries(isCentralKitchen, profileRole);

  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const [solicitanteId, setSolicitanteId] = useState<string>('');
  const [orders, setOrders] = useState<CentralSupplyOrderRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);

  const range = useMemo(() => {
    try {
      return monthEntregaRange(monthKey);
    } catch {
      return { from: '', to: '' };
    }
  }, [monthKey]);

  useEffect(() => {
    setSolicitanteId('');
  }, [monthKey]);

  const load = useCallback(async () => {
    if (!supabase || !isCentralKitchen || !canDeliver || !range.from) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const { ccListCentralSupplyOrders } = await import('@/lib/cocina-central-supply-supabase');
      const rows = await ccListCentralSupplyOrders(supabase, {
        entregaDesde: range.from,
        entregaHasta: range.to,
        solicitanteId: solicitanteId || undefined,
      });
      setOrders(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al cargar pedidos');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, isCentralKitchen, canDeliver, range.from, range.to, solicitanteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const localOptions: LocalOpt[] = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of orders) {
      const label = o.local_solicitante_label ?? o.local_solicitante_id;
      m.set(o.local_solicitante_id, label);
    }
    return [...m.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [orders]);

  const statsOrders = useMemo(
    () => orders.filter((o) => o.estado !== 'cancelado'),
    [orders],
  );
  const totalEur = useMemo(
    () => Math.round(statsOrders.reduce((s, o) => s + Number(o.total_eur), 0) * 100) / 100,
    [statsOrders],
  );

  const [aggItems, setAggItems] = useState<ReturnType<typeof aggregateSupplyItemsByProduct>>([]);

  useEffect(() => {
    if (!supabase || statsOrders.length === 0) {
      setAggItems([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { ccFetchSupplyItemsForOrders, aggregateSupplyItemsByProduct } = await import(
          '@/lib/cocina-central-supply-supabase'
        );
        const ids = statsOrders.map((o) => o.id);
        const items = await ccFetchSupplyItemsForOrders(supabase, ids);
        if (!cancelled) {
          setAggItems(aggregateSupplyItemsByProduct(statsOrders, items, { excludeCancelled: true }));
        }
      } catch {
        if (!cancelled) setAggItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, statsOrders]);

  const pdfLocalLabel = useMemo(() => {
    if (!solicitanteId) return '';
    const o = orders.find((x) => x.local_solicitante_id === solicitanteId);
    return o?.local_solicitante_label ?? solicitanteId;
  }, [solicitanteId, orders]);

  const onPdf = async () => {
    if (!supabase || !solicitanteId || !range.from) return;
    setPdfBusy(true);
    try {
      const { ccListCentralSupplyOrders, ccFetchSupplyItemsForOrders } = await import(
        '@/lib/cocina-central-supply-supabase'
      );
      const rows = await ccListCentralSupplyOrders(supabase, {
        solicitanteId,
        entregaDesde: range.from,
        entregaHasta: range.to,
      });
      const centralLabel = rows[0]?.local_central_label ?? 'Cocina central';
      const localLabel = rows[0]?.local_solicitante_label ?? (pdfLocalLabel || 'Local');
      const items = await ccFetchSupplyItemsForOrders(
        supabase,
        rows.map((r) => r.id),
      );
      const itemsByOrderId = new Map<string, (typeof items)[number][]>();
      for (const it of items) {
        const arr = itemsByOrderId.get(it.order_id) ?? [];
        arr.push(it);
        itemsByOrderId.set(it.order_id, arr);
      }
      downloadCentralSupplyMonthlyInvoicePdf({
        monthKey,
        localSolicitanteLabel: localLabel,
        centralLabel,
        orders: rows,
        itemsByOrderId,
      });
    } finally {
      setPdfBusy(false);
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

  if (!isCentralKitchen) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-800">
          <p className="font-extrabold text-zinc-900">Pedidos de sedes</p>
          <p className="mt-2 text-zinc-700">
            Solo la <strong>cocina central</strong> ve el listado de pedidos entrantes. El catálogo lo editas en{' '}
            <Link href="/cocina-central/catalogo-sedes" className="font-bold text-[#D32F2F] underline-offset-2 hover:underline">
              Catálogo para sedes
            </Link>
            . Tu local puede hacer pedidos
            desde «Pedir a central».
          </p>
        </div>
        <Link
          href="/pedidos-cocina"
          className="flex h-12 items-center justify-center rounded-2xl bg-[#D32F2F] text-sm font-extrabold text-white"
        >
          Pedir a cocina central
        </Link>
      </div>
    );
  }

  if (!canDeliver) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-800">
        Necesitas permisos de encargado o administrador en cocina central para gestionar pedidos de sedes.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-zinc-900">Pedidos de sedes</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Los locales piden desde el <strong>catálogo central</strong> (
          <Link href="/cocina-central/catalogo-sedes" className="font-bold text-[#D32F2F] underline-offset-2 hover:underline">
            editar productos y precios
          </Link>
          ). Importes con snapshot al enviar. Filtra por mes de <strong>fecha de entrega</strong> y genera PDF.
        </p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100 sm:grid-cols-3">
        <label className="block sm:col-span-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">Mes (entrega)</span>
          <input
            type="month"
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value)}
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">Local satélite</span>
          <select
            value={solicitanteId}
            onChange={(e) => setSolicitanteId(e.target.value)}
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold"
          >
            <option value="">Todos en este periodo</option>
            {localOptions.map((lo) => (
              <option key={lo.id} value={lo.id}>
                {lo.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{err}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 ring-1 ring-zinc-100">
          <div className="flex items-center gap-2 text-zinc-800">
            <BarChart3 className="h-5 w-5 text-[#D32F2F]" />
            <span className="text-sm font-extrabold">Resumen del periodo</span>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-zinc-900">{formatEur(totalEur)}</p>
          <p className="mt-1 text-xs text-zinc-600">
            {statsOrders.length} pedido(s) sin cancelar · {formatMonthLabelEs(monthKey)}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 ring-1 ring-zinc-100">
          <p className="text-sm font-extrabold text-zinc-900">Informe PDF (cobro)</p>
          <p className="mt-1 text-xs leading-snug text-zinc-600">
            Elige un <strong>local concreto</strong> arriba y descarga el detalle con fechas de entrega, líneas y
            precios.
          </p>
          <button
            type="button"
            disabled={!solicitanteId || pdfBusy}
            onClick={() => void onPdf()}
            className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#D32F2F] text-xs font-extrabold text-white disabled:opacity-45 sm:w-auto sm:px-4"
          >
            <FileDown className="h-4 w-4" />
            {pdfBusy ? 'Generando…' : 'Descargar PDF del mes'}
          </button>
        </div>
      </div>

      {aggItems.length > 0 ? (
        <div>
          <h2 className="text-sm font-extrabold text-zinc-900">Consumo agregado (uds. / importe)</h2>
          <div className="mt-2 overflow-x-auto rounded-2xl border border-zinc-200 bg-white ring-1 ring-zinc-100">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Cantidad</th>
                  <th className="px-3 py-2 text-right">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {aggItems.map((a) => (
                  <tr key={`${a.product_name}:${a.unidad}`}>
                    <td className="px-3 py-2 font-semibold text-zinc-900">{a.product_name}</td>
                    <td className="px-3 py-2 text-zinc-700">
                      {a.cantidad_total.toFixed(2)} {a.unidad}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-zinc-900">{formatEur(a.importe_eur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div>
        <h2 className="text-sm font-extrabold text-zinc-900">Listado</h2>
        {loading ? (
          <p className="mt-2 text-sm text-zinc-500">Cargando…</p>
        ) : orders.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
            No hay pedidos en este periodo{solicitanteId ? ' para este local' : ''}.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/cocina-central/pedidos-sedes/${o.id}`}
                  className="flex flex-col gap-1 rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100 transition hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-wide text-[#D32F2F]">
                      {SUPPLY_ORDER_ESTADO_LABEL[o.estado]}
                    </p>
                    <p className="font-bold text-zinc-900">
                      {o.local_solicitante_label ?? o.local_solicitante_id}
                    </p>
                    <p className="text-xs text-zinc-600">
                      Entrega {fmtDate(o.fecha_entrega_deseada)} · Pedido {fmtDate(o.created_at)}
                    </p>
                  </div>
                  <p className="text-lg font-extrabold text-zinc-900">{formatEur(Number(o.total_eur))}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
