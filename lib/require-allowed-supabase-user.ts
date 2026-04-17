import { isAllowedEmail } from '@/lib/auth-access';
import { verifySupabaseBearer } from '@/lib/supabase-verify-bearer';

export type AllowedSupabaseUserResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; message: string; status: number };

/**
 * Sesión Supabase válida + email en allowlist (misma política que /api/sync).
 */
export async function requireAllowedSupabaseUser(request: Request): Promise<AllowedSupabaseUserResult> {
  const auth = await verifySupabaseBearer(request);
  if (!auth.ok) {
    return { ok: false, message: auth.message, status: auth.status };
  }
  const email = (auth.email ?? '').trim().toLowerCase();
  if (!email) {
    return { ok: false, message: 'Usuario sin email.', status: 403 };
  }
  if (!isAllowedEmail(email)) {
    return { ok: false, message: 'Unauthorized email', status: 401 };
  }
  return { ok: true, userId: auth.userId, email };
}
