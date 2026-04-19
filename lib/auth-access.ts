/**
 * Allowlist opcional vía entorno (NO hardcode en código).
 * Si la lista está vacía, no se restringe por email en el cliente (el control real es Supabase Auth + profiles).
 *
 * Variables:
 * - NEXT_PUBLIC_LOGIN_EMAIL_ALLOWLIST — separada por comas, solo para modo legacy / restricción explícita.
 */

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function parseAllowlistFromEnv(): string[] {
  const raw =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_LOGIN_EMAIL_ALLOWLIST?.trim()) || '';
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => normalizeEmail(s))
    .filter(Boolean);
}

export function getAllowedEmails(): readonly string[] {
  return parseAllowlistFromEnv();
}

/**
 * Uso principal: pantalla de login cuando no hay Supabase (legacy).
 * Con lista vacía: no bloquea por email aquí (Supabase Auth + profiles + RLS en producción).
 */
export function isAllowedEmail(email: string) {
  const allowed = parseAllowlistFromEnv();
  if (allowed.length === 0) return true;
  return allowed.includes(normalizeEmail(email));
}
