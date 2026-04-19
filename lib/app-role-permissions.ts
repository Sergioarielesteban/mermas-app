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
