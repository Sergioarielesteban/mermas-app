import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { normalizedCostForRecord, topMotives, topByValue } from '@/lib/analytics';
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

function motiveLabelPdf(key: MermaRecord['motiveKey']): string {
  const labels: Record<MermaRecord['motiveKey'], string> = {
    'se-quemo': 'SE QUEMÓ',
    'mal-estado': 'MAL ESTADO',
    'cliente-cambio': 'EL CLIENTE CAMBIÓ',
    'error-cocina': 'ERROR DEL EQUIPO',
    'sobras-marcaje': 'SOBRAS DE MARCAJE',
    cancelado: 'CANCELADO',
    'otros-motivos': 'OTROS MOTIVOS',
  };
  return labels[key] ?? key;
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
  if (opts.days.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text('Sin datos.', opts.x, opts.y + 28);
    doc.setTextColor(...PDF_ZINC_900);
    return;
  }
  const max = Math.max(...opts.days.map((d) => d.cost), 0.01);
  const padL = 34;
  const baseY = opts.y + opts.h - 10;
  const chartH = opts.h - 40;
  const innerW = opts.w - padL - 6;
  const gap = 1.5;
  const n = opts.days.length;
  const barW = Math.max(2.5, Math.min(20, (innerW - gap * (n + 1)) / n));
  let x = opts.x + padL + gap;
  for (const d of opts.days) {
    const bh = (d.cost / max) * chartH;
    doc.setFillColor(...PDF_ZINC_100);
    doc.rect(x, baseY - chartH, barW, chartH, 'F');
    if (bh > 0) {
      doc.setFillColor(...PDF_BRAND);
      doc.rect(x, baseY - bh, barW, bh, 'F');
    }
    if (n <= 14) {
      doc.setFontSize(5);
      doc.setTextColor(...PDF_ZINC_400);
      doc.text(formatKeyEs(d.key), x + barW / 2, baseY + 8, { align: 'center' });
    }
    x += barW + gap;
  }
  if (n > 14) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text(`Eje: ${formatKeyEs(opts.days[0]!.key)} … ${formatKeyEs(opts.days[opts.days.length - 1]!.key)} (${n} días)`, opts.x + padL, baseY + 10);
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
}): void {
  const { rows, products, filters } = input;
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
    'Resumen económico y operativo de mermas en la selección. Importes en € alineados con el panel (misma lógica de coste por línea).',
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

  if (n > 0) {
    const chartY = yAfterKpi;
    const chartH = 152;
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
    let days = [...byDay.entries()]
      .map(([key, cost]) => ({ key, cost: Math.round(cost * 100) / 100 }))
      .sort((a, b) => a.key.localeCompare(b.key));
    if (days.length > 31) days = days.slice(-31);
    drawDailyCostBars(doc, {
      x: margin + leftW + chartGap,
      y: chartY,
      w: rightW,
      h: chartH,
      days,
    });
    yAfterKpi = chartY + chartH + 14;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...PDF_ZINC_900);
    doc.text('Top productos por valor en el periodo', margin, yAfterKpi);
    const topProds = topByValue(rows, products, 10);
    autoTable(doc, {
      startY: yAfterKpi + 6,
      head: [['#', 'Producto', 'Valor acumulado (€)', 'Nº registros']],
      body:
        topProds.length > 0
          ? topProds.map((p, idx) => {
              const count = rows.filter((r) => r.productId === p.productId).length;
              return [String(idx + 1), p.name, p.value.toFixed(2), String(count)];
            })
          : [['—', 'Sin datos', '—', '—']],
      styles: { fontSize: 8, cellPadding: 3, textColor: PDF_ZINC_900 },
      headStyles: { fillColor: PDF_BRAND, textColor: PDF_WHITE },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
      tableWidth: Math.min(520, contentW * 0.72),
    });
    yAfterKpi = (doc as DocWithTable).lastAutoTable?.finalY ?? yAfterKpi + 60;
    yAfterKpi += 10;
  } else {
    doc.setFontSize(11);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text('No hay registros para el filtro aplicado. El detalle aparecerá vacío.', margin, yAfterKpi + 8);
    yAfterKpi += 36;
  }

  if (yAfterKpi > pageH - 100) {
    doc.addPage();
    yAfterKpi = 36;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text('Detalle de mermas (más reciente primero)', margin, yAfterKpi + 4);

  const sorted = [...rows].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  const productById = new Map(products.map((p) => [p.id, p]));

  const body =
    n === 0
      ? [['—', '—', '—', '—', '—', '—', 'Sin filas en el filtro actual']]
      : sorted.map((m) => {
          const p = productById.get(m.productId);
          const notes = (m.notes ?? '').trim();
          const notesShort = notes.length > 40 ? `${notes.slice(0, 37)}…` : notes;
          return [
            new Date(m.occurredAt).toLocaleString('es-ES', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }),
            p?.name ?? '—',
            p?.unit ?? '—',
            String(m.quantity),
            motiveLabelPdf(m.motiveKey),
            rowCost(m).toFixed(2),
            notesShort || '—',
          ];
        });

  autoTable(doc, {
    startY: yAfterKpi + 14,
    head: [['Fecha', 'Producto', 'Ud', 'Cant.', 'Motivo', '€', 'Notas']],
    body,
    styles: { fontSize: 7, cellPadding: 2.5, textColor: PDF_ZINC_900 },
    headStyles: { fillColor: PDF_BRAND, textColor: PDF_WHITE, fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 6: { cellWidth: 95 } },
    margin: { left: margin, right: margin },
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    pdfFooter(doc, p, totalPages);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`informe-mermas-${stamp}.pdf`);
}
