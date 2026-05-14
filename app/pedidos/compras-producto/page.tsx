'use client';

import Link from 'next/link';
import React from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  Download,
  FileText,
  Filter,
  Package,
  ReceiptText,
  Search,
  ShoppingCart,
  Tags,
  Truck,
  Users,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { usePedidosOrders } from '@/components/PedidosOrdersProvider';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { formatQuantityWithUnit, unitPriceCatalogSuffix } from '@/lib/pedidos-format';
import { orderLineDisplayName } from '@/lib/pedidos-line-display-name';
import { markPedidosUiSkipRestoreOnce } from '@/lib/pedidos-ui-session';
import {
  effectiveReceivedWeightKgForReception,
  receptionBillsByWeight,
  receptionLineTotals,
  type PedidoOrder,
  type PedidoOrderItem,
} from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';

type PeriodKey = 'current-week' | 'last-week' | 'last-4-weeks' | 'current-month';
type SupplierFilter = 'all' | string;
type CategoryFilter = 'all' | string;

type DateRange = {
  start: Date;
  end: Date;
  label: string;
  comparisonLabel: string;
};

type PurchaseBasis = {
  quantity: number;
  unit: Unit;
  baseTotal: number;
  totalWithVat: number;
};

type ProductAgg = {
  key: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  unit: Unit;
  quantity: number;
  baseTotal: number;
  totalWithVat: number;
  orderIds: Set<string>;
  prevQuantity: number;
  prevTotalWithVat: number;
};

type SupplierAgg = {
  key: string;
  supplierId: string;
  supplierName: string;
  totalWithVat: number;
  prevTotalWithVat: number;
  orderIds: Set<string>;
  products: ProductAgg[];
};

type AggregatedPurchases = {
  suppliers: SupplierAgg[];
  totalWithVat: number;
  totalBase: number;
  productCount: number;
  supplierCount: number;
  orderCount: number;
  previousTotalWithVat: number;
  previousProductCount: number;
  previousSupplierCount: number;
  previousOrderCount: number;
};

const PERIOD_OPTIONS: Array<{ value: PeriodKey; label: string }> = [
  { value: 'current-week', label: 'Semana actual' },
  { value: 'last-week', label: 'Semana pasada' },
  { value: 'last-4-weeks', label: 'Últimas 4 semanas' },
  { value: 'current-month', label: 'Mes actual' },
];

