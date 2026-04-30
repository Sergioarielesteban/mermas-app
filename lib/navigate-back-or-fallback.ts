import { APP_MODULE_HOME } from '@/lib/app-navigation';

/**
 * Navegación fija al panel de módulos (sin `history.back`).
 * @deprecated Prefer `getParentRoute` + `router.push` desde `@/lib/app-navigation`.
 */
export function goBackOrFallback(
  router: { push: (href: string) => void },
  fallbackHref: string = APP_MODULE_HOME,
) {
  router.push(fallbackHref);
}

export function goBackOrToPanel(router: { push: (href: string) => void }) {
  router.push(APP_MODULE_HOME);
}
