import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationRow } from './types';

/**
 * Punto de extensión para enviar push a dispositivos del local tras crear una notificación.
 *
 * **Estado actual:** no envía nada. `user_devices` ya almacena filas para cuando exista backend.
 *
 * **Para activar Web Push en producción:**
 * 1. Generar claves VAPID (web-push / dashboard).
 * 2. Guardar `VAPID_PUBLIC_KEY` en el cliente y privada solo en Edge Function o servidor.
 * 3. En el service worker (`public/sw.js` o equivalente): `self.addEventListener('push', ...)`.
 * 4. Tras `createNotification`, llamar a una Edge Function `notify-local-push` que:
 *    - lea `user_devices` con `push_token` y `local_id` = notificación,
 *    - envíe payload a cada suscripción Web Push.
 * 5. Sustituir este cuerpo por `fetch('/api/...', { body: JSON.stringify({ notificationId }) })` o similar.
 */
export async function preparePushDispatch(
  _supabase: SupabaseClient,
  _notification: NotificationRow,
): Promise<void> {
  /* intentionally empty */
}

/**
 * Nombre descriptivo para logs / futuros workers.
 */
export async function sendPushToLocalUsers(
  supabase: SupabaseClient,
  notification: NotificationRow,
): Promise<void> {
  await preparePushDispatch(supabase, notification);
}
