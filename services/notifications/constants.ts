import type { NotificationEventType, NotificationSeverity } from './types';

/** Severidad por defecto al ampliar tipos (info si no está listado). */
export const DEFAULT_SEVERITY_BY_TYPE: Partial<Record<NotificationEventType, NotificationSeverity>> = {
  pedido_enviado: 'info',
  pedido_recibido: 'info',
  incidencia_recepcion: 'warning',
  appcc_alerta: 'critical',
  appcc_fin_jornada: 'warning',
  inventario_cerrado: 'info',
  mensaje_equipo: 'info',
};

export function defaultSeverityForType(type: string): NotificationSeverity {
  return DEFAULT_SEVERITY_BY_TYPE[type as NotificationEventType] ?? 'info';
}
