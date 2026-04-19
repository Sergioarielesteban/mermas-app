import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/server/client-ip';
import { logSecurityEvent } from '@/lib/server/security-log';
import { checkRateLimit } from '@/lib/server/simple-rate-limit';

/** Límites por ventana de 60s (acuerdo hardening pre-producción). */
export const RL = {
  /** OCR albaranes (genérico; proveedor en servidor) */
  ocr: { limit: 10, windowMs: 60_000 },
  /** Rutas /api/ai/* (forecast, oido-chef, tts) */
  ai: { limit: 20, windowMs: 60_000 },
  /** Formulario público leads */
  leads: { limit: 5, windowMs: 60_000 },
  /** Resolver alias pre-login (anti enumeración + abuso) */
  resolveLogin: { limit: 10, windowMs: 60_000 },
} as const;

export type RateLimitScope = keyof typeof RL;

/**
 * Rate limit con clave IP + usuario autenticado (misma ventana para todo el bucket).
 */
export function enforceRateLimitAuth(
  request: Request,
  userId: string,
  scope: 'ocr' | 'ai',
): NextResponse | null {
  const ip = getClientIp(request);
  const spec = RL[scope];
  const key = `${scope}:${ip}|u:${userId}`;
  const r = checkRateLimit({ key, limit: spec.limit, windowMs: spec.windowMs });
  if (!r.ok) {
    logSecurityEvent('rate_limit', { scope, ip: ip.slice(0, 64), userId: userId.slice(0, 12) });
    return NextResponse.json(
      { ok: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(r.retryAfterSec) } },
    );
  }
  return null;
}

/** Solo IP (endpoints sin sesión). */
export function enforceRateLimitPublic(request: Request, scope: 'leads' | 'resolve_login'): NextResponse | null {
  const ip = getClientIp(request);
  const spec = scope === 'leads' ? RL.leads : RL.resolveLogin;
  const key = `${scope}:${ip}`;
  const r = checkRateLimit({ key, limit: spec.limit, windowMs: spec.windowMs });
  if (!r.ok) {
    logSecurityEvent('rate_limit', { scope, ip: ip.slice(0, 64) });
    return NextResponse.json(
      { ok: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(r.retryAfterSec) } },
    );
  }
  return null;
}
