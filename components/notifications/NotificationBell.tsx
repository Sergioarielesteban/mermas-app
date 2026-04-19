'use client';

import React, { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useNotifications } from '@/hooks/useNotifications';
import { useRegisterNotificationDevice } from '@/hooks/useRegisterNotificationDevice';
import { getNotificationHref, type NotificationWithRead } from '@/services/notifications';
import NotificationsPanel from './NotificationsPanel';

export default function NotificationBell() {
  const router = useRouter();
  const { localId, userId } = useAuth();
  const [open, setOpen] = useState(false);
  const { items, unreadCount, loading, error, markRead, markAllRead, clearAll } = useNotifications(localId, userId);

  useRegisterNotificationDevice(localId, userId, Boolean(localId && userId));

  const onItemActivate = useCallback(
    async (item: NotificationWithRead) => {
      if (userId) {
        try {
          await markRead(item.id);
        } catch {
          /* ignore */
        }
      }
      const href = getNotificationHref(item.entityType, item.entityId, item.metadata);
      setOpen(false);
      if (href) router.push(href);
    },
    [markRead, router, userId],
  );

  if (!localId || !userId) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-10 w-10 place-items-center rounded-xl text-white/95 hover:bg-white/10 active:scale-[0.99]"
        aria-label={`Notificaciones${unreadCount > 0 ? `, ${unreadCount} sin leer` : ''}`}
        title="Notificaciones"
      >
        <Bell className="h-5 w-5" strokeWidth={2.2} />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-white px-1 text-[10px] font-black text-[#B91C1C] shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>
      <NotificationsPanel
        open={open}
        onClose={() => setOpen(false)}
        items={items}
        loading={loading}
        error={error}
        onMarkAllRead={() => void markAllRead().catch(() => {})}
        onClearAll={() => void clearAll().catch(() => {})}
        onItemActivate={onItemActivate}
      />
    </div>
  );
}
