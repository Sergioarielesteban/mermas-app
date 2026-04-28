import type { SupabaseClient } from '@supabase/supabase-js';

export type InventoryCostConversionRow = {
  id: string;
  local_id: string;
  supplier_product_id: string;
  unidad_origen: string;
  unidad_destino: string;
  factor: number;
  updated_at: string;
};

export function normalizeConversionUnit(raw: string): string {
  const u = String(raw ?? '').trim().toLowerCase();
  if (u === 'l' || u === 'lt' || u === 'litro' || u === 'litros') return 'l';
  if (u === 'kg' || u === 'kilo' || u === 'kilos' || u === 'kilogramo' || u === 'kilogramos') return 'kg';
  if (u === 'ud' || u === 'uds' || u === 'unidad' || u === 'unidades' || u === 'u') return 'ud';
  return u;
}

export async function fetchInventoryCostConversionFactor(
  supabase: SupabaseClient,
  localId: string,
  supplierProductId: string,
  unidadOrigen: string,
  unidadDestino: string,
): Promise<number | null> {
  const o = normalizeConversionUnit(unidadOrigen);
  const d = normalizeConversionUnit(unidadDestino);
  if (!o || !d) return null;
  const { data, error } = await supabase
    .from('inventory_cost_conversions')
    .select('factor')
    .eq('local_id', localId)
    .eq('supplier_product_id', supplierProductId)
    .eq('unidad_origen', o)
    .eq('unidad_destino', d)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.factor == null) return null;
  const f = Number(data.factor);
  return Number.isFinite(f) && f > 0 ? f : null;
}

export async function upsertInventoryCostConversion(
  supabase: SupabaseClient,
  params: {
    localId: string;
    supplierProductId: string;
    unidadOrigen: string;
    unidadDestino: string;
    factor: number;
  },
): Promise<void> {
  const o = normalizeConversionUnit(params.unidadOrigen);
  const d = normalizeConversionUnit(params.unidadDestino);
  const f = params.factor;
  if (!o || !d || !Number.isFinite(f) || f <= 0) return;
  const { error } = await supabase.from('inventory_cost_conversions').upsert(
    {
      local_id: params.localId,
      supplier_product_id: params.supplierProductId,
      unidad_origen: o,
      unidad_destino: d,
      factor: Math.round(f * 100000000) / 100000000,
    },
    { onConflict: 'local_id,supplier_product_id,unidad_origen,unidad_destino' },
  );
  if (error) throw new Error(error.message);
}
