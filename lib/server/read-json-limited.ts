/**
 * Lee JSON con tope de bytes (evita payloads gigantes en memoria).
 */
export type ReadJsonLimitedResult =
  | { ok: true; data: unknown }
  | { ok: false; kind: 'too_large' | 'bad_json' };

export async function readJsonBodyLimitedEx(request: Request, maxBytes: number): Promise<ReadJsonLimitedResult> {
  const buf = await request.arrayBuffer();
  if (buf.byteLength > maxBytes) return { ok: false, kind: 'too_large' };
  try {
    return { ok: true, data: JSON.parse(new TextDecoder().decode(buf)) as unknown };
  } catch {
    return { ok: false, kind: 'bad_json' };
  }
}

/** Compat: null si too_large o bad_json (para rutas que tratan ambos igual). */
export async function readJsonBodyLimited(request: Request, maxBytes: number): Promise<unknown | null> {
  const r = await readJsonBodyLimitedEx(request, maxBytes);
  if (!r.ok) return null;
  return r.data;
}
