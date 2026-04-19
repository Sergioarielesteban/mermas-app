import { timingSafeEqual } from 'node:crypto';

/** Comparación constante para secretos (cron, webhooks). */
export function timingSafeEqualString(a: string, b: string): boolean {
  const ae = Buffer.from(a, 'utf8');
  const be = Buffer.from(b, 'utf8');
  if (ae.length !== be.length) return false;
  return timingSafeEqual(ae, be);
}
