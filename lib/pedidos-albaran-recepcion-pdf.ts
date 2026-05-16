import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DeliveryNote, DeliveryNoteIncident, DeliveryNoteItem } from '@/lib/delivery-notes-supabase';
import type { PedidoOrder } from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';

type LogoAsset = { dataUrl: string; width: number; height: number };
type DocWithTable = jsPDF & { lastAutoTable?: { finalY?: number } };

const BRAND: [number, number, number] = [211, 47, 47];
const Z100: [number, number, number] = [244, 244, 245];
const Z200: [number, number, number] = [228, 228, 231];
const Z400: [number, number, number] = [161, 161, 170];
const Z500: [number, number, number] = [113, 113, 122];
const Z700: [number, number, number] = [63, 63, 70];
const Z900: [number, number, number] = [24, 24, 27];
const EMERALD: [number, number, number] = [5, 150, 105];
const AMBER: [number, number, number] = [217, 119, 6];
const ROSE: [number, number, number] = [225, 29, 72];

const OFFICIAL_CHEF_LOGO_SRC = '/logo-oficial-chef.svg';
let officialLogoPromise: Promise<LogoAsset | null> | null = null;

const money = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-ES');
}

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
    doc.text('CHEF-ONE', x, y + 12);
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
  doc.text(
    new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' }),
    112,
    pageH - 18,
  );
  doc.text(`Página ${page}/${total}`, doc.internal.pageSize.getWidth() - 40, pageH - 18, { align: 'right' });
}

function drawBadge(
  doc: jsPDF,
  x: number,
  y: number,
  text: string,
  fill: [number, number, number],
  textColor: [number, number, number] = Z900,
): number {
  const w = Math.max(34, doc.getTextWidth(text) + 14);
  doc.setFillColor(...fill);
  doc.roundedRect(x, y, w, 16, 8, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...textColor);
  doc.text(text, x + w / 2, y + 10.5, { align: 'center' });
  return w;
}

function sectionTitle(doc: jsPDF, x: number, y: number, title: string, subtitle?: string): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...Z900);
  doc.text(title, x, y);
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...Z500);
    doc.text(subtitle, x, y + 11);
    return y + 20;
  }
  return y + 14;
}

function card(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 10, 10, 'F');
  doc.setDrawColor(...Z200);
  doc.roundedRect(x, y, w, h, 10, 10, 'S');
}

function lineMoney(value?: number | null): string {
  return value == null ? '—' : money(value);
}

function unitQty(value?: number | null, unit?: Unit | null): string {
  if (value == null) return '—';
  return `${value.toLocaleString('es-ES', { maximumFractionDigits: 2 })} ${unit ?? ''}`.trim();
}

export type PedidosAlbaranRecepcionPdfInput = {
  localLabel: string;
  note: DeliveryNote;
  items: DeliveryNoteItem[];
  incidents: DeliveryNoteIncident[];
  order?: PedidoOrder | null;
  accountingPreview?: {
    bookkeepingMonth: string | null;
    currency: string;
    headerTotal: number | null;
    computedLinesTotal: number | null;
    status: string;
    relatedOrderId: string | null;
  } | null;
};

