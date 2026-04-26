import type { SupabaseClient } from '@supabase/supabase-js';

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
