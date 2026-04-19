import { PLAN_MODULES_BY_PLAN, type PlanCode, type PlanModule } from '@/lib/planPermissions';

export function canAccessModule(plan: PlanCode | null | undefined, module: PlanModule): boolean {
  if (!plan) return false;
  const modules = PLAN_MODULES_BY_PLAN[plan];
  if (!modules) return false;
  return modules.includes(module);
}
