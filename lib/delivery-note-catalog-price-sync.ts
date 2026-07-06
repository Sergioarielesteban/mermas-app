import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeliveryNoteItem } from '@/lib/delivery-notes-supabase';

export type DeliveryNoteCatalogPriceSyncResult = {
  updated: number;
  unchanged: number;
  skipped: number;
};

/**
 * Tras validar un albarán: si una línea enlaza a `pedido_supplier_products` y el precio comparable
 * difiere del último registrado en `historico_precios` (o del baseline del precio base del catálogo),
 * escribe histórico y último precio recibido — sin cambiar el precio base del catálogo.
 */
export async function syncCatalogPricesFromValidatedDeliveryNote(
  supabase: SupabaseClient,
  localId: string,
  deliveryNoteId: string,
  _items: DeliveryNoteItem[],
  userId: string | null,
  opts?: { receptionDate?: string | null },
): Promise<DeliveryNoteCatalogPriceSyncResult> {
  const receptionDate =
    opts?.receptionDate && /^\d{4}-\d{2}-\d{2}/.test(opts.receptionDate)
      ? opts.receptionDate.slice(0, 10)
      : null;
  const { data, error } = await supabase.rpc('confirm_delivery_note_atomic', {
    p_delivery_note_id: deliveryNoteId,
    p_local_id: localId,
    p_validated_by: userId,
    p_reception_date: receptionDate,
  });

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Pedidos albaranes] confirm_delivery_note_atomic failed:', error);
    }
    throw new Error('No se pudo confirmar el albarán.');
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    updated:
      row && typeof row === 'object' && 'updated_count' in row
        ? Number((row as { updated_count: number | null }).updated_count ?? 0)
        : 0,
    unchanged:
      row && typeof row === 'object' && 'unchanged_count' in row
        ? Number((row as { unchanged_count: number | null }).unchanged_count ?? 0)
        : 0,
    skipped:
      row && typeof row === 'object' && 'skipped_count' in row
        ? Number((row as { skipped_count: number | null }).skipped_count ?? 0)
        : 0,
  };
}
