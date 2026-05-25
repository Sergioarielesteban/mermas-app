import type { SupabaseClient } from '@supabase/supabase-js';

function normalizeCentralKitchenUnit(raw: string | null | undefined): string {
  const unit = String(raw ?? '').trim().toLowerCase();
  if (unit === 'litros') return 'l';
  if (unit === 'unidades') return 'ud';
  if (unit === 'racion' || unit === 'ración' || unit === 'porcion' || unit === 'porción') return 'ud';
  return unit || 'ud';
}

export type EscandalloCentralKitchenCatalogItem = {
  id: string;
  localCentralId: string;
  name: string;
  category: string | null;
  outputQuantity: number | null;
  outputUnit: string;
  unitCost: number | null;
  formatCost: number | null;
  active: boolean;
  updatedAt: string | null;
};

type PublicCatalogRow = {
  id: string;
  local_central_id: string;
  name: string;
  category: string | null;
  output_quantity: number | null;
  output_unit: string | null;
  unit_cost: number | null;
  format_cost: number | null;
  active: boolean | null;
  updated_at: string | null;
};

export async function fetchCentralKitchenPublicCatalog(
  supabase: SupabaseClient,
): Promise<EscandalloCentralKitchenCatalogItem[]> {
  const { data, error } = await supabase.rpc('cc_list_public_recipe_catalog');
  if (error) throw new Error(error.message);
  return ((data ?? []) as PublicCatalogRow[]).map((row) => ({
    id: row.id,
    localCentralId: row.local_central_id,
    name: row.name,
    category: row.category?.trim() || null,
    outputQuantity:
      row.output_quantity != null && Number.isFinite(Number(row.output_quantity)) && Number(row.output_quantity) > 0
        ? Number(row.output_quantity)
        : null,
    outputUnit: normalizeCentralKitchenUnit(row.output_unit),
    unitCost:
      row.unit_cost != null && Number.isFinite(Number(row.unit_cost)) && Number(row.unit_cost) >= 0
        ? Number(row.unit_cost)
        : null,
    formatCost:
      row.format_cost != null && Number.isFinite(Number(row.format_cost)) && Number(row.format_cost) >= 0
        ? Number(row.format_cost)
        : null,
    active: row.active !== false,
    updatedAt: row.updated_at ?? null,
  }));
}
