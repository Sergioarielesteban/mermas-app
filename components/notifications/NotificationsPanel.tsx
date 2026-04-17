'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import {
  getSystemNotifyPermission,
  requestSystemNotifyPermission,
  systemNotificationsSupported,
} from '@/lib/browser-notifications';
import type { NotificationWithRead } from '@/services/notifications';
import NotificationItem from './NotificationItem';

export default function NotificationsPanel({
  open,
  onClose,
  items,
  loading,
  error,
  onMarkAllRead,
  onItemActivate,
}: {
  open: boolean;
  onClose: () => void;
  items: NotificationWithRead[];
  loading: boolean;
  error: string | null;
  onMarkAllRead: () => void;
  onItemActivate: (item: NotificationWithRead) => void;
}) {
  const [sysPerm, setSysPerm] = useState<NotificationPermission | 'unsupported'>(() =>
    getSystemNotifyPermission(),
  );

  if (!open) return null;

  const sysSupported = systemNotificationsSupported();
  const showSysPrompt = sysSupported && sysPerm === 'default';
  const showSysDenied = sysSupported && sysPerm === 'denied';

  return (
    <>
      <button
        type="button"
        aria-hidden
        className="fixed inset-0 z-[45] bg-black/35 print:hidden"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        className="fixed right-2 top-[3.25rem] z-[46] w-[min(100vw-1rem,20rem)] max-h-[min(70vh,28rem)] overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-2xl ring-1 ring-zinc-100 print:hidden"
        role="dialog"
        aria-label="Notificaciones"
      >
        <div className="flex items-center justify-between border-b border-zinc-100 bg-gradient-to-r from-zinc-50 to-white px-3 py-2">
          <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-800">Notificaciones</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void onMarkAllRead()}
              className="rounded-lg px-2 py-1 text-[10px] font-bold uppercase text-[#B91C1C] hover:bg-red-50"
            >
              Marcar todas
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="max-h-[min(60vh,24rem)] overflow-y-auto px-2 py-2">
          {error ? (
            <p className="rounded-lg bg-amber-50 px-2 py-2 text-center text-[11px] font-medium text-amber-950">
              {error}
            </p>
          ) : null}
          {loading && items.length === 0 ? (
            <p className="py-6 text-center text-xs text-zinc-500">Cargando…</p>
          ) : null}
          {!loading && items.length === 0 && !error ? (
            <p className="py-6 text-center text-xs text-zinc-500">No hay notificaciones.</p>
          ) : null}
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <NotificationItem item={item} onOpen={() => onItemActivate(item)} />
              </li>
            ))}
          </ul>
          {showSysPrompt ? (
            <div className="border-t border-zinc-100 px-2 py-2">
              <p className="mb-1.5 text-[10px] leading-snug text-zinc-500">
                Para ver avisos en la barra del móvil cuando otro usuario del local actúe, activa las notificaciones
                del navegador.
              </p>
              <button
                type="button"
                className="w-full rounded-lg bg-zinc-900 py-2 text-[11px] font-bold text-white hover:bg-zinc-800"
                onClick={() => {
                  void requestSystemNotifyPermission().then((p) => setSysPerm(p));
                }}
              >
                Activar avisos en este dispositivo
              </button>
            </div>
          ) : null}
          {showSysDenied ? (
            <p className="border-t border-zinc-100 px-2 py-2 text-[10px] leading-snug text-zinc-500">
              Las notificaciones del sistema están bloqueadas. Ábrelas desde ajustes del navegador para este sitio si
              quieres avisos fuera de la app.
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
