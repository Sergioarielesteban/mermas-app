import { NextResponse } from 'next/server';
import { requireSuperadminSupabaseUser } from '@/lib/require-allowed-supabase-user';
import { adminRestGet } from '@/lib/server/supabase-admin';
import type { PlanCode } from '@/lib/planPermissions';
import type { SubscriptionStatus } from '@/lib/subscriptions-supabase';
import { logCriticalAndGeneric } from '@/lib/server/api-safe';

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

function normalizePlanCode(v: string | null | undefined): PlanCode {
  if (v === 'OPERATIVO' || v === 'CONTROL' || v === 'PRO') return v;
  return 'OPERATIVO';
}

function normalizeStatus(v: string | null | undefined): SubscriptionStatus {
  if (v === 'active' || v === 'inactive' || v === 'canceled') return v;
  return 'inactive';
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
