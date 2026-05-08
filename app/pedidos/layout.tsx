import type { ReactNode } from 'react';
import { PedidosModuleSessionCleanup } from '@/components/pedidos/PedidosModuleSessionCleanup';
import { PedidosOrdersProvider } from '@/components/PedidosOrdersProvider';

/**
 * Pedidos: provider aquí (no en root) para no mantener fetch/realtime de pedidos fuera del módulo.
 * La lista sigue hidratándose desde sessionStorage al volver a /pedidos.
 */
export default function PedidosLayout({ children }: { children: ReactNode }) {
  return (
    <PedidosOrdersProvider>
      <PedidosModuleSessionCleanup />
      {children}
    </PedidosOrdersProvider>
  );
}
