import type { SupabaseClient } from '@supabase/supabase-js';
import { safeCreateNotification } from './createNotification';

export async function notifyStaffWeekSchedulePublished(
  supabase: SupabaseClient,
  input: {
    localId: string;
    weekStartMondayYmd: string;
    publicationId: string;
    createdBy: string;
    republish: boolean;
    targetUserIds: string[];
  },
): Promise<void> {
  if (input.targetUserIds.length === 0) return;
  const title = input.republish ? 'Horario actualizado' : 'Horario publicado';
  const message = input.republish
    ? 'Tu horario semanal ha sido actualizado.'
    : 'Ya está disponible tu horario de la semana.';
  await safeCreateNotification(supabase, {
    localId: input.localId,
    type: 'planificacion_publicada',
    title,
    message,
    createdBy: input.createdBy,
    entityType: 'staff_week_schedule',
    entityId: input.publicationId,
    metadata: {
      week_start_monday: input.weekStartMondayYmd,
      target_user_ids: input.targetUserIds,
      republish: input.republish,
    },
  });
}
