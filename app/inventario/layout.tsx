'use client';

import type { ReactNode } from 'react';
import InventarioSubnav from '@/components/inventario/InventarioSubnav';

export default function InventarioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 w-full max-w-full overflow-x-clip space-y-2 py-1 sm:space-y-2.5 sm:py-2">
      <InventarioSubnav />
      {children}
    </div>
  );
}
