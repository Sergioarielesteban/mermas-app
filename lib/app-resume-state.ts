export const APP_RESUME_STATE_KEY = 'chefone:app:resume-state:v1';
export const APP_RESUME_SCROLL_RESTORE_FLAG = 'chefone:app:resume-scroll-restore';

const APP_RESUME_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AppResumeState = {
  v: 1;
  updatedAt: number;
  href: string;
  pathname: string;
  scrollY: number;
  email?: string | null;
  localId?: string | null;
};

export function isResumeEligiblePath(pathname: string | null | undefined): pathname is string {
  if (!pathname) return false;
  if (pathname === '/' || pathname === '/login' || pathname === '/onboarding' || pathname === '/precio') return false;
  if (pathname === '/produccion/etiquetas/print') return false;
  if (pathname.startsWith('/terminal-fichaje')) return false;
  return pathname.startsWith('/');
}

function normalizeHref(href: string): string | null {
  try {
    const url = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (!isResumeEligiblePath(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function readAppResumeState(email?: string | null): AppResumeState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(APP_RESUME_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppResumeState>;
    if (parsed.v !== 1) return null;
    if (typeof parsed.updatedAt !== 'number' || Date.now() - parsed.updatedAt > APP_RESUME_TTL_MS) return null;
    if (typeof parsed.href !== 'string' || typeof parsed.pathname !== 'string') return null;
    if (!isResumeEligiblePath(parsed.pathname)) return null;
    if (email && parsed.email && parsed.email !== email) return null;
    const href = normalizeHref(parsed.href);
    if (!href) return null;
    return {
      v: 1,
      updatedAt: parsed.updatedAt,
      href,
      pathname: parsed.pathname,
      scrollY: typeof parsed.scrollY === 'number' && Number.isFinite(parsed.scrollY) ? Math.max(0, parsed.scrollY) : 0,
      email: parsed.email ?? null,
      localId: parsed.localId ?? null,
    };
  } catch {
    return null;
  }
}

export function writeAppResumeState(payload: Omit<AppResumeState, 'v' | 'updatedAt'>): void {
  if (typeof window === 'undefined') return;
  const href = normalizeHref(payload.href);
  if (!href || !isResumeEligiblePath(payload.pathname)) return;
  try {
    window.localStorage.setItem(
      APP_RESUME_STATE_KEY,
      JSON.stringify({
        v: 1,
        updatedAt: Date.now(),
        ...payload,
        href,
        scrollY: Math.max(0, Math.round(payload.scrollY || 0)),
      } satisfies AppResumeState),
    );
  } catch {
    /* Best effort only. */
  }
}

export function clearAppResumeState(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(APP_RESUME_STATE_KEY);
    window.sessionStorage.removeItem(APP_RESUME_SCROLL_RESTORE_FLAG);
  } catch {
    /* ignore */
  }
}
