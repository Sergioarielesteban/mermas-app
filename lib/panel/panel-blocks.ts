/**
 * Catálogo de bloques configurables del Panel de Control.
 *
 * Esta es la *fuente única de verdad* para:
 * - qué bloques existen
 * - a qué categoría pertenecen
 * - si son críticos (no ocultables)
 * - qué módulo de plan requieren
 * - presets de vistas predefinidas (Encargado / Cocina / Administración / Sala)
 *
 * Los bloques **críticos** (`critical: true`) NO se pueden ocultar manualmente.
 * El usuario aún puede reordenarlos o marcarlos como favoritos.
 *
 * Las "alertas fijas" (temperatura pendiente, pedido obligatorio sin enviar,
 * checklist de cierre pendiente, incidencia crítica APPCC) se renderizan
 * SIEMPRE arriba del panel, fuera de este sistema configurable
 * — ver `components/panel/PanelCriticalAlerts.tsx`.
 */

import type { AppModuleId } from '@/lib/module-config';
import type { PlanModule } from '@/lib/planPermissions';

export type PanelBlockCategory = 'operativa' | 'control' | 'gestion' | 'personal';

export type PanelBlockId =
  | 'pedidos-agenda'
  | 'pedidos-llegan-hoy'
  | 'produccion'
  | 'actividad-reciente'
  | 'temperaturas'
  | 'aceites'
  | 'checklist'
  | 'appcc'
  | 'limpieza'
  | 'inventario'
  | 'escandallos'
  | 'finanzas'
  | 'horarios'
  | 'chat'
  | 'comunicacion';

/**
 * Tamaño visual del bloque al renderizarlo en el panel.
 *  - `large`: tarjeta horizontal de ancho completo (rica, con badge y subtítulo).
 *  - `small`: tarjeta cuadrada que se agrupa con otras en una grid de 3 por fila.
 */
export type PanelBlockSize = 'large' | 'small';

export type PanelBlockMeta = {
  id: PanelBlockId;
  /** Feature flag de producto que controla si el bloque existe en esta versión pública. */
  module: AppModuleId;
  title: string;
  /** Texto secundario corto para mostrar en el sheet de personalización. */
  short: string;
  category: PanelBlockCategory;
  size: PanelBlockSize;
  /** Visible por defecto al cargar la app (sin config previa). */
  defaultEnabled: boolean;
  /** Bloque crítico: no se puede ocultar (toggle deshabilitado en el sheet). */
  critical?: boolean;
  /** Módulo de plan necesario; si está bloqueado el bloque se omite. */
  requiresPlanModule?: PlanModule;
  /** Permission predicate clave; se evalúa fuera. */
  requiresPermission?: 'pedidos' | 'finanzas' | 'inventario' | 'escandallos' | 'chat' | 'comida-personal';
};

export const PANEL_BLOCKS: readonly PanelBlockMeta[] = [
  // ─── OPERATIVA ────────────────────────────────────────────────────────────
  {
    id: 'pedidos-agenda',
    module: 'pedidos',
    title: 'Pedidos del día',
    short: 'Obligatorios y revisión diaria de proveedores',
    category: 'operativa',
    size: 'large',
    defaultEnabled: true,
    critical: true,
    requiresPlanModule: 'pedidos',
    requiresPermission: 'pedidos',
  },
  {
    id: 'pedidos-llegan-hoy',
    module: 'pedidos',
    title: 'Recibir pedidos de hoy',
    short: 'Recepciones previstas para hoy',
    category: 'operativa',
    size: 'small',
    defaultEnabled: true,
    requiresPlanModule: 'pedidos',
    requiresPermission: 'pedidos',
  },
  {
    id: 'produccion',
    module: 'produccion',
    title: 'Producción de hoy',
    short: 'Plan del día y elaboraciones',
    category: 'operativa',
    size: 'large',
    defaultEnabled: true,
    requiresPlanModule: 'produccion',
  },
  {
    id: 'actividad-reciente',
    module: 'actividad_reciente',
    title: 'Actividad reciente',
    short: 'Últimos movimientos del equipo',
    category: 'operativa',
    size: 'large',
    defaultEnabled: false,
  },

  // ─── CONTROL ──────────────────────────────────────────────────────────────
  {
    id: 'temperaturas',
    module: 'appcc',
    title: 'Temperaturas',
    short: 'Registros pendientes APPCC',
    category: 'control',
    size: 'small',
    defaultEnabled: true,
    critical: true,
    requiresPlanModule: 'appcc',
  },
  {
    id: 'aceites',
    module: 'appcc',
    title: 'Aceites',
    short: 'Cambios y filtrado de freidoras',
    category: 'control',
    size: 'small',
    defaultEnabled: true,
    requiresPlanModule: 'appcc',
  },
  {
    id: 'checklist',
    module: 'checklist',
    title: 'Check list',
    short: 'Listas operativas (apertura, cierre…)',
    category: 'control',
    size: 'small',
    defaultEnabled: false,
    requiresPlanModule: 'checklist',
  },
  {
    id: 'appcc',
    module: 'appcc',
    title: 'APPCC',
    short: 'Alérgenos, registros y partes',
    category: 'control',
    size: 'large',
    defaultEnabled: false,
    requiresPlanModule: 'appcc',
  },
  {
    id: 'limpieza',
    module: 'appcc',
    title: 'Limpieza',
    short: 'Plan y registro de limpieza',
    category: 'control',
    size: 'small',
    defaultEnabled: false,
    requiresPlanModule: 'appcc',
  },

  // ─── GESTIÓN ──────────────────────────────────────────────────────────────
  {
    id: 'inventario',
    module: 'inventario',
    title: 'Inventario',
    short: 'Stock y valoración',
    category: 'gestion',
    size: 'large',
    defaultEnabled: false,
    requiresPlanModule: 'inventario',
    requiresPermission: 'inventario',
  },
  {
    id: 'escandallos',
    module: 'escandallos',
    title: 'Escandallos',
    short: 'Recetas y costes por plato',
    category: 'gestion',
    size: 'large',
    defaultEnabled: false,
    requiresPlanModule: 'escandallos',
    requiresPermission: 'escandallos',
  },
  {
    id: 'finanzas',
    module: 'finanzas',
    title: 'Finanzas',
    short: 'Ventas, costes y rentabilidad',
    category: 'gestion',
    size: 'large',
    defaultEnabled: false,
    requiresPlanModule: 'finanzas',
    requiresPermission: 'finanzas',
  },

  // ─── PERSONAL ─────────────────────────────────────────────────────────────
  {
    id: 'horarios',
    module: 'personal',
    title: 'Horarios',
    short: 'Turnos, fichajes y equipo',
    category: 'personal',
    size: 'large',
    defaultEnabled: true,
    requiresPlanModule: 'personal',
  },
  {
    id: 'chat',
    module: 'chat',
    title: 'Chat del local',
    short: 'Comunicación rápida del turno',
    category: 'personal',
    size: 'small',
    defaultEnabled: false,
    requiresPlanModule: 'chat',
    requiresPermission: 'chat',
  },
  {
    id: 'comunicacion',
    module: 'comunicacion',
    title: 'Comunicación interna',
    short: 'Avisos, notas y anuncios',
    category: 'personal',
    size: 'small',
    defaultEnabled: false,
  },
];