const EURO_FORMATTER = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUMBER_FORMATTER = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfMondayWeek(date: Date): Date {
  const d = startOfLocalDay(date);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(d, offset);
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function formatRange(start: Date, endExclusive: Date): string {
  const end = addDays(endExclusive, -1);
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${start.getDate()} – ${formatShortDate(end)} ${end.getFullYear()}`;
  }
  return `${formatShortDate(start)} – ${formatShortDate(end)} ${end.getFullYear()}`;
}

function getPeriodRange(period: PeriodKey, now = new Date()): DateRange {
  const today = startOfLocalDay(now);
  const weekStart = startOfMondayWeek(today);

  if (period === 'last-week') {
    const start = addDays(weekStart, -7);
    const end = weekStart;
    const prevStart = addDays(start, -7);
    return {
      start,
      end,
      label: formatRange(start, end),
      comparisonLabel: formatRange(prevStart, start),
    };
  }

  if (period === 'last-4-weeks') {
    const end = addDays(today, 1);
    const start = addDays(end, -28);
    const prevStart = addDays(start, -28);
    return {
      start,
      end,
      label: `${formatShortDate(start)} – ${formatShortDate(addDays(end, -1))}`,
      comparisonLabel: `${formatShortDate(prevStart)} – ${formatShortDate(addDays(start, -1))}`,
    };
  }

  if (period === 'current-month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return {
      start,
      end,
      label: start.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
      comparisonLabel: prevStart.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
    };
  }

  const start = weekStart;
  const end = addDays(weekStart, 7);
  const prevStart = addDays(start, -7);
  return {
    start,
    end,
    label: formatRange(start, end),
    comparisonLabel: formatRange(prevStart, start),
  };
}

function getPreviousRange(range: DateRange): DateRange {
  const days = Math.round((range.end.getTime() - range.start.getTime()) / 86_400_000);
  const start = addDays(range.start, -days);
  const end = range.start;
  return {
    start,
    end,
    label: formatRange(start, end),
    comparisonLabel: '',
  };
}

function orderReceivedDate(order: PedidoOrder): Date | null {
  if (order.status !== 'received' || !order.receivedAt) return null;
  const d = new Date(order.receivedAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isInsideRange(date: Date, range: DateRange): boolean {
  return date >= range.start && date < range.end;
}

function initialsForSupplier(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'PR';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}

function formatMoney(value: number): string {
  return EURO_FORMATTER.format(Math.round(value * 100) / 100);
}

function formatNumber(value: number): string {
  return NUMBER_FORMATTER.format(Math.round(value * 100) / 100);
}

function formatPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'Sin comparativa';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function pctDelta(current: number, previous: number): number | null {
  if (!(previous > 0)) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function categoryForItem(_item: PedidoOrderItem): string {
  return 'Sin categoría';
}

function itemPurchaseBasis(item: PedidoOrderItem): PurchaseBasis | null {
  if (item.incidentType === 'missing') return null;

  if (receptionBillsByWeight(item)) {
    const kg = effectiveReceivedWeightKgForReception(item);
    const price =
      item.receivedPricePerKg != null && Number.isFinite(item.receivedPricePerKg) && item.receivedPricePerKg > 0
        ? item.receivedPricePerKg
        : item.pricePerBillingUnit != null && Number.isFinite(item.pricePerBillingUnit) && item.pricePerBillingUnit > 0
          ? item.pricePerBillingUnit
          : item.pricePerUnit;

    if (kg != null && kg > 0) {
      const baseTotal = Math.round(kg * price * 100) / 100;
      return {
        quantity: kg,
        unit: 'kg',
        baseTotal,
        totalWithVat: Math.round(baseTotal * (1 + item.vatRate) * 100) / 100,
      };
    }
  }

  const qty = item.receivedQuantity > 0 ? item.receivedQuantity : item.quantity;
  if (!(qty > 0)) return null;
  const totals = receptionLineTotals(item);
  const fallbackBase = Math.round(qty * item.pricePerUnit * 100) / 100;
  const baseTotal = totals.lineTotal > 0 ? totals.lineTotal : fallbackBase;
  return {
    quantity: qty,
    unit: item.unit,
    baseTotal,
    totalWithVat: Math.round(baseTotal * (1 + item.vatRate) * 100) / 100,
  };
}

function productSearchMatches(productName: string, supplierName: string, search: string): boolean {
  const q = normalizeText(search);
  if (!q) return true;
  return normalizeText(productName).includes(q) || normalizeText(supplierName).includes(q);
}

function buildCurrentMap(orders: PedidoOrder[], range: DateRange, supplierFilter: SupplierFilter, categoryFilter: CategoryFilter, search: string) {
  const supplierMap = new Map<string, SupplierAgg>();
  const productMap = new Map<string, ProductAgg>();
  const orderIds = new Set<string>();
  let totalWithVat = 0;
  let totalBase = 0;

  for (const order of orders) {
    const receivedAt = orderReceivedDate(order);
    if (!receivedAt || !isInsideRange(receivedAt, range)) continue;
    if (supplierFilter !== 'all' && order.supplierId !== supplierFilter) continue;

    let orderIncluded = false;
    const supplierName = order.supplierName?.trim() || 'Proveedor';

    for (const item of order.items) {
      if (categoryFilter !== 'all' && categoryForItem(item) !== categoryFilter) continue;
      const productName = orderLineDisplayName(item, null);
      if (!productSearchMatches(productName, supplierName, search)) continue;
      const basis = itemPurchaseBasis(item);
      if (!basis) continue;

      const supplierKey = order.supplierId || supplierName;
      const productKey = `${supplierKey}::${normalizeText(productName)}::${basis.unit}`;
      const product =
        productMap.get(productKey) ??
        {
          key: productKey,
          productName,
          supplierId: order.supplierId,
          supplierName,
          unit: basis.unit,
          quantity: 0,
          baseTotal: 0,
          totalWithVat: 0,
          orderIds: new Set<string>(),
          prevQuantity: 0,
          prevTotalWithVat: 0,
        };

      product.quantity += basis.quantity;
      product.baseTotal += basis.baseTotal;
      product.totalWithVat += basis.totalWithVat;
      product.orderIds.add(order.id);
      productMap.set(productKey, product);

      const supplier =
        supplierMap.get(supplierKey) ??
        {
          key: supplierKey,
          supplierId: order.supplierId,
          supplierName,
          totalWithVat: 0,
          prevTotalWithVat: 0,
          orderIds: new Set<string>(),
          products: [],
        };
      supplier.totalWithVat += basis.totalWithVat;
      supplier.orderIds.add(order.id);
      supplierMap.set(supplierKey, supplier);

      totalBase += basis.baseTotal;
      totalWithVat += basis.totalWithVat;
      orderIncluded = true;
    }

    if (orderIncluded) orderIds.add(order.id);
  }

  for (const product of productMap.values()) {
    const supplier = supplierMap.get(product.supplierId || product.supplierName);
    if (supplier) supplier.products.push(product);
  }

  return { supplierMap, productMap, orderIds, totalWithVat, totalBase };
}

function aggregatePurchases(
  orders: PedidoOrder[],
  range: DateRange,
  previousRange: DateRange,
  supplierFilter: SupplierFilter,
  categoryFilter: CategoryFilter,
  search: string,
  onlyChanged: boolean,
): AggregatedPurchases {
  const current = buildCurrentMap(orders, range, supplierFilter, categoryFilter, search);
  const previous = buildCurrentMap(orders, previousRange, supplierFilter, categoryFilter, search);

  for (const [key, product] of current.productMap) {
    const prev = previous.productMap.get(key);
    if (!prev) continue;
    product.prevQuantity = prev.quantity;
    product.prevTotalWithVat = prev.totalWithVat;
  }
  for (const [key, supplier] of current.supplierMap) {
    const prev = previous.supplierMap.get(key);
    supplier.prevTotalWithVat = prev?.totalWithVat ?? 0;
  }

  const suppliers = Array.from(current.supplierMap.values())
    .map((supplier) => {
      const products = supplier.products
        .filter((product) => {
          if (!onlyChanged) return true;
          return Math.abs(product.quantity - product.prevQuantity) > 0.001 || Math.abs(product.totalWithVat - product.prevTotalWithVat) > 0.01;
        })
        .sort((a, b) => b.totalWithVat - a.totalWithVat);
      return {
        ...supplier,
        products,
        totalWithVat: products.reduce((acc, product) => acc + product.totalWithVat, 0),
        prevTotalWithVat: products.reduce((acc, product) => acc + product.prevTotalWithVat, 0),
      };
    })
    .filter((supplier) => supplier.products.length > 0)
    .sort((a, b) => b.totalWithVat - a.totalWithVat);

  const productCount = suppliers.reduce((acc, supplier) => acc + supplier.products.length, 0);
  const supplierCount = suppliers.length;
  const orderIds = new Set<string>();
  for (const supplier of suppliers) {
    for (const id of supplier.orderIds) orderIds.add(id);
  }

  return {
    suppliers,
    totalWithVat: suppliers.reduce((acc, supplier) => acc + supplier.totalWithVat, 0),
    totalBase: current.totalBase,
    productCount,
    supplierCount,
    orderCount: orderIds.size,
    previousTotalWithVat: previous.totalWithVat,
    previousProductCount: previous.productMap.size,
    previousSupplierCount: previous.supplierMap.size,
    previousOrderCount: previous.orderIds.size,
  };
}

function purchaseSortForFilters(orders: PedidoOrder[], range: DateRange): Array<{ id: string; name: string }> {
  const suppliers = new Map<string, string>();
  for (const order of orders) {
    const receivedAt = orderReceivedDate(order);
    if (!receivedAt || !isInsideRange(receivedAt, range)) continue;
    suppliers.set(order.supplierId, order.supplierName?.trim() || 'Proveedor');
  }
  return Array.from(suppliers.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function productQuantityDeltaLabel(product: ProductAgg): string {
  const delta = Math.round((product.quantity - product.prevQuantity) * 100) / 100;
  if (product.prevQuantity <= 0 && product.quantity > 0) return 'Nuevo';
  if (Math.abs(delta) < 0.001) return 'Sin cambios';
  const sign = delta > 0 ? '+' : '-';
  return `${sign}${formatQuantityWithUnit(Math.abs(delta), product.unit)}`;
}

function variationTone(value: number | null, zeroClass = 'text-zinc-500'): string {
  if (value == null || Math.abs(value) < 0.001) return zeroClass;
  return value > 0 ? 'text-emerald-700' : 'text-[#D32F2F]';
}

function CsvButton({
  suppliers,
  periodLabel,
}: {
  suppliers: SupplierAgg[];
  periodLabel: string;
}) {
  const onExportCsv = React.useCallback(() => {
    const rows = [
      ['Proveedor', 'Producto', 'Cantidad', 'Unidad', 'Total IVA incluido', 'Precio medio sin IVA', 'Variación cantidad'],
    ];
    for (const supplier of suppliers) {
      for (const product of supplier.products) {
        const avg = product.quantity > 0 ? product.baseTotal / product.quantity : 0;
        rows.push([
          supplier.supplierName,
          product.productName,
          String(Math.round(product.quantity * 100) / 100).replace('.', ','),
          product.unit,
          String(Math.round(product.totalWithVat * 100) / 100).replace('.', ','),
          String(Math.round(avg * 100) / 100).replace('.', ','),
          productQuantityDeltaLabel(product),
        ]);
      }
    }
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = periodLabel
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    a.download = `compras-por-producto-${slug || 'periodo'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [periodLabel, suppliers]);

  return (
    <button
      type="button"
      onClick={onExportCsv}
      className="inline-flex h-10 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 shadow-[0_6px_18px_rgba(15,23,42,0.04)] transition active:scale-[0.99]"
    >
      <Download className="h-4 w-4" strokeWidth={2.2} aria-hidden />
      Excel/CSV
    </button>
  );
}

function KpiCard({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone: 'red' | 'blue' | 'green' | 'violet';
  icon: React.ReactNode;
}) {
  const toneClass =
    tone === 'red'
      ? 'bg-[#D32F2F]/10 text-[#D32F2F] ring-[#D32F2F]/10'
      : tone === 'blue'
        ? 'bg-sky-50 text-sky-700 ring-sky-200/70'
        : tone === 'green'
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/70'
          : 'bg-violet-50 text-violet-700 ring-violet-200/70';
  return (
    <article className="rounded-[22px] border border-zinc-200/80 bg-white px-3.5 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.045)] ring-1 ring-zinc-100/70">
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ring-1 ${toneClass}`}>{icon}</span>
        <div className="min-w-0">
          <p className="text-[12px] font-medium leading-tight text-zinc-600">{label}</p>
          <p className="mt-1 font-serif text-[21px] font-black leading-none tracking-tight text-zinc-950">{value}</p>
          <p className="mt-2 text-[11px] font-semibold leading-tight text-zinc-500">{detail}</p>
        </div>
      </div>
    </article>
  );
}

function SupplierAvatar({ name, highlight }: { name: string; highlight: boolean }) {
  return (
    <span
      className={[
        'grid h-12 w-12 shrink-0 place-items-center rounded-full border text-[12px] font-black tracking-tight',
        highlight
          ? 'border-[#D32F2F]/15 bg-[#FFF1EF] text-[#C62828] shadow-[0_8px_22px_rgba(211,47,47,0.09)]'
          : 'border-zinc-200 bg-white text-zinc-700',
      ].join(' ')}
    >
      {initialsForSupplier(name)}
    </span>
  );
}

function ProductRow({ product }: { product: ProductAgg }) {
  const avgBase = product.quantity > 0 ? product.baseTotal / product.quantity : 0;
  const qtyDelta = product.quantity - product.prevQuantity;
  const totalDeltaPct = pctDelta(product.totalWithVat, product.prevTotalWithVat);
  const deltaClass = qtyDelta > 0 ? 'text-emerald-700' : qtyDelta < 0 ? 'text-[#D32F2F]' : 'text-zinc-500';
  const priceSuffix = unitPriceCatalogSuffix[product.unit];

  return (
    <li className="grid grid-cols-[1fr_auto] gap-3 border-t border-zinc-100 px-3 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1.4fr)_0.7fr_0.8fr_0.8fr_0.8fr] sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-black leading-tight text-zinc-950">{product.productName}</p>
        <p className="mt-1 text-[11px] font-semibold text-zinc-500 sm:hidden">
          {formatQuantityWithUnit(product.quantity, product.unit)} · {formatMoney(avgBase)}/{priceSuffix}
        </p>
      </div>
      <div className="hidden text-[12px] font-bold text-zinc-800 sm:block">{formatQuantityWithUnit(product.quantity, product.unit)}</div>
      <div className="hidden text-[12px] font-semibold text-zinc-500 sm:block">{product.unit}</div>
      <div className="text-right sm:text-left">
        <p className="font-serif text-[15px] font-black leading-tight text-zinc-950">{formatMoney(product.totalWithVat)}</p>
        <p className="mt-1 text-[11px] font-semibold text-zinc-500 sm:hidden">IVA incl.</p>
      </div>
      <div className="hidden text-[12px] font-bold text-zinc-800 sm:block">
        {formatMoney(avgBase)}/{priceSuffix}
      </div>
      <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:block sm:text-right">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-black ${deltaClass} sm:justify-end`}>
          {qtyDelta > 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : qtyDelta < 0 ? <ArrowDownRight className="h-3.5 w-3.5" aria-hidden /> : null}
          {productQuantityDeltaLabel(product)}
        </span>
        <span className={`text-[11px] font-bold ${variationTone(totalDeltaPct)}`}>{formatPct(totalDeltaPct)}</span>
      </div>
    </li>
  );
}

