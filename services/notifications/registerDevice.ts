import type { RegisterDeviceInput } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Registra o actualiza el dispositivo actual (base para Web Push).
 * Sin push_token: actualiza la fila “web” más reciente del usuario en el local o inserta una nueva.
 */
export async function registerDevice(supabase: SupabaseClient, input: RegisterDeviceInput): Promise<void> {
  const ua = input.userAgent?.slice(0, 512) ?? null;
  const platform = input.platform ?? (typeof navigator !== 'undefined' ? navigator.platform : null);
  const deviceType = input.deviceType ?? 'web';

  if (input.pushToken && input.pushToken.trim()) {
    const token = input.pushToken.trim();
    const { data: existing } = await supabase
      .from('user_devices')
      .select('id')
      .eq('user_id', input.userId)
      .eq('local_id', input.localId)
      .eq('push_token', token)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from('user_devices')
        .update({
          user_agent: ua,
          platform,
          device_type: deviceType,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (error) throw new Error(error.message);
      return;
    }

    const { error } = await supabase.from('user_devices').insert({
      user_id: input.userId,
      local_id: input.localId,
      device_type: deviceType,
      push_token: token,
      platform,
      user_agent: ua,
      is_active: true,
    });
    if (error) throw new Error(error.message);
    return;
  }

  const { data: rows } = await supabase
    .from('user_devices')
    .select('id')
    .eq('user_id', input.userId)
    .eq('local_id', input.localId)
    .is('push_token', null)
    .order('updated_at', { ascending: false })
    .limit(1);

  const row = rows?.[0] as { id?: string } | undefined;
  if (row?.id) {
    const { error } = await supabase
      .from('user_devices')
      .update({
        user_agent: ua,
        platform,
        device_type: deviceType,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from('user_devices').insert({
    user_id: input.userId,
    local_id: input.localId,
    device_type: deviceType,
    push_token: null,
    platform,
    user_agent: ua,
    is_active: true,
  });
  if (error) throw new Error(error.message);
}
