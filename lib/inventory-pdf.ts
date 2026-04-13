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

export function downloadInventoryMonthlyPdf(opts: {
  localLabel: string;
  yearMonth: string;
  rows: InventoryPdfRow[];
  total: number;
}): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.setTextColor(24, 24, 27);
  doc.text(`Inventario mensual — ${opts.localLabel}`, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(113, 113, 122);
  doc.text(`Mes ${opts.yearMonth} · Chef-One`, 14, 22);
  doc.setTextColor(24, 24, 27);

  autoTable(doc, {
    startY: 28,
    head: [['Artículo', 'Formato', 'Cant.', 'Ud.', '€/ud', 'Subtotal €']],
    body: opts.rows.map((r) => [
      r.name,
      r.formatLabel || '—',
      String(r.qty),
      r.unit,
      r.price.toFixed(2),
      r.sub.toFixed(2),
    ]),
    foot: [['', '', '', '', 'Total', `${opts.total.toFixed(2)} €`]],
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [211, 47, 47], textColor: 255 },
    footStyles: { fontStyle: 'bold', fillColor: [244, 244, 245] },
  });

  doc.save(`inventario-${opts.yearMonth}.pdf`);
}