export default function ComprasPorProductoPage() {
  const { localCode, localName, localId, email } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const { orders } = usePedidosOrders();

  const [period, setPeriod] = React.useState<PeriodKey>('last-week');
  const [supplierFilter, setSupplierFilter] = React.useState<SupplierFilter>('all');
  const [categoryFilter, setCategoryFilter] = React.useState<CategoryFilter>('all');
  const [search, setSearch] = React.useState('');
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [onlyChanged, setOnlyChanged] = React.useState(false);
  const [expandedSuppliers, setExpandedSuppliers] = React.useState<Record<string, boolean>>({});

  const range = React.useMemo(() => getPeriodRange(period), [period]);
  const previousRange = React.useMemo(() => getPreviousRange(range), [range]);
  const supplierOptions = React.useMemo(() => purchaseSortForFilters(orders, range), [orders, range]);
  const categoryOptions = React.useMemo(() => ['Sin categoría'], []);

  const analytics = React.useMemo(
    () => aggregatePurchases(orders, range, previousRange, supplierFilter, categoryFilter, search, onlyChanged),
    [categoryFilter, onlyChanged, orders, previousRange, range, search, supplierFilter],
  );

  const firstSupplierKey = analytics.suppliers[0]?.key ?? null;
  React.useEffect(() => {
    if (!firstSupplierKey) return;
    setExpandedSuppliers((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      return { [firstSupplierKey]: true };
    });
  }, [firstSupplierKey]);

  const totalDeltaPct = pctDelta(analytics.totalWithVat, analytics.previousTotalWithVat);
  const productDelta = analytics.productCount - analytics.previousProductCount;
  const supplierDelta = analytics.supplierCount - analytics.previousSupplierCount;
  const orderDelta = analytics.orderCount - analytics.previousOrderCount;

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
    <div className="min-w-0 space-y-4 overflow-x-hidden pb-24">
      <section className="space-y-2">
        <Link
          href="/pedidos"
          onClick={markPedidosUiSkipRestoreOnce}
          className="inline-flex items-center gap-1 py-0.5 text-xs font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline"
        >
          ← Pedidos
        </Link>
        <div className="rounded-[26px] border border-zinc-200/80 bg-[#FFFCF8] px-4 py-4 shadow-[0_14px_40px_rgba(15,23,42,0.04)] ring-1 ring-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#D32F2F]">Compras</p>
              <h1 className="mt-1 text-balance font-serif text-[28px] font-black leading-none tracking-tight text-zinc-950 sm:text-[34px]">
                Compras por producto
              </h1>
              <p className="mt-2 text-sm font-medium leading-snug text-zinc-600">Análisis semanal de compras reales recibidas.</p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="hidden h-10 shrink-0 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 shadow-[0_6px_18px_rgba(15,23,42,0.04)] transition active:scale-[0.99] sm:inline-flex"
            >
              <FileText className="h-4 w-4" aria-hidden />
              PDF
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-zinc-500">
            <span>{localName || 'Local'}</span>
            <span>·</span>
            <span>{range.label}</span>
            <span>·</span>
            <span>Recepciones validadas</span>
          </div>
        </div>
      </section>

      <section className="-mx-2 overflow-x-auto px-2">
        <div className="flex min-w-max gap-2 pb-1">
          <label className="inline-flex h-12 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-800 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <CalendarDays className="h-4 w-4 text-[#D32F2F]" strokeWidth={2.2} aria-hidden />
            <select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value as PeriodKey);
                setExpandedSuppliers({});
              }}
              className="min-w-[9rem] bg-transparent text-sm font-bold outline-none"
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="inline-flex h-12 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-800 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <Users className="h-4 w-4 text-zinc-500" strokeWidth={2.2} aria-hidden />
            <select
              value={supplierFilter}
              onChange={(e) => {
                setSupplierFilter(e.target.value);
                setExpandedSuppliers({});
              }}
              className="min-w-[11rem] bg-transparent text-sm font-bold outline-none"
            >
              <option value="all">Todos los proveedores</option>
              {supplierOptions.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>

          <label className="inline-flex h-12 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-800 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <Tags className="h-4 w-4 text-zinc-500" strokeWidth={2.2} aria-hidden />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="min-w-[10rem] bg-transparent text-sm font-bold outline-none"
            >
              <option value="all">Todas las categorías</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="inline-flex h-12 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-700 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
          >
            <Filter className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            Filtros
          </button>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-semibold text-zinc-500">
        <span className="inline-flex items-center gap-2">
          <BarChart3 className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          Comparado con: {range.comparisonLabel}
        </span>
        <div className="flex items-center gap-2">
          <CsvButton suppliers={analytics.suppliers} periodLabel={range.label} />
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 shadow-[0_6px_18px_rgba(15,23,42,0.04)] transition active:scale-[0.99] sm:hidden"
          >
            <FileText className="h-4 w-4" aria-hidden />
            PDF
          </button>
        </div>
      </section>

      {filtersOpen ? (
        <section className="rounded-[22px] border border-zinc-200/80 bg-white px-3 py-3 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
          <label className="flex items-center justify-between gap-4 rounded-2xl bg-zinc-50 px-3 py-2.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-100">
            <span>Mostrar solo productos con cambio</span>
            <input
              type="checkbox"
              checked={onlyChanged}
              onChange={(e) => setOnlyChanged(e.target.checked)}
              className="h-5 w-5 accent-[#D32F2F]"
            />
          </label>
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <KpiCard
          label="Total comprado"
          value={formatMoney(analytics.totalWithVat)}
          detail={`${formatPct(totalDeltaPct)} vs período anterior`}
          tone="red"
          icon={<ShoppingCart className="h-5 w-5" strokeWidth={2.2} aria-hidden />}
        />
        <KpiCard
          label="Productos comprados"
          value={String(analytics.productCount)}
          detail={`${productDelta >= 0 ? '+' : ''}${productDelta} productos`}
          tone="blue"
          icon={<Package className="h-5 w-5" strokeWidth={2.2} aria-hidden />}
        />
        <KpiCard
          label="Proveedores"
          value={String(analytics.supplierCount)}
          detail={supplierDelta === 0 ? 'Sin cambios' : `${supplierDelta > 0 ? '+' : ''}${supplierDelta} proveedores`}
          tone="green"
          icon={<Truck className="h-5 w-5" strokeWidth={2.2} aria-hidden />}
        />
        <KpiCard
          label="Pedidos recibidos"
          value={String(analytics.orderCount)}
          detail={`${orderDelta >= 0 ? '+' : ''}${orderDelta} pedidos`}
          tone="violet"
          icon={<ReceiptText className="h-5 w-5" strokeWidth={2.2} aria-hidden />}
        />
      </section>

      <section className="rounded-[26px] border border-zinc-200/80 bg-white shadow-[0_16px_42px_rgba(15,23,42,0.05)] ring-1 ring-zinc-100/70">
        <div className="flex flex-col gap-3 border-b border-zinc-100 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex min-w-0 gap-4">
            <span className="border-b-2 border-[#D32F2F] px-1 pb-2 text-sm font-black text-[#D32F2F]">Por proveedor</span>
            <span className="px-1 pb-2 text-sm font-bold text-zinc-500">Por categoría</span>
          </div>
          <label className="flex h-11 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-700 shadow-[0_6px_18px_rgba(15,23,42,0.035)] sm:w-[18rem]">
            <Search className="h-4 w-4 text-zinc-400" strokeWidth={2.2} aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto..."
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-zinc-400"
            />
          </label>
        </div>

        {analytics.suppliers.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="font-serif text-xl font-black text-zinc-950">Sin compras recibidas</p>
            <p className="mx-auto mt-2 max-w-sm text-sm font-medium text-zinc-500">
              No hay recepciones validadas para este periodo o los filtros actuales.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {analytics.suppliers.map((supplier, index) => {
              const isExpanded = expandedSuppliers[supplier.key] ?? index === 0;
              const supplierPct = pctDelta(supplier.totalWithVat, supplier.prevTotalWithVat);
              const topSupplier = index === 0 && analytics.suppliers.length > 1;

              return (
                <article key={supplier.key} className="bg-white first:rounded-t-[26px] last:rounded-b-[26px]">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedSuppliers((prev) => ({
                        ...prev,
                        [supplier.key]: !(prev[supplier.key] ?? index === 0),
                      }))
                    }
                    className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-4 text-left transition hover:bg-[#FFF9F6] active:bg-[#FFF4F0] sm:px-4"
                  >
                    <SupplierAvatar name={supplier.supplierName} highlight={topSupplier} />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-serif text-[18px] font-black leading-tight text-zinc-950">
                          {supplier.supplierName}
                        </span>
                        {topSupplier ? (
                          <span className="rounded-full bg-[#D32F2F]/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#C62828]">
                            mayor gasto
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-zinc-500">
                        <span>{supplier.products.length} productos</span>
                        <span>·</span>
                        <span className={variationTone(supplierPct)}>{formatPct(supplierPct)} vs período anterior</span>
                        <span>·</span>
                        <span>{supplier.orderIds.size} pedidos</span>
                      </span>
                    </span>
                    <span className="flex items-center gap-3 text-right">
                      <span className="hidden sm:block">
                        <span className="block text-[11px] font-bold text-zinc-500">Total comprado</span>
                        <span className="font-serif text-[19px] font-black text-zinc-950">{formatMoney(supplier.totalWithVat)}</span>
                      </span>
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-[#D32F2F]/[0.07] text-[#D32F2F] ring-1 ring-[#D32F2F]/10">
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          strokeWidth={2.4}
                          aria-hidden
                        />
                      </span>
                    </span>
                    <span className="col-span-3 -mt-2 flex justify-end text-right sm:hidden">
                      <span>
                        <span className="block text-[11px] font-bold text-zinc-500">Total comprado</span>
                        <span className="font-serif text-[19px] font-black text-zinc-950">{formatMoney(supplier.totalWithVat)}</span>
                      </span>
                    </span>
                  </button>

                  {isExpanded ? (
                    <div className="px-3 pb-4 sm:px-4">
                      <div className="overflow-hidden rounded-[20px] border border-zinc-200/80 bg-[#FFFDF9] ring-1 ring-zinc-100/70">
                        <div className="hidden grid-cols-[minmax(0,1.4fr)_0.7fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-zinc-100 bg-zinc-50/70 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-zinc-500 sm:grid">
                          <span>Producto</span>
                          <span>Cantidad comprada</span>
                          <span>Unidad</span>
                          <span>Total</span>
                          <span>Precio medio</span>
                        </div>
                        <ul>
                          {supplier.products.slice(0, 8).map((product) => (
                            <ProductRow key={product.key} product={product} />
                          ))}
                        </ul>
                        {supplier.products.length > 8 ? (
                          <div className="border-t border-zinc-100 px-3 py-3 text-center">
                            <span className="text-xs font-black text-[#D32F2F]">
                              + {supplier.products.length - 8} productos más
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
