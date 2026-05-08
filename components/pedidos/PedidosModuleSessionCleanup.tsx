'use client';

import { useEffect } from 'react';
import { clearPedidosUiStateOnlyWhenUserLeavesModule } from '@/lib/pedidos-ui-session';

/** Al salir del módulo (/pedidos/*) la siguiente entrada debe ser home limpia (regla UX). */
export function PedidosModuleSessionCleanup() {
  useEffect(() => {
    return () => {
      clearPedidosUiStateOnlyWhenUserLeavesModule();
    };
  }, []);
  return null;
}
