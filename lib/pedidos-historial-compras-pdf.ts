import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PedidoOrder } from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';

type DocWithTable = jsPDF & { lastAutoTable?: { finalY?: number } };
type LogoAsset = { dataUrl: string; width: number; height: number };

const BRAND: [number, number, number] = [211, 47, 47];
const Z100: [number, number, number] = [244, 244, 245];
const Z300: [number, number, number] = [212, 212, 216];
const Z400: [number, number, number] = [161, 161, 170];
const Z500: [number, number, number] = [113, 113, 122];
const Z700: [number, number, number] = [63, 63, 70];
const Z900: [number, number, number] = [24, 24, 27];
const WHITE: [number, number, number] = [255, 255, 255];
const EMERALD: [number, number, number] = [5, 150, 105];
const ROSE: [number, number, number] = [190, 24, 93];

const money = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`;

const OFFICIAL_CHEF_LOGO_SRC = '/logo-oficial-chef.svg';
let officialLogoPromise: Promise<LogoAsset | null> | null = null;

async function loadOfficialChefLogo(): Promise<LogoAsset | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (officialLogoPromise) return officialLogoPromise;

  officialLogoPromise = (async () => {
    try {
      const response = await fetch(OFFICIAL_CHEF_LOGO_SRC);
      const svgText = await response.text();
      const transparentSvg = svgText.replace(/<rect\b[^>]*fill="#ffffff"[^>]*\/>/gi, '');
      const img = new Image();
      const encodedSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(transparentSvg)}`;
      const loaded = await new Promise<HTMLImageElement | null>((resolve) => {
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = encodedSvg;
      });
      if (!loaded || loaded.naturalWidth <= 0 || loaded.naturalHeight <= 0) return null;

      const canvas = document.createElement('canvas');
      canvas.width = 538;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const sx = (53 / 375) * loaded.naturalWidth;
      const sy = (154 / 375) * loaded.naturalHeight;
      const sw = (269 / 375) * loaded.naturalWidth;
      const sh = (64 / 375) * loaded.naturalHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(loaded, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
    } catch {
      return null;
    }
  })();

  return officialLogoPromise;
}

function drawOfficialLogo(doc: jsPDF, logo: LogoAsset | null | undefined, x: number, y: number, w: number): void {
  if (!logo) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND);
    doc.text('CHEF-ONE', x, y + 13);
    return;
  }
  doc.addImage(logo.dataUrl, 'PNG', x, y, w, (w * logo.height) / logo.width);
}

function footer(doc: jsPDF, page: number, total: number, logo?: LogoAsset | null): void {
  const pageH = doc.internal.pageSize.getHeight();
  drawOfficialLogo(doc, logo, 40, pageH - 28, 62);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...Z400);
  doc.text(new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' }), 112, pageH - 18);
  doc.text(`Página ${page}/${total}`, doc.internal.pageSize.getWidth() - 40, pageH - 18, { align: 'right' });
  doc.setTextColor(...Z900);
}

function incidentLabel(type: string | null | undefined, notes?: string | null): string {
  if (!type) return '—';
  const map: Record<string, string> = {
    missing: 'No recibido',
    damaged: 'Dañado',
    'wrong-item': 'Producto incorrecto',
  };
  const base = map[type] ?? type;
  const n = (notes ?? '').trim();
  return n ? `${base}: ${n.length > 40 ? `${n.slice(0, 37)}…` : n}` : base;
}

function buildLineRows(orders: PedidoOrder[]): string[][] {
  const sorted = [...orders].sort((a, b) => {
    const ta = Date.parse(a.receivedAt ?? a.sentAt ?? a.createdAt);
    const tb = Date.parse(b.receivedAt ?? b.sentAt ?? b.createdAt);
    return tb - ta;
  });
  const rows: string[][] = [];
  for (const o of sorted) {
    const d = new Date(o.receivedAt ?? o.sentAt ?? o.createdAt).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const st = o.status === 'received' ? 'Recibido' : 'Enviado';
    for (const it of o.items) {
      const q = o.status === 'received' ? it.receivedQuantity : it.quantity;
      const base = Math.max(0, q) * it.pricePerUnit;
      const tot = Math.round((base + base * it.vatRate) * 100) / 100;
      rows.push([
        d,
        o.supplierName,
        st,
        it.productName,
        it.unit,
        String(q),
        it.pricePerUnit.toFixed(2),
        `${(it.vatRate * 100).toFixed(0)}%`,
        tot.toFixed(2),
        incidentLabel(it.incidentType, it.incidentNotes),
      ]);
    }
  }
  return rows;
}

