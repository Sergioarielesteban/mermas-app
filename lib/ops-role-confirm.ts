import type { ProfileAppRole } from '@/components/AuthProvider';
import { appAlert, appConfirm } from '@/lib/app-dialog-bridge';

/** Sustituye la antigua clave local de 4 dígitos: admin y manager confirman; staff no. */
export function confirmDestructiveOperation(
  role: ProfileAppRole | null,
  message = '¿Confirmar esta acción?',
): Promise<boolean> {
  if (role === 'staff') {
    return appAlert('Tu rol no permite esta acción.').then(() => false);
  }
  if (role === 'admin' || role === 'manager') {
    if (typeof window === 'undefined') return Promise.resolve(true);
    return appConfirm(message);
  }
  return Promise.resolve(false);
}
