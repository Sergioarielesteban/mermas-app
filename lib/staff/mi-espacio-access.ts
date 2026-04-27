import type { ProfileAppRole } from '@/lib/profile-app-role';
import type { StaffEmployee } from '@/lib/staff/types';

/**
 * Contenido de la sección Mi espacio: requiere ficha vinculada, salvo administradores del local.
 */
export function canAccessMiEspacioPersonalContent(
  linked: StaffEmployee | null,
  profileRole: ProfileAppRole | null,
): boolean {
  if (linked) return true;
  return profileRole === 'admin';
}
