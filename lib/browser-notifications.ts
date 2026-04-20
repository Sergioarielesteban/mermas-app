/**
 * Notificaciones del sistema (banner del SO / navegador). No sustituye Web Push;
 * funciona cuando la app está abierta o en segundo plano según el navegador (iOS PWA limitado).
 */

const DEFAULT_TAG = 'chef-one-notify';

export function systemNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getSystemNotifyPermission(): NotificationPermission | 'unsupported' {
  if (!systemNotificationsSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestSystemNotifyPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!systemNotificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showSystemNotification(title: string, body: string, options?: { tag?: string }): void {
  if (!systemNotificationsSupported()) return;
  if (Notification.permission !== 'granted') return;
  const safeBody = body.length > 400 ? `${body.slice(0, 397)}…` : body;
  try {
    new Notification(title, {
      body: safeBody,
      tag: options?.tag ?? DEFAULT_TAG,
      icon: '/logo-chef-one.png',
    });
  } catch {
    // Algunos navegadores móviles rechazan opciones concretas; reintento mínimo.
    try {
      new Notification(title, { body: safeBody });
    } catch {
      /* noop */
    }
  }
}
