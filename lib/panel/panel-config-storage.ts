/**
 * Persistencia de la configuración del Panel de Control.
 *
 * Fase 1 (actual): localStorage por usuario/local. Estructura preparada para
 * sincronizarse en Supabase en una fase posterior (ver `panel-config-supabase.ts`).
 *
 * La clave incluye `localId` y `userId` para que dos cuentas en el mismo
 * dispositivo no se pisen. Si falta alguno, usamos un fallback "guest".
 */

import {
  DEFAULT_PANEL_ORDER,
  PANEL_BLOCK_BY_ID,
  type PanelBlockId,
  type PanelPresetId,
} from '@/lib/panel/panel-blocks';

export const PANEL_CONFIG_VERSION = 1 as const;

export type PanelConfig = {
  /** Identifica la versión del schema; se usará para migraciones futuras. */
  version: typeof PANEL_CONFIG_VERSION;
  /** Orden completo deseado por el usuario (sólo bloques visibles). */
  order: PanelBlockId[];
  /** IDs de bloques ocultos manualmente. Los críticos se ignoran a la hora de aplicar. */
  hidden: PanelBlockId[];
  /** Favoritos (van arriba sea cual sea el orden). */
  favorites: PanelBlockId[];
  /** Preset aplicado por última vez (si lo hay). */
  preset: PanelPresetId | null;
  /** ISO timestamp de la última modificación. */
  updatedAt: string;
};

const STORAGE_PREFIX = 'chef-one.panel-config.v1';

function storageKey(localId: string | null | undefined, userId: string | null | undefined): string {
  const lid = (localId ?? '').trim() || 'no-local';
  const uid = (userId ?? '').trim() || 'guest';
  return `${STORAGE_PREFIX}:${lid}:${uid}`;
}

export function buildDefaultPanelConfig(): PanelConfig {
  return {
    version: PANEL_CONFIG_VERSION,
    order: [...DEFAULT_PANEL_ORDER],
    hidden: [],
    favorites: [],
    preset: null,
    updatedAt: new Date().toISOString(),
  };
}

function sanitizeIds(value: unknown): PanelBlockId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<PanelBlockId>();
  const out: PanelBlockId[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const id = raw as PanelBlockId;
    if (!(id in PANEL_BLOCK_BY_ID)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function sanitizePanelConfig(raw: unknown): PanelConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== PANEL_CONFIG_VERSION) return null;
  const order = sanitizeIds(obj.order);
  const hidden = sanitizeIds(obj.hidden);
  const favorites = sanitizeIds(obj.favorites);
  let preset: PanelPresetId | null = null;
  if (typeof obj.preset === 'string') {
    const allowed: PanelPresetId[] = ['encargado', 'cocina', 'administracion', 'sala'];
    if ((allowed as string[]).includes(obj.preset)) preset = obj.preset as PanelPresetId;
  }
  const updatedAt =
    typeof obj.updatedAt === 'string' && obj.updatedAt ? obj.updatedAt : new Date().toISOString();
  return {
    version: PANEL_CONFIG_VERSION,
    order,
    hidden,
    favorites,
    preset,
    updatedAt,
  };
}

export function loadPanelConfig(
  localId: string | null | undefined,
  userId: string | null | undefined,
): PanelConfig {
  if (typeof window === 'undefined') return buildDefaultPanelConfig();
  try {
    const raw = window.localStorage.getItem(storageKey(localId, userId));
    if (!raw) return buildDefaultPanelConfig();
    const parsed = JSON.parse(raw) as unknown;
    const sanitized = sanitizePanelConfig(parsed);
    return sanitized ?? buildDefaultPanelConfig();
  } catch {
    return buildDefaultPanelConfig();
  }
}

export function savePanelConfig(
  localId: string | null | undefined,
  userId: string | null | undefined,
  config: PanelConfig,
): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: PanelConfig = { ...config, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(storageKey(localId, userId), JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('chef-one:panel-config-changed'));
  } catch {
    /* silencioso: cuota llena, modo privado, etc. */
  }
}

export function clearPanelConfig(
  localId: string | null | undefined,
  userId: string | null | undefined,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey(localId, userId));
    window.dispatchEvent(new CustomEvent('chef-one:panel-config-changed'));
  } catch {
    /* silencioso */
  }
}
