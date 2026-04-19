import type { ProfileAppRole } from '@/components/AuthProvider';
import { canAccessCocinaCentral } from '@/lib/app-role-permissions';

/** Todo el módulo /cocina-central: solo administración. */
export function canAccessCocinaCentralModule(role: ProfileAppRole | null): boolean {
  return canAccessCocinaCentral(role);
}

/**
 * Producción, lotes, etiquetas, escaneo en sede marcada como cocina central.
 * Requiere además admin/manager (staff queda fuera del módulo por completo).
 */
export function canCocinaCentralOperate(
  isCentralKitchen: boolean,
  role: ProfileAppRole | null,
): boolean {
  return isCentralKitchen && canAccessCocinaCentralModule(role);
}

/** Crear/editar entregas salientes (solo encargados en central). */
export function canManageDeliveries(
  isCentralKitchen: boolean,
  role: ProfileAppRole | null,
): boolean {
  return isCentralKitchen && canAccessCocinaCentralModule(role);
}

/** Confirmar salida y descuento de stock. */
export function canConfirmDeliveryDispatch(
  isCentralKitchen: boolean,
  role: ProfileAppRole | null,
): boolean {
  return isCentralKitchen && canAccessCocinaCentralModule(role);
}

/** Firmar albarán en destino (mismo criterio: sin staff). */
export function canSignDeliveryReceipt(role: ProfileAppRole | null): boolean {
  return canAccessCocinaCentralModule(role);
}

/**
 * Pedir suministro a cocina central (catálogo con precios del local central).
 * Cualquier usuario con local satélite; el RPC valida de nuevo en servidor.
 */
export function canPlaceCentralSupplyOrder(isCentralKitchen: boolean, localId: string | null): boolean {
  return !isCentralKitchen && !!localId;
}
