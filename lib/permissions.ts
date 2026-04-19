/**
 * Fuente única de verdad para permisos por rol (ADMIN / MANAGER / STAFF).
 * Reutilizar en menú, gates de ruta, acciones y comprobaciones en servidor cuando aplique.
 */
import type { ProfileAppRole } from '@/components/AuthProvider';

/** Finanzas y datos económicos agregados (solo administración). */
export function canAccessFinanzas(role: ProfileAppRole | null): boolean {
  return role === 'admin';
}

/** Escandallos y costes de carta (solo administración). */
export function canAccessEscandallos(role: ProfileAppRole | null): boolean {
  return role === 'admin';
}

/** Módulo cocina central (solo administración). */
export function canAccessCocinaCentral(role: ProfileAppRole | null): boolean {
  return role === 'admin';
}

/** Costes salariales y datos económicos de personal (solo administración). */
export function canAccessCostesPersonales(role: ProfileAppRole | null): boolean {
  return role === 'admin';
}

/** Alias: costes de personal / datos salariales sensibles. */
export function canAccessCostes(role: ProfileAppRole | null): boolean {
  return canAccessCostesPersonales(role);
}

export function canAccessInventario(role: ProfileAppRole | null): boolean {
  return role === 'admin' || role === 'manager';
}

export function canAccessChat(role: ProfileAppRole | null): boolean {
  return role === 'admin' || role === 'manager';
}

/** Cuenta > Seguridad y cambios sensibles de credenciales. */
export function canAccessCuentaSeguridad(role: ProfileAppRole | null): boolean {
  return role === 'admin';
}

/**
 * Panel analítico ejecutivo en Mermas (gráficas, objetivos €, informes con coste).
 * Registrar mermas sigue disponible para manager/staff.
 */
export function canAccessMermasExecutiveAnalytics(role: ProfileAppRole | null): boolean {
  return role === 'admin';
}

/**
 * Si la ruta debe bloquearse para el rol actual (p. ej. URL escrita a mano).
 * Mantener alineado con AppShell (navegación visible).
 */
export function isRouteBlockedForRole(pathname: string | null, role: ProfileAppRole | null): boolean {
  if (!pathname) return false;
  if (pathname.startsWith('/finanzas')) return !canAccessFinanzas(role);
  if (pathname.startsWith('/escandallos')) return !canAccessEscandallos(role);
  if (pathname.startsWith('/cocina-central')) return !canAccessCocinaCentral(role);
  if (pathname.startsWith('/inventario')) return !canAccessInventario(role);
  if (pathname.startsWith('/chat')) return !canAccessChat(role);
  if (pathname.startsWith('/cuenta/seguridad')) return !canAccessCuentaSeguridad(role);
  return false;
}