export async function createPedidosAlbaranRecepcionPdf(
  input: PedidosAlbaranRecepcionPdfInput,
): Promise<void> {
  const logo = await loadOfficialChefLogo();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' }) as DocWithTable;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  doc.setFillColor(252, 251, 248);
  doc.rect(0, 0, pageW, pageH, 'F');
  drawOfficialLogo(doc, logo, margin, y - 2, 92);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...Z500);
  doc.text('Informe de recepción', pageW - margin, y + 6, { align: 'right' });
  doc.setFontSize(22);
  doc.setTextColor(...Z900);
  doc.text(input.note.supplierName || 'Proveedor', margin, y + 42);
  y += 58;

  const badgesY = y;
  let bx = margin;
  bx += drawBadge(doc, bx, badgesY, input.note.status.toUpperCase(), input.note.status === 'validated' ? EMERALD : AMBER, Z900) + 8;
  bx += drawBadge(doc, bx, badgesY, fmtDate(input.note.deliveryDate), Z100, Z700) + 8;
  bx += drawBadge(doc, bx, badgesY, input.note.deliveryNoteNumber || 'SIN NÚMERO', Z100, Z700) + 8;
  if (input.order?.supplierName) {
    drawBadge(doc, bx, badgesY, 'Pedido vinculado', [224, 242, 254], [30, 64, 175]);
  }
  y += 30;

  card(doc, margin, y, pageW - margin * 2, 86);
  y += 12;
  const topY = y;
  const cols = [
    { label: 'Proveedor', value: input.note.supplierName || '—' },
    { label: 'Fecha albarán', value: fmtDate(input.note.deliveryDate) },
    { label: 'Nº albarán', value: input.note.deliveryNoteNumber || '—' },
    { label: 'Pedido', value: input.order?.id ?? input.note.relatedOrderId ?? '—' },
  ];
  cols.forEach((c, i) => {
    const x = margin + (i % 2) * ((pageW - margin * 2 - 12) / 2 + 12);
    const yy = topY + Math.floor(i / 2) * 34;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...Z500);
    doc.text(c.label.toUpperCase(), x, yy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...Z900);
    doc.text(c.value, x, yy + 14);
  });
  y += 94;

  if (input.accountingPreview) {
    y = sectionTitle(doc, margin, y, 'Resumen contable', 'Datos para informes y conciliación.');
    const cards = [
      ['Mes', input.accountingPreview.bookkeepingMonth ?? '—'],
      ['Total cabecera', lineMoney(input.accountingPreview.headerTotal)],
      ['Suma líneas', lineMoney(input.accountingPreview.computedLinesTotal)],
      ['Estado', input.accountingPreview.status],
    ];
    cards.forEach((c, i) => {
      const x = margin + (i % 2) * ((pageW - margin * 2 - 12) / 2 + 12);
      const yy = y + Math.floor(i / 2) * 44;
      card(doc, x, yy, (pageW - margin * 2 - 12) / 2, 38);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...Z500);
      doc.text(c[0].toUpperCase(), x + 10, yy + 13);
      doc.setFontSize(13);
      doc.setTextColor(...Z900);
      doc.text(c[1], x + 10, yy + 28);
    });
    y += 92;
  }

  y = sectionTitle(doc, margin, y, 'Pedido vs albarán', input.order ? 'Comparación sobre el pedido vinculado.' : 'Sin pedido vinculado.');
  if (input.order) {
    const rows = input.order.items.map((oi) => {
      const ni = input.items.find((it) => it.matchedOrderItemId === oi.id) ?? null;
      const qOrd = oi.quantity;
      const qAlb = ni?.quantity ?? null;
      const pOrd = oi.pricePerUnit;
      const pAlb = ni?.unitPrice ?? null;
      const deltaQty = qAlb == null ? '—' : `${(qAlb - qOrd).toLocaleString('es-ES', { maximumFractionDigits: 2 })}`;
      const deltaPrice = pAlb == null ? '—' : money((pAlb - pOrd) * (qAlb ?? qOrd));
      return [
        oi.productName,
        unitQty(qOrd, oi.unit),
        unitQty(qAlb, oi.unit),
        lineMoney(pOrd),
        lineMoney(pAlb),
        deltaQty,
        deltaPrice,
      ];
    });
    autoTable(doc, {
      startY: y,
      head: [['Producto', 'Pedido', 'Albarán', 'P. pedido', 'P. albarán', 'Dif. qty', 'Dif. €']],
      body: rows,
      margin: { left: margin, right: margin },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, textColor: Z700 },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: Z100 },
      columnStyles: { 0: { cellWidth: 150 } },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 14;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...Z500);
    doc.text('No hay pedido vinculado para comparar.', margin, y + 14);
    y += 28;
  }

  y = sectionTitle(doc, margin, y, 'Líneas recibidas', `${input.items.length} línea${input.items.length === 1 ? '' : 's'}.`);
  autoTable(doc, {
    startY: y,
    head: [['Producto', 'Cant.', 'Ud.', 'P. unit.', 'Subtotal', 'Estado']],
    body: input.items.map((it) => [
      it.supplierProductName || '—',
      it.quantity.toLocaleString('es-ES', { maximumFractionDigits: 2 }),
      it.unit || '—',
      lineMoney(it.unitPrice),
      lineMoney(it.lineSubtotal),
      it.matchStatus ?? '—',
    ]),
    margin: { left: margin, right: margin },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, textColor: Z700 },
    headStyles: { fillColor: Z900, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: Z100 },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 14;

  y = sectionTitle(doc, margin, y, 'Incidencias', `${input.incidents.length} registrada${input.incidents.length === 1 ? '' : 's'}.`);
  if (input.incidents.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Tipo', 'Estado', 'Descripción', 'Resolución']],
      body: input.incidents.map((inc) => [
        inc.incidentType,
        inc.status === 'open' ? 'Abierta' : 'Resuelta',
        inc.description,
        inc.resolutionComment ?? '—',
      ]),
      margin: { left: margin, right: margin },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, textColor: Z700 },
      headStyles: { fillColor: ROSE, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: Z100 },
    });
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...Z500);
    doc.text('Sin incidencias registradas.', margin, y + 14);
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) footer(doc, p, totalPages, logo);
  doc.save(`informe-recepcion-${input.note.deliveryNoteNumber || input.note.id}.pdf`);
}
