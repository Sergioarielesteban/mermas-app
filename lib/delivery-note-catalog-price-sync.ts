import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeliveryNoteItem } from '@/lib/delivery-notes-supabase';
import {
  fetchSupplierProductRow,
  updateSupplierProductLastReceivedPrice,
  updateSupplierProductPriceWithHistory,
} from '@/lib/pedidos-supabase';

export type DeliveryNoteCatalogPriceSyncResult = {
  updated: number;
  unchanged: number;
  skipped: number;
};

/**
 * Tras validar un albarán: si una línea enlaza a `pedido_supplier_products` y el €/ud del albarán
 * difiere del catálogo (misma unidad), actualiza precio + histórico.
 */
export async function syncCatalogPricesFromValidatedDeliveryNote(
  supabase: SupabaseClient,
  localId: string,
  deliveryNoteId: string,
  items: DeliveryNoteItem[],
  userId: string | null,
): Promise<DeliveryNoteCatalogPriceSyncResult> {
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const item of items) {
    const pid = item.internalProductId;
    const up = item.unitPrice;
    if (!pid || up == null || !Number.isFinite(up) || up < 0) {
      skipped += 1;
      continue;
    }

    try {
      const cat = await fetchSupplierProductRow(supabase, localId, pid);
      if (!cat || String(cat.unit) !== String(item.unit)) {
        skipped += 1;
        continue;
      }
      await updateSupplierProductLastReceivedPrice(
        supabase,
        localId,
        pid,
        up,
        new Date().toISOString(),
      );
      const { changed } = await updateSupplierProductPriceWithHistory(supabase, localId, pid, up, {
        source: 'delivery_note_validated',
        deliveryNoteId,
        userId,
        existingRow: cat,
      });
      if (changed) updated += 1;
      else unchanged += 1;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.toLowerCase() : '';
      if (msg.includes('producto de proveedor no encontrado')) {
        skipped += 1;
        continue;
      }
      throw e;
    }
  }

  return { updated, unchanged, skipped };
}
