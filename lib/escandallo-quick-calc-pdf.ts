import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatMoneyEur } from '@/lib/money-format';
import type { QuickCalcResult } from '@/lib/escandallo-quick-calculator-math';

type DocWithTable = jsPDF & { lastAutoTable?: { finalY?: number } };

const BRAND: [number, number, number] = [211, 47, 47];
const ZINC900: [number, number, number] = [24, 24, 27];
const ZINC500: [number, number, number] = [113, 113, 122];

type ManualLinePdf = { type: 'manual'; concept: string; importe: number };
type MasterLinePdf = {
  type: 'master';
  productName: string;
  supplierName: string;
  costeUnitarioUso: number;
  unidadUso: string;
  cantidad: number;
  importe: number;
};

type LineRow = ManualLinePdf | MasterLinePdf;

export function downloadEscandalloQuickCalcPdf(opts: {
  nombreCalculo: string;
  lineRows: LineRow[];
  calc: QuickCalcResult;
}): void {
  const now = new Date();
  const fecha = now.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const doc = new jsPDF({ unit: 'pt', format: 'a4' }) as DocWithTable;
  let y = 40;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...BRAND);
  doc.text('Chef-One — Calculadora rápida de platos', 40, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...ZINC500);
  doc.text(`Fecha: ${fecha}`, 40, y);
  y += 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...ZINC900);
  const nombre = opts.nombreCalculo.trim() || '—';
  doc.text(`Nombre del cálculo: ${nombre}`, 40, y);
  y += 22;

  const tableBody: string[][] = [];
  for (const row of opts.lineRows) {
    if (row.type === 'manual') {
      const desc = row.concept.trim() || 'Producto manual';
      tableBody.push([desc, formatMoneyEur(row.importe)]);
    } else {
      const u = formatMoneyEur(row.costeUnitarioUso) + `/${row.unidadUso}`;
      const desc = `${row.productName} — ${row.supplierName} · ${u} — ${row.cantidad} ${row.unidadUso}`;
      tableBody.push([desc, formatMoneyEur(row.importe)]);
    }
  }
  if (tableBody.length === 0) {
    tableBody.push(['(sin líneas)', '0,00 €']);
  }

  autoTable(doc, {
    startY: y,
    head: [['Concepto', 'Importe']],
    body: tableBody,
    styles: { fontSize: 8, textColor: ZINC900, cellPadding: 5 },
    headStyles: { fillColor: [250, 250, 250], textColor: ZINC900, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 400 }, 1: { halign: 'right', cellWidth: 90 } },
    margin: { left: 40, right: 40 },
  });

  y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 40;
  y += 12;

  const c = opts.calc;
  const rows: [string, string][] = [
    ['Coste total', formatMoneyEur(c.costeTotal)],
    ['Food cost objetivo (%)', `${c.foodCostObjetivoPct} %`],
    ['IVA venta (%)', `${c.ivaVentaPct} %`],
    ['Precio venta neto', formatMoneyEur(c.precioVentaNeto)],
    ['PVP recomendado (IVA incl.)', formatMoneyEur(c.pvpIvaIncluido)],
    [
      'Margen bruto estimado',
      `${formatMoneyEur(c.margenBruto)} (${c.margenBrutoPorcentaje} %)`,
    ],
  ];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  let ry = y;
  for (const [label, val] of rows) {
    doc.setTextColor(...ZINC500);
    doc.text(label, 40, ry);
    doc.setTextColor(...ZINC900);
    doc.text(val, 520, ry, { align: 'right' });
    ry += 14;
  }

  doc.save(`calculadora-rapida-${now.toISOString().slice(0, 10)}.pdf`);
}
