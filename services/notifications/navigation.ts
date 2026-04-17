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
    case 'appcc_daily_review': {
      const d = metadata.dateKey;
      const missOil = metadata.missingOil === true;
      const missTemps = metadata.missingTemps === true;
      if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        if (missOil && !missTemps) {
          return `/appcc/aceite/registro?d=${encodeURIComponent(d)}`;
        }
        return `/appcc/temperaturas?d=${encodeURIComponent(d)}`;
      }
      return '/appcc';
    }
    default:
      if (entityId && entityType.startsWith('custom:')) {
        return null;
      }
      return null;
  }
}
