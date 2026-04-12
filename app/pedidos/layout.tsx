import type { ReactNode } from 'react';
import { PedidosOrdersProvider } from '@/components/PedidosOrdersProvider';
import PedidosRealtimeSync from '@/components/PedidosRealtimeSync';

export default function PedidosLayout({ children }: { children: ReactNode }) {
  return (
    <PedidosOrdersProvider>
      <PedidosRealtimeSync />
      {children}
    </PedidosOrdersProvider>
  );
}
