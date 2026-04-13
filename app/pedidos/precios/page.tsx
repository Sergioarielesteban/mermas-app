'use client';

import Link from 'next/link';
import React from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '@/components/AuthProvider';
import { usePedidosOrders } from '@/components/PedidosOrdersProvider';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { formatQuantityWithUnit } from '@/lib/pedidos-format';
import { billingQuantityForLine, type PedidoOrder } from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';

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
};

function orderPriceDate(order: PedidoOrder): string {
  return order.receivedAt ?? order.sentAt ?? order.createdAt;
}

/** Fecha del precio «pedido» (catálogo al enviar) para contrastar con albarán en un mismo pedido. */
function orderBasePriceDate(order: PedidoOrder): string {
  return order.sentAt ?? order.createdAt;
}

/**
 * Clave estable por proveedor + producto + unidad. No usar solo `supplier_product_id`:
 * si en un pedido falta el UUID y en otro no, antes se creaban dos series y no había “evolución”.
 * Las incidencias no cambian esta clave: el precio facturado en línea sigue contando.
 */
function evolutionProductKey(order: PedidoOrder, item: PedidoOrder['items'][number]): string {
  const name = item.productName.trim().replace(/\s+/g, ' ').toLowerCase();
  return `${order.supplierId}|${name}|${item.unit}`;
}

/** Precio unitario para historial: incluye líneas con incidencia si `price_per_unit` quedó en 0 pero hay subtotal. */
function unitPriceForPriceHistory(item: PedidoOrder['items'][number]): number | null {
  const p = item.pricePerUnit;
  if (Number.isFinite(p) && p > 0) return Math.round(p * 100) / 100;
  const billed = billingQuantityForLine(item);
  if (billed > 0 && item.lineTotal > 0) {
    return Math.round((item.lineTotal / billed) * 100) / 100;
  }
  if (item.quantity > 0 && item.lineTotal > 0) {
    return Math.round((item.lineTotal / item.quantity) * 100) / 100;
  }
  return null;
}

