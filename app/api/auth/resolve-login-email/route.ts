/**
 * Pre-login: no se exige Bearer de usuario (el cliente aún no tiene sesión).
 * Protección: rate limit + validación de formato; resolución vía service role acotada en servidor.
 */
import { NextResponse } from 'next/server';
import { isSupabaseAdminConfigured, resolveLoginEmailWithServiceRole } from '@/lib/server/supabase-admin';
import { checkRateLimit } from '@/lib/server/simple-rate-limit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9._-]{2,80}$/i;

function clientKey(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return ip;
}

export async function POST(request: Request) {
  const rate = checkRateLimit({
    key: `resolve-login:${clientKey(request)}`,
    limit: 20,
    windowMs: 60 * 1000,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, reason: 'Demasiados intentos. Espera un poco e inténtalo de nuevo.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfterSec) },
      },
    );
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ ok: false, reason: 'Servicio no disponible.' }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { identifier?: string };
    const raw = String(body.identifier ?? '').trim().toLowerCase();
    if (!raw) return NextResponse.json({ ok: true, email: null });

    if (EMAIL_RE.test(raw)) {
      return NextResponse.json({ ok: true, email: raw });
    }
    if (!USERNAME_RE.test(raw)) {
      // Evita filtrar demasiado: inválidos se tratan como no encontrados.
      return NextResponse.json({ ok: true, email: null });
    }

    const resolved = await resolveLoginEmailWithServiceRole(raw);
    return NextResponse.json({ ok: true, email: resolved });
  } catch {
    return NextResponse.json({ ok: false, reason: 'No se pudo validar el usuario.' }, { status: 500 });
  }
}
