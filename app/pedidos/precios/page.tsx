'use client';

import Link from 'next/link';
import React from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AlertTriangle, Download, Lightbulb, Package, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '@/components/AuthProvider';
import { appAlert } from '@/lib/app-dialog-bridge';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { formatQuantityWithUnit } from '@/lib/pedidos-format';
import {
  deleteCatalogPriceHistoryRow,
  deleteHistoricoPreciosForSupplierProduct,
  fetchCatalogPriceHistoryRows,
  fetchSuppliersWithProducts,
  type CatalogPriceHistoryListRow,
  type PedidoSupplier,
} from '@/lib/pedidos-supabase';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { isBrowser } from '@/lib/storage';
import type { Unit } from '@/lib/types';
import {
  analyzeDominantDisplayUnits,
  euroPerUnitShortLabel,
  hasMixedComparisonUnits,
} from '@/lib/price-evolution-dominant-unit';

type WindowPreset = '30' | '60' | '90' | '365' | 'all';

const CHART_PERIOD_PRESETS: { id: WindowPreset; label: string }[] = [
  { id: '30', label: '30d' },
  { id: '60', label: '60d' },
  { id: '90', label: '90d' },
  { id: '365', label: '12m' },
  { id: 'all', label: 'Todo' },
];

function countReceptionPriceSteps(row: { points: PricePoint[] }): { up: number; down: number } {
  const bills = row.points
    .filter((p) => p.sortRank === 1)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  let up = 0;
  let down = 0;
  for (let i = 1; i < bills.length; i++) {
    const d = bills[i]!.price - bills[i - 1]!.price;
    if (d > 0.0001) up += 1;
    else if (d < -0.0001) down += 1;
  }
  return { up, down };
}

function volatilityStabilityLabel(cv: number): string {
  if (cv < 5) return 'Estabilidad alta';
  if (cv < 12) return 'Estabilidad media';
  return 'Alta volatilidad';
}

const PRECIOS_UI_STORAGE_KEY = 'chefone-precios-ui-v1';

type PricePoint = {
  date: string;
  supplier: string;
  unit: string;
  price: number;
  /** Desempate si varios pedidos comparten la misma fecha de precio */
  orderCreatedAt: string;
  itemId: string;
  /** 0 = precio pedido (base), 1 = precio albarán; misma fecha ISO → base antes que albarán */
  sortRank?: number;
};

type PurchaseRow = {
  date: string;
  supplier: string;
  qty: number;
  unit: Unit;
  price: number;
};

type PriceSummary = {
  key: string;
  productName: string;
  points: PricePoint[];
  purchases: PurchaseRow[];
  weightedAvg: number;
  totalWeightedQty: number;
  base: PricePoint;
  current: PricePoint;
  delta: number;
  deltaPct: number;
  /** Unidad mostrada en gráficos/tablas (ud de catálogo o kg). */
  displayUnit: string;
  /** Impacto mensual estimado si el ritmo de compra del periodo se mantiene: (último recibido − PMP) × (qty/mes). */
  impactMonthlyVsWap: number;
  /** Coef. variación % entre precios albarán (últimos puntos). */
  volatilityCvPct: number;
  /** Estimación ~30 días (tendencia lineal sobre últimos puntos). */
  forecast30d: number | null;
  supplierId: string;
  supplierName: string;
  /** Unidad de catálogo (caja, kg…) — clave para comparar entre proveedores. */
  catalogUnit: Unit;
  /** Id de producto de proveedor en las líneas (referencia / histórico de catálogo). */
  supplierProductId: string | null;
  /** En modo €/kg se usó precio por unidad de catálogo por no haber kg recibido/estimado. */
  usedPerKgUnitFallback?: boolean;
  /** Fracción de recepciones en la unidad dominante (antes de elegir vista). */
  dominantUnitShare: number;
  /** Mostrar conmutador €/… solo si hay mezcla real de unidades de comparación. */
  showUnitSwitcher: boolean;
  /** Unidades alternativas ordenadas por frecuencia (para segmented). */
  alternativeUnits: string[];
};

/** Filas de histórico de precios consideradas para la evolución. */
type EvolutionDebugRow = {
  supplierId: string;
  supplierName: string;
  evolutionKey: string;
  productName: string;
  supplierProductId: string;
  historicoId: string;
  createdAt: string;
  displayUnit: string;
  includedInSeries: boolean;
  discardReason: string | null;
};

type GroupedEvolutionRow = {
  key: string;
  productName: string;
  billPointCount: number;
  pointCount: number;
};

type DiscardedEvolution = {
  evolutionKey: string;
  productName: string;
  referenceId: string;
  reason: string;
};

type ProductInfo = { productName: string; supplierName: string; supplierId: string; catalogUnit: Unit };

function evolutionKeyFromSupplierProduct(supplierId: string, supplierProductId: string): string {
  return `${supplierId}|${supplierProductId}`;
}

function supplierProductIdFromEvolutionKey(key: string): string | null {
  const i = key.indexOf('|');
  if (i < 0) return null;
  return key.slice(i + 1).trim() || null;
}

function sampleStdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** Regresión lineal simple y precio estimado a +daysAhead días del último punto (solo puntos albarán). */
function forecastPriceLinear(
  billPointsAsc: Array<{ date: string; price: number }>,
  daysAhead: number,
): number | null {
  if (billPointsAsc.length < 3) return null;
  const slice = billPointsAsc.slice(-8);
  const t0 = Date.parse(slice[0]!.date);
  const xs = slice.map((p) => (Date.parse(p.date) - t0) / 86_400_000);
  const ys = slice.map((p) => p.price);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = my - slope * mx;
  const lastX = xs[n - 1]!;
  const targetX = lastX + daysAhead;
  const y = intercept + slope * targetX;
  return Number.isFinite(y) && y > 0 ? Math.round(y * 10000) / 10000 : null;
}

