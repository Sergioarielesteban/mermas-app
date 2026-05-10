'use client';

import React from 'react';
import { computeSuggestedOrder, type SuggestedOrderResult } from '@/lib/pedidos-suggested-order';
import type { PedidoOrder, PedidoSupplierProduct } from '@/lib/pedidos-supabase';

export function useSuggestedOrder(params: {
  localId: string | null | undefined;
  supplierId: string;
  supplierName: string;
  supplierProducts: PedidoSupplierProduct[];
  orders: PedidoOrder[];
  /** Enlaza cobertura con `pedidos-coverage` cuando hay fecha de entrega. */
  deliveryDateYmd?: string;
  deliveryCycleWeekdays?: number[];
  deliveryExceptionDates?: string[];
}) {
  const {
    localId,
    supplierId,
    supplierName,
    supplierProducts,
    orders,
    deliveryDateYmd,
    deliveryCycleWeekdays,
    deliveryExceptionDates,
  } = params;

  const result: SuggestedOrderResult = React.useMemo(() => {
    if (!localId || !supplierId) return { ok: false, reason: 'insufficient_history' };
    return computeSuggestedOrder(orders, supplierId, supplierProducts, supplierName, {
      deliveryDateYmd: deliveryDateYmd?.trim() || undefined,
      deliveryCycleWeekdays,
      deliveryExceptionDates,
    });
  }, [
    localId,
    supplierId,
    supplierName,
    supplierProducts,
    orders,
    deliveryDateYmd,
    deliveryCycleWeekdays,
    deliveryExceptionDates,
  ]);

  const hasSuggestion = result.ok === true;

  return { result, hasSuggestion };
}
