import type { ProfileAppRole } from '@/components/AuthProvider';
import type { StaffPermissions } from '@/lib/staff/types';

export function buildStaffPermissions(profileRole: ProfileAppRole | null): StaffPermissions {
  const role = profileRole ?? 'staff';
  const isAdmin = role === 'admin';
  const canViewTeamSummary = role === 'admin' || role === 'manager';
  return {
    profileRole: profileRole ?? null,
    canManageSchedules: isAdmin,
    canManageEmployees: isAdmin,
    canCorrectEntries: isAdmin,
    canResolveIncidents: isAdmin,
    canViewTeamSummary,
  };
}

/** Oculta datos sensibles de empleado para compañeros (solo UI; RLS sigue el modelo del servidor). */
export function maskEmployeeForPeer<T extends { phone?: string | null; email?: string | null; hasPin?: boolean }>(
  emp: T,
  isPeer: boolean,
): T {
  if (!isPeer) return emp;
  return {
    ...emp,
    phone: null,
    email: null,
    hasPin: false,
  };
}
