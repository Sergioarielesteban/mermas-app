import type { SupabaseClient } from '@supabase/supabase-js';
import { safeCreateNotification } from './createNotification';
import type { NotificationEventType } from './types';

function actorLabel(displayName: string | null | undefined, loginUsername: string | null | undefined): string {
  const a = displayName?.trim() || loginUsername?.trim();
  return a || 'Un usuario';
}

export async function notifyPedidoEnviado(
  supabase: SupabaseClient,
  ctx: {
    localId: string;
    userId: string | null;
    actorName: string;
    supplierName: string;
    orderId: string;
  },
): Promise<void> {
  await safeCreateNotification(supabase, {
    localId: ctx.localId,
    type: 'pedido_enviado' satisfies NotificationEventType,
    title: 'Pedido enviado',
    message: `${ctx.actorName} ha enviado el pedido a ${ctx.supplierName}`,
    createdBy: ctx.userId,
    entityType: 'purchase_order',
    entityId: ctx.orderId,
    metadata: { supplierName: ctx.supplierName },
  });
}

export async function notifyPedidoRecibido(
  supabase: SupabaseClient,
  ctx: {
    localId: string;
    userId: string | null;
    actorName: string;
    supplierName: string;
    orderId: string;
  },
): Promise<void> {
  await safeCreateNotification(supabase, {
    localId: ctx.localId,
    type: 'pedido_recibido' satisfies NotificationEventType,
    title: 'Pedido recibido',
    message: `${ctx.actorName} ha registrado la recepción del pedido de ${ctx.supplierName}`,
    createdBy: ctx.userId,
    entityType: 'purchase_order',
    entityId: ctx.orderId,
    metadata: { supplierName: ctx.supplierName },
  });
}

export async function notifyIncidenciaRecepcion(
  supabase: SupabaseClient,
  ctx: {
    localId: string;
    userId: string | null;
    actorName: string;
    supplierName: string;
    orderId: string;
  },
): Promise<void> {
  await safeCreateNotification(supabase, {
    localId: ctx.localId,
    type: 'incidencia_recepcion' satisfies NotificationEventType,
    title: 'Incidencia en recepción',
    message: `${ctx.actorName} ha reportado una incidencia en un pedido de ${ctx.supplierName}`,
    severity: 'warning',
    createdBy: ctx.userId,
    entityType: 'purchase_order',
    entityId: ctx.orderId,
    metadata: { supplierName: ctx.supplierName },
  });
}

export async function notifyAppccAlerta(
  supabase: SupabaseClient,
  ctx: {
    localId: string;
    userId: string | null;
    elemento: string;
    readingId: string;
    dateKey: string;
  },
): Promise<void> {
  await safeCreateNotification(supabase, {
    localId: ctx.localId,
    type: 'appcc_alerta' satisfies NotificationEventType,
    title: 'Alerta APPCC',
    message: `Se ha detectado una alerta APPCC en ${ctx.elemento}`,
    severity: 'critical',
    createdBy: ctx.userId,
    entityType: 'appcc_temperature_reading',
    entityId: ctx.readingId,
    metadata: { elemento: ctx.elemento, dateKey: ctx.dateKey },
  });
}

export async function notifyInventarioCerrado(
  supabase: SupabaseClient,
  ctx: {
    localId: string;
    userId: string | null;
    actorName: string;
    yearMonth: string;
  },
): Promise<void> {
  await safeCreateNotification(supabase, {
    localId: ctx.localId,
    type: 'inventario_cerrado' satisfies NotificationEventType,
    title: 'Inventario cerrado',
    message: `${ctx.actorName} ha cerrado el inventario del local (${ctx.yearMonth})`,
    createdBy: ctx.userId,
    entityType: 'inventory_closure',
    entityId: null,
    metadata: { yearMonth: ctx.yearMonth },
  });
}

export async function notifyMensajeEquipo(
  supabase: SupabaseClient,
  ctx: {
    localId: string;
    userId: string | null;
    actorName: string;
    messageId: string;
    preview: string;
  },
): Promise<void> {
  const preview =
    ctx.preview.length > 120 ? `${ctx.preview.slice(0, 117)}…` : ctx.preview;
  await safeCreateNotification(supabase, {
    localId: ctx.localId,
    type: 'mensaje_equipo' satisfies NotificationEventType,
    title: 'Nuevo mensaje del equipo',
    message: `${ctx.actorName} ha enviado un mensaje al equipo: ${preview}`,
    createdBy: ctx.userId,
    entityType: 'chat_message',
    entityId: ctx.messageId,
    metadata: { preview },
  });
}

export { actorLabel };
