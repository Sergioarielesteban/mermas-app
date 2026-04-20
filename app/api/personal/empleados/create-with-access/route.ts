import { NextResponse } from 'next/server';
import { requireProfileRoles } from '@/lib/require-allowed-supabase-user';
import {
  adminCreateAuthUser,
  adminDeleteAuthUser,
  adminRestDelete,
  adminRestGet,
  adminRestPost,
  adminRestPostJson,
  isSupabaseAdminConfigured,
} from '@/lib/server/supabase-admin';
import { jsonGenericError, logCriticalAndGeneric } from '@/lib/server/api-safe';
import { readJsonBodyLimitedEx } from '@/lib/server/read-json-limited';
import { parseProfileAppRole, type ProfileAppRole } from '@/lib/profile-app-role';
import { DEFAULT_MAX_USERS } from '@/lib/planPermissions';

const MAX_BODY_BYTES = 32 * 1024;
const MIN_PASSWORD_LEN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CreateWithAccessBody = {
  firstName?: unknown;
  lastName?: unknown;
  alias?: unknown;
  phone?: unknown;
  email?: unknown;
  operationalRole?: unknown;
  color?: unknown;
  pinFichaje?: unknown;
  createAccess?: unknown;
  accessEmail?: unknown;
  tempPassword?: unknown;
  appRole?: unknown;
};

function cleanText(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function cleanNullable(v: unknown, max = 200): string | null {
  const out = cleanText(v, max);
  return out || null;
}

function cleanEmail(v: unknown): string {
  return cleanText(v, 220).toLowerCase();
}

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

export async function POST(request: Request) {
  const actor = await requireProfileRoles(request, ['admin', 'manager']);
  if (!actor.ok) {
    return NextResponse.json({ ok: false, error: actor.message || 'No autorizado' }, { status: actor.status });
  }
  if (!isSupabaseAdminConfigured()) {
    return jsonGenericError(503);
  }

  let createdAuthUserId: string | null = null;
  try {
    const parsed = await readJsonBodyLimitedEx(request, MAX_BODY_BYTES);
    if (!parsed.ok) {
      return NextResponse.json(
        { ok: false, error: 'No se pudo procesar la solicitud' },
        { status: parsed.kind === 'too_large' ? 413 : 400 },
      );
    }
    const body = parsed.data as CreateWithAccessBody;
    const firstName = cleanText(body.firstName, 120);
    if (!firstName) {
      return NextResponse.json({ ok: false, error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const lastName = cleanText(body.lastName, 120);
    const alias = cleanNullable(body.alias, 120);
    const phone = cleanNullable(body.phone, 40);
    const email = cleanEmail(body.email) || null;
    const operationalRole = cleanNullable(body.operationalRole, 120);
    const color = cleanNullable(body.color, 20);
    const pinFichaje = cleanText(body.pinFichaje, 4) || null;
    const createAccess = body.createAccess === true;

    if (!createAccess) {
      await adminRestPost('staff_employees', [
        {
          local_id: actor.localId,
          user_id: null,
          first_name: firstName,
          last_name: lastName,
          alias,
          phone,
          email,
          operational_role: operationalRole,
          color,
          pin_fichaje: pinFichaje,
          active: true,
        },
      ]);
      return NextResponse.json({ ok: true, createdAccess: false });
    }

    const accessEmail = cleanEmail(body.accessEmail || email);
    const tempPassword = cleanText(body.tempPassword, 256);
    let appRole = parseProfileAppRole(cleanText(body.appRole, 20));
    if (actor.role !== 'admin') {
      appRole = 'staff';
    }
    if (!EMAIL_RE.test(accessEmail)) {
      return NextResponse.json({ ok: false, error: 'Introduce un email válido para el acceso' }, { status: 400 });
    }
    if (tempPassword.length < MIN_PASSWORD_LEN) {
      return NextResponse.json(
        { ok: false, error: 'La contraseña temporal debe tener al menos 8 caracteres' },
        { status: 400 },
      );
    }

    if (isRoleOperational(appRole)) {
      const [maxUsers, used] = await Promise.all([
        readMaxUsersForLocal(actor.localId),
        countOperationalUsers(actor.localId),
      ]);
      if (used >= maxUsers) {
        return NextResponse.json({ ok: false, error: 'No hay cupo para más usuarios operativos' }, { status: 409 });
      }
    }

    try {
      const created = await adminCreateAuthUser({ email: accessEmail, password: tempPassword });
      createdAuthUserId = created.id;
    } catch (e) {
      const msg = e instanceof Error ? e.message.toLowerCase() : '';
      if (msg.includes('already') || msg.includes('registered') || msg.includes('duplicate')) {
        return NextResponse.json({ ok: false, error: 'Ese email ya está en uso' }, { status: 409 });
      }
      return NextResponse.json({ ok: false, error: 'No se pudo crear el acceso a la app' }, { status: 502 });
    }

    const fullName = `${firstName} ${lastName}`.trim();

    try {
      await adminRestPost('profiles', [
        {
          user_id: createdAuthUserId,
          email: accessEmail,
          full_name: fullName || null,
          role: appRole,
          local_id: actor.localId,
          is_active: true,
        },
      ]);
    } catch {
      await adminDeleteAuthUser(createdAuthUserId).catch(() => {});
      return NextResponse.json({ ok: false, error: 'No se pudo crear el acceso a la app' }, { status: 502 });
    }

    try {
      await adminRestPostJson('staff_employees?select=id', [
        {
          local_id: actor.localId,
          user_id: createdAuthUserId,
          first_name: firstName,
          last_name: lastName,
          alias,
          phone,
          email: accessEmail,
          operational_role: operationalRole,
          color,
          pin_fichaje: pinFichaje,
          active: true,
        },
      ]);
    } catch {
      await adminRestDelete(`profiles?user_id=eq.${encodeURIComponent(createdAuthUserId)}`).catch(() => {});
      await adminDeleteAuthUser(createdAuthUserId).catch(() => {});
      return NextResponse.json({ ok: false, error: 'No se pudo crear el empleado' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, createdAccess: true });
  } catch (err) {
    if (createdAuthUserId) {
      await adminRestDelete(`profiles?user_id=eq.${encodeURIComponent(createdAuthUserId)}`).catch(() => {});
      await adminDeleteAuthUser(createdAuthUserId).catch(() => {});
    }
    return logCriticalAndGeneric('POST /api/personal/empleados/create-with-access', err);
  }
}

