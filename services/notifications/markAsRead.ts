import type { SupabaseClient } from '@supabase/supabase-js';

export async function markNotificationAsRead(
  supabase: SupabaseClient,
  notificationId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from('notification_reads').upsert(
    {
      notification_id: notificationId,
      user_id: userId,
      read_at: new Date().toISOString(),
    },
    { onConflict: 'notification_id,user_id' },
  );
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsAsRead(
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase.rpc('mark_all_notifications_read_for_local');
  if (error) throw new Error(error.message);
}
