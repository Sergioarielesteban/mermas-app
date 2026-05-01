import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { normalizedCostForRecord, topByQuantity, topByValue, topMotives } from '@/lib/analytics';
import { toBusinessDateKey } from '@/lib/business-day';
import type { MermaRecord, Product } from '@/lib/types';

type DocWithTable = jsPDF & { lastAutoTable?: { finalY?: number } };

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
  const pageW = doc.internal.pageSize.getWidth();
  doc.text(`Página ${page} / ${total}`, pageW - 40, 555, { align: 'right' });
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
  const pad = 10;
  const boxH = 62;
  doc.setFillColor(...PDF_ZINC_100);
  doc.roundedRect(opts.x, opts.y, opts.w, boxH, 4, 4, 'F');
  doc.setDrawColor(...PDF_ZINC_400);
  doc.setLineWidth(0.35);
  doc.roundedRect(opts.x, opts.y, opts.w, boxH, 4, 4, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_ZINC_500);
  doc.text('Comparativa mes civil (mismo filtro de producto)', opts.x + pad, opts.y + 14);

  const colW = (opts.w - pad * 2 - 8) / 3;
  const baseY = opts.y + 38;
  doc.setFontSize(8);
  doc.setTextColor(...PDF_ZINC_500);
  doc.text(opts.data.prevLabel, opts.x + pad, baseY - 10);
  doc.setFontSize(14);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text(`${opts.data.prevEur.toFixed(2)} €`, opts.x + pad, baseY);

  doc.setFontSize(8);
  doc.setTextColor(...PDF_ZINC_500);
  doc.text(opts.data.currLabel, opts.x + pad + colW + 4, baseY - 10);
  doc.setFontSize(14);
  doc.setTextColor(...PDF_BRAND);
  doc.text(`${opts.data.currEur.toFixed(2)} €`, opts.x + pad + colW + 4, baseY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_ZINC_500);
  doc.text('Variación vs mes anterior', opts.x + pad + (colW + 4) * 2 - 12, baseY - 10);
  const pctTxt =
    opts.data.pctVsPrev == null
      ? opts.data.prevEur <= 0 && opts.data.currEur > 0
        ? 'Sin base histórico'
        : opts.data.currEur === 0 && opts.data.prevEur === 0
          ? '0%'
          : '—'
      : `${opts.data.pctVsPrev > 0 ? '+' : ''}${opts.data.pctVsPrev}%`;
  doc.setFontSize(14);
  if (opts.data.pctVsPrev != null && opts.data.pctVsPrev !== 0) {
    doc.setTextColor(...(opts.data.pctVsPrev > 0 ? ([220, 38, 38] as [number, number, number]) : ([22, 163, 74] as [number, number, number])));
  } else {
    doc.setTextColor(...PDF_ZINC_900);
  }
  doc.text(pctTxt, opts.x + pad + (colW + 4) * 2 - 12, baseY);

  doc.setTextColor(...PDF_ZINC_900);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_ZINC_400);
  doc.text('Totales en € con la misma lógica de coste por línea que el panel.', opts.x + pad, opts.y + boxH - 6);
  doc.setTextColor(...PDF_ZINC_900);

  return opts.y + boxH + 10;
}

function drawMotiveCostBars(
  doc: jsPDF,
  opts: { x: number; y: number; w: number; h: number; items: Array<{ label: string; totalCost: number }> },
): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text('Coste por motivo', opts.x, opts.y + 11);
  if (opts.items.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text('Sin datos.', opts.x, opts.y + 28);
    doc.setTextColor(...PDF_ZINC_900);
    return;
  }
  const max = Math.max(...opts.items.map((i) => i.totalCost), 0.01);
  const innerTop = opts.y + 22;
  const barH = Math.min(18, (opts.h - 28) / opts.items.length);
  let y = innerTop;
  const wLab = 124;
  for (const it of opts.items) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...PDF_ZINC_500);
    const lines = doc.splitTextToSize(it.label, wLab);
    doc.text(lines, opts.x, y + 8);
    const rowH = Math.max(barH, lines.length * 7 + 2);
    const trackX = opts.x + wLab + 6;
    const trackW = opts.w - wLab - 78;
    doc.setFillColor(...PDF_ZINC_100);
    doc.rect(trackX, y, trackW, rowH, 'F');
    const fillW = Math.max(1.5, (it.totalCost / max) * trackW);
    doc.setFillColor(...PDF_BRAND);
    doc.rect(trackX, y, fillW, rowH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...PDF_ZINC_900);
    doc.text(`${it.totalCost.toFixed(2)} €`, opts.x + opts.w - 4, y + rowH / 2 + 3, { align: 'right' });
    y += rowH + 3;
    doc.setFont('helvetica', 'normal');
    if (y > opts.y + opts.h - 6) break;
  }
}

