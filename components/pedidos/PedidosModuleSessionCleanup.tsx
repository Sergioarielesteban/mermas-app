'use client';

import { useEffect } from 'react';
import { CHEFONE_PEDIDOS_UI_STATE_KEY } from '@/lib/pedidos-ui-session';

/** Al salir del módulo (/pedidos/*) la siguiente entrada debe ser home limpia (regla UX). */
export function PedidosModuleSessionCleanup() {
  useEffect(() => {
    return () => {
      try {
        sessionStorage.removeItem(CHEFONE_PEDIDOS_UI_STATE_KEY);
      } catch {
        /* ignore */
      }
    };
  }, []);
  return null;
}
