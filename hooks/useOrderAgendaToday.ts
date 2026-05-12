'use client';

import React from 'react';
import { getSupabaseClient } from '@/lib/supabase-client';
import {
  computeCutoffForToday,
  formatCutoffHm,
  isOrderDayToday,
  todayYmdLocal,
  type PedidoSupplierOrderScheduleRow,
} from '@/lib/pedidos-order-agenda-engine';
import {
  fetchAgendaDayActionsForLocal,
  fetchOrderSchedulesForLocal,
  fetchReviewItemsForLocal,
  fetchSupplierNamesMap,
  type PedidoAgendaDayActions,
  type PedidoSupplierReviewItemDb,
} from '@/lib/pedidos-order-agenda-supabase';
import { isReviewItemMarkedDone } from '@/lib/pedidos-order-agenda-review-storage';
import { isMandatoryOmitted } from '@/lib/pedidos-order-agenda-mandatory-omit-storage';
import { virtualSupplierReviewItemId } from '@/lib/pedidos-order-agenda-virtual-review';
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

/** Revisiones agrupadas por proveedor (checklist); no se mezclan con cortes obligatorios en UI. */
export type AgendaReviewSupplierGroup = {
  supplierId: string;
  supplierName: string;
  itemIds: string[];
  href: string;
  allDone: boolean;
  /** Hora límite configurada en agenda (también en modo «solo revisar»). */
  cutoffLabel: string | null;
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
  const [dayActions, setDayActions] = React.useState<PedidoAgendaDayActions>(() => ({
    mandatoryOmittedSupplierIds: new Set(),
    reviewDoneItemKeys: new Set(),
  }));
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
      setDayActions({ mandatoryOmittedSupplierIds: new Set(), reviewDoneItemKeys: new Set() });
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    const loadYmd = todayYmdLocal(new Date());
    setLoading(true);
    void Promise.all([
      fetchOrderSchedulesForLocal(supabase, localId),
      fetchReviewItemsForLocal(supabase, localId),
      fetchSupplierNamesMap(supabase, localId),
      fetchAgendaDayActionsForLocal(supabase, localId, loadYmd),
    ])
      .then(([sch, rev, names, actions]) => {
        if (cancelled) return;
        setSchedules(sch);
        setReviewBySupplier(rev);
        setSupplierNames(names);
        setDayActions(actions);
      })
      .catch(() => {
        if (!cancelled) {
          setSchedules(new Map());
          setReviewBySupplier(new Map());
          setDayActions({ mandatoryOmittedSupplierIds: new Set(), reviewDoneItemKeys: new Set() });
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

  React.useEffect(() => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const channel = supabase
      .channel(`pedidos-agenda-actions-rt:${localId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedido_agenda_day_actions', filter: `local_id=eq.${localId}` },
        refresh,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [localId, refresh]);

  const now = React.useMemo(() => new Date(), [reloadEpoch, timeTick, orders.length]);

  const ymd = React.useMemo(() => todayYmdLocal(now), [now]);

  const { cutoffRows, reviewRows } = React.useMemo(() => {
    const cutoffs: AgendaCutoffRow[] = [];
    const reviews: AgendaReviewRow[] = [];

    for (const [supplierId, schedule] of schedules) {
      if (!schedule.enabled || !isOrderDayToday(schedule, now)) continue;
      if (schedule.agendaMode === 'review') continue;

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
          done: localId
            ? dayActions.reviewDoneItemKeys.has(`${supplierId}:${it.id}`) ||
              isReviewItemMarkedDone(localId, ymd, it.id)
            : false,
        });
      }
    }

    for (const [supplierId, schedule] of schedules) {
      if (!schedule.enabled || !isOrderDayToday(schedule, now)) continue;
      if (schedule.agendaMode !== 'review') continue;
      const name = supplierNames.get(supplierId) ?? 'Proveedor';
      const vid = virtualSupplierReviewItemId(supplierId);
      reviews.push({
        id: vid,
        supplierId,
        supplierName: name,
        label: 'Revisar si necesitas pedir',
        href: `/pedidos/nuevo?supplierId=${encodeURIComponent(supplierId)}`,
        done: localId
          ? dayActions.reviewDoneItemKeys.has(`${supplierId}:${vid}`) ||
            isReviewItemMarkedDone(localId, ymd, vid)
          : false,
      });
    }

    cutoffs.sort((a, b) => a.cutoffLabel.localeCompare(b.cutoffLabel));
    reviews.sort((a, b) => a.supplierName.localeCompare(b.supplierName) || a.label.localeCompare(b.label));

    return { cutoffRows: cutoffs, reviewRows: reviews };
  }, [schedules, reviewBySupplier, orders, supplierNames, localId, ymd, dayActions]);

  const pendingCutoffRows = React.useMemo(
    () => cutoffRows.filter((r) => r.statusLabel !== 'enviado'),
    [cutoffRows],
  );

  /** Obligatorios hoy: sin omisión manual. */
  const mandatoryRows = React.useMemo(() => {
    if (!localId) return pendingCutoffRows;
    return pendingCutoffRows.filter(
      (r) => !dayActions.mandatoryOmittedSupplierIds.has(r.supplierId) && !isMandatoryOmitted(localId, ymd, r.supplierId),
    );
  }, [pendingCutoffRows, localId, ymd, dayActions]);

  const mandatorySupplierIdSet = React.useMemo(
    () => new Set(mandatoryRows.map((r) => r.supplierId)),
    [mandatoryRows],
  );

  /**
   * Proveedores con ítems de revisión que NO tienen aún corte obligatorio pendiente en agenda
   * (evita duplicar el mismo proveedor en ambos bloques).
   */
  const reviewSupplierGroups = React.useMemo((): AgendaReviewSupplierGroup[] => {
    const bySup = new Map<
      string,
      { supplierName: string; ids: string[]; href: string }
    >();
    for (const r of reviewRows) {
      if (mandatorySupplierIdSet.has(r.supplierId)) continue;
      const prev = bySup.get(r.supplierId);
      const href = `/pedidos/nuevo?supplierId=${encodeURIComponent(r.supplierId)}`;
      if (!prev) {
        bySup.set(r.supplierId, {
          supplierName: r.supplierName,
          ids: [r.id],
          href,
        });
      } else {
        prev.ids.push(r.id);
      }
    }
    const out: AgendaReviewSupplierGroup[] = [];
    for (const [supplierId, v] of bySup) {
      const itemIds = v.ids;
      const allDone =
        localId != null &&
        itemIds.length > 0 &&
        itemIds.every(
          (id) =>
            dayActions.reviewDoneItemKeys.has(`${supplierId}:${id}`) ||
            isReviewItemMarkedDone(localId, ymd, id),
        );
      const sch = schedules.get(supplierId);
      const cutoffLabel =
        sch && sch.enabled && isOrderDayToday(sch, now) ? formatCutoffHm(sch.cutoffTime) : null;
      out.push({
        supplierId,
        supplierName: v.supplierName,
        itemIds,
        href: v.href,
        allDone,
        cutoffLabel,
      });
    }
    out.sort((a, b) => a.supplierName.localeCompare(b.supplierName, 'es'));
    return out;
  }, [reviewRows, mandatorySupplierIdSet, localId, ymd, schedules, now, dayActions]);

  const hasPendingReviews = React.useMemo(
    () => reviewSupplierGroups.some((g) => !g.allDone),
    [reviewSupplierGroups],
  );

  /** Todo resuelto: sin cortes pendientes (tras omitir/enviar) y sin revisiones pendientes. */
  const showAgendaCompletadaMicro = React.useMemo(() => {
    if (loading) return false;
    const hadAgendaScope =
      cutoffRows.length > 0 || reviewRows.length > 0;
    if (!hadAgendaScope) return false;
    return mandatoryRows.length === 0 && !hasPendingReviews;
  }, [loading, cutoffRows.length, reviewRows.length, mandatoryRows.length, hasPendingReviews]);

  const showCard =
    loading ||
    mandatoryRows.length > 0 ||
    hasPendingReviews ||
    showAgendaCompletadaMicro;

  return {
    loading,
    ymd,
    cutoffRows,
    pendingCutoffRows,
    mandatoryRows,
    reviewRows,
    reviewSupplierGroups,
    showAgendaCompletadaMicro,
    showCard,
    refresh,
  };
}
