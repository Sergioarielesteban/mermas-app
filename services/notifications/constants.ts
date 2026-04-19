import type { NotificationEventType, NotificationSeverity } from './types';

/** Severidad por defecto al ampliar tipos (info si no está listado). */
export const DEFAULT_SEVERITY_BY_TYPE: Partial<Record<NotificationEventType, NotificationSeverity>> = {
  chat_message: 'info',
  pedido_creado: 'info',
  pedido_enviado: 'info',
  pedido_recibido: 'info',
  appcc_alerta: 'critical',
  temperatura_fuera_rango: 'critical',
  checklist_evento: 'info',
  merma_registrada: 'info',
  comida_personal_registrada: 'info',
  horario_actualizado: 'info',
  planificacion_publicada: 'info',
  sistema_evento: 'warning',
};

export function defaultSeverityForType(type: string): NotificationSeverity {
  return DEFAULT_SEVERITY_BY_TYPE[type as NotificationEventType] ?? 'info';
}
