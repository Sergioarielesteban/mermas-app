/**
 * Pre-login: no se exige Bearer de usuario (el cliente aún no tiene sesión).
 * Anti enumeración: misma forma de respuesta en éxito; email solo si el alias resuelve.
 */
import { NextResponse } from 'next/server';
import { isSupabaseAdminConfigured, resolveLoginEmailWithServiceRole } from '@/lib/server/supabase-admin';
import { jsonGenericError, logCriticalAndGeneric } from '@/lib/server/api-safe';
import { readJsonBodyLimitedEx } from '@/lib/server/read-json-limited';
import { enforceRateLimitPublic } from '@/lib/server/security-rate-limit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9._-]{2,80}$/i;
const MAX_BODY_BYTES = 4096;

function successEmail(email: string | null) {
  return NextResponse.json({ ok: true, email });
}

export async function POST(request: Request) {
  const limited = enforceRateLimitPublic(request, 'resolve_login');
  if (limited) return limited;

  if (!isSupabaseAdminConfigured()) {
    return jsonGenericError(503);
  }

  try {
    const parsedIn = await readJsonBodyLimitedEx(request, MAX_BODY_BYTES);
    if (!parsedIn.ok) {
      return NextResponse.json(
        { ok: false, error: 'Request failed' },
        { status: parsedIn.kind === 'too_large' ? 413 : 400 },
      );
    }
    const parsed = parsedIn.data as { identifier?: unknown };
    const raw = String(parsed.identifier ?? '')
      .trim()
      .toLowerCase();
    if (!raw) return successEmail(null);

    /** No resolver ni devolver email tecleado: este endpoint es solo para alias (cliente no envía @). */
    if (EMAIL_RE.test(raw)) {
      return successEmail(null);
    }
    if (!USERNAME_RE.test(raw)) {
      return successEmail(null);
    }

    const resolved = await resolveLoginEmailWithServiceRole(raw);
    return successEmail(resolved);
  } catch (err) {
    return logCriticalAndGeneric('POST /api/auth/resolve-login-email', err);
  }
}
