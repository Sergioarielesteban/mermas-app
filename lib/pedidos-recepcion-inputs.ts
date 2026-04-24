import { unitSupportsReceivedWeightKg, type PedidoOrderItem } from '@/lib/pedidos-supabase';

export type EuroPerKgSuggestionSource = 'last_reception' | 'last_order' | 'order_price' | 'base_price';

function roundPpk(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * €/kg sugerido para recepción (prioridad: última recepción → último precio unitario en pedidos → pedido actual → base).
 */
export function resolveEuroPerKgSuggestion(
  item: PedidoOrderItem,
  lastReceptionEuroPerKg?: number | null,
  lastOrderUnitPrice?: number | null,
): { value: number | null; source: EuroPerKgSuggestionSource | null } {
  if (!unitSupportsReceivedWeightKg(item.unit)) {
    return { value: null, source: null };
  }
  if (lastReceptionEuroPerKg != null && Number.isFinite(lastReceptionEuroPerKg) && lastReceptionEuroPerKg > 0) {
    return { value: roundPpk(lastReceptionEuroPerKg), source: 'last_reception' };
  }
  const est = item.estimatedKgPerUnit;
  if (est == null || !Number.isFinite(est) || est <= 0) {
    return { value: null, source: null };
  }
  if (lastOrderUnitPrice != null && Number.isFinite(lastOrderUnitPrice) && lastOrderUnitPrice > 0) {
    const v = lastOrderUnitPrice / est;
    if (Number.isFinite(v) && v > 0) return { value: roundPpk(v), source: 'last_order' };
  }
  if (item.pricePerUnit > 0) {
    const v = item.pricePerUnit / est;
    if (Number.isFinite(v) && v > 0) return { value: roundPpk(v), source: 'order_price' };
  }
  if (item.basePricePerUnit != null && item.basePricePerUnit > 0) {
    const v = item.basePricePerUnit / est;
    if (Number.isFinite(v) && v > 0) return { value: roundPpk(v), source: 'base_price' };
  }
  return { value: null, source: null };
}

export function euroPerKgSuggestionHint(source: EuroPerKgSuggestionSource | null): string {
  switch (source) {
    case 'last_reception':
      return 'Precio sugerido según última recepción con €/kg.';
    case 'last_order':
      return 'Precio sugerido basado en último pedido.';
    case 'order_price':
      return 'Precio estimado a partir del pedido actual.';
    case 'base_price':
      return 'Precio sugerido a partir del precio base del catálogo.';
    default:
      return '';
  }
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

/** @deprecated Usar resolveEuroPerKgSuggestion; se mantiene por compatibilidad puntual. */
export function supplierDefaultPricePerKg(item: PedidoOrderItem): number | null {
  return resolveEuroPerKgSuggestion(item, null, null).value;
}
