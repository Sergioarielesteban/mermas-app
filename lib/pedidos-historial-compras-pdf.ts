import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PedidoOrder } from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';

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

function incidentLabel(type: string | null | undefined, notes?: string | null): string {
  if (!type) return '—';
  const map: Record<string, string> = {
    missing: 'No recibido',
    damaged: 'Dañado',
    'wrong-item': 'Producto incorrecto',
  };
  const base = map[type] ?? type;
  const n = (notes ?? '').trim();
  if (!n) return base;
  return `${base}: ${n.length > 40 ? `${n.slice(0, 37)}…` : n}`;
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
  monthlyTopProducts: Array<{ productName: string; spend: number; qty: number; unit: Unit; pct: number }>;
  weeklySummary: Array<{ week: number; total: number; topProducts: Array<{ name: string; spend: number }> }>;
  supplierPerformance: Array<{
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
};

export function downloadPedidosHistorialComprasPdf(input: PedidosHistorialComprasPdfInput): void {
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

  doc.setFillColor(...PDF_BRAND);
  doc.rect(0, 0, pageW, 14, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_WHITE);
  doc.text('CHEF-ONE', margin, 10);
  doc.setFont('helvetica', 'normal');
  doc.text('Historial de compras', pageW - margin, 10, { align: 'right' });
  doc.setTextColor(...PDF_ZINC_900);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Informe para dirección', margin, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...PDF_ZINC_500);
  doc.text(localLabel, margin, 58);
  doc.text(`Mes: ${monthTitle} (${monthIso}) · ${viewModeLabel}`, margin, 72);
  doc.text(`Proveedor en informe: ${supplierFilterLabel}`, margin, 86);
  doc.setFontSize(9);
  doc.text(
    'Incluye KPIs del periodo, rankings, desvíos pedido/recepción, detalle línea a línea (todas las líneas del filtro) y agregado por proveedor y producto. Importes con IVA en gastos y líneas salvo indicación.',
    margin,
    100,
    { maxWidth: contentW },
  );

  const kpiY = 128;
  const gap = 8;
  const nKpi = 6;
  const kpiW = (contentW - (nKpi - 1) * gap) / nKpi;
  const kpiH = 50;
  const kpisRow: [string, string][] = [
    ['Total (IVA incl.)', `${kpis.totalWithVat.toFixed(2)} €`],
    ['Base imponible', `${kpis.totalBase.toFixed(2)} €`],
    ['IVA', `${kpis.totalVat.toFixed(2)} €`],
    ['Pedidos', String(kpis.orderCount)],
    ['Ticket medio', `${kpis.avgTicket.toFixed(2)} €`],
    [
      'Vs mes ant.',
      kpis.deltaPct == null ? '—' : `${kpis.deltaPct >= 0 ? '+' : ''}${kpis.deltaPct.toFixed(1)} %`,
    ],
  ];
  for (let i = 0; i < nKpi; i++) {
    const x = margin + i * (kpiW + gap);
    doc.setFillColor(...PDF_ZINC_100);
    doc.roundedRect(x, kpiY, kpiW, kpiH, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text(kpisRow[i]![0], x + 8, kpiY + 15);
    doc.setFontSize(11);
    doc.setTextColor(...PDF_ZINC_900);
    const valLines = doc.splitTextToSize(kpisRow[i]![1], kpiW - 14);
    doc.text(valLines, x + 8, kpiY + 34);
  }

  let y = kpiY + kpiH + 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text('Top productos por gasto (IVA incl.)', margin, y);
  y += 4;
  autoTable(doc, {
    startY: y + 4,
    head: [['Producto', 'Gasto €', 'Cantidad', 'Ud', '% mes']],
    body:
      monthlyTopProducts.length > 0
        ? monthlyTopProducts.map((p) => [
            p.productName,
            p.spend.toFixed(2),
            String(p.qty),
            p.unit,
            `${p.pct.toFixed(1)}%`,
          ])
        : [['—', '—', '—', '—', 'Sin datos']],
    styles: { fontSize: 7.5, cellPadding: 2.5, textColor: PDF_ZINC_900 },
    headStyles: { fillColor: PDF_BRAND, textColor: PDF_WHITE },
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
    styles: { fontSize: 7, cellPadding: 2.5, textColor: PDF_ZINC_900 },
    headStyles: { fillColor: PDF_BRAND, textColor: PDF_WHITE },
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
        ? supplierPerformance.map((s) => [
            s.supplierName,
            s.spend.toFixed(2),
            String(s.orderCount),
            `${s.incidencePct.toFixed(1)}%`,
            s.deviation.toFixed(2),
          ])
        : [['—', '—', '—', '—', '—']],
    styles: { fontSize: 7, cellPadding: 2.5, textColor: PDF_ZINC_900 },
    headStyles: { fillColor: PDF_BRAND, textColor: PDF_WHITE },
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
    body: [
      [
        deviationKpis.requested.toFixed(2),
        deviationKpis.received.toFixed(2),
        deviationKpis.deviationAbs.toFixed(2),
        `${deviationKpis.deviationPct.toFixed(1)}%`,
        String(deviationKpis.incidents),
        String(deviationKpis.totalOrders),
      ],
    ],
    styles: { fontSize: 7.5, cellPadding: 2.5, textColor: PDF_ZINC_900 },
    headStyles: { fillColor: PDF_BRAND, textColor: PDF_WHITE },
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
    styles: { fontSize: 6, cellPadding: 2, textColor: PDF_ZINC_900 },
    headStyles: { fillColor: PDF_BRAND, textColor: PDF_WHITE, fontSize: 6.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: margin, right: margin },
    columnStyles: {
      3: { cellWidth: 120 },
      9: { cellWidth: 85 },
    },
  });
  y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 80;
  y += 12;

  if (y > 480) {
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
    styles: { fontSize: 7, cellPadding: 2.5, textColor: PDF_ZINC_900 },
    headStyles: { fillColor: PDF_BRAND, textColor: PDF_WHITE },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: margin, right: margin },
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    pdfFooter(doc, p, totalPages);
  }

  doc.save(`compras-mes-${monthIso}.pdf`);
}
