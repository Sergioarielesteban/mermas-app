/**
 * Compresión cliente para albaranes (reduce uso de Storage y acelera OCR).
 * Solo ejecutar en el navegador.
 */
export async function compressImageFileToJpeg(
  file: File,
  opts?: { maxLongEdge?: number; quality?: number; maxBytes?: number },
): Promise<Blob> {
  const maxLongEdge = opts?.maxLongEdge ?? 1680;
  const quality = opts?.quality ?? 0.82;
  const maxBytes = opts?.maxBytes ?? 650_000;

  const bitmap = await createImageBitmap(file);
  try {
    let w = bitmap.width;
    let h = bitmap.height;
    const long = Math.max(w, h);
    if (long > maxLongEdge) {
      const scale = maxLongEdge / long;
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas no disponible.');
    ctx.drawImage(bitmap, 0, 0, w, h);

    let q = quality;
    let blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', q));
    if (!blob) throw new Error('No se pudo generar JPEG.');

    while (blob.size > maxBytes && q > 0.45) {
      q -= 0.07;
      blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', q));
      if (!blob) break;
    }
    if (!blob) throw new Error('No se pudo comprimir la imagen.');
    return blob;
  } finally {
    bitmap.close();
  }
}

/**
 * OCR de albarán vía API neutra (`/api/pedidos/ocr`). El proveedor (Textract u otro) vive solo en el servidor.
 */
export async function runAlbaranOcr(blob: Blob, accessToken: string): Promise<string> {
  const form = new FormData();
  form.append('image', blob, 'albaran.jpg');
  const res = await fetch('/api/pedidos/ocr', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const rec = body as {
    ok?: boolean;
    reason?: string;
    error?: string;
    text?: string;
    result?: { rawText?: string };
  } | null;
  if (!res.ok || !rec?.ok) {
    const reason =
      typeof rec?.reason === 'string'
        ? rec.reason
        : typeof rec?.error === 'string'
          ? rec.error
          : `HTTP ${res.status}`;
    throw new Error(reason);
  }
  const t = typeof rec.text === 'string' ? rec.text : '';
  if (t.length > 0) return t;
  return typeof rec.result?.rawText === 'string' ? rec.result.rawText : '';
}

/** @deprecated Usar `runAlbaranOcr` (misma firma). */
export async function runAlbaranOcrViaTextract(blob: Blob, accessToken: string): Promise<string> {
  return runAlbaranOcr(blob, accessToken);
}
