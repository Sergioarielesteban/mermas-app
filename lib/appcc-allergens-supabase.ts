import type { SupabaseClient } from '@supabase/supabase-js';

export type AllergenPresenceType = 'contains' | 'traces' | 'may_contain';
export type RecipeAllergenSourceType = 'automatic' | 'manual';
export type RecipeAllergenStatus = 'active' | 'excluded' | 'pending_review' | 'confirmed';
export type RecipeReviewStatus = 'reviewed' | 'pending_review' | 'stale' | 'incomplete';

export type AllergenMasterRow = {
  id: string;
  code: string;
  name: string;
  short_description: string;
  icon: string;
  display_order: number;
  is_active: boolean;
};

export type RecipeAllergenRow = {
  id: string;
  local_id: string;
  recipe_id: string;
  allergen_id: string;
  presence_type: AllergenPresenceType;
  source_type: RecipeAllergenSourceType;
  status: RecipeAllergenStatus;
  exclusion_reason: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  allergen?: AllergenMasterRow | null;
};

export type RecipeAllergenSourceRow = {
  id: string;
  local_id: string;
  recipe_id: string;
  allergen_id: string;
  source_line_id: string | null;
  source_kind: 'raw' | 'processed' | 'subrecipe';
  source_label: string;
  source_product_id: string | null;
  source_recipe_id: string | null;
  created_at: string;
};

export type RecipeAllergenReviewLogRow = {
  id: string;
  local_id: string;
  recipe_id: string;
  action: 'recalculated' | 'confirmed' | 'forced_confirm' | 'manual_add' | 'manual_exclude' | 'manual_restore';
  note: string;
  actor_id: string | null;
  created_at: string;
};

