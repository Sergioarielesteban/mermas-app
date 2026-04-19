import type { NotificationRow, NotificationWithRead } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeNotificationType } from './visibility';

export function mapNotificationRow(r: Record<string, unknown>): NotificationRow {
  return {
    id: String(r.id),
    localId: String(r.local_id),
    type: normalizeNotificationType(
      r.type != null ? String(r.type) : null,
      r.entity_type != null ? String(r.entity_type) : null,
    ),
    severity: (r.severity as NotificationRow['severity']) ?? 'info',
    title: String(r.title),
    message: String(r.message),
    createdBy: r.created_by != null ? String(r.created_by) : null,
    entityType: r.entity_type != null ? String(r.entity_type) : null,
    entityId: r.entity_id != null ? String(r.entity_id) : null,
    metadata:
      r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : {},
    createdAt: String(r.created_at),
  };
}

export type GetNotificationsOptions = {
  limit?: number;
  before?: string | null;
};

/**
 * Notificaciones del local con estado leído para el usuario actual.
 */
export async function getNotifications(
  supabase: SupabaseClient,
  localId: string,
  userId: string,
  opts?: GetNotificationsOptions,
): Promise<NotificationWithRead[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
  let q = supabase
    .from('notifications')
    .select('id,local_id,type,severity,title,message,created_by,entity_type,entity_id,metadata,created_at')
    .eq('local_id', localId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts?.before) {
    q = q.lt('created_at', opts.before);
  }

  const { data: notifs, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (notifs ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => String(r.id));
  const { data: reads, error: readErr } = await supabase
    .from('notification_reads')
    .select('notification_id,read_at')
    .eq('user_id', userId)
    .in('notification_id', ids);

  if (readErr) throw new Error(readErr.message);
  const readMap = new Map<string, string>();
  for (const x of reads ?? []) {
    const rid = (x as { notification_id?: string; read_at?: string }).notification_id;
    const ra = (x as { read_at?: string }).read_at;
    if (rid && ra) readMap.set(rid, ra);
  }

  return rows.map((r) => {
    const base = mapNotificationRow(r);
    const ra = readMap.get(base.id) ?? null;
    return { ...base, readAt: ra };
  });
}

export async function getUnreadNotificationsCount(
  supabase: SupabaseClient,
  localId: string,
  userId: string,
): Promise<number> {
  const { data: notifs, error } = await supabase
    .from('notifications')
    .select('id')
    .eq('local_id', localId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const ids = (notifs ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return 0;

  const { data: reads, error: rErr } = await supabase
    .from('notification_reads')
    .select('notification_id')
    .eq('user_id', userId)
    .in('notification_id', ids);
  if (rErr) throw new Error(rErr.message);
  const readSet = new Set((reads ?? []).map((x: { notification_id: string }) => x.notification_id));
  return ids.filter((id) => !readSet.has(id)).length;
}
