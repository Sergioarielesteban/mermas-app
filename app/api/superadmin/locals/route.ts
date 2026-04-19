import { NextResponse } from 'next/server';
import { requireSuperadminSupabaseUser } from '@/lib/require-allowed-supabase-user';
import {
  adminCreateAuthUser,
  adminDeleteAuthUser,
  adminRestDelete,
  adminRestGet,
  adminRestPost,
  adminRestPostJson,
} from '@/lib/server/supabase-admin';
import type { PlanCode } from '@/lib/planPermissions';
import type { SubscriptionStatus } from '@/lib/subscriptions-supabase';
import { logCriticalAndGeneric } from '@/lib/server/api-safe';
import { readJsonBodyLimitedEx } from '@/lib/server/read-json-limited';

type LocalRow = {
  id?: string;
  code?: string | null;
  name?: string | null;
  is_central_kitchen?: boolean | null;
};

type SubscriptionRow = {
  id?: string;
  local_id?: string | null;
  plan_code?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type GlobalLocalItem = {
  localId: string;
  localCode: string | null;
  localName: string | null;
  isCentralKitchen: boolean;
  planCode: PlanCode;
  status: SubscriptionStatus;
  startsAt: string | null;
};

type CreateLocalBody = {
  localName?: unknown;
  localCode?: unknown;
  city?: unknown;
  adminName?: unknown;
  adminEmail?: unknown;
  tempPassword?: unknown;
  planCode?: unknown;
  status?: unknown;
};

const MAX_BODY_BYTES = 20 * 1024;
const MIN_PASSWORD_LEN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizePlanCode(v: string | null | undefined): PlanCode {
  if (v === 'OPERATIVO' || v === 'CONTROL' || v === 'PRO') return v;
  return 'OPERATIVO';
}

function normalizeStatus(v: string | null | undefined): SubscriptionStatus {
  if (v === 'active' || v === 'inactive' || v === 'canceled') return v;
  return 'inactive';
}

function cleanText(v: unknown, max = 140): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function toCodeLike(input: string): string {
  const normalized = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const clean = normalized
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  return clean.slice(0, 24);
}

function makeCodeCandidate(localName: string, requested: string): string {
  const fromRequested = toCodeLike(requested);
  if (fromRequested) return fromRequested;
  const fromName = toCodeLike(localName);
  if (fromName) return fromName;
  return `LOCAL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function buildUniqueLocalCode(base: string): Promise<string> {
  let attempt = 0;
  let candidate = base;
  while (attempt < 20) {
    const rows = await adminRestGet<Array<{ id?: string }>>(
      `locals?code=eq.${encodeURIComponent(candidate)}&select=id&limit=1`,
    );
    if (!rows[0]?.id) return candidate;
    attempt += 1;
    candidate = `${base}-${attempt + 1}`.slice(0, 24);
  }
  return `${base.slice(0, 20)}-${Date.now().toString().slice(-3)}`;
}

export async function GET(request: Request) {
  const actor = await requireSuperadminSupabaseUser(request);
  if (!actor.ok) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: actor.status });
  }
  try {
    const [locals, subscriptions] = await Promise.all([
      adminRestGet<LocalRow[]>('locals?select=id,code,name,is_central_kitchen&order=name.asc'),
      adminRestGet<SubscriptionRow[]>(
        'subscriptions?select=id,local_id,plan_code,status,created_at,updated_at&order=updated_at.desc.nullslast&order=created_at.desc.nullslast',
      ),
    ]);

    const byLocal = new Map<string, SubscriptionRow>();
    for (const row of subscriptions) {
      const localId = typeof row.local_id === 'string' ? row.local_id : '';
      if (!localId || byLocal.has(localId)) continue;
      byLocal.set(localId, row);
    }

    const out: GlobalLocalItem[] = [];
    for (const local of locals) {
      const localId = typeof local.id === 'string' ? local.id : '';
      if (!localId) continue;
      const sub = byLocal.get(localId);
      out.push({
        localId,
        localCode: typeof local.code === 'string' ? local.code : null,
        localName: typeof local.name === 'string' ? local.name : null,
        isCentralKitchen: !!local.is_central_kitchen,
        planCode: normalizePlanCode(sub?.plan_code ?? null),
        status: normalizeStatus(sub?.status ?? null),
        startsAt: typeof sub?.created_at === 'string' ? sub.created_at : null,
      });
    }

    return NextResponse.json({ ok: true, locals: out });
  } catch (error) {
    return logCriticalAndGeneric('GET /api/superadmin/locals', error);
  }
}

export async function POST(request: Request) {
  const actor = await requireSuperadminSupabaseUser(request);
  if (!actor.ok) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: actor.status });
  }

  let createdLocalId: string | null = null;
  let createdAuthUserId: string | null = null;
  let createdSubscriptionId: string | null = null;

  try {
    const parsed = await readJsonBodyLimitedEx(request, MAX_BODY_BYTES);
    if (!parsed.ok) {
      return NextResponse.json(
        { ok: false, error: 'No se pudo procesar la solicitud' },
        { status: parsed.kind === 'too_large' ? 413 : 400 },
      );
    }
    const body = parsed.data as CreateLocalBody;
    const localName = cleanText(body.localName, 120);
    const requestedCode = cleanText(body.localCode, 40);
    const city = cleanText(body.city, 80);
    const adminName = cleanText(body.adminName, 120);
    const adminEmail = cleanText(body.adminEmail, 220).toLowerCase();
    const tempPassword = cleanText(body.tempPassword, 180);
    const planCode = normalizePlanCode(typeof body.planCode === 'string' ? body.planCode : null);
    const status = normalizeStatus(typeof body.status === 'string' ? body.status : null);

    if (!localName) {
      return NextResponse.json({ ok: false, error: 'El nombre del local es obligatorio.' }, { status: 400 });
    }
    if (!adminName) {
      return NextResponse.json({ ok: false, error: 'El nombre del responsable es obligatorio.' }, { status: 400 });
    }
    if (!EMAIL_RE.test(adminEmail)) {
      return NextResponse.json({ ok: false, error: 'Email de administrador inválido.' }, { status: 400 });
    }
    if (tempPassword.length < MIN_PASSWORD_LEN) {
      return NextResponse.json({ ok: false, error: 'La contraseña temporal debe tener al menos 8 caracteres.' }, { status: 400 });
    }

    const existingEmail = await adminRestGet<Array<{ user_id?: string }>>(
      `profiles?email=eq.${encodeURIComponent(adminEmail)}&select=user_id&limit=1`,
    );
    if (existingEmail[0]?.user_id) {
      return NextResponse.json(
        { ok: false, error: 'Ese email ya está registrado. Usa otro para el admin.' },
        { status: 409 },
      );
    }

    const existingName = await adminRestGet<Array<{ id?: string }>>(
      `locals?name=eq.${encodeURIComponent(localName)}&select=id&limit=1`,
    );
    if (existingName[0]?.id) {
      return NextResponse.json({ ok: false, error: 'Ya existe un local con ese nombre.' }, { status: 409 });
    }

    const codeBase = makeCodeCandidate(localName, requestedCode);
    const localCode = await buildUniqueLocalCode(codeBase);

    const createdLocals = await adminRestPostJson<Array<{ id?: string; code?: string | null; name?: string | null }>>(
      'locals?select=id,code,name',
      [
        {
          code: localCode,
          name: localName,
          city: city || null,
          is_active: status === 'active',
        },
      ],
    );
    createdLocalId = typeof createdLocals[0]?.id === 'string' ? createdLocals[0].id : null;
    if (!createdLocalId) throw new Error('No se pudo crear el local');

    const createdAuth = await adminCreateAuthUser({ email: adminEmail, password: tempPassword });
    createdAuthUserId = createdAuth.id;

    await adminRestPost('profiles', [
      {
        user_id: createdAuthUserId,
        email: adminEmail,
        full_name: adminName,
        role: 'admin',
        local_id: createdLocalId,
        is_active: true,
      },
    ]);

    const createdSubs = await adminRestPostJson<Array<{ id?: string; created_at?: string | null }>>(
      'subscriptions?select=id,created_at',
      [
        {
          local_id: createdLocalId,
          plan_code: planCode,
          status,
          provider: 'manual',
        },
      ],
    );
    createdSubscriptionId = typeof createdSubs[0]?.id === 'string' ? createdSubs[0].id : null;

    return NextResponse.json({
      ok: true,
      local: {
        localId: createdLocalId,
        localCode,
        localName,
        isCentralKitchen: false,
        planCode,
        status,
        startsAt: (typeof createdSubs[0]?.created_at === 'string' ? createdSubs[0].created_at : null) ?? new Date().toISOString(),
      },
      credentials: {
        adminEmail,
        tempPassword,
      },
      summary: {
        localCreated: true,
        adminUserCreated: true,
        planAssigned: planCode,
      },
    });
  } catch (error) {
    const issues: string[] = [];
    if (createdSubscriptionId) {
      await adminRestDelete(`subscriptions?id=eq.${encodeURIComponent(createdSubscriptionId)}`).catch((e: unknown) => {
        issues.push(`No se pudo revertir suscripción: ${e instanceof Error ? e.message : 'error desconocido'}`);
      });
    }
    if (createdAuthUserId) {
      await adminRestDelete(`profiles?user_id=eq.${encodeURIComponent(createdAuthUserId)}`).catch((e: unknown) => {
        issues.push(`No se pudo revertir profile: ${e instanceof Error ? e.message : 'error desconocido'}`);
      });
      await adminDeleteAuthUser(createdAuthUserId).catch((e: unknown) => {
        issues.push(`No se pudo revertir auth user: ${e instanceof Error ? e.message : 'error desconocido'}`);
      });
    }
    if (createdLocalId) {
      await adminRestDelete(`locals?id=eq.${encodeURIComponent(createdLocalId)}`).catch((e: unknown) => {
        issues.push(`No se pudo revertir local: ${e instanceof Error ? e.message : 'error desconocido'}`);
      });
    }

    const message = error instanceof Error ? error.message : 'No se pudo crear la cuenta completa.';
    if (message.toLowerCase().includes('already') || message.toLowerCase().includes('duplicate')) {
      return NextResponse.json(
        { ok: false, error: 'El email del administrador ya existe en Supabase Auth.' },
        { status: 409 },
      );
    }
    if (issues.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Fallo durante el alta y hubo elementos que no se pudieron revertir completamente.',
          details: issues,
        },
        { status: 500 },
      );
    }
    return logCriticalAndGeneric('POST /api/superadmin/locals', error);
  }
}
