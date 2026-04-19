'use client';

import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import BlockedModule from '@/components/BlockedModule';
import { getModuleAccess } from '@/lib/canAccessModule';
import { isPotentiallyPlanGatedPath, moduleForPath } from '@/lib/planPermissions';
import { isPotentiallyRoleGatedPath, isRouteBlockedForRole } from '@/lib/permissions';

export default function RoleRouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profileReady, profileRole, plan } = useAuth();

  const moduleAccess = useMemo(() => {
    if (!profileReady) return null;
    const planModule = moduleForPath(pathname);
    if (!planModule) return null;
    const access = getModuleAccess({ plan, role: profileRole }, planModule);
    return { module: planModule, ...access };
  }, [pathname, plan, profileReady, profileRole]);
  const roleBlocked = useMemo(
    () => (profileReady ? isRouteBlockedForRole(pathname, profileRole) : false),
    [pathname, profileReady, profileRole],
  );

  useEffect(() => {
    if (!profileReady || (!roleBlocked && moduleAccess?.blockedBy !== 'role')) return;
    router.replace('/panel');
  }, [profileReady, roleBlocked, moduleAccess, router]);

  if (!profileReady && (isPotentiallyRoleGatedPath(pathname) || isPotentiallyPlanGatedPath(pathname))) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-sm text-zinc-600">Cargando permisos…</p>
      </div>
    );
  }
  if (!profileReady) return <>{children}</>;
  if (roleBlocked || moduleAccess?.blockedBy === 'role') {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-sm font-semibold text-zinc-800">Este módulo no está disponible para tu rol.</p>
        <p className="mt-2 text-xs text-zinc-600">Redirigiendo al panel…</p>
      </div>
    );
  }
  if (moduleAccess?.blockedBy === 'plan') {
    return <BlockedModule module={moduleAccess.module} />;
  }
  return <>{children}</>;
}
