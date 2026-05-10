'use client';

import React from 'react';
import { computeOperationalSuggestions } from '@/lib/pedidos-operational-suggestions';
import type { CatalogSignals } from '@/lib/pedidos-nuevo-catalog-stats';
import { bumpSuggestionFeedback, loadSuggestionFeedback } from '@/lib/pedidos-suggestion-feedback';
import type { PedidoOrder, PedidoSupplierProduct } from '@/lib/pedidos-supabase';

export function usePedidosOperationalSuggestions(params: {
  localId: string | null;
  supplierId: string;
  orders: PedidoOrder[];
  supplierProducts: PedidoSupplierProduct[];
  qtyByProductId: Record<string, number>;
  catalogSignals: CatalogSignals;
  searchActive: boolean;
}) {
  const [feedbackEpoch, setFeedbackEpoch] = React.useState(0);

  const feedback = React.useMemo(
    () => loadSuggestionFeedback(params.localId),
    [params.localId, feedbackEpoch],
  );

  const suggestions = React.useMemo(
    () =>
      computeOperationalSuggestions({
        localId: params.localId,
        supplierId: params.supplierId,
        orders: params.orders,
        supplierProducts: params.supplierProducts,
        qtyByProductId: params.qtyByProductId,
        catalogSignals: params.catalogSignals,
        searchActive: params.searchActive,
        now: new Date(),
        feedback,
      }),
    [
      params.localId,
      params.supplierId,
      params.orders,
      params.supplierProducts,
      params.qtyByProductId,
      params.catalogSignals,
      params.searchActive,
      feedback,
    ],
  );

  const recordAdd = React.useCallback((suggestionId: string) => {
    if (!params.localId) return;
    bumpSuggestionFeedback(params.localId, suggestionId, 'add');
    setFeedbackEpoch((n) => n + 1);
  }, [params.localId]);

  const recordDismiss = React.useCallback((suggestionId: string) => {
    if (!params.localId) return;
    bumpSuggestionFeedback(params.localId, suggestionId, 'dismiss');
    setFeedbackEpoch((n) => n + 1);
  }, [params.localId]);

  return { suggestions, recordAdd, recordDismiss };
}
