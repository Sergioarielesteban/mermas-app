'use client';

import React from 'react';
import { getSupabaseClient } from '@/lib/supabase-client';
import {
  computeCutoffForToday,
  isOrderDayToday,
  todayYmdLocal,
  type PedidoSupplierOrderScheduleRow,
} from '@/lib/pedidos-order-agenda-engine';
import {
  fetchOrderSchedulesForLocal,
  fetchReviewItemsForLocal,
  fetchSupplierNamesMap,
  type PedidoSupplierReviewItemDb,
} from '@/lib/pedidos-order-agenda-supabase';
import { isReviewItemMarkedDone } from '@/lib/pedidos-order-agenda-review-storage';
import { usePedidosDataChangedListener } from '@/hooks/usePedidosDataChangedListener';
import type { PedidoOrder } from '@/lib/pedidos-supabase';

export type AgendaCutoffRow = {
  supplierId: string;
  supplierName: string;
  cutoffLabel: string;
  statusLabel: string;
  statusTone: 'neutral' | 'ok' | 'warn' | 'danger';
  href: string;
};

export type AgendaReviewRow = {
  id: string;
  supplierId: string;
  supplierName: string;
  label: string;
  href: string;
  done: boolean;
};

export function useOrderAgendaToday(params: { localId: string | null; orders: PedidoOrder[] }) {
  const { localId, orders } = params;
  const [supplierNames, setSupplierNames] = React.useState<Map<string, string>>(() => new Map());
  const [schedules, setSchedules] = React.useState<Map<string, PedidoSupplierOrderScheduleRow & { id: string }>>(
    () => new Map(),
  );
  const [reviewBySupplier, setReviewBySupplier] = React.useState<Map<string, PedidoSupplierReviewItemDb[]>>(
    () => new Map(),
  );
  const [loading, setLoading] = React.useState(() => Boolean(localId));
  const [reloadEpoch, setReloadEpoch] = React.useState(0);
  const [timeTick, setTimeTick] = React.useState(0);

  React.useEffect(() => {
    const id = window.setInterval(() => setTimeTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    if (!localId) {
      setSchedules(new Map());
      setReviewBySupplier(new Map());
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      fetchOrderSchedulesForLocal(supabase, localId),
      fetchReviewItemsForLocal(supabase, localId),
      fetchSupplierNamesMap(supabase, localId),
    ])
      .then(([sch, rev, names]) => {
        if (cancelled) return;
        setSchedules(sch);
        setReviewBySupplier(rev);
        setSupplierNames(names);
      })
      .catch(() => {
        if (!cancelled) {
          setSchedules(new Map());
          setReviewBySupplier(new Map());
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [localId, reloadEpoch]);

  const refresh = React.useCallback(() => setReloadEpoch((n) => n + 1), []);

  usePedidosDataChangedListener(refresh, Boolean(localId));

  const now = React.useMemo(() => new Date(), [reloadEpoch, timeTick, orders.length]);

  const { cutoffRows, reviewRows } = React.useMemo(() => {
    const ymd = todayYmdLocal(now);
    const cutoffs: AgendaCutoffRow[] = [];
    const reviews: AgendaReviewRow[] = [];

    for (const [supplierId, schedule] of schedules) {
      if (!schedule.enabled || !isOrderDayToday(schedule, now)) continue;

      const computed = computeCutoffForToday(schedule, orders, supplierId, now);
      if (!computed) continue;

      const name = supplierNames.get(supplierId) ?? 'Proveedor';
      let statusLabel = 'pendiente';
      let statusTone: AgendaCutoffRow['statusTone'] = 'neutral';
      if (computed.status === 'enviado') {
        statusLabel = 'enviado';
        statusTone = 'ok';
      } else if (computed.status === 'vence_pronto') {
        statusLabel = 'vence pronto';
        statusTone = 'warn';
      } else if (computed.status === 'vencido') {
        statusLabel = 'vencido';
        statusTone = 'danger';
      }

      cutoffs.push({
        supplierId,
        supplierName: name,
        cutoffLabel: computed.cutoffLabel,
        statusLabel,
        statusTone,
        href: `/pedidos/nuevo?supplierId=${encodeURIComponent(supplierId)}`,
      });
    }

    for (const [supplierId, schedule] of schedules) {
      if (!schedule.enabled || !isOrderDayToday(schedule, now)) continue;
      const name = supplierNames.get(supplierId) ?? 'Proveedor';
      const items = reviewBySupplier.get(supplierId) ?? [];
      for (const it of items) {
        if (!it.enabled) continue;
        const label = it.product_name_snapshot.trim() || 'Producto';
        reviews.push({
          id: it.id,
          supplierId,
          supplierName: name,
          label,
          href: `/pedidos/nuevo?supplierId=${encodeURIComponent(supplierId)}`,
          done: isReviewItemMarkedDone(localId, ymd, it.id),
        });
      }
    }

    cutoffs.sort((a, b) => a.cutoffLabel.localeCompare(b.cutoffLabel));
    reviews.sort((a, b) => a.supplierName.localeCompare(b.supplierName) || a.label.localeCompare(b.label));

    return { cutoffRows: cutoffs, reviewRows: reviews };
  }, [schedules, reviewBySupplier, orders, supplierNames, localId, now]);

  const pendingCutoffRows = React.useMemo(
    () => cutoffRows.filter((r) => r.statusLabel !== 'enviado'),
    [cutoffRows],
  );

  /** Sin pendientes de corte pero sí pedidos del día ya enviados (lista vacía de acciones). */
  const showAgendaAlDiaMicro = React.useMemo(() => {
    if (loading) return false;
    return cutoffRows.length > 0 && pendingCutoffRows.length === 0 && reviewRows.length === 0;
  }, [loading, cutoffRows.length, pendingCutoffRows.length, reviewRows.length]);

  const showCard =
    loading ||
    pendingCutoffRows.length > 0 ||
    reviewRows.length > 0 ||
    showAgendaAlDiaMicro;

  return {
    loading,
    cutoffRows,
    pendingCutoffRows,
    reviewRows,
    showAgendaAlDiaMicro,
    showCard,
    refresh,
  };
}
