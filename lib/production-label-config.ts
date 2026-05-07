/** Rutas públicas en `/public/logos/`. */
export const PRODUCTION_LABEL_MAIN_LOGO_SRC = '/logos/xampa.png';
export const PRODUCTION_LABEL_SECONDARY_LOGO_SRC = '/logos/chefone.svg';

export type LabelTemplateId = 'small_62x29' | 'medium_62x50' | 'large_62x80_qr';
export type LabelContext = 'production' | 'central';

export type LabelFieldKey =
  | 'product'
  | 'madeDate'
  | 'expiryDate'
  | 'lot'
  | 'status'
  | 'qr'
  | 'token'
  | 'mainLogo'
  | 'chefOneLogo';

export type LabelTemplate = {
  id: LabelTemplateId;
  name: string;
  shortName: string;
  widthMm: number;
  heightMm: number;
  description: string;
  productFontSizePx: number;
  bodyFontSizePx: number;
  paddingMm: number;
  gapMm: number;
  align: 'left' | 'center';
  fields: Record<LabelFieldKey, boolean>;
};

export const LABEL_TEMPLATES: Record<LabelTemplateId, LabelTemplate> = {
  small_62x29: {
    id: 'small_62x29',
    name: 'Producción diaria · 62 × 29 mm',
    shortName: '62×29',
    widthMm: 62,
    heightMm: 29,
    description: 'Mise en place y producciones del día: producto, elaboración y caducidad.',
    productFontSizePx: 18,
    bodyFontSizePx: 13,
    paddingMm: 1,
    gapMm: 0.5,
    align: 'center',
    fields: {
      product: true,
      madeDate: true,
      expiryDate: true,
      lot: false,
      status: false,
      qr: false,
      token: false,
      mainLogo: false,
      chefOneLogo: false,
    },
  },
  medium_62x50: {
    id: 'medium_62x50',
    name: 'Media · 62 × 50 mm',
    shortName: '62×50',
    widthMm: 62,
    heightMm: 50,
    description: 'Producción con lote, logo y más espacio visual.',
    productFontSizePx: 20,
    bodyFontSizePx: 15,
    paddingMm: 1.5,
    gapMm: 1,
    align: 'center',
    fields: {
      product: true,
      madeDate: true,
      expiryDate: true,
      lot: true,
      status: false,
      qr: false,
      token: false,
      mainLogo: true,
      chefOneLogo: true,
    },
  },
  large_62x80_qr: {
    id: 'large_62x80_qr',
    name: 'Grande QR · 62 × 80 mm',
    shortName: '62×80 QR',
    widthMm: 62,
    heightMm: 80,
    description: 'Cocina central, trazabilidad, lotes, entregas y QR.',
    productFontSizePx: 13,
    bodyFontSizePx: 9,
    paddingMm: 4,
    gapMm: 1.6,
    align: 'center',
    fields: {
      product: true,
      madeDate: true,
      expiryDate: true,
      lot: true,
      status: true,
      qr: true,
      token: true,
      mainLogo: true,
      chefOneLogo: true,
    },
  },
};

export const DEFAULT_LABEL_TEMPLATE_BY_CONTEXT: Record<LabelContext, LabelTemplateId> = {
  production: 'small_62x29',
  central: 'large_62x80_qr',
};

export function getLabelTemplate(id: string | null | undefined, context: LabelContext): LabelTemplate {
  if (id && id in LABEL_TEMPLATES) return LABEL_TEMPLATES[id as LabelTemplateId];
  return LABEL_TEMPLATES[DEFAULT_LABEL_TEMPLATE_BY_CONTEXT[context]];
}

export function labelTemplateStorageKey(context: LabelContext): string {
  return `chefone.label-template.${context}`;
}

export function buildLabelPrintCss(template: LabelTemplate): string {
  const w = template.widthMm;
  const h = template.heightMm;
  const p = template.paddingMm;
  const g = template.gapMm;
  const pf = template.productFontSizePx;
  const bf = template.bodyFontSizePx;
  const qrSize = Math.max(18, Math.min(36, h - 34));

  return `
    /* ── Tamaño de página para la impresora ── */
    @page {
      size: ${w}mm ${h}mm;
      margin: 0;
    }

    /* ── Vista en pantalla ── */
    .label-page-bg {
      background: #f6f4f1;
      min-height: 100dvh;
    }

    .label-sheet {
      width: ${w}mm;
      margin: 0 auto;
      padding: 20px 0;
    }

    .production-label {
      width: ${w}mm;
      height: ${h}mm;
      box-sizing: border-box;
      overflow: hidden;
      margin: 0 auto 14px;
      border: 1px solid #111;
      border-radius: 2px;
      background: #fff;
      padding: ${p}mm;
      font-family: Arial, Helvetica, sans-serif;
      color: #111;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: ${g}mm;
      text-align: center;
    }

    .production-label .label-logo-main {
      max-height: 10mm;
      max-width: 100%;
      object-fit: contain;
      display: block;
    }

    .production-label .label-logo-chefone {
      max-height: 5mm;
      max-width: 68%;
      object-fit: contain;
      display: block;
      opacity: .95;
    }

    .label-product-name {
      width: 100%;
      font-size: ${pf}px;
      line-height: 1.05;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.02em;
      overflow-wrap: anywhere;
      color: #000;
    }

    .label-body-line {
      width: 100%;
      font-size: ${bf}px;
      line-height: 1.15;
      font-weight: 700;
      color: #000;
    }

    .label-body-line span {
      font-weight: 900;
      font-variant-numeric: tabular-nums;
    }

    .label-small-muted {
      width: 100%;
      font-size: ${Math.max(7, bf - 1)}px;
      line-height: 1.1;
      font-weight: 800;
      color: #444;
      overflow-wrap: anywhere;
    }

    .label-qr {
      width: ${qrSize}mm;
      height: ${qrSize}mm;
      object-fit: contain;
      display: block;
    }

    .label-template-card-active {
      border-color: #D71920 !important;
      background: #fff5f5 !important;
      color: #991b1b !important;
    }

    /* ── Impresión ── */
    @media print {
      /* Fuerza colores exactos: sin esto el navegador descarta texto y fondos */
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .no-print {
        display: none !important;
      }

      html, body {
        width: ${w}mm !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        color: #000 !important;
        font-family: Arial, Helvetica, sans-serif !important;
      }

      .label-page-bg {
        background: #fff !important;
        padding: 0 !important;
        margin: 0 !important;
        min-height: 0 !important;
      }

      .label-sheet {
        width: ${w}mm !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      .production-label {
        width: ${w}mm !important;
        height: ${h}mm !important;
        box-sizing: border-box !important;
        margin: 0 !important;
        padding: ${p}mm !important;
        page-break-after: always !important;
        break-after: page !important;
        border: none !important;
        box-shadow: none !important;
        background: #fff !important;
        color: #000 !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: center !important;
        align-items: center !important;
        gap: ${g}mm !important;
        text-align: center !important;
        overflow: visible !important;
        font-family: Arial, Helvetica, sans-serif !important;
      }

      .label-product-name {
        color: #000 !important;
        font-size: ${pf}px !important;
        font-weight: 900 !important;
      }

      .label-body-line {
        color: #000 !important;
        font-size: ${bf}px !important;
        font-weight: 700 !important;
      }

      .label-body-line span {
        color: #000 !important;
        font-weight: 900 !important;
      }

      .label-small-muted {
        color: #444 !important;
        font-size: ${Math.max(7, bf - 1)}px !important;
      }

      .label-logo-main,
      .label-logo-chefone,
      .label-qr {
        display: block !important;
      }
    }
  `;
}
