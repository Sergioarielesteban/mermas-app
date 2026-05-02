'use client';

import { useCallback, useMemo } from 'react';

type StorageMode = 'session' | 'local';

type PersistedEnvelope<T> = {
  updatedAt: number;
  data: T;
};

type UsePersistedViewStateOptions = {
  storage?: StorageMode;
  ttlMs?: number;
};

function getStorage(mode: StorageMode): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return mode === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function usePersistedViewState<T>(
  moduleKey: string,
  options?: UsePersistedViewStateOptions,
) {
  const storageMode: StorageMode = options?.storage ?? 'session';
  const ttlMs = options?.ttlMs ?? 12 * 60 * 60 * 1000;
  const storageKey = useMemo(
    () => `chefone:${moduleKey}:viewState`,
    [moduleKey],
  );

  const load = useCallback((): T | null => {
    const storage = getStorage(storageMode);
    if (!storage) return null;
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PersistedEnvelope<T>>;
      if (
        typeof parsed.updatedAt !== 'number' ||
        !Number.isFinite(parsed.updatedAt) ||
        parsed.data == null
      ) {
        storage.removeItem(storageKey);
        return null;
      }
      if (Date.now() - parsed.updatedAt > ttlMs) {
        storage.removeItem(storageKey);
        return null;
      }
      return parsed.data as T;
    } catch {
      return null;
    }
  }, [storageKey, storageMode, ttlMs]);

  const save = useCallback(
    (data: T) => {
      const storage = getStorage(storageMode);
      if (!storage) return;
      try {
        const payload: PersistedEnvelope<T> = {
          updatedAt: Date.now(),
          data,
        };
        storage.setItem(storageKey, JSON.stringify(payload));
      } catch {
        // Best effort; ignore quota / privacy mode issues.
      }
    },
    [storageKey, storageMode],
  );

  const clear = useCallback(() => {
    const storage = getStorage(storageMode);
    if (!storage) return;
    try {
      storage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey, storageMode]);

  return { storageKey, load, save, clear };
}

