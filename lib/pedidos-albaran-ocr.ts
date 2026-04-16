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

export type TesseractProgress = { status: string; progress: number };

/**
 * OCR con Tesseract (carga dinámica para no inflar el bundle inicial).
 */
export async function runTesseractOnJpeg(
  blob: Blob,
  onProgress?: (p: TesseractProgress) => void,
): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('spa', undefined, {
    logger: (m: { status: string; progress: number }) => {
      if (onProgress && typeof m.progress === 'number') {
        onProgress({ status: m.status, progress: m.progress });
      }
    },
  });
  try {
    const {
      data: { text },
    } = await worker.recognize(blob);
    return text ?? '';
  } finally {
    await worker.terminate();
  }
}
