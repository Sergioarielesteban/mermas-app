'use client';

import Link from 'next/link';
import React from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ClipboardList,
  Download,
  FileText,
  Receipt,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { usePedidosOrders } from '@/components/PedidosOrdersProvider';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { formatQuantityWithUnit, totalsWithVatForOrderListDisplay } from '@/lib/pedidos-format';
import { downloadPedidosHistorialComprasPdf } from '@/lib/pedidos-historial-compras-pdf';
import type { PedidoOrder } from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';

type ViewMode = 'real' | 'previsto';

function accountingYearMonth(order: PedidoOrder, mode: ViewMode): string | null {
  // REAL: solo cuenta cuando entra de verdad al local.
  if (mode === 'real') {
    return order.receivedAt ? order.receivedAt.slice(0, 7) : null;
  }
  // PREVISTO:
  // 1) recibidos por fecha real de recepción
  // 2) pendientes por fecha prevista de entrega
  // 3) fallback técnico enviado/creado
  if (order.receivedAt) return order.receivedAt.slice(0, 7);
  if (order.deliveryDate) return order.deliveryDate.slice(0, 7);
  if (order.sentAt) return order.sentAt.slice(0, 7);
  return order.createdAt.slice(0, 7);
}

export default function PedidosHistorialMesPage() {
  const { localCode, localName, localId, email } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const { orders } = usePedidosOrders();
  const [message, setMessage] = React.useState<string | null>(null);
  const [month, setMonth] = React.useState(() => new Date().toISOString().slice(0, 7));
  const [viewMode, setViewMode] = React.useState<ViewMode>('real');
  const [activeWeek, setActiveWeek] = React.useState<number | null>(null);
  const [supplierFilter, setSupplierFilter] = React.useState<'all' | string>('all');
  const [topN, setTopN] = React.useState(10);
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const accountingOrders = React.useMemo(
    () => orders.filter((row) => row.status === 'sent' || row.status === 'received'),
    [orders],
  );

  const monthlyOrders = React.useMemo(
    () =>
      accountingOrders.filter((order) => {
        return accountingYearMonth(order, viewMode) === month;
      }),
    [accountingOrders, month, viewMode],
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
        return accountingYearMonth(order, viewMode) === previousMonth;
      }),
    [accountingOrders, previousMonth, viewMode],
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
    const deltaTotalEur = Math.round((now.totalWithVat - prev.totalWithVat) * 100) / 100;
    const deltaOrderCount = now.orderCount - prev.orderCount;
    const deltaTicketPct =
      prev.avgTicket > 0
        ? Math.round(((now.avgTicket - prev.avgTicket) / prev.avgTicket) * 1000) / 10
        : null;
    const vatOverBasePct =
      now.totalBase > 0 ? Math.round((now.totalVat / now.totalBase) * 1000) / 10 : 0;
    return {
      ...now,
      deltaPct,
      deltaTotalEur,
      deltaOrderCount,
      deltaTicketPct,
      vatOverBasePct,
    };
  }, [filteredMonthlyOrders, filteredPreviousMonthOrders, totalsForOrders]);

  const compareMonthLabel = React.useMemo(() => {
    const [y, m] = previousMonth.split('-').map(Number);
    if (!y || !m) return '';
    return new Date(y, m - 1, 15).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
  }, [previousMonth]);

  const prevMonthProductSpend = React.useMemo(() => {
    const byName = new Map<string, number>();
    for (const order of filteredPreviousMonthOrders) {
      for (const item of order.items) {
        const qty = order.status === 'received' ? item.receivedQuantity : item.quantity;
        const spend = Math.max(0, qty) * item.pricePerUnit * (1 + item.vatRate);
        const key = item.productName;
        byName.set(key, (byName.get(key) ?? 0) + spend);
      }
    }
    return byName;
  }, [filteredPreviousMonthOrders]);

  const monthlyTopProducts = React.useMemo(() => {
    const byName = new Map<
      string,
      {
        productName: string;
        spend: number;
        qty: number;
        unit: Unit;
        bySupplierSpend: Map<string, number>;
      }
    >();
    for (const order of filteredMonthlyOrders) {
      for (const item of order.items) {
        const qty = order.status === 'received' ? item.receivedQuantity : item.quantity;
        const spend = Math.max(0, qty) * item.pricePerUnit * (1 + item.vatRate);
        const key = item.productName;
        const prev =
          byName.get(key) ?? {
            productName: item.productName,
            spend: 0,
            qty: 0,
            unit: item.unit as Unit,
            bySupplierSpend: new Map<string, number>(),
          };
        prev.spend += spend;
        prev.qty += qty;
        const sn = order.supplierName?.trim() || 'Proveedor';
        prev.bySupplierSpend.set(sn, (prev.bySupplierSpend.get(sn) ?? 0) + spend);
        byName.set(key, prev);
      }
    }
    const total = Array.from(byName.values()).reduce((acc, r) => acc + r.spend, 0);
    return Array.from(byName.values())
      .map((r) => {
        let topSupplier: string | null = null;
        let topSupSpend = 0;
        for (const [name, sp] of r.bySupplierSpend) {
          if (sp > topSupSpend) {
            topSupSpend = sp;
            topSupplier = name;
          }
        }
        const prevSpend = prevMonthProductSpend.get(r.productName) ?? 0;
        const spendMomPct =
          prevSpend > 0 ? Math.round(((r.spend - prevSpend) / prevSpend) * 1000) / 10 : null;
        return {
          productName: r.productName,
          spend: Math.round(r.spend * 100) / 100,
          qty: Math.round(r.qty * 100) / 100,
          unit: r.unit,
          pct: total > 0 ? Math.round((r.spend / total) * 1000) / 10 : 0,
          topSupplierName: topSupplier,
          spendMomPct,
        };
      })
      .sort((a, b) => b.spend - a.spend);
  }, [filteredMonthlyOrders, prevMonthProductSpend]);

  /** Mayor subida de precio unitario ponderado (mismo criterio operativo: líneas del mes vs mes anterior). */
  const topProductsByUnitPriceIncrease = React.useMemo(() => {
    type Agg = { qty: number; sumPxQty: number; unit: Unit };
    const aggregate = (orderRows: PedidoOrder[]) => {
      const m = new Map<string, Agg>();
      for (const order of orderRows) {
        for (const item of order.items) {
          const qty = order.status === 'received' ? item.receivedQuantity : item.quantity;
          const q = Math.max(0, qty);
          if (q <= 0) continue;
          const cur = m.get(item.productName) ?? { qty: 0, sumPxQty: 0, unit: item.unit as Unit };
          cur.qty += q;
          cur.sumPxQty += q * item.pricePerUnit;
          m.set(item.productName, cur);
        }
      }
      return m;
    };
    const nowM = aggregate(filteredMonthlyOrders);
    const prevM = aggregate(filteredPreviousMonthOrders);
    const out: {
      name: string;
      deltaPct: number;
      deltaAbs: number;
      unit: Unit;
      prevAvg: number;
      nowAvg: number;
    }[] = [];
    for (const [name, n] of nowM) {
      if (n.qty <= 0) continue;
      const nowAvg = n.sumPxQty / n.qty;
      const p = prevM.get(name);
      if (!p || p.qty <= 0) continue;
      const prevAvg = p.sumPxQty / p.qty;
      if (prevAvg <= 0) continue;
      const deltaPct = ((nowAvg - prevAvg) / prevAvg) * 100;
      const deltaAbs = nowAvg - prevAvg;
      if (deltaPct >= 0.15 || deltaAbs >= 0.01) {
        out.push({
          name,
          deltaPct: Math.round(deltaPct * 10) / 10,
          deltaAbs: Math.round(deltaAbs * 100) / 100,
          unit: n.unit,
          prevAvg: Math.round(prevAvg * 100) / 100,
          nowAvg: Math.round(nowAvg * 100) / 100,
        });
      }
    }
    return out.sort((a, b) => b.deltaPct - a.deltaPct).slice(0, topN);
  }, [filteredMonthlyOrders, filteredPreviousMonthOrders, topN]);

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

  /** Suma del gasto por proveedor (misma base que cada fila de `supplierPerformance`). */
  const totalGastoProveedoresMes = React.useMemo(
    () => supplierPerformance.reduce((acc, s) => acc + s.spend, 0),
    [supplierPerformance],
  );

  type PurchaseAlertItem = {
    id: string;
    tone: 'amber' | 'rose';
    tag: string;
    title: string;
    lines: string[];
  };

  const purchaseAlerts = React.useMemo((): PurchaseAlertItem[] => {
    const list: PurchaseAlertItem[] = [];
    const totalSpend = supplierPerformance.reduce((acc, s) => acc + s.spend, 0);

    for (const p of topProductsByUnitPriceIncrease.slice(0, 3)) {
      if (p.deltaPct >= 8) {
        list.push({
          id: `pp-${p.name}`,
          tone: 'rose',
          tag: 'Subida precio',
          title: p.name,
          lines: [
            `+${p.deltaPct.toLocaleString('es-ES', { maximumFractionDigits: 1 })}% vs mes anterior`,
            `+${p.deltaAbs.toFixed(2)} €/${p.unit} en unitario`,
          ],
        });
      }
    }

    for (const p of monthlyTopProducts.slice(0, 15)) {
      const prev = prevMonthProductSpend.get(p.productName) ?? 0;
      const delta = p.spend - prev;
      if (prev > 0 && delta >= 200) {
        list.push({
          id: `abs-${p.productName}`,
          tone: 'rose',
          tag: 'Mayor gasto',
          title: p.productName,
          lines: [`+${delta.toFixed(0)} € vs mes anterior`, 'Incremento de compra del producto'],
        });
      }
    }

    const topBySpend = supplierPerformance[0];
    if (topBySpend && totalSpend > 0) {
      const pct = (topBySpend.spend / totalSpend) * 100;
      if (pct >= 35) {
        list.push({
          id: `conc-${topBySpend.supplierId}`,
          tone: 'amber',
          tag: 'Concentración',
          title: topBySpend.supplierName,
          lines: [`${pct.toFixed(0)}% del gasto total`, 'Riesgo de dependencia'],
        });
      }
    }

    if (deviationKpis.deviationPct >= 4 && deviationKpis.requested > 0) {
      list.push({
        id: 'dev-pct',
        tone: 'amber',
        tag: 'Desvío',
        title: 'Pedido / recepción',
        lines: [
          `${deviationKpis.deviationPct.toFixed(1)}% · ${deviationKpis.deviationAbs.toFixed(0)} €`,
          'Cantidades o precios vs pedido',
        ],
      });
    }

    if (deviationKpis.incidents > 0) {
      list.push({
        id: 'inc',
        tone: 'amber',
        tag: 'Acción requerida',
        title:
          deviationKpis.incidents === 1
            ? '1 pedido con incidencias'
            : `${deviationKpis.incidents} pedidos con incidencias`,
        lines: [
          'Revisar recepciones',
          `De ${deviationKpis.totalOrders} pedidos en el período`,
        ],
      });
    }

    const seen = new Set<string>();
    return list.filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
  }, [
    topProductsByUnitPriceIncrease,
    monthlyTopProducts,
    prevMonthProductSpend,
    supplierPerformance,
    deviationKpis,
  ]);

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
      if (accountingYearMonth(order, viewMode) !== month) continue;

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
  }, [accountingOrders, month, viewMode]);

  React.useEffect(() => {
    if (supplierFilter === 'all') return;
    if (!monthlyBySupplier.some((s) => s.supplierId === supplierFilter)) {
      setSupplierFilter('all');
    }
  }, [supplierFilter, monthlyBySupplier]);

  const monthTitle = React.useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return month;
    return new Date(y, m - 1, 15).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  }, [month]);
  const viewModeLabel = viewMode === 'real' ? 'Real (recepción)' : 'Previsto (entrega)';
  const supplierFilterLabel =
    supplierFilter === 'all'
      ? 'Todos los proveedores'
      : monthlyBySupplier.find((s) => s.supplierId === supplierFilter)?.supplierName ?? '—';

  const downloadHistorialPdf = React.useCallback(() => {
    downloadPedidosHistorialComprasPdf({
      localLabel: (localName?.trim() || localCode || 'Local').trim(),
      monthIso: month,
      monthTitle,
      viewModeLabel,
      supplierFilterLabel,
      orders: filteredMonthlyOrders,
      kpis,
      monthlyTopProducts,
      weeklySummary,
      supplierPerformance,
      deviationKpis,
    });
  }, [
    localName,
    localCode,
    month,
    monthTitle,
    viewModeLabel,
    supplierFilterLabel,
    filteredMonthlyOrders,
    kpis,
    monthlyTopProducts,
    weeklySummary,
    supplierPerformance,
    deviationKpis,
  ]);

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
    <div className="min-w-0 space-y-2.5 overflow-x-hidden sm:space-y-3">
      <section>
        <Link
          href="/pedidos"
          className="inline-flex items-center gap-1 py-0.5 text-xs font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline"
        >
          ← Pedidos
        </Link>
      </section>

      <section className="rounded-xl border border-zinc-200/90 bg-white px-2.5 py-2 ring-1 ring-zinc-100 sm:px-3 sm:py-2">
        <h1 className="text-sm font-bold tracking-tight text-zinc-900 sm:text-base">Compras del mes</h1>
        <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">Centro de control · decisión rápida · vista operativa</p>
      </section>

      {message ? (
        <section className="rounded-xl bg-white p-3 text-sm text-[#B91C1C] ring-1 ring-zinc-200">{message}</section>
      ) : null}

      <section className="rounded-xl border border-zinc-200/90 bg-white px-2.5 py-2.5 ring-1 ring-zinc-100 sm:px-3 sm:py-3">
        <div className="grid grid-cols-2 gap-2 border-b border-zinc-100 pb-2.5 sm:grid-cols-3">
          <label className="text-[10px] font-medium text-zinc-500">
            <span className="block uppercase tracking-wide text-zinc-400">Período</span>
            <input
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
              }}
              className="mt-0.5 h-9 w-full rounded-lg border border-zinc-200/90 bg-zinc-50 px-2 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-300 focus:bg-white focus:ring-1 focus:ring-zinc-200"
            />
          </label>
          <label className="text-[10px] font-medium text-zinc-500">
            <span className="block uppercase tracking-wide text-zinc-400">Proveedor</span>
            <select
              value={supplierFilter}
              onChange={(e) => {
                setSupplierFilter(e.target.value);
                setActiveWeek(null);
              }}
              className="mt-0.5 h-9 w-full rounded-lg border border-zinc-200/90 bg-zinc-50 px-2 text-xs font-semibold text-zinc-900 outline-none focus:border-zinc-300 focus:bg-white focus:ring-1 focus:ring-zinc-200"
            >
              <option value="all">Todos</option>
              {monthlyBySupplier.map((s) => (
                <option key={s.supplierId} value={s.supplierId}>
                  {s.supplierName}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className="col-span-2 flex h-9 items-center justify-center gap-1.5 self-end rounded-lg border border-zinc-200/90 bg-zinc-50/90 text-[11px] font-semibold text-zinc-800 transition hover:border-zinc-300 hover:bg-white sm:col-span-1"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-600" aria-hidden />
            Filtros
          </button>
        </div>
        {filtersOpen ? (
          <div className="mt-2 grid grid-cols-2 gap-2 border-b border-zinc-100 pb-3">
            <label className="text-[10px] font-medium text-zinc-500">
              <span className="block uppercase tracking-wide text-zinc-400">Top N</span>
              <select
                value={String(topN)}
                onChange={(e) => setTopN(Number(e.target.value))}
                className="mt-0.5 h-9 w-full rounded-lg border border-zinc-200/90 bg-zinc-50 px-2 text-xs font-semibold text-zinc-900 outline-none focus:border-zinc-300 focus:bg-white focus:ring-1 focus:ring-zinc-200"
              >
                <option value="5">Top 5</option>
                <option value="10">Top 10</option>
                <option value="15">Top 15</option>
                <option value="20">Top 20</option>
              </select>
            </label>
            <label className="text-[10px] font-medium text-zinc-500">
              <span className="block uppercase tracking-wide text-zinc-400">Modo</span>
              <select
                value={viewMode}
                onChange={(e) => {
                  setViewMode(e.target.value as ViewMode);
                  setActiveWeek(null);
                }}
                className="mt-0.5 h-9 w-full rounded-lg border border-zinc-200/90 bg-zinc-50 px-2 text-xs font-semibold text-zinc-900 outline-none focus:border-zinc-300 focus:bg-white focus:ring-1 focus:ring-zinc-200"
              >
                <option value="real">Real (recepción)</option>
                <option value="previsto">Previsto (entrega)</option>
              </select>
            </label>
            <p className="col-span-2 text-[10px] leading-snug text-zinc-500">
              {viewMode === 'real'
                ? 'Real: solo pedidos recibidos (entrada al local).'
                : 'Previsto: recibidos por fecha real y pendientes por entrega prevista.'}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[11px] leading-snug text-zinc-500">
            {viewMode === 'real'
              ? 'Real: solo pedidos recibidos (entrada al local).'
              : 'Previsto: recibidos por fecha real y pendientes por entrega prevista.'}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={downloadHistorialPdf}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#D32F2F] px-3 text-xs font-semibold text-white ring-1 ring-[#B91C1C]/30"
          >
            <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Informe PDF completo
          </button>
        </div>
      </section>

      <section
        className="rounded-xl border border-zinc-200/85 bg-white px-2.5 py-2 ring-1 ring-zinc-100 sm:px-3 sm:py-2.5"
        aria-label="Indicadores del mes"
      >
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Resumen del período</p>
        <div className="grid min-w-0 grid-cols-2 gap-1.5 sm:gap-2">
          <div className="relative overflow-hidden rounded-lg bg-gradient-to-b from-zinc-50 to-white px-2 py-1 ring-1 ring-zinc-200/75">
            <ShoppingCart className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-[#C62828]/90" aria-hidden />
            <p className="pr-6 text-[8px] font-semibold uppercase tracking-wide text-zinc-500">Total mes</p>
            <p className="text-[13px] font-bold tabular-nums leading-tight text-zinc-900">{kpis.totalWithVat.toFixed(2)} €</p>
            <p className="text-[9px] text-zinc-500">IVA incl.</p>
            {kpis.deltaPct != null && compareMonthLabel ? (
              <p
                className={[
                  'mt-0.5 text-[9px] font-semibold tabular-nums leading-tight',
                  kpis.deltaPct <= 0 ? 'text-emerald-600' : 'text-rose-600',
                ].join(' ')}
              >
                {kpis.deltaPct >= 0 ? '+' : ''}
                {kpis.deltaPct.toFixed(1)}% vs {compareMonthLabel}
                <span className="block font-normal text-zinc-500">
                  ({kpis.deltaTotalEur >= 0 ? '+' : ''}
                  {kpis.deltaTotalEur.toFixed(2)} €)
                </span>
              </p>
            ) : null}
          </div>
          <div className="relative overflow-hidden rounded-lg bg-gradient-to-b from-zinc-50 to-white px-2 py-1 ring-1 ring-zinc-200/75">
            <FileText className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-amber-600/90" aria-hidden />
            <p className="pr-6 text-[8px] font-semibold uppercase tracking-wide text-zinc-500">Base</p>
            <p className="text-[13px] font-bold tabular-nums leading-tight text-zinc-900">{kpis.totalBase.toFixed(2)} €</p>
            <p className="text-[9px] text-zinc-500">Sin IVA</p>
          </div>
          <div className="relative overflow-hidden rounded-lg bg-gradient-to-b from-zinc-50 to-white px-2 py-1 ring-1 ring-zinc-200/75">
            <Receipt className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-emerald-600/85" aria-hidden />
            <p className="pr-6 text-[8px] font-semibold uppercase tracking-wide text-zinc-500">IVA</p>
            <p className="text-[13px] font-bold tabular-nums leading-tight text-zinc-900">{kpis.totalVat.toFixed(2)} €</p>
            <p className="text-[9px] tabular-nums text-zinc-500">
              {kpis.vatOverBasePct > 0 ? `${kpis.vatOverBasePct.toFixed(2)}% s/ base` : '—'}
            </p>
          </div>
          <div className="relative overflow-hidden rounded-lg bg-gradient-to-b from-zinc-50 to-white px-2 py-1 ring-1 ring-zinc-200/75">
            <ClipboardList className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-sky-600/90" aria-hidden />
            <p className="pr-6 text-[8px] font-semibold uppercase tracking-wide text-zinc-500">Pedidos</p>
            <p className="text-[13px] font-bold tabular-nums leading-tight text-zinc-900">{kpis.orderCount}</p>
            <p className="text-[9px] text-zinc-500">En el período</p>
            {compareMonthLabel ? (
              <p
                className={[
                  'mt-0.5 text-[9px] font-semibold tabular-nums',
                  kpis.deltaOrderCount <= 0 ? 'text-emerald-600' : 'text-rose-600',
                ].join(' ')}
              >
                {kpis.deltaOrderCount >= 0 ? '+' : ''}
                {kpis.deltaOrderCount} vs {compareMonthLabel}
              </p>
            ) : null}
          </div>
          <div className="relative overflow-hidden rounded-lg bg-gradient-to-b from-zinc-50 to-white px-2 py-1 ring-1 ring-zinc-200/75">
            <BarChart3 className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-violet-600/85" aria-hidden />
            <p className="pr-6 text-[8px] font-semibold uppercase tracking-wide text-zinc-500">Ticket medio</p>
            <p className="text-[13px] font-bold tabular-nums leading-tight text-zinc-900">{kpis.avgTicket.toFixed(2)} €</p>
            <p className="text-[9px] text-zinc-500">Por pedido</p>
            {kpis.deltaTicketPct != null && compareMonthLabel ? (
              <p
                className={[
                  'mt-0.5 text-[9px] font-semibold tabular-nums',
                  kpis.deltaTicketPct <= 0 ? 'text-emerald-600' : 'text-rose-600',
                ].join(' ')}
              >
                {kpis.deltaTicketPct >= 0 ? '+' : ''}
                {kpis.deltaTicketPct.toFixed(1)}% vs {compareMonthLabel}
              </p>
            ) : null}
          </div>
          <div
            className={[
              'relative overflow-hidden rounded-lg px-2 py-1 ring-1',
              kpis.deltaPct != null && kpis.deltaPct <= 0
                ? 'bg-emerald-50/50 ring-emerald-200/70'
                : kpis.deltaPct != null && kpis.deltaPct > 0
                  ? 'bg-rose-50/40 ring-rose-200/60'
                  : 'bg-gradient-to-b from-zinc-50 to-white ring-zinc-200/75',
            ].join(' ')}
          >
            {kpis.deltaPct == null ? (
              <TrendingUp className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-zinc-400" aria-hidden />
            ) : kpis.deltaPct <= 0 ? (
              <TrendingDown className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-emerald-600" aria-hidden />
            ) : (
              <TrendingUp className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-rose-600/80" aria-hidden />
            )}
            <p className="pr-6 text-[8px] font-semibold uppercase tracking-wide text-zinc-600">Vs mes ant.</p>
            <p
              className={[
                'text-[13px] font-bold tabular-nums leading-tight',
                kpis.deltaPct == null
                  ? 'text-zinc-800'
                  : kpis.deltaPct <= 0
                    ? 'text-emerald-800'
                    : 'text-rose-800',
              ].join(' ')}
            >
              {kpis.deltaPct == null ? '—' : `${kpis.deltaPct >= 0 ? '+' : ''}${kpis.deltaPct.toFixed(1)}%`}
            </p>
            {kpis.deltaPct != null && compareMonthLabel ? (
              <p className="text-[9px] font-semibold tabular-nums text-zinc-600">
                ({kpis.deltaTotalEur >= 0 ? '+' : ''}
                {kpis.deltaTotalEur.toFixed(2)} €)
              </p>
            ) : (
              <p className="text-[9px] text-zinc-500">Total IVA incl.</p>
            )}
          </div>
        </div>
      </section>

      <section
        className="mt-3 rounded-xl border border-zinc-200/85 bg-white px-2.5 py-2.5 ring-1 ring-zinc-100 sm:px-3 sm:py-3"
        aria-label="Total de compras por proveedor"
      >
        <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-800">Total por proveedor</h2>
        <p className="mt-0.5 text-[10px] text-zinc-500">
          Cuánto lleva gastado cada proveedor este período (IVA incl., mismo criterio que el resto de la pantalla).
        </p>
        {supplierPerformance.length === 0 ? (
          <p className="mt-2 text-[11px] text-zinc-500">Sin compras por proveedor en este filtro.</p>
        ) : (
          <>
            <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200/75 bg-zinc-50/50 ring-1 ring-zinc-100/85">
              {supplierPerformance.map((s) => {
                const pctDelTotal =
                  totalGastoProveedoresMes > 0 ? (s.spend / totalGastoProveedoresMes) * 100 : 0;
                return (
                  <li
                    key={s.supplierId}
                    className="flex min-w-0 items-center justify-between gap-2 px-2.5 py-1.5 first:rounded-t-[0.65rem] last:rounded-b-[0.65rem] sm:px-3 sm:py-2"
                  >
                    <p className="min-w-0 truncate text-[12px] font-semibold text-zinc-900" title={s.supplierName}>
                      {s.supplierName}
                    </p>
                    <div className="shrink-0 text-right leading-tight">
                      <p className="text-[13px] font-bold tabular-nums text-zinc-900">{s.spend.toFixed(2)} €</p>
                      <p className="text-[9px] font-medium tabular-nums text-zinc-500">
                        {totalGastoProveedoresMes > 0 ? `${pctDelTotal.toFixed(1)}% del total mes` : '—'}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[10px] tabular-nums text-zinc-500">
              <span className="font-semibold text-zinc-700">{supplierPerformance.length}</span> proveedor
              {supplierPerformance.length === 1 ? '' : 'es'} · suma{' '}
              <span className="font-semibold text-zinc-800">{totalGastoProveedoresMes.toFixed(2)} €</span>
            </p>
          </>
        )}
      </section>

      <section
        className="mt-3 rounded-xl border border-amber-200/45 bg-gradient-to-br from-amber-50/50 via-white to-rose-50/35 px-2.5 py-2 ring-1 ring-amber-100/65 sm:px-3 sm:py-2.5"
        aria-label="Alertas de compra"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-800">Alertas de compra</h2>
            <p className="text-[10px] text-zinc-500">Subidas, gasto, concentración, desvíos e incidencias.</p>
          </div>
          <Sparkles className="h-4 w-4 shrink-0 text-amber-600/85" aria-hidden />
        </div>
        {purchaseAlerts.length === 0 ? (
          <p className="mt-2 text-[11px] text-zinc-600">Sin alertas destacadas en este filtro.</p>
        ) : (
          <ul className="mt-2 max-h-[min(52vh,22rem)] space-y-1.5 overflow-y-auto overscroll-contain pr-0.5 [-webkit-overflow-scrolling:touch]">
            {purchaseAlerts.map((a) => (
              <li
                key={a.id}
                className={[
                  'flex gap-2 rounded-lg px-2 py-1.5 ring-1',
                  a.tone === 'rose'
                    ? 'bg-white/95 ring-rose-200/55 shadow-[0_1px_2px_rgba(0,0,0,0.03)]'
                    : 'bg-white/95 ring-amber-200/50 shadow-[0_1px_2px_rgba(0,0,0,0.03)]',
                ].join(' ')}
              >
                <AlertTriangle
                  className={[
                    'mt-0.5 h-3.5 w-3.5 shrink-0',
                    a.tone === 'rose' ? 'text-rose-600/90' : 'text-amber-600/90',
                  ].join(' ')}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span
                      className={[
                        'inline-flex rounded-full px-1.5 py-px text-[8px] font-bold uppercase tracking-wide',
                        a.tone === 'rose'
                          ? 'bg-rose-100/95 text-rose-900 ring-1 ring-rose-200/60'
                          : 'bg-amber-100/95 text-amber-950 ring-1 ring-amber-200/55',
                      ].join(' ')}
                    >
                      {a.tag}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-[11px] font-bold leading-snug text-zinc-900">{a.title}</p>
                  </div>
                  <p className="mt-0.5 text-[10px] leading-snug text-zinc-600">{a.lines.join(' · ')}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-3 min-w-0 rounded-xl border border-zinc-200/85 bg-white px-2.5 py-2.5 ring-1 ring-zinc-100 sm:px-3 sm:py-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-800">Top productos por gasto</h2>
          <p className="mt-0.5 text-[10px] text-zinc-500">Mayor impacto en compras del período (IVA incl.).</p>
          <div className="mt-2 space-y-1.5">
            {monthlyTopProducts.slice(0, topN).map((p, idx) => {
              const rank = idx + 1;
              const badgeClass =
                rank === 1
                  ? 'bg-[#D32F2F]/15 text-[#B71C1C] ring-[#D32F2F]/25'
                  : rank === 2
                    ? 'bg-zinc-200/80 text-zinc-800 ring-zinc-300/70'
                    : rank === 3
                      ? 'bg-orange-100/70 text-orange-900 ring-orange-200/60'
                      : 'bg-zinc-100/80 text-zinc-600 ring-zinc-200/70';
              const mom = p.spendMomPct;
              return (
                <div
                  key={p.productName}
                  className="min-w-0 rounded-lg bg-white px-2 py-1.5 ring-1 ring-zinc-200/70"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={[
                        'mt-0.5 inline-flex h-5 min-w-[1.5rem] shrink-0 items-center justify-center rounded-md text-[10px] font-black tabular-nums ring-1',
                        badgeClass,
                      ].join(' ')}
                    >
                      #{rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="min-w-0 truncate text-[12px] font-semibold leading-tight text-zinc-900" title={p.productName}>
                          {p.productName}
                        </p>
                        <p className="shrink-0 text-[12px] font-bold tabular-nums text-zinc-900">{p.spend.toFixed(2)} €</p>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
                        <span>{formatQuantityWithUnit(p.qty, p.unit)}</span>
                        {p.topSupplierName ? (
                          <span className="min-w-0 truncate text-zinc-600" title={p.topSupplierName}>
                            · {p.topSupplierName}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-0.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#D32F2F]/55 to-[#D32F2F]"
                            style={{ width: `${Math.min(100, p.pct)}%` }}
                          />
                        </div>
                        {mom == null ? (
                          <span className="shrink-0 text-[10px] tabular-nums text-zinc-400">—</span>
                        ) : (
                          <span
                            className={[
                              'inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold tabular-nums',
                              mom > 0 ? 'text-rose-600' : mom < 0 ? 'text-emerald-700' : 'text-zinc-500',
                            ].join(' ')}
                          >
                            {mom > 0 ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : null}
                            {mom < 0 ? <ArrowDownRight className="h-3 w-3" aria-hidden /> : null}
                            {mom > 0 ? '+' : ''}
                            {mom.toFixed(1)}%
                          </span>
                        )}
                        <span className="shrink-0 tabular-nums text-[9px] text-zinc-400">{p.pct.toFixed(1)}% mes</span>
                      </div>
                      <p className="mt-0.5 text-[9px] tabular-nums text-zinc-400">Participación sobre el gasto del período</p>
                    </div>
                  </div>
                </div>
              );
            })}
            {monthlyTopProducts.length === 0 ? (
              <p className="text-sm text-zinc-500">Sin productos con gasto en este mes.</p>
            ) : null}
          </div>
      </section>

      <section className="mt-3 min-w-0 rounded-xl border border-zinc-200/85 bg-white px-2.5 py-2.5 ring-1 ring-zinc-100 sm:px-3 sm:py-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-800">Mayor subida de precio</h2>
          <p className="mt-0.5 text-[10px] text-zinc-500">Precio unitario medio ponderado vs. mes anterior.</p>
          <div className="mt-2 space-y-1">
            {topProductsByUnitPriceIncrease.slice(0, Math.min(10, topN)).map((p, idx) => (
              <div
                key={p.name}
                className="flex min-w-0 items-center gap-2 rounded-lg border border-zinc-100/95 bg-zinc-50/40 px-2 py-1.5 ring-1 ring-zinc-100/90"
              >
                <span className="w-6 shrink-0 text-center text-[10px] font-black tabular-nums text-zinc-400">{idx + 1}</span>
                <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-zinc-900" title={p.name}>
                  {p.name}
                </p>
                <div className="shrink-0 text-right leading-tight">
                  <p className="text-[12px] font-bold tabular-nums text-rose-700">
                    +{p.deltaPct.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%
                  </p>
                  <p className="text-[9px] font-medium tabular-nums text-zinc-500">
                    {p.deltaAbs >= 0 ? '+' : ''}
                    {p.deltaAbs.toFixed(2)} €/{p.unit}
                  </p>
                </div>
              </div>
            ))}
            {topProductsByUnitPriceIncrease.length === 0 ? (
              <p className="text-[11px] text-zinc-500">Sin subidas relevantes vs. el mes anterior.</p>
            ) : null}
          </div>
      </section>

      <section className="mt-3 min-w-0 rounded-xl border border-zinc-200/85 bg-white px-2.5 py-2.5 ring-1 ring-zinc-100 sm:px-3 sm:py-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-800">Top proveedores</h2>
          <p className="mt-0.5 text-[10px] text-zinc-500">Gasto, pedidos, incidencias y desviación pedido / recepción.</p>
          {supplierPerformance.length === 0 ? (
            <p className="mt-2 text-[11px] text-zinc-500">Sin datos de proveedores en este mes.</p>
          ) : (
            <div className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200/80 bg-zinc-50/30 ring-1 ring-zinc-100/90">
              {(() => {
                const maxSp = supplierPerformance[0]?.spend ?? 1;
                return supplierPerformance.slice(0, topN).map((s, i) => (
                  <div key={s.supplierId} className="flex min-w-0 items-center gap-2 px-2.5 py-2 sm:gap-3 sm:px-3">
                    <span className="w-5 shrink-0 text-center text-[10px] font-black tabular-nums text-zinc-400">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-bold leading-tight text-zinc-900">{s.supplierName}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
                        <span>{s.orderCount} ped.</span>
                        <span
                          className={[
                            'font-semibold tabular-nums',
                            s.incidencePct >= 15 ? 'text-rose-700' : s.incidencePct > 0 ? 'text-amber-800' : 'text-emerald-700',
                          ].join(' ')}
                        >
                          {s.incidencePct.toFixed(0)}% incid.
                        </span>
                        <span className="tabular-nums text-zinc-600">Δ {s.deviation.toFixed(0)} €</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-black tabular-nums text-zinc-900">{s.spend.toFixed(2)} €</p>
                      <div className="mt-1 ml-auto h-1 w-14 overflow-hidden rounded-full bg-zinc-200/80">
                        <div
                          className="h-full rounded-full bg-[#D32F2F]/78"
                          style={{ width: `${maxSp > 0 ? Math.min(100, (s.spend / maxSp) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
      </section>

        <div
          className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl border border-zinc-200/70 bg-zinc-100/50 px-3 py-2 text-[10px] text-zinc-700 ring-1 ring-zinc-100"
          role="status"
        >
          <span>
            <span className="font-semibold text-zinc-900">Desvío ped./recep.</span>{' '}
            <span className="tabular-nums">{deviationKpis.deviationAbs.toFixed(2)} €</span>
          </span>
          <span className="hidden h-3 w-px bg-zinc-300 sm:block" aria-hidden />
          <span>
            <span className="font-semibold text-zinc-900">Desvío %</span>{' '}
            <span className="tabular-nums">{deviationKpis.deviationPct.toFixed(1)}%</span>
          </span>
          <span className="hidden h-3 w-px bg-zinc-300 sm:block" aria-hidden />
          <span>
            <span className="font-semibold text-zinc-900">Pedidos con incidencia</span>{' '}
            <span className="tabular-nums">
              {deviationKpis.incidents} de {deviationKpis.totalOrders}
            </span>
          </span>
        </div>

        <section className="mt-3 min-w-0 rounded-xl border border-zinc-200/85 bg-white px-2.5 py-2.5 ring-1 ring-zinc-100 sm:px-3 sm:py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-700">Resumen semanal</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {weeklySummary.map((w) => (
                <button
                  key={w.week}
                  type="button"
                  onClick={() => setActiveWeek((cur) => (cur === w.week ? null : w.week))}
                  className={[
                    'rounded-md border px-2 py-1 text-[11px] font-semibold',
                    activeWeek === w.week
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-200 bg-white text-zinc-700',
                  ].join(' ')}
                >
                  S{w.week} · {w.total.toFixed(0)} €
                </button>
              ))}
            </div>
            {activeWeek != null ? (
              <div className="mt-2 space-y-1">
                {(weeklySummary.find((w) => w.week === activeWeek)?.topProducts ?? []).map((p) => (
                  <div key={p.name} className="flex items-center justify-between rounded-lg bg-white px-2 py-1.5 ring-1 ring-zinc-200/80">
                    <p className="truncate text-[11px] text-zinc-800">{p.name}</p>
                    <p className="shrink-0 text-[11px] font-semibold tabular-nums text-zinc-900">{p.spend.toFixed(2)} €</p>
                  </div>
                ))}
                {(weeklySummary.find((w) => w.week === activeWeek)?.topProducts ?? []).length === 0 ? (
                  <p className="text-xs text-zinc-500">Sin datos en esta semana.</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-zinc-500">Toca una semana para el detalle.</p>
            )}
          </div>
        </section>

        <section className="mt-3 rounded-xl border border-zinc-200/80 bg-zinc-50/50 px-2.5 py-2.5 ring-1 ring-zinc-100 sm:px-3 sm:py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-700">Evolución de precios</h2>
              <p className="mt-0.5 max-w-md text-[10px] leading-snug text-zinc-500">
                Análisis avanzado: curvas, histórico y comparativas (fuera de este resumen).
              </p>
            </div>
            <Link
              href="/pedidos/precios"
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-zinc-300/90 bg-white px-3 text-[11px] font-semibold text-zinc-800 shadow-sm transition hover:border-zinc-400 hover:bg-zinc-50"
            >
              Abrir análisis
            </Link>
          </div>
        </section>
    </div>
  );
}
