import type { ReactNode } from 'react';
import FinanzasSubnav from '@/components/FinanzasSubnav';

export default function FinanzasLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
      <FinanzasSubnav />
      {children}
    </div>
  );
}
