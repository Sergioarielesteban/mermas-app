import type { CreateNotificationInput, NotificationRow } from './types';
import { defaultSeverityForType } from './constants';
import { preparePushDispatch } from './pushDispatch';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeNotificationType } from './visibility';

function mapRow(r: Record<string, unknown>): NotificationRow {
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

/**
 * Inserta una notificación para el local. Respeta RLS: local_id debe ser current_local_id().
 */
export async function createNotification(
  supabase: SupabaseClient,
  input: CreateNotificationInput,
): Promise<NotificationRow> {
  const normalizedType = normalizeNotificationType(input.type, input.entityType);
  const severity = input.severity ?? defaultSeverityForType(normalizedType);
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      local_id: input.localId,
      type: normalizedType,
      severity,
      title: input.title.trim(),
      message: input.message.trim(),
      created_by: input.createdBy ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      metadata: input.metadata ?? {},
    })
    .select(
      'id,local_id,type,severity,title,message,created_by,entity_type,entity_id,metadata,created_at',
    )
    .single();

  if (error) throw new Error(error.message);
  const row = mapRow(data as Record<string, unknown>);
  void preparePushDispatch(supabase, row).catch(() => {});
  return row;
}

/**
 * Igual que createNotification pero no lanza (útil en integraciones para no romper flujos).
 */
export async function safeCreateNotification(
  supabase: SupabaseClient,
  input: CreateNotificationInput,
): Promise<NotificationRow | null> {
  try {
    return await createNotification(supabase, input);
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[notifications] safeCreateNotification:', e instanceof Error ? e.message : e);
    }
    return null;
  }
}