function buildSupplierProductRollup(orders: PedidoOrder[]): string[][] {
  const map = new Map<string, { supplier: string; product: string; unit: string; qty: number }>();
  for (const o of orders) {
    for (const it of o.items) {
      const q = o.status === 'received' ? it.receivedQuantity : it.quantity;
      const key = `${o.supplierId}|${it.productName}|${it.unit}`;
      const cur = map.get(key) ?? { supplier: o.supplierName, product: it.productName, unit: it.unit, qty: 0 };
      cur.qty += q;
      map.set(key, cur);
    }
  }
  return Array.from(map.values())
    .map((r) => [r.supplier, r.product, r.unit, String(Math.round(r.qty * 100) / 100)])
    .sort((a, b) => a[0]!.localeCompare(b[0]!, 'es') || a[1]!.localeCompare(b[1]!, 'es'));
}

export type PedidosHistorialComprasPdfInput = {
  localLabel: string;
  monthIso: string;
  monthTitle: string;
  viewModeLabel: string;
  supplierFilterLabel: string;
  orders: PedidoOrder[];
  kpis: {
    totalWithVat: number;
    totalBase: number;
    totalVat: number;
    orderCount: number;
    avgTicket: number;
    deltaPct: number | null;
  };
  monthlyTopProducts: Array<{
    productName: string;
    spend: number;
    qty: number;
    unit: Unit;
    pct: number;
    topSupplierName?: string | null;
  }>;
  weeklySummary: Array<{ week: number; total: number; topProducts: Array<{ name: string; spend: number }> }>;
  supplierPerformance: Array<{
    supplierId?: string;
    supplierName: string;
    spend: number;
    orderCount: number;
    incidencePct: number;
    deviation: number;
  }>;
  deviationKpis: {
    requested: number;
    received: number;
    deviationAbs: number;
    deviationPct: number;
    incidents: number;
    totalOrders: number;
  };
  priceChangesUp?: Array<{ name: string; prevAvg: number; nowAvg: number; deltaAbs: number; deltaPct: number; unit: Unit }>;
  priceChangesDown?: Array<{ name: string; prevAvg: number; nowAvg: number; deltaAbs: number; deltaPct: number; unit: Unit }>;
};

function drawKpiCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  hint?: string,
  accent: [number, number, number] = BRAND,
): void {
  doc.setFillColor(252, 251, 248);
  doc.roundedRect(x, y, w, h, 10, 10, 'F');
  doc.setDrawColor(...Z300);
  doc.roundedRect(x, y, w, h, 10, 10, 'S');
  doc.setFillColor(...accent);
  doc.roundedRect(x + 10, y + 10, 4, h - 20, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...Z500);
  doc.text(label.toUpperCase(), x + 20, y + 17);
  doc.setFontSize(18);
  doc.setTextColor(...Z900);
  doc.text(value, x + 20, y + 39);
  if (hint) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...Z500);
    doc.text(hint, x + 20, y + h - 10);
  }
}

function drawBarRow(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  label: string,
  value: number,
  max: number,
  tone: 'brand' | 'emerald' | 'rose' = 'brand',
): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...Z700);
  doc.text(label, x, y);
  doc.setFontSize(9);
  doc.setTextColor(...Z900);
  doc.text(money(value), x + w, y, { align: 'right' });
  const by = y + 7;
  doc.setFillColor(245, 242, 238);
  doc.roundedRect(x, by, w, 8, 4, 4, 'F');
  const pctW = max > 0 ? Math.max(3, (Math.min(value, max) / max) * w) : 3;
  const c = tone === 'emerald' ? EMERALD : tone === 'rose' ? ROSE : BRAND;
  doc.setFillColor(...c);
  doc.roundedRect(x, by, pctW, 8, 4, 4, 'F');
}

function drawCard(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  doc.setFillColor(...WHITE);
  doc.roundedRect(x, y, w, h, 14, 14, 'F');
  doc.setDrawColor(235, 230, 224);
  doc.roundedRect(x, y, w, h, 14, 14, 'S');
}

function drawSectionTitle(doc: jsPDF, x: number, y: number, title: string, subtitle?: string): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...Z900);
  doc.text(title.toUpperCase(), x, y);
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...Z500);
    doc.text(subtitle, x, y + 12);
  }
}

function drawArc(doc: jsPDF, cx: number, cy: number, r: number, a0: number, a1: number): void {
  const steps = Math.max(12, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 20)));
  for (let i = 0; i < steps; i += 1) {
    const t0 = a0 + ((a1 - a0) * i) / steps;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / steps;
    doc.line(cx + Math.cos(t0) * r, cy + Math.sin(t0) * r, cx + Math.cos(t1) * r, cy + Math.sin(t1) * r);
  }
}