function drawDailyCostBars(
  doc: jsPDF,
  opts: { x: number; y: number; w: number; h: number; days: Array<{ key: string; cost: number }> },
): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text('Coste diario (€)', opts.x, opts.y + 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...PDF_ZINC_400);
  doc.text('Una columna por día natural del período filtrado', opts.x, opts.y + 22);
  if (opts.days.length === 0) {
    doc.setFontSize(8);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text('Sin datos.', opts.x, opts.y + 36);
    doc.setTextColor(...PDF_ZINC_900);
    return;
  }
  const max = Math.max(...opts.days.map((d) => d.cost), 0.01);
  const padL = 38;
  const baseY = opts.y + opts.h - 6;
  const chartH = opts.h - 48;
  const innerW = opts.w - padL - 14;
  const gap = opts.days.length > 35 ? 0.75 : opts.days.length > 20 ? 1 : 1.5;
  const n = opts.days.length;
  const barW = Math.max(1.75, Math.min(16, (innerW - gap * (n + 1)) / n));
  const axisLeft = opts.x + padL;
  const chartRight = axisLeft + gap + (barW + gap) * n;

  doc.setDrawColor(...PDF_ZINC_400);
  doc.setLineWidth(0.4);
  doc.line(axisLeft - 4, baseY, chartRight + 6, baseY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...PDF_ZINC_500);
  doc.text(`${max.toFixed(0)} €`, axisLeft - 36, opts.y + 42);
  doc.setFont('helvetica', 'normal');
  doc.text('0', axisLeft - 14, baseY + 4);

  let x = axisLeft + gap;
  for (const d of opts.days) {
    const bh = (d.cost / max) * chartH;
    doc.setFillColor(250, 250, 251);
    doc.rect(x, baseY - chartH, barW, chartH, 'F');
    if (bh > 0) {
      doc.setFillColor(...PDF_BRAND);
      doc.rect(x, baseY - bh, barW, bh, 'F');
    }
    doc.setDrawColor(...PDF_ZINC_100);
    doc.setLineWidth(0.2);
    doc.rect(x, baseY - chartH, barW, chartH, 'S');

    doc.setDrawColor(...PDF_ZINC_100);
    x += barW + gap;
  }

  doc.setDrawColor(...PDF_ZINC_100);
  const labelEvery = n <= 12 ? 1 : n <= 24 ? 2 : n <= 35 ? 3 : Math.ceil(n / 12);
  for (let i = 0; i < n; i++) {
    if (i % labelEvery !== 0 && i !== n - 1) continue;
    const barX = axisLeft + gap + i * (barW + gap);
    doc.setFontSize(4.75);
    doc.setTextColor(...PDF_ZINC_400);
    doc.text(formatKeyEs(opts.days[i]!.key), barX + barW / 2, baseY + 9, { align: 'center' });
  }
  if (n > 16) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text(`${n} días · ${formatKeyEs(opts.days[0]!.key)} → ${formatKeyEs(opts.days[n - 1]!.key)}`, axisLeft - 6, opts.y + 34);
  }
  doc.setTextColor(...PDF_ZINC_900);
}

export type MermasReportPdfFilters = {
  productLabel: string;
  fromLabel: string;
  toLabel: string;
};

