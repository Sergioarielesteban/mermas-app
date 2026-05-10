/**
 * Preparación futura para recordatorios push / canal externo.
 * V1: solo in-app; esta capa devuelve payloads tipados sin enviar nada.
 */

import type { PedidoOrder } from '@/lib/pedidos-supabase';
import type { PedidoSupplierOrderScheduleRow } from '@/lib/pedidos-order-agenda-engine';
import {
  computeCutoffForToday,
  supplierHasOrderDoneToday,
  todayYmdLocal,
} from '@/lib/pedidos-order-agenda-engine';

export type OrderScheduleReminderPayload = {
  kind: 'cutoff_soon' | 'cutoff_passed';
  localId: string;
  supplierId: string;
  supplierName: string;
  cutoffHm: string;
  minutesUntilCutoff: number;
  message: string;
};

/** Para integrar con servicio de notificaciones cuando exista canal push. */
export function generateDueSupplierReminders(input: {
  localId: string;
  now: Date;
  supplierNames: Map<string, string>;
  schedules: Map<string, PedidoSupplierOrderScheduleRow & { id?: string }>;
  orders: PedidoOrder[];
}): OrderScheduleReminderPayload[] {
  const { localId, now, supplierNames, schedules, orders } = input;
  const ymd = todayYmdLocal(now);
  const out: OrderScheduleReminderPayload[] = [];

  for (const [supplierId, schedule] of schedules) {
    if (!schedule.enabled) continue;
    const computed = computeCutoffForToday(schedule, orders, supplierId, now);
    if (!computed || computed.status === 'enviado') continue;

    const name = supplierNames.get(supplierId) ?? 'Proveedor';

    if (computed.status === 'vence_pronto') {
      out.push({
        kind: 'cutoff_soon',
        localId,
        supplierId,
        supplierName: name,
        cutoffHm: computed.cutoffLabel,
        minutesUntilCutoff: computed.minutesUntilCutoff,
        message: `Aún no has pedido a ${name}. El corte es a las ${computed.cutoffLabel}.`,
      });
    } else if (computed.status === 'vencido' && !supplierHasOrderDoneToday(orders, supplierId, ymd)) {
      out.push({
        kind: 'cutoff_passed',
        localId,
        supplierId,
        supplierName: name,
        cutoffHm: computed.cutoffLabel,
        minutesUntilCutoff: computed.minutesUntilCutoff,
        message: `Corte pasado (${computed.cutoffLabel}) — ${name} sigue pendiente de pedido hoy.`,
      });
    }
  }

  return out;
}
