/**
 * URLs públicas de lote (QR). El token (qr_token en BD) es obligatorio; no se admite ficha por id sola.
 */

/** Compara dos UUID en texto (insensible a mayúsculas / espacios). */
export function batchQrTokensMatch(stored: string, fromUrl: string): boolean {
  return stored.trim().toLowerCase() === fromUrl.trim().toLowerCase();
}

export function buildCocinaCentralBatchQrUrl(
  siteOrigin: string,
  batchId: string,
  accessToken: string,
): string {
  const o = siteOrigin.replace(/\/$/, '');
  return `${o}/cocina-central/lote/${encodeURIComponent(batchId)}?token=${encodeURIComponent(accessToken)}`;
}

/**
 * Contenido escaneado: URL completa o token UUID suelto (etiquetas antiguas).
 * Devuelve `{ batchId, token }` o solo `{ token }` para redirigir a la ruta legado.
 */
function parseAsUrl(raw: string): URL | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    return new URL(t);
  } catch {
    try {
      if (typeof window !== 'undefined' && window.location?.origin) {
        return new URL(t, window.location.origin);
      }
    } catch {
      /* ignore */
    }
    try {
      return new URL(t, 'https://placeholder.invalid');
    } catch {
      return null;
    }
  }
}

export function parseScannedBatchQr(
  raw: string,
):
  | { kind: 'full'; batchId: string; token: string }
  | { kind: 'tokenOnly'; token: string }
  | null {
  const t = raw.trim();
  if (!t) return null;

  const u = parseAsUrl(t);
  if (u) {
    const token = u.searchParams.get('token')?.trim() ?? '';
    if (!token) return null;
    const pathMatch = u.pathname.match(/\/cocina-central\/lote\/([0-9a-f-]{36})/i);
    if (pathMatch?.[1]) {
      return { kind: 'full', batchId: pathMatch[1], token };
    }
    const idQ = u.searchParams.get('id')?.trim() ?? '';
    if (idQ && /^[0-9a-f-]{36}$/i.test(idQ)) {
      return { kind: 'full', batchId: idQ, token };
    }
    return { kind: 'tokenOnly', token };
  }

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t)
  ) {
    return { kind: 'tokenOnly', token: t };
  }
  return null;
}
