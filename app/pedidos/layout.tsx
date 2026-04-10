import type { ReactNode } from 'react';
import PedidosRealtimeSync from '@/components/PedidosRealtimeSync';

export default function PedidosLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PedidosRealtimeSync />
      {children}
    </>
  );
}
