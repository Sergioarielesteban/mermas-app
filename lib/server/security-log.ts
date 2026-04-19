/**
 * Logs mínimos en servidor (sin contraseñas, tokens ni cuerpos de petición).
 */
export type SecurityLogEvent = 'rate_limit' | 'access_denied' | 'critical';

export function logSecurityEvent(
  event: SecurityLogEvent,
  meta: Record<string, string | number | boolean | undefined>,
) {
  try {
    const line = JSON.stringify({
      t: new Date().toISOString(),
      event,
      ...meta,
    });
    console.warn(`[security] ${line}`);
  } catch {
    console.warn('[security]', event);
  }
}
