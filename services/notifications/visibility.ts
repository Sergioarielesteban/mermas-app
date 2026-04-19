export type NotificationRole = 'admin' | 'manager' | 'staff' | null;

export type NotificationType =
  | 'chat_message'
  | 'pedido_creado'
  | 'pedido_enviado'
  | 'pedido_recibido'
  | 'appcc_alerta'
  | 'temperatura_fuera_rango'
  | 'checklist_evento'
  | 'merma_registrada'
  | 'comida_personal_registrada'
  | 'horario_actualizado'
  | 'planificacion_publicada'
  | 'sistema_evento';

const STAFF_VISIBLE_TYPES: ReadonlySet<NotificationType> = new Set([
  'chat_message',
  'checklist_evento',
  'horario_actualizado',
  'planificacion_publicada',
]);

const MANAGER_VISIBLE_TYPES: ReadonlySet<NotificationType> = new Set([
  'chat_message',
  'pedido_creado',
  'pedido_enviado',
  'pedido_recibido',
  'appcc_alerta',
  'temperatura_fuera_rango',
  'checklist_evento',
  'merma_registrada',
  'comida_personal_registrada',
  'horario_actualizado',
  'planificacion_publicada',
]);

export function normalizeNotificationType(
  rawType: string | null | undefined,
  entityType?: string | null,
): NotificationType {
  const t = (rawType ?? '').trim().toLowerCase();
  if (t === 'chat_message' || t === 'mensaje_equipo') return 'chat_message';
  if (t === 'pedido_creado') return 'pedido_creado';
  if (t === 'pedido_enviado') return 'pedido_enviado';
  if (t === 'pedido_recibido' || t === 'incidencia_recepcion') return 'pedido_recibido';
  if (t === 'appcc_alerta') return 'appcc_alerta';
  if (t === 'temperatura_fuera_rango') return 'temperatura_fuera_rango';
  if (t === 'checklist_evento') return 'checklist_evento';
  if (t === 'merma_registrada') return 'merma_registrada';
  if (t === 'comida_personal_registrada') return 'comida_personal_registrada';
  if (t === 'horario_actualizado') return 'horario_actualizado';
  if (t === 'planificacion_publicada') return 'planificacion_publicada';
  if (t === 'sistema_evento' || t === 'inventario_cerrado') return 'sistema_evento';

  const e = (entityType ?? '').trim().toLowerCase();
  if (e === 'chat_message') return 'chat_message';
  if (e === 'purchase_order') return 'pedido_creado';
  if (e === 'appcc_temperature_reading') return 'temperatura_fuera_rango';
  if (e === 'merma') return 'merma_registrada';
  return 'sistema_evento';
}

export function canUserSeeNotification(
  userRole: NotificationRole,
  notificationType: NotificationType,
): boolean {
  if (userRole === 'admin') return true;
  if (userRole === 'manager') return MANAGER_VISIBLE_TYPES.has(notificationType);
  return STAFF_VISIBLE_TYPES.has(notificationType);
}

