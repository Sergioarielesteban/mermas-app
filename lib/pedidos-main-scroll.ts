/**
 * En AppShell el scroll operativo vive en <main overflow-y-auto>, no en window.
 * window.scrollY suele ser 0 en Android / PWA aunque el usuario haya bajado en la lista.
 */
export function getAppMainScrollElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector('main');
  return el instanceof HTMLElement ? el : null;
}

export function readMainScrollTop(): number {
  const main = getAppMainScrollElement();
  if (main) return Math.max(0, Math.round(main.scrollTop));
  return Math.max(0, Math.round(window.scrollY ?? document.documentElement.scrollTop ?? 0));
}

export function setMainScrollTop(top: number) {
  const y = Math.max(0, top);
  const main = getAppMainScrollElement();
  if (main) main.scrollTo({ top: y, behavior: 'auto' });
  window.scrollTo({ top: y, behavior: 'auto' });
}
