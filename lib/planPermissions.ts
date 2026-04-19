export const PLAN_MODULES = {
  OPERATIVO: ['pedidos', 'mermas', 'appcc', 'checklist'],
  CONTROL: ['pedidos', 'mermas', 'appcc', 'checklist', 'inventario', 'escandallos', 'produccion'],
  PRO: [
    'pedidos',
    'mermas',
    'appcc',
    'checklist',
    'inventario',
    'escandallos',
    'produccion',
    'cocina_central',
    'finanzas',
    'personal',
    'comida_personal',
    'chat',
  ],
} as const;

export type PlanCode = keyof typeof PLAN_MODULES;
export type PlanModule = (typeof PLAN_MODULES)[PlanCode][number];
export const PLAN_MODULES_BY_PLAN: Record<PlanCode, readonly PlanModule[]> = PLAN_MODULES;

export const DEFAULT_PLAN: PlanCode = 'OPERATIVO';
export const DEFAULT_MAX_USERS = 5;

export function getRequiredPlanForModule(module: PlanModule): PlanCode {
  if (PLAN_MODULES_BY_PLAN.OPERATIVO.includes(module)) return 'OPERATIVO';
  if (PLAN_MODULES_BY_PLAN.CONTROL.includes(module)) return 'CONTROL';
  return 'PRO';
}

export function moduleForPath(pathname: string | null): PlanModule | null {
  if (!pathname) return null;
  if (pathname === '/dashboard' || pathname === '/' || pathname.startsWith('/dashboard/')) return 'mermas';
  if (pathname.startsWith('/productos') || pathname.startsWith('/resumen')) return 'mermas';
  if (pathname.startsWith('/pedidos')) return 'pedidos';
  if (pathname.startsWith('/appcc')) return 'appcc';
  if (pathname.startsWith('/checklist')) return 'checklist';
  if (pathname.startsWith('/produccion')) return 'produccion';
  if (pathname.startsWith('/inventario')) return 'inventario';
  if (pathname.startsWith('/escandallos')) return 'escandallos';
  if (pathname.startsWith('/cocina-central')) return 'cocina_central';
  if (pathname.startsWith('/finanzas')) return 'finanzas';
  if (pathname.startsWith('/personal') || pathname.startsWith('/terminal-fichaje')) return 'personal';
  if (pathname.startsWith('/comida-personal')) return 'comida_personal';
  if (pathname.startsWith('/chat')) return 'chat';
  return null;
}

export function isPotentiallyPlanGatedPath(pathname: string | null): boolean {
  return moduleForPath(pathname) !== null;
}
