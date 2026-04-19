import type { ProfileAppRole } from '@/components/AuthProvider';

/** Sustituye la antigua clave local de 4 dígitos: admin y manager confirman; staff no. */
export function confirmDestructiveOperation(
  role: ProfileAppRole | null,
  message = '¿Confirmar esta acción?',
): Promise<boolean> {
  if (role === 'staff') {
    if (typeof window !== 'undefined') {
      window.alert('Tu rol no permite esta acción.');
    }
    return Promise.resolve(false);
  }
  if (role === 'admin' || role === 'manager') {
    if (typeof window === 'undefined') return Promise.resolve(true);
    return Promise.resolve(window.confirm(message));
  }
  return Promise.resolve(false);
}