function weightQtyForHistory(item: PedidoOrder['items'][number]): number {
  const billed = billingQuantityForLine(item);
  if (billed > 0) return billed;
  if (item.quantity > 0) return item.quantity;
  /* Incluir la línea en evolución/media aunque cantidad sea 0 (p. ej. incidencia), para no perder el precio facturado. */
  return 1;
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
  doc.text('Evolución del precio unitario registrado en pedidos (línea roja) y precio medio ponderado de todas las compras (línea gris).', cx, cy + innerH + 28, { maxWidth: innerW });

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
  const { localCode, localName, localId, email } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const { orders: allOrders } = usePedidosOrders();
  const orders = React.useMemo(() => allOrders.filter((o) => o.status !== 'draft'), [allOrders]);
  const [message, setMessage] = React.useState<string | null>(null);

  const series = React.useMemo<PriceSummary[]>(() => {
    type Acc = {
      key: string;
      productName: string;
      points: PricePoint[];
      purchases: PurchaseRow[];
      wSum: number;
      wQty: number;
    };
    const map = new Map<string, Acc>();
    for (const order of orders) {
      const dBill = orderPriceDate(order);
      const dBase = orderBasePriceDate(order);
      for (const item of order.items) {
        const unitPrice = unitPriceForPriceHistory(item);
        if (unitPrice == null) continue;
        const key = evolutionProductKey(order, item);
        const wq = weightQtyForHistory(item);
        const acc =
          map.get(key) ?? {
            key,
            productName: item.productName.trim(),
            points: [],
            purchases: [],
            wSum: 0,
            wQty: 0,
          };
        const baseRaw = item.basePricePerUnit;
        const basePrice =
          baseRaw != null && Number.isFinite(baseRaw) && baseRaw > 0 ? Math.round(baseRaw * 100) / 100 : null;
        if (basePrice != null && Math.abs(basePrice - unitPrice) > 0.001) {
          acc.points.push({
            date: dBase,
            supplier: order.supplierName,
            unit: item.unit,
            price: basePrice,
            orderCreatedAt: order.createdAt,
            itemId: `${item.id}:base`,
            sortRank: 0,
          });
        }
        acc.points.push({
          date: dBill,
          supplier: order.supplierName,
          unit: item.unit,
          price: unitPrice,
          orderCreatedAt: order.createdAt,
          itemId: item.id,
          sortRank: 1,
        });
        acc.purchases.push({
          date: dBill,
          supplier: order.supplierName,
          qty: wq,
          unit: item.unit,
          price: unitPrice,
        });
        acc.wSum += unitPrice * wq;
        acc.wQty += wq;
        map.set(key, acc);
      }
    }
    return Array.from(map.values())
      .map((acc) => {
        const ordered = [...acc.points].sort((a, b) => {
          const t = Date.parse(a.date) - Date.parse(b.date);
          if (t !== 0) return t;
          const oc = Date.parse(a.orderCreatedAt) - Date.parse(b.orderCreatedAt);
          if (oc !== 0) return oc;
          const ra = a.sortRank ?? 0;
          const rb = b.sortRank ?? 0;
          if (ra !== rb) return ra - rb;
          return a.itemId.localeCompare(b.itemId);
        });
        const base = ordered[0];
        const current = ordered[ordered.length - 1];
        const delta = Math.round((current.price - base.price) * 100) / 100;
        const deltaPct = base.price > 0 ? Math.round((delta / base.price) * 10000) / 100 : 0;
        const weightedAvg = acc.wQty > 0 ? Math.round((acc.wSum / acc.wQty) * 100) / 100 : current.price;
        const purchasesSorted = [...acc.purchases].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
        return {
          key: acc.key,
          productName: acc.productName,
          points: [...ordered].reverse(),
          purchases: purchasesSorted,
          weightedAvg,
          totalWeightedQty: acc.wQty,
          base,
          current,
          delta,
          deltaPct,
        };
      })
      .filter((row) => row.points.length >= 2 && Math.abs(row.delta) > 0.001)
      .sort((a, b) => a.productName.localeCompare(b.productName, 'es'));
  }, [orders]);

  const trendLabel = (row: PriceSummary) => {
    if (row.delta > 0) {
      return `Sube +${row.delta.toFixed(2)} € (+${row.deltaPct.toFixed(2)}%)`;
    }
    if (row.delta < 0) {
      return `Baja ${row.delta.toFixed(2)} € (${row.deltaPct.toFixed(2)}%)`;
    }
    return 'Sin cambio';
  };

  const trendClass = (row: PriceSummary) => {
    if (row.delta > 0) return 'text-red-700';
    if (row.delta < 0) return 'text-emerald-700';
    return 'text-zinc-600';
  };

  const downloadReportPdf = React.useCallback(() => {
    if (series.length === 0) {
      setMessage('No hay datos con cambios de precio para descargar.');
      return;
    }
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const localLabel = (localName?.trim() || localCode || 'Local').trim();

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
      'Referencias con variación relevante respecto al primer precio registrado en pedidos.',
      40,
      72,
      { maxWidth: pageW - 80 },
    );

    const up = series.filter((s) => s.delta > 0).length;
    const down = series.filter((s) => s.delta < 0).length;
    const avgPct = series.reduce((a, s) => a + s.deltaPct, 0) / series.length;

    const kpiY = 88;
    const gap = 12;
    const kpiW = (pageW - 80 - 3 * gap) / 4;
    const kpiH = 54;
    const kpiXs = [40, 40 + kpiW + gap, 40 + 2 * (kpiW + gap), 40 + 3 * (kpiW + gap)] as const;
    const kpis: [string, string][] = [
      ['Productos en informe', String(series.length)],
      ['Suben de precio', String(up)],
      ['Bajan de precio', String(down)],
      ['Variación media %', `${avgPct >= 0 ? '+' : ''}${avgPct.toFixed(2)} %`],
    ];
    for (let i = 0; i < 4; i++) {
      const x = kpiXs[i]!;
      doc.setFillColor(...PDF_ZINC_100);
      doc.roundedRect(x, kpiY, kpiW, kpiH, 3, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...PDF_ZINC_500);
      doc.text(kpis[i]![0], x + 10, kpiY + 18);
      doc.setFontSize(15);
      doc.setTextColor(...PDF_ZINC_900);
      doc.text(kpis[i]![1], x + 10, kpiY + 40);
    }

    const hero = [...series].sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))[0]!;
    const pointsAsc = [...hero.points].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

    let yCursor = kpiY + kpiH + 22;
    yCursor = drawExecutivePriceChart(doc, {
      x: 40,
      y: yCursor,
      w: pageW - 80,
      h: 220,
      title: `Mayor variación relativa: ${hero.productName}`,
      subtitle: `Δ ${hero.delta >= 0 ? '+' : ''}${hero.delta.toFixed(2)} € (${hero.deltaPct >= 0 ? '+' : ''}${hero.deltaPct.toFixed(2)} %). Compras acumuladas (ponderado): ${hero.totalWeightedQty.toLocaleString('es-ES')} ${hero.current.unit}.`,
      pointsAsc,
      weightedAvg: hero.weightedAvg,
      unit: hero.current.unit,
      basePrice: hero.base.price,
      currentPrice: hero.current.price,
    });

    const rest = [...series]
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
    for (const row of series) {
      body.push([
        row.productName,
        `${row.base.price.toFixed(2)} €/${row.base.unit}`,
        `${row.weightedAvg.toFixed(2)} €/${row.current.unit}`,
        `${row.current.price.toFixed(2)} €/${row.current.unit}`,
        `${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(2)} €`,
        `${row.deltaPct >= 0 ? '+' : ''}${row.deltaPct.toFixed(2)}%`,
      ]);
    }
    autoTable(doc, {
      startY: tableStart + 4,
      head: [['Producto', 'Precio base', 'Precio medio ponderado', 'Precio actual', 'Variación €', 'Variación %']],
      body,
      styles: { fontSize: 8, cellPadding: 4, textColor: PDF_ZINC_900 },
      headStyles: { fillColor: PDF_BRAND, textColor: PDF_WHITE },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 40, right: 40 },
    });

    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      pdfFooter(doc, p, totalPages);
    }

    const stamp = new Date().toISOString().slice(0, 10);
    doc.save(`evolucion-precios-${stamp}.pdf`);
  }, [series, localName, localCode]);

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
        <Link href="/pedidos" className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700">
          ← Atras
        </Link>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-center text-lg font-black text-zinc-900">EVOLUCION DE PRECIOS</h1>
        {message ? <p className="pt-2 text-sm text-[#B91C1C]">{message}</p> : null}
        <div className="mt-3">
          <button
            type="button"
            onClick={downloadReportPdf}
            className="h-10 rounded-xl bg-[#D32F2F] px-3 text-sm font-semibold text-white"
          >
            Descargar informe PDF
          </button>
        </div>
      </section>

      <section className="space-y-2">
        {series.length === 0 ? <div className="rounded-2xl bg-white p-4 text-sm text-zinc-500 ring-1 ring-zinc-200">No hay evolución de precios para mostrar.</div> : null}
        {series.map((row) => {
          return (
            <div key={row.key} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
              <p className="text-sm font-black text-zinc-900">{row.productName}</p>
              <p className="pt-1 text-xs text-zinc-600">
                Base: {row.base.price.toFixed(2)} €/{row.base.unit} · Actual: {row.current.price.toFixed(2)} €/
                {row.current.unit}
              </p>
              <p className="pt-1 text-xs font-semibold text-zinc-800">
                Precio medio ponderado:{' '}
                <span className="tabular-nums">
                  {row.weightedAvg.toFixed(2)} €/{row.current.unit}
                </span>{' '}
                · Cantidad total acumulada:{' '}
                <span className="tabular-nums">{row.totalWeightedQty.toLocaleString('es-ES')}</span>
              </p>
              <p className={`pt-1 text-xs font-semibold ${trendClass(row)}`}>{trendLabel(row)}</p>
              <p className="pt-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Compras (más reciente primero)</p>
              <div className="mt-1 max-h-40 space-y-1 overflow-auto rounded-lg bg-zinc-50 p-2 ring-1 ring-zinc-200">
                {row.purchases.map((pur, idx) => (
                  <p key={`${row.key}-p-${idx}`} className="text-xs text-zinc-600">
                    {new Date(pur.date).toLocaleDateString('es-ES')} · {pur.supplier} ·{' '}
                    {formatQuantityWithUnit(pur.qty, pur.unit)} · {pur.price.toFixed(2)} €/{pur.unit}
                  </p>
                ))}
              </div>
              <p className="pt-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Evolución precio unitario</p>
              <div className="mt-1 max-h-28 space-y-1 overflow-auto rounded-lg bg-zinc-50 p-2 ring-1 ring-zinc-200">
                {row.points.slice(0, 12).map((point, idx) => (
                  <p key={`${row.key}-${idx}`} className="text-xs text-zinc-600">
                    {new Date(point.date).toLocaleDateString('es-ES')} · {point.supplier} · {point.price.toFixed(2)} €/
                    {point.unit}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

