'use client';

import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import BlockedModule from '@/components/BlockedModule';
import { canAccessModule } from '@/lib/canAccessModule';
import { isPotentiallyPlanGatedPath, moduleForPath } from '@/lib/planPermissions';
import { isPotentiallyRoleGatedPath, isRouteBlockedForRole } from '@/lib/permissions';

export default function RoleRouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profileReady, profileRole, plan } = useAuth();

  const blocked = useMemo(
    () => (profileReady ? isRouteBlockedForRole(pathname, profileRole) : false),
    [pathname, profileReady, profileRole],
  );
  const blockedModule = useMemo(() => {
    if (!profileReady) return null;
    const planModule = moduleForPath(pathname);
    if (!planModule) return null;
    return canAccessModule(plan, planModule) ? null : planModule;
  }, [pathname, plan, profileReady]);

  useEffect(() => {
    if (!profileReady || !blocked) return;
    router.replace('/panel');
  }, [profileReady, blocked, router]);

  if (!profileReady && (isPotentiallyRoleGatedPath(pathname) || isPotentiallyPlanGatedPath(pathname))) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-sm text-zinc-600">Cargando permisos…</p>
      </div>
    );
  }
  if (!profileReady) return <>{children}</>;
  if (blocked) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-sm font-semibold text-zinc-800">No tienes permiso para esta sección.</p>
        <p className="mt-2 text-xs text-zinc-600">Redirigiendo al panel…</p>
      </div>
    );
  }
  if (blockedModule) {
    return <BlockedModule module={blockedModule} />;
  }
  return <>{children}</>;
}
