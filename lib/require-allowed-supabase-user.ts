import { getProfileAccessByUserId, isSupabaseAdminConfigured } from '@/lib/server/supabase-admin';
import { verifySupabaseBearer } from '@/lib/supabase-verify-bearer';

export type AllowedSupabaseUserResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; message: string; status: number };

/**
 * Sesión Supabase válida + perfil activo con local (sin allowlist de emails en código).
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
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: 'Servidor sin configuración para validar perfil.', status: 503 };
  }

  const profile = await getProfileAccessByUserId(auth.userId);
  if (!profile || !profile.is_active) {
    return { ok: false, message: 'Cuenta no activa o sin perfil asignado.', status: 403 };
  }
  if (!profile.local_id) {
    return { ok: false, message: 'Perfil sin local asignado.', status: 403 };
  }

  return { ok: true, userId: auth.userId, email };
}
