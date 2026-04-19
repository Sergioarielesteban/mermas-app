/**
 * Validación de sesión Supabase + perfil en servidor (service role).
 *
 * Middleware global de Next.js (auth por ruta): NO se implementa en esta fase base porque:
 * - Las rutas públicas (/, /login, /precio, landing, leads) conviven con la app; un matcher
 *   incompleto rompe flujos o duplica lógica con RoleRouteGate (cliente).
 * - La restricción por rol en UI sigue en RoleRouteGate + menú; la protección de datos en
 *   Supabase sigue en RLS; las API routes aquí validan Bearer + perfil y, cuando aplica, rol.
 * - Añadir middleware solo para redirigir por cookie duplicaría coherencia con el enfoque SPA.
 * Revisar en auditoría previa a App Store si conviene matcher mínimo solo para /app o rutas /api.
 */
import { getProfileAccessByUserId, isSupabaseAdminConfigured } from '@/lib/server/supabase-admin';
import { verifySupabaseBearer } from '@/lib/supabase-verify-bearer';
import type { ProfileAppRole } from '@/lib/profile-app-role';
import { parseProfileAppRole } from '@/lib/profile-app-role';
import { isEmailInAllowlist } from '@/lib/superadmin-access';

export type AllowedSupabaseUserResult =
  | { ok: true; userId: string; email: string; localId: string; role: ProfileAppRole }
  | { ok: false; message: string; status: number };

/**
 * Sesión Supabase válida + perfil activo con local (sin allowlist de emails en código).
 * Incluye rol y local_id para comprobaciones en servidor sin depender solo de la UI.
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
  const localId = String(profile.local_id ?? '').trim();
  if (!localId) {
    return { ok: false, message: 'Perfil sin local asignado.', status: 403 };
  }

  const role = parseProfileAppRole(profile.role);
  return { ok: true, userId: auth.userId, email, localId, role };
}

/** Solo administración (finanzas, escandallos, endpoints reservados admin cuando existan). */
export async function requireAdminSupabaseUser(request: Request): Promise<AllowedSupabaseUserResult> {
  return requireProfileRoles(request, ['admin']);
}

/**
 * Debe tener uno de los roles indicados. Si la lista está vacía, equivale a requireAllowedSupabaseUser.
 */
export async function requireProfileRoles(
  request: Request,
  allowed: readonly ProfileAppRole[],
): Promise<AllowedSupabaseUserResult> {
  const u = await requireAllowedSupabaseUser(request);
  if (!u.ok) return u;
  if (allowed.length > 0 && !allowed.includes(u.role)) {
    return { ok: false, message: 'Permiso insuficiente para esta operación.', status: 403 };
  }
  return u;
}

export async function requireSuperadminSupabaseUser(request: Request): Promise<AllowedSupabaseUserResult> {
  const u = await requireAllowedSupabaseUser(request);
  if (!u.ok) return u;
  const csv = process.env.SUPERADMIN_EMAILS ?? process.env.NEXT_PUBLIC_SUPERADMIN_EMAILS ?? '';
  if (!isEmailInAllowlist(u.email, csv)) {
    return { ok: false, message: 'Permiso insuficiente para panel global.', status: 403 };
  }
  return u;
}
