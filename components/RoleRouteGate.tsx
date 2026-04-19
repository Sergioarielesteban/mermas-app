'use client';

import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useMemo } from 'react';
import type { ProfileAppRole } from '@/components/AuthProvider';
import { useAuth } from '@/components/AuthProvider';
import {
  canAccessChat,
  canAccessCocinaCentral,
  canAccessCuentaSeguridad,
  canAccessEscandallos,
  canAccessFinanzas,
  canAccessInventario,
} from '@/lib/app-role-permissions';

function isBlockedPath(pathname: string | null, role: ProfileAppRole | null): boolean {
  if (!pathname) return false;
  if (pathname.startsWith('/finanzas')) return !canAccessFinanzas(role);
  if (pathname.startsWith('/escandallos')) return !canAccessEscandallos(role);
  if (pathname.startsWith('/cocina-central')) return !canAccessCocinaCentral(role);
  if (pathname.startsWith('/inventario')) return !canAccessInventario(role);
  if (pathname.startsWith('/chat')) return !canAccessChat(role);
  if (pathname.startsWith('/cuenta/seguridad')) return !canAccessCuentaSeguridad(role);
  return false;
}

export default function RoleRouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profileReady, profileRole } = useAuth();

  const blocked = useMemo(
    () => (profileReady ? isBlockedPath(pathname, profileRole) : false),
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