function escapeCsvCell(v: string): string {
  if (/[;"\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Umbral 0 = cualquier subida respecto al primer precio en la ventana (mínimo movimiento). */
function isPriceRiseAlert(row: PriceSummary, alertPct: number): boolean {
  if (row.delta <= 0) return false;
  if (alertPct <= 0) return true;
  return row.deltaPct >= alertPct;
}

/** Solo artículos con al menos un cambio registrado en recepción (histórico) en la ventana. */
function hasPriceVariationForEvolution(row: PriceSummary): boolean {
  if (row.purchases.length < 1) return false;
  return Math.abs(row.delta) > 0.0001;
}

function buildPriceSummariesWithDiagnostics(
  historicoRows: CatalogPriceHistoryListRow[],
  windowStartMs: number,
  windowEndMs: number,
  supplierFilter: string,
  productInfoBySupplierProductId: ReadonlyMap<string, ProductInfo>,
  unitOverrideByKey: ReadonlyMap<string, string>,
): {
  series: PriceSummary[];
  seriesCandidatesBeforeVariation: number;
  rawRows: EvolutionDebugRow[];
  groupedRows: GroupedEvolutionRow[];
  discardedProducts: DiscardedEvolution[];
} {
  type Acc = {
    key: string;
    productName: string;
    supplierId: string;
    supplierName: string;
    catalogUnit: Unit;
    supplierProductId: string;
    historicoRows: CatalogPriceHistoryListRow[];
  };
  const map = new Map<string, Acc>();

  for (const r of historicoRows) {
    const t = Date.parse(r.createdAt);
    const inWindow = Number.isFinite(t) && t >= windowStartMs && t <= windowEndMs;
    const info = productInfoBySupplierProductId.get(r.supplierProductId);
    const supplierFilteredOut = Boolean(supplierFilter && info && info.supplierId !== supplierFilter);

    if (!info || supplierFilteredOut || !inWindow) continue;

    const key = evolutionKeyFromSupplierProduct(info.supplierId, r.supplierProductId);
    const existing = map.get(key);
    const acc: Acc =
      existing ??
      {
        key,
        productName: info.productName,
        supplierId: info.supplierId,
        supplierName: info.supplierName,
        catalogUnit: info.catalogUnit,
        supplierProductId: r.supplierProductId,
        historicoRows: [],
      };
    acc.historicoRows.push(r);
    map.set(key, acc);
  }

  const chosenUnitByKey = new Map<string, string>();
  for (const [, acc] of map) {
    const analysis = analyzeDominantDisplayUnits(acc.historicoRows);
    const override = unitOverrideByKey.get(acc.key);
    const overrideOk = Boolean(override && acc.historicoRows.some((h) => h.displayUnit === override));
    const chosen = overrideOk ? override! : analysis.primary;
    chosenUnitByKey.set(acc.key, chosen);
  }

  const rawRows: EvolutionDebugRow[] = [];
  for (const r of historicoRows) {
    const t = Date.parse(r.createdAt);
    const inWindow = Number.isFinite(t) && t >= windowStartMs && t <= windowEndMs;
    const info = productInfoBySupplierProductId.get(r.supplierProductId);
    const supplierFilteredOut = Boolean(supplierFilter && info && info.supplierId !== supplierFilter);
    const key = info ? evolutionKeyFromSupplierProduct(info.supplierId, r.supplierProductId) : r.supplierProductId;
    const chosen = chosenUnitByKey.get(key);

    let discardReason: string | null = null;
    if (!info) discardReason = 'producto no está en catálogo cargado';
    else if (supplierFilteredOut) discardReason = 'filtrado por proveedor';
    else if (!inWindow) discardReason = 'fecha fuera de rango';
    else if (chosen != null && r.displayUnit !== chosen) discardReason = 'otra unidad de comparación (vista automática)';

    rawRows.push({
      supplierId: info?.supplierId ?? '',
      supplierName: info?.supplierName ?? '',
      evolutionKey: key,
      productName: info?.productName ?? '',
      supplierProductId: r.supplierProductId,
      historicoId: r.id,
      createdAt: r.createdAt,
      displayUnit: r.displayUnit,
      includedInSeries: discardReason == null,
      discardReason: discardReason == null ? null : discardReason,
    });
  }

  const daysWindow = Math.max(1, (windowEndMs - windowStartMs) / 86_400_000);
  const monthsInWindow = Math.max(1, daysWindow / 30);

  const seriesCandidates = Array.from(map.values()).flatMap((acc): PriceSummary[] => {
      const analysis = analyzeDominantDisplayUnits(acc.historicoRows);
      const chosen = chosenUnitByKey.get(acc.key) ?? analysis.primary;
      const sorted = [...acc.historicoRows]
        .filter((h) => h.displayUnit === chosen)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      if (sorted.length === 0) return [];
      const displayUnit = chosen;
      const points: PricePoint[] = [];
      const purchases: PurchaseRow[] = [];
      let wSum = 0;
      for (const h of sorted) {
        const iso = h.createdAt;
        const price = h.newPricePerUnit;
        points.push({
          date: iso,
          supplier: acc.supplierName,
          unit: displayUnit,
          price,
          orderCreatedAt: iso,
          itemId: h.id,
          sortRank: 1,
        });
        purchases.push({
          date: iso,
          supplier: acc.supplierName,
          qty: 1,
          unit: displayUnit as Unit,
          price,
        });
        wSum += price;
      }
      const ordered = [...points].sort((a, b) => {
        const td = Date.parse(a.date) - Date.parse(b.date);
        if (td !== 0) return td;
        return a.itemId.localeCompare(b.itemId);
      });
      const firstH = sorted[0]!;
      const lastH = sorted[sorted.length - 1]!;
      const basePrice = firstH.oldPricePerUnit;
      const currentPrice = lastH.newPricePerUnit;
      const basePoint: PricePoint = {
        date: firstH.createdAt,
        supplier: acc.supplierName,
        unit: displayUnit,
        price: basePrice,
        orderCreatedAt: firstH.createdAt,
        itemId: `${firstH.id}:prev`,
        sortRank: 0,
      };
      const orderedWithAnchor = [basePoint, ...ordered.filter((p) => p.sortRank === 1)];
      const base = orderedWithAnchor[0]!;
      const current = orderedWithAnchor[orderedWithAnchor.length - 1]!;
      const delta = Math.round((currentPrice - basePrice) * 100) / 100;
      const deltaPct =
        basePrice > 0 ? Math.round((delta / basePrice) * 10000) / 100 : 0;
      const wQty = sorted.length;
      const weightedAvg = wQty > 0 ? Math.round((wSum / wQty) * 100) / 100 : currentPrice;
      const purchasesSorted = [...purchases].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      const billOnly = sorted.map((h) => h.newPricePerUnit);
      const vol = sampleStdev(billOnly);
      const volatilityCvPct =
        weightedAvg > 0 && billOnly.length >= 2 ? Math.round((vol / weightedAvg) * 10000) / 100 : 0;
      const billAsc = sorted.map((h) => ({ date: h.createdAt, price: h.newPricePerUnit }));
      const forecast30d = forecastPriceLinear(billAsc, 30);
      const monthlyQty = wQty / monthsInWindow;
      const impactMonthlyVsWap = Math.round((currentPrice - weightedAvg) * monthlyQty * 100) / 100;
      return [
        {
          key: acc.key,
          productName: acc.productName,
          points: [...orderedWithAnchor].reverse(),
          purchases: purchasesSorted,
          weightedAvg,
          totalWeightedQty: wQty,
          base,
          current,
          delta,
          deltaPct,
          displayUnit,
          impactMonthlyVsWap,
          volatilityCvPct,
          forecast30d,
          supplierId: acc.supplierId,
          supplierName: acc.supplierName,
          catalogUnit: acc.catalogUnit,
          supplierProductId: acc.supplierProductId,
          usedPerKgUnitFallback: false,
          dominantUnitShare: analysis.share,
          showUnitSwitcher: hasMixedComparisonUnits(analysis),
          alternativeUnits: analysis.unitsOrdered,
        },
      ];
    })
    .sort((a, b) => a.productName.localeCompare(b.productName, 'es'));

  const seriesCandidatesBeforeVariation = seriesCandidates.length;
  const seriesOut = seriesCandidates.filter(hasPriceVariationForEvolution);

  const groupedRows: GroupedEvolutionRow[] = seriesOut.map((s) => ({
    key: s.key,
    productName: s.productName,
    billPointCount: s.points.filter((p) => p.sortRank === 1).length,
    pointCount: s.points.length,
  }));

  const discardedProducts: DiscardedEvolution[] = rawRows
    .filter((r) => !r.includedInSeries && r.discardReason)
    .map((r) => ({
      evolutionKey: r.evolutionKey,
      productName: r.productName,
      referenceId: r.historicoId,
      reason: r.discardReason!,
    }));

  return {
    series: seriesOut,
    seriesCandidatesBeforeVariation,
    rawRows,
    groupedRows,
    discardedProducts,
  };
}

function buildPriceSummaries(
  historicoRows: CatalogPriceHistoryListRow[],
  windowStartMs: number,
  windowEndMs: number,
  supplierFilter: string,
  productInfoBySupplierProductId: ReadonlyMap<string, ProductInfo>,
  unitOverrideByKey: ReadonlyMap<string, string>,
): PriceSummary[] {
  return buildPriceSummariesWithDiagnostics(
    historicoRows,
    windowStartMs,
    windowEndMs,
    supplierFilter,
    productInfoBySupplierProductId,
    unitOverrideByKey,
  ).series;
}

type CrossSupplierBenchmark = {
  compareKey: string;
  productName: string;
  catalogUnit: string;
  displayUnit: string;
  spreadPct: number;
  bestSupplierName: string;
  worstSupplierName: string;
  suppliers: Array<{
    supplierName: string;
    current: number;
    pmp: number;
  }>;
};

type ActionRecommendation = {
  id: string;
  priority: 'high' | 'medium';
  title: string;
  detail: string;
};

function ChartPeriodToolbar({
  value,
  onChange,
}: {
  value: WindowPreset;
  onChange: (v: WindowPreset) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {CHART_PERIOD_PRESETS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={[
            'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors',
            value === id ? 'bg-[#D32F2F] text-white shadow-sm' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function PriceEvolutionMiniChart({
  row,
  unitSwitcher,
  chartPeriod,
}: {
  row: PriceSummary;
  unitSwitcher?: { options: string[]; value: string; onChange: (u: string) => void } | null;
  chartPeriod?: { value: WindowPreset; onChange: (v: WindowPreset) => void };
}) {
  const fillGradientId = React.useMemo(
    () => `evofill-${row.key.replace(/[^a-zA-Z0-9]/g, '-')}`,
    [row.key],
  );

  const data = React.useMemo(() => {
    const asc = [...row.points].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const dayKeys = asc.map((p) => p.date.slice(0, 10));
    const allSameCalendarDay = dayKeys.length > 0 && new Set(dayKeys).size === 1;

    return asc.map((p) => {
      const when = new Date(p.orderCreatedAt || p.date);
      const dateLabel = allSameCalendarDay
        ? when.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
        : new Date(p.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
      return {
        dateLabel,
        price: p.price,
        kind: p.sortRank === 0 ? 'Inicio' : 'Recepción',
        supplier: p.supplier,
      };
    });
  }, [row.points]);

  const unitShort = euroPerUnitShortLabel(row.displayUnit);

  const unitControl =
    unitSwitcher && unitSwitcher.options.length > 1 ? (
      <div className="inline-flex rounded-full bg-white p-0.5 ring-1 ring-zinc-200/80">
        {unitSwitcher.options.map((u) => {
          const active = u === unitSwitcher.value;
          return (
            <button
              key={u}
              type="button"
              onClick={() => unitSwitcher.onChange(u)}
              className={[
                'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors',
                active ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-800',
              ].join(' ')}
            >
              {euroPerUnitShortLabel(u)}
            </button>
          );
        })}
      </div>
    ) : (
      <span className="rounded-full bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 ring-1 ring-zinc-200/80">
        {unitShort}
      </span>
    );

  if (data.length < 1) return null;

  if (data.length === 1) {
    const p = data[0]!;
    return (
      <div className="mt-2 w-full min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {chartPeriod ? (
            <ChartPeriodToolbar value={chartPeriod.value} onChange={chartPeriod.onChange} />
          ) : (
            <span />
          )}
          {unitControl}
        </div>
        <div className="flex min-h-[10rem] items-center justify-center rounded-2xl bg-gradient-to-b from-red-50/40 to-white px-3 py-8 ring-1 ring-zinc-100">
          <div className="text-center">
            <p className="text-[11px] font-medium tracking-wide text-zinc-400">{p.dateLabel}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">
              {p.price.toFixed(2)} {unitShort}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 w-full min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {chartPeriod ? (
          <ChartPeriodToolbar value={chartPeriod.value} onChange={chartPeriod.onChange} />
        ) : (
          <span />
        )}
        {unitControl}
      </div>
      <div className="h-[min(56vw,15rem)] w-full min-h-[14rem] sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 6, left: -8, bottom: 6 }}>
            <defs>
              <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D32F2F" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#D32F2F" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 8" stroke="#ececf0" vertical={false} />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              axisLine={false}
              tickLine={false}
              interval={data.length > 8 ? 'preserveStartEnd' : 0}
              height={data.length > 8 ? 26 : 36}
              tickMargin={8}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              width={46}
              domain={['auto', 'auto']}
              axisLine={false}
              tickLine={false}
              tickMargin={4}
              tickFormatter={(v) => (typeof v === 'number' ? v.toFixed(2) : String(v))}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const pl = payload[0]?.payload as {
                  dateLabel: string;
                  price: number;
                  kind: string;
                  supplier: string;
                };
                if (!pl) return null;
                return (
                  <div className="rounded-xl border border-zinc-100 bg-white/98 px-3 py-2 text-xs shadow-lg">
                    <p className="font-semibold text-zinc-900">{pl.dateLabel}</p>
                    <p className="tabular-nums text-[13px] text-zinc-900">
                      {pl.price.toFixed(2)} {unitShort}
                    </p>
                  </div>
                );
              }}
            />
            <ReferenceLine
              y={row.weightedAvg}
              stroke="#a1a1aa"
              strokeDasharray="5 5"
              strokeOpacity={0.85}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="none"
              fill={`url(#${fillGradientId})`}
              isAnimationActive
            />
            <Line
              type="monotone"
              dataKey="price"
              name="Precio"
              stroke="#D32F2F"
              strokeWidth={2.5}
              dot={(props: { cx?: number; cy?: number; payload?: { kind: string } }) => {
                const { cx, cy, payload } = props;
                if (cx == null || cy == null) return null;
                const isAnchor = payload?.kind === 'Inicio';
                const fill = isAnchor ? '#94a3b8' : '#D32F2F';
                const r = isAnchor ? 3.5 : 4.5;
                return <circle cx={cx} cy={cy} r={r} fill={fill} stroke="#fff" strokeWidth={2} />;
              }}
              activeDot={{ r: 7, stroke: '#fff', strokeWidth: 2, fill: '#D32F2F' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] text-zinc-500">
        <span className="inline-flex flex-col items-center gap-0.5">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full bg-slate-400" aria-hidden />
            Precio inicial serie
          </span>
        </span>
        <span className="inline-flex flex-col items-center gap-0 text-center">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-6 shrink-0 border-t border-dashed border-zinc-400" aria-hidden />
            PMP
          </span>
          <span className="text-[9px] leading-tight text-zinc-400">Media ponderada del periodo</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-6 shrink-0 bg-[#D32F2F]" aria-hidden />
          Evolución
        </span>
        <span className="inline-flex flex-col items-center gap-0.5">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#D32F2F]" aria-hidden />
            Último recibido
          </span>
        </span>
      </div>
    </div>
  );
}

const PDF_BRAND: [number, number, number] = [211, 47, 47];
const PDF_ZINC_100: [number, number, number] = [244, 244, 245];
const PDF_ZINC_400: [number, number, number] = [161, 161, 170];
const PDF_ZINC_500: [number, number, number] = [113, 113, 122];
const PDF_ZINC_900: [number, number, number] = [24, 24, 27];
const PDF_WHITE: [number, number, number] = [255, 255, 255];

function pdfFooter(doc: jsPDF, page: number, total: number): void {
  doc.setFontSize(7);
  doc.setTextColor(...PDF_ZINC_400);
  doc.text(
    `Chef-One · ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' })}`,
    40,
    555,
  );
  doc.text(`Página ${page} / ${total}`, 800, 555, { align: 'right' });
  doc.setTextColor(...PDF_ZINC_900);
}

/** Gráfico grande: precio unitario en el tiempo + línea discontinua del precio medio ponderado. */
function drawExecutivePriceChart(
  doc: jsPDF,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    title: string;
    subtitle: string;
    pointsAsc: PricePoint[];
    weightedAvg: number;
    unit: string;
    basePrice: number;
    currentPrice: number;
  },
): number {
  const padL = 52;
  const padR = 24;
  const padT = 36;
  const padB = 42;
  const innerW = opts.w - padL - padR;
  const innerH = opts.h - padT - padB;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text(opts.title, opts.x, opts.y + 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_ZINC_500);
  const subLines = doc.splitTextToSize(opts.subtitle, opts.w - 8);
  doc.text(subLines, opts.x, opts.y + 26);

  const pts = opts.pointsAsc;
  if (pts.length < 2) {
    doc.setFontSize(9);
    doc.text('No hay suficientes puntos para dibujar la evolución.', opts.x + padL, opts.y + padT + innerH / 2);
    return opts.y + opts.h;
  }

  const times = pts.map((p) => Date.parse(p.date));
  const prices = pts.map((p) => p.price);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const wap = opts.weightedAvg;
  let minP = Math.min(...prices, wap);
  let maxP = Math.max(...prices, wap);
  const span = maxP - minP;
  const pad = span > 0 ? span * 0.12 : Math.max(minP * 0.05, 0.02);
  minP -= pad;
  maxP += pad;
  const range = maxP - minP || 1;

  const cx = opts.x + padL;
  const cy = opts.y + padT;
  doc.setDrawColor(...PDF_ZINC_100);
  doc.setLineWidth(0.6);
  doc.rect(cx, cy, innerW, innerH, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...PDF_ZINC_400);
  doc.text(`€/${opts.unit}`, opts.x + 14, cy + innerH * 0.65, { angle: 90 });
  doc.text('Evolución desde historico_precios (recepción / albarán). Línea roja = precios tras recepción; línea gris = media del periodo.', cx, cy + innerH + 28, { maxWidth: innerW });

  const tx = (t: number) => cx + ((t - minT) / (maxT - minT || 1)) * innerW;
  const py = (p: number) => cy + innerH - ((p - minP) / range) * innerH;

  doc.setDrawColor(...PDF_ZINC_100);
  doc.setLineWidth(0.35);
  for (let g = 0; g <= 4; g++) {
    const pv = minP + (range * g) / 4;
    const yl = py(pv);
    doc.line(cx, yl, cx + innerW, yl);
    doc.setTextColor(...PDF_ZINC_400);
    doc.text(pv.toFixed(2), cx - 46, yl + 3);
  }

  const yWap = py(wap);
  doc.setDrawColor(...PDF_ZINC_400);
  doc.setLineWidth(1);
  doc.setLineDashPattern([5, 4], 0);
  doc.line(cx, yWap, cx + innerW, yWap);
  doc.setLineDashPattern([], 0);
  doc.setFontSize(7);
  doc.setTextColor(...PDF_ZINC_500);
  doc.text(`Media ponderada ${wap.toFixed(2)} €/${opts.unit}`, cx + innerW - 2, yWap - 5, { align: 'right' });

  doc.setDrawColor(...PDF_BRAND);
  doc.setLineWidth(2.2);
  for (let i = 0; i < times.length - 1; i++) {
    doc.line(tx(times[i]!), py(prices[i]!), tx(times[i + 1]!), py(prices[i + 1]!));
  }
  doc.setFillColor(...PDF_BRAND);
  for (let i = 0; i < times.length; i++) {
    doc.circle(tx(times[i]!), py(prices[i]!), 3.2, 'F');
    doc.setDrawColor(...PDF_WHITE);
    doc.setLineWidth(0.6);
    doc.circle(tx(times[i]!), py(prices[i]!), 3.2, 'S');
    doc.setDrawColor(...PDF_BRAND);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_ZINC_500);
  const nX = 4;
  for (let i = 0; i < nX; i++) {
    const ti = minT + ((maxT - minT) * i) / (nX - 1 || 1);
    const ds = new Date(ti).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
    doc.text(ds, tx(ti), cy + innerH + 14, { align: 'center' });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text(
    `Precio inicial serie: ${opts.basePrice.toFixed(2)} € → Último recibido: ${opts.currentPrice.toFixed(2)} €/${opts.unit}`,
    cx,
    cy + innerH + 36,
  );

  return opts.y + opts.h;
}

/** Comparativa: índice 100 = precio inicial de cada artículo (líneas finas). */
function drawComparisonIndexChart(
  doc: jsPDF,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    items: PriceSummary[];
  },
): number {
  if (opts.items.length === 0) return opts.y;
  const padL = 52;
  const padR = 120;
  const padT = 28;
  const padB = 36;
  const innerW = opts.w - padL - padR;
  const innerH = opts.h - padT - padB;
  const cx = opts.x + padL;
  const cy = opts.y + padT;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text('Comparativa de tensiones (índice 100 = primer precio)', opts.x, opts.y + 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_ZINC_500);
  doc.text('Permite ver qué referencias suben o bajan más respecto a su punto de partida.', opts.x, opts.y + 22);

  let minT = Infinity;
  let maxT = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const row of opts.items) {
    const base = row.base.price;
    if (base <= 0) continue;
    const asc = [...row.points].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    for (const p of asc) {
      const t = Date.parse(p.date);
      const idx = (p.price / base) * 100;
      minT = Math.min(minT, t);
      maxT = Math.max(maxT, t);
      minY = Math.min(minY, idx);
      maxY = Math.max(maxY, idx);
    }
  }
  if (!Number.isFinite(minT) || minT === maxT) return opts.y + opts.h;

  const padY = (maxY - minY) * 0.1 || 2;
  minY -= padY;
  maxY += padY;
  const yRange = maxY - minY || 1;

  doc.setDrawColor(...PDF_ZINC_100);
  doc.rect(cx, cy, innerW, innerH, 'S');
  doc.setDrawColor(...PDF_ZINC_400);
  doc.setLineWidth(0.8);
  const y100 = cy + innerH - ((100 - minY) / yRange) * innerH;
  if (y100 >= cy && y100 <= cy + innerH) {
    doc.setLineDashPattern([3, 3], 0);
    doc.line(cx, y100, cx + innerW, y100);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(7);
    doc.setTextColor(...PDF_ZINC_400);
    doc.text('100', cx - 12, y100 + 3);
  }

  const palette: [number, number, number][] = [
    PDF_BRAND,
    [24, 24, 27],
    [180, 83, 9],
    [21, 128, 61],
    [30, 64, 175],
 [107, 33, 168],
  ];

  const tx = (t: number) => cx + ((t - minT) / (maxT - minT)) * innerW;
  const py = (v: number) => cy + innerH - ((v - minY) / yRange) * innerH;

  const legX = cx + innerW + 8;
  const legY0 = opts.y + 40;
  opts.items.forEach((row, idx) => {
    const base = row.base.price;
    if (base <= 0) return;
    const asc = [...row.points].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const col = palette[idx % palette.length]!;
    doc.setDrawColor(...col);
    doc.setLineWidth(1.4);
    const times = asc.map((p) => Date.parse(p.date));
    const vals = asc.map((p) => (p.price / base) * 100);
    for (let i = 0; i < times.length - 1; i++) {
      doc.line(tx(times[i]!), py(vals[i]!), tx(times[i + 1]!), py(vals[i + 1]!));
    }
    doc.setFillColor(...col);
    for (let i = 0; i < times.length; i++) {
      doc.circle(tx(times[i]!), py(vals[i]!), 2.4, 'F');
    }
    const ly = legY0 + idx * 12;
    doc.rect(legX, ly - 3, 10, 6, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...PDF_ZINC_900);
    const label = row.productName.length > 34 ? `${row.productName.slice(0, 31)}…` : row.productName;
    doc.text(label, legX + 14, ly + 2);
  });

  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_ZINC_400);
  for (let i = 0; i < 4; i++) {
    const ti = minT + ((maxT - minT) * i) / 3;
    doc.text(
      new Date(ti).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      tx(ti),
      cy + innerH + 14,
      { align: 'center' },
    );
  }

  return opts.y + opts.h;
}

export default function PedidosPreciosPage() {
  const { localCode, localName, localId, email } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const [message, setMessage] = React.useState<string | null>(null);
  const [prefsHydrated, setPrefsHydrated] = React.useState(false);
  const [windowPreset, setWindowPreset] = React.useState<WindowPreset>('90');
  const [supplierFilter, setSupplierFilter] = React.useState<string>('');
  const [productSearch, setProductSearch] = React.useState('');
  /** Solo cuando hay mezcla real de unidades de comparación (clave = evolutionKey). */
  const [unitChoiceByKey, setUnitChoiceByKey] = React.useState<Record<string, string>>({});
  const [alertPct, setAlertPct] = React.useState(0);
  const [supplierCatalog, setSupplierCatalog] = React.useState<PedidoSupplier[]>([]);
  const [catalogHistoryRows, setCatalogHistoryRows] = React.useState<CatalogPriceHistoryListRow[]>([]);
  const [catalogHistoryLoading, setCatalogHistoryLoading] = React.useState(false);
  const [catalogHistoryDeleteBusy, setCatalogHistoryDeleteBusy] = React.useState(false);
  const [deleteHistoryId, setDeleteHistoryId] = React.useState<string | null>(null);
  const [dismissedSeriesKeys, setDismissedSeriesKeys] = React.useState(() => new Set<string>());
  const [seriesDeleteContext, setSeriesDeleteContext] = React.useState<{
    key: string;
  } | null>(null);
  const [seriesEvolutionDeleteBusy, setSeriesEvolutionDeleteBusy] = React.useState(false);
  const [evolutionToast, setEvolutionToast] = React.useState<string | null>(null);

  const productInfoBySupplierProductId = React.useMemo(() => {
    const m = new Map<string, ProductInfo>();
    for (const s of supplierCatalog) {
      for (const p of s.products) {
        m.set(p.id, {
          productName: p.name,
          supplierName: s.name,
          supplierId: s.id,
          catalogUnit: p.unit,
        });
      }
    }
    return m;
  }, [supplierCatalog]);

  const unitOverrideMap = React.useMemo(
    () => new Map<string, string>(Object.entries(unitChoiceByKey)),
    [unitChoiceByKey],
  );

  React.useEffect(() => {
    if (!isBrowser()) {
      setPrefsHydrated(true);
      return;
    }
    try {
      const raw = localStorage.getItem(PRECIOS_UI_STORAGE_KEY);
      if (raw) {
        const o = JSON.parse(raw) as Partial<{
          windowPreset: WindowPreset;
          supplierFilter: string;
          alertPct: number;
          productSearch: string;
          unitChoiceByKey: Record<string, string>;
        }>;
        if (
          o.windowPreset === '30' ||
          o.windowPreset === '60' ||
          o.windowPreset === '90' ||
          o.windowPreset === '365' ||
          o.windowPreset === 'all'
        ) {
          setWindowPreset(o.windowPreset);
        }
        if (typeof o.supplierFilter === 'string') setSupplierFilter(o.supplierFilter);
        if (typeof o.alertPct === 'number' && Number.isFinite(o.alertPct)) setAlertPct(o.alertPct);
        if (typeof o.productSearch === 'string') setProductSearch(o.productSearch);
        if (o.unitChoiceByKey && typeof o.unitChoiceByKey === 'object') setUnitChoiceByKey(o.unitChoiceByKey);
      }
    } catch {
      /* ignore */
    }
    setPrefsHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!prefsHydrated || !isBrowser()) return;
    try {
      localStorage.setItem(
        PRECIOS_UI_STORAGE_KEY,
        JSON.stringify({
          windowPreset,
          supplierFilter,
          alertPct,
          productSearch,
          unitChoiceByKey,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [prefsHydrated, windowPreset, supplierFilter, alertPct, productSearch, unitChoiceByKey]);

  React.useEffect(() => {
    if (!localId || !canUse) return;
    if (!isSupabaseEnabled() || !getSupabaseClient()) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchSuppliersWithProducts(getSupabaseClient()!, localId);
        if (!cancelled) setSupplierCatalog(list);
      } catch (e: unknown) {
        if (!cancelled) setMessage(e instanceof Error ? e.message : 'No se pudo cargar el catálogo.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [localId, canUse]);

  const supplierOptions = React.useMemo(
    () =>
      [...supplierCatalog]
        .map((s) => [s.id, s.name] as [string, string])
        .sort((a, b) => a[1].localeCompare(b[1], 'es')),
    [supplierCatalog],
  );

  const { windowStartMs, windowEndMs, windowLabel } = React.useMemo(() => {
    const endMs = Date.now();
    let startMs = 0;
    let label = 'Todo el histórico';
    if (windowPreset === '30') {
      startMs = endMs - 30 * 86_400_000;
      label = 'Últimos 30 días';
    } else if (windowPreset === '60') {
      startMs = endMs - 60 * 86_400_000;
      label = 'Últimos 60 días';
    } else if (windowPreset === '90') {
      startMs = endMs - 90 * 86_400_000;
      label = 'Últimos 90 días';
    } else if (windowPreset === '365') {
      startMs = endMs - 365 * 86_400_000;
      label = 'Últimos 12 meses';
    } else {
      startMs = 0;
      label = 'Todo el histórico';
    }
    return { windowStartMs: startMs, windowEndMs: endMs, windowLabel: label };
  }, [windowPreset]);

  React.useEffect(() => {
    setDismissedSeriesKeys(new Set());
  }, [windowPreset, supplierFilter]);

  React.useEffect(() => {
    setUnitChoiceByKey({});
  }, [supplierFilter]);

  React.useEffect(() => {
    if (!evolutionToast) return;
    const t = window.setTimeout(() => setEvolutionToast(null), 3800);
    return () => window.clearTimeout(t);
  }, [evolutionToast]);

  const reloadCatalogPriceHistory = React.useCallback(async () => {
    if (!localId || !canUse || !isSupabaseEnabled() || !getSupabaseClient()) return;
    setCatalogHistoryLoading(true);
    try {
      const res = await fetchCatalogPriceHistoryRows(getSupabaseClient()!, localId, {
        startMs: windowStartMs,
        endMs: windowEndMs,
      });
      setCatalogHistoryRows(res.rows);
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'No se pudo cargar el historial de catálogo.');
      setCatalogHistoryRows([]);
    } finally {
      setCatalogHistoryLoading(false);
    }
  }, [localId, canUse, windowStartMs, windowEndMs]);

  React.useEffect(() => {
    void reloadCatalogPriceHistory();
  }, [reloadCatalogPriceHistory]);

  const { series, seriesCandidatesBeforeVariation, evolutionDebug } = React.useMemo(() => {
    const d = buildPriceSummariesWithDiagnostics(
      catalogHistoryRows,
      windowStartMs,
      windowEndMs,
      supplierFilter,
      productInfoBySupplierProductId,
      unitOverrideMap,
    );
    return {
      series: d.series,
      seriesCandidatesBeforeVariation: d.seriesCandidatesBeforeVariation,
      evolutionDebug: {
        rawRows: d.rawRows,
        groupedRows: d.groupedRows,
        discardedProducts: d.discardedProducts,
      },
    };
  }, [
    catalogHistoryRows,
    productInfoBySupplierProductId,
    supplierFilter,
    windowStartMs,
    windowEndMs,
    unitOverrideMap,
  ]);

  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    console.log('[Evolución precios] local_id:', localId);
    console.log('[Evolución precios] Filtros:', {
      ventana: windowLabel,
      proveedor: supplierFilter || '(todos)',
      vista: 'automática por producto',
    });
    console.log('Registros evolución crudos:', evolutionDebug.rawRows);
    console.log('Registros agrupados por producto:', evolutionDebug.groupedRows);
    console.log('Productos descartados:', evolutionDebug.discardedProducts);
    console.log('[Evolución precios] Candidatos vs series filtradas:', {
      antesFiltroVariacion: seriesCandidatesBeforeVariation,
      trasFiltro: series.length,
    });
  }, [evolutionDebug, localId, windowLabel, supplierFilter, series.length, seriesCandidatesBeforeVariation]);

  const seriesAllSuppliers = React.useMemo(
    () =>
      buildPriceSummaries(
        catalogHistoryRows,
        windowStartMs,
        windowEndMs,
        '',
        productInfoBySupplierProductId,
        unitOverrideMap,
      ),
    [catalogHistoryRows, productInfoBySupplierProductId, windowStartMs, windowEndMs, unitOverrideMap],
  );

  const seriesAllSuppliersVisible = React.useMemo(
    () => seriesAllSuppliers.filter((r) => !dismissedSeriesKeys.has(r.key)),
    [seriesAllSuppliers, dismissedSeriesKeys],
  );

  const crossSupplierBenchmarks = React.useMemo((): CrossSupplierBenchmark[] => {
    const byProduct = new Map<string, PriceSummary[]>();
    for (const row of seriesAllSuppliersVisible) {
      const k = `${row.productName.trim().toLowerCase()}|${row.catalogUnit}`;
      const list = byProduct.get(k) ?? [];
      list.push(row);
      byProduct.set(k, list);
    }
    const out: CrossSupplierBenchmark[] = [];
    for (const [, rows] of byProduct) {
      if (rows.length < 2) continue;
      const prices = rows.map((r) => r.current.price);
      const minP = Math.min(...prices);
      const maxP = Math.max(...prices);
      if (minP <= 0) continue;
      const spreadPct = Math.round(((maxP - minP) / minP) * 10000) / 100;
      if (spreadPct < 1) continue;
      const sortedRows = [...rows].sort((a, b) => a.current.price - b.current.price);
      const best = sortedRows[0]!;
      const worst = sortedRows[sortedRows.length - 1]!;
      out.push({
        compareKey: `${best.productName}|${best.catalogUnit}`,
        productName: best.productName,
        catalogUnit: best.catalogUnit,
        displayUnit: best.displayUnit,
        spreadPct,
        bestSupplierName: best.supplierName,
        worstSupplierName: worst.supplierName,
        suppliers: sortedRows.map((r) => ({
          supplierName: r.supplierName,
          current: r.current.price,
          pmp: r.weightedAvg,
        })),
      });
    }
    return out.sort((a, b) => b.spreadPct - a.spreadPct).slice(0, 12);
  }, [seriesAllSuppliersVisible]);

  const seriesFiltered = React.useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return series;
    return series.filter((s) => s.productName.toLowerCase().includes(q));
  }, [series, productSearch]);

  const seriesFilteredVisible = React.useMemo(
    () => seriesFiltered.filter((r) => !dismissedSeriesKeys.has(r.key)),
    [seriesFiltered, dismissedSeriesKeys],
  );

  const emptyEvolutionSectionMessage = React.useMemo(() => {
    if (seriesFiltered.length > 0 && seriesFilteredVisible.length === 0) {
      return 'Sin referencias visibles en esta selección.';
    }
    if (productSearch.trim() && series.length > 0 && seriesFiltered.length === 0) {
      return 'Ninguna referencia coincide con el buscador.';
    }
    if (series.length === 0) {
      return 'Sin cambios de precio.';
    }
    return 'Ninguna referencia coincide con el buscador.';
  }, [productSearch, series.length, seriesFiltered.length, seriesFilteredVisible.length]);

  const catalogHistoryFiltered = React.useMemo(() => {
    let list = catalogHistoryRows;
    if (supplierFilter) {
      list = list.filter(
        (r) => productInfoBySupplierProductId.get(r.supplierProductId)?.supplierId === supplierFilter,
      );
    }
    const q = productSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        (productInfoBySupplierProductId.get(r.supplierProductId)?.productName ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [catalogHistoryRows, supplierFilter, productSearch, productInfoBySupplierProductId]);

  const actionRecommendations = React.useMemo((): ActionRecommendation[] => {
    const out: ActionRecommendation[] = [];
    let id = 0;
    const nextId = () => `r-${++id}`;
    for (const row of [...seriesFilteredVisible]
      .filter((s) => s.impactMonthlyVsWap > 0 && isPriceRiseAlert(s, alertPct))
      .sort((a, b) => b.impactMonthlyVsWap - a.impactMonthlyVsWap)
      .slice(0, 5)) {
      out.push({
        id: nextId(),
        priority: 'high',
        title: `Negociar con ${row.supplierName}`,
        detail: `«${row.productName}»: impacto estimado +${row.impactMonthlyVsWap.toFixed(2)} €/mes vs PMP y subida +${row.deltaPct.toFixed(1)} % en la ventana.`,
      });
    }
    for (const b of crossSupplierBenchmarks) {
      if (b.spreadPct < 3 || out.length >= 10) break;
      const lo = b.suppliers[0]!;
      const hi = b.suppliers[b.suppliers.length - 1]!;
      out.push({
        id: nextId(),
        priority: 'medium',
        title: `Comparar proveedores · ${b.productName}`,
        detail: `${lo.supplierName} a ${lo.current.toFixed(2)} €/${b.displayUnit} frente a ${hi.supplierName} (${hi.current.toFixed(2)} €): hueco ${b.spreadPct.toFixed(1)} % sobre el más barato.`,
      });
    }
    return out;
  }, [seriesFilteredVisible, crossSupplierBenchmarks, alertPct]);

  const benchmarksForUi = React.useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return crossSupplierBenchmarks;
    return crossSupplierBenchmarks.filter((b) => b.productName.toLowerCase().includes(q));
  }, [crossSupplierBenchmarks, productSearch]);

  const executiveKpis = React.useMemo(() => {
    const s = seriesFilteredVisible;
    const n = s.length;
    if (n === 0) {
      return {
        n: 0,
        up: 0,
        down: 0,
        avgDeltaPct: 0,
        volWeightedDeltaPct: 0,
        alertCount: 0,
        impactUpMonthly: 0,
        impactDownMonthly: 0,
      };
    }
    const up = s.filter((x) => x.delta > 0).length;
    const down = s.filter((x) => x.delta < 0).length;
    const avgDeltaPct = s.reduce((a, x) => a + x.deltaPct, 0) / n;
    const wSum = s.reduce((a, x) => a + x.totalWeightedQty, 0);
    const volWeightedDeltaPct =
      wSum > 0 ? s.reduce((a, x) => a + x.deltaPct * x.totalWeightedQty, 0) / wSum : avgDeltaPct;
    const alertCount = s.filter((x) => isPriceRiseAlert(x, alertPct)).length;
    const impactUpMonthly = s.filter((x) => x.impactMonthlyVsWap > 0).reduce((a, x) => a + x.impactMonthlyVsWap, 0);
    const impactDownMonthly = s
      .filter((x) => x.impactMonthlyVsWap < 0)
      .reduce((a, x) => a + x.impactMonthlyVsWap, 0);
    return {
      n,
      up,
      down,
      avgDeltaPct,
      volWeightedDeltaPct,
      alertCount,
      impactUpMonthly: Math.round(impactUpMonthly * 100) / 100,
      impactDownMonthly: Math.round(impactDownMonthly * 100) / 100,
    };
  }, [seriesFilteredVisible, alertPct]);

  const impactRanking = React.useMemo(
    () =>
      [...seriesFilteredVisible]
        .filter((x) => x.impactMonthlyVsWap > 0)
        .sort((a, b) => b.impactMonthlyVsWap - a.impactMonthlyVsWap)
        .slice(0, 15),
    [seriesFilteredVisible],
  );

  const evolutionTrendKind = (row: PriceSummary): 'up' | 'down' | 'flat' => {
    if (row.delta > 0.0001) return 'up';
    if (row.delta < -0.0001) return 'down';
    return 'flat';
  };

  const downloadReportPdf = React.useCallback(() => {
    if (seriesFilteredVisible.length === 0) {
      setMessage('No hay variaciones de precio para descargar en el periodo seleccionado (ajusta filtros).');
      return;
    }
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const localLabel = (localName?.trim() || localCode || 'Local').trim();
    const supplierLabel = supplierFilter
      ? supplierOptions.find(([id]) => id === supplierFilter)?.[1] ?? 'Proveedor'
      : 'Todos los proveedores';

    doc.setFillColor(...PDF_BRAND);
    doc.rect(0, 0, pageW, 14, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_WHITE);
    doc.text('CHEF-ONE', 40, 10);
    doc.setFont('helvetica', 'normal');
    doc.text('Evolución de precios proveedor', pageW - 40, 10, { align: 'right' });
    doc.setTextColor(...PDF_ZINC_900);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Informe para dirección', 40, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text(localLabel, 40, 58);
    doc.text(
      `${windowLabel} · Vista automática (unidad por producto) · ${supplierLabel}`,
      40,
      72,
      { maxWidth: pageW - 80 },
    );
    doc.setFontSize(9);
    doc.text(
      'Referencias con cambios registrados en recepción (historico_precios). Impacto mes: estimación vs media del periodo según número de recepciones en la ventana.',
      40,
      86,
      { maxWidth: pageW - 80 },
    );

    const kpiY = 102;
    const gap = 8;
    const nKpi = 6;
    const kpiW = (pageW - 80 - (nKpi - 1) * gap) / nKpi;
    const kpiH = 52;
    const kpis: [string, string][] = [
      ['Referencias', String(executiveKpis.n)],
      [
        'Suben / alerta',
        `${executiveKpis.up} · ${executiveKpis.alertCount} (${alertPct <= 0 ? 'mín. mov.' : `≥${alertPct}%`})`,
      ],
      ['Bajan', String(executiveKpis.down)],
      ['Δ % medio', `${executiveKpis.avgDeltaPct >= 0 ? '+' : ''}${executiveKpis.avgDeltaPct.toFixed(2)} %`],
      ['Δ % ponderado vol.', `${executiveKpis.volWeightedDeltaPct >= 0 ? '+' : ''}${executiveKpis.volWeightedDeltaPct.toFixed(2)} %`],
      ['Impacto +€/mes vs PMP', `${executiveKpis.impactUpMonthly.toFixed(2)} €`],
    ];
    for (let i = 0; i < nKpi; i++) {
      const x = 40 + i * (kpiW + gap);
      doc.setFillColor(...PDF_ZINC_100);
      doc.roundedRect(x, kpiY, kpiW, kpiH, 3, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(...PDF_ZINC_500);
      doc.text(kpis[i]![0], x + 8, kpiY + 16);
      doc.setFontSize(13);
      doc.setTextColor(...PDF_ZINC_900);
      doc.text(kpis[i]![1], x + 8, kpiY + 38);
    }

    const hero = [...seriesFilteredVisible].sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))[0]!;
    const pointsAsc = [...hero.points].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

    let yCursor = kpiY + kpiH + 18;
    yCursor = drawExecutivePriceChart(doc, {
      x: 40,
      y: yCursor,
      w: pageW - 80,
      h: 220,
      title: `Mayor variación relativa: ${hero.productName}`,
      subtitle: `Δ ${hero.delta >= 0 ? '+' : ''}${hero.delta.toFixed(2)} € (${hero.deltaPct >= 0 ? '+' : ''}${hero.deltaPct.toFixed(2)} %). Compras acumuladas (ponderado): ${hero.totalWeightedQty.toLocaleString('es-ES')} ${hero.displayUnit}.`,
      pointsAsc,
      weightedAvg: hero.weightedAvg,
      unit: hero.displayUnit,
      basePrice: hero.base.price,
      currentPrice: hero.current.price,
    });

    const rest = [...seriesFilteredVisible]
      .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
      .filter((s) => s.key !== hero.key)
      .slice(0, 5);
    if (rest.length > 0) {
      yCursor += 10;
      if (yCursor + 190 > pageH - 72) {
        doc.addPage();
        yCursor = 36;
      }
      yCursor = drawComparisonIndexChart(doc, {
        x: 40,
        y: yCursor,
        w: pageW - 80,
        h: 185,
        items: rest,
      });
    }

    let tableStart = yCursor + 18;
    if (tableStart > pageH - 100) {
      doc.addPage();
      tableStart = 44;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...PDF_ZINC_900);
    doc.text('Detalle por referencia', 40, tableStart);
    tableStart += 10;

    const body: string[][] = [];
    for (const row of seriesFilteredVisible) {
      body.push([
        row.productName,
        row.supplierName,
        row.displayUnit,
        `${row.base.price.toFixed(2)}`,
        `${row.weightedAvg.toFixed(2)}`,
        `${row.current.price.toFixed(2)}`,
        `${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(2)}`,
        `${row.deltaPct >= 0 ? '+' : ''}${row.deltaPct.toFixed(2)}%`,
        `${row.impactMonthlyVsWap >= 0 ? '+' : ''}${row.impactMonthlyVsWap.toFixed(2)}`,
        `${row.volatilityCvPct.toFixed(1)}%`,
        row.forecast30d != null ? row.forecast30d.toFixed(2) : '—',
        row.totalWeightedQty.toLocaleString('es-ES', { maximumFractionDigits: 2 }),
      ]);
    }
    autoTable(doc, {
      startY: tableStart + 4,
      head: [
        [
          'Producto',
          'Proveedor',
          'Ud',
          'Precio inicial serie',
          'PMP',
          'Último recibido',
          'Δ €',
          'Δ %',
          'Impacto mes*',
          'Vol CV%',
          'Tend.~30d',
          'Qty periodo',
        ],
      ],
      body,
      styles: { fontSize: 6.5, cellPadding: 2.5, textColor: PDF_ZINC_900 },
      headStyles: { fillColor: PDF_BRAND, textColor: PDF_WHITE, fontSize: 6.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 40, right: 40 },
    });

    const docWithTable = doc as jsPDF & { lastAutoTable?: { finalY?: number } };
    for (const row of seriesFilteredVisible) {
      doc.addPage();
      let y = 44;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...PDF_ZINC_900);
      doc.text(row.productName, 40, y);
      y += 18;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...PDF_ZINC_500);
      doc.text(`Proveedor: ${row.supplierName}`, 40, y);
      y += 14;
      doc.setTextColor(...PDF_ZINC_900);
      const trendPdf =
        row.delta > 0
          ? `Sube +${row.delta.toFixed(2)} €/${row.displayUnit} (+${row.deltaPct.toFixed(2)}%)`
          : row.delta < 0
            ? `Baja ${row.delta.toFixed(2)} €/${row.displayUnit} (${row.deltaPct.toFixed(2)}%)`
            : 'Sin cambio';
      const blockLines = [
        `Precio inicial serie: ${row.base.price.toFixed(2)} €/${row.displayUnit} · Último recibido: ${row.current.price.toFixed(2)} €/${row.displayUnit}`,
        `PMP: ${row.weightedAvg.toFixed(2)} €/${row.displayUnit} · Cantidad periodo (ponderado): ${row.totalWeightedQty.toLocaleString('es-ES')}`,
        `Impacto mensual vs PMP: ${row.impactMonthlyVsWap >= 0 ? '+' : ''}${row.impactMonthlyVsWap.toFixed(2)} € · Volatilidad (CV): ${row.volatilityCvPct.toFixed(1)} %${
          row.forecast30d != null ? ` · Tendencia ~30d: ${row.forecast30d.toFixed(2)} €/${row.displayUnit}` : ''
        }`,
        trendPdf,
      ];
      for (const line of blockLines) {
        const wrapped = doc.splitTextToSize(line, pageW - 80);
        doc.text(wrapped, 40, y);
        y += wrapped.length * 11;
      }
      y += 10;
      const pointsAsc = [...row.points].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      y = drawExecutivePriceChart(doc, {
        x: 40,
        y,
        w: pageW - 80,
        h: 200,
        title: 'Gráfico de evolución',
        subtitle: `${row.productName} · ${row.supplierName}`,
        pointsAsc,
        weightedAvg: row.weightedAvg,
        unit: row.displayUnit,
        basePrice: row.base.price,
        currentPrice: row.current.price,
      });
      y += 14;

      const purchBody =
        row.purchases.length > 0
          ? row.purchases.map((p) => [
              new Date(p.date).toLocaleDateString('es-ES'),
              p.supplier,
              formatQuantityWithUnit(p.qty, p.unit),
              `${p.price.toFixed(2)}`,
            ])
          : [['—', '—', 'Sin compras en la ventana', '—']];
      autoTable(doc, {
        startY: y,
        head: [[`Compras (fecha)`, 'Proveedor', 'Cantidad', `€/${row.displayUnit}`]],
        body: purchBody,
        styles: { fontSize: 7, cellPadding: 2.5, textColor: PDF_ZINC_900 },
        headStyles: { fillColor: PDF_BRAND, textColor: PDF_WHITE, fontSize: 7 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 40, right: 40 },
      });
      y = (docWithTable.lastAutoTable?.finalY ?? y) + 14;

      const evoBody = row.points.map((p) => {
        const tipo = p.sortRank === 0 ? 'Pedido' : 'Albarán';
        const extra = p.sortRank === 0 ? ' · precio pedido' : '';
        return [
          new Date(p.date).toLocaleDateString('es-ES'),
          p.supplier,
          `${p.price.toFixed(2)} €/${p.unit}`,
          `${tipo}${extra}`,
        ];
      });
      autoTable(doc, {
        startY: y,
        head: [['Evolución precio — Fecha', 'Proveedor', 'Precio', 'Tipo']],
        body: evoBody.length > 0 ? evoBody : [['—', '—', '—', 'Sin puntos']],
        styles: { fontSize: 7, cellPadding: 2.5, textColor: PDF_ZINC_900 },
        headStyles: { fillColor: PDF_BRAND, textColor: PDF_WHITE, fontSize: 7 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 40, right: 40 },
      });
    }

    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      pdfFooter(doc, p, totalPages);
    }

    const stamp = new Date().toISOString().slice(0, 10);
    doc.save(`evolucion-precios-${stamp}.pdf`);
  }, [
    seriesFilteredVisible,
    executiveKpis,
    localName,
    localCode,
    windowLabel,
    supplierFilter,
    supplierOptions,
    alertPct,
  ]);

  const downloadCsv = React.useCallback(() => {
    if (seriesFilteredVisible.length === 0) {
      setMessage('No hay variaciones de precio para exportar en el periodo seleccionado (ajusta filtros).');
      return;
    }
    const supplierLabel = supplierFilter
      ? supplierOptions.find(([id]) => id === supplierFilter)?.[1] ?? ''
      : 'Todos';
    const headerMeta = [
      ['Chef-One · Evolución de precios'],
      ['Local', (localName?.trim() || localCode || '').trim()],
      ['Ventana', windowLabel],
      ['Modo', 'Automático por producto'],
      ['Proveedor', supplierLabel],
      ['Búsqueda', productSearch.trim() || '—'],
      [],
    ];
    const head = [
      'Producto',
      'Proveedor linea',
      'Ud',
      'Precio base catálogo (inicio serie)',
      'PMP',
      'Último recibido',
      'Delta EUR',
      'Delta %',
      'Impacto mensual vs PMP EUR',
      'Volatilidad CV %',
      'Tendencia 30d',
      'Cantidad periodo (ponderado)',
    ];
    const lines: string[] = [];
    for (const row of headerMeta) {
      lines.push(row.map((c) => escapeCsvCell(String(c))).join(';'));
    }
    lines.push(head.map(escapeCsvCell).join(';'));
    for (const row of seriesFilteredVisible) {
      lines.push(
        [
          row.productName,
          row.supplierName,
          row.displayUnit,
          row.base.price.toFixed(4),
          row.weightedAvg.toFixed(4),
          row.current.price.toFixed(4),
          row.delta.toFixed(4),
          row.deltaPct.toFixed(2),
          row.impactMonthlyVsWap.toFixed(2),
          row.volatilityCvPct.toFixed(2),
          row.forecast30d != null ? row.forecast30d.toFixed(4) : '',
          row.totalWeightedQty.toFixed(2),
        ]
          .map(escapeCsvCell)
          .join(';'),
      );
    }
    const bom = '\uFEFF';
    const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evolucion-precios-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(null);
  }, [
    seriesFilteredVisible,
    localName,
    localCode,
    windowLabel,
    supplierFilter,
    supplierOptions,
    productSearch,
  ]);

  const handleConfirmDeleteCatalogHistory = React.useCallback(async () => {
    if (!deleteHistoryId || !localId || !isSupabaseEnabled() || !getSupabaseClient()) return;
    setCatalogHistoryDeleteBusy(true);
    try {
      await deleteCatalogPriceHistoryRow(getSupabaseClient()!, localId, deleteHistoryId);
      setDeleteHistoryId(null);
      await reloadCatalogPriceHistory();
    } catch {
      await appAlert('No se pudo eliminar el registro.');
    } finally {
      setCatalogHistoryDeleteBusy(false);
    }
  }, [deleteHistoryId, localId, reloadCatalogPriceHistory]);

  const handleConfirmDeleteSeriesEvolution = React.useCallback(async () => {
    if (!seriesDeleteContext || !localId || !isSupabaseEnabled() || !getSupabaseClient()) return;
    setSeriesEvolutionDeleteBusy(true);
    try {
      const ctx = seriesDeleteContext;
      const spId = supplierProductIdFromEvolutionKey(ctx.key);
      if (!spId) {
        await appAlert('No se pudo identificar el producto.');
        return;
      }
      await deleteHistoricoPreciosForSupplierProduct(getSupabaseClient()!, localId, spId);
      setDismissedSeriesKeys((prev) => {
        const n = new Set(prev);
        n.add(ctx.key);
        return n;
      });
      setSeriesDeleteContext(null);
      await reloadCatalogPriceHistory();
      setEvolutionToast('Histórico de recepción eliminado para este producto');
    } catch {
      await appAlert('No se pudo eliminar el histórico de precios.');
    } finally {
      setSeriesEvolutionDeleteBusy(false);
    }
  }, [seriesDeleteContext, localId, reloadCatalogPriceHistory]);

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
    <div className="space-y-4 overflow-x-hidden">
      <section className="flex flex-wrap gap-2">
        <Link href="/pedidos" className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700">
          ← Atras
        </Link>
        <Link
          href="/pedidos/historial-mes"
          className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700"
        >
          Compras del mes
        </Link>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/80 sm:p-5">
        <div className="flex flex-col gap-1 text-center sm:text-left">
          <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Pedidos</p>
          <h1 className="font-serif text-2xl font-normal tracking-tight text-zinc-900">Evolución de precio</h1>
        </div>
        {message ? <p className="pt-2 text-center text-sm text-[#B91C1C] sm:text-left">{message}</p> : null}

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="sr-only">Periodo</span>
            <div className="inline-flex max-w-full rounded-full bg-zinc-100 p-0.5">
              {(
                [
                  ['30', '30d'],
                  ['60', '60d'],
                  ['90', '90d'],
                  ['365', '12m'],
                  ['all', 'Todo'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setWindowPreset(val)}
                  className={[
                    'rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors',
                    windowPreset === val ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              aria-label="Proveedor"
              className="h-9 min-w-0 flex-1 rounded-full border-0 bg-zinc-100 px-3 text-[13px] font-medium text-zinc-900 ring-1 ring-zinc-200/80 sm:max-w-[14rem]"
            >
              <option value="">Todos los proveedores</option>
              {supplierOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={String(alertPct)}
              onChange={(e) => setAlertPct(Number(e.target.value))}
              aria-label="Umbral alerta subida"
              className="h-9 shrink-0 rounded-full border-0 bg-zinc-100 px-2.5 text-[12px] font-medium text-zinc-800 ring-1 ring-zinc-200/80"
            >
              <option value="0">Alerta: mín.</option>
              <option value="3">Alerta ≥3%</option>
              <option value="5">Alerta ≥5%</option>
              <option value="8">Alerta ≥8%</option>
              <option value="10">Alerta ≥10%</option>
            </select>
          </div>
          <input
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder="Buscar referencia…"
            className="h-10 w-full rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 text-[14px] text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-200"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadReportPdf}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#D32F2F] px-4 text-sm font-semibold text-white"
          >
            Informe PDF
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800"
          >
            <Download className="h-4 w-4" aria-hidden />
            CSV (Excel)
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-100 bg-zinc-50/40 p-3 ring-1 ring-zinc-100">
          <p className="text-[11px] font-semibold text-zinc-500">Historial de recepción</p>
          {catalogHistoryLoading ? (
            <p className="mt-2 text-sm text-zinc-500">Cargando…</p>
          ) : catalogHistoryFiltered.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Sin historial.</p>
          ) : (
            <ul className="mt-2 max-h-52 divide-y divide-zinc-100 overflow-y-auto rounded-xl bg-white ring-1 ring-zinc-200/80">
              {catalogHistoryFiltered.map((h) => {
                const info = productInfoBySupplierProductId.get(h.supplierProductId);
                return (
                  <li key={h.id} className="flex items-start gap-2 px-3 py-2.5 text-[13px]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-zinc-900" title={info?.productName}>
                        {info?.productName ?? h.supplierProductId.slice(0, 8) + '…'}
                      </p>
                      <p className="truncate text-[12px] text-zinc-500">{info?.supplierName ?? '—'}</p>
                      <p className="mt-0.5 tabular-nums text-[12px] text-zinc-700">
                        {h.oldPricePerUnit.toFixed(2)} → {h.newPricePerUnit.toFixed(2)} {euroPerUnitShortLabel(h.displayUnit)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                      <time className="whitespace-nowrap text-[11px] text-zinc-400">
                        {new Date(h.createdAt).toLocaleString('es-ES', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                      <button
                        type="button"
                        disabled={catalogHistoryDeleteBusy}
                        onClick={() => setDeleteHistoryId(h.id)}
                        className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-3 ring-1 ring-zinc-200/80">
        <p className="px-1 text-[11px] font-medium text-zinc-400">{windowLabel}</p>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="min-w-[7.5rem] shrink-0 rounded-2xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Referencias</p>
            <p className="text-lg font-semibold tabular-nums text-zinc-900">{executiveKpis.n}</p>
            <p className="text-[11px] text-zinc-500">
              ↑{executiveKpis.up} · ↓{executiveKpis.down}
            </p>
          </div>
          <div className="min-w-[7.5rem] shrink-0 rounded-2xl bg-amber-50/80 px-3 py-2 ring-1 ring-amber-100/80">
            <p className="text-[10px] font-medium uppercase tracking-wide text-amber-800/90">Alertas</p>
            <p className="flex items-center gap-1 text-lg font-semibold tabular-nums text-amber-950">
              {executiveKpis.alertCount}
              <AlertTriangle className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            </p>
            <p className="text-[11px] text-amber-900/70">{alertPct <= 0 ? 'Cualquier subida' : `≥ ${alertPct}%`}</p>
          </div>
          <div className="min-w-[8rem] shrink-0 rounded-2xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Δ % vol.</p>
            <p className="text-lg font-semibold tabular-nums text-zinc-900">
              {executiveKpis.volWeightedDeltaPct >= 0 ? '+' : ''}
              {executiveKpis.volWeightedDeltaPct.toFixed(1)}%
            </p>
            <p className="text-[11px] text-zinc-500">
              μ {executiveKpis.avgDeltaPct >= 0 ? '+' : ''}
              {executiveKpis.avgDeltaPct.toFixed(1)}%
            </p>
          </div>
          <div className="min-w-[8rem] shrink-0 rounded-2xl bg-red-50/70 px-3 py-2 ring-1 ring-red-100/80">
            <p className="text-[10px] font-medium uppercase tracking-wide text-red-800/80">Impacto +€/mes</p>
            <p className="flex items-center gap-1 text-lg font-semibold tabular-nums text-red-700">
              +{executiveKpis.impactUpMonthly.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <TrendingUp className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            </p>
          </div>
          <div className="min-w-[8rem] shrink-0 rounded-2xl bg-emerald-50/70 px-3 py-2 ring-1 ring-emerald-100/80">
            <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-800/80">vs PMP −</p>
            <p className="flex items-center gap-1 text-lg font-semibold tabular-nums text-emerald-800">
              {executiveKpis.impactDownMonthly.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <TrendingDown className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            </p>
          </div>
        </div>
      </section>

      {actionRecommendations.length > 0 ? (
        <section className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 ring-1 ring-amber-100">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-800" aria-hidden />
            <p className="text-sm font-black text-zinc-900">Recomendaciones automáticas</p>
          </div>
            <p className="mt-1 text-xs text-zinc-600">Impacto vs PMP, alertas y diferencias entre proveedores.</p>
          <ul className="mt-3 space-y-2">
            {actionRecommendations.map((rec) => (
              <li
                key={rec.id}
                className={[
                  'rounded-xl px-3 py-2 text-xs ring-1',
                  rec.priority === 'high'
                    ? 'bg-white font-medium text-zinc-900 ring-red-200/80'
                    : 'bg-white/90 text-zinc-800 ring-zinc-200',
                ].join(' ')}
              >
                <span className="font-bold text-zinc-900">{rec.title}.</span> {rec.detail}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {benchmarksForUi.length > 0 ? (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <p className="text-sm font-black text-zinc-900">Mismo producto, varios proveedores</p>
          <p className="mt-1 text-xs text-zinc-600">Misma referencia y unidad de catálogo; orden por hueco de precio.</p>
          <div className="mt-3 space-y-3">
            {benchmarksForUi.map((b) => (
              <div key={b.compareKey} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-bold text-zinc-900">
                    {b.productName}{' '}
                    <span className="text-xs font-semibold text-zinc-500">({b.catalogUnit})</span>
                  </p>
                  <p className="text-xs font-bold text-amber-900">Hueco {b.spreadPct.toFixed(1)} %</p>
                </div>
                <p className="mt-1 text-[11px] text-zinc-600">
                  Mejor: <span className="font-semibold text-emerald-800">{b.bestSupplierName}</span> · Peor:{' '}
                  <span className="font-semibold text-red-800">{b.worstSupplierName}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {b.suppliers.map((s) => (
                    <span
                      key={s.supplierName}
                      className="inline-flex items-center rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-zinc-700 ring-1 ring-zinc-200"
                    >
                      {s.supplierName}: {s.current.toFixed(2)} €/{b.displayUnit}
                      <span className="ml-1 text-zinc-500">(PMP {s.pmp.toFixed(2)})</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {impactRanking.length > 0 ? (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <p className="text-sm font-semibold text-zinc-900">Mayor impacto vs PMP</p>
          <ul className="mt-3 divide-y divide-zinc-100">
            {impactRanking.map((row, idx) => (
              <li key={row.key} className="flex flex-wrap items-center gap-2 py-2.5 text-[13px] first:pt-0">
                <span className="w-5 shrink-0 tabular-nums text-zinc-400">{idx + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-zinc-900">{row.productName}</p>
                  <p className="truncate text-[12px] text-zinc-500">{row.supplierName}</p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-red-600">+{row.impactMonthlyVsWap.toFixed(2)} €</span>
                <span className="shrink-0 tabular-nums text-zinc-500">+{row.deltaPct.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-4">
        {seriesFilteredVisible.length === 0 ? (
          <div className="rounded-2xl bg-white p-4 text-sm text-zinc-500 ring-1 ring-zinc-200">
            {emptyEvolutionSectionMessage}
          </div>
        ) : null}
        {seriesFilteredVisible.map((row) => {
          const alert = isPriceRiseAlert(row, alertPct);
          const trend = evolutionTrendKind(row);
          const eu = euroPerUnitShortLabel(row.displayUnit);
          const receptionCount = row.points.filter((p) => p.sortRank === 1).length;
          const { up: refUp, down: refDown } = countReceptionPriceSteps(row);
          const ahorroVsPmp =
            row.impactMonthlyVsWap < 0 ? Math.round(Math.abs(row.impactMonthlyVsWap) * 100) / 100 : 0;
          const deltaVsPmpEur = Math.round((row.current.price - row.weightedAvg) * 100) / 100;
          const currentDateLabel = new Date(row.current.date).toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          });
          const unitSwitcher =
            row.showUnitSwitcher && row.alternativeUnits.length > 1
              ? {
                  options: row.alternativeUnits,
                  value: row.displayUnit,
                  onChange: (u: string) =>
                    setUnitChoiceByKey((prev) => ({
                      ...prev,
                      [row.key]: u,
                    })),
                }
              : null;
          const historialRows = [...row.purchases].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 8);
          return (
            <article
              key={row.key}
              className={[
                'overflow-hidden rounded-2xl bg-white shadow-sm ring-1',
                alert ? 'ring-2 ring-amber-300/90' : 'ring-zinc-200/90',
              ].join(' ')}
            >
              <div className="border-b border-zinc-100/90 px-4 pb-4 pt-4">
                <div className="flex gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-zinc-100 ring-1 ring-zinc-200/80">
                    <Package className="h-7 w-7 text-zinc-400" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="font-sans text-[15px] font-bold uppercase leading-snug tracking-wide text-zinc-900">
                          {row.productName}
                        </h2>
                        <p className="mt-1 text-[12px] leading-snug text-zinc-500">{row.supplierName}</p>
                      </div>
                      <div className="flex shrink-0 items-start gap-1.5">
                        {trend === 'up' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                            Subida
                          </span>
                        ) : trend === 'down' ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-900">
                            Bajada
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600">
                            Estable
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={seriesEvolutionDeleteBusy}
                          title="Borrar histórico de este producto"
                          onClick={() => setSeriesDeleteContext({ key: row.key })}
                          className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-[#B91C1C] disabled:opacity-40"
                          aria-label="Borrar histórico de este producto"
                        >
                          <Trash2 className="h-5 w-5" aria-hidden />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white px-3 py-3 ring-1 ring-zinc-200/90">
                    <p className="text-[11px] font-medium text-zinc-500">Último recibido</p>
                    <p className="mt-1 font-sans text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">
                      {row.current.price.toFixed(2).replace('.', ',')} {eu}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-400">{currentDateLabel}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-3 py-3 ring-1 ring-zinc-200/90">
                    <p className="text-[11px] font-medium text-zinc-500">PMP</p>
                    <p className="text-[10px] text-zinc-400">Media ponderada del periodo</p>
                    <p className="text-[10px] text-zinc-400">{windowLabel}</p>
                    <p className="mt-1 font-sans text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">
                      {row.weightedAvg.toFixed(2).replace('.', ',')} {eu}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-400">
                      {row.totalWeightedQty.toLocaleString('es-ES', { maximumFractionDigits: 2 })}{' '}
                      {row.displayUnit} (ponderado)
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white px-3 py-3 ring-1 ring-zinc-200/90">
                    <p className="text-[11px] font-medium text-zinc-500">Variación vs PMP</p>
                    <p
                      className={[
                        'mt-1 font-sans text-2xl font-semibold tabular-nums tracking-tight',
                        deltaVsPmpEur > 0 ? 'text-red-600' : deltaVsPmpEur < 0 ? 'text-emerald-600' : 'text-zinc-900',
                      ].join(' ')}
                    >
                      {deltaVsPmpEur >= 0 ? '+' : ''}
                      {deltaVsPmpEur.toFixed(2).replace('.', ',')} {eu}
                    </p>
                    <p className="mt-2">
                      <span
                        className={[
                          'inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
                          row.deltaPct > 0
                            ? 'bg-red-50 text-red-700 ring-1 ring-red-100'
                            : row.deltaPct < 0
                              ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100'
                              : 'bg-zinc-100 text-zinc-600',
                        ].join(' ')}
                      >
                        {row.deltaPct >= 0 ? '+' : ''}
                        {row.deltaPct.toFixed(1).replace('.', ',')}%
                      </span>
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-2xl bg-emerald-50/80 px-3 py-2.5 ring-1 ring-emerald-100/90">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-800/90">Impacto mensual</p>
                    <p className="mt-0.5 font-sans text-lg font-semibold tabular-nums text-emerald-900">
                      {row.impactMonthlyVsWap >= 0 ? '+' : ''}
                      {row.impactMonthlyVsWap.toFixed(2).replace('.', ',')} €
                    </p>
                    <p className="text-[10px] text-emerald-800/70">Si el ritmo se mantiene</p>
                  </div>
                  <div className="rounded-2xl bg-red-50/70 px-3 py-2.5 ring-1 ring-red-100/80">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-red-800/85">Ahorro vs PMP</p>
                    <p className="mt-0.5 font-sans text-lg font-semibold tabular-nums text-red-800">
                      {ahorroVsPmp.toFixed(2).replace('.', ',')} €
                    </p>
                    <p className="text-[10px] text-red-700/75">{ahorroVsPmp > 0 ? 'vs precio medio periodo' : 'No hay bajadas'}</p>
                  </div>
                  <div className="rounded-2xl bg-amber-50/90 px-3 py-2.5 ring-1 ring-amber-100/90">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-amber-900/90">Volatilidad (CV)</p>
                    <p className="mt-0.5 font-sans text-lg font-semibold tabular-nums text-amber-950">
                      {row.volatilityCvPct.toFixed(1).replace('.', ',')}%
                    </p>
                    <p className="text-[10px] text-amber-900/70">{volatilityStabilityLabel(row.volatilityCvPct)}</p>
                  </div>
                  <div className="rounded-2xl bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-200/90">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Referencias</p>
                    <p className="mt-0.5 font-sans text-lg font-semibold tabular-nums text-zinc-900">{receptionCount}</p>
                    <p className="text-[10px] text-zinc-500">
                      Suben {refUp} · Bajan {refDown}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-50/50 px-3 pb-4 pt-3 sm:px-4">
                <PriceEvolutionMiniChart
                  row={row}
                  unitSwitcher={unitSwitcher}
                  chartPeriod={{ value: windowPreset, onChange: setWindowPreset }}
                />
              </div>

              {historialRows.length > 0 ? (
                <div className="border-t border-zinc-100 px-4 py-4">
                  <h3 className="font-serif text-lg font-normal text-zinc-900">Historial de recepciones</h3>
                  <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-zinc-200/80">
                    <table className="w-full min-w-[280px] text-left text-[13px]">
                      <thead>
                        <tr className="border-b border-zinc-100 bg-zinc-50/90 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                          <th className="px-3 py-2 font-sans">Fecha</th>
                          <th className="px-3 py-2 font-sans">Cantidad</th>
                          <th className="px-3 py-2 text-right font-sans">Precio</th>
                          <th className="px-3 py-2 font-sans">Unidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historialRows.map((pur, idx) => (
                          <tr key={`${row.key}-h-${idx}`} className="border-b border-zinc-50 bg-white last:border-0">
                            <td className="whitespace-nowrap px-3 py-2.5 text-zinc-700">
                              {new Date(pur.date).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: 'short',
                                year: '2-digit',
                              })}
                            </td>
                            <td className="px-3 py-2.5 text-zinc-700">{formatQuantityWithUnit(pur.qty, pur.unit)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-medium text-zinc-900">
                              {pur.price.toFixed(2).replace('.', ',')}
                            </td>
                            <td className="px-3 py-2.5 text-zinc-600">{pur.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 rounded-xl bg-zinc-50 px-3 py-2 text-[11px] leading-relaxed text-zinc-500 ring-1 ring-zinc-100">
                    Precios en {eu} según la unidad de comparación de esta referencia en el periodo.
                  </p>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      {deleteHistoryId != null ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Cerrar"
            onClick={() => {
              if (!catalogHistoryDeleteBusy) setDeleteHistoryId(null);
            }}
          />
          <div
            className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-2xl ring-1 ring-zinc-100"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-price-history-title"
          >
            <p id="delete-price-history-title" className="text-base font-bold text-zinc-900">
              ¿Eliminar esta evolución de precio?
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Esta acción quitará este registro del histórico. No afecta al producto ni al proveedor.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={catalogHistoryDeleteBusy}
                className="h-11 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-800"
                onClick={() => setDeleteHistoryId(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={catalogHistoryDeleteBusy}
                className="h-11 rounded-xl bg-[#D32F2F] px-4 text-sm font-black tracking-wide text-white"
                onClick={() => void handleConfirmDeleteCatalogHistory()}
              >
                {catalogHistoryDeleteBusy ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {seriesDeleteContext != null ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Cerrar"
            onClick={() => {
              if (!seriesEvolutionDeleteBusy) setSeriesDeleteContext(null);
            }}
          />
          <div
            className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-2xl ring-1 ring-zinc-100"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-series-evolution-title"
          >
            <p id="delete-series-evolution-title" className="text-base font-bold text-zinc-900">
              Borrar histórico de recepción
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Se eliminarán todos los registros de evolución de precio de este producto. No se borra el catálogo ni los pedidos.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={seriesEvolutionDeleteBusy}
                className="h-11 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-800"
                onClick={() => setSeriesDeleteContext(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={seriesEvolutionDeleteBusy}
                className="h-11 rounded-xl bg-[#D32F2F] px-4 text-sm font-black tracking-wide text-white"
                onClick={() => void handleConfirmDeleteSeriesEvolution()}
              >
                {seriesEvolutionDeleteBusy ? 'Eliminando…' : 'Borrar histórico'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {evolutionToast ? (
        <div
          className="pointer-events-none fixed bottom-6 left-1/2 z-[110] max-w-[min(100vw-2rem,24rem)] -translate-x-1/2 rounded-2xl bg-zinc-900 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg"
          role="status"
        >
          {evolutionToast}
        </div>
      ) : null}
    </div>
  );
}

