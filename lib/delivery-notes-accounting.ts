import type { DeliveryNote, DeliveryNoteItem, DeliveryNoteStatus } from '@/lib/delivery-notes-supabase';

/**
 * Clave de periodo contable (YYYY-MM) a partir de la fecha de entrega del albarán.
 * Base para futuros informes por mes / proveedor / local.
 */
export function bookkeepingMonthFromDeliveryDate(isoDate: string | null | undefined): string | null {
  if (!isoDate || typeof isoDate !== 'string') return null;
  const m = isoDate.match(/^(\d{4}-\d{2})/);
  return m ? m[1]! : null;
}

/** Fila lógica para export CSV / Excel / integración contable (sin persistir aún). */
export type DeliveryNoteAccountingPreview = {
  deliveryNoteId: string;
  bookkeepingMonth: string | null;
  supplierName: string;
  deliveryNoteNumber: string;
  deliveryDate: string | null;
  relatedOrderId: string | null;
  currency: string;
  status: DeliveryNoteStatus;
  headerTotal: number | null;
  headerSubtotal: number | null;
  headerTax: number | null;
  lineCount: number;
  /** Suma aproximada Σ(qty × unit_price) por línea (control vs cabecera). */
  computedLinesTotal: number | null;
};

export function buildDeliveryNoteAccountingPreview(
  note: DeliveryNote,
  items: DeliveryNoteItem[],
): DeliveryNoteAccountingPreview {
  let sum = 0;
  let has = false;
  for (const it of items) {
    if (it.unitPrice != null && Number.isFinite(it.unitPrice) && it.quantity > 0) {
      sum += Math.round(it.quantity * it.unitPrice * 100) / 100;
      has = true;
    }
  }
  return {
    deliveryNoteId: note.id,
    bookkeepingMonth: bookkeepingMonthFromDeliveryDate(note.deliveryDate),
    supplierName: note.supplierName,
    deliveryNoteNumber: note.deliveryNoteNumber,
    deliveryDate: note.deliveryDate,
    relatedOrderId: note.relatedOrderId,
    currency: note.currency || 'EUR',
    status: note.status,
    headerTotal: note.totalAmount,
    headerSubtotal: note.subtotal,
    headerTax: note.taxAmount,
    lineCount: items.length,
    computedLinesTotal: has ? Math.round(sum * 100) / 100 : null,
  };
}
