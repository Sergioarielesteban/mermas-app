'use client';

import React from 'react';
import { computeTemporalPatterns, type TemporalPatternsResult } from '@/lib/pedidos-temporal-patterns';
import type { PedidoOrder, PedidoSupplierProduct } from '@/lib/pedidos-supabase';

export function useTemporalPatterns(params: {
  localId: string | null | undefined;
  supplierId: string;
  supplierProducts: PedidoSupplierProduct[];
  orders: PedidoOrder[];
}) {
  const { localId, supplierId, supplierProducts, orders } = params;

  const patterns: TemporalPatternsResult = React.useMemo(() => {
    if (!localId || !supplierId) {
      return {
        maturityLevel: 1,
        learningMessage: 'Histórico insuficiente para detectar patrones.',
        insights: [],
        displayInsights: [],
      };
    }
    return computeTemporalPatterns(orders, supplierId, supplierProducts, new Date());
  }, [localId, supplierId, supplierProducts, orders]);

  return patterns;
}
