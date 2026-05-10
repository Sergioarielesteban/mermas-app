'use client';

import React from 'react';
import { getSupabaseClient } from '@/lib/supabase-client';
import {
  computeCutoffForToday,
  isOrderDayToday,
  type PedidoSupplierOrderScheduleRow,
} from '@/lib/pedidos-order-agenda-engine';
import { fetchOrderSchedulesForLocal, fetchReviewItemsForLocal } from '@/lib/pedidos-order-agenda-supabase';
import type { PedidoOrder } from '@/lib/pedidos-supabase';

export type SupplierAgendaBanner = {
  cutoffLine: string | null;
  cutoffTone: 'warn' | 'danger' | 'neutral';
  reviewNames: string[];
};

export function usePedidosSupplierAgendaBanner(params: {
  localId: string | null;
  supplierId: string;
  orders: PedidoOrder[];
}) {
  const { localId, supplierId, orders } = params;
  const [schedule, setSchedule] = React.useState<(PedidoSupplierOrderScheduleRow & { id: string }) | null>(null);
  const [reviewLabels, setReviewLabels] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!localId || !supplierId) {
      setSchedule(null);
      setReviewLabels([]);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    void Promise.all([fetchOrderSchedulesForLocal(supabase, localId), fetchReviewItemsForLocal(supabase, localId)])
      .then(([schMap, revMap]) => {
        if (cancelled) return;
        setSchedule(schMap.get(supplierId) ?? null);
        const items = revMap.get(supplierId) ?? [];
        setReviewLabels(
          items.filter((i) => i.enabled && i.product_name_snapshot.trim()).map((i) => i.product_name_snapshot.trim()),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setSchedule(null);
          setReviewLabels([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [localId, supplierId]);

  const banner = React.useMemo((): SupplierAgendaBanner | null => {
    if (!schedule?.enabled) return null;
    const now = new Date();
    if (!isOrderDayToday(schedule, now)) return null;

    const computed = computeCutoffForToday(schedule, orders, supplierId, now);
    if (!computed || computed.status === 'enviado') {
      return reviewLabels.length
        ? { cutoffLine: null, cutoffTone: 'neutral', reviewNames: reviewLabels }
        : null;
    }

    let cutoffLine = `Hoy toca pedir a este proveedor antes de las ${computed.cutoffLabel}.`;
    let cutoffTone: SupplierAgendaBanner['cutoffTone'] = 'neutral';
    if (computed.status === 'vence_pronto') {
      cutoffTone = 'warn';
      cutoffLine = `Queda poco para el corte (${computed.cutoffLabel}). Revisa el pedido.`;
    } else if (computed.status === 'vencido') {
      cutoffTone = 'danger';
      cutoffLine = `Hora límite pasada (${computed.cutoffLabel}). Si aún no pediste, hazlo cuanto antes.`;
    }

    return {
      cutoffLine,
      cutoffTone,
      reviewNames: reviewLabels,
    };
  }, [schedule, orders, supplierId, reviewLabels]);

  return banner;
}
