import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPurchaseArticles } from '@/lib/purchase-articles-supabase';

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
  localId?: string | null,
): Promise<EscandalloCentralKitchenCatalogItem[]> {
  const { data, error } = await supabase.rpc('cc_list_public_recipe_catalog');
  if (!error) {
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

  if (!localId) throw new Error(error.message);

  const articles = await fetchPurchaseArticles(supabase, localId);
  return articles
    .filter((article) => article.origenArticulo === 'cocina_central' && article.centralProductionRecipeId)
    .map((article) => ({
      id: article.centralProductionRecipeId as string,
      localCentralId: article.localId,
      name: article.nombre,
      category: article.categoria?.trim() || null,
      outputQuantity:
        article.unidadesUsoPorUnidadCompra != null &&
        Number.isFinite(Number(article.unidadesUsoPorUnidadCompra)) &&
        Number(article.unidadesUsoPorUnidadCompra) > 0
          ? Number(article.unidadesUsoPorUnidadCompra)
          : null,
      outputUnit: normalizeCentralKitchenUnit(article.unidadUso),
      unitCost:
        article.costeUnitarioUso != null && Number.isFinite(Number(article.costeUnitarioUso)) && Number(article.costeUnitarioUso) >= 0
          ? Number(article.costeUnitarioUso)
          : article.costeMaster != null && Number.isFinite(Number(article.costeMaster)) && Number(article.costeMaster) >= 0
            ? Number(article.costeMaster)
            : null,
      formatCost:
        article.costeMaster != null && Number.isFinite(Number(article.costeMaster)) && Number(article.costeMaster) >= 0
          ? Number(article.costeMaster)
          : null,
      active: article.activo !== false,
      updatedAt: article.updatedAt ?? null,
    }));
}
