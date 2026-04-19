import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanCode } from '@/lib/planPermissions';

export type SubscriptionStatus = 'active' | 'inactive' | 'canceled';
export type SubscriptionProvider = 'manual' | 'apple' | 'google' | 'external';

export type LocalSubscription = {
  id: string;
  localId: string;
  planCode: PlanCode;
  provider: SubscriptionProvider;
  status: SubscriptionStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
};

function normalizePlan(value: string | null | undefined): PlanCode {
  if (value === 'OPERATIVO' || value === 'CONTROL' || value === 'PRO') return value;
  return 'OPERATIVO';
}

function normalizeStatus(value: string | null | undefined): SubscriptionStatus {
  if (value === 'active' || value === 'inactive' || value === 'canceled') return value;
  return 'inactive';
}

function normalizeProvider(value: string | null | undefined): SubscriptionProvider {
  if (value === 'manual' || value === 'apple' || value === 'google' || value === 'external') return value;
  if (value === 'stripe') return 'external';
  return 'manual';
}

function mapSubscriptionRow(row: Record<string, unknown>): LocalSubscription {
  return {
    id: String(row.id),
    localId: String(row.local_id),
    planCode: normalizePlan(typeof row.plan_code === 'string' ? row.plan_code : null),
    provider: normalizeProvider(typeof row.provider === 'string' ? row.provider : null),
    status: normalizeStatus(typeof row.status === 'string' ? row.status : null),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    expiresAt: typeof row.expires_at === 'string' ? row.expires_at : null,
  };
}

export async function fetchActiveSubscriptionByLocal(
  supabase: SupabaseClient,
  localId: string,
): Promise<LocalSubscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, local_id, plan_code, provider, status, created_at, updated_at, expires_at')
    .eq('local_id', localId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapSubscriptionRow(data as Record<string, unknown>);
}

export async function upsertManualSubscriptionPlan(
  supabase: SupabaseClient,
  localId: string,
  nextPlan: PlanCode,
): Promise<LocalSubscription> {
  const active = await fetchActiveSubscriptionByLocal(supabase, localId);
  if (active) {
    const { data, error } = await supabase
      .from('subscriptions')
      .update({
        plan_code: nextPlan,
        provider: 'manual',
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', active.id)
      .select('id, local_id, plan_code, provider, status, created_at, updated_at, expires_at')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'No se pudo actualizar la suscripción');
    return mapSubscriptionRow(data as Record<string, unknown>);
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      local_id: localId,
      plan_code: nextPlan,
      provider: 'manual',
      status: 'active',
    })
    .select('id, local_id, plan_code, provider, status, created_at, updated_at, expires_at')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'No se pudo crear la suscripción');
  return mapSubscriptionRow(data as Record<string, unknown>);
}

export async function countOperationalUsersForLocal(supabase: SupabaseClient, localId: string): Promise<number> {
  const { count, error } = await supabase
    .from('profiles')
    .select('user_id', { count: 'exact', head: true })
    .eq('local_id', localId)
    .in('role', ['admin', 'manager']);
  if (error) throw new Error(error.message);
  return typeof count === 'number' && Number.isFinite(count) && count >= 0 ? count : 0;
}
