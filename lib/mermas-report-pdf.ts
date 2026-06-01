import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { normalizedCostForRecord, topByQuantity, topByValue, topMotives } from '@/lib/analytics';
import { toBusinessDateKey } from '@/lib/business-day';
import type { MermaRecord, Product } from '@/lib/types';

type LogoAsset = { dataUrl: string; width: number; height: number };
type DocWithTable = jsPDF & { lastAutoTable?: { finalY?: number } };

const PDF_BRAND: [number, number, number] = [211, 47, 47];
const PDF_ZINC_100: [number, number, number] = [244, 244, 245];
const PDF_ZINC_200: [number, number, number] = [228, 228, 231];
const PDF_ZINC_400: [number, number, number] = [161, 161, 170];
const PDF_ZINC_500: [number, number, number] = [113, 113, 122];
const PDF_ZINC_900: [number, number, number] = [24, 24, 27];
const PDF_WHITE: [number, number, number] = [255, 255, 255];
const PDF_RED_SOFT: [number, number, number] = [254, 242, 242];
const PDF_EMERALD: [number, number, number] = [5, 150, 105];
const PDF_BORDER: [number, number, number] = [231, 231, 234];

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

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  void loadOfficialChefLogo();
}

function drawOfficialLogo(doc: jsPDF, logo: LogoAsset | null | undefined, x: number, y: number, w: number): void {
  if (!logo) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...PDF_BRAND);
    doc.text('Chef One', x, y + 13);
    doc.setTextColor(...PDF_ZINC_900);
    return;
  }
  doc.addImage(logo.dataUrl, 'PNG', x, y, w, (w * logo.height) / logo.width);
}

function money(value: number): string {
  return `${value.toFixed(2)} €`;
}

function card(doc: jsPDF, x: number, y: number, w: number, h: number, accent = false): void {
  doc.setFillColor(...(accent ? PDF_RED_SOFT : PDF_WHITE));
  doc.roundedRect(x, y, w, h, 7, 7, 'F');
  doc.setDrawColor(...(accent ? ([252, 165, 165] as [number, number, number]) : PDF_BORDER));
  doc.setLineWidth(0.5);
  doc.roundedRect(x, y, w, h, 7, 7, 'S');
}

function pdfFooter(doc: jsPDF, page: number, total: number, periodLabel: string): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...PDF_ZINC_200);
  doc.setLineWidth(0.35);
  doc.line(32, pageH - 32, pageW - 32, pageH - 32);
  doc.setFontSize(7);
  doc.setTextColor(...PDF_ZINC_400);
  doc.text(
    `Chef One · ${periodLabel} · ${new Date().toLocaleString('es-ES', {
      timeZone: 'Europe/Madrid',
      dateStyle: 'medium',
      timeStyle: 'short',
    })}`,
    36,
    pageH - 16,
  );
  doc.text(`Página ${page} / ${total}`, pageW - 36, pageH - 16, { align: 'right' });
  doc.setTextColor(...PDF_ZINC_900);
}

