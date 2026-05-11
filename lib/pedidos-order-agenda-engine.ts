/**
 * Motor puro: cortes de agenda por proveedor (sin Supabase).
 * Estados tácticos para UI — no envía pedidos ni automatiza compras.
 */

import type { PedidoOrder } from '@/lib/pedidos-supabase';

export type AgendaCutoffUiStatus = 'pendiente' | 'enviado' | 'vence_pronto' | 'vencido';

/** mandatory = corte en bloque obligatorio; review = solo checklist «Revisar proveedores». */
export type PedidoAgendaMode = 'mandatory' | 'review';

export type PedidoSupplierOrderScheduleRow = {
  enabled: boolean;
  orderWeekdays: number[];
  cutoffTime: string;
  reminderMinutesBefore: number;
  deliveryWeekdays: number[] | null;
  agendaMode: PedidoAgendaMode;
};

export function todayYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Cortes HH:MM o HH:MM:SS → minutos desde medianoche (hora local). */
export function cutoffTimeToMinutes(timeStr: string): number {
  const t = timeStr.trim();
  const parts = t.split(':');
  const h = Math.min(23, Math.max(0, Number(parts[0] ?? 0)));
  const m = Math.min(59, Math.max(0, Number(parts[1] ?? 0)));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 17 * 60;
  return h * 60 + m;
}

export function formatCutoffHm(timeStr: string): string {
  const mins = cutoffTimeToMinutes(timeStr);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** ¿Hoy (local) es día de pedido según configuración? */
export function isOrderDayToday(schedule: PedidoSupplierOrderScheduleRow, now: Date): boolean {
  if (!schedule.enabled) return false;
  const wd = now.getDay();
  const days = schedule.orderWeekdays ?? [];
  return days.includes(wd);
}

/** Pedido contabilizado como «hecho» para la agenda: enviado o recibido ese día calendario (local). */
export function supplierHasOrderDoneToday(
  orders: PedidoOrder[],
  supplierId: string,
  ymd: string,
): boolean {
  for (const o of orders) {
    if (o.supplierId !== supplierId) continue;
    if (o.status !== 'sent' && o.status !== 'received') continue;
    const ts = o.sentAt ?? o.createdAt;
    const t = new Date(ts);
    const oy = todayYmdLocal(t);
    if (oy === ymd) return true;
  }
  return false;
}

export type CutoffComputed = {
  status: AgendaCutoffUiStatus;
  /** Minutos hasta la hora límite de hoy (negativo si ya pasó). */
  minutesUntilCutoff: number;
  cutoffLabel: string;
};

export function computeCutoffForToday(
  schedule: PedidoSupplierOrderScheduleRow,
  orders: PedidoOrder[],
  supplierId: string,
  now: Date,
): CutoffComputed | null {
  if (!schedule.enabled || !isOrderDayToday(schedule, now)) return null;

  const ymd = todayYmdLocal(now);
  if (supplierHasOrderDoneToday(orders, supplierId, ymd)) {
    return {
      status: 'enviado',
      minutesUntilCutoff: 0,
      cutoffLabel: formatCutoffHm(schedule.cutoffTime),
    };
  }

  const cutoffMin = cutoffTimeToMinutes(schedule.cutoffTime);
  const curMin = now.getHours() * 60 + now.getMinutes();
  const minutesUntilCutoff = cutoffMin - curMin;
  const reminder = Math.max(0, schedule.reminderMinutesBefore ?? 30);

  let status: AgendaCutoffUiStatus = 'pendiente';
  if (minutesUntilCutoff < 0) {
    status = 'vencido';
  } else if (minutesUntilCutoff <= reminder) {
    status = 'vence_pronto';
  }

  return {
    status,
    minutesUntilCutoff,
    cutoffLabel: formatCutoffHm(schedule.cutoffTime),
  };
}
