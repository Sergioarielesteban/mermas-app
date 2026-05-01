/** Rutas públicas en `/public/logos/` (solo gráficos, sin tipografía inventada para marca). */
export const PRODUCTION_LABEL_MAIN_LOGO_SRC = '/logos/xampa.png';
/** Wordmark vector oficial del proyecto (`logo-chef-one.svg`): máxima nitidez al imprimir; espacio entre palabras en el dibujo del SVG (no raster borroso). */
export const PRODUCTION_LABEL_SECONDARY_LOGO_SRC = '/logos/chefone.svg';

export type LabelConfig = {
  showMainLogo: boolean;
  showChefOneLogo: boolean;
  labelWidth: number;
  labelHeight: number;
  align: 'left' | 'center' | 'right';
};

/** Configuración fija por ahora; en el futuro puede venir de plantilla Supabase / local. */
export const DEFAULT_PRODUCTION_LABEL_CONFIG: LabelConfig = {
  showMainLogo: true,
  showChefOneLogo: true,
  labelWidth: 62,
  labelHeight: 58,
  align: 'center',
};

export function productionLabelAlignClass(align: LabelConfig['align']): string {
  switch (align) {
    case 'left':
      return 'align-left';
    case 'right':
      return 'align-right';
    default:
      return 'align-center';
  }
}

/** CSS para pantalla e impresión; dimensiones y alineación desde `LabelConfig`. */
export function buildProductionLabelPrintCss(cfg: LabelConfig): string {
  const w = cfg.labelWidth;
  const h = cfg.labelHeight;
  return `
        @page {
          size: auto;
          margin: 0;
        }
        @media print {
          .no-print { display: none !important; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .production-label {
            width: ${w}mm !important;
            height: ${h}mm !important;
            min-height: unset !important;
            box-sizing: border-box !important;
            page-break-after: always !important;
            page-break-inside: avoid !important;
            border: 1px solid #000 !important;
            padding: 3mm !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 1.5mm !important;
          }
          .production-label .logo-main,
          .production-label .logo-secondary {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
        .production-label {
          width: ${w}mm;
          height: ${h}mm;
          box-sizing: border-box;
          margin: 0 auto 12px;
          border: 1px solid #000;
          padding: 3mm;
          page-break-after: always;
          font-family: system-ui, -apple-system, sans-serif;
          display: flex;
          flex-direction: column;
          gap: 1.5mm;
        }
        .production-label.align-left { text-align: left; }
        .production-label.align-center { text-align: center; }
        .production-label.align-right { text-align: right; }
        .production-label .logo-main {
          flex-shrink: 0;
          display: block;
          width: auto;
          max-width: 100%;
          height: auto;
          max-height: 16mm;
          object-fit: contain;
        }
        .production-label.align-center .logo-main,
        .production-label.align-center .logo-secondary {
          margin-left: auto;
          margin-right: auto;
        }
        .production-label.align-left .logo-main,
        .production-label.align-left .logo-secondary {
          margin-right: auto;
          margin-left: 0;
        }
        .production-label.align-right .logo-main,
        .production-label.align-right .logo-secondary {
          margin-left: auto;
          margin-right: 0;
        }
        .production-label-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-height: 0;
          text-align: inherit;
        }
        .production-label .logo-secondary {
          flex-shrink: 0;
          display: block;
          width: auto;
          max-width: 72%;
          height: auto;
          max-height: 5.5mm;
          object-fit: contain;
        }
  `;
}
