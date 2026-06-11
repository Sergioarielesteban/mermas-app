'use client';

import type { ReactNode } from 'react';
import InventarioSubnav from '@/components/inventario/InventarioSubnav';

export default function InventarioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-2 px-3 py-3 sm:space-y-2.5 sm:px-4 sm:py-4">
      <InventarioSubnav />
      {children}
    </div>
  );
}
