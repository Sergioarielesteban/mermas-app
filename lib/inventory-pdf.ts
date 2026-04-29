import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type InventoryPdfRow = {
  name: string;
  formatLabel: string;
  qty: number;
  unit: string;
  price: number;
  sub: number;
};

export type InventoryPdfCategoryRow = {
  name: string;
  valueEur: number;
  pct: number;
};

const BRAND_R: [number, number, number] = [211, 47, 47];
const ZINC_50: [number, number, number] = [250, 250, 250];
const ZINC_100: [number, number, number] = [244, 244, 245];
const ZINC_400: [number, number, number] = [161, 161, 170];
const ZINC_600: [number, number, number] = [82, 82, 91];
const ZINC_900: [number, number, number] = [24, 24, 27];
const WHITE: [number, number, number] = [255, 255, 255];

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function formatYearMonthLabel(ym: string): string {
  const [ys, ms] = ym.split('-');
  const y = Number(ys);
  const m = Number(ms);
  if (!y || !m || m < 1 || m > 12) return ym;
  return `${MONTHS_ES[m - 1]!.charAt(0).toUpperCase()}${MONTHS_ES[m - 1]!.slice(1)} ${y}`;
}

function formatEuroEs(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

function footerLine(doc: jsPDF): string {
  return `Chef-One · Documento generado ${new Date().toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    dateStyle: 'medium',
    timeStyle: 'short',
  })}`;
}

function drawPageFooter(doc: jsPDF, page: number, totalPages: number): void {
  const y = 287;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...ZINC_400);
  doc.text(footerLine(doc), 14, y);
  doc.text(`Página ${page} de ${totalPages}`, 196, y, { align: 'right' });
  doc.setTextColor(...ZINC_900);
}

export function downloadInventoryMonthlyPdf(opts: {
  localLabel: string;
  yearMonth: string;
  rows: InventoryPdfRow[];
  total: number;
  categoryRows: InventoryPdfCategoryRow[];
  linesCount: number;
  linesWithStock: number;
  /** Fecha/hora del cierre mostrada en la portada (ya formateada). */
  closedAtLabel?: string;
}): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const periodLabel = formatYearMonthLabel(opts.yearMonth);
  const pctStock =
    opts.linesCount > 0 ? Math.round((opts.linesWithStock / opts.linesCount) * 100) : 0;

  const drawCoverBlock = () => {
    doc.setFillColor(...BRAND_R);
    doc.rect(0, 0, 210, 11, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...WHITE);
    doc.text('CHEF-ONE',14, 7.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('Informe de inventario', 196, 7.5, { align: 'right' });
    doc.setTextColor(...ZINC_900);

    let y = 20;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text('Resumen para dirección', 14, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...ZINC_600);
    doc.text(opts.localLabel, 14, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND_R);
    doc.text(`Cierre: ${periodLabel}`, 14, y);
    doc.setTextColor(...ZINC_900);
    y += 5;
    if (opts.closedAtLabel) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...ZINC_600);
      doc.text(`Cerrado: ${opts.closedAtLabel}`, 14, y);
      doc.setTextColor(...ZINC_900);
      y += 7;
    } else {
      y += 5;
    }

    doc.setFillColor(...ZINC_50);
    doc.roundedRect(14, y, 182, 32, 2, 2, 'F');
    doc.setDrawColor(...ZINC_100);
    doc.roundedRect(14, y, 182, 32, 2, 2, 'S');

    const mid = 14 + 182 / 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...ZINC_400);
    doc.text('VALOR TOTAL INVENTARIO', 22, y + 9);
    doc.text('REFERENCIAS EN CATÁLOGO', mid + 8, y + 9);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...ZINC_900);
    doc.text(formatEuroEs(opts.total), 22, y + 19);
    doc.setFontSize(11);
    doc.text(`${opts.linesCount} líneas`, mid + 8, y + 17);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...ZINC_600);
    doc.text(`Con existencias > 0: ${opts.linesWithStock} (${pctStock} % cobertura)`, mid + 8, y + 24);

    doc.setTextColor(...ZINC_900);
    return y + 40;
  };

  let yStart = drawCoverBlock();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...ZINC_900);
  doc.text('Valor por categoría', 14, yStart);
  yStart += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...ZINC_600);
  doc.text('Misma lógica que el panel de KPI: reparto del valor de inventario entre categorías del catálogo.', 14, yStart);
  yStart += 6;

  const catBody =
    opts.categoryRows.length > 0
      ? opts.categoryRows.map((c) => [c.name, formatEuroEs(c.valueEur), `${c.pct.toFixed(1)} %`])
      : [['Sin datos', '—', '—']];

  autoTable(doc, {
    startY: yStart,
    head: [['Categoría', 'Importe', '% sobre total']],
    body: catBody,
    theme: 'plain',
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      textColor: ZINC_900,
      lineColor: ZINC_100,
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: BRAND_R,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 88 },
      1: { cellWidth: 36, halign: 'right' },
      2: { cellWidth: 36, halign: 'right' },
    },
    alternateRowStyles: { fillColor: ZINC_50 },
    margin: { left: 14, right: 14 },
  });

  let afterCat = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? yStart + 40;

  if (opts.categoryRows.length > 0) {
    const maxCat = Math.max(...opts.categoryRows.map((c) => c.valueEur), 1);
    const top = opts.categoryRows.slice(0, 10);
    afterCat += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...ZINC_900);
    doc.text('Peso de cada categoría (visual)', 14, afterCat);
    afterCat += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    for (const c of top) {
      const label = c.name.length > 40 ? `${c.name.slice(0, 37)}…` : c.name;
      doc.setTextColor(...ZINC_600);
      doc.text(label, 14, afterCat + 3.2);
      doc.setFillColor(...ZINC_100);
      doc.rect(95, afterCat, 88, 4.2, 'F');
      const w = (c.valueEur / maxCat) * 88;
      doc.setFillColor(...BRAND_R);
      doc.rect(95, afterCat, Math.max(w, 0.4), 4.2, 'F');
      doc.setTextColor(...ZINC_900);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text(`${c.pct.toFixed(1)} %`, 186, afterCat + 3.2, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      afterCat += 6.2;
    }
    doc.setTextColor(...ZINC_900);
  }

  let detailY = afterCat + 10;

  if (detailY > 225) {
    doc.addPage();
    detailY = 22;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...ZINC_900);
  doc.text('Detalle por artículo', 14, detailY - 2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...ZINC_600);
  doc.text(`${opts.rows.length} referencias · importes según cantidades y precios registrados`, 14, detailY + 3);

  autoTable(doc, {
    startY: detailY + 6,
    head: [['Artículo', 'Formato', 'Cant.', 'Ud.', '€/ud', 'Subtotal']],
    body: opts.rows.map((r) => [
      r.name,
      r.formatLabel || '—',
      String(r.qty),
      r.unit,
      r.price.toFixed(2),
      formatEuroEs(r.sub),
    ]),
    foot: [['', '', '', '', 'Total inventario', formatEuroEs(opts.total)]],
    theme: 'striped',
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: ZINC_900,
    },
    headStyles: {
      fillColor: BRAND_R,
      textColor: WHITE,
      fontStyle: 'bold',
    },
    footStyles: {
      fontStyle: 'bold',
      fillColor: ZINC_100,
      textColor: ZINC_900,
    },
    margin: { left: 14, right: 14 },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawPageFooter(doc, i, totalPages);
  }

  doc.save(`inventario-${opts.yearMonth}.pdf`);
}
