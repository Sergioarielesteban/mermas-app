import type { ReactNode } from 'react';

/** El estado de pedidos vive en `PedidosOrdersProvider` (layout raíz) para no vaciar la lista al cambiar de módulo. */
export default function PedidosLayout({ children }: { children: ReactNode }) {
  return children;
}