export function downloadMermasReportPdf(input: {
  rows: MermaRecord[];
  products: Product[];
  filters: MermasReportPdfFilters;
  /** `all` o id de producto; para comparativa mes vs mes mismo alcance que en pantalla */
  productFilter?: string;
  /** Claves yyyy-mm-dd de los filtros de fecha del resumen */
  dateRangeKeys?: { from: string | null; to: string | null };
  /** Todas las mermas del local (antes de filtro fecha); necesario para comparar con mes civil anterior */
  allMermas?: MermaRecord[];
}): void {
  const {
    rows,
    products,
    filters,
    productFilter = 'all',
    dateRangeKeys,
    allMermas,
  } = input;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pageW - margin * 2;

  doc.setFillColor(...PDF_BRAND);
  doc.rect(0, 0, pageW, 14, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_WHITE);
  doc.text('CHEF-ONE', margin, 10);
  doc.setFont('helvetica', 'normal');
  doc.text('Mermas y residuos', pageW - margin, 10, { align: 'right' });
  doc.setTextColor(...PDF_ZINC_900);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Informe para dirección', margin, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...PDF_ZINC_500);
  doc.text(`Producto: ${filters.productLabel}`, margin, 58);
  doc.text(`Periodo (filtro): ${filters.fromLabel} – ${filters.toLabel}`, margin, 72);
  doc.setFontSize(9);
  doc.text(
    'Resumen ejecutivo (sin detalle línea a línea). Las gráficas y tablas siguen los filtros de producto y fechas seleccionados. Importes como en el panel.',
    margin,
    88,
    { maxWidth: contentW },
  );

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
  const topMotiveLine = motives[0]
    ? `${motives[0].label.length > 20 ? `${motives[0].label.slice(0, 19)}…` : motives[0].label} (${topMotivePct.toFixed(0)}%)`
    : '—';

  const kpiY = 108;
  const gap = 8;
  const nKpi = 6;
  const kpiW = (contentW - (nKpi - 1) * gap) / nKpi;
  const kpiH = 50;
  const kpis: [string, string][] = [
    ['Registros', String(n)],
    ['Valor total', `${totalEur.toFixed(2)} €`],
    ['Cantidad (uds)', totalQty.toLocaleString('es-ES', { maximumFractionDigits: 2 })],
    ['Media / registro', n > 0 ? `${avgEur.toFixed(2)} €` : '—'],
    ['Referencias', String(uniqProducts)],
    ['Motivo principal', topMotiveLine],
  ];
  for (let i = 0; i < nKpi; i++) {
    const x = margin + i * (kpiW + gap);
    doc.setFillColor(...PDF_ZINC_100);
    doc.roundedRect(x, kpiY, kpiW, kpiH, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text(kpis[i]![0], x + 8, kpiY + 15);
    doc.setFontSize(10);
    doc.setTextColor(...PDF_ZINC_900);
    const valLines = doc.splitTextToSize(kpis[i]![1], kpiW - 14);
    doc.text(valLines, x + 8, kpiY + 32);
  }

  let yAfterKpi = kpiY + kpiH + 16;

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

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...PDF_ZINC_900);
    doc.text('Top 5 productos por cantidad total', margin, tableTitlesY);
    doc.text('Top 5 productos por coste acumulado', margin + colW + tableGap, tableTitlesY);

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
      styles: { fontSize: 8, cellPadding: 3.2, textColor: PDF_ZINC_900 },
      headStyles: { fillColor: PDF_BRAND, textColor: PDF_WHITE, fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin },
      tableWidth: colW,
    });
    const yLeftDone = (doc as DocWithTable).lastAutoTable?.finalY ?? tableTitlesY + 40;

    autoTable(doc, {
      startY: tableTitlesY + 8,
      head: [['#', 'Producto', 'Coste (€)']],
      body:
        topCost.length > 0
          ? topCost.map((p, idx) => [String(idx + 1), p.name, p.value.toFixed(2)])
          : [['—', 'Sin datos', '—']],
      styles: { fontSize: 8, cellPadding: 3.2, textColor: PDF_ZINC_900 },
      headStyles: { fillColor: PDF_BRAND, textColor: PDF_WHITE, fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin + colW + tableGap },
      tableWidth: colW,
    });
    const yRightDone = (doc as DocWithTable).lastAutoTable?.finalY ?? tableTitlesY + 40;

    yAfterKpi = Math.max(yLeftDone, yRightDone) + 8;

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
    pdfFooter(doc, p, totalPages);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`informe-mermas-${stamp}.pdf`);
}
