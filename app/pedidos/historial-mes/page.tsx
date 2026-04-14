'use client';

import Link from 'next/link';
import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { usePedidosOrders } from '@/components/PedidosOrdersProvider';
import { CHEF_ONE_TAPER_LINE_CLASS } from '@/components/ChefOneGlowLine';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { formatQuantityWithUnit, totalsWithVatForOrderListDisplay } from '@/lib/pedidos-format';
import type { PedidoOrder } from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';

export default function PedidosHistorialMesPage() {
  const { localCode, localName, localId, email } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const { orders } = usePedidosOrders();
  const [message, setMessage] = React.useState<string | null>(null);
  const [month, setMonth] = React.useState(() => new Date().toISOString().slice(0, 7));
  const [activeWeek, setActiveWeek] = React.useState<number | null>(null);
  const [supplierFilter, setSupplierFilter] = React.useState<'all' | string>('all');
  const [topN, setTopN] = React.useState(10);

  const accountingOrders = React.useMemo(
    () => orders.filter((row) => row.status === 'sent' || row.status === 'received'),
    [orders],
  );

  const monthlyOrders = React.useMemo(
    () =>
      accountingOrders.filter((order) => {
        const pivotDate = (order.receivedAt ?? order.sentAt ?? order.createdAt).slice(0, 7);
        return pivotDate === month;
      }),
    [accountingOrders, month],
  );

  const filteredMonthlyOrders = React.useMemo(
    () =>
      supplierFilter === 'all'
        ? monthlyOrders
        : monthlyOrders.filter((order) => order.supplierId === supplierFilter),
    [monthlyOrders, supplierFilter],
  );

  const previousMonth = React.useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return month;
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() - 1);
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yy}-${mm}`;
  }, [month]);

  const previousMonthOrders = React.useMemo(
    () =>
      accountingOrders.filter((order) => {
        const pivotDate = (order.receivedAt ?? order.sentAt ?? order.createdAt).slice(0, 7);
        return pivotDate === previousMonth;
      }),
    [accountingOrders, previousMonth],
  );
  const filteredPreviousMonthOrders = React.useMemo(
    () =>
      supplierFilter === 'all'
        ? previousMonthOrders
        : previousMonthOrders.filter((order) => order.supplierId === supplierFilter),
    [previousMonthOrders, supplierFilter],
  );

  const totalsForOrders = React.useCallback((rows: PedidoOrder[]) => {
    let totalWithVat = 0;
    let totalBase = 0;
    let totalVat = 0;
    for (const order of rows) {
      for (const item of order.items) {
        const qty = order.status === 'received' ? item.receivedQuantity : item.quantity;
        const base = Math.max(0, qty) * item.pricePerUnit;
        const vat = base * item.vatRate;
        totalBase += base;
        totalVat += vat;
        totalWithVat += base + vat;
      }
    }
    return {
      totalWithVat: Math.round(totalWithVat * 100) / 100,
      totalBase: Math.round(totalBase * 100) / 100,
      totalVat: Math.round(totalVat * 100) / 100,
      orderCount: rows.length,
      avgTicket: rows.length > 0 ? Math.round((totalWithVat / rows.length) * 100) / 100 : 0,
    };
  }, []);

  const kpis = React.useMemo(() => {
    const now = totalsForOrders(filteredMonthlyOrders);
    const prev = totalsForOrders(filteredPreviousMonthOrders);
    const deltaPct =
      prev.totalWithVat > 0
        ? Math.round(((now.totalWithVat - prev.totalWithVat) / prev.totalWithVat) * 1000) / 10
        : null;
    return { ...now, deltaPct };
  }, [filteredMonthlyOrders, filteredPreviousMonthOrders, totalsForOrders]);

  const monthlyTopProducts = React.useMemo(() => {
    const byName = new Map<string, { productName: string; spend: number; qty: number; unit: Unit }>();
    for (const order of filteredMonthlyOrders) {
      for (const item of order.items) {
        const qty = order.status === 'received' ? item.receivedQuantity : item.quantity;
        const spend = Math.max(0, qty) * item.pricePerUnit * (1 + item.vatRate);
        const key = item.productName;
        const prev = byName.get(key) ?? { productName: item.productName, spend: 0, qty: 0, unit: item.unit as Unit };
        prev.spend += spend;
        prev.qty += qty;
        byName.set(key, prev);
      }
    }
    const total = Array.from(byName.values()).reduce((acc, r) => acc + r.spend, 0);
    return Array.from(byName.values())
      .map((r) => ({
        ...r,
        spend: Math.round(r.spend * 100) / 100,
        qty: Math.round(r.qty * 100) / 100,
        pct: total > 0 ? Math.round((r.spend / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.spend - a.spend);
  }, [filteredMonthlyOrders]);

  const weeklySummary = React.useMemo(() => {
    const weeks = new Map<
      number,
      {
        week: number;
        total: number;
        products: Map<string, { name: string; spend: number }>;
      }
    >();
    for (const order of filteredMonthlyOrders) {
      const pivot = new Date(order.receivedAt ?? order.sentAt ?? order.createdAt);
      const week = Math.min(5, Math.floor((pivot.getDate() - 1) / 7) + 1);
      const row = weeks.get(week) ?? { week, total: 0, products: new Map() };
      for (const item of order.items) {
        const qty = order.status === 'received' ? item.receivedQuantity : item.quantity;
        const spend = Math.max(0, qty) * item.pricePerUnit * (1 + item.vatRate);
        row.total += spend;
        const p = row.products.get(item.productName) ?? { name: item.productName, spend: 0 };
        p.spend += spend;
        row.products.set(item.productName, p);
      }
      weeks.set(week, row);
    }
    return Array.from(weeks.values())
      .map((w) => ({
        week: w.week,
        total: Math.round(w.total * 100) / 100,
        topProducts: Array.from(w.products.values())
          .map((p) => ({ ...p, spend: Math.round(p.spend * 100) / 100 }))
          .sort((a, b) => b.spend - a.spend)
          .slice(0, 5),
      }))
      .sort((a, b) => a.week - b.week);
  }, [filteredMonthlyOrders]);

  const supplierPerformance = React.useMemo(() => {
    const bySupplier = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        spend: number;
        orderCount: number;
        receivedCount: number;
        incidentOrders: number;
        requestedTotal: number;
        receivedTotal: number;
      }
    >();
    for (const order of filteredMonthlyOrders) {
      const cur = bySupplier.get(order.supplierId) ?? {
        supplierId: order.supplierId,
        supplierName: order.supplierName,
        spend: 0,
        orderCount: 0,
        receivedCount: 0,
        incidentOrders: 0,
        requestedTotal: 0,
        receivedTotal: 0,
      };
      cur.orderCount += 1;
      const hasIncident = order.items.some((i) => Boolean(i.incidentType) || Boolean(i.incidentNotes?.trim()));
      if (hasIncident) cur.incidentOrders += 1;
      if (order.status === 'received') cur.receivedCount += 1;

      let requested = 0;
      let received = 0;
      for (const item of order.items) {
        requested += Math.max(0, item.quantity) * item.pricePerUnit * (1 + item.vatRate);
        const recvQty = order.status === 'received' ? Math.max(0, item.receivedQuantity) : Math.max(0, item.quantity);
        received += recvQty * item.pricePerUnit * (1 + item.vatRate);
      }
      cur.requestedTotal += requested;
      cur.receivedTotal += received;
      cur.spend += received;
      bySupplier.set(order.supplierId, cur);
    }

    return Array.from(bySupplier.values())
      .map((r) => {
        const incidencePct = r.orderCount > 0 ? (r.incidentOrders / r.orderCount) * 100 : 0;
        const deviation = Math.abs(r.receivedTotal - r.requestedTotal);
        return {
          ...r,
          spend: Math.round(r.spend * 100) / 100,
          requestedTotal: Math.round(r.requestedTotal * 100) / 100,
          receivedTotal: Math.round(r.receivedTotal * 100) / 100,
          deviation: Math.round(deviation * 100) / 100,
          incidencePct: Math.round(incidencePct * 10) / 10,
        };
      })
      .sort((a, b) => b.spend - a.spend);
  }, [filteredMonthlyOrders]);

  const deviationKpis = React.useMemo(() => {
    const requested = supplierPerformance.reduce((acc, s) => acc + s.requestedTotal, 0);
    const received = supplierPerformance.reduce((acc, s) => acc + s.receivedTotal, 0);
    const deviationAbs = Math.abs(received - requested);
    const deviationPct = requested > 0 ? (deviationAbs / requested) * 100 : 0;
    const incidents = supplierPerformance.reduce((acc, s) => acc + s.incidentOrders, 0);
    const totalOrders = supplierPerformance.reduce((acc, s) => acc + s.orderCount, 0);
    return {
      requested: Math.round(requested * 100) / 100,
      received: Math.round(received * 100) / 100,
      deviationAbs: Math.round(deviationAbs * 100) / 100,
      deviationPct: Math.round(deviationPct * 10) / 10,
      incidents,
      totalOrders,
    };
  }, [supplierPerformance]);

  const monthlyBySupplier = React.useMemo(() => {
    const bySupplier = new Map<
      string,
      {
        supplierName: string;
        totalWithVat: number;
        orderCount: number;
        byProduct: Map<string, { unit: string; quantity: number }>;
      }
    >();

    for (const order of accountingOrders) {
      const pivotDate = (order.receivedAt ?? order.sentAt ?? order.createdAt).slice(0, 7);
      if (pivotDate !== month) continue;

      const existing = bySupplier.get(order.supplierId) ?? {
        supplierName: order.supplierName,
        totalWithVat: 0,
        orderCount: 0,
        byProduct: new Map<string, { unit: string; quantity: number }>(),
      };

      const totals = totalsWithVatForOrderListDisplay(order);
      existing.totalWithVat += totals.total;
      existing.orderCount += 1;

      for (const item of order.items) {
        const prod = existing.byProduct.get(item.productName) ?? { unit: item.unit, quantity: 0 };
        prod.quantity += order.status === 'received' ? item.receivedQuantity : item.quantity;
        existing.byProduct.set(item.productName, prod);
      }
      bySupplier.set(order.supplierId, existing);
    }

    return Array.from(bySupplier.entries())
      .map(([supplierId, row]) => ({
        supplierId,
        supplierName: row.supplierName,
        orderCount: row.orderCount,
        totalWithVat: Math.round(row.totalWithVat * 100) / 100,
        products: Array.from(row.byProduct.entries())
          .map(([name, data]) => ({
            name,
            unit: data.unit,
            quantity: Math.round(data.quantity * 100) / 100,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'es')),
      }))
      .sort((a, b) => b.totalWithVat - a.totalWithVat);
  }, [accountingOrders, month]);

  const [expandedSupplierId, setExpandedSupplierId] = React.useState<string | null>(null);
  const displayedSuppliers = React.useMemo(
    () =>
      supplierFilter === 'all'
        ? monthlyBySupplier
        : monthlyBySupplier.filter((s) => s.supplierId === supplierFilter),
    [monthlyBySupplier, supplierFilter],
  );

  React.useEffect(() => {
    if (supplierFilter === 'all') return;
    if (!monthlyBySupplier.some((s) => s.supplierId === supplierFilter)) {
      setSupplierFilter('all');
    }
  }, [supplierFilter, monthlyBySupplier]);

  if (!hasPedidosEntry) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-black text-zinc-900">Modulo no habilitado</p>
        <p className="pt-1 text-sm text-zinc-600">Pedidos esta disponible para los locales de Mataro y Premia.</p>
      </section>
    );
  }
  if (!canUse) {
    return <PedidosPremiaLockedScreen />;
  }

  return (
    <div className="space-y-4">
      <section>
        <Link
          href="/pedidos"
          className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700"
        >
          ← Atras
        </Link>
      </section>

      <section className="rounded-3xl bg-zinc-950 px-6 py-8 text-white shadow-xl shadow-zinc-900/20">
        <h1 className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Historial</h1>
        <p className="mt-2 text-center text-2xl font-light tracking-tight text-white sm:text-3xl">Compras del mes</p>
        <p className="mx-auto mt-3 max-w-sm text-center text-sm leading-relaxed text-zinc-400">
          Pulsa sobre el nombre del proveedor para desplegar el listado de productos
        </p>
      </section>

      {message ? (
        <section className="rounded-2xl bg-white p-4 text-sm text-[#B91C1C] ring-1 ring-zinc-200">{message}</section>
      ) : null}

      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/80">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4">
          <label className="text-xs font-medium text-zinc-500">
            <span className="block text-[10px] uppercase tracking-wider text-zinc-400">Período</span>
            <input
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setExpandedSupplierId(null);
              }}
              className="mt-1 h-11 rounded-2xl border-0 bg-zinc-100 px-4 text-base font-semibold text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
          </label>
          <label className="text-xs font-medium text-zinc-500">
            <span className="block text-[10px] uppercase tracking-wider text-zinc-400">Proveedor</span>
            <select
              value={supplierFilter}
              onChange={(e) => {
                setSupplierFilter(e.target.value);
                setActiveWeek(null);
                setExpandedSupplierId(null);
              }}
              className="mt-1 h-11 rounded-2xl border-0 bg-zinc-100 px-4 text-sm font-semibold text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-900/10"
            >
              <option value="all">Todos</option>
              {monthlyBySupplier.map((s) => (
                <option key={s.supplierId} value={s.supplierId}>
                  {s.supplierName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-zinc-500">
            <span className="block text-[10px] uppercase tracking-wider text-zinc-400">Top N</span>
            <select
              value={String(topN)}
              onChange={(e) => setTopN(Number(e.target.value))}
              className="mt-1 h-11 rounded-2xl border-0 bg-zinc-100 px-4 text-sm font-semibold text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-900/10"
            >
              <option value="5">Top 5</option>
              <option value="10">Top 10</option>
              <option value="15">Top 15</option>
              <option value="20">Top 20</option>
            </select>
          </label>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Total mes</p>
            <p className="text-lg font-black tabular-nums text-zinc-900">{kpis.totalWithVat.toFixed(2)} €</p>
          </div>
          <div className="rounded-2xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Base</p>
            <p className="text-lg font-black tabular-nums text-zinc-900">{kpis.totalBase.toFixed(2)} €</p>
          </div>
          <div className="rounded-2xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">IVA</p>
            <p className="text-lg font-black tabular-nums text-zinc-900">{kpis.totalVat.toFixed(2)} €</p>
          </div>
          <div className="rounded-2xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Pedidos</p>
            <p className="text-lg font-black tabular-nums text-zinc-900">{kpis.orderCount}</p>
          </div>
          <div className="rounded-2xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Ticket medio</p>
            <p className="text-lg font-black tabular-nums text-zinc-900">{kpis.avgTicket.toFixed(2)} €</p>
          </div>
          <div className="rounded-2xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Vs mes ant.</p>
            <p className="text-lg font-black tabular-nums text-zinc-900">
              {kpis.deltaPct == null ? '—' : `${kpis.deltaPct >= 0 ? '+' : ''}${kpis.deltaPct.toFixed(1)}%`}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-100 bg-zinc-50/80 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Top productos por gasto (mes)</p>
            <div className="mt-3 space-y-2">
              {monthlyTopProducts.slice(0, topN).map((p) => (
                <div key={p.productName} className="rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-zinc-900">{p.productName}</p>
                    <p className="shrink-0 text-sm font-black tabular-nums text-zinc-900">{p.spend.toFixed(2)} €</p>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{formatQuantityWithUnit(p.qty, p.unit)}</span>
                    <span>{p.pct.toFixed(1)}% del mes</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
                    <div className="h-full rounded-full bg-[#D32F2F]" style={{ width: `${Math.min(100, p.pct)}%` }} />
                  </div>
                </div>
              ))}
              {monthlyTopProducts.length === 0 ? (
                <p className="text-sm text-zinc-500">Sin productos con gasto en este mes.</p>
              ) : null}
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-100 bg-zinc-50/80 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Resumen semanal</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {weeklySummary.map((w) => (
                <button
                  key={w.week}
                  type="button"
                  onClick={() => setActiveWeek((cur) => (cur === w.week ? null : w.week))}
                  className={[
                    'rounded-lg border px-3 py-1.5 text-xs font-semibold',
                    activeWeek === w.week
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-300 bg-white text-zinc-700',
                  ].join(' ')}
                >
                  Semana {w.week} · {w.total.toFixed(2)} €
                </button>
              ))}
            </div>
            {activeWeek != null ? (
              <div className="mt-3 space-y-2">
                {(weeklySummary.find((w) => w.week === activeWeek)?.topProducts ?? []).map((p) => (
                  <div key={p.name} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 ring-1 ring-zinc-200">
                    <p className="truncate text-sm text-zinc-800">{p.name}</p>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900">{p.spend.toFixed(2)} €</p>
                  </div>
                ))}
                {(weeklySummary.find((w) => w.week === activeWeek)?.topProducts ?? []).length === 0 ? (
                  <p className="text-sm text-zinc-500">Sin datos de productos en esta semana.</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">Toca una semana para ver productos con más gasto.</p>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-100 bg-zinc-50/80 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Top proveedores (rendimiento)</p>
            <div className="mt-3 space-y-2">
              {supplierPerformance.slice(0, topN).map((s) => (
                <div key={s.supplierId} className="rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-zinc-900">{s.supplierName}</p>
                    <p className="shrink-0 text-sm font-black tabular-nums text-zinc-900">{s.spend.toFixed(2)} €</p>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{s.orderCount} pedidos</span>
                    <span>{s.incidencePct.toFixed(1)}% incidencias</span>
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    Desvío pedido/recepción: <span className="font-semibold tabular-nums text-zinc-700">{s.deviation.toFixed(2)} €</span>
                  </div>
                </div>
              ))}
              {supplierPerformance.length === 0 ? (
                <p className="text-sm text-zinc-500">Sin datos de proveedores en este mes.</p>
              ) : null}
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-100 bg-zinc-50/80 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Desvío pedido vs recepción</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">Pedido (estimado)</p>
                <p className="text-lg font-black tabular-nums text-zinc-900">{deviationKpis.requested.toFixed(2)} €</p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">Recepción</p>
                <p className="text-lg font-black tabular-nums text-zinc-900">{deviationKpis.received.toFixed(2)} €</p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">Desvío €</p>
                <p className="text-lg font-black tabular-nums text-zinc-900">{deviationKpis.deviationAbs.toFixed(2)} €</p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">Desvío %</p>
                <p className="text-lg font-black tabular-nums text-zinc-900">{deviationKpis.deviationPct.toFixed(1)}%</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-zinc-600">
              Pedidos con incidencia: <span className="font-semibold text-zinc-900">{deviationKpis.incidents}</span> de{' '}
              <span className="font-semibold text-zinc-900">{deviationKpis.totalOrders}</span>
            </p>
          </div>
        </div>
        <div className="mt-5 space-y-4">
          {displayedSuppliers.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">No hay compras registradas en este mes.</p>
          ) : null}
          {displayedSuppliers.map((supplier) => {
            const open = expandedSupplierId === supplier.supplierId;
            return (
              <div
                key={supplier.supplierId}
                className={[
                  'overflow-hidden rounded-3xl transition-all duration-300 ease-out',
                  open
                    ? 'bg-white shadow-lg shadow-zinc-200/60 ring-2 ring-zinc-900/5'
                    : 'bg-zinc-50/80 ring-1 ring-zinc-200/90 hover:bg-white hover:ring-zinc-300',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedSupplierId((id) => (id === supplier.supplierId ? null : supplier.supplierId))
                  }
                  className="flex w-full flex-col items-center px-6 py-8 text-center outline-none active:bg-zinc-50/50 focus-visible:ring-2 focus-visible:ring-[#D32F2F]/40 focus-visible:ring-offset-2"
                  aria-expanded={open}
                  id={`historial-proveedor-${supplier.supplierId}`}
                >
                  <span className="text-center text-2xl font-semibold leading-[1.15] tracking-tight text-zinc-900 sm:text-[1.75rem] sm:leading-tight">
                    {supplier.supplierName}
                  </span>
                  <span
                    className={`mx-auto mt-4 w-24 ${CHEF_ONE_TAPER_LINE_CLASS}`}
                    aria-hidden
                  />
                  <span className="mt-4 flex items-center gap-1.5 text-xs text-zinc-500">
                    <span className="tabular-nums">{supplier.totalWithVat.toFixed(2)} €</span>
                    <span className="text-zinc-400">·</span>
                    <span>
                      {supplier.orderCount} pedido{supplier.orderCount === 1 ? '' : 's'} · IVA incl.
                    </span>
                  </span>
                  <span className="mt-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#D32F2F]">
                    {open ? 'Ocultar productos' : 'Ver listado de productos'}
                    <ChevronDown
                      className={[
                        'h-4 w-4 transition-transform duration-300',
                        open ? 'rotate-180' : '',
                      ].join(' ')}
                      aria-hidden
                    />
                  </span>
                </button>
                {open ? (
                  <div
                    id={`historial-productos-${supplier.supplierId}`}
                    role="region"
                    aria-labelledby={`historial-proveedor-${supplier.supplierId}`}
                    className="border-t border-zinc-100 bg-gradient-to-b from-zinc-50/90 to-zinc-100/50 px-4 pb-5 pt-4 sm:px-6"
                  >
                    <p className="mb-4 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                      Productos · cantidades del mes
                    </p>
                    <ul className="space-y-2.5">
                      {supplier.products.map((product) => (
                        <li
                          key={`${supplier.supplierId}-${product.name}`}
                          className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-100 bg-white px-4 py-3.5 shadow-sm"
                        >
                          <span className="min-w-0 flex-1 text-left text-[15px] font-medium leading-snug text-zinc-800">
                            {product.name}
                          </span>
                          <span className="shrink-0 text-right text-[15px] font-semibold text-zinc-900">
                            {formatQuantityWithUnit(product.quantity, product.unit as Unit)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
