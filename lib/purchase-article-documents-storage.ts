import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'article-documents';
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;

export const PURCHASE_ARTICLE_DOCUMENT_MAX_BYTES = MAX_FILE_SIZE_BYTES;
export const PURCHASE_ARTICLE_DOCUMENT_ALLOWED_MIME_TYPES = [...ALLOWED_MIME_TYPES];

export function isPurchaseArticleDocumentMimeType(value: string | null | undefined): value is (typeof ALLOWED_MIME_TYPES)[number] {
  return Boolean(value && ALLOWED_MIME_TYPES.includes(value as (typeof ALLOWED_MIME_TYPES)[number]));
}

export function validatePurchaseArticleDocument(file: File): string | null {
  if (!isPurchaseArticleDocumentMimeType(file.type)) {
    return 'Solo se permiten PDF, JPG, PNG o WEBP.';
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return 'El archivo supera el límite de 10 MB.';
  }
  return null;
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim() || 'documento';
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 96);
}

function fileExtensionFor(file: File): string {
  const byType =
    file.type === 'application/pdf'
      ? 'pdf'
      : file.type === 'image/jpeg'
        ? 'jpg'
        : file.type === 'image/png'
          ? 'png'
          : file.type === 'image/webp'
            ? 'webp'
            : '';
  if (byType) return byType;
  const raw = file.name.split('.').pop()?.trim().toLowerCase();
  return raw || 'bin';
}

export async function uploadPurchaseArticleDocument(
  supabase: SupabaseClient,
  localId: string,
  articleId: string,
  file: File,
): Promise<{ storagePath: string; fileName: string; fileType: string; fileSize: number }> {
  const validationError = validatePurchaseArticleDocument(file);
  if (validationError) throw new Error(validationError);

  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
  const ext = fileExtensionFor(file);
  const storagePath = `${localId}/articulos_master/${articleId}/${id}.${ext}`;
  const fileName = sanitizeFileName(file.name);

  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });
  if (error) throw new Error(error.message);

  return {
    storagePath,
    fileName,
    fileType: file.type,
    fileSize: file.size,
  };
}

export async function deletePurchaseArticleDocument(
  supabase: SupabaseClient,
  storagePath: string | null | undefined,
): Promise<void> {
  const path = String(storagePath ?? '').trim();
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

export async function createPurchaseArticleDocumentSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresSec = 60 * 10,
): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresSec);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'No se pudo abrir el archivo.');
  return data.signedUrl;
}

