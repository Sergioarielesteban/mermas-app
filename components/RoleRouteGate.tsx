'use client';

import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getModuleAccess } from '@/lib/canAccessModule';
import { logAccessBlocked } from '@/lib/moduleAccessControl';
import { isPotentiallyPlanGatedPath, moduleForPath } from '@/lib/planPermissions';
import { isPotentiallyRoleGatedPath, isRouteBlockedForRole } from '@/lib/permissions';

export default function RoleRouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profileReady, profileRole, plan, userId } = useAuth();

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
    if (moduleAccess?.module) {
      logAccessBlocked({
        userId,
        role: profileRole,
        plan,
        module: moduleAccess.module,
        action: 'view',
        cause: 'role',
        path: pathname,
      });
    }
    router.replace('/panel');
  }, [profileReady, roleBlocked, moduleAccess, router, userId, profileRole, plan, pathname]);

  useEffect(() => {
    if (!profileReady || moduleAccess?.blockedBy !== 'plan') return;
    logAccessBlocked({
      userId,
      role: profileRole,
      plan,
      module: moduleAccess.module,
      action: 'view',
      cause: 'plan',
      path: pathname,
    });
    router.replace('/planes');
  }, [profileReady, moduleAccess, userId, profileRole, plan, pathname, router]);

  if (!profileReady && (isPotentiallyRoleGatedPath(pathname) || isPotentiallyPlanGatedPath(pathname))) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-sm text-zinc-600">Cargando permisos…</p>
      </div>
    );
  }
  if (!profileReady) return <>{children}</>;
  if (roleBlocked || moduleAccess?.blockedBy === 'role') return null;
  if (moduleAccess?.blockedBy === 'plan') return null;
  return <>{children}</>;
}
