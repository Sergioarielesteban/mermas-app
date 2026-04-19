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

const ACCESS_DEBUG_THROTTLE_MS = 8_000;
const ACCESS_DEBUG_RECENT = new Map<string, number>();

function logAccessDebug(input: {
  role: ProfileAppRole | null | undefined;
  plan: PlanCode | null | undefined;
  module: PlanModule;
  bypass: boolean;
  reason: 'admin_bypass' | 'blocked_plan' | 'blocked_role' | 'allowed';
}) {
  const now = Date.now();
  const key = `${input.role ?? 'none'}|${input.plan ?? 'none'}|${input.module}|${input.reason}|${input.bypass}`;
  const last = ACCESS_DEBUG_RECENT.get(key) ?? 0;
  if (now - last < ACCESS_DEBUG_THROTTLE_MS) return;
  ACCESS_DEBUG_RECENT.set(key, now);
  if (ACCESS_DEBUG_RECENT.size > 400) {
    for (const [k, t] of ACCESS_DEBUG_RECENT) {
      if (now - t > ACCESS_DEBUG_THROTTLE_MS * 2) ACCESS_DEBUG_RECENT.delete(k);
    }
  }
  const resolvedPlan = input.plan ?? 'null';
  console.warn(
    `[ACCESS DEBUG] role=${input.role ?? 'none'} plan=${resolvedPlan} bypass=${input.bypass ? 'true' : 'false'} module=${input.module} reason=${input.reason}`,
  );
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
  if (isAdminRole(user.role)) {
    logAccessDebug({
      role: user.role,
      plan: user.plan,
      module,
      bypass: true,
      reason: 'admin_bypass',
    });
    return { allowed: true, blockedBy: null };
  }
  const roleOk = canRoleAccessModule(user.role, module);
  if (!roleOk) {
    logAccessDebug({
      role: user.role,
      plan: user.plan,
      module,
      bypass: false,
      reason: 'blocked_role',
    });
    return { allowed: false, blockedBy: 'role' };
  }
  const planOk = canPlanAccessModule(user.plan, module);
  if (!planOk) {
    logAccessDebug({
      role: user.role,
      plan: user.plan,
      module,
      bypass: false,
      reason: 'blocked_plan',
    });
    return { allowed: false, blockedBy: 'plan' };
  }
  logAccessDebug({
    role: user.role,
    plan: user.plan,
    module,
    bypass: false,
    reason: 'allowed',
  });
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
