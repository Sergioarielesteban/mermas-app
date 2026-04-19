'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { showSystemNotification } from '@/lib/browser-notifications';
import {
  getNotifications,
  getUnreadNotificationsCount,
  mapNotificationRow,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type NotificationWithRead,
} from '@/services/notifications';

export function useNotifications(localId: string | null, userId: string | null) {
  const [items, setItems] = useState<NotificationWithRead[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const clearBeforeKey = localId && userId ? `notifications-cleared-before:${localId}:${userId}` : null;

  const readClearedBefore = useCallback((): string | null => {
    if (typeof window === 'undefined' || !clearBeforeKey) return null;
    try {
      return window.localStorage.getItem(clearBeforeKey);
    } catch {
      return null;
    }
  }, [clearBeforeKey]);

  const writeClearedBefore = useCallback(
    (iso: string | null) => {
      if (typeof window === 'undefined' || !clearBeforeKey) return;
      try {
        if (!iso) window.localStorage.removeItem(clearBeforeKey);
        else window.localStorage.setItem(clearBeforeKey, iso);
      } catch {
        /* ignore */
      }
    },
    [clearBeforeKey],
  );

  const refresh = useCallback(async () => {
    if (!localId || !userId || !supabaseOk) {
      setItems([]);
      setUnreadCount(0);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setError(null);
    try {
      const [list, count] = await Promise.all([
        getNotifications(supabase, localId, userId, { limit: 50 }),
        getUnreadNotificationsCount(supabase, localId, userId),
      ]);
      const clearedBefore = readClearedBefore();
      const filtered = clearedBefore ? list.filter((n) => n.createdAt > clearedBefore) : list;
      const unreadFiltered = filtered.filter((n) => !n.readAt).length;
      setItems(filtered);
      setUnreadCount(Math.min(count, unreadFiltered));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar notificaciones.';
      if (msg.toLowerCase().includes('does not exist') || msg.includes('notifications')) {
        setError('Ejecuta supabase-notifications.sql en Supabase para activar notificaciones.');
      } else {
        setError(msg);
      }
      setItems([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, [localId, userId, supabaseOk, readClearedBefore]);

  refreshRef.current = refresh;

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!localId || !userId || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    const ch = supabase
      .channel(`notifications-local-${localId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `local_id=eq.${localId}`,
        },
        (payload: { new?: Record<string, unknown> }) => {
          const row = payload.new;
          if (!row || typeof row.id !== 'string') {
            void refreshRef.current();
            return;
          }
          try {
            const mapped = mapNotificationRow(row);
            const clearedBefore = readClearedBefore();
            if (clearedBefore && mapped.createdAt <= clearedBefore) return;
            const fromSelf =
              mapped.createdBy != null && Boolean(userId) && mapped.createdBy === userId;
            if (!fromSelf) {
              showSystemNotification(mapped.title, mapped.message, { tag: `chef-one-${mapped.id}` });
              setUnreadCount((c) => c + 1);
            }
            const item: NotificationWithRead = { ...mapped, readAt: null };
            setItems((prev) => {
              if (prev.some((n) => n.id === item.id)) return prev;
              return [item, ...prev].slice(0, 50);
            });
          } catch {
            void refreshRef.current();
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [localId, userId, supabaseOk, readClearedBefore]);

  const markRead = useCallback(
    async (notificationId: string) => {
      if (!userId || !localId || !supabaseOk) return;
      const supabase = getSupabaseClient()!;
      await markNotificationAsRead(supabase, notificationId, userId);
      const now = new Date().toISOString();
      setItems((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, readAt: n.readAt ?? now } : n)),
      );
      try {
        const count = await getUnreadNotificationsCount(supabase, localId, userId);
        setUnreadCount(count);
      } catch {
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    },
    [userId, localId, supabaseOk],
  );

  const markAllRead = useCallback(async () => {
    if (!supabaseOk) return;
    const supabase = getSupabaseClient()!;
    await markAllNotificationsAsRead(supabase);
    await refresh();
  }, [supabaseOk, refresh]);

  const clearAll = useCallback(async () => {
    if (!supabaseOk) {
      setItems([]);
      setUnreadCount(0);
      writeClearedBefore(new Date().toISOString());
      return;
    }
    const supabase = getSupabaseClient()!;
    await markAllNotificationsAsRead(supabase);
    writeClearedBefore(new Date().toISOString());
    setItems([]);
    setUnreadCount(0);
  }, [supabaseOk, writeClearedBefore]);

  return useMemo(
    () => ({
      items,
      unreadCount,
      loading,
      error,
      refresh,
      markRead,
      markAllRead,
      clearAll,
    }),
    [items, unreadCount, loading, error, refresh, markRead, markAllRead, clearAll],
  );
}
