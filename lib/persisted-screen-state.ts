import {
  getAppMainScrollElement,
  readMainScrollTop,
  setMainScrollTop,
} from '@/lib/pedidos-main-scroll';

type StorageTarget = 'session' | 'local';

export type PersistedScreenEnvelope<T> = {
  v: 1;
  updatedAt: number;
  data: T;
};

export type PersistedScreenStateOptions = {
  storage?: StorageTarget;
  ttlMs?: number;
};

export type OperationalStateListenerOptions = {
  save: () => void;
  restore?: () => void;
};

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

function getStorage(target: StorageTarget): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return target === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function normalizeKeyPart(part: string | number | null | undefined): string {
  return String(part ?? 'none')
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, '-')
    .slice(0, 96);
}

export function makePersistedScreenStateKey(scope: string, parts: Array<string | number | null | undefined> = []): string {
  const suffix = parts.map(normalizeKeyPart).filter(Boolean).join(':');
  return `chefone:screen:${normalizeKeyPart(scope)}${suffix ? `:${suffix}` : ''}`;
}

export function readPersistedScreenState<T>(
  key: string,
  options: PersistedScreenStateOptions = {},
): T | null {
  const storage = getStorage(options.storage ?? 'session');
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedScreenEnvelope<T>>;
    if (parsed.v !== 1 || typeof parsed.updatedAt !== 'number' || parsed.data == null) {
      storage.removeItem(key);
      return null;
    }
    if (Date.now() - parsed.updatedAt > (options.ttlMs ?? DEFAULT_TTL_MS)) {
      storage.removeItem(key);
      return null;
    }
    return parsed.data as T;
  } catch {
    return null;
  }
}

export function writePersistedScreenState<T>(
  key: string,
  data: T,
  options: PersistedScreenStateOptions = {},
): void {
  const storage = getStorage(options.storage ?? 'session');
  if (!storage) return;
  try {
    const payload: PersistedScreenEnvelope<T> = {
      v: 1,
      updatedAt: Date.now(),
      data,
    };
    storage.setItem(key, JSON.stringify(payload));
  } catch {
    /* Best effort: quota / private browsing. */
  }
}

export function clearPersistedScreenState(key: string, options: PersistedScreenStateOptions = {}): void {
  const storage = getStorage(options.storage ?? 'session');
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readOperationalScrollY(): number {
  return readMainScrollTop();
}

export function restoreOperationalScrollY(scrollY: number | null | undefined): void {
  const y = Math.max(0, Math.round(Number(scrollY ?? 0)));
  if (!Number.isFinite(y) || y <= 0) return;

  const apply = () => setMainScrollTop(y);
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
  window.setTimeout(apply, 90);
  window.setTimeout(apply, 220);
}

export function attachOperationalStateListeners({
  save,
  restore,
}: OperationalStateListenerOptions): () => void {
  if (typeof window === 'undefined') return () => {};

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      save();
      return;
    }
    restore?.();
  };
  const onPageHide = () => save();
  const onBeforeUnload = () => save();
  const onBlur = () => save();
  const onPageShow = () => restore?.();
  const onFocus = () => restore?.();

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('focus', onFocus);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeunload', onBeforeUnload);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('focus', onFocus);
  };
}

export function attachOperationalScrollSave(save: () => void, debounceMs = 180): () => void {
  if (typeof window === 'undefined') return () => {};
  let timer: number | null = null;
  const onScroll = () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(save, debounceMs);
  };

  const main = getAppMainScrollElement();
  main?.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });

  return () => {
    if (timer) window.clearTimeout(timer);
    main?.removeEventListener('scroll', onScroll);
    window.removeEventListener('scroll', onScroll);
  };
}
