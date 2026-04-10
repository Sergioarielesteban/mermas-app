'use client';

import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { canAccessPedidos } from '@/lib/pedidos-access';
import { dispatchPedidosDataChanged } from '@/hooks/usePedidosDataChangedListener';
import { getSupabaseClient } from '@/lib/supabase-client';

/** Suscripción Supabase Realtime para pedidos: mismo criterio que “ver” el módulo (incl. Premià con pantalla bloqueada). */
export default function PedidosRealtimeSync() {
  const { localCode, localName, localId, email } = useAuth();
  const hasEntry = canAccessPedidos(localCode, email, localName, localId);

  React.useEffect(() => {
    if (!hasEntry || !localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const ch = supabase
      .channel(`pedidos-rt-${localId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_orders', filter: `local_id=eq.${localId}` },
        () => dispatchPedidosDataChanged(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_order_items', filter: `local_id=eq.${localId}` },
        () => dispatchPedidosDataChanged(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [hasEntry, localId]);

  return null;
}
