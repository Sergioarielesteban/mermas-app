import type { SupabaseClient } from '@supabase/supabase-js';
import { isCocinaCentralModulePinConfigured, isCocinaCentralModuleUnlockedInSession } from '@/lib/cocina-central-module-pin';

const PHRASE = 'ELIMINAR';

/**
 * En cliente: `NEXT_PUBLIC_ALLOW_FORCE_DELETE_TEST_DATA=true`.
 * En entornos sin bundle (scripts): `ALLOW_FORCE_DELETE_TEST_DATA=true`.
 */
export function isForceDeleteTestDataEnabled(): boolean {
  if (typeof process === 'undefined' || !process.env) return false;
  return (
    process.env.ALLOW_FORCE_DELETE_TEST_DATA === 'true' ||
    process.env.NEXT_PUBLIC_ALLOW_FORCE_DELETE_TEST_DATA === 'true'
  );
}

/**
 * Eliminación forzada (lote/orden con entregas, etc.): activa con modo pruebas
 * **o** con PIN del módulo desbloqueado en esta sesión (`NEXT_PUBLIC_COCINA_CENTRAL_MODULE_PIN` + clave en pantalla de entrada).
 * Sigue haciendo falta tener aplicadas en Supabase las funciones `cc_force_delete_*`.
 */
export function canUseCocinaCentralForceDelete(): boolean {
  if (isForceDeleteTestDataEnabled()) return true;
  if (isCocinaCentralModulePinConfigured() && isCocinaCentralModuleUnlockedInSession()) return true;
  return false;
}

export async function ccForceDeleteProductionBatch(
  supabase: SupabaseClient,
  batchId: string,
  confirmPhrase: string = PHRASE,
): Promise<void> {
  const { error } = await supabase.rpc('cc_force_delete_production_batch_central', {
    p_batch_id: batchId,
    p_confirm_phrase: confirmPhrase,
  });
  if (error) throw new Error(error.message);
}

export async function ccForceDeleteProductionOrder(
  supabase: SupabaseClient,
  orderId: string,
  confirmPhrase: string = PHRASE,
): Promise<void> {
  const { error } = await supabase.rpc('cc_force_delete_production_order_central', {
    p_order_id: orderId,
    p_confirm_phrase: confirmPhrase,
  });
  if (error) throw new Error(error.message);
}
