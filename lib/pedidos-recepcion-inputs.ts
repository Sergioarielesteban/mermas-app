import {
  unitCanDeclareScaleKgOnReception,
  unitSupportsReceivedWeightKg,
  type PedidoOrderItem,
} from '@/lib/pedidos-supabase';

export type EuroPerKgSuggestionSource =
  | 'article_master'
  | 'last_reception'
  | 'avg_reception_pmp'
  | 'order_billing_kg'
  | 'supplier_catalog_billing_kg';

export type EuroPerKgResolutionOpts = {
  articleEuroPerKg?: number | null;
  lastReceptionEuroPerKg?: number | null;
  avgReceivedEuroPerKg?: number | null;
  liveCatalogBillingEuroPerKg?: number | null;
};

function roundPpk(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * €/kg de referencia para recepción (sin dividir precio de envase entre kg estimados: eso inventaba valores).
 * Prioridad: artículo máster → última recepción → PMP recepciones → snapshot pedido (factura kg) → catálogo vivo €/kg.
 */
export function resolveEuroPerKgSuggestion(
  item: PedidoOrderItem,
  opts: EuroPerKgResolutionOpts = {},
): { value: number | null; source: EuroPerKgSuggestionSource | null } {
  if (!unitSupportsReceivedWeightKg(item.unit)) {
    return { value: null, source: null };
  }

  const article = opts.articleEuroPerKg;
  if (article != null && Number.isFinite(article) && article > 0) {
    return { value: roundPpk(article), source: 'article_master' };
  }

  const lastRecv = opts.lastReceptionEuroPerKg;
  if (lastRecv != null && Number.isFinite(lastRecv) && lastRecv > 0) {
    return { value: roundPpk(lastRecv), source: 'last_reception' };
  }

  const pmp = opts.avgReceivedEuroPerKg;
  if (pmp != null && Number.isFinite(pmp) && pmp > 0) {
    return { value: roundPpk(pmp), source: 'avg_reception_pmp' };
  }

  if (
    item.billingUnit === 'kg' &&
    item.pricePerBillingUnit != null &&
    Number.isFinite(item.pricePerBillingUnit) &&
    item.pricePerBillingUnit > 0
  ) {
    return { value: roundPpk(item.pricePerBillingUnit), source: 'order_billing_kg' };
  }

  const live = opts.liveCatalogBillingEuroPerKg;
  if (live != null && Number.isFinite(live) && live > 0) {
    return { value: roundPpk(live), source: 'supplier_catalog_billing_kg' };
  }

  return { value: null, source: null };
}

export function euroPerKgSuggestionHint(source: EuroPerKgSuggestionSource | null): string {
  switch (source) {
    case 'article_master':
      return 'Precio referencia: artículo base / máster (€/kg).';
    case 'last_reception':
      return 'Precio referencia: última recepción con €/kg en este producto.';
    case 'avg_reception_pmp':
      return 'Precio referencia: media de €/kg en recepciones anteriores (PMP).';
    case 'order_billing_kg':
      return 'Precio referencia: €/kg del pedido (facturación por kg al enviar).';
    case 'supplier_catalog_billing_kg':
      return 'Precio referencia: €/kg actual en catálogo proveedor (factura por kg).';
    default:
      return '';
  }
}

export function formatPpkInputDisplay(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

/** Texto del input de kg en recepción (locale es-ES). */
export function formatKgInputDisplay(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

/**
 * Kg a mostrar/precargar en recepción: peso guardado, o estimado total (cantidad × kg/unidad), o kg pedidos si la línea es en kg.
 */
export function getDefaultReceivedKgNumeric(item: PedidoOrderItem): number | null {
  if (!unitCanDeclareScaleKgOnReception(item.unit)) return null;
  if (item.receivedWeightKg != null && item.receivedWeightKg > 0) {
    return Math.round(item.receivedWeightKg * 1000) / 1000;
  }
  if (
    unitSupportsReceivedWeightKg(item.unit) &&
    item.estimatedKgPerUnit != null &&
    item.estimatedKgPerUnit > 0 &&
    item.quantity > 0
  ) {
    return Math.round(item.quantity * item.estimatedKgPerUnit * 1000) / 1000;
  }
  if (item.unit === 'kg' && item.quantity > 0) {
    return Math.round(item.quantity * 1000) / 1000;
  }
  return null;
}

export function parseReceivedKg(raw: string): number | null | 'invalid' {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return Math.round(n * 1000) / 1000;
}

export function parsePricePerKg(raw: string): number | null | 'invalid' {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return Math.round(n * 10000) / 10000;
}

/** Valor numérico positivo mientras se escribe (ignora borrador incompleto). */
export function tryParseReceivedKgPreview(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (t === '' || t === '.' || t === '-') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1000) / 1000;
}

/** @deprecated Usar resolveEuroPerKgSuggestion con datos reales; sin opts no hay sugerencia inventada. */
export function supplierDefaultPricePerKg(item: PedidoOrderItem): number | null {
  return resolveEuroPerKgSuggestion(item, {}).value;
}
