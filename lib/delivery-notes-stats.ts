/**
 * Mini KPIs derivados de la lista de albaranes ya cargada.
 *
 * Cálculo en memoria: evita queries adicionales y mantiene la UX rápida.
 * Si en el futuro hace falta agregación pesada (subidas de precio reales contra
 * histórico, ranking por proveedor, etc.) ese cálculo debe ir a SQL y exponerse
 * en su propio helper — este queda como capa "ligera" para la home de Albaranes.
 */

import type { DeliveryNoteListEntry } from '@/lib/delivery-notes-supabase';

export type DeliveryNotesMonthlyStats = {
  countMonth: number;
  countMonthWithIncidents: number;
  totalAmountMonth: number;
  /** Albaranes que llegaron este mes con OCR pendiente o pendiente de revisión. */
  pendingReview: number;
  /** Mes en formato YYYY-MM usado para el cálculo. */
  monthKey: string;
};

function madridMonthKey(date: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '00';
  return `${y}-${m}`;
}

function noteMonthKey(entry: DeliveryNoteListEntry): string {
  if (entry.deliveryDate && /^\d{4}-\d{2}-\d{2}$/.test(entry.deliveryDate)) {
    return entry.deliveryDate.slice(0, 7);
  }
  return madridMonthKey(new Date(entry.createdAt));
}

export function computeDeliveryNotesMonthlyStats(
  rows: DeliveryNoteListEntry[],
  now: Date = new Date(),
): DeliveryNotesMonthlyStats {
  const monthKey = madridMonthKey(now);
  let countMonth = 0;
  let countMonthWithIncidents = 0;
  let totalAmountMonth = 0;
  let pendingReview = 0;

  for (const r of rows) {
    const inMonth = noteMonthKey(r) === monthKey;
    if (r.status === 'draft' || r.status === 'ocr_read' || r.status === 'pending_review') {
      pendingReview += 1;
    }
    if (!inMonth) continue;
    countMonth += 1;
    if (r.hasOpenIncidents || r.status === 'with_incidents') countMonthWithIncidents += 1;
    if (r.totalAmount != null && Number.isFinite(r.totalAmount)) {
      totalAmountMonth += r.totalAmount;
    }
  }

  return {
    countMonth,
    countMonthWithIncidents,
    totalAmountMonth: Math.round(totalAmountMonth * 100) / 100,
    pendingReview,
    monthKey,
  };
}

/**
 * Identifica los albaranes "pendientes de OCR / revisión" para el bloque destacado.
 * Devuelve hasta `limit` registros ordenados por más reciente.
 */
export function pickOcrPendingNotes(
  rows: DeliveryNoteListEntry[],
  limit = 3,
): DeliveryNoteListEntry[] {
  const pending = rows.filter((r) => {
    if (r.status === 'draft') return true;
    if (r.status === 'ocr_read') return true;
    if (r.status === 'pending_review') return true;
    if (r.status === 'with_incidents' && r.hasOpenIncidents) return true;
    return false;
  });
  return pending.slice(0, limit);
}

/**
 * Resumen breve de por qué un albarán está pendiente (mostrado en la card de pendientes).
 */
export function summarisePendingReason(entry: DeliveryNoteListEntry): string {
  if (entry.hasOpenIncidents) {
    if (entry.openIncidentCount === 1) return '1 incidencia abierta';
    return `${entry.openIncidentCount} incidencias abiertas`;
  }
  if (entry.status === 'draft') return 'Pendiente de OCR';
  if (entry.status === 'ocr_read') return 'OCR leído · revisa líneas';
  if (entry.status === 'pending_review') return 'Pendiente de revisión';
  return 'Pendiente de validar';
}
