/**
 * Rol de aplicación (columna `profiles.role`). Fuente compartida cliente/servidor.
 */
export type ProfileAppRole = 'admin' | 'manager' | 'staff';

export function parseProfileAppRole(raw: string | null | undefined): ProfileAppRole {
  const r = (raw ?? 'staff').trim().toLowerCase();
  if (r === 'admin') return 'admin';
  if (r === 'superadmin') return 'admin';
  if (r === 'manager') return 'manager';
  return 'staff';
}
