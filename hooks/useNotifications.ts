'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { showSystemNotification } from '@/lib/browser-notifications';
import {
  getNotifications,
  getUnreadNotificationsCount,
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
      setItems(list);
      setUnreadCount(count);
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
  }, [localId, userId, supabaseOk]);

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
          if (row && typeof row.title === 'string' && typeof row.message === 'string') {
            const createdBy = row.created_by;
            const fromSelf =
              typeof createdBy === 'string' && Boolean(userId) && createdBy === userId;
            if (!fromSelf) {
              const id = typeof row.id === 'string' ? row.id : undefined;
              showSystemNotification(row.title, row.message, { tag: id ? `chef-one-${id}` : undefined });
            }
          }
          void refreshRef.current();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [localId, userId, supabaseOk]);

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

  return useMemo(
    () => ({
      items,
      unreadCount,
      loading,
      error,
      refresh,
      markRead,
      markAllRead,
    }),
    [items, unreadCount, loading, error, refresh, markRead, markAllRead],
  );
}
