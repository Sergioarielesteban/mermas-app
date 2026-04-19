import { NextResponse } from 'next/server';
import { requireSuperadminSupabaseUser } from '@/lib/require-allowed-supabase-user';
import { adminRestGet, adminRestPatch, adminRestPostJson } from '@/lib/server/supabase-admin';
import type { PlanCode } from '@/lib/planPermissions';
import type { SubscriptionStatus } from '@/lib/subscriptions-supabase';
import { readJsonBodyLimitedEx } from '@/lib/server/read-json-limited';

const MAX_BODY_BYTES = 12 * 1024;

type UpdateBody = {
  planCode?: unknown;
  status?: unknown;
};

type SubscriptionRow = {
  id?: string;
  local_id?: string | null;
  plan_code?: string | null;
  provider?: string | null;
  status?: string | null;
  max_users?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function normalizePlanCode(v: unknown): PlanCode | null {
  if (v === 'OPERATIVO' || v === 'CONTROL' || v === 'PRO') return v;
  return null;
}

function normalizeStatus(v: unknown): SubscriptionStatus | null {
  if (v === 'active' || v === 'inactive' || v === 'canceled') return v;
  return null;
}

async function upsertSubscriptionByLocal(input: {
  localId: string;
  planCode: PlanCode;
  status: SubscriptionStatus;
}): Promise<{ row: SubscriptionRow | null; updatedAt: string }> {
  const nowIso = new Date().toISOString();
  const rows = await adminRestGet<SubscriptionRow[]>(
    `subscriptions?local_id=eq.${encodeURIComponent(input.localId)}&select=id,local_id,plan_code,provider,status,max_users,created_at,updated_at&order=updated_at.desc.nullslast&order=created_at.desc.nullslast&limit=1`,
  );
  const existing = rows[0];

  if (existing?.id) {
    const patched = await adminRestPatch<SubscriptionRow[]>(
      `subscriptions?id=eq.${encodeURIComponent(String(existing.id))}&select=id,local_id,plan_code,provider,status,max_users,created_at,updated_at`,
      {
        plan_code: input.planCode,
        status: input.status,
        provider: typeof existing.provider === 'string' && existing.provider.trim() ? existing.provider : 'manual',
        updated_at: nowIso,
      },
    );
    return { row: patched[0] ?? null, updatedAt: nowIso };
  }

  const created = await adminRestPostJson<SubscriptionRow[]>(
    'subscriptions?select=id,local_id,plan_code,provider,status,max_users,created_at,updated_at',
    [
      {
        local_id: input.localId,
        plan_code: input.planCode,
        status: input.status,
        provider: 'manual',
        max_users: 5,
        created_at: nowIso,
        updated_at: nowIso,
      },
    ],
  );
  return { row: created[0] ?? null, updatedAt: nowIso };
}

export async function PATCH(request: Request, context: { params: Promise<{ localId: string }> }) {
  const actor = await requireSuperadminSupabaseUser(request);
  if (!actor.ok) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: actor.status });
  }

  let requestedLocalId = 'unknown';
  try {
    const { localId: rawLocalId } = await context.params;
    const localId = decodeURIComponent(String(rawLocalId ?? '')).trim();
    requestedLocalId = localId || 'unknown';
    if (!localId) return NextResponse.json({ ok: false, error: 'Local inválido' }, { status: 400 });

    const parsed = await readJsonBodyLimitedEx(request, MAX_BODY_BYTES);
    if (!parsed.ok) {
      return NextResponse.json(
        { ok: false, error: 'No se pudo procesar la solicitud' },
        { status: parsed.kind === 'too_large' ? 413 : 400 },
      );
    }
    const body = parsed.data as UpdateBody;
    const planCode = normalizePlanCode(body.planCode);
    const status = normalizeStatus(body.status);
    if (!planCode || !status) {
      return NextResponse.json({ ok: false, error: 'Datos inválidos para plan/estado' }, { status: 400 });
    }

    const { row: updated, updatedAt } = await upsertSubscriptionByLocal({ localId, planCode, status });

    return NextResponse.json({
      ok: true,
      localId,
      subscription: {
        planCode: (updated?.plan_code as PlanCode | null) ?? planCode,
        status: (updated?.status as SubscriptionStatus | null) ?? status,
        startsAt: typeof updated?.created_at === 'string' ? updated.created_at : null,
        updatedAt: typeof updated?.updated_at === 'string' ? updated.updated_at : updatedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo guardar la suscripción del local.';
    const status = message.toLowerCase().includes('duplicate') ? 409 : 500;
    console.warn('[superadmin][subscriptions][save-failed]', {
      route: 'PATCH /api/superadmin/locals/[localId]',
      localId: requestedLocalId,
      message,
    });
    return NextResponse.json(
      {
        ok: false,
        error: 'No se pudo guardar la suscripción del local.',
        detail: message,
      },
      { status },
    );
  }
}
