import {
  billingQuantityForLine,
  receptionLineTotals,
  unitSupportsReceivedWeightKg,
  type PedidoOrder,
} from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';

const UNIT_WORD: Record<Unit, { one: string; many: string }> = {
  kg: { one: 'kg', many: 'kg' },
  ud: { one: 'unidad', many: 'unidades' },
  caja: { one: 'caja', many: 'cajas' },
  bandeja: { one: 'bandeja', many: 'bandejas' },
  bolsa: { one: 'bolsa', many: 'bolsas' },
  paquete: { one: 'paquete', many: 'paquetes' },
  racion: { one: 'ración', many: 'raciones' },
};

/** True si la cantidad se muestra como singular (1, 1,0…). */
export function isQuantitySingular(quantity: number): boolean {
  return Math.abs(quantity - 1) < 1e-6;
}

/** Palabra de unidad en singular o plural según la cantidad. */
export function pluralUnitWord(unit: Unit, quantity: number): string {
  return isQuantitySingular(quantity) ? UNIT_WORD[unit].one : UNIT_WORD[unit].many;
}

/** "3 cajas", "1 caja", "2,5 kg" para textos de pedido/recepción. */
export function formatQuantityWithUnit(quantity: number, unit: Unit): string {
  const word = pluralUnitWord(unit, quantity);
  const rounded = Math.round(quantity * 100) / 100;
  const formatted =
    unit === 'kg'
      ? rounded.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
      : Number.isInteger(rounded) || Math.abs(rounded - Math.round(rounded)) < 1e-6
        ? String(Math.round(rounded))
        : rounded.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${formatted} ${word}`;
}

/** Sufijo "precio por" en catálogo (siempre forma corta singular: €/caja). */
export const unitPriceCatalogSuffix: Record<Unit, string> = {
  kg: 'kg',
  ud: 'ud',
  caja: 'caja',
  bandeja: 'bandeja',
  bolsa: 'bolsa',
  paquete: 'paquete',
  racion: 'ración',
};

export function formatIncidentLine(input: {
  incidentType?: 'missing' | 'damaged' | 'wrong-item' | null;
  incidentNotes?: string;
}): string | null {
  const notes = input.incidentNotes?.trim();
  if (!input.incidentType && !notes) return null;
  const typeLabel =
    input.incidentType === 'missing'
      ? 'No recibido / falta'
      : input.incidentType === 'damaged'
        ? 'Incidencia'
        : input.incidentType === 'wrong-item'
          ? 'Artículo incorrecto'
          : null;
  if (typeLabel && notes) return `${typeLabel}: ${notes}`;
  if (notes) return notes;
  return typeLabel;
}

export function orderItemHasIncident(item: PedidoOrder['items'][number]): boolean {
  return Boolean(item.incidentType) || Boolean(item.incidentNotes?.trim());
}

/**
 * Subtotal mostrado en listas / totales de pedido: si hay incidencia, el albarán puede tener `lineTotal` en 0;
 * se usa el valor del pedido original (precio × cantidad pedida).
 */
export function lineSubtotalForOrderListDisplay(item: PedidoOrder['items'][number]): number {
  if (orderItemHasIncident(item)) {
    return Math.round(item.pricePerUnit * item.quantity * 100) / 100;
  }
  if (item.lineTotal > 0) return item.lineTotal;
  const billed = billingQuantityForLine(item);
  const effQty = billed > 0 ? billed : item.quantity;
  if (effQty > 0 && item.pricePerUnit >= 0) {
    return Math.round(item.pricePerUnit * effQty * 100) / 100;
  }
  return item.lineTotal;
}

/** Resumen legible pedido / recepción / precio cobrado / total (alineado con `receptionLineTotals` y subtotal de lista). */
export type ReceptionBillingSummary = {
  pedido: string;
  recibido: string;
  precioAplicado: string;
  /** Si el cobro es €/kg, equivalencia en €/unidad de catálogo (coherente con histórico/PMP). */
  precioEquivCatalogo?: string;
  totalLinea: string;
};

export function receptionBillingSummary(item: PedidoOrder['items'][number]): ReceptionBillingSummary {
  const pedido = formatQuantityWithUnit(item.quantity, item.unit);
  const suf = unitPriceCatalogSuffix[item.unit];

  let recibido: string;
  if (item.incidentType === 'missing') {
    recibido = 'No recibido';
  } else if (item.unit === 'kg') {
    if (item.receivedWeightKg != null && item.receivedWeightKg > 0) {
      recibido = `${item.receivedWeightKg.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} kg`;
    } else {
      recibido = formatQuantityWithUnit(item.receivedQuantity, 'kg');
    }
  } else if (
    unitSupportsReceivedWeightKg(item.unit) &&
    item.receivedWeightKg != null &&
    item.receivedWeightKg > 0
  ) {
    const kgStr = `${item.receivedWeightKg.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} kg`;
    recibido =
      item.receivedQuantity > 0
        ? `${kgStr} (${formatQuantityWithUnit(item.receivedQuantity, item.unit)})`
        : kgStr;
  } else {
    const q = item.receivedQuantity > 0 ? item.receivedQuantity : item.quantity;
    recibido = formatQuantityWithUnit(q, item.unit);
  }

  let precioAplicado: string;
  let precioEquivCatalogo: string | undefined;
  if (item.incidentType === 'missing') {
    precioAplicado = '—';
  } else if (item.unit === 'kg') {
    precioAplicado = `${item.pricePerUnit.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/kg`;
  } else if (
    unitSupportsReceivedWeightKg(item.unit) &&
    item.receivedWeightKg != null &&
    item.receivedWeightKg > 0 &&
    item.receivedPricePerKg != null &&
    Number.isFinite(item.receivedPricePerKg) &&
    item.receivedPricePerKg > 0
  ) {
    precioAplicado = `${item.receivedPricePerKg.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €/kg`;
    const { effectivePricePerUnit } = receptionLineTotals(item);
    precioEquivCatalogo = `${effectivePricePerUnit.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/${suf} (equiv. catálogo)`;
  } else {
    precioAplicado = `${item.pricePerUnit.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/${suf}`;
  }

  const sub = lineSubtotalForOrderListDisplay(item);
  const totalLinea = `${sub.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

  return { pedido, recibido, precioAplicado, precioEquivCatalogo, totalLinea };
}

export function totalsWithVatForOrderListDisplay(order: PedidoOrder): {
  base: number;
  vat: number;
  total: number;
} {
  const base = order.items.reduce((acc, item) => acc + lineSubtotalForOrderListDisplay(item), 0);
  const vat = order.items.reduce(
    (acc, item) => acc + lineSubtotalForOrderListDisplay(item) * (item.vatRate ?? 0),
    0,
  );
  return { base, vat, total: base + vat };
}
