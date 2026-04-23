/**
 * Navegación tipo app nativa: `router.back()` cuando hay historial previo
 * (coherente con el gesto «atrás» en iOS Safari / WebView).
 * Si no hay pila (entrada directa, nueva pestaña), `router.push(fallbackHref)`.
 */
export function goBackOrFallback(
  router: { back: () => void; push: (href: string) => void },
  fallbackHref: string,
) {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back();
    return;
  }
  router.push(fallbackHref);
}

export function goBackOrToPanel(router: { back: () => void; push: (href: string) => void }) {
  goBackOrFallback(router, '/panel');
}
