/**
 * Destino al pulsar una notificación (si aplica).
 */
export function getNotificationHref(
  entityType: string | null,
  entityId: string | null,
  metadata: Record<string, unknown>,
): string | null {
  if (!entityType) return null;
  switch (entityType) {
    case 'purchase_order':
      return '/pedidos';
    case 'merma':
      return '/dashboard';
    case 'inventory_closure':
      return '/inventario';
    case 'chat_message':
      return '/chat';
    case 'appcc_temperature_reading': {
      const d = metadata.dateKey;
      if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        return `/appcc/temperaturas?d=${encodeURIComponent(d)}`;
      }
      return '/appcc/temperaturas';
    }
    case 'empresa_norma':
      return '/personal/manual-normas/normas';
    case 'manual_procedimiento':
      return '/personal/manual-normas/operaciones';
    case 'staff_week_schedule': {
      const w = metadata.week_start_monday;
      if (typeof w === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w)) {
        return `/personal/mi/turnos?semana=${encodeURIComponent(w)}`;
      }
      return '/personal/mi/turnos';
    }
    default:
      if (entityId && entityType.startsWith('custom:')) {
        return null;
      }
      return null;
  }
}
