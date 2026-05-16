import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PedidosRecepcionSummaryPayload } from '@/lib/pedidos-recepcion-summary-build';

type LogoAsset = { dataUrl: string; width: number; height: number };

const BRAND: [number, number, number] = [211, 47, 47];
const Z100: [number, number, number] = [244, 244, 245];
const Z200: [number, number, number] = [228, 228, 231];
const Z400: [number, number, number] = [161, 161, 170];
const Z500: [number, number, number] = [113, 113, 122];
const Z700: [number, number, number] = [63, 63, 70];
const Z900: [number, number, number] = [24, 24, 27];
const EMERALD: [number, number, number] = [5, 150, 105];
const ROSE: [number, number, number] = [225, 29, 72];
const AMBER: [number, number, number] = [217, 119, 6];

const OFFICIAL_CHEF_LOGO_SRC = '/logo-oficial-chef.svg';
let officialLogoPromise: Promise<LogoAsset | null> | null = null;

const money = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

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

function kpiBox(doc: jsPDF, x: number, y: number, w: number, h: number, title: string, value: string, tone = BRAND) {
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 10, 10, 'F');
  doc.setDrawColor(...Z200);
  doc.roundedRect(x, y, w, h, 10, 10, 'S');
  doc.setFillColor(...tone);
  doc.roundedRect(x + 8, y + 8, 4, h - 16, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...Z500);
  doc.text(title.toUpperCase(), x + 18, y + 16);
  doc.setFontSize(16);
  doc.setTextColor(...Z900);
  doc.text(value, x + 18, y + 35);
}

export async function createPedidosRecepcionSummaryPdf(payload: PedidosRecepcionSummaryPayload): Promise<void> {
  const logo = await loadOfficialChefLogo();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  doc.setFillColor(252, 251, 248);
  doc.rect(0, 0, pageW, doc.internal.pageSize.getHeight(), 'F');
  drawOfficialLogo(doc, logo, margin, y - 2, 92);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...Z500);
  doc.text('Recepción completada', pageW - margin, y + 6, { align: 'right' });
  doc.setFontSize(22);
  doc.setTextColor(...Z900);
  doc.text(payload.supplierName, margin, y + 42);
  doc.setFontSize(10);
  doc.setTextColor(...Z700);
  doc.text(`${payload.userDisplayName} · ${payload.completedAtIso.slice(0, 10)}`, pageW - margin, y + 42, {
    align: 'right',
  });
  y += 62;

  const badgeTexts = [
    { text: payload.orderLabel, fill: Z100, color: Z700 },
    { text: `${payload.lineCount} líneas`, fill: Z100, color: Z700 },
    { text: `${payload.linesIncidencia} incidencias`, fill: payload.linesIncidencia > 0 ? [254, 242, 242] : [236, 253, 245], color: payload.linesIncidencia > 0 ? ROSE : EMERALD },
  ] as const;
  let bx = margin;
  for (const b of badgeTexts) {
    const w = Math.max(44, doc.getTextWidth(b.text) + 16);
    doc.setFillColor(b.fill[0], b.fill[1], b.fill[2]);
    doc.roundedRect(bx, y, w, 16, 8, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...b.color);
    doc.text(b.text, bx + w / 2, y + 10.5, { align: 'center' });
    bx += w + 8;
  }
  y += 28;

  const pctOk = payload.lineCount > 0 ? Math.round((payload.linesOk / payload.lineCount) * 100) : 0;
  const pctBad = payload.lineCount > 0 ? Math.round((payload.linesIncidencia / payload.lineCount) * 100) : 0;
  const impactPositive = payload.diffEur >= 0;

  kpiBox(doc, margin, y, 120, 48, 'Líneas', String(payload.lineCount), Z500);
  kpiBox(doc, margin + 128, y, 120, 48, 'Correctas', `${payload.linesOk} · ${pctOk}%`, EMERALD);
  kpiBox(doc, margin + 256, y, 120, 48, 'Incidencias', `${payload.linesIncidencia} · ${pctBad}%`, AMBER);
  kpiBox(
    doc,
    margin + 384,
    y,
    90,
    48,
    'Vs pedido',
    `${impactPositive ? '+' : '−'}${money(Math.abs(payload.diffEur))}`,
    impactPositive ? ROSE : EMERALD,
  );
  y += 62;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...Z900);
  doc.text('Artículos revisados', margin, y);
  y += 10;
  if (payload.incidentRows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Producto', 'Pedido', 'Albarán', 'P. base', 'P. nuevo', 'Δ precio']],
      body: payload.incidentRows.map((row) => [
        row.name,
        row.qtyDeltaLabel,
        row.priceBaseLabel ?? '—',
        row.priceBaseLabel ?? '—',
        row.priceNewLabel ?? '—',
        row.priceDeltaLabel,
      ]),
      margin: { left: margin, right: margin },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, textColor: Z700 },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: Z100 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 5) {
          const t = String(data.cell.raw);
          data.cell.styles.textColor = t.startsWith('−') ? EMERALD : ROSE;
        }
      },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 14;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...Z500);
    doc.text('Sin líneas que requieran revisión.', margin, y + 14);
    y += 24;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...Z900);
  doc.text('Resumen del pedido', margin, y);
  y += 12;
  autoTable(doc, {
    startY: y,
    body: [
      ['Pedido previsto', money(payload.originalTotals.total)],
      ['Recibido real', money(payload.receivedTotals.total)],
      ['Diferencia', `${payload.diffEur >= 0 ? '+' : '−'}${money(Math.abs(payload.diffEur))}`],
      ['Incidencias', String(payload.linesIncidencia)],
    ],
    margin: { left: margin, right: margin },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 4, textColor: Z700 },
    columnStyles: { 0: { cellWidth: 160 }, 1: { cellWidth: 150, halign: 'right' } },
    theme: 'grid',
    head: [],
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 14;

  if (payload.smartAlerts.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...Z900);
    doc.text('Alertas inteligentes', margin, y);
    y += 10;
    autoTable(doc, {
      startY: y,
      body: payload.smartAlerts.map((a) => [a.text]),
      margin: { left: margin, right: margin },
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4, textColor: Z700 },
      alternateRowStyles: { fillColor: Z100 },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const row = payload.smartAlerts[data.row.index];
          if (!row) return;
          data.cell.styles.fillColor =
            row.tone === 'rose'
              ? [254, 242, 242]
              : row.tone === 'amber'
                ? [255, 251, 235]
                : row.tone === 'sky'
                  ? [240, 249, 255]
                  : [236, 253, 245];
        }
      },
    });
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) footer(doc, p, totalPages, logo);
  doc.save(`recepcion-${payload.orderLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`);
}
