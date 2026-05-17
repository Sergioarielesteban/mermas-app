/**
 * Compresión cliente para albaranes (reduce uso de Storage y acelera OCR).
 * Solo ejecutar en el navegador.
 */
async function decodeImageFile(file: File): Promise<{ width: number; height: number; drawTo: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }> {
  if (typeof window === 'undefined') {
    throw new Error('Este flujo solo puede ejecutarse en el navegador.');
  }

  const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name);

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        drawTo: (ctx, w, h) => {
          ctx.drawImage(bitmap, 0, 0, w, h);
          bitmap.close();
        },
      };
    } catch {
      // fallback a <img>
      if (isHeic) {
        // seguimos al fallback porque Safari/iOS puede decodificar HEIC en <img>
      }
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('decode_failed'));
    });
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      drawTo: (ctx, w, h) => {
        ctx.drawImage(img, 0, 0, w, h);
      },
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function compressImageFileToJpeg(
  file: File,
  opts?: { maxLongEdge?: number; quality?: number; maxBytes?: number },
): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Este flujo solo admite imágenes. Para PDF usa Pedidos > Albaranes > Escanear albarán.');
  }
  const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name);
  const maxLongEdge = opts?.maxLongEdge ?? 1680;
  const quality = opts?.quality ?? 0.82;
  const maxBytes = opts?.maxBytes ?? 650_000;

  try {
    const decoded = await decodeImageFile(file);
    let w = decoded.width;
    let h = decoded.height;
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
    decoded.drawTo(ctx, w, h);

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
  } catch (err) {
    if (isHeic) {
      throw new Error('Formato HEIC detectado. Convierte la imagen a JPG o vuelve a fotografiar desde cámara.');
    }
    throw err;
  }
}

/**
 * OCR de albarán vía `/api/pedidos/ocr` — solo Google Document AI en servidor.
 */
export async function runAlbaranOcr(blob: Blob, accessToken: string): Promise<string> {
  const form = new FormData();
  form.append('image', blob, 'albaran.jpg');
  const mime = typeof blob.type === 'string' && blob.type ? blob.type : 'image/jpeg';
  form.append('mimeType', mime);
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
    if (reason === 'ocr_provider_not_configured') {
      throw new Error('OCR no configurado: faltan variables de Google Document AI en el servidor.');
    }
    throw new Error(reason);
  }
  const t = typeof rec.text === 'string' ? rec.text : '';
  if (t.length > 0) return t;
  return typeof rec.result?.rawText === 'string' ? rec.result.rawText : '';
}
