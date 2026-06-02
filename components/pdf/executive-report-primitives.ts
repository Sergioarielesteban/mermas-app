import jsPDF from 'jspdf';

export type PdfRgb = [number, number, number];
export type PdfLogoAsset = { dataUrl: string; width: number; height: number };

export const EXEC_PDF = {
  ink: [18, 14, 10] as PdfRgb,
  muted: [116, 108, 98] as PdfRgb,
  line: [226, 220, 212] as PdfRgb,
  soft: [248, 245, 241] as PdfRgb,
  white: [255, 255, 255] as PdfRgb,
  red: [196, 83, 31] as PdfRgb,
  olive: [74, 107, 58] as PdfRgb,
  amber: [184, 135, 42] as PdfRgb,
  danger: [190, 54, 45] as PdfRgb,
  blue: [49, 88, 125] as PdfRgb,
};

let officialLogoPromise: Promise<PdfLogoAsset | null> | null = null;

export async function loadExecutiveReportLogo(): Promise<PdfLogoAsset | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (officialLogoPromise) return officialLogoPromise;

  officialLogoPromise = (async () => {
    try {
      const response = await fetch('/logo-oficial-chef.svg');
      if (!response.ok) return null;
      const svgText = (await response.text()).replace(/<rect\b[^>]*fill="#ffffff"[^>]*\/>/gi, '');
      const image = new Image();
      const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      const loaded = await new Promise<HTMLImageElement | null>((resolve) => {
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
      });
      if (!loaded || loaded.naturalWidth <= 0 || loaded.naturalHeight <= 0) return null;

      const canvas = document.createElement('canvas');
      canvas.width = 538;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const sx = (53 / 375) * loaded.naturalWidth;
      const sy = (154 / 375) * loaded.naturalHeight;
      const sw = (269 / 375) * loaded.naturalWidth;
      const sh = (64 / 375) * loaded.naturalHeight;
      ctx.drawImage(loaded, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
    } catch {
      return null;
    }
  })();

  return officialLogoPromise;
}

export function drawExecutiveLogo(
  doc: jsPDF,
  logo: PdfLogoAsset | null,
  x: number,
  y: number,
  width: number,
): void {
  if (logo) {
    doc.addImage(logo.dataUrl, 'PNG', x, y, width, (width * logo.height) / logo.width);
    return;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...EXEC_PDF.red);
  doc.text('Chef One', x, y + 14);
}

export function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`;
}

export function compactNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('es-ES', { maximumFractionDigits: 0 });
}

export function fcColor(value: number | null | undefined): PdfRgb {
  if (value == null) return EXEC_PDF.muted;
  if (value < 30) return EXEC_PDF.olive;
  if (value <= 35) return EXEC_PDF.amber;
  return EXEC_PDF.danger;
}

export function card(doc: jsPDF, x: number, y: number, w: number, h: number, fill: PdfRgb = EXEC_PDF.white): void {
  doc.setFillColor(...fill);
  doc.setDrawColor(...EXEC_PDF.line);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, w, h, 8, 8, 'FD');
}

export function sectionTitle(doc: jsPDF, title: string, x: number, y: number, width: number): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(...EXEC_PDF.red);
  doc.text(title.toUpperCase(), x, y);
  const tw = doc.getTextWidth(title.toUpperCase()) as number;
  doc.setDrawColor(...EXEC_PDF.line);
  doc.setLineWidth(0.3);
  doc.line(x + tw + 7, y - 2, x + width, y - 2);
}

export function truncate(doc: jsPDF, value: string, width: number): string {
  const clean = value.trim() || '—';
  if ((doc.getTextWidth(clean) as number) <= width) return clean;
  let out = clean;
  while (out.length > 1 && (doc.getTextWidth(`${out}…`) as number) > width) {
    out = out.slice(0, -1);
  }
  return `${out.trim()}…`;
}
