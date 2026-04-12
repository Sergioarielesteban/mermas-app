import type { ReactNode } from 'react';
import { PedidosOrdersProvider } from '@/components/PedidosOrdersProvider';

export default function PedidosLayout({ children }: { children: ReactNode }) {
  return <PedidosOrdersProvider>{children}</PedidosOrdersProvider>;
}