export const PANEL_BLOCK_BY_ID: Readonly<Record<PanelBlockId, PanelBlockMeta>> = Object.freeze(
  PANEL_BLOCKS.reduce((acc, b) => {
    acc[b.id] = b;
    return acc;
  }, {} as Record<PanelBlockId, PanelBlockMeta>),
);

/**
 * Orden por defecto cuando el usuario no ha personalizado nada.
 * Los bloques `small` consecutivos se renderizan como mosaico de 3 columnas
 * (ver `OperationalDayHome.buildRows`).
 */
export const DEFAULT_PANEL_ORDER: readonly PanelBlockId[] = [
  'pedidos-agenda',
  'pedidos-llegan-hoy',
  'temperaturas',
  'aceites',
  'produccion',
  'horarios',
];

export const CATEGORY_LABELS: Readonly<Record<PanelBlockCategory, string>> = {
  operativa: 'Operativa',
  control: 'Control',
  gestion: 'Gestión',
  personal: 'Personal',
};

/**
 * Vistas predefinidas. Cada preset define:
 *  - `enabled`: bloques que aparecen visibles
 *  - `order`:   orden inicial sugerido (los favoritos los pondrá el usuario)
 *  - `favorites`: bloques que el preset marca como favoritos
 *
 * Los bloques críticos siempre aparecen aunque no estén listados.
 */
export type PanelPresetId = 'encargado' | 'cocina' | 'administracion' | 'sala';

export type PanelPreset = {
  id: PanelPresetId;
  label: string;
  description: string;
  order: PanelBlockId[];
  favorites: PanelBlockId[];
};

export const PANEL_PRESETS: readonly PanelPreset[] = [
  {
    id: 'encargado',
    label: 'Vista Encargado',
    description: 'Pedidos, temperaturas y producción al alcance.',
    order: [
      'pedidos-agenda',
      'pedidos-llegan-hoy',
      'produccion',
      'temperaturas',
      'aceites',
      'checklist',
      'horarios',
      'finanzas',
    ],
    favorites: ['pedidos-agenda', 'pedidos-llegan-hoy', 'temperaturas'],
  },
  {
    id: 'cocina',
    label: 'Vista Cocina',
    description: 'Producción, temperaturas, aceites y agenda.',
    order: [
      'pedidos-agenda',
      'produccion',
      'temperaturas',
      'aceites',
      'limpieza',
      'escandallos',
      'checklist',
    ],
    favorites: ['produccion', 'pedidos-agenda', 'temperaturas'],
  },
  {
    id: 'administracion',
    label: 'Vista Administración',
    description: 'Finanzas, inventario, escandallos y agenda.',
    order: [
      'pedidos-agenda',
      'pedidos-llegan-hoy',
      'finanzas',
      'inventario',
      'escandallos',
      'horarios',
    ],
    favorites: ['finanzas', 'pedidos-agenda', 'horarios'],
  },
  {
    id: 'sala',
    label: 'Vista Sala',
    description: 'Horarios, comunicación interna y chat.',
    order: [
      'horarios',
      'chat',
      'comunicacion',
      'checklist',
    ],
    favorites: ['horarios', 'chat'],
  },
];

export const PANEL_PRESET_BY_ID: Readonly<Record<PanelPresetId, PanelPreset>> = Object.freeze(
  PANEL_PRESETS.reduce((acc, p) => {
    acc[p.id] = p;
    return acc;
  }, {} as Record<PanelPresetId, PanelPreset>),
);