function drawDonut(
  doc: jsPDF,
  cx: number,
  cy: number,
  r: number,
  thickness: number,
  slices: Array<{ value: number; color: [number, number, number] }>,
  totalLabel: string,
  subLabel: string,
): void {
  const total = slices.reduce((acc, slice) => acc + slice.value, 0);
  doc.setLineWidth(thickness);
  doc.setDrawColor(237, 233, 226);
  drawArc(doc, cx, cy, r, -Math.PI / 2, Math.PI * 1.5);
  let start = -Math.PI / 2;
  for (const slice of slices) {
    if (total <= 0 || slice.value <= 0) continue;
    const end = start + (slice.value / total) * Math.PI * 2;
    doc.setDrawColor(...slice.color);
    drawArc(doc, cx, cy, r, start, end);
    start = end;
  }
  doc.setLineWidth(1);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...Z900);
  doc.text(totalLabel, cx, cy + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...Z500);
  doc.text(subLabel, cx, cy + 18, { align: 'center' });
}

function truncate(text: string, max = 34): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function drawExecutiveFooter(doc: jsPDF, monthTitle: string, page: number, total: number, logo?: LogoAsset | null): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  drawOfficialLogo(doc, logo, 24, pageH - 29, 72);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...Z500);
  doc.text(`Informe de compras · ${monthTitle}`, pageW - 112, pageH - 14);
  doc.text(`Página ${page} de ${total}`, pageW - 24, pageH - 14, { align: 'right' });
}

