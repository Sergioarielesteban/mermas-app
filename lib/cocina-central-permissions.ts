import type { ProfileAppRole } from '@/components/AuthProvider';

/** Producción, lotes, etiquetas, escaneo en central. */
export function canCocinaCentralOperate(isCentralKitchen: boolean): boolean {
  return isCentralKitchen;
}

/** Crear/editar entregas, añadir líneas, marcar preparado / en reparto. */
export function canManageDeliveries(
  isCentralKitchen: boolean,
  role: ProfileAppRole | null,
): boolean {
  if (!isCentralKitchen) return false;
  return role === 'admin' || role === 'manager' || role === 'staff';
}

/** Confirmar salida: valida stock, descuenta y pasa a entregado (solo responsables). */
export function canConfirmDeliveryDispatch(
  isCentralKitchen: boolean,
  role: ProfileAppRole | null,
): boolean {
  if (!isCentralKitchen) return false;
  return role === 'admin' || role === 'manager';
}

/** Firmar albarán en destino. */
export function canSignDeliveryReceipt(): boolean {
  return true;
}
