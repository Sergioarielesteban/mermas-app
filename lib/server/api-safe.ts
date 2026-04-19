import { NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/server/security-log';

export const GENERIC_ERROR_MESSAGE = 'Request failed';

/** Respuesta JSON genérica para 500/errores internos (no filtrar stack ni detalles). */
export function jsonGenericError(status = 500) {
  return NextResponse.json({ ok: false, error: GENERIC_ERROR_MESSAGE }, { status });
}

export function logCriticalAndGeneric(route: string, err: unknown) {
  const name = err instanceof Error ? err.name : 'Error';
  logSecurityEvent('critical', { route, errType: name });
  return jsonGenericError(500);
}
