'use client';

import React from 'react';
import {
  CalendarDays,
  ChevronDown,
  FileText,
  Search,
  Users,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { usePedidosOrders } from '@/components/PedidosOrdersProvider';
import { SupplierAvatar } from '@/components/pedidos/SupplierAvatar';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { formatQuantityWithUnit } from '@/lib/pedidos-format';
import { orderLineDisplayName } from '@/lib/pedidos-line-display-name';
import { useOperationalAutoCollapse } from '@/lib/use-operational-auto-collapse';
import {
  type PedidoOrder,
  type PedidoOrderItem,
} from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';

type PeriodMode = 'week' | 'month';
type SupplierFilter = 'all' | string;
type ViewMode = 'supplier' | 'product';

type DateRange = {
  start: Date;
  end: Date;
  label: string;
  comparisonLabel: string;
};

type PurchaseBasis = {
  quantity: number;
  unit: Unit;
};

type ProductAgg = {
  key: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  unit: Unit;
  quantity: number;
};

type SupplierAgg = {
  key: string;
  supplierId: string;
  supplierName: string;
  logoUrl?: string | null;
  products: ProductAgg[];
};

type ProductListAgg = {
  key: string;
  productName: string;
  unit: Unit;
  quantity: number;
  supplierName: string;
  supplierCount: number;
  supplierQuantities: Map<string, number>;
};

type AggregatedPurchases = {
  suppliers: SupplierAgg[];
  products: ProductListAgg[];
};

type PeriodOption = {
  value: number;
  label: string;
  detail: string;
};

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

function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
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

function getNaturalPeriodRange(mode: PeriodMode, offset: number, now = new Date()): DateRange {
  const today = startOfLocalDay(now);
  if (mode === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const previousStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
    return {
      start,
      end,
      label: start.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
      comparisonLabel: previousStart.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
    };
  }

  const start = addDays(startOfMondayWeek(today), -offset * 7);
  const end = addDays(start, 7);
  const prevStart = addDays(start, -7);
  return {
    start,
    end,
    label: `Semana ${isoWeekNumber(start)} · ${formatRange(start, end)}`,
    comparisonLabel: formatRange(prevStart, start),
  };
}

function buildWeekOptions(now = new Date()): PeriodOption[] {
  const currentWeekStart = startOfMondayWeek(startOfLocalDay(now));
  return Array.from({ length: 12 }, (_, offset) => {
    const start = addDays(currentWeekStart, -offset * 7);
    const end = addDays(start, 7);
    return {
      value: offset,
      label: offset === 0 ? `Esta semana · S${isoWeekNumber(start)}` : `Semana ${isoWeekNumber(start)}`,
      detail: formatRange(start, end),
    };
  });
}

function buildMonthOptions(now = new Date()): PeriodOption[] {
  const today = startOfLocalDay(now);
  return Array.from({ length: 12 }, (_, offset) => {
    const start = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const label = start.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    return {
      value: offset,
      label: offset === 0 ? `Este mes · ${label}` : label,
      detail: formatRange(start, end),
    };
  });
}

function orderReceivedDate(order: PedidoOrder): Date | null {
  if (order.status !== 'received' || !order.receivedAt) return null;
  const d = new Date(order.receivedAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isInsideRange(date: Date, range: DateRange): boolean {
  return date >= range.start && date < range.end;
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function itemPurchaseBasis(item: PedidoOrderItem): PurchaseBasis | null {
  if (item.incidentType === 'missing') return null;

  const qty = item.receivedQuantity > 0 ? item.receivedQuantity : item.quantity;
  if (!(qty > 0)) return null;
  return {
    quantity: qty,
    unit: item.unit,
  };
}

function productSearchMatches(productName: string, supplierName: string, search: string): boolean {
  const q = normalizeText(search);
  if (!q) return true;
  return normalizeText(productName).includes(q) || normalizeText(supplierName).includes(q);
}

function buildCurrentMap(orders: PedidoOrder[], range: DateRange, supplierFilter: SupplierFilter, search: string) {
  const supplierMap = new Map<string, SupplierAgg>();
  const productMap = new Map<string, ProductAgg>();

  for (const order of orders) {
    const receivedAt = orderReceivedDate(order);
    if (!receivedAt || !isInsideRange(receivedAt, range)) continue;
    if (supplierFilter !== 'all' && order.supplierId !== supplierFilter) continue;

    const supplierName = order.supplierName?.trim() || 'Proveedor';

    for (const item of order.items) {
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
        };

      product.quantity += basis.quantity;
      productMap.set(productKey, product);

      const supplier =
        supplierMap.get(supplierKey) ??
        {
          key: supplierKey,
          supplierId: order.supplierId,
          supplierName,
          logoUrl: order.supplierLogoUrl ?? null,
          products: [],
        };
      if (supplier.logoUrl == null && order.supplierLogoUrl) {
        supplier.logoUrl = order.supplierLogoUrl;
      }
      supplierMap.set(supplierKey, supplier);
    }
  }

  for (const product of productMap.values()) {
    const supplier = supplierMap.get(product.supplierId || product.supplierName);
    if (supplier) supplier.products.push(product);
  }

  return { supplierMap, productMap };
}

function aggregatePurchases(
  orders: PedidoOrder[],
  range: DateRange,
  supplierFilter: SupplierFilter,
  search: string,
): AggregatedPurchases {
  const current = buildCurrentMap(orders, range, supplierFilter, search);

  const suppliers = Array.from(current.supplierMap.values())
    .map((supplier) => {
      const products = supplier.products
        .sort((a, b) => a.productName.localeCompare(b.productName, 'es') || b.quantity - a.quantity);
      return {
        ...supplier,
        products,
      };
    })
    .filter((supplier) => supplier.products.length > 0)
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName, 'es'));

  const productGroups = new Map<string, ProductListAgg>();
  for (const supplier of suppliers) {
    for (const product of supplier.products) {
      const key = `${normalizeText(product.productName)}::${product.unit}`;
      const group =
        productGroups.get(key) ??
        {
          key,
          productName: product.productName,
          unit: product.unit,
          quantity: 0,
          supplierName: product.supplierName,
          supplierCount: 0,
          supplierQuantities: new Map<string, number>(),
        };
      group.quantity += product.quantity;
      group.supplierQuantities.set(product.supplierName, (group.supplierQuantities.get(product.supplierName) ?? 0) + product.quantity);
      productGroups.set(key, group);
    }
  }

  const products = Array.from(productGroups.values())
    .map((product) => {
      const suppliersByQuantity = Array.from(product.supplierQuantities.entries()).sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'),
      );
      return {
        ...product,
        supplierName: suppliersByQuantity[0]?.[0] ?? product.supplierName,
        supplierCount: suppliersByQuantity.length,
      };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName, 'es') || a.supplierName.localeCompare(b.supplierName, 'es'));

  return {
    suppliers,
    products,
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

function ProductRow({ product }: { product: ProductAgg }) {
  return (
    <li className="border-t border-zinc-100 px-3 py-2.5 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-black leading-tight text-zinc-950">{product.productName}</p>
        </div>
        <span className="shrink-0 text-right text-[13px] font-black tabular-nums text-zinc-950">
          {formatQuantityWithUnit(product.quantity, product.unit)}
        </span>
      </div>
    </li>
  );
}

function ProductSummaryCard({
  product,
}: {
  product: ProductListAgg;
}) {
  return (
    <article className="overflow-hidden rounded-[18px] border border-zinc-200/75 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.035)] ring-1 ring-zinc-100/70">
      <div className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-black leading-tight tracking-tight text-zinc-950">
            {product.productName}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[12px] font-black tabular-nums text-zinc-950">
            {formatQuantityWithUnit(product.quantity, product.unit)}
          </span>
          <span className="block text-[10px] font-semibold text-zinc-500">comprado</span>
        </span>
      </div>
    </article>
  );
}

export default function ComprasPorProductoPage() {
  const { localCode, localName, localId, email } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const { orders } = usePedidosOrders();

  const [periodMode, setPeriodMode] = React.useState<PeriodMode>('week');
  const [periodOffset, setPeriodOffset] = React.useState(0);
  const [supplierFilter, setSupplierFilter] = React.useState<SupplierFilter>('all');
  const [viewMode, setViewMode] = React.useState<ViewMode>('supplier');
  const [search, setSearch] = React.useState('');
  const [expandedSuppliers, setExpandedSuppliers] = React.useState<Record<string, boolean>>({});
  const [expandedProducts, setExpandedProducts] = React.useState<Record<string, boolean>>({});
  const purchasesListRef = React.useRef<HTMLElement | null>(null);

  const periodOptions = React.useMemo(
    () => (periodMode === 'week' ? buildWeekOptions() : buildMonthOptions()),
    [periodMode],
  );
  const range = React.useMemo(() => getNaturalPeriodRange(periodMode, periodOffset), [periodMode, periodOffset]);
  const supplierOptions = React.useMemo(() => purchaseSortForFilters(orders, range), [orders, range]);

  const analytics = React.useMemo(
    () => aggregatePurchases(orders, range, supplierFilter, search),
    [orders, range, search, supplierFilter],
  );

  const expandedAccordionKey = React.useMemo(() => {
    const source = viewMode === 'supplier' ? expandedSuppliers : expandedProducts;
    const keys = Object.keys(source).filter((key) => source[key]);
    return keys[0] ?? null;
  }, [expandedProducts, expandedSuppliers, viewMode]);

  useOperationalAutoCollapse({
    activeId: expandedAccordionKey,
    containerRef: purchasesListRef,
    onCollapse: () => {
      setExpandedSuppliers({});
      setExpandedProducts({});
    },
    timeoutMs: 30_000,
  });

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
    <div className="min-w-0 space-y-3 overflow-x-hidden pb-20">
      <section className="-mx-2 overflow-x-auto px-2">
        <div className="flex min-w-max gap-2 pb-1">
          <div className="inline-grid h-10 grid-cols-2 items-center overflow-hidden rounded-2xl border border-zinc-200 bg-white text-[12px] font-bold text-zinc-800 shadow-[0_8px_20px_rgba(15,23,42,0.035)]">
            <button
              type="button"
              onClick={() => {
                setPeriodMode('week');
                setPeriodOffset(0);
                setExpandedSuppliers({});
                setExpandedProducts({});
              }}
              className={[
                'h-10 min-w-[5.25rem] px-3 transition',
                periodMode === 'week' ? 'bg-[#D32F2F] text-white' : 'text-zinc-600',
              ].join(' ')}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => {
                setPeriodMode('month');
                setPeriodOffset(0);
                setExpandedSuppliers({});
                setExpandedProducts({});
              }}
              className={[
                'h-10 min-w-[5.25rem] px-3 transition',
                periodMode === 'month' ? 'bg-[#D32F2F] text-white' : 'text-zinc-600',
              ].join(' ')}
            >
              Mes
            </button>
          </div>

          <label className="inline-flex h-10 w-[16.75rem] items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 text-[12px] font-bold text-zinc-800 shadow-[0_8px_20px_rgba(15,23,42,0.035)]">
            <CalendarDays className="h-4 w-4 text-[#D32F2F]" strokeWidth={2.2} aria-hidden />
            <select
              value={periodOffset}
              onChange={(e) => {
                setPeriodOffset(Number(e.target.value));
                setExpandedSuppliers({});
                setExpandedProducts({});
              }}
              className="min-w-0 flex-1 bg-transparent text-[12px] font-bold outline-none"
            >
              {periodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="inline-flex h-10 min-w-[13rem] items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 text-[12px] font-bold text-zinc-800 shadow-[0_8px_20px_rgba(15,23,42,0.035)]">
            <Users className="h-4 w-4 text-zinc-500" strokeWidth={2.2} aria-hidden />
            <select
              value={supplierFilter}
              onChange={(e) => {
                setSupplierFilter(e.target.value);
                setExpandedSuppliers({});
                setExpandedProducts({});
              }}
              className="min-w-0 flex-1 bg-transparent text-[12px] font-bold outline-none"
            >
              <option value="all">Todos los proveedores</option>
              {supplierOptions.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 text-[12px] font-bold text-zinc-700 shadow-[0_8px_20px_rgba(15,23,42,0.035)] transition active:scale-[0.99]"
          >
            <FileText className="h-4 w-4 text-[#D32F2F]" strokeWidth={2.2} aria-hidden />
            PDF
          </button>
        </div>
      </section>

      <section
        ref={purchasesListRef}
        className="space-y-2.5"
      >
        <div className="rounded-[18px] border border-zinc-200/80 bg-white/95 p-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.035)] ring-1 ring-zinc-100/80">
          <div className="flex items-center gap-3 border-b border-zinc-100 px-1 pb-2">
            <button
              type="button"
              onClick={() => {
                setViewMode('supplier');
                setExpandedProducts({});
              }}
              className={[
                'border-b-2 px-1 pb-1.5 text-[12px] font-black transition',
                viewMode === 'supplier'
                  ? 'border-[#D32F2F] text-[#D32F2F]'
                  : 'border-transparent text-zinc-500',
              ].join(' ')}
            >
              Por proveedor
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('product');
                setExpandedSuppliers({});
              }}
              className={[
                'border-b-2 px-1 pb-1.5 text-[12px] font-black transition',
                viewMode === 'product'
                  ? 'border-[#D32F2F] text-[#D32F2F]'
                  : 'border-transparent text-zinc-500',
              ].join(' ')}
            >
              Por producto
            </button>
          </div>
          <label className="mt-2 flex h-9 items-center gap-2 rounded-[15px] border border-zinc-200/80 bg-zinc-50/60 px-3 text-[12px] text-zinc-700">
            <Search className="h-4 w-4 text-zinc-400" strokeWidth={2.2} aria-hidden />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setExpandedSuppliers({});
                setExpandedProducts({});
              }}
              placeholder="Buscar producto..."
              className="min-w-0 flex-1 bg-transparent text-[12px] font-semibold outline-none placeholder:text-zinc-400"
            />
          </label>
        </div>

        {(viewMode === 'supplier' ? analytics.suppliers.length : analytics.products.length) === 0 ? (
          <div className="rounded-[18px] border border-zinc-200/80 bg-white px-4 py-10 text-center shadow-[0_8px_22px_rgba(15,23,42,0.035)] ring-1 ring-zinc-100/70">
            <p className="font-serif text-xl font-black text-zinc-950">Sin compras recibidas</p>
            <p className="mx-auto mt-2 max-w-sm text-sm font-medium text-zinc-500">
              No hay recepciones validadas para este periodo o los filtros actuales.
            </p>
          </div>
        ) : viewMode === 'product' ? (
          <div className="space-y-2">
            {analytics.products.map((product) => {
              return (
                <ProductSummaryCard
                  key={product.key}
                  product={product}
                />
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {analytics.suppliers.map((supplier) => {
              const isExpanded = expandedSuppliers[supplier.key] ?? false;

              return (
                <article
                  key={supplier.key}
                  className="overflow-hidden rounded-[18px] border border-zinc-200/75 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.035)] ring-1 ring-zinc-100/70"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedSuppliers(isExpanded ? {} : { [supplier.key]: true })}
                    className="flex w-full touch-manipulation items-center gap-2.5 px-2.5 py-2 text-left transition-colors active:bg-zinc-50/80 sm:px-3 sm:py-2.5"
                    aria-expanded={isExpanded}
                  >
                    <SupplierAvatar
                      name={supplier.supplierName}
                      logoUrl={supplier.logoUrl ?? null}
                      className="h-8 w-8 rounded-[14px] text-[10px]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[14px] font-semibold leading-tight tracking-tight text-zinc-950">
                          {supplier.supplierName}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[10.5px] leading-tight text-zinc-500">
                        {supplier.products.length} artículos
                      </span>
                    </span>
                    <span className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-50 text-zinc-400 ring-1 ring-zinc-200/70">
                      <ChevronDown
                        className={['h-4 w-4 text-zinc-400 transition-transform', isExpanded ? 'rotate-180' : ''].join(' ')}
                        strokeWidth={2.4}
                        aria-hidden
                      />
                    </span>
                  </button>

                  <div
                    className={[
                      'grid transition-[grid-template-rows] duration-200 ease-out',
                      isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                    ].join(' ')}
                  >
                    <div className="overflow-hidden">
                      <ul className="border-t border-zinc-100 bg-zinc-50/70">
                        {supplier.products.map((product) => (
                          <ProductRow key={product.key} product={product} />
                        ))}
                      </ul>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
