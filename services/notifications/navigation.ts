import { getEnabledHrefOrNull } from '@/lib/module-config';

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
      return getEnabledHrefOrNull('/pedidos');
    case 'merma':
      return getEnabledHrefOrNull('/dashboard');
    case 'inventory_closure':
      return getEnabledHrefOrNull('/inventario');
    case 'chat_message':
      return getEnabledHrefOrNull('/chat');
    case 'appcc_temperature_reading': {
      const d = metadata.dateKey;
      if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        return getEnabledHrefOrNull(`/appcc/temperaturas?d=${encodeURIComponent(d)}`);
      }
      return getEnabledHrefOrNull('/appcc/temperaturas');
    }
    case 'empresa_norma':
      return getEnabledHrefOrNull('/personal/manual-normas/normas');
    case 'manual_procedimiento':
      return getEnabledHrefOrNull('/personal/manual-normas/operaciones');
    case 'staff_week_schedule': {
      const w = metadata.week_start_monday;
      if (typeof w === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w)) {
        return getEnabledHrefOrNull(`/personal/mi/turnos?semana=${encodeURIComponent(w)}`);
      }
      return getEnabledHrefOrNull('/personal/mi/turnos');
    }
    default:
      if (entityId && entityType.startsWith('custom:')) {
        return null;
      }
      return null;
  }
}
