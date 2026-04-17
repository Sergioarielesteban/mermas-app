import { requireAllowedSupabaseUser } from '@/lib/require-allowed-supabase-user';
import { getProfileAccessByUserId } from '@/lib/server/supabase-admin';
import { checkRateLimit } from '@/lib/server/simple-rate-limit';

type OidoKind = 'chat' | 'tts';

export type OidoAccessResult =
  | {
      ok: true;
      userId: string;
      email: string;
      localId: string;
      role: string;
      rateLimitRetryAfterSec: number;
    }
  | {
      ok: false;
      message: string;
      status: number;
      rateLimitRetryAfterSec?: number;
    };

function parseCsv(raw: string): string[] {
  return raw
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function parseRateLimitSpec(raw: string, fallbackLimit: number, fallbackWindowMs: number) {
  const t = raw.trim().toLowerCase();
  const m = /^(\d+)\s*\/\s*(\d+)\s*([smh])$/.exec(t);
  if (!m) return { limit: fallbackLimit, windowMs: fallbackWindowMs };
  const limit = Math.max(1, Number(m[1]));
  const qty = Math.max(1, Number(m[2]));
  const unit = m[3];
  const windowMs =
    unit === 's'
      ? qty * 1000
      : unit === 'm'
        ? qty * 60 * 1000
        : qty * 60 * 60 * 1000;
  return { limit, windowMs };
}

export async function requireOidoChefAccess(request: Request, kind: OidoKind): Promise<OidoAccessResult> {
  if (process.env.OIDO_CHEF_ENABLED?.trim() === '0') {
    return { ok: false, message: 'Oído Chef está desactivado en este despliegue.', status: 403 };
  }

  const auth = await requireAllowedSupabaseUser(request);
  if (!auth.ok) {
    return { ok: false, message: auth.message, status: auth.status };
  }

  const profile = await getProfileAccessByUserId(auth.userId);
  if (!profile || !profile.is_active) {
    return { ok: false, message: 'Perfil no activo para Oído Chef.', status: 403 };
  }

  const role = String(profile.role ?? '').trim().toLowerCase();
  const localId = String(profile.local_id ?? '').trim();
  if (!role || !localId) {
    return { ok: false, message: 'Perfil incompleto para Oído Chef.', status: 403 };
  }

  const roleEnv = process.env.OIDO_CHEF_ALLOWED_ROLES;
  const allowedRoles = roleEnv ? parseCsv(roleEnv) : ['admin', 'manager'];
  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return { ok: false, message: 'Tu rol no tiene acceso a Oído Chef.', status: 403 };
  }

  const localEnv = process.env.OIDO_CHEF_ALLOWED_LOCAL_IDS;
  const allowedLocalIds = localEnv ? parseCsv(localEnv) : [];
  if (allowedLocalIds.length > 0 && !allowedLocalIds.includes(localId.toLowerCase())) {
    return { ok: false, message: 'Oído Chef no está habilitado para este local.', status: 403 };
  }

  const fallback = kind === 'tts' ? { limit: 12, windowMs: 10 * 60 * 1000 } : { limit: 20, windowMs: 10 * 60 * 1000 };
  const rateEnv = kind === 'tts' ? process.env.OIDO_CHEF_TTS_RATE_LIMIT : process.env.OIDO_CHEF_CHAT_RATE_LIMIT;
  const parsed = parseRateLimitSpec(rateEnv?.trim() || '', fallback.limit, fallback.windowMs);
  const rate = checkRateLimit({
    key: `oido:${kind}:${auth.userId}`,
    limit: parsed.limit,
    windowMs: parsed.windowMs,
  });
  if (!rate.ok) {
    return {
      ok: false,
      message: 'Has alcanzado el límite temporal de uso de Oído Chef. Inténtalo en breve.',
      status: 429,
      rateLimitRetryAfterSec: rate.retryAfterSec,
    };
  }

  return {
    ok: true,
    userId: auth.userId,
    email: auth.email,
    localId,
    role,
    rateLimitRetryAfterSec: rate.retryAfterSec,
  };
}
