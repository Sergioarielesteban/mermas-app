import type { SupabaseClient } from '@supabase/supabase-js';

export type InventoryCatalogCategory = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type InventoryCatalogItem = {
  id: string;
  catalog_category_id: string;
  name: string;
  unit: string;
  default_price_per_unit: number;
  format_label: string | null;
  sort_order: number;
  is_active: boolean;
};

export type InventoryItem = {
  id: string;
  local_id: string;
  catalog_item_id: string | null;
  local_category_id: string | null;
  name: string;
  unit: string;
  price_per_unit: number;
  quantity_on_hand: number;
  format_label: string | null;
  notes: string;
  sort_order: number;
  is_active: boolean;
};

export async function fetchInventoryCatalogCategories(
  supabase: SupabaseClient,
  activeOnly = true,
): Promise<InventoryCatalogCategory[]> {
  let q = supabase
    .from('inventory_catalog_categories')
    .select('id,name,sort_order,is_active')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as InventoryCatalogCategory[];
}

export async function fetchInventoryCatalogItems(
  supabase: SupabaseClient,
  activeOnly = true,
): Promise<InventoryCatalogItem[]> {
  let q = supabase
    .from('inventory_catalog_items')
    .select('id,catalog_category_id,name,unit,default_price_per_unit,format_label,sort_order,is_active')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...row,
    default_price_per_unit: Number(row.default_price_per_unit),
  })) as InventoryCatalogItem[];
}

export async function fetchInventoryItems(
  supabase: SupabaseClient,
  localId: string,
): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select(
      'id,local_id,catalog_item_id,local_category_id,name,unit,price_per_unit,quantity_on_hand,format_label,notes,sort_order,is_active',
    )
    .eq('local_id', localId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...row,
    price_per_unit: Number(row.price_per_unit),
    quantity_on_hand: Number(row.quantity_on_hand),
  })) as InventoryItem[];
}

export async function insertInventoryLineFromCatalog(
  supabase: SupabaseClient,
  params: {
    localId: string;
    catalogItem: InventoryCatalogItem;
    userId: string | null;
    /** Cantidad inicial (ej. 0,2); por defecto 0. */
    initialQuantity?: number;
  },
): Promise<InventoryItem> {
  const c = params.catalogItem;
  const q0 = Math.round((params.initialQuantity ?? 0) * 1000) / 1000;
  const { data: maxRow } = await supabase
    .from('inventory_items')
    .select('sort_order')
    .eq('local_id', params.localId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (maxRow?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      local_id: params.localId,
      catalog_item_id: c.id,
      local_category_id: null,
      name: c.name,
      unit: c.unit,
      price_per_unit: Math.round(c.default_price_per_unit * 100) / 100,
      quantity_on_hand: q0,
      format_label: c.format_label,
      notes: '',
      sort_order: nextSort,
      is_active: true,
      created_by: params.userId,
    })
    .select(
      'id,local_id,catalog_item_id,local_category_id,name,unit,price_per_unit,quantity_on_hand,format_label,notes,sort_order,is_active',
    )
    .single();
  if (error) throw new Error(error.message);
  const row = data as Record<string, unknown>;
  return {
    ...row,
    price_per_unit: Number(row.price_per_unit),
    quantity_on_hand: Number(row.quantity_on_hand),
  } as InventoryItem;
}

export async function updateInventoryItemLine(
  supabase: SupabaseClient,
  params: {
    localId: string;
    itemId: string;
    quantity_on_hand: number;
    price_per_unit: number;
    name: string;
    format_label: string | null;
    unit: string;
  },
): Promise<void> {
  const q = Math.round(params.quantity_on_hand * 1000) / 1000;
  const p = Math.round(params.price_per_unit * 100) / 100;
  const nm = params.name.trim();
  const { error } = await supabase
    .from('inventory_items')
    .update({
      quantity_on_hand: q,
      price_per_unit: p,
      name: nm,
      format_label: params.format_label?.trim() ? params.format_label.trim() : null,
      unit: params.unit,
    })
    .eq('id', params.itemId)
    .eq('local_id', params.localId);
  if (error) throw new Error(error.message);
}

export async function deleteInventoryItemLine(
  supabase: SupabaseClient,
  localId: string,
  itemId: string,
): Promise<void> {
  const { error } = await supabase.from('inventory_items').delete().eq('id', itemId).eq('local_id', localId);
  if (error) throw new Error(error.message);
}
