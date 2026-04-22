import type { ProfileAppRole } from '@/lib/profile-app-role';
import { canAccessTeamManagement } from '@/lib/permissions';

/** CRUD catálogo de platos, plan del día y tareas de producción (texto/alta/baja). */
export function canManageServicioOperaciones(role: ProfileAppRole | null): boolean {
  return canAccessTeamManagement(role);
}
