import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeliveryNoteItem } from '@/lib/delivery-notes-supabase';
import { fetchSupplierProductRow, updateSupplierProductPriceFromRecepcion } from '@/lib/pedidos-supabase';

export type DeliveryNoteCatalogPriceSyncResult = {
  updated: number;
  unchanged: number;
  skipped: number;
};

/**
 * Tras validar un albarán: si una línea enlaza a `pedido_supplier_products` y el precio comparable
 * difiere del último registrado en `historico_precios` (o del baseline de catálogo), actualiza catálogo + histórico.
 */
export async function syncCatalogPricesFromValidatedDeliveryNote(
  supabase: SupabaseClient,
  localId: string,
  deliveryNoteId: string,
  items: DeliveryNoteItem[],
  userId: string | null,
  opts?: { receptionDate?: string | null },
): Promise<DeliveryNoteCatalogPriceSyncResult> {
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  const receptionDate = opts?.receptionDate ?? null;

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
      const { changed } = await updateSupplierProductPriceFromRecepcion(supabase, localId, pid, up, {
        deliveryNoteId,
        receptionDate,
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
