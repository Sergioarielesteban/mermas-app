'use client';

import React, { useMemo } from 'react';
import type { NotificationWithRead } from '@/services/notifications';

function formatRelativeTimeEs(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.round((now - t) / 1000);
    if (diff < 60) return 'hace un momento';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    if (diff < 604800) return `hace ${Math.floor(diff / 86400)} d`;
    return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '';
  }
}

const severityRing: Record<string, string> = {
  info: 'ring-zinc-200/80',
  warning: 'ring-amber-200/90',
  critical: 'ring-red-300/90',
};

const severityDot: Record<string, string> = {
  info: 'bg-zinc-400',
  warning: 'bg-amber-500',
  critical: 'bg-[#D32F2F]',
};

export default function NotificationItem({
  item,
  onOpen,
}: {
  item: NotificationWithRead;
  onOpen: () => void;
}) {
  const rel = useMemo(() => formatRelativeTimeEs(item.createdAt), [item.createdAt]);
  const unread = !item.readAt;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={[
        'w-full rounded-xl border px-3 py-2.5 text-left transition',
        'border-zinc-200/90 bg-white shadow-sm ring-1',
        severityRing[item.severity] ?? severityRing.info,
        unread ? 'bg-zinc-50/95' : 'opacity-90',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <span
          className={['mt-1.5 h-2 w-2 shrink-0 rounded-full', severityDot[item.severity] ?? severityDot.info].join(
            ' ',
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold leading-snug text-zinc-900">{item.title}</p>
          <p className="mt-0.5 text-[11px] font-medium leading-snug text-zinc-600">{item.message}</p>
          <p className="mt-1 text-[10px] font-semibold text-zinc-400">{rel}</p>
        </div>
        {unread ? (
          <span className="shrink-0 rounded-full bg-[#D32F2F]/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-[#B91C1C]">
            Nuevo
          </span>
        ) : null}
      </div>
    </button>
  );
}
