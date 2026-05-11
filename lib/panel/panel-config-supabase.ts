/**
 * STUB de sincronización remota del panel.
 *
 * La fase 1 (actual) solo persiste en localStorage. Cuando llegue la fase 2
 * crearemos una tabla `panel_configs (user_id uuid pk, local_id uuid, config jsonb,
 * updated_at timestamptz)` y rellenaremos estas funciones.
 *
 * Mantener las firmas estables permite que el resto de la app (hook
 * `usePanelConfig`) ya consuma este módulo sin que cambie su interfaz cuando
 * conectemos Supabase.
 */

import type { PanelConfig } from '@/lib/panel/panel-config-storage';

export type PanelConfigSyncResult =
  | { ok: true; config: PanelConfig }
  | { ok: false; reason: 'not-implemented' | 'no-session' | 'error' };

/** Lee la configuración del panel del usuario autenticado. */
export async function fetchPanelConfigRemote(
  _localId: string | null | undefined,
  _userId: string | null | undefined,
): Promise<PanelConfigSyncResult> {
  return { ok: false, reason: 'not-implemented' };
}

/** Persiste la configuración del panel para sincronización multi-dispositivo. */
export async function pushPanelConfigRemote(
  _localId: string | null | undefined,
  _userId: string | null | undefined,
  _config: PanelConfig,
): Promise<PanelConfigSyncResult> {
  return { ok: false, reason: 'not-implemented' };
}
