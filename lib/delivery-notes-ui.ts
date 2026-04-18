import type { DeliveryNoteItemMatchStatus, DeliveryNoteStatus } from '@/lib/delivery-notes-supabase';
import { DELIVERY_NOTE_STATUS_LABEL } from '@/lib/delivery-notes-supabase';

/** Clases Tailwind para chips / bordes según estado de cabecera. */
export function deliveryNoteStatusVisual(status: DeliveryNoteStatus): {
  label: string;
  chipClass: string;
  borderClass: string;
  dotClass: string;
} {
  const label = DELIVERY_NOTE_STATUS_LABEL[status];
  switch (status) {
    case 'validated':
      return {
        label,
        chipClass: 'bg-emerald-600 text-white ring-2 ring-emerald-500/30',
        borderClass: 'border-l-4 border-l-emerald-500',
        dotClass: 'bg-emerald-500',
      };
    case 'with_incidents':
      return {
        label,
        chipClass: 'bg-red-600 text-white ring-2 ring-red-500/30',
        borderClass: 'border-l-4 border-l-red-500',
        dotClass: 'bg-red-500',
      };
    case 'archived':
      return {
        label,
        chipClass: 'bg-zinc-500 text-white ring-1 ring-zinc-400/40',
        borderClass: 'border-l-4 border-l-zinc-400',
        dotClass: 'bg-zinc-400',
      };
    case 'ocr_read':
      return {
        label,
        chipClass: 'bg-sky-600 text-white ring-2 ring-sky-400/30',
        borderClass: 'border-l-4 border-l-sky-500',
        dotClass: 'bg-sky-500',
      };
    case 'pending_review':
      return {
        label,
        chipClass: 'bg-amber-500 text-white ring-2 ring-amber-400/40',
        borderClass: 'border-l-4 border-l-amber-500',
        dotClass: 'bg-amber-500',
      };
    case 'draft':
    default:
      return {
        label,
        chipClass: 'bg-zinc-600 text-white ring-1 ring-zinc-500/30',
        borderClass: 'border-l-4 border-l-zinc-500',
        dotClass: 'bg-zinc-400',
      };
  }
}

/** Orden lógico para mini-flujo visual (no incluye ramas finales). */
export const DELIVERY_NOTE_FLOW_STATUSES: DeliveryNoteStatus[] = [
  'draft',
  'ocr_read',
  'pending_review',
  'validated',
];

export function deliveryNoteFlowStepIndex(status: DeliveryNoteStatus): number {
  if (status === 'with_incidents') return 3;
  if (status === 'archived') return 4;
  const i = DELIVERY_NOTE_FLOW_STATUSES.indexOf(status);
  return i >= 0 ? i : 0;
}

export const MATCH_STATUS_LABEL: Record<DeliveryNoteItemMatchStatus, string> = {
  unmatched: 'Sin emparejar',
  matched: 'OK',
  mismatch_qty: 'Cantidad',
  mismatch_price: 'Precio',
  extra_line: 'Extra albarán',
  not_applicable: '—',
};

export function matchRowAccent(matchStatus: DeliveryNoteItemMatchStatus | null): string {
  switch (matchStatus) {
    case 'matched':
      return 'bg-emerald-50/90 ring-emerald-200/80';
    case 'mismatch_qty':
    case 'mismatch_price':
      return 'bg-amber-50/90 ring-amber-200/80';
    case 'extra_line':
      return 'bg-orange-50/90 ring-orange-200/80';
    case 'unmatched':
      return 'bg-zinc-50 ring-zinc-200';
    default:
      return 'bg-white ring-zinc-200';
  }
}
