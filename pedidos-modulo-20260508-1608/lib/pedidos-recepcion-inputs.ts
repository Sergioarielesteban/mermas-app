import {
  defaultReceivedWeightKgFromEstimate,
  defaultReceivedOrderQuantityForReception,
  receptionBillsByWeight,
  type PedidoOrderItem,
} from '@/lib/pedidos-supabase';

export type EuroPerKgSuggestionSource =
  | 'order_billing_kg'
  | 'order_line_implied_kg'
  | 'article_master'
  | 'last_reception'
  | 'avg_reception_pmp'
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
 * €/kg del propio pedido (línea actual): primero snapshot de facturación, si no, precio envase ÷ kg/unidad del catálogo al pedir.
 */
function orderLinePreferredEuroPerKg(
  item: PedidoOrderItem,
): { value: number; source: 'order_billing_kg' | 'order_line_implied_kg' } | null {
  if (!receptionBillsByWeight(item) || item.unit === 'kg') {
    return null;
  }

  if (
    item.billingUnit === 'kg' &&
    item.pricePerBillingUnit != null &&
    Number.isFinite(item.pricePerBillingUnit) &&
    item.pricePerBillingUnit > 0
  ) {
    return { value: roundPpk(item.pricePerBillingUnit), source: 'order_billing_kg' };
  }

  if (
    item.estimatedKgPerUnit != null &&
    Number.isFinite(item.estimatedKgPerUnit) &&
    item.estimatedKgPerUnit > 0
  ) {
    const box = item.basePricePerUnit ?? item.pricePerUnit;
    if (Number.isFinite(box) && box > 0) {
      return { value: roundPpk(box / item.estimatedKgPerUnit), source: 'order_line_implied_kg' };
    }
  }

  return null;
}

/**
 * €/kg de referencia para recepción.
 * Prioridad: **línea del pedido** (€/kg guardado o precio envase / kg estimado) → artículo máster → última recepción → PMP → catálogo vivo.
 * Nunca mezclar con otra línea: históricos van por `supplierProductId` en opts pero solo si no hay dato en la línea.
 */
export function resolveEuroPerKgSuggestion(
  item: PedidoOrderItem,
  opts: EuroPerKgResolutionOpts = {},
): { value: number | null; source: EuroPerKgSuggestionSource | null } {
  if (!receptionBillsByWeight(item)) {
    return { value: null, source: null };
  }

  const fromLine = orderLinePreferredEuroPerKg(item);
  if (fromLine) {
    return { value: fromLine.value, source: fromLine.source };
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

  const live = opts.liveCatalogBillingEuroPerKg;
  if (live != null && Number.isFinite(live) && live > 0) {
    return { value: roundPpk(live), source: 'supplier_catalog_billing_kg' };
  }

  return { value: null, source: null };
}

export function euroPerKgSuggestionHint(source: EuroPerKgSuggestionSource | null): string {
  switch (source) {
    case 'order_billing_kg':
      return 'Precio referencia: €/kg del pedido (facturación por kg al enviar).';
    case 'order_line_implied_kg':
      return 'Precio referencia: €/kg del pedido (precio envase ÷ kg/unidad de la línea).';
    case 'article_master':
      return 'Precio referencia: artículo base / máster (€/kg).';
    case 'last_reception':
      return 'Precio referencia: última recepción con €/kg en este producto.';
    case 'avg_reception_pmp':
      return 'Precio referencia: media de €/kg en recepciones anteriores (PMP).';
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
  if (!receptionBillsByWeight(item)) return null;
  if (item.receivedWeightKg != null && item.receivedWeightKg > 0) {
    return Math.round(item.receivedWeightKg * 1000) / 1000;
  }
  return defaultReceivedWeightKgFromEstimate(item);
}

export function getDefaultReceivedOrderQtyNumeric(item: PedidoOrderItem): number {
  return defaultReceivedOrderQuantityForReception(item);
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
