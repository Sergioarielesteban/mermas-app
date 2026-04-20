import { NextResponse } from 'next/server';
import { requireProfileRoles } from '@/lib/require-allowed-supabase-user';
import { adminRestGet, adminRestPatch, isSupabaseAdminConfigured } from '@/lib/server/supabase-admin';
import { jsonGenericError, logCriticalAndGeneric } from '@/lib/server/api-safe';
import { readJsonBodyLimitedEx } from '@/lib/server/read-json-limited';
import { parseProfileAppRole, type ProfileAppRole } from '@/lib/profile-app-role';
import { DEFAULT_MAX_USERS } from '@/lib/planPermissions';

const MAX_BODY = 8 * 1024;

function isRoleOperational(role: ProfileAppRole): boolean {
  return role === 'admin' || role === 'manager';
}

async function readMaxUsersForLocal(localId: string): Promise<number> {
  void localId;
  return DEFAULT_MAX_USERS;
}

async function countOperationalUsers(localId: string): Promise<number> {
  const rows = await adminRestGet<Array<{ user_id?: string | null }>>(
    `profiles?local_id=eq.${encodeURIComponent(localId)}&is_active=eq.true&role=in.(admin,manager)&select=user_id`,
  );
  return rows.length;
}

type Body = { userId?: unknown; appRole?: unknown };

export async function POST(request: Request) {
  const actor = await requireProfileRoles(request, ['admin']);
  if (!actor.ok) {
    return NextResponse.json({ ok: false, error: actor.message || 'No autorizado' }, { status: actor.status });
  }
  if (!isSupabaseAdminConfigured()) {
    return jsonGenericError(503);
  }
  try {
    const parsed = await readJsonBodyLimitedEx(request, MAX_BODY);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: 'Solicitud no válida' }, { status: 400 });
    }
    const body = parsed.data as Body;
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'userId requerido' }, { status: 400 });
    }
    const nextRole = parseProfileAppRole(typeof body.appRole === 'string' ? body.appRole : 'staff');
    const rows = await adminRestGet<Array<{ role?: string | null }>>(
      `profiles?user_id=eq.${encodeURIComponent(userId)}&local_id=eq.${encodeURIComponent(actor.localId)}&select=role&limit=1`,
    );
    if (!rows.length) {
      return NextResponse.json({ ok: false, error: 'Perfil no encontrado en este local' }, { status: 404 });
    }
    const prevRole = parseProfileAppRole(rows[0]?.role);
    const prevOp = isRoleOperational(prevRole);
    const nextOp = isRoleOperational(nextRole);
    if (nextOp && !prevOp) {
      const [maxUsers, used] = await Promise.all([
        readMaxUsersForLocal(actor.localId),
        countOperationalUsers(actor.localId),
      ]);
      if (used >= maxUsers) {
        return NextResponse.json({ ok: false, error: 'No hay cupo para más usuarios operativos' }, { status: 409 });
      }
    }
    await adminRestPatch(
      `profiles?user_id=eq.${encodeURIComponent(userId)}&local_id=eq.${encodeURIComponent(actor.localId)}`,
      { role: nextRole },
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return logCriticalAndGeneric('POST /api/personal/empleados/update-linked-profile', e);
  }
}
