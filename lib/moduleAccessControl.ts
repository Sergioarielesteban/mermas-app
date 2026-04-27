import type { ProfileAppRole } from '@/lib/profile-app-role';
import type { PlanCode, PlanModule } from '@/lib/planPermissions';
import { getModuleAccess } from '@/lib/canAccessModule';

export type ModuleAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'export'
  | 'download_report'
  | 'register'
  | 'adjust'
  | 'open_management_modal';

type ModuleAccessUser = {
  userId: string | null | undefined;
  role: ProfileAppRole | null | undefined;
  plan: PlanCode | null | undefined;
};

type AccessCause = 'plan' | 'role';

type ModuleActionAccessResult = {
  allowed: boolean;
  blockedBy: AccessCause | null;
};

const ROLE_ACTION_OVERRIDES: Partial<
  Record<ProfileAppRole, Partial<Record<PlanModule, Partial<Record<ModuleAction, boolean>>>>>
> = {
  manager: {
    personal: {
      adjust: false,
      export: false,
      download_report: false,
      register: false,
      create: false,
      edit: false,
      delete: false,
      open_management_modal: false,
    },
  },
  staff: {
    personal: {
      adjust: false,
      export: false,
      download_report: false,
      create: false,
      edit: false,
      delete: false,
      open_management_modal: false,
    },
  },
};

const RECENT_BLOCK_KEYS = new Map<string, number>();
const LOG_THROTTLE_MS = 15_000;

function roleCanExecuteAction(
  role: ProfileAppRole | null | undefined,
  module: PlanModule,
  action: ModuleAction,
): boolean {
  if (!role) return false;
  if (role === 'admin') return true;
  const override = ROLE_ACTION_OVERRIDES[role]?.[module]?.[action];
  if (override === undefined) return true;
  return override;
}

export function getModuleActionAccess(
  user: ModuleAccessUser,
  module: PlanModule,
  action: ModuleAction,
): ModuleActionAccessResult {
  const moduleAccess = getModuleAccess({ plan: user.plan, role: user.role }, module);
  if (!moduleAccess.allowed) {
    return { allowed: false, blockedBy: moduleAccess.blockedBy };
  }
  if (!roleCanExecuteAction(user.role, module, action)) {
    return { allowed: false, blockedBy: 'role' };
  }
  return { allowed: true, blockedBy: null };
}

export function logAccessBlocked(input: {
  userId?: string | null;
  role: ProfileAppRole | null | undefined;
  plan: PlanCode | null | undefined;
  module: PlanModule;
  action?: ModuleAction;
  cause: AccessCause;
  path?: string | null;
}) {
  const now = Date.now();
  const key = [
    input.userId ?? 'anon',
    input.role ?? 'none',
    input.plan ?? 'none',
    input.module,
    input.action ?? 'view',
    input.cause,
    input.path ?? '',
  ].join('|');
  const prev = RECENT_BLOCK_KEYS.get(key) ?? 0;
  if (now - prev < LOG_THROTTLE_MS) return;
  RECENT_BLOCK_KEYS.set(key, now);
  if (RECENT_BLOCK_KEYS.size > 500) {
    for (const [k, t] of RECENT_BLOCK_KEYS) {
      if (now - t > LOG_THROTTLE_MS * 2) RECENT_BLOCK_KEYS.delete(k);
    }
  }
  const timestamp = new Date(now).toISOString();
  console.warn(
    `[ACCESS BLOCKED] cause=${input.cause} role=${input.role ?? 'none'} plan=${input.plan ?? 'none'} module=${input.module} action=${input.action ?? 'view'} path=${input.path ?? '-'} user=${input.userId ?? '-'} ts=${timestamp}`,
  );
}