export async function downloadPedidosHistorialComprasExecutivePdf(input: PedidosHistorialComprasPdfInput): Promise<void> {
  const logo = await loadOfficialChefLogo();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 32;
  const contentW = pageW - margin * 2;
  const gap = 18;
  const totalPages = 3;
  const bg: [number, number, number] = [249, 246, 241];
  const cardBg: [number, number, number] = [255, 255, 253];
  const line: [number, number, number] = [232, 226, 218];
  const softRed: [number, number, number] = [255, 243, 242];
  const softGreen: [number, number, number] = [240, 249, 244];
  const gold: [number, number, number] = [198, 138, 36];
  const olive: [number, number, number] = [117, 145, 83];
  const teal: [number, number, number] = [88, 140, 143];
  const inkSoft: [number, number, number] = [82, 82, 91];
  const supplierPalette: [number, number, number][] = [BRAND, gold, olive, teal, [110, 129, 143], [153, 139, 124]];
  const startDate = `${input.monthIso}-01`;
  const endDate = new Date(Number(input.monthIso.slice(0, 4)), Number(input.monthIso.slice(5, 7)), 0)
    .toISOString()
    .slice(0, 10);
  const periodLabel = `${new Date(startDate).toLocaleDateString('es-ES')} - ${new Date(endDate).toLocaleDateString('es-ES')}`;
  const generatedLabel = new Date().toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const incidencePct =
    input.deviationKpis.totalOrders > 0 ? (input.deviationKpis.incidents / input.deviationKpis.totalOrders) * 100 : 0;
  const weekly = input.weeklySummary.slice(0, 5);
  const bestWeek = weekly.reduce<{ week: number; total: number } | null>((best, current) => {
    if (!best || current.total > best.total) return { week: current.week, total: current.total };
    return best;
  }, null);
  const topSuppliers = input.supplierPerformance.slice(0, 8);
  const topProducts = input.monthlyTopProducts.slice(0, 10);
  const top3SupplierPct =
    input.kpis.totalWithVat > 0
      ? (input.supplierPerformance.slice(0, 3).reduce((acc, s) => acc + s.spend, 0) / input.kpis.totalWithVat) * 100
      : 0;
  const top10ProductPct = topProducts.reduce((acc, p) => acc + p.pct, 0);
  const missingLines = input.orders.reduce((acc, o) => acc + o.items.filter((it) => it.incidentType === 'missing').length, 0);
  const quantityDiffLines = input.orders.reduce(
    (acc, o) => acc + o.items.filter((it) => Math.abs((it.receivedQuantity ?? it.quantity) - it.quantity) > 1e-9).length,
    0,
  );
  const incidentLines = input.orders.reduce(
    (acc, o) => acc + o.items.filter((it) => Boolean(it.incidentType) || Boolean(it.incidentNotes?.trim())).length,
    0,
  );
  const priceChangeCount = (input.priceChangesUp?.length ?? 0) + (input.priceChangesDown?.length ?? 0);
  const supplierIncidentRows = Array.from(
    input.orders.reduce((map, order) => {
      const incidents = order.items.filter((it) => Boolean(it.incidentType) || Boolean(it.incidentNotes?.trim())).length;
      if (incidents <= 0) return map;
      const current = map.get(order.supplierName) ?? { supplierName: order.supplierName, orders: 0, incidents: 0 };
      current.orders += 1;
      current.incidents += incidents;
      map.set(order.supplierName, current);
      return map;
    }, new Map<string, { supplierName: string; orders: number; incidents: number }>()),
  )
    .map(([, row]) => row)
    .sort((a, b) => b.incidents - a.incidents)
    .slice(0, 4);

  const shortMoney = (value: number) => {
    if (Math.abs(value) >= 1000) {
      const rounded = value / 1000;
      return `${rounded.toLocaleString('es-ES', { maximumFractionDigits: Math.abs(rounded) >= 10 ? 0 : 1 })}k €`;
    }
    return money(value);
  };

  const setBg = () => {
    doc.setFillColor(...bg);
    doc.rect(0, 0, pageW, pageH, 'F');
  };

  const drawHeader = (page: number, section: string) => {
    setBg();
    drawOfficialLogo(doc, logo, margin, 18, 92);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...Z500);
    doc.text(input.localLabel, pageW - margin, 24, { align: 'right' });
    doc.text(`Generado ${generatedLabel}`, pageW - margin, 38, { align: 'right' });
    doc.setDrawColor(...line);
    doc.line(margin, 48, pageW - margin, 48);
    if (section) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...Z500);
      doc.text(section.toUpperCase(), margin, 66);
      doc.setTextColor(...BRAND);
      doc.text(`0${page}`, pageW - margin, 66, { align: 'right' });
    }
  };

  const panel = (x: number, y: number, w: number, h: number, fill: [number, number, number] = cardBg) => {
    doc.setFillColor(...fill);
    doc.roundedRect(x, y, w, h, 16, 16, 'F');
    doc.setDrawColor(...line);
    doc.roundedRect(x, y, w, h, 16, 16, 'S');
  };

  const panelTitle = (x: number, y: number, title: string, subtitle?: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...Z900);
    doc.text(title.toUpperCase(), x, y);
    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(...Z500);
      doc.text(subtitle, x, y + 13);
    }
  };

  const metricCard = (
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    value: string,
    caption: string,
    accent: [number, number, number],
  ) => {
    panel(x, y, w, h);
    doc.setFillColor(...accent);
    doc.roundedRect(x + 12, y + 16, 4, h - 32, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(...Z500);
    doc.text(label.toUpperCase(), x + 24, y + 22);
    doc.setFontSize(value.length > 12 ? 15 : 18);
    doc.setTextColor(...Z900);
    doc.text(value, x + 24, y + 49);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...Z500);
    doc.text(caption, x + 24, y + h - 16);
  };

  const horizontalBar = (
    x: number,
    y: number,
    w: number,
    value: number,
    max: number,
    color: [number, number, number],
    height = 7,
  ) => {
    doc.setFillColor(239, 235, 229);
    doc.roundedRect(x, y, w, height, height / 2, height / 2, 'F');
    const fillW = max > 0 ? Math.max(4, (Math.min(value, max) / max) * w) : 4;
    doc.setFillColor(...color);
    doc.roundedRect(x, y, fillW, height, height / 2, height / 2, 'F');
  };

  const statLine = (x: number, y: number, label: string, value: string, color: [number, number, number] = Z900) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.4);
    doc.setTextColor(...Z500);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...color);
    doc.text(value, x, y + 17);
  };

  const priceAlertRow = (
    x: number,
    y: number,
    w: number,
    item: { name: string; prevAvg: number; nowAvg: number; deltaAbs: number; deltaPct: number; unit: Unit },
    direction: 'up' | 'down',
  ) => {
    const isUp = direction === 'up';
    panel(x, y, w, 48, isUp ? softRed : softGreen);
    doc.setFillColor(...(isUp ? BRAND : EMERALD));
    doc.roundedRect(x + 12, y + 12, 4, 24, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...(isUp ? BRAND : EMERALD));
    doc.text(isUp ? 'SUBIDA' : 'BAJADA', x + 24, y + 17);
    doc.setFontSize(9.2);
    doc.setTextColor(...Z900);
    doc.text(truncate(item.name, 30), x + 24, y + 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...Z700);
    doc.text(`Base ${money(item.prevAvg)}/${item.unit}`, x + 180, y + 18);
    doc.text(`Ahora ${money(item.nowAvg)}/${item.unit}`, x + 180, y + 34);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...(isUp ? ROSE : EMERALD));
    const delta = `${isUp ? '+' : '-'}${money(Math.abs(item.deltaAbs))}/${item.unit}`;
    doc.text(delta, x + w - 16, y + 18, { align: 'right' });
    doc.text(pct(item.deltaPct), x + w - 16, y + 34, { align: 'right' });
  };

  drawHeader(1, 'Resumen directivo');
  doc.setFont('times', 'bold');
  doc.setFontSize(30);
  doc.setTextColor(...Z900);
  doc.text('Informe de compras', margin, 92);
  doc.setFont('times', 'normal');
  doc.setFontSize(15);
  doc.setTextColor(...BRAND);
  doc.text('Resumen ejecutivo mensual', margin, 116);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(...Z500);
  doc.text(`Periodo: ${periodLabel}  ·  ${input.supplierFilterLabel}  ·  ${input.viewModeLabel}`, margin, 136);

  panel(pageW - margin - 268, 68, 268, 78, [255, 249, 247]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...BRAND);
  doc.text('Lectura directiva', pageW - margin - 244, 92);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.4);
  doc.setTextColor(...Z700);
  doc.text(`Top 3 proveedores concentran ${top3SupplierPct.toFixed(1)}% del gasto.`, pageW - margin - 244, 110);
  doc.text(`${priceChangeCount} variaciones de precio detectadas este mes.`, pageW - margin - 244, 124);
  doc.text(`${input.deviationKpis.incidents} pedidos con incidencia sobre ${input.deviationKpis.totalOrders}.`, pageW - margin - 244, 138);

  const kpiY = 166;
  const kpiH = 78;
  const kpiGap = 10;
  const kpiW = (contentW - kpiGap * 5) / 6;
  metricCard(margin, kpiY, kpiW, kpiH, 'Total compras', money(input.kpis.totalWithVat), input.kpis.deltaPct == null ? 'IVA incluido' : `${pct(input.kpis.deltaPct)} vs mes anterior`, BRAND);
  metricCard(margin + (kpiW + kpiGap), kpiY, kpiW, kpiH, 'Base imponible', money(input.kpis.totalBase), 'Sin IVA', gold);
  metricCard(margin + (kpiW + kpiGap) * 2, kpiY, kpiW, kpiH, 'IVA', money(input.kpis.totalVat), 'Impuestos', [120, 113, 108]);
  metricCard(margin + (kpiW + kpiGap) * 3, kpiY, kpiW, kpiH, 'Pedidos', String(input.kpis.orderCount), 'Recepcionados', [120, 113, 108]);
  metricCard(margin + (kpiW + kpiGap) * 4, kpiY, kpiW, kpiH, 'Ticket medio', money(input.kpis.avgTicket), 'Por pedido', [208, 76, 45]);
  metricCard(margin + (kpiW + kpiGap) * 5, kpiY, kpiW, kpiH, '% incidencias', `${incidencePct.toFixed(1)}%`, `${input.deviationKpis.incidents} pedidos`, ROSE);

  const chartY = 270;
  const chartH = 250;
  const chartW = (contentW - gap) / 2;
  panel(margin, chartY, chartW, chartH);
  panelTitle(margin + 22, chartY + 30, 'Gasto por proveedor', 'Ranking visual del gasto IVA incluido');
  const supplierMax = Math.max(1, ...topSuppliers.map((s) => s.spend));
  topSuppliers.slice(0, 6).forEach((s, i) => {
    const rowY = chartY + 72 + i * 27;
    const color = supplierPalette[i] ?? supplierPalette[supplierPalette.length - 1]!;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(...Z900);
    doc.text(truncate(s.supplierName, 28), margin + 22, rowY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(...Z500);
    doc.text(`${s.orderCount} pedidos · ${s.incidencePct.toFixed(1)}% incid.`, margin + 22, rowY + 12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(...Z900);
    doc.text(money(s.spend), margin + chartW - 22, rowY, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(...Z500);
    doc.text(`${input.kpis.totalWithVat > 0 ? ((s.spend / input.kpis.totalWithVat) * 100).toFixed(1) : '0.0'}%`, margin + chartW - 22, rowY + 12, { align: 'right' });
    horizontalBar(margin + 150, rowY + 6, chartW - 238, s.spend, supplierMax, color, 7);
  });
  statLine(margin + 22, chartY + chartH - 34, 'Concentración top 3', `${top3SupplierPct.toFixed(1)}%`, BRAND);
  statLine(margin + 174, chartY + chartH - 34, 'Proveedores analizados', String(input.supplierPerformance.length), Z900);

  panel(margin + chartW + gap, chartY, chartW, chartH);
  panelTitle(margin + chartW + gap + 22, chartY + 30, 'Evolución semanal', 'Gasto real recibido por semana');
  const maxWeekly = Math.max(1, ...weekly.map((w) => w.total));
  const wx = margin + chartW + gap + 48;
  const wy = chartY + 82;
  const ww = chartW - 86;
  const wh = 124;
  [0, 0.25, 0.5, 0.75, 1].forEach((tick) => {
    const gy = wy + wh - wh * tick;
    doc.setDrawColor(...line);
    doc.line(wx, gy, wx + ww, gy);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...Z500);
    doc.text(shortMoney(maxWeekly * tick), wx - 10, gy + 3, { align: 'right' });
  });
  const barGap = 14;
  const bars = Math.max(weekly.length, 1);
  const bw = (ww - barGap * (bars - 1)) / bars;
  weekly.forEach((w, i) => {
    const h = maxWeekly > 0 ? Math.max(7, (w.total / maxWeekly) * (wh - 16)) : 7;
    const bx = wx + i * (bw + barGap);
    const by = wy + wh - h;
    doc.setFillColor(...BRAND);
    doc.roundedRect(bx, by, bw, h, 5, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...Z900);
    doc.text(shortMoney(w.total), bx + bw / 2, by - 8, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...Z700);
    doc.text(`S${w.week}`, bx + bw / 2, wy + wh + 16, { align: 'center' });
  });
  panel(margin + chartW + gap + 22, chartY + chartH - 54, chartW - 44, 32, [255, 248, 245]);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(...Z700);
  doc.text(bestWeek ? `Semana de mayor gasto: ${bestWeek.week}` : 'Semana de mayor gasto: sin datos', margin + chartW + gap + 36, chartY + chartH - 34);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND);
  doc.text(bestWeek ? money(bestWeek.total) : '—', margin + chartW + gap + chartW - 36, chartY + chartH - 34, { align: 'right' });

  drawExecutiveFooter(doc, input.monthTitle, 1, totalPages, logo);

  doc.addPage();
  drawHeader(2, 'Concentración de gasto');
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...Z900);
  doc.text('Dónde se concentra el gasto', margin, 92);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(...Z500);
  doc.text(`Top 10 productos: ${top10ProductPct.toFixed(1)}% del mes · Top proveedores: ${top3SupplierPct.toFixed(1)}% en los tres principales`, margin, 112);

  const boardY = 136;
  const boardH = 384;
  const boardW = (contentW - gap) / 2;
  panel(margin, boardY, boardW, boardH);
  panelTitle(margin + 22, boardY + 30, 'Top proveedores', 'Gasto, pedidos e incidencias');
  topSuppliers.forEach((s, i) => {
    const y = boardY + 66 + i * 37;
    const color = supplierPalette[i % supplierPalette.length]!;
    doc.setFillColor(...color);
    doc.roundedRect(margin + 22, y - 10, 5, 24, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    doc.setTextColor(...Z900);
    doc.text(truncate(s.supplierName, 30), margin + 38, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(...Z500);
    doc.text(`${s.orderCount} pedidos · ${s.incidencePct.toFixed(1)}% incidencias`, margin + 38, y + 13);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...Z900);
    doc.text(money(s.spend), margin + boardW - 22, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(...Z500);
    doc.text(`${input.kpis.totalWithVat > 0 ? ((s.spend / input.kpis.totalWithVat) * 100).toFixed(1) : '0.0'}%`, margin + boardW - 22, y + 13, { align: 'right' });
    horizontalBar(margin + 38, y + 20, boardW - 74, s.spend, supplierMax, color, 5);
  });

  panel(margin + boardW + gap, boardY, boardW, boardH);
  panelTitle(margin + boardW + gap + 22, boardY + 30, 'Top 10 productos por gasto', 'Peso mensual y proveedor principal');
  const productMax = Math.max(1, ...topProducts.map((p) => p.spend));
  topProducts.forEach((p, i) => {
    const y = boardY + 62 + i * 31;
    const x = margin + boardW + gap;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(...Z500);
    doc.text(String(i + 1).padStart(2, '0'), x + 22, y);
    doc.setFontSize(8.7);
    doc.setTextColor(...Z900);
    doc.text(truncate(p.productName, 31), x + 48, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...Z500);
    doc.text(`${p.topSupplierName ? truncate(p.topSupplierName, 24) : 'Proveedor mixto'} · ${Math.round(p.qty * 100) / 100} ${p.unit}`, x + 48, y + 11);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...Z900);
    doc.text(money(p.spend), x + boardW - 54, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...Z500);
    doc.text(`${p.pct.toFixed(1)}%`, x + boardW - 22, y, { align: 'right' });
    horizontalBar(x + 48, y + 18, boardW - 100, p.spend, productMax, BRAND, 5);
  });
  drawExecutiveFooter(doc, input.monthTitle, 2, totalPages, logo);

  doc.addPage();
  drawHeader(3, 'Control de precios e incidencias');
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...Z900);
  doc.text('Riesgo operativo del mes', margin, 92);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(...Z500);
  doc.text('Variaciones relevantes, incidencias y acciones recomendadas para proteger margen.', margin, 112);

  const alertY = 136;
  const alertH = 288;
  const alertW = (contentW - gap) / 2;
  panel(margin, alertY, alertW, alertH);
  panelTitle(margin + 22, alertY + 30, 'Subidas de precio', 'Mayor impacto unitario frente al precio base');
  const up = (input.priceChangesUp ?? []).slice(0, 5);
  if (up.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...Z500);
    doc.text('Sin subidas relevantes detectadas.', margin + 22, alertY + 76);
  } else {
    up.forEach((p, i) => priceAlertRow(margin + 18, alertY + 56 + i * 44, alertW - 36, p, 'up'));
  }

  panel(margin + alertW + gap, alertY, alertW, alertH);
  panelTitle(margin + alertW + gap + 22, alertY + 30, 'Bajadas de precio', 'Oportunidades y cambios favorables');
  const down = (input.priceChangesDown ?? []).slice(0, 5);
  if (down.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...Z500);
    doc.text('Sin bajadas relevantes detectadas.', margin + alertW + gap + 22, alertY + 76);
  } else {
    down.forEach((p, i) => priceAlertRow(margin + alertW + gap + 18, alertY + 56 + i * 44, alertW - 36, p, 'down'));
  }

  const bottomY = 444;
  const smallW = (contentW - gap) / 2;
  panel(margin, bottomY, smallW, 86);
  panelTitle(margin + 18, bottomY + 26, 'Incidencias del mes');
  statLine(margin + 18, bottomY + 50, 'Pedidos con incidencia', `${input.deviationKpis.incidents}/${input.deviationKpis.totalOrders}`, ROSE);
  statLine(margin + 142, bottomY + 50, 'Lineas afectadas', String(incidentLines), Z900);
  statLine(margin + 250, bottomY + 50, 'No recibidos', String(missingLines), Z900);
  statLine(margin + 342, bottomY + 50, 'Diferencias cantidad', String(quantityDiffLines), Z900);
  if (supplierIncidentRows.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...Z500);
    doc.text(
      `Proveedores a vigilar: ${supplierIncidentRows.map((r) => `${truncate(r.supplierName, 14)} (${r.incidents})`).join(' · ')}`,
      margin + 18,
      bottomY + 76,
    );
  }

  panel(margin + smallW + gap, bottomY, smallW, 86, [255, 249, 243]);
  panelTitle(margin + smallW + gap + 18, bottomY + 26, 'Acción recomendada');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BRAND);
  doc.text(`Impacto pedido vs recepción: ${money(input.deviationKpis.deviationAbs)}`, margin + smallW + gap + 18, bottomY + 54);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.4);
  doc.setTextColor(...inkSoft);
  doc.text(
    `Prioriza negociación en subidas de precio y revisa proveedores con incidencias repetidas. Desvío global ${input.deviationKpis.deviationPct.toFixed(1)}%.`,
    margin + smallW + gap + 18,
    bottomY + 74,
    { maxWidth: smallW - 36 },
  );
  drawExecutiveFooter(doc, input.monthTitle, 3, totalPages, logo);

  doc.save(`compras-mes-ejecutivo-${input.monthIso}.pdf`);
}

