import { NextResponse } from 'next/server';
import { runAppccNightCloseJob } from '@/lib/server/appcc-night-close';

function isAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = request.headers.get('authorization') ?? '';
  return auth === `Bearer ${expected}`;
}

/**
 * Cron (p. ej. cada hora): solo actúa en la hora 02:00 Europe/Madrid.
 * Comprueba el día civil anterior: temperaturas (todas las franjas por equipo activo) y aceite (si hay freidoras).
 * Crea una notificación por local si falta algo y aún no existe aviso para esa fecha.
 */
export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, reason: 'Unauthorized' }, { status: 401 });
    }

    const result = await runAppccNightCloseJob(new Date());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, reason: message }, { status: 500 });
  }
}
