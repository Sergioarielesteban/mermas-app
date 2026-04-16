import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'pedido-albaranes';

/**
 * Sube JPEG comprimido y registra fila en `purchase_order_albaran_attachments` (tras migración SQL).
 */
export async function uploadPedidoAlbaranAttachment(
  supabase: SupabaseClient,
  localId: string,
  orderId: string,
  jpegBlob: Blob,
): Promise<{ storagePath: string }> {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
  const storagePath = `${localId}/${orderId}/${id}.jpg`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, jpegBlob, {
    cacheControl: '3600',
    upsert: false,
    contentType: 'image/jpeg',
  });
  if (upErr) throw new Error(upErr.message);

  const fileSizeBytes = jpegBlob.size;
  const { error: insErr } = await supabase.from('purchase_order_albaran_attachments').insert({
    local_id: localId,
    order_id: orderId,
    storage_path: storagePath,
    file_size_bytes: fileSizeBytes,
  });
  if (insErr) {
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw new Error(insErr.message);
  }

  return { storagePath };
}