export async function downloadPedidosHistorialComprasDetailPdf(input: PedidosHistorialComprasPdfInput): Promise<void> {
  const logo = await loadOfficialChefLogo();
  const {
    localLabel,
    monthIso,
    monthTitle,
    viewModeLabel,
    supplierFilterLabel,
    orders,
    kpis,
    monthlyTopProducts,
    weeklySummary,
    supplierPerformance,
    deviationKpis,
  } = input;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const contentW = pageW - margin * 2;

  doc.setFillColor(...WHITE);
  doc.rect(0, 0, pageW, 32, 'F');
  drawOfficialLogo(doc, logo, margin, 7, 70);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...Z700);
  doc.text('Detalle operativo de compras', pageW - margin, 20, { align: 'right' });
  doc.setDrawColor(...Z300);
  doc.line(margin, 32, pageW - margin, 32);
  doc.setTextColor(...Z900);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Informe operativo completo', margin, 54);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...Z500);
  doc.text(localLabel, margin, 70);
  doc.text(`Mes: ${monthTitle} (${monthIso}) · ${viewModeLabel}`, margin, 84);
  doc.text(`Proveedor: ${supplierFilterLabel}`, margin, 98);
  doc.setFontSize(9);
  doc.text('Incluye auditoría completa: KPIs, rankings, desvíos y detalle línea a línea.', margin, 112, {
    maxWidth: contentW,
  });

  const kpiY = 140;
  const gap = 8;
  const nKpi = 6;
  const kpiW = (contentW - (nKpi - 1) * gap) / nKpi;
  const kpiH = 50;
  const kpisRow: [string, string][] = [
    ['Total (IVA incl.)', money(kpis.totalWithVat)],
    ['Base imponible', money(kpis.totalBase)],
    ['IVA', money(kpis.totalVat)],
    ['Pedidos', String(kpis.orderCount)],
    ['Ticket medio', money(kpis.avgTicket)],
    ['Vs mes ant.', kpis.deltaPct == null ? '—' : pct(kpis.deltaPct)],
  ];
  for (let i = 0; i < nKpi; i++) {
    const x = margin + i * (kpiW + gap);
    doc.setFillColor(...Z100);
    doc.roundedRect(x, kpiY, kpiW, kpiH, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(...Z500);
    doc.text(kpisRow[i]![0], x + 8, kpiY + 15);
    doc.setFontSize(11);
    doc.setTextColor(...Z900);
    const valLines = doc.splitTextToSize(kpisRow[i]![1], kpiW - 14);
    doc.text(valLines, x + 8, kpiY + 34);
  }

  let y = kpiY + kpiH + 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...Z900);
  doc.text('Top productos por gasto (IVA incl.)', margin, y);
  y += 4;
  autoTable(doc, {
    startY: y + 4,
    head: [['Producto', 'Gasto €', 'Cantidad', 'Ud', '% mes']],
    body:
      monthlyTopProducts.length > 0
        ? monthlyTopProducts.map((p) => [p.productName, p.spend.toFixed(2), String(p.qty), p.unit, `${p.pct.toFixed(1)}%`])
        : [['—', '—', '—', '—', 'Sin datos']],
    styles: { fontSize: 7.5, cellPadding: 2.5, textColor: Z900 },
    headStyles: { fillColor: BRAND, textColor: WHITE },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: margin, right: margin },
  });
  y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 60;
  y += 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Resumen por semana del mes', margin, y);
  y += 4;
  autoTable(doc, {
    startY: y + 4,
    head: [['Semana', 'Total € (IVA)', 'Top gastos']],
    body:
      weeklySummary.length > 0
        ? weeklySummary.map((w) => [
            String(w.week),
            w.total.toFixed(2),
            w.topProducts.map((p) => `${p.name.slice(0, 28)} (${p.spend.toFixed(0)}€)`).join(' · ') || '—',
          ])
        : [['—', '—', 'Sin datos']],
    styles: { fontSize: 7, cellPadding: 2.5, textColor: Z900 },
    headStyles: { fillColor: BRAND, textColor: WHITE },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: margin, right: margin },
    columnStyles: { 2: { cellWidth: 280 } },
  });
  y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 50;
  y += 12;

  doc.text('Proveedores (rendimiento)', margin, y);
  y += 4;
  autoTable(doc, {
    startY: y + 4,
    head: [['Proveedor', 'Recepción €', 'Pedidos', '% incid.', 'Desvío € ped/rec']],
    body:
      supplierPerformance.length > 0
        ? supplierPerformance.map((s) => [s.supplierName, s.spend.toFixed(2), String(s.orderCount), `${s.incidencePct.toFixed(1)}%`, s.deviation.toFixed(2)])
        : [['—', '—', '—', '—', '—']],
    styles: { fontSize: 7, cellPadding: 2.5, textColor: Z900 },
    headStyles: { fillColor: BRAND, textColor: WHITE },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: margin, right: margin },
  });
  y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 40;
  y += 12;

  doc.text('Desvío global pedido vs recepción', margin, y);
  y += 4;
  autoTable(doc, {
    startY: y + 4,
    head: [['Pedido estim. €', 'Recepción €', 'Desvío €', 'Desvío %', 'Incidencias', 'Pedidos']],
    body: [[deviationKpis.requested.toFixed(2), deviationKpis.received.toFixed(2), deviationKpis.deviationAbs.toFixed(2), `${deviationKpis.deviationPct.toFixed(1)}%`, String(deviationKpis.incidents), String(deviationKpis.totalOrders)]],
    styles: { fontSize: 7.5, cellPadding: 2.5, textColor: Z900 },
    headStyles: { fillColor: BRAND, textColor: WHITE },
    margin: { left: margin, right: margin },
  });
  y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 36;
  y += 14;

  doc.setFontSize(12);
  doc.text('Detalle de líneas (completo)', margin, y);
  y += 6;
  const lineBody = buildLineRows(orders);
  autoTable(doc, {
    startY: y + 4,
    head: [['Fecha', 'Proveedor', 'Estado', 'Producto', 'Ud', 'Cant', '€/ud', 'IVA', 'Línea €', 'Incidencia']],
    body: lineBody.length > 0 ? lineBody : [['—', '—', '—', '—', '—', '—', '—', '—', '—', 'Sin líneas']],
    styles: { fontSize: 6, cellPadding: 2, textColor: Z900 },
    headStyles: { fillColor: BRAND, textColor: WHITE, fontSize: 6.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: margin, right: margin },
    columnStyles: { 3: { cellWidth: 120 }, 9: { cellWidth: 85 } },
  });
  y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 80;
  y += 12;

  if (y > 760) {
    doc.addPage();
    y = 44;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Agregado mes: proveedor · producto · cantidades', margin, y);
  y += 4;
  const rollup = buildSupplierProductRollup(orders);
  autoTable(doc, {
    startY: y + 4,
    head: [['Proveedor', 'Producto', 'Ud', 'Cant. mes']],
    body: rollup.length > 0 ? rollup : [['—', '—', '—', '—']],
    styles: { fontSize: 7, cellPadding: 2.5, textColor: Z900 },
    headStyles: { fillColor: BRAND, textColor: WHITE },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: margin, right: margin },
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    footer(doc, p, totalPages, logo);
  }
  doc.save(`compras-mes-detalle-${monthIso}.pdf`);
}

export function downloadPedidosHistorialComprasPdf(input: PedidosHistorialComprasPdfInput): Promise<void> {
  return downloadPedidosHistorialComprasExecutivePdf(input);
}
