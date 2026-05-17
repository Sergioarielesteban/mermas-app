import jsPDF from 'jspdf';
import type { Unit } from '@/lib/types';
import { formatQuantityWithUnit } from '@/lib/pedidos-format';

// ─── Paleta Chef One ────────────────────────────────────────────────────────
const BRAND: [number, number, number] = [211, 47, 47];
const Z50: [number, number, number] = [250, 250, 250];
const Z100: [number, number, number] = [244, 244, 245];
const Z200: [number, number, number] = [228, 228, 231];
const Z400: [number, number, number] = [161, 161, 170];
const Z500: [number, number, number] = [113, 113, 122];
const Z600: [number, number, number] = [82, 82, 91];
const Z900: [number, number, number] = [24, 24, 27];
const WHITE: [number, number, number] = [255, 255, 255];

// ─── Tipos públicos ──────────────────────────────────────────────────────────
export type ConsumoProducto = {
  productName: string;
  quantity: number;
  unit: Unit;
};

export type ConsumoProveedor = {
  supplierName: string;
  logoUrl?: string | null;
  products: ConsumoProducto[];
};

export type ConsumoSemanalPdfInput = {
  localLabel: string;
  periodLabel: string;       // e.g. "Semana 20 · 11 – 17 may 2026"
  generatedAt?: string;      // opcional, se genera automáticamente si no se pasa
  suppliers: ConsumoProveedor[];
};

// ─── Logo Chef One ────────────────────────────────────────────────────────────
const OFFICIAL_CHEF_LOGO_SRC = '/logo-oficial-chef.svg';
let logoCache: Promise<{ dataUrl: string; w: number; h: number } | null> | null = null;

