'use client';

/**
 * Redimensiona y comprime a WebP en cliente (máx. ~1 MB bucket).
 * Si el navegador no soporta toBlob webp, sube el archivo original acotado.
 */
export async function compressImageToWebpBlob(file: File, maxWidth = 1200, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    return file;
  }
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const ratio = Math.min(1, maxWidth / bmp.width);
  const w = Math.max(1, Math.round(bmp.width * ratio));
  const h = Math.max(1, Math.round(bmp.height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bmp.close?.();
    return file;
  }
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const webp = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/webp', quality);
  });
  if (webp && webp.size > 0) return webp;
  const jpeg = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', Math.min(0.9, quality + 0.05));
  });
  return jpeg && jpeg.size > 0 ? jpeg : file;
}