export type ProductAllergenRow = {
  id: string;
  local_id: string;
  product_id: string;
  allergen_id: string;
  presence_type: AllergenPresenceType;
  notes: string;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Posibilidad sin gluten (columnas escandallo_recipes tras supabase-carta-recipe-gluten-fields.sql). */
export type GlutenFreeOption = 'yes' | 'no' | 'ask';

export type CartaRecipeRow = {
  id: string;
  local_id: string;
  name: string;
  notes: string;
  is_sub_recipe: boolean;
  allergens_review_status: RecipeReviewStatus;
  allergens_reviewed_at: string | null;
  allergens_reviewed_by: string | null;
  allergens_force_reviewed: boolean;
  allergens_last_calculated_at: string | null;
  updated_at: string;
  carta_category?: string | null;
  gluten_free_option?: GlutenFreeOption | null;
  gluten_free_option_note?: string | null;
  gluten_cross_contamination_warning?: string | null;
};

export type SupplierProductLite = {
  id: string;
  local_id: string;
  supplier_id: string;
  name: string;
  unit: string;
  is_active: boolean;
  pedido_suppliers: { name: string } | { name: string }[] | null;
};

export const REVIEW_STATUS_LABEL: Record<RecipeReviewStatus, string> = {
  reviewed: 'Revisado',
  pending_review: 'Pendiente de revisión',
  stale: 'Desactualizado',
  incomplete: 'Incompleto',
};

export function reviewStatusColor(status: RecipeReviewStatus): string {
  switch (status) {
    case 'reviewed':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
    case 'pending_review':
      return 'bg-amber-50 text-amber-900 ring-amber-200';
    case 'stale':
      return 'bg-orange-50 text-orange-900 ring-orange-200';
    case 'incomplete':
      return 'bg-red-50 text-red-800 ring-red-200';
    default:
      return 'bg-zinc-50 text-zinc-700 ring-zinc-200';
  }
}

export function presenceLabel(p: AllergenPresenceType): string {
  if (p === 'contains') return 'Contiene';
  if (p === 'traces') return 'Trazas';
  return 'Puede contener';
}

export async function fetchAllergensMaster(supabase: SupabaseClient): Promise<AllergenMasterRow[]> {
  const { data, error } = await supabase
    .from('allergens_master')
    .select('id,code,name,short_description,icon,display_order,is_active')
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AllergenMasterRow[];
}

export async function fetchCartaRecipesWithReviewStatus(
  supabase: SupabaseClient,
  localId: string,
): Promise<CartaRecipeRow[]> {
  const { data, error } = await supabase
    .from('escandallo_recipes')
    .select(
      'id,local_id,name,notes,is_sub_recipe,allergens_review_status,allergens_reviewed_at,allergens_reviewed_by,allergens_force_reviewed,allergens_last_calculated_at,updated_at,carta_category,gluten_free_option,gluten_free_option_note,gluten_cross_contamination_warning',
    )
    .eq('local_id', localId)
    .eq('is_sub_recipe', false)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CartaRecipeRow[];
}

export async function fetchRecipeAllergensForLocal(
  supabase: SupabaseClient,
  localId: string,
): Promise<RecipeAllergenRow[]> {
  const { data, error } = await supabase
    .from('recipe_allergens')
    .select(
      'id,local_id,recipe_id,allergen_id,presence_type,source_type,status,exclusion_reason,confirmed_by,confirmed_at,created_at,updated_at,allergen:allergens_master(id,code,name,short_description,icon,display_order,is_active)',
    )
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
  return normalizeRecipeAllergenRows(data ?? []);
}

export async function fetchRecipeAllergens(
  supabase: SupabaseClient,
  localId: string,
  recipeId: string,
): Promise<RecipeAllergenRow[]> {
  const { data, error } = await supabase
    .from('recipe_allergens')
    .select(
      'id,local_id,recipe_id,allergen_id,presence_type,source_type,status,exclusion_reason,confirmed_by,confirmed_at,created_at,updated_at,allergen:allergens_master(id,code,name,short_description,icon,display_order,is_active)',
    )
    .eq('local_id', localId)
    .eq('recipe_id', recipeId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return normalizeRecipeAllergenRows(data ?? []);
}

function normalizeRecipeAllergenRows(rows: unknown[]): RecipeAllergenRow[] {
  return rows.map((raw) => {
    const row = raw as RecipeAllergenRow & { allergen?: AllergenMasterRow | AllergenMasterRow[] | null };
    const allergen =
      Array.isArray(row.allergen) ? (row.allergen[0] ?? null) : row.allergen ?? null;
    return {
      ...row,
      allergen,
    };
  });
}

export async function fetchRecipeAllergenSources(
  supabase: SupabaseClient,
  localId: string,
  recipeId: string,
): Promise<RecipeAllergenSourceRow[]> {
  const { data, error } = await supabase
    .from('recipe_allergen_sources')
    .select(
      'id,local_id,recipe_id,allergen_id,source_line_id,source_kind,source_label,source_product_id,source_recipe_id,created_at',
    )
    .eq('local_id', localId)
    .eq('recipe_id', recipeId)
    .order('source_label', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as RecipeAllergenSourceRow[];
}

export async function fetchRecipeAllergenReviewLog(
  supabase: SupabaseClient,
  localId: string,
  recipeId: string,
): Promise<RecipeAllergenReviewLogRow[]> {
  const { data, error } = await supabase
    .from('recipe_allergen_review_log')
    .select('id,local_id,recipe_id,action,note,actor_id,created_at')
    .eq('local_id', localId)
    .eq('recipe_id', recipeId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []) as RecipeAllergenReviewLogRow[];
}

export async function fetchSupplierProductsForAllergens(
  supabase: SupabaseClient,
  localId: string,
): Promise<SupplierProductLite[]> {
  const { data, error } = await supabase
    .from('pedido_supplier_products')
    .select('id,local_id,supplier_id,name,unit,is_active,pedido_suppliers(name)')
    .eq('local_id', localId)
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierProductLite[];
}

export async function fetchProductAllergensForLocal(
  supabase: SupabaseClient,
  localId: string,
): Promise<ProductAllergenRow[]> {
  const { data, error } = await supabase
    .from('product_allergens')
    .select(
      'id,local_id,product_id,allergen_id,presence_type,notes,verified_by,verified_at,created_at,updated_at',
    )
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductAllergenRow[];
}

export async function saveProductAllergenSelection(
  supabase: SupabaseClient,
  params: {
    localId: string;
    productId: string;
    userId: string;
    selections: Array<{ allergenId: string; presenceType: AllergenPresenceType; notes?: string }>;
  },
) {
  const { localId, productId, userId, selections } = params;
  const { error: deleteError } = await supabase
    .from('product_allergens')
    .delete()
    .eq('local_id', localId)
    .eq('product_id', productId);
  if (deleteError) throw new Error(deleteError.message);

  if (selections.length === 0) return;
  const payload = selections.map((s) => ({
    local_id: localId,
    product_id: productId,
    allergen_id: s.allergenId,
    presence_type: s.presenceType,
    notes: s.notes?.trim() ?? '',
    verified_by: userId,
    verified_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('product_allergens').upsert(payload, {
    onConflict: 'local_id,product_id,allergen_id',
  });
  if (error) throw new Error(error.message);
}

export async function refreshRecipeAllergens(supabase: SupabaseClient, recipeId: string) {
  const { error } = await supabase.rpc('appcc_refresh_recipe_allergens', { p_recipe_id: recipeId });
  if (error) throw new Error(error.message);
}

export async function confirmRecipeAllergens(
  supabase: SupabaseClient,
  recipeId: string,
  force = false,
) {
  const { error } = await supabase.rpc('appcc_confirm_recipe_allergens', { p_recipe_id: recipeId, p_force: force });
  if (error) throw new Error(error.message);
}

export async function addManualRecipeAllergen(
  supabase: SupabaseClient,
  recipeId: string,
  allergenId: string,
  presenceType: AllergenPresenceType,
) {
  const { error } = await supabase.rpc('appcc_mark_recipe_allergen_manual', {
    p_recipe_id: recipeId,
    p_allergen_id: allergenId,
    p_presence_type: presenceType,
  });
  if (error) throw new Error(error.message);
}

export async function excludeRecipeAllergen(
  supabase: SupabaseClient,
  recipeId: string,
  allergenId: string,
  reason: string,
) {
  const { error } = await supabase.rpc('appcc_exclude_recipe_allergen', {
    p_recipe_id: recipeId,
    p_allergen_id: allergenId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

export async function restoreRecipeAllergen(supabase: SupabaseClient, recipeId: string, allergenId: string) {
  const { error } = await supabase.rpc('appcc_restore_recipe_allergen', {
    p_recipe_id: recipeId,
    p_allergen_id: allergenId,
  });
  if (error) throw new Error(error.message);
}
