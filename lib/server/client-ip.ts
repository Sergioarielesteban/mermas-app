/** IP del cliente (proxy: primera de X-Forwarded-For). */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '';
  return ip || 'unknown';
}
