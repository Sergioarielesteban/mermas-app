import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'pedido-albaranes';

/** Ruta: {localId}/delivery-notes/{deliveryNoteId}/{unique}_{safeName} */
export async function uploadDeliveryNoteOriginal(
  supabase: SupabaseClient,
  localId: string,
  deliveryNoteId: string,
  file: File,
): Promise<{ storagePath: string; mimeType: string; fileName: string }> {
  const safe =
    file.name.replace(/[^\w.\-]+/g, '_').slice(0, 80) || (file.type.includes('pdf') ? 'albaran.pdf' : 'albaran.jpg');
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
  const storagePath = `${localId}/delivery-notes/${deliveryNoteId}/${id}_${safe}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  });
  if (upErr) throw new Error(upErr.message);

  return { storagePath, mimeType: file.type || 'application/octet-stream', fileName: file.name };
}

/** URL firmada para visor (bucket privado). */
export async function createDeliveryNoteSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresSec = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresSec);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
