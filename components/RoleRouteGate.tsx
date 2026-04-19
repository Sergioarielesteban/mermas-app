'use client';

import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { isRouteBlockedForRole } from '@/lib/permissions';

export default function RoleRouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profileReady, profileRole } = useAuth();

  const blocked = useMemo(
    () => (profileReady ? isRouteBlockedForRole(pathname, profileRole) : false),
    [pathname, profileReady, profileRole],
  );

  useEffect(() => {
    if (!profileReady || !blocked) return;
    router.replace('/panel');
  }, [profileReady, blocked, router]);

  if (!profileReady) return <>{children}</>;
  if (blocked) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-sm font-semibold text-zinc-800">No tienes permiso para esta sección.</p>
        <p className="mt-2 text-xs text-zinc-600">Redirigiendo al panel…</p>
      </div>
    );
  }
  return <>{children}</>;
}
