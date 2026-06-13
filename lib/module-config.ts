export type AppModuleId =
  | 'pedidos'
  | 'inventario'
  | 'mermas'
  | 'appcc'
  | 'escandallos'
  | 'finanzas'
  | 'cocina_central'
  | 'pedidos_cocina'
  | 'personal'
  | 'terminal_fichaje'
  | 'produccion'
  | 'servicio'
  | 'checklist'
  | 'chat'
  | 'comida_personal'
  | 'assistant'
  | 'actividad_reciente'
  | 'comunicacion'
  | 'superadmin';

export type AppModuleConfig = {
  id: AppModuleId;
  label: string;
  enabled: boolean;
  homePath?: string;
  routePrefixes: readonly string[];
};

export const ENABLED_MODULES = [
  'pedidos',
  'inventario',
  'mermas',
  'appcc',
  'escandallos',
] as const satisfies readonly AppModuleId[];

const ENABLED_MODULE_SET: ReadonlySet<AppModuleId> = new Set<AppModuleId>(ENABLED_MODULES);

export const APP_MODULE_HOME_PATH = '/panel';

export const MODULES_CONFIG: Readonly<Record<AppModuleId, AppModuleConfig>> = Object.freeze({
  pedidos: {
    id: 'pedidos',
    label: 'Pedidos',
    enabled: ENABLED_MODULE_SET.has('pedidos'),
    homePath: '/pedidos',
    routePrefixes: ['/pedidos'],
  },
  inventario: {
    id: 'inventario',
    label: 'Inventario',
    enabled: ENABLED_MODULE_SET.has('inventario'),
    homePath: '/inventario',
    routePrefixes: ['/inventario'],
  },
  mermas: {
    id: 'mermas',
    label: 'Mermas',
    enabled: ENABLED_MODULE_SET.has('mermas'),
    homePath: '/dashboard',
    routePrefixes: ['/dashboard', '/productos', '/resumen'],
  },
  appcc: {
    id: 'appcc',
    label: 'APPCC',
    enabled: ENABLED_MODULE_SET.has('appcc'),
    homePath: '/appcc',
    routePrefixes: ['/appcc'],
  },
  escandallos: {
    id: 'escandallos',
    label: 'Escandallos',
    enabled: ENABLED_MODULE_SET.has('escandallos'),
    homePath: '/escandallos',
    routePrefixes: ['/escandallos'],
  },
  finanzas: {
    id: 'finanzas',
    label: 'Finanzas',
    enabled: ENABLED_MODULE_SET.has('finanzas'),
    homePath: '/finanzas',
    routePrefixes: ['/finanzas'],
  },
  cocina_central: {
    id: 'cocina_central',
    label: 'Cocina Central',
    enabled: ENABLED_MODULE_SET.has('cocina_central'),
    homePath: '/cocina-central',
    routePrefixes: ['/cocina-central'],
  },
  pedidos_cocina: {
    id: 'pedidos_cocina',
    label: 'Pedidos a cocina central',
    enabled: ENABLED_MODULE_SET.has('pedidos_cocina'),
    homePath: '/pedidos-cocina',
    routePrefixes: ['/pedidos-cocina'],
  },
  personal: {
    id: 'personal',
    label: 'Horarios',
    enabled: ENABLED_MODULE_SET.has('personal'),
    homePath: '/personal',
    routePrefixes: ['/personal'],
  },
  terminal_fichaje: {
    id: 'terminal_fichaje',
    label: 'Terminal de fichaje',
    enabled: ENABLED_MODULE_SET.has('terminal_fichaje'),
    homePath: '/terminal-fichaje',
    routePrefixes: ['/terminal-fichaje'],
  },
  produccion: {
    id: 'produccion',
    label: 'Producción',
    enabled: ENABLED_MODULE_SET.has('produccion'),
    homePath: '/produccion',
    routePrefixes: ['/produccion'],
  },
  servicio: {
    id: 'servicio',
    label: 'Servicio',
    enabled: ENABLED_MODULE_SET.has('servicio'),
    homePath: '/servicio',
    routePrefixes: ['/servicio'],
  },
  checklist: {
    id: 'checklist',
    label: 'Check list',
    enabled: ENABLED_MODULE_SET.has('checklist'),
    homePath: '/checklist',
    routePrefixes: ['/checklist'],
  },
  chat: {
    id: 'chat',
    label: 'Chat',
    enabled: ENABLED_MODULE_SET.has('chat'),
    homePath: '/chat',
    routePrefixes: ['/chat'],
  },
  comida_personal: {
    id: 'comida_personal',
    label: 'Consumo interno',
    enabled: ENABLED_MODULE_SET.has('comida_personal'),
    homePath: '/comida-personal',
    routePrefixes: ['/comida-personal'],
  },
  assistant: {
    id: 'assistant',
    label: 'Asistente Chef One',
    enabled: ENABLED_MODULE_SET.has('assistant'),
    routePrefixes: [],
  },
  actividad_reciente: {
    id: 'actividad_reciente',
    label: 'Actividad reciente',
    enabled: ENABLED_MODULE_SET.has('actividad_reciente'),
    routePrefixes: [],
  },
  comunicacion: {
    id: 'comunicacion',
    label: 'Comunicación interna',
    enabled: ENABLED_MODULE_SET.has('comunicacion'),
    routePrefixes: [],
  },
  superadmin: {
    id: 'superadmin',
    label: 'Panel global de locales',
    enabled: ENABLED_MODULE_SET.has('superadmin'),
    homePath: '/superadmin/locales',
    routePrefixes: ['/superadmin'],
  },
});

const MODULE_ROUTE_MATCHERS: readonly { module: AppModuleId; prefix: string }[] = (
  Object.entries(MODULES_CONFIG) as Array<[AppModuleId, AppModuleConfig]>
)
  .flatMap(([module, config]) => config.routePrefixes.map((prefix) => ({ module, prefix })))
  .sort((a, b) => b.prefix.length - a.prefix.length);

function normalizePathname(input: string | null | undefined): string | null {
  if (!input) return null;
  const pathname = input.split(/[?#]/, 1)[0] || '/';
  if (pathname === '/') return pathname;
  return pathname.replace(/\/+$/, '') || '/';
}

function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isModuleEnabled(module: AppModuleId | null | undefined): boolean {
  if (!module) return true;
  return MODULES_CONFIG[module]?.enabled === true;
}

export function getAppModuleForPath(pathname: string | null | undefined): AppModuleId | null {
  const normalized = normalizePathname(pathname);
  if (!normalized) return null;
  const match = MODULE_ROUTE_MATCHERS.find(({ prefix }) => pathMatchesPrefix(normalized, prefix));
  return match?.module ?? null;
}

export function getDisabledModuleForPath(
  pathname: string | null | undefined,
): AppModuleConfig | null {
  const moduleId = getAppModuleForPath(pathname);
  if (!moduleId) return null;
  const config = MODULES_CONFIG[moduleId];
  return config.enabled ? null : config;
}

export function isPathEnabledForCurrentVersion(pathname: string | null | undefined): boolean {
  return getDisabledModuleForPath(pathname) === null;
}

export function getEnabledHrefOrNull<T extends string>(href: T): T | null {
  return isPathEnabledForCurrentVersion(href) ? href : null;
}
