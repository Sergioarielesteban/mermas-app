export const APP_RESUME_STATE_KEY = 'chefone:app:resume-state:v1';
export const APP_RESUME_SCROLL_RESTORE_FLAG = 'chefone:app:resume-scroll-restore';
export const APP_RESUME_ROUTE_RESTORE_SKIP_ONCE_FLAG = 'chefone:app:resume-route-restore-skip-once';
export const APP_RESUME_FORCE_MODULE_ROOT_SAVE_ONCE_FLAG = 'chefone:app:resume-force-module-root-save-once';

const APP_RESUME_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const APP_RESUME_MODULE_RESET_GUARD_MS = 5 * 60 * 1000;

export type AppResumeState = {
  v: 1;
  updatedAt: number;
  href: string;
  pathname: string;
  scrollY: number;
  email?: string | null;
  localId?: string | null;
};

function normalizePathname(pathname: string | null | undefined): string {
  if (!pathname) return '/';
  const clean = pathname.split('?')[0]?.split('#')[0] ?? '/';
  if (clean === '/') return '/';
  return clean.replace(/\/+$/, '') || '/';
}

function moduleRoot(pathname: string | null | undefined): string | null {
  const clean = normalizePathname(pathname);
  const [first] = clean.split('/').filter(Boolean);
  return first ? `/${first}` : null;
}

function isModuleRootPath(pathname: string | null | undefined): boolean {
  const root = moduleRoot(pathname);
  return !!root && normalizePathname(pathname) === root;
}

function isDeeperPathInSameModule(currentPathname: string, savedPathname: string): boolean {
  const currentRoot = moduleRoot(currentPathname);
  const savedRoot = moduleRoot(savedPathname);
  return !!currentRoot && currentRoot === savedRoot && normalizePathname(savedPathname) !== currentRoot;
}

export function shouldSkipResumeRestoreForModuleRootNavigation(
  currentPathname: string | null | undefined,
  targetPathname: string | null | undefined,
): boolean {
  const current = normalizePathname(currentPathname);
  const target = normalizePathname(targetPathname);
  const currentRoot = moduleRoot(current);
  const targetRoot = moduleRoot(target);

  if (!currentRoot || !targetRoot) return false;
  if (currentRoot !== targetRoot) return false;
  if (current === currentRoot) return false;

  return target === targetRoot;
}

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

export function shouldRestoreAppResumeRoute(
  currentPathname: string | null | undefined,
  saved: AppResumeState | null | undefined,
): boolean {
  if (!saved) return false;
  const current = normalizePathname(currentPathname);
  if (!isResumeEligiblePath(current)) return false;
  if (Date.now() - saved.updatedAt > APP_RESUME_MODULE_RESET_GUARD_MS) return false;
  return isModuleRootPath(current) && isDeeperPathInSameModule(current, saved.pathname);
}

function consumeForceModuleRootSaveOnce(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.sessionStorage.getItem(APP_RESUME_FORCE_MODULE_ROOT_SAVE_ONCE_FLAG);
    if (raw !== '1') return false;
    window.sessionStorage.removeItem(APP_RESUME_FORCE_MODULE_ROOT_SAVE_ONCE_FLAG);
    return true;
  } catch {
    return false;
  }
}

export function markAppResumeModuleRootNavigationOnce(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(APP_RESUME_ROUTE_RESTORE_SKIP_ONCE_FLAG, '1');
    window.sessionStorage.setItem(APP_RESUME_FORCE_MODULE_ROOT_SAVE_ONCE_FLAG, '1');
  } catch {
    /* Best effort only. */
  }
}

export function markAppResumeModuleRootNavigationIfNeeded(
  currentPathname: string | null | undefined,
  targetPathname: string | null | undefined,
): void {
  if (!shouldSkipResumeRestoreForModuleRootNavigation(currentPathname, targetPathname)) return;
  markAppResumeModuleRootNavigationOnce();
}

export function consumeAppResumeRouteRestoreSkipOnce(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.sessionStorage.getItem(APP_RESUME_ROUTE_RESTORE_SKIP_ONCE_FLAG);
    if (raw !== '1') return false;
    window.sessionStorage.removeItem(APP_RESUME_ROUTE_RESTORE_SKIP_ONCE_FLAG);
    return true;
  } catch {
    return false;
  }
}

export function writeAppResumeState(payload: Omit<AppResumeState, 'v' | 'updatedAt'>): void {
  if (typeof window === 'undefined') return;
  const href = normalizeHref(payload.href);
  if (!href || !isResumeEligiblePath(payload.pathname)) return;
  try {
    const existing = readAppResumeState(payload.email ?? null);
    const forceModuleRootSave = isModuleRootPath(payload.pathname) && consumeForceModuleRootSaveOnce();
    if (
      !forceModuleRootSave &&
      shouldRestoreAppResumeRoute(payload.pathname, existing) &&
      !href.includes('?') &&
      !href.includes('#') &&
      Math.max(0, payload.scrollY || 0) <= 16
    ) {
      return;
    }
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
    window.sessionStorage.removeItem(APP_RESUME_ROUTE_RESTORE_SKIP_ONCE_FLAG);
    window.sessionStorage.removeItem(APP_RESUME_FORCE_MODULE_ROOT_SAVE_ONCE_FLAG);
  } catch {
    /* ignore */
  }
}
