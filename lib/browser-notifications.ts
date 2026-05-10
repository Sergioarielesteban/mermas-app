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

/**
 * Muestra aviso nativo. En iOS PWA suele haber una línea de atribución tipo «from Chef-One»;
 * usar `registration.showNotification` (si hay service worker activo) y `lang: es` reduce
 * el texto en inglés y, en muchos casos, evita duplicar mal la marca frente a `new Notification`.
 */
export async function showSystemNotification(
  title: string,
  body: string,
  options?: { tag?: string },
): Promise<void> {
  if (!systemNotificationsSupported()) return;
  if (Notification.permission !== 'granted') return;
  const safeBody = body.length > 400 ? `${body.slice(0, 397)}…` : body;
  const tag = options?.tag ?? DEFAULT_TAG;
  const base = {
    body: safeBody,
    tag,
    icon: '/logo-chef-one.svg',
    badge: '/logo-chef-one.svg',
    lang: 'es',
    dir: 'ltr' as NotificationDirection,
  };

  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, base);
        return;
      }
    }
  } catch {
    /* intentar fallback */
  }

  try {
    new Notification(title, base);
  } catch {
    try {
      new Notification(title, { body: safeBody });
    } catch {
      /* noop */
    }
  }
}