function formatKeyEs(isoDay: string) {
  const [y, m, d] = isoDay.split('-').map(Number);
  if (!y || !m || !d) return isoDay;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function calendarMonthBounds(y: number, monthIndex: number): { start: string; end: string } {
  const start = `${y}-${String(monthIndex + 1).padStart(2, '0')}-01`;
  const last = new Date(y, monthIndex + 1, 0).getDate();
  const end = `${y}-${String(monthIndex + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { start, end };
}

function monthTitleEs(y: number, monthIndex: number): string {
  const raw = new Date(y, monthIndex, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Mes civil completo (mismo día inicio/fin que calendario) para comparativa. */
function parseFullCalendarMonthFromRange(
  fromKey: string | null,
  toKey: string | null,
): { y: number; m: number } | null {
  if (!fromKey || !toKey || fromKey.length < 10 || toKey.length < 10) return null;
  if (fromKey.slice(0, 7) !== toKey.slice(0, 7)) return null;
  const ym = fromKey.slice(0, 7);
  const [yy, mm] = ym.split('-').map(Number);
  if (!yy || !mm || mm < 1 || mm > 12) return null;
  const mi = mm - 1;
  const { start, end } = calendarMonthBounds(yy, mi);
  if (fromKey !== start || toKey !== end) return null;
  return { y: yy, m: mi };
}

/** Si no hay filtro de mes cerrado pero todos los registros caen en un solo mes civil. */
function inferSingleCalendarMonthFromRows(rows: MermaRecord[]): { y: number; m: number } | null {
  if (rows.length === 0) return null;
  const keys = new Set(rows.map((r) => toBusinessDateKey(r.occurredAt).slice(0, 7)));
  if (keys.size !== 1) return null;
  const ym = [...keys][0]!;
  const [yy, mm] = ym.split('-').map(Number);
  if (!yy || !mm || mm < 1 || mm > 12) return null;
  return { y: yy, m: mm - 1 };
}

function addCalendarMonths(y: number, monthIndex: number, delta: number): { y: number; m: number } {
  const d = new Date(y, monthIndex + delta, 1);
  return { y: d.getFullYear(), m: d.getMonth() };
}

function poolMermasByProductFilter(all: MermaRecord[], productFilter: string): MermaRecord[] {
  if (productFilter === 'all') return all;
  return all.filter((m) => m.productId === productFilter);
}

function sumNormalizedCostInRange(
  pool: MermaRecord[],
  priceById: Map<string, number | undefined>,
  startKey: string,
  endKey: string,
): number {
  let s = 0;
  for (const m of pool) {
    const k = toBusinessDateKey(m.occurredAt);
    if (k < startKey || k > endKey) continue;
    s += normalizedCostForRecord(m, priceById.get(m.productId));
  }
  return Math.round(s * 100) / 100;
}

export type MermasMonthOverMonth = {
  prevLabel: string;
  prevEur: number;
  currLabel: string;
  currEur: number;
  /** null si no hay base en el mes anterior para un % fiable */
  pctVsPrev: number | null;
};

function buildMonthOverMonth(
  allMermas: MermaRecord[],
  products: Product[],
  productFilter: string,
  fromKey: string | null,
  toKey: string | null,
  filteredRows: MermaRecord[],
): MermasMonthOverMonth | null {
  const priceById = new Map(products.map((p) => [p.id, p.pricePerUnit]));
  const pool = poolMermasByProductFilter(allMermas, productFilter);
  const ym = parseFullCalendarMonthFromRange(fromKey, toKey) ?? inferSingleCalendarMonthFromRows(filteredRows);
  if (!ym) return null;
  const { start: cStart, end: cEnd } = calendarMonthBounds(ym.y, ym.m);
  const currEur = sumNormalizedCostInRange(pool, priceById, cStart, cEnd);
  const prevYm = addCalendarMonths(ym.y, ym.m, -1);
  const { start: pStart, end: pEnd } = calendarMonthBounds(prevYm.y, prevYm.m);
  const prevEur = sumNormalizedCostInRange(pool, priceById, pStart, pEnd);
  const pctVsPrev = prevEur > 0 ? Math.round(((currEur - prevEur) / prevEur) * 1000) / 10 : null;
  return {
    prevLabel: monthTitleEs(prevYm.y, prevYm.m),
    prevEur,
    currLabel: monthTitleEs(ym.y, ym.m),
    currEur,
    pctVsPrev,
  };
}

function drawMonthOverMonthBlock(
  doc: jsPDF,
  opts: { x: number; y: number; w: number; data: MermasMonthOverMonth },
): number {
  const pad = 14;
  const boxH = 76;
  card(doc, opts.x, opts.y, opts.w, boxH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text('Comparativa mes civil (mismo filtro de producto)', opts.x + pad, opts.y + 14);

  const colW = (opts.w - pad * 2 - 140) / 3;
  const cx1 = opts.x + pad;
  const cx2 = cx1 + colW + 22;
  const cx3 = cx2 + colW + 22;
  const labelY = opts.y + 35;
  const valueY = opts.y + 55;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_ZINC_500);
  doc.text(opts.data.prevLabel, cx1, labelY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text(money(opts.data.prevEur), cx1, valueY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_ZINC_500);
  doc.text(opts.data.currLabel, cx2, labelY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...PDF_BRAND);
  doc.text(money(opts.data.currEur), cx2, valueY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_ZINC_500);
  doc.text('Variación vs mes anterior', cx3, labelY);
  const pctTxt =
    opts.data.pctVsPrev == null
      ? opts.data.prevEur <= 0 && opts.data.currEur > 0
        ? 'Sin base histórico'
        : opts.data.currEur === 0 && opts.data.prevEur === 0
          ? '0%'
          : '—'
      : `${opts.data.pctVsPrev > 0 ? '+' : ''}${opts.data.pctVsPrev}%`;
  doc.setFontSize(14);
  const chipColor =
    opts.data.pctVsPrev != null && opts.data.pctVsPrev < 0
      ? PDF_EMERALD
      : opts.data.pctVsPrev != null && opts.data.pctVsPrev > 0
        ? PDF_BRAND
        : PDF_ZINC_900;
  if (opts.data.pctVsPrev != null && opts.data.pctVsPrev !== 0) {
    doc.setTextColor(...chipColor);
  } else {
    doc.setTextColor(...PDF_ZINC_900);
  }
  doc.text(pctTxt, cx3, valueY);

  const sparkX = opts.x + opts.w - 116;
  const sparkY = opts.y + 27;
  const sparkW = 86;
  const sparkH = 32;
  const values = [opts.data.prevEur, opts.data.currEur];
  const min = Math.min(...values);
  const max = Math.max(...values, min + 0.01);
  const p1y = sparkY + sparkH - ((opts.data.prevEur - min) / (max - min)) * sparkH;
  const p2y = sparkY + sparkH - ((opts.data.currEur - min) / (max - min)) * sparkH;
  doc.setDrawColor(...PDF_ZINC_200);
  doc.setLineWidth(0.35);
  doc.line(sparkX, sparkY + sparkH, sparkX + sparkW, sparkY + sparkH);
  doc.setDrawColor(...chipColor);
  doc.setLineWidth(1.4);
  doc.line(sparkX, p1y, sparkX + sparkW, p2y);
  doc.setFillColor(...PDF_WHITE);
  doc.circle(sparkX, p1y, 2.2, 'FD');
  doc.circle(sparkX + sparkW, p2y, 2.2, 'FD');

  doc.setTextColor(...PDF_ZINC_900);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_ZINC_400);
  doc.text('Totales en € con la misma lógica de coste por línea que el panel.', opts.x + pad, opts.y + boxH - 9);
  doc.setTextColor(...PDF_ZINC_900);

  return opts.y + boxH + 8;
}

function drawMotiveCostBars(
  doc: jsPDF,
  opts: { x: number; y: number; w: number; h: number; items: Array<{ label: string; totalCost: number }> },
): void {
  card(doc, opts.x, opts.y, opts.w, opts.h);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text('Coste por motivo', opts.x + 12, opts.y + 15);
  if (opts.items.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text('Sin datos.', opts.x + 12, opts.y + 32);
    doc.setTextColor(...PDF_ZINC_900);
    return;
  }
  const max = Math.max(...opts.items.map((i) => i.totalCost), 0.01);
  const innerTop = opts.y + 30;
  const rowH = Math.min(16, (opts.h - 40) / opts.items.length);
  let y = innerTop;
  const wLab = 120;
  for (const it of opts.items) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...PDF_ZINC_900);
    const lines = doc.splitTextToSize(it.label, wLab);
    doc.text(lines, opts.x + 12, y + 6.5);
    const effectiveRowH = Math.max(rowH, lines.length * 7 + 1);
    const trackX = opts.x + 12 + wLab + 10;
    const trackY = y + 3;
    const trackW = opts.w - wLab - 96;
    doc.setFillColor(...PDF_ZINC_100);
    doc.roundedRect(trackX, trackY, trackW, 5, 2.5, 2.5, 'F');
    const fillW = Math.max(2, (it.totalCost / max) * trackW);
    doc.setFillColor(...PDF_BRAND);
    doc.roundedRect(trackX, trackY, fillW, 5, 2.5, 2.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...PDF_ZINC_900);
    doc.text(money(it.totalCost), opts.x + opts.w - 12, y + 7, { align: 'right' });
    y += effectiveRowH + 3;
    doc.setFont('helvetica', 'normal');
    if (y > opts.y + opts.h - 6) break;
  }
}

function drawDailyCostBars(
  doc: jsPDF,
  opts: { x: number; y: number; w: number; h: number; days: Array<{ key: string; cost: number }> },
): void {
  card(doc, opts.x, opts.y, opts.w, opts.h);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text('Coste diario (€)', opts.x + 12, opts.y + 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...PDF_ZINC_400);
  doc.text('Una línea por día natural del período filtrado', opts.x + 12, opts.y + 25);
  if (opts.days.length === 0) {
    doc.setFontSize(8);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text('Sin datos.', opts.x + 12, opts.y + 40);
    doc.setTextColor(...PDF_ZINC_900);
    return;
  }
  const max = Math.max(...opts.days.map((d) => d.cost), 0.01);
  const padL = 42;
  const baseY = opts.y + opts.h - 20;
  const chartTop = opts.y + 43;
  const chartH = baseY - chartTop;
  const innerW = opts.w - padL - 24;
  const n = opts.days.length;
  const axisLeft = opts.x + padL;
  const chartRight = axisLeft + innerW;
  const stepX = n <= 1 ? 0 : innerW / (n - 1);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...PDF_ZINC_400);
  for (let i = 0; i <= 3; i++) {
    const y = chartTop + (chartH / 3) * i;
    doc.setDrawColor(...PDF_ZINC_200);
    doc.setLineWidth(0.25);
    doc.line(axisLeft, y, chartRight, y);
    const val = max - (max / 3) * i;
    doc.text(`${val.toFixed(0)} €`, axisLeft - 28, y + 2.2);
  }

  const points = opts.days.map((d, i) => ({
    x: axisLeft + (n <= 1 ? innerW / 2 : stepX * i),
    y: baseY - (d.cost / max) * chartH,
    cost: d.cost,
  }));

  doc.setDrawColor(254, 226, 226);
  doc.setLineWidth(0.5);
  for (const p of points) {
    doc.line(p.x, p.y, p.x, baseY);
  }
  doc.setDrawColor(...PDF_BRAND);
  doc.setLineWidth(1.2);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    doc.line(prev.x, prev.y, curr.x, curr.y);
  }
  for (const p of points) {
    if (p.cost <= 0) continue;
    doc.setDrawColor(...PDF_BRAND);
    doc.setFillColor(...PDF_WHITE);
    doc.circle(p.x, p.y, 2, 'FD');
  }

  const labelEvery = n <= 12 ? 1 : n <= 24 ? 2 : n <= 35 ? 3 : Math.ceil(n / 12);
  for (let i = 0; i < n; i++) {
    if (i % labelEvery !== 0 && i !== n - 1) continue;
    doc.setFontSize(4.75);
    doc.setTextColor(...PDF_ZINC_400);
    doc.text(formatKeyEs(opts.days[i]!.key), points[i]!.x, baseY + 9, { align: 'center' });
  }
  if (n > 16) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text(`${n} días · ${formatKeyEs(opts.days[0]!.key)} → ${formatKeyEs(opts.days[n - 1]!.key)}`, opts.x + opts.w - 12, opts.y + 25, {
      align: 'right',
    });
  }
  doc.setTextColor(...PDF_ZINC_900);
}

export type MermasReportPdfFilters = {
  productLabel: string;
  fromLabel: string;
  toLabel: string;
};

export async function downloadMermasReportPdf(input: {
  rows: MermaRecord[];
  products: Product[];
  filters: MermasReportPdfFilters;
  /** `all` o id de producto; para comparativa mes vs mes mismo alcance que en pantalla */
  productFilter?: string;
  /** Claves yyyy-mm-dd de los filtros de fecha del resumen */
  dateRangeKeys?: { from: string | null; to: string | null };
  /** Todas las mermas del local (antes de filtro fecha); necesario para comparar con mes civil anterior */
  allMermas?: MermaRecord[];
}): Promise<void> {
  const {
    rows,
    products,
    filters,
    productFilter = 'all',
    dateRangeKeys,
    allMermas,
  } = input;
  const logo = await loadOfficialChefLogo();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 32;
  const contentW = pageW - margin * 2;

  doc.setFillColor(...PDF_WHITE);
  doc.rect(0, 0, pageW, pageH, 'F');
  drawOfficialLogo(doc, logo, margin + 4, 22, 88);
  doc.setDrawColor(...PDF_ZINC_200);
  doc.setLineWidth(0.6);
  doc.line(margin + 112, 18, margin + 112, 74);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text('Informe para dirección', margin + 134, 38);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text('Mermas y residuos', margin + 134, 56);
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_ZINC_500);
  doc.setFillColor(...PDF_RED_SOFT);
  doc.roundedRect(margin + 134, 66, 174, 17, 8.5, 8.5, 'F');
  doc.setTextColor(...PDF_BRAND);
  doc.text(`Periodo: ${filters.fromLabel} – ${filters.toLabel}`, margin + 144, 77.5);

  const priceById = new Map(products.map((p) => [p.id, p.pricePerUnit]));
  const rowCost = (m: MermaRecord) => normalizedCostForRecord(m, priceById.get(m.productId));

  const n = rows.length;
  const totalEur = rows.reduce((s, m) => s + rowCost(m), 0);
  const totalQty = rows.reduce((s, m) => s + m.quantity, 0);
  const avgEur = n > 0 ? totalEur / n : 0;
  const uniqProducts = new Set(rows.map((m) => m.productId)).size;

  const rowsForAgg = rows.map((m) => ({ ...m, costEur: rowCost(m) }));
  const motives = topMotives(rowsForAgg, 6);
  const topMotiveEur = motives[0]?.totalCost ?? 0;
  const topMotivePct = totalEur > 0 ? (topMotiveEur / totalEur) * 100 : 0;
  const topMotiveLine = motives[0] ? `${motives[0].label} · ${topMotivePct.toFixed(0)}%` : '—';

  const kpiY = 98;
  const gap = 10;
  const nKpi = 6;
  const kpiW = (contentW - (nKpi - 1) * gap) / nKpi;
  const kpiH = 52;
  const kpis: [string, string][] = [
    ['Registros', String(n)],
    ['Valor total', money(totalEur)],
    ['Cantidad (uds)', totalQty.toLocaleString('es-ES', { maximumFractionDigits: 2 })],
    ['Media / registro', n > 0 ? money(avgEur) : '—'],
    ['Referencias', String(uniqProducts)],
    ['Motivo principal', topMotiveLine],
  ];
  for (let i = 0; i < nKpi; i++) {
    const x = margin + i * (kpiW + gap);
    card(doc, x, kpiY, kpiW, kpiH, i === nKpi - 1);
    doc.setFillColor(...PDF_BRAND);
    doc.roundedRect(x + 10, kpiY + 11, 3, 30, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.4);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text(kpis[i]![0].toUpperCase(), x + 19, kpiY + 17);
    doc.setFontSize(i === nKpi - 1 ? 9.2 : 13);
    doc.setTextColor(...PDF_ZINC_900);
    const valLines = doc.splitTextToSize(kpis[i]![1], kpiW - 25);
    doc.text(valLines, x + 19, kpiY + 35, { lineHeightFactor: 1.04 });
  }

  let yAfterKpi = kpiY + kpiH + 10;

  const mom =
    allMermas != null
      ? buildMonthOverMonth(allMermas, products, productFilter, dateRangeKeys?.from ?? null, dateRangeKeys?.to ?? null, rows)
      : null;
  if (mom) {
    yAfterKpi = drawMonthOverMonthBlock(doc, { x: margin, y: yAfterKpi, w: contentW, data: mom });
  }

  const ensurePageFit = (minSpace: number) => {
    if (yAfterKpi > pageH - minSpace) {
      doc.addPage();
      yAfterKpi = 36;
    }
  };

  if (n > 0) {
    ensurePageFit(200);
    const chartY = yAfterKpi;
    const chartH = 156;
    const chartGap = 14;
    const leftW = contentW * 0.48;
    const rightW = contentW - leftW - chartGap;
    drawMotiveCostBars(doc, {
      x: margin,
      y: chartY,
      w: leftW,
      h: chartH,
      items: motives.map((m) => ({ label: m.label, totalCost: m.totalCost })),
    });
    const byDay = new Map<string, number>();
    for (const m of rows) {
      const k = toBusinessDateKey(m.occurredAt);
      byDay.set(k, (byDay.get(k) ?? 0) + rowCost(m));
    }
    const days = [...byDay.entries()]
      .map(([key, cost]) => ({ key, cost: Math.round(cost * 100) / 100 }))
      .sort((a, b) => a.key.localeCompare(b.key));
    drawDailyCostBars(doc, {
      x: margin + leftW + chartGap,
      y: chartY,
      w: rightW,
      h: chartH,
      days,
    });
    yAfterKpi = chartY + chartH + 18;

    ensurePageFit(160);
    const tableTitlesY = yAfterKpi;
    const tableGap = 12;
    const colW = (contentW - tableGap) / 2;

    card(doc, margin, tableTitlesY - 14, colW, 116);
    card(doc, margin + colW + tableGap, tableTitlesY - 14, colW, 116);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...PDF_ZINC_900);
    doc.text('Top 5 productos por cantidad total', margin + 12, tableTitlesY);
    doc.text('Top 5 productos por coste acumulado', margin + colW + tableGap + 12, tableTitlesY);

    const topQty = topByQuantity(rows, products, 5);
    const topCost = topByValue(rows, products, 5);
    autoTable(doc, {
      startY: tableTitlesY + 8,
      head: [['#', 'Producto', 'Cant. total (uds)']],
      body:
        topQty.length > 0
          ? topQty.map((p, idx) => [
              String(idx + 1),
              p.name,
              p.value.toLocaleString('es-ES', { maximumFractionDigits: 2 }),
            ])
          : [['—', 'Sin datos', '—']],
      styles: {
        fontSize: 7.4,
        cellPadding: { top: 2.7, bottom: 2.7, left: 4, right: 4 },
        textColor: PDF_ZINC_900,
        lineColor: PDF_ZINC_200,
        lineWidth: 0.25,
      },
      headStyles: { fillColor: PDF_ZINC_100, textColor: PDF_ZINC_500, fontSize: 7.2, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [252, 252, 253] },
      columnStyles: {
        0: { cellWidth: 22, textColor: PDF_BRAND, fontStyle: 'bold' },
        2: { halign: 'right' },
      },
      margin: { left: margin + 10 },
      tableWidth: colW - 20,
      theme: 'grid',
    });
    const yLeftDone = (doc as DocWithTable).lastAutoTable?.finalY ?? tableTitlesY + 40;

    autoTable(doc, {
      startY: tableTitlesY + 8,
      head: [['#', 'Producto', 'Coste (€)']],
      body:
        topCost.length > 0
          ? topCost.map((p, idx) => [String(idx + 1), p.name, p.value.toFixed(2)])
          : [['—', 'Sin datos', '—']],
      styles: {
        fontSize: 7.4,
        cellPadding: { top: 2.7, bottom: 2.7, left: 4, right: 4 },
        textColor: PDF_ZINC_900,
        lineColor: PDF_ZINC_200,
        lineWidth: 0.25,
      },
      headStyles: { fillColor: PDF_ZINC_100, textColor: PDF_ZINC_500, fontSize: 7.2, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [252, 252, 253] },
      columnStyles: {
        0: { cellWidth: 22, textColor: PDF_BRAND, fontStyle: 'bold' },
        2: { halign: 'right' },
      },
      margin: { left: margin + colW + tableGap + 10 },
      tableWidth: colW - 20,
      theme: 'grid',
    });
    const yRightDone = (doc as DocWithTable).lastAutoTable?.finalY ?? tableTitlesY + 40;

    yAfterKpi = Math.max(yLeftDone, yRightDone, tableTitlesY + 102) + 8;

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_ZINC_400);
    doc.text(
      'Las cantidades agrupan todas las líneas del mismo artículo. El histórico con cada registro sigue disponible en la app.',
      margin,
      yAfterKpi,
      { maxWidth: contentW },
    );
    yAfterKpi += 28;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF_ZINC_900);
  } else {
    doc.setFontSize(11);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text('No hay registros para el filtro aplicado.', margin, yAfterKpi + 8);
    yAfterKpi += 36;
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    pdfFooter(doc, p, totalPages, `${filters.fromLabel} – ${filters.toLabel}`);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`informe-mermas-${stamp}.pdf`);
}