function loadLogo() {
  if (logoCache) return logoCache;
  logoCache = (async () => {
    try {
      if (typeof window === 'undefined' || typeof document === 'undefined') return null;
      const res = await fetch(OFFICIAL_CHEF_LOGO_SRC);
      if (!res.ok) return null;
      const svgText = await res.text();
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
      return { dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
    } catch {
      return null;
    }
  })();
  return logoCache;
}

// ─── Logo proveedor desde URL ─────────────────────────────────────────────────
async function loadSupplierLogo(url: string | null | undefined): Promise<string | null> {
  if (!url || typeof window === 'undefined') return null;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ─── Helpers de layout ───────────────────────────────────────────────────────
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

function drawFooter(doc: jsPDF, page: number, total: number) {
  const y = PAGE_H - 26;
  doc.setDrawColor(...Z200);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y - 6, PAGE_W - MARGIN, y - 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...Z400);
  const ts = new Date().toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  doc.text(`Generado: ${ts}`, MARGIN + 22, y);
  doc.text(`Página ${page} / ${total}`, PAGE_W - MARGIN, y, { align: 'right' });
  doc.setTextColor(...Z900);
}

// ─── Generador principal ──────────────────────────────────────────────────────
export async function generateConsumoSemanalPdf(input: ConsumoSemanalPdfInput): Promise<void> {
  const { localLabel, periodLabel, suppliers } = input;

  const [chefLogo, ...supplierLogos] = await Promise.all([
    loadLogo(),
    ...suppliers.map((s) => loadSupplierLogo(s.logoUrl)),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  doc.setLanguage('es');

  let y = MARGIN;

  // ── Cabecera ──────────────────────────────────────────────────────────────
  const HEADER_H = 64;

  doc.setFillColor(...WHITE);
  doc.rect(0, 0, PAGE_W, HEADER_H, 'F');
  doc.setDrawColor(...Z200);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, HEADER_H, PAGE_W - MARGIN, HEADER_H);

  if (chefLogo) {
    doc.addImage(chefLogo.dataUrl, 'PNG', MARGIN, 14, 88, 21);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...BRAND);
    doc.text('CHEF-ONE', MARGIN, 28);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...Z500);
  doc.text(localLabel.toUpperCase(), PAGE_W - MARGIN, 24, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...Z400);
  doc.text('RESUMEN OPERATIVO DE COMPRAS', PAGE_W - MARGIN, 38, { align: 'right' });

  y = HEADER_H + 22;

  // Título principal del documento
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...Z900);
  doc.text('Resumen semanal de artículos', MARGIN, y);
  y += 16;

  // Sublínea: periodo
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...Z600);
  doc.text(periodLabel, MARGIN, y);
  y += 24;

  // Línea divisoria bajo la cabecera
  doc.setDrawColor(...Z200);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 16;

  // ── Resumen de totales ────────────────────────────────────────────────────
  const totalProducts = suppliers.reduce((n, s) => n + s.products.length, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...Z400);
  doc.text(
    `${suppliers.length} proveedor${suppliers.length !== 1 ? 'es' : ''} · ${totalProducts} artículo${totalProducts !== 1 ? 's' : ''}`,
    MARGIN,
    y,
  );
  y += 20;

  // ── Bloques por proveedor ─────────────────────────────────────────────────
  const SUPPLIER_BLOCK_MIN = 56;  // altura mínima estimada por proveedor (header)
  const PRODUCT_ROW_H = 22;       // altura por línea de producto
  const TWO_COL_THRESHOLD = 8;    // si hay más de N productos, doble columna
  const FOOTER_H = 40;

  let page = 1;
  const allPages: (() => void)[] = [];

  function ensureSpace(needed: number) {
    if (y + needed > PAGE_H - FOOTER_H - MARGIN) {
      allPages.push(() => drawFooter(doc, page, 0));
      doc.addPage();
      page++;
      y = MARGIN + 10;
    }
  }

  for (let si = 0; si < suppliers.length; si++) {
    const supplier = suppliers[si]!;
    const logoData = supplierLogos[si] ?? null;
    const products = supplier.products;
    const useTwoCol = products.length > TWO_COL_THRESHOLD;
    const rows = useTwoCol ? Math.ceil(products.length / 2) : products.length;
    const blockH = SUPPLIER_BLOCK_MIN + rows * PRODUCT_ROW_H + 12;

    ensureSpace(Math.min(blockH, PAGE_H - FOOTER_H - MARGIN - 30));

    // ── Header proveedor ────────────────────────────────────────────────────
    const headerH = 40;
    doc.setFillColor(...Z50);
    doc.roundedRect(MARGIN, y, CONTENT_W, headerH, 6, 6, 'F');

    // Logo proveedor (circular simulado)
    const logoSize = 26;
    const logoX = MARGIN + 10;
    const logoY = y + (headerH - logoSize) / 2;

    if (logoData) {
      // Clip circular
      doc.saveGraphicsState();
      doc.setFillColor(...WHITE);
      doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 1, 'F');
      doc.addImage(logoData, 'JPEG', logoX, logoY, logoSize, logoSize);
      doc.restoreGraphicsState();
    } else {
      // Iniciales
      const initials = supplier.supplierName
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0] ?? '')
        .join('')
        .toUpperCase()
        .slice(0, 2);
      doc.setFillColor(...BRAND);
      doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...WHITE);
      doc.text(initials, logoX + logoSize / 2, logoY + logoSize / 2 + 3, { align: 'center' });
    }

    // Nombre proveedor
    const nameX = logoX + logoSize + 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...Z900);
    const maxNameW = CONTENT_W - (nameX - MARGIN) - 80;
    const nameStr = doc.splitTextToSize(supplier.supplierName, maxNameW)[0] as string;
    doc.text(nameStr, nameX, y + 18);

    // Subtitle: nº artículos
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...Z400);
    doc.text(`${products.length} artículo${products.length !== 1 ? 's' : ''}`, nameX, y + 30);

    // Línea roja breve izq del header
    doc.setFillColor(...BRAND);
    doc.rect(MARGIN, y, 3, headerH, 'F');

    y += headerH + 6;

    // ── Lista de productos ──────────────────────────────────────────────────
    const colW = useTwoCol ? (CONTENT_W - 8) / 2 : CONTENT_W;

    for (let pi = 0; pi < products.length; pi++) {
      const col = useTwoCol ? pi % 2 : 0;
      const rowIdx = useTwoCol ? Math.floor(pi / 2) : pi;
      const rowY = y + rowIdx * PRODUCT_ROW_H;
      const rowX = MARGIN + col * (colW + 8);

      if (pi === 0 || (useTwoCol ? pi === 1 : false)) {
        // primera fila: verificar espacio
      }
      if (!useTwoCol && pi > 0 && y + rowIdx * PRODUCT_ROW_H + PRODUCT_ROW_H > PAGE_H - FOOTER_H - MARGIN) {
        // salto de página dentro del mismo proveedor — poco probable pero preventivo
        ensureSpace(PRODUCT_ROW_H);
        y = y; // ensureSpace actualiza y si hace falta
      }

      // Fondo alterno muy suave para las filas impares
      if (rowIdx % 2 === 1) {
        doc.setFillColor(...Z100);
        doc.rect(rowX, rowY - 2, colW, PRODUCT_ROW_H, 'F');
      }

      // Nombre producto
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...Z900);
      const maxProdW = colW * 0.65;
      const prodStr = doc.splitTextToSize(products[pi]!.productName, maxProdW)[0] as string;
      doc.text(prodStr, rowX + 8, rowY + 13);

      // Cantidad + unidad (derecha)
      const qtyStr = formatQuantityWithUnit(products[pi]!.quantity, products[pi]!.unit);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...BRAND);
      doc.text(qtyStr, rowX + colW - 8, rowY + 13, { align: 'right' });

      // Separador ligero (solo columna izquierda en doble col)
      if (!useTwoCol || col === 0) {
        doc.setDrawColor(...Z200);
        doc.setLineWidth(0.3);
        doc.line(rowX + 6, rowY + PRODUCT_ROW_H - 2, rowX + colW - 6, rowY + PRODUCT_ROW_H - 2);
      }
    }

    const totalRows = useTwoCol ? Math.ceil(products.length / 2) : products.length;
    y += totalRows * PRODUCT_ROW_H + 18;
  }

  // ── Pies de página ─────────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, p, totalPages);
  }

  // ── Guardar ────────────────────────────────────────────────────────────────
  const slug = periodLabel
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  doc.save(`consumo-${slug || 'periodo'}.pdf`);
}
