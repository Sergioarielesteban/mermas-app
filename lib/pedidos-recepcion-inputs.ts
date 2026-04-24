import { unitSupportsReceivedWeightKg, type PedidoOrderItem } from '@/lib/pedidos-supabase';

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

/**
 * €/kg sugerido a partir del precio del pedido (€/unidad de catálogo) y kg estimados por unidad.
 */
export function supplierDefaultPricePerKg(item: PedidoOrderItem): number | null {
  if (!unitSupportsReceivedWeightKg(item.unit)) return null;
  const est = item.estimatedKgPerUnit;
  if (est == null || !Number.isFinite(est) || est <= 0) return null;
  const v = item.pricePerUnit / est;
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * 10000) / 10000;
}
