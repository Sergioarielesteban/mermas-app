import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DeliveryItemRow, DeliveryRow } from '@/lib/cocina-central-supabase';
import { ccProductName } from '@/lib/cocina-central-supabase';

type DocWithTable = jsPDF & { lastAutoTable?: { finalY?: number } };

const BRAND: [number, number, number] = [211, 47, 47];
const ZINC900: [number, number, number] = [24, 24, 27];
const ZINC500: [number, number, number] = [113, 113, 122];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

export function buildDeliveryAlbaranPdf(opts: {
  delivery: DeliveryRow;
  items: DeliveryItemRow[];
}): jsPDF {
  const { delivery, items } = opts;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' }) as DocWithTable;
  const pageW = doc.internal.pageSize.getWidth();
  let y = 48;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...BRAND);
  doc.text('Chef-One — Albarán de entrega', 40, y);
  y += 28;

  doc.setFontSize(9);
  doc.setTextColor(...ZINC500);
  doc.text(`ID entrega: ${delivery.id}`, 40, y);
  y += 14;
  doc.text(`Fecha: ${fmtDate(delivery.fecha)}`, 40, y);
  y += 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...ZINC900);
  doc.text('Origen', 40, y);
  doc.setFont('helvetica', 'normal');
  doc.text(delivery.local_origen_label ?? delivery.local_origen_id, 40, y + 14);
  y += 36;
  doc.setFont('helvetica', 'bold');
  doc.text('Destino', 40, y);
  doc.setFont('helvetica', 'normal');
  doc.text(delivery.local_destino_label ?? delivery.local_destino_id, 40, y + 14);
  y += 44;

  const rows = items.map((it) => {
    const batch = Array.isArray(it.production_batches)
      ? it.production_batches[0]
      : it.production_batches;
    return [
      ccProductName((Array.isArray(it.central_preparations) ? it.central_preparations[0] : it.central_preparations) ?? it.products),
      batch?.codigo_lote ?? '—',
      String(it.cantidad),
      it.unidad,
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Producto', 'Lote', 'Cantidad', 'Ud.']],
    body: rows,
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255] },
  });

  const after = doc.lastAutoTable?.finalY ?? y + 80;
  let y2 = after + 24;

  const total = items.reduce((s, it) => s + Number(it.cantidad), 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Total unidades (suma numérica): ${total.toFixed(2)}`, 40, y2);
  y2 += 28;

  doc.setFont('helvetica', 'bold');
  doc.text('Receptor', 40, y2);
  doc.setFont('helvetica', 'normal');
  doc.text(delivery.nombre_receptor?.trim() ? delivery.nombre_receptor : '—', 40, y2 + 14);
  y2 += 40;

  if (delivery.signature_data_url) {
    doc.setFont('helvetica', 'bold');
    doc.text('Firma', 40, y2);
    y2 += 12;
    try {
      doc.addImage(delivery.signature_data_url, 'PNG', 40, y2, 200, 80);
    } catch {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...ZINC500);
      doc.text('(Firma guardada; vista previa no disponible en este PDF)', 40, y2 + 20);
      doc.setTextColor(...ZINC900);
    }
  }

  doc.setFontSize(7);
  doc.setTextColor(...ZINC500);
  doc.text(
    `Generado ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`,
    40,
    doc.internal.pageSize.getHeight() - 32,
  );
  doc.text('Chef-One', pageW - 40, doc.internal.pageSize.getHeight() - 32, { align: 'right' });

  return doc;
}
