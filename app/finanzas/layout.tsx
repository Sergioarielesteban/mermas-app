'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import FinanzasSubnav from '@/components/FinanzasSubnav';

/** En `/finanzas` el subnav va debajo del banner (ver `FinanzasEconomiaDashboard`). */
export default function FinanzasLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showSubnavAbove = pathname !== '/finanzas';

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
      {showSubnavAbove ? <FinanzasSubnav className="mb-4" /> : null}
      {children}
    </div>
  );
}
