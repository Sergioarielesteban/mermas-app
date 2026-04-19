import type { ProfileAppRole } from '@/lib/profile-app-role';
import { PLAN_MODULES_BY_PLAN, type PlanCode, type PlanModule } from '@/lib/planPermissions';

type ModuleAccessUser = {
  plan: PlanCode | null | undefined;
  role: ProfileAppRole | null | undefined;
};

type ModuleAccessResult = {
  allowed: boolean;
  blockedBy: 'plan' | 'role' | null;
};

const ROLE_MODULES: Record<ProfileAppRole, readonly PlanModule[]> = {
  admin: [...PLAN_MODULES_BY_PLAN.PRO],
  manager: [
    'pedidos',
    'mermas',
    'appcc',
    'checklist',
    'chat',
    'inventario',
    'produccion',
    'personal',
    'comida_personal',
  ],
  staff: ['mermas', 'appcc', 'checklist', 'chat', 'produccion', 'personal'],
};

function isAdminRole(role: ProfileAppRole | null | undefined): boolean {
  return role === 'admin';
}

export function canRoleAccessModule(role: ProfileAppRole | null | undefined, module: PlanModule): boolean {
  if (isAdminRole(role)) return true;
  if (!role) return false;
  return ROLE_MODULES[role].includes(module);
}

export function canPlanAccessModule(plan: PlanCode | null | undefined, module: PlanModule): boolean {
  if (!plan) return false;
  return PLAN_MODULES_BY_PLAN[plan].includes(module);
}

export function getModuleAccess(user: ModuleAccessUser, module: PlanModule): ModuleAccessResult {
  if (isAdminRole(user.role)) return { allowed: true, blockedBy: null };
  const roleOk = canRoleAccessModule(user.role, module);
  if (!roleOk) return { allowed: false, blockedBy: 'role' };
  const planOk = canPlanAccessModule(user.plan, module);
  if (!planOk) return { allowed: false, blockedBy: 'plan' };
  return { allowed: true, blockedBy: null };
}

/**
 * Compatibilidad:
 * - canAccessModule(plan, module) -> chequeo solo de plan.
 * - canAccessModule({ plan, role }, module) -> chequeo combinado plan + rol.
 */
export function canAccessModule(plan: PlanCode | null | undefined, module: PlanModule): boolean;
export function canAccessModule(user: ModuleAccessUser, module: PlanModule): boolean;
export function canAccessModule(
  planOrUser: PlanCode | null | undefined | ModuleAccessUser,
  module: PlanModule,
): boolean {
  if (typeof planOrUser === 'object' && planOrUser !== null && 'plan' in planOrUser) {
    if (isAdminRole(planOrUser.role)) return true;
    return getModuleAccess(planOrUser, module).allowed;
  }
  return canPlanAccessModule(planOrUser, module);
}
