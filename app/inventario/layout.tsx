'use client';

import type { ReactNode } from 'react';
import InventarioSubnav from '@/components/inventario/InventarioSubnav';

export default function InventarioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
      <InventarioSubnav className="mb-4" />
      {children}
    </div>
  );
}
