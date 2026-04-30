'use client';

import Link from 'next/link';
import React from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AlertTriangle, Download, Lightbulb, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
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
  updateSupplierProduct,
  type CatalogPriceHistoryListRow,
  type PedidoSupplier,
} from '@/lib/pedidos-supabase';
import { matchSupplierProductFromHint, parseQuickChefPriceText } from '@/lib/pedidos-quick-price-text';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import type { Unit } from '@/lib/types';

type PriceMode = 'unit' | 'per_kg';
type WindowPreset = '30' | '90' | '365' | 'all';

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
  /** Impacto mensual estimado si el ritmo de compra del periodo se mantiene: (actual − PMP) × (qty/mes). */
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
};

/** Depuración: filas de historico_precios consideradas para la evolución. */
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

function labelCatalogPriceHistorySource(_source: CatalogPriceHistoryListRow['source']): string {
  return 'Recepción (albarán)';
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
  priceMode: PriceMode,
  supplierFilter: string,
  productInfoBySupplierProductId: ReadonlyMap<string, ProductInfo>,
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
  const rawRows: EvolutionDebugRow[] = [];
  const map = new Map<string, Acc>();

  for (const r of historicoRows) {
    const t = Date.parse(r.createdAt);
    const inWindow = Number.isFinite(t) && t >= windowStartMs && t <= windowEndMs;
    const info = productInfoBySupplierProductId.get(r.supplierProductId);
    const supplierFilteredOut = Boolean(supplierFilter && info && info.supplierId !== supplierFilter);

    let discardReason: string | null = null;
    if (!info) discardReason = 'producto no está en catálogo cargado';
    else if (supplierFilteredOut) discardReason = 'filtrado por proveedor';
    else if (!inWindow) discardReason = 'fecha fuera de rango';
    else if (priceMode === 'per_kg' && r.displayUnit !== 'kg') discardReason = 'modo €/kg: unidad comparable no es kg';
    else if (priceMode === 'unit' && r.displayUnit === 'kg') discardReason = 'modo €/ud: serie en €/kg (usar vista €/kg)';

    const key = info ? evolutionKeyFromSupplierProduct(info.supplierId, r.supplierProductId) : r.supplierProductId;

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

    if (discardReason != null || !info) continue;

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

  const daysWindow = Math.max(1, (windowEndMs - windowStartMs) / 86_400_000);
  const monthsInWindow = Math.max(1, daysWindow / 30);

  const seriesCandidates = Array.from(map.values())
    .map((acc) => {
      const sorted = [...acc.historicoRows].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      const displayUnit = (sorted[0]?.displayUnit ?? 'ud') as string;
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
      return {
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
      };
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
  priceMode: PriceMode,
  supplierFilter: string,
  productInfoBySupplierProductId: ReadonlyMap<string, ProductInfo>,
): PriceSummary[] {
  return buildPriceSummariesWithDiagnostics(
    historicoRows,
    windowStartMs,
    windowEndMs,
    priceMode,
    supplierFilter,
    productInfoBySupplierProductId,
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

function PriceEvolutionMiniChart({ row }: { row: PriceSummary }) {
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

  if (data.length < 1) return null;

  if (data.length === 1) {
    const p = data[0]!;
    return (
      <div className="mt-3 w-full min-w-0">
        <div className="flex min-h-[8rem] items-center justify-center rounded-lg bg-zinc-50 px-3 py-6 ring-1 ring-zinc-200">
          <div className="text-center">
            <p className="text-xs font-semibold text-zinc-500">{p.dateLabel}</p>
            <p className="mt-1 text-lg font-black tabular-nums text-zinc-900">
              {p.price.toFixed(2)} €/{row.displayUnit}
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-500">{p.kind}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 w-full min-w-0">
      <div className="h-56 w-full min-h-[14rem] sm:h-60">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: 6, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 9, fill: '#71717a' }}
              interval={data.length > 8 ? 'preserveStartEnd' : 0}
              height={data.length > 8 ? 28 : 40}
              tickMargin={6}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#71717a' }}
              width={52}
              domain={['auto', 'auto']}
              tickMargin={6}
              tickFormatter={(v) => (typeof v === 'number' ? v.toFixed(2) : String(v))}
            />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]?.payload as {
                dateLabel: string;
                price: number;
                kind: string;
                supplier: string;
              };
              if (!p) return null;
              return (
                <div className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-xs shadow-md">
                  <p className="font-semibold text-zinc-900">{p.dateLabel}</p>
                  <p className="text-zinc-600">{p.supplier}</p>
                  <p className="tabular-nums text-zinc-900">
                    {p.price.toFixed(2)} €/{row.displayUnit} · <span className="text-zinc-600">{p.kind}</span>
                  </p>
                </div>
              );
            }}
          />
          <ReferenceLine
            y={row.weightedAvg}
            stroke="#a1a1aa"
            strokeDasharray="5 4"
            label={{
              value: 'PMP',
              position: 'insideTopRight',
              fill: '#71717a',
              fontSize: 10,
            }}
          />
          <Line
            type="monotone"
            dataKey="price"
            name="Precio"
            stroke="#D32F2F"
            strokeWidth={2}
            dot={(props: { cx?: number; cy?: number; payload?: { kind: string } }) => {
              const { cx, cy, payload } = props;
              if (cx == null || cy == null) return null;
              const fill = payload?.kind === 'Inicio' ? '#94a3b8' : '#D32F2F';
              return <circle cx={cx} cy={cy} r={4} fill={fill} stroke="#fff" strokeWidth={1} />;
            }}
            activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
      </div>
      <p className="mt-3 rounded-lg bg-zinc-50 px-2.5 py-2 text-center text-[10px] leading-relaxed text-zinc-600 ring-1 ring-zinc-200/80">
        Gris = precio previo al cambio · Rojo = recepción (albarán) · Línea gris = media del periodo
      </p>
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
  doc.text(`Precio inicial: ${opts.basePrice.toFixed(2)} € →  Actual: ${opts.currentPrice.toFixed(2)} €/${opts.unit}`, cx, cy + innerH + 36);

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
  const { localCode, localName, localId, email, userId } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const [message, setMessage] = React.useState<string | null>(null);
  const [windowPreset, setWindowPreset] = React.useState<WindowPreset>('90');
  const [supplierFilter, setSupplierFilter] = React.useState<string>('');
  const [productSearch, setProductSearch] = React.useState('');
  const [priceMode, setPriceMode] = React.useState<PriceMode>('unit');
  const [alertPct, setAlertPct] = React.useState(0);
  const [quickCatalog, setQuickCatalog] = React.useState<PedidoSupplier[]>([]);
  const [quickCatalogLoading, setQuickCatalogLoading] = React.useState(false);
  const [quickText, setQuickText] = React.useState('');
  const [quickBusy, setQuickBusy] = React.useState(false);
  const [quickFeedback, setQuickFeedback] = React.useState<string | null>(null);
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
    for (const s of quickCatalog) {
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
  }, [quickCatalog]);

  React.useEffect(() => {
    if (!localId || !canUse) return;
    if (!isSupabaseEnabled() || !getSupabaseClient()) return;
    let cancelled = false;
    (async () => {
      setQuickCatalogLoading(true);
      setQuickFeedback(null);
      try {
        const list = await fetchSuppliersWithProducts(getSupabaseClient()!, localId);
        if (!cancelled) setQuickCatalog(list);
      } catch (e: unknown) {
        if (!cancelled) setQuickFeedback(e instanceof Error ? e.message : 'No se pudo cargar el catálogo.');
      } finally {
        if (!cancelled) setQuickCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [localId, canUse]);

  const supplierOptions = React.useMemo(
    () =>
      [...quickCatalog]
        .map((s) => [s.id, s.name] as [string, string])
        .sort((a, b) => a[1].localeCompare(b[1], 'es')),
    [quickCatalog],
  );

  const { windowStartMs, windowEndMs, windowLabel } = React.useMemo(() => {
    const endMs = Date.now();
    let startMs = 0;
    let label = 'Todo el histórico';
    if (windowPreset === '30') {
      startMs = endMs - 30 * 86_400_000;
      label = 'Últimos 30 días';
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
  }, [windowPreset, priceMode, supplierFilter]);

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
      priceMode,
      supplierFilter,
      productInfoBySupplierProductId,
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
    priceMode,
  ]);

  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    console.log('[Evolución precios] Fuente: historico_precios (solo recepción / albarán) · local_id:', localId);
    console.log('[Evolución precios] Filtros:', {
      ventana: windowLabel,
      proveedor: supplierFilter || '(todos)',
      modo: priceMode,
    });
    console.log('Registros evolución crudos:', evolutionDebug.rawRows);
    console.log('Registros agrupados por producto:', evolutionDebug.groupedRows);
    console.log('Productos descartados:', evolutionDebug.discardedProducts);
    console.log('[Evolución precios] Candidatos vs series filtradas:', {
      antesFiltroVariacion: seriesCandidatesBeforeVariation,
      trasFiltro: series.length,
    });
  }, [evolutionDebug, localId, windowLabel, supplierFilter, priceMode, series.length, seriesCandidatesBeforeVariation]);

  const seriesAllSuppliers = React.useMemo(
    () =>
      buildPriceSummaries(
        catalogHistoryRows,
        windowStartMs,
        windowEndMs,
        priceMode,
        '',
        productInfoBySupplierProductId,
      ),
    [catalogHistoryRows, productInfoBySupplierProductId, windowStartMs, windowEndMs, priceMode],
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
      return 'No quedan referencias visibles: vaciaste la evolución con la papelera, o ajusta periodo y proveedor.';
    }
    if (productSearch.trim() && series.length > 0 && seriesFiltered.length === 0) {
      return 'Ninguna referencia coincide con el buscador.';
    }
    if (series.length === 0 && seriesCandidatesBeforeVariation > 0) {
      return 'No hay variaciones de precio en el periodo seleccionado.';
    }
    if (series.length === 0) {
      return 'No hay cambios de precio por recepción en esta selección. Valida albaranes con precio distinto al último registrado, o prueba otro periodo / proveedor / modo €/kg.';
    }
    return 'Ninguna referencia coincide con el buscador.';
  }, [
    productSearch,
    series.length,
    seriesCandidatesBeforeVariation,
    seriesFiltered.length,
    seriesFilteredVisible.length,
  ]);

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

  const trendLabel = (row: PriceSummary) => {
    const u = row.displayUnit;
    if (row.delta > 0) {
      return `Sube +${row.delta.toFixed(2)} €/${u} (+${row.deltaPct.toFixed(2)}%)`;
    }
    if (row.delta < 0) {
      return `Baja ${row.delta.toFixed(2)} €/${u} (${row.deltaPct.toFixed(2)}%)`;
    }
    return 'Sin cambio';
  };

  const trendClass = (row: PriceSummary) => {
    if (row.delta > 0) return 'text-red-700';
    if (row.delta < 0) return 'text-emerald-700';
    return 'text-zinc-600';
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
      `${windowLabel} · ${priceMode === 'per_kg' ? 'Vista €/kg' : 'Vista €/ud'} · ${supplierLabel}`,
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
          'Base',
          'PMP',
          'Actual',
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
        `Base: ${row.base.price.toFixed(2)} €/${row.displayUnit} · Actual: ${row.current.price.toFixed(2)} €/${row.displayUnit}`,
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
    priceMode,
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
      ['Modo', priceMode === 'per_kg' ? '€/kg' : '€/ud'],
      ['Proveedor', supplierLabel],
      ['Búsqueda', productSearch.trim() || '—'],
      [],
    ];
    const head = [
      'Producto',
      'Proveedor linea',
      'Ud',
      'Precio base',
      'PMP',
      'Precio actual',
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
    priceMode,
    supplierFilter,
    supplierOptions,
    productSearch,
  ]);

  const applyQuickPrice = React.useCallback(async () => {
    if (!localId) return;
    setQuickFeedback(null);
    const parsed = parseQuickChefPriceText(quickText);
    if (!parsed) {
      setQuickFeedback('No se detectó un precio. Ejemplo: «el bacon ha subido a 7,80».');
      return;
    }
    const match = matchSupplierProductFromHint(quickCatalog, parsed.nameHint, supplierFilter || undefined);
    if (!match) {
      setQuickFeedback(
        `No encontré un producto que encaje con «${parsed.nameHint}». Prueba otro nombre o quita el filtro de proveedor.`,
      );
      return;
    }
    setQuickBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      const p = match.product;
      await updateSupplierProduct(supabase, localId, p.id, {
        name: p.name,
        unit: p.unit,
        pricePerUnit: parsed.price,
        vatRate: p.vatRate,
        parStock: p.parStock,
        estimatedKgPerUnit: p.estimatedKgPerUnit ?? null,
        unitsPerPack: p.unitsPerPack,
        recipeUnit: p.recipeUnit,
        billingUnit: p.billingUnit ?? null,
        billingQtyPerOrderUnit: p.billingQtyPerOrderUnit ?? null,
        pricePerBillingUnit: p.pricePerBillingUnit ?? null,
        lastPriceUpdatedAt: true,
        priceUpdateOnly: true,
      });
      setQuickFeedback(
        `Catálogo actualizado: ${match.supplier.name} · ${p.name} → ${parsed.price.toFixed(2)} €/${p.unit}. No se crea histórico (solo recepción / albarán).`,
      );
      setQuickText('');
      const list = await fetchSuppliersWithProducts(supabase, localId);
      setQuickCatalog(list);
    } catch (e: unknown) {
      setQuickFeedback(e instanceof Error ? e.message : 'Error al actualizar.');
    } finally {
      setQuickBusy(false);
    }
  }, [quickText, quickCatalog, supplierFilter, localId, userId, reloadCatalogPriceHistory]);

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

      <section className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 shadow-sm ring-1 ring-amber-100/80 sm:p-5">
        <p className="text-[10px] font-black uppercase tracking-wide text-amber-900">Entrada rápida (texto)</p>
        <p className="mt-1 text-xs text-amber-950">
          Actualiza solo el precio del catálogo. La evolución de precios y el histórico se alimentan únicamente de albaranes
          validados en recepción.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <input
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            placeholder="Ej.: Oye Chef: el bacon ha subido a 7,80"
            className="min-h-[48px] flex-1 rounded-xl border border-amber-200 bg-white px-3 text-sm font-medium text-zinc-900 outline-none focus:border-amber-500"
            disabled={quickBusy || quickCatalogLoading}
            autoComplete="off"
          />
          <button
            type="button"
            disabled={quickBusy || quickCatalogLoading || !quickText.trim()}
            onClick={() => void applyQuickPrice()}
            className="min-h-[48px] shrink-0 rounded-xl bg-amber-600 px-4 text-sm font-black text-white shadow-sm disabled:opacity-50"
          >
            {quickBusy ? 'Aplicando…' : 'Actualizar precio'}
          </button>
        </div>
        {quickCatalogLoading ? <p className="mt-2 text-xs text-amber-900">Cargando catálogo…</p> : null}
        {quickFeedback ? <p className="mt-2 text-sm font-semibold text-amber-950">{quickFeedback}</p> : null}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Pedidos</p>
        <h1 className="text-center text-lg font-black text-zinc-900">Evolución de precios</h1>
        <p className="mx-auto mt-2 max-w-2xl text-center text-xs text-zinc-600">
          Vista única sobre la tabla historico_precios: solo cambios reales al validar albaranes. Ajusta periodo, proveedor
          y vista €/ud o €/kg (según unidad comparable guardada).
        </p>
        {message ? <p className="pt-2 text-center text-sm text-[#B91C1C]">{message}</p> : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
            <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Periodo</label>
            <select
              value={windowPreset}
              onChange={(e) => setWindowPreset(e.target.value as WindowPreset)}
              className="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm font-medium text-zinc-900"
            >
              <option value="30">Últimos 30 días</option>
              <option value="90">Últimos 90 días</option>
              <option value="365">Últimos 12 meses</option>
              <option value="all">Todo el histórico</option>
            </select>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
            <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Proveedor</label>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm font-medium text-zinc-900"
            >
              <option value="">Todos</option>
              {supplierOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
            <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Vista precio</label>
            <select
              value={priceMode}
              onChange={(e) => setPriceMode(e.target.value as PriceMode)}
              className="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm font-medium text-zinc-900"
            >
              <option value="unit">€ por unidad de catálogo</option>
              <option value="per_kg">€/kg (real o estimado)</option>
            </select>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
            <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Umbral alerta subida %</label>
            <select
              value={String(alertPct)}
              onChange={(e) => setAlertPct(Number(e.target.value))}
              className="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm font-medium text-zinc-900"
            >
              <option value="0">Cualquier subida (mínimo)</option>
              <option value="3">3 %</option>
              <option value="5">5 %</option>
              <option value="8">8 %</option>
              <option value="10">10 %</option>
            </select>
          </div>
        </div>

        <div className="mt-3">
          <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Buscar referencia</label>
          <input
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder="Nombre de producto…"
            className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
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

        <div className="mt-6 rounded-xl border border-zinc-100 bg-zinc-50/60 p-4 ring-1 ring-zinc-100">
          <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Historial de recepción (Supabase)</p>
          <p className="mt-1 text-xs text-zinc-600">
            Una fila por cada cambio de precio al validar un albarán. Quitar una fila solo borra ese registro; no revierte el
            precio del catálogo.
          </p>
          {catalogHistoryLoading ? (
            <p className="mt-3 text-sm text-zinc-500">Cargando historial…</p>
          ) : catalogHistoryFiltered.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">
              {catalogHistoryRows.length === 0
                ? 'No hay registros de historial de catálogo en este periodo.'
                : 'Ningún registro coincide con proveedor o búsqueda actuales.'}
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-lg ring-1 ring-zinc-200">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="bg-zinc-100 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-2 py-2">Fecha</th>
                    <th className="px-2 py-2">Producto</th>
                    <th className="px-2 py-2">Proveedor</th>
                    <th className="px-2 py-2">Origen</th>
                    <th className="px-2 py-2 text-right">Ant. → Nuevo</th>
                    <th className="px-2 py-2 text-right">Δ %</th>
                    <th className="w-12 px-2 py-2 text-right" aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {catalogHistoryFiltered.map((h) => {
                    const info = productInfoBySupplierProductId.get(h.supplierProductId);
                    return (
                      <tr key={h.id} className="border-t border-zinc-100 bg-white">
                        <td className="whitespace-nowrap px-2 py-2 text-zinc-700">
                          {new Date(h.createdAt).toLocaleString('es-ES', {
                            day: '2-digit',
                            month: 'short',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="max-w-[10rem] truncate px-2 py-2 font-medium text-zinc-900" title={info?.productName}>
                          {info?.productName ?? h.supplierProductId.slice(0, 8) + '…'}
                        </td>
                        <td className="max-w-[8rem] truncate px-2 py-2 text-zinc-600" title={info?.supplierName}>
                          {info?.supplierName ?? '—'}
                        </td>
                        <td className="px-2 py-2 text-zinc-600">{labelCatalogPriceHistorySource(h.source)}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-zinc-800">
                          {h.oldPricePerUnit.toFixed(2)} → {h.newPricePerUnit.toFixed(2)} €/{h.displayUnit}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-zinc-700">
                          {h.diferenciaPct != null && Number.isFinite(h.diferenciaPct)
                            ? `${h.diferenciaPct >= 0 ? '+' : ''}${h.diferenciaPct.toFixed(2)} %`
                            : '—'}
                        </td>
                        <td className="px-1 py-1 text-right">
                          <button
                            type="button"
                            disabled={catalogHistoryDeleteBusy}
                            onClick={() => setDeleteHistoryId(h.id)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 ring-1 ring-zinc-200 hover:bg-red-50 hover:text-red-800 disabled:opacity-50"
                            aria-label="Eliminar"
                            title="Eliminar este registro del histórico"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-gradient-to-br from-zinc-50 to-white p-4 ring-1 ring-zinc-200">
        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Resumen · {windowLabel}
          {priceMode === 'per_kg' ? ' · €/kg' : ' · €/ud'}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <p className="text-[11px] font-semibold text-zinc-500">Referencias con movimiento</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-zinc-900">{executiveKpis.n}</p>
            <p className="mt-1 text-xs text-zinc-600">
              Suben {executiveKpis.up} · Bajan {executiveKpis.down}
            </p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <p className="text-[11px] font-semibold text-zinc-500">Alertas de subida</p>
            <p className="mt-1 flex items-center gap-2 text-2xl font-black tabular-nums text-amber-800">
              {executiveKpis.alertCount}
              <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              {alertPct <= 0
                ? 'Cualquier subida respecto al precio inicial de la serie en la ventana.'
                : `≥ ${alertPct}% respecto al precio inicial en la ventana`}
            </p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <p className="text-[11px] font-semibold text-zinc-500">Δ % ponderado por volumen</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-zinc-900">
              {executiveKpis.volWeightedDeltaPct >= 0 ? '+' : ''}
              {executiveKpis.volWeightedDeltaPct.toFixed(2)} %
            </p>
            <p className="mt-1 text-xs text-zinc-600">Media simple: {executiveKpis.avgDeltaPct >= 0 ? '+' : ''}{executiveKpis.avgDeltaPct.toFixed(2)} %</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-red-100">
            <p className="text-[11px] font-semibold text-red-800">Impacto mensual vs PMP (subidas)</p>
            <p className="mt-1 flex items-center gap-2 text-2xl font-black tabular-nums text-red-700">
              +{executiveKpis.impactUpMonthly.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              <TrendingUp className="h-5 w-5 shrink-0" aria-hidden />
            </p>
            <p className="mt-1 text-xs text-zinc-600">Si el ritmo de compra del periodo se mantiene</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-emerald-100">
            <p className="text-[11px] font-semibold text-emerald-800">Ahorro mensual vs PMP (bajadas)</p>
            <p className="mt-1 flex items-center gap-2 text-2xl font-black tabular-nums text-emerald-700">
              {executiveKpis.impactDownMonthly.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              <TrendingDown className="h-5 w-5 shrink-0" aria-hidden />
            </p>
            <p className="mt-1 text-xs text-zinc-600">Valores negativos = menor coste que la media del periodo</p>
          </div>
        </div>
      </section>

      {actionRecommendations.length > 0 ? (
        <section className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 ring-1 ring-amber-100">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-800" aria-hidden />
            <p className="text-sm font-black text-zinc-900">Recomendaciones automáticas</p>
          </div>
            <p className="mt-1 text-xs text-zinc-600">
              Basadas en impacto vs media del periodo, alertas de subida y huecos entre proveedores (misma ventana y modo
              de vista).
            </p>
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
          <p className="mt-1 text-xs text-zinc-600">
            Referencias con el mismo nombre y unidad de catálogo en la ventana; ordenadas por diferencia relativa entre el
            proveedor más caro y el más barato.
          </p>
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
          <p className="text-sm font-black text-zinc-900">Ranking impacto económico (vs PMP)</p>
          <p className="mt-1 text-xs text-zinc-600">
            Referencias que más encarecen el mes si se mantiene el volumen y el precio actual frente al PMP de la ventana.
          </p>
          <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-zinc-100">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-zinc-50 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Proveedor</th>
                  <th className="px-3 py-2 text-right">Impacto €/mes</th>
                  <th className="px-3 py-2 text-right">Δ %</th>
                  <th className="px-3 py-2 text-right">PMP</th>
                  <th className="px-3 py-2 text-right">Actual</th>
                </tr>
              </thead>
              <tbody>
                {impactRanking.map((row, idx) => (
                  <tr key={row.key} className="border-t border-zinc-100">
                    <td className="px-3 py-2 tabular-nums text-zinc-500">{idx + 1}</td>
                    <td className="px-3 py-2 font-semibold text-zinc-900">{row.productName}</td>
                    <td className="px-3 py-2 text-zinc-700">{row.supplierName}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-red-700">
                      +{row.impactMonthlyVsWap.toFixed(2)} €
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700">+{row.deltaPct.toFixed(1)} %</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                      {row.weightedAvg.toFixed(2)} €/{row.displayUnit}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-900">
                      {row.current.price.toFixed(2)} €/{row.displayUnit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        {seriesFilteredVisible.length === 0 ? (
          <div className="rounded-2xl bg-white p-4 text-sm text-zinc-500 ring-1 ring-zinc-200">
            {emptyEvolutionSectionMessage}
          </div>
        ) : null}
        {seriesFilteredVisible.map((row) => {
          const alert = isPriceRiseAlert(row, alertPct);
          return (
            <div
              key={row.key}
              className={[
                'rounded-2xl bg-white p-4 ring-1',
                alert ? 'ring-2 ring-amber-400 shadow-sm' : 'ring-zinc-200',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 pr-1">
                  <p className="text-sm font-black text-zinc-900">{row.productName}</p>
                  <p className="text-[11px] text-zinc-500">Proveedor: {row.supplierName}</p>
                  {row.usedPerKgUnitFallback ? (
                    <p className="pt-0.5 text-[11px] text-zinc-500">
                      Modo €/kg: sin peso, se muestra el precio por {row.catalogUnit} del catálogo.
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1.5 self-start">
                  {alert ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                      {alertPct <= 0 ? 'Subida' : `Alerta ≥${alertPct}%`}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    disabled={seriesEvolutionDeleteBusy}
                    title="Borrar todo el histórico de recepción de este producto (no borra el catálogo ni pedidos)"
                    onClick={() => {
                      setSeriesDeleteContext({ key: row.key });
                    }}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-red-50 hover:text-[#B91C1C] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
                    aria-label="Borrar histórico de recepción de este producto"
                  >
                    <Trash2 className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              </div>
              <p className="pt-1 text-xs text-zinc-600">
                Base: {row.base.price.toFixed(2)} €/{row.displayUnit} · Actual: {row.current.price.toFixed(2)} €/
                {row.displayUnit}
              </p>
              <p className="pt-1 text-xs font-semibold text-zinc-800">
                PMP:{' '}
                <span className="tabular-nums">
                  {row.weightedAvg.toFixed(2)} €/{row.displayUnit}
                </span>{' '}
                · Cantidad periodo (ponderado):{' '}
                <span className="tabular-nums">{row.totalWeightedQty.toLocaleString('es-ES')}</span>
                {priceMode === 'per_kg' && row.displayUnit === 'kg' ? ' kg' : ` ${row.displayUnit}`}
              </p>
              <p className="pt-1 text-xs text-zinc-600">
                Impacto mensual vs PMP:{' '}
                <span className={`font-bold tabular-nums ${row.impactMonthlyVsWap > 0 ? 'text-red-700' : row.impactMonthlyVsWap < 0 ? 'text-emerald-700' : 'text-zinc-800'}`}>
                  {row.impactMonthlyVsWap >= 0 ? '+' : ''}
                  {row.impactMonthlyVsWap.toFixed(2)} €
                </span>
                {' · '}
                Volatilidad (CV):{' '}
                <span className="font-semibold tabular-nums text-zinc-800">{row.volatilityCvPct.toFixed(1)} %</span>
                {row.forecast30d != null ? (
                  <>
                    {' · '}
                    Tendencia ~30d:{' '}
                    <span className="font-semibold tabular-nums text-zinc-800">
                      {row.forecast30d.toFixed(2)} €/{row.displayUnit}
                    </span>
                  </>
                ) : null}
              </p>
              <p className={`pt-1 text-xs font-semibold ${trendClass(row)}`}>{trendLabel(row)}</p>
              <p className="pt-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Gráfico de evolución</p>
              <PriceEvolutionMiniChart row={row} />
              <p className="pt-5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Recepciones (histórico)</p>
              <div className="mt-1.5 max-h-44 space-y-1 overflow-y-auto overflow-x-hidden rounded-lg bg-zinc-50 p-2 pb-3 ring-1 ring-zinc-200">
                {row.purchases.map((pur, idx) => (
                  <p key={`${row.key}-p-${idx}`} className="text-xs leading-snug text-zinc-600">
                    {new Date(pur.date).toLocaleDateString('es-ES')} · {pur.supplier} ·{' '}
                    {formatQuantityWithUnit(pur.qty, pur.unit)} · {pur.price.toFixed(2)} €/{pur.unit}
                  </p>
                ))}
              </div>
              <p className="pt-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Evolución precio</p>
              <div className="mt-1 max-h-28 space-y-1 overflow-auto rounded-lg bg-zinc-50 p-2 ring-1 ring-zinc-200">
                {row.points.slice(0, 12).map((point, idx) => (
                  <p key={`${row.key}-${idx}`} className="text-xs text-zinc-600">
                    {new Date(point.date).toLocaleDateString('es-ES')} · {point.supplier} · {point.price.toFixed(2)} €/
                    {point.unit}
                    {point.sortRank === 0 ? ' · (referencia previa)' : ''}
                  </p>
                ))}
              </div>
            </div>
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
              Se eliminarán todas las filas de <code className="text-xs">historico_precios</code> para este producto de
              proveedor. No se borra el catálogo ni los pedidos.
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

