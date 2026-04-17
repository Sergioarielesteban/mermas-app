import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CC_UNIT_SHORT,
  type CentralSupplyOrderItemRow,
  type CentralSupplyOrderRow,
  SUPPLY_ORDER_ESTADO_LABEL,
  formatEur,
  formatMonthLabelEs,
} from '@/lib/cocina-central-supply-supabase';

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

function shortId(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

/**
 * Informe mensual para cobrar a un local satélite: pedidos por fecha de entrega,
 * líneas con precio unitario e importe (snapshot en BD).
 */
export function downloadCentralSupplyMonthlyInvoicePdf(opts: {
  monthKey: string;
  localSolicitanteLabel: string;
  centralLabel: string;
  orders: CentralSupplyOrderRow[];
  itemsByOrderId: Map<string, CentralSupplyOrderItemRow[]>;
}): void {
  const monthLabel = formatMonthLabelEs(opts.monthKey);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' }) as DocWithTable;
  let y = 44;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...BRAND);
  doc.text('Chef-One — Informe de pedidos a cocina central', 40, y);
  y += 22;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...ZINC500);
  doc.text(`Periodo (fecha de entrega): ${monthLabel}`, 40, y);
  y += 14;
  doc.text(`Local (sede): ${opts.localSolicitanteLabel}`, 40, y);
  y += 14;
  doc.text(`Cocina central: ${opts.centralLabel}`, 40, y);
  y += 22;

  const activeOrders = opts.orders.filter((o) => o.estado !== 'cancelado');
  const totalFacturable = activeOrders.reduce((s, o) => s + Number(o.total_eur), 0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...ZINC900);
  doc.text(`Resumen: ${activeOrders.length} pedido(s) · Total ${formatEur(totalFacturable)}`, 40, y);
  y += 20;

  let lastTableBottom = y;

  if (activeOrders.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...ZINC500);
    doc.text('No hay pedidos facturables en este periodo.', 40, y);
    lastTableBottom = y + 14;
  }

  for (const ord of activeOrders.sort(
    (a, b) => a.fecha_entrega_deseada.localeCompare(b.fecha_entrega_deseada) || a.created_at.localeCompare(b.created_at),
  )) {
    const lines = opts.itemsByOrderId.get(ord.id) ?? [];
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = 48;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...ZINC900);
    doc.text(
      `Pedido ${shortId(ord.id)} · Entrega ${fmtDate(ord.fecha_entrega_deseada)} · ${SUPPLY_ORDER_ESTADO_LABEL[ord.estado]} · ${formatEur(Number(ord.total_eur))}`,
      40,
      y,
    );
    y += 14;

    if (ord.notas?.trim()) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...ZINC500);
      const noteLines = doc.splitTextToSize(`Notas: ${ord.notas.trim()}`, doc.internal.pageSize.getWidth() - 80);
      doc.text(noteLines, 40, y);
      y += 12 + noteLines.length * 11;
      doc.setFont('helvetica', 'normal');
    }

    const body = lines.map((it) => [
      it.product_name,
      CC_UNIT_SHORT[it.unidad],
      String(it.cantidad),
      formatEur(Number(it.precio_unitario_eur)),
      formatEur(Number(it.line_total_eur)),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Producto', 'Ud.', 'Cant.', 'P. unit.', 'Importe']],
      body,
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: { fillColor: BRAND, textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [252, 252, 252] },
    });

    lastTableBottom = doc.lastAutoTable?.finalY ?? y;
    y = lastTableBottom + 20;
  }

  const footerY = Math.min(lastTableBottom + 28, doc.internal.pageSize.getHeight() - 40);
  doc.setFontSize(8);
  doc.setTextColor(...ZINC500);
  doc.text(
    `Generado ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} · Importes según precios vigentes al confirmar cada pedido en el servidor.`,
    40,
    footerY,
  );

  doc.save(`informe-pedidos-central-${opts.monthKey}-${opts.localSolicitanteLabel.replace(/\s+/g, '-')}.pdf`);
}
