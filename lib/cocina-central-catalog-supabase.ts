import type { SupabaseClient } from '@supabase/supabase-js';

export type CentralInventoryUnidadBase = 'kg' | 'litros' | 'unidades';

export type CentralInventoryProductRow = {
  id: string;
  local_central_id: string;
  nombre: string;
  unidad_base: CentralInventoryUnidadBase;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type CentralCatalogProductRow = {
  id: string;
  local_central_id: string;
  nombre_producto: string;
  descripcion: string | null;
  precio_venta: number;
  unidad_venta: string;
  activo: boolean;
  visible_para_locales: boolean;
  orden: number;
  inventory_product_id: string | null;
  created_at: string;
  updated_at: string;
};

const INV_SELECT =
  'id,local_central_id,nombre,unidad_base,activo,created_at,updated_at';
const CAT_SELECT =
  'id,local_central_id,nombre_producto,descripcion,precio_venta,unidad_venta,activo,visible_para_locales,orden,inventory_product_id,created_at,updated_at';

export async function ccListInventoryProducts(
  supabase: SupabaseClient,
  localCentralId: string,
): Promise<CentralInventoryProductRow[]> {
  const { data, error } = await supabase
    .from('central_inventory_products')
    .select(INV_SELECT)
    .eq('local_central_id', localCentralId)
    .order('nombre');
  if (error) throw new Error(error.message);
  return (data ?? []) as CentralInventoryProductRow[];
}

export async function ccInsertInventoryProduct(
  supabase: SupabaseClient,
  row: Pick<CentralInventoryProductRow, 'local_central_id' | 'nombre' | 'unidad_base' | 'activo'>,
): Promise<CentralInventoryProductRow> {
  const { data, error } = await supabase
    .from('central_inventory_products')
    .insert({
      local_central_id: row.local_central_id,
      nombre: row.nombre.trim(),
      unidad_base: row.unidad_base,
      activo: row.activo,
    })
    .select(INV_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as CentralInventoryProductRow;
}

export async function ccUpdateInventoryProduct(
  supabase: SupabaseClient,
  localCentralId: string,
  id: string,
  patch: Partial<Pick<CentralInventoryProductRow, 'nombre' | 'unidad_base' | 'activo'>>,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.nombre !== undefined) body.nombre = patch.nombre.trim();
  if (patch.unidad_base !== undefined) body.unidad_base = patch.unidad_base;
  if (patch.activo !== undefined) body.activo = patch.activo;
  const { error } = await supabase
    .from('central_inventory_products')
    .update(body)
    .eq('id', id)
    .eq('local_central_id', localCentralId);
  if (error) throw new Error(error.message);
}

export async function ccDeleteInventoryProduct(
  supabase: SupabaseClient,
  localCentralId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from('central_inventory_products')
    .delete()
    .eq('id', id)
    .eq('local_central_id', localCentralId);
  if (error) throw new Error(error.message);
}

export async function ccListCatalogProductsAdmin(
  supabase: SupabaseClient,
  localCentralId: string,
): Promise<CentralCatalogProductRow[]> {
  const { data, error } = await supabase
    .from('central_catalog_products')
    .select(CAT_SELECT)
    .eq('local_central_id', localCentralId)
    .order('orden', { ascending: true })
    .order('nombre_producto');
  if (error) throw new Error(error.message);
  return (data ?? []) as CentralCatalogProductRow[];
}

export async function ccInsertCatalogProduct(
  supabase: SupabaseClient,
  row: {
    local_central_id: string;
    nombre_producto: string;
    descripcion?: string | null;
    precio_venta: number;
    unidad_venta: string;
    activo?: boolean;
    visible_para_locales?: boolean;
    orden?: number;
    inventory_product_id?: string | null;
  },
): Promise<CentralCatalogProductRow> {
  const { data, error } = await supabase
    .from('central_catalog_products')
    .insert({
      local_central_id: row.local_central_id,
      nombre_producto: row.nombre_producto.trim(),
      descripcion: row.descripcion?.trim() ? row.descripcion.trim() : null,
      precio_venta: row.precio_venta,
      unidad_venta: row.unidad_venta.trim(),
      activo: row.activo ?? true,
      visible_para_locales: row.visible_para_locales ?? true,
      orden: row.orden ?? 0,
      inventory_product_id: row.inventory_product_id ?? null,
    })
    .select(CAT_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as CentralCatalogProductRow;
}

export async function ccUpdateCatalogProduct(
  supabase: SupabaseClient,
  localCentralId: string,
  id: string,
  patch: Partial<
    Pick<
      CentralCatalogProductRow,
      | 'nombre_producto'
      | 'descripcion'
      | 'precio_venta'
      | 'unidad_venta'
      | 'activo'
      | 'visible_para_locales'
      | 'orden'
      | 'inventory_product_id'
    >
  >,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.nombre_producto !== undefined) body.nombre_producto = patch.nombre_producto.trim();
  if (patch.descripcion !== undefined)
    body.descripcion = patch.descripcion?.trim() ? patch.descripcion.trim() : null;
  if (patch.precio_venta !== undefined) body.precio_venta = patch.precio_venta;
  if (patch.unidad_venta !== undefined) body.unidad_venta = patch.unidad_venta.trim();
  if (patch.activo !== undefined) body.activo = patch.activo;
  if (patch.visible_para_locales !== undefined) body.visible_para_locales = patch.visible_para_locales;
  if (patch.orden !== undefined) body.orden = patch.orden;
  if (patch.inventory_product_id !== undefined) body.inventory_product_id = patch.inventory_product_id;
  const { error } = await supabase
    .from('central_catalog_products')
    .update(body)
    .eq('id', id)
    .eq('local_central_id', localCentralId);
  if (error) throw new Error(error.message);
}

export async function ccDeleteCatalogProduct(
  supabase: SupabaseClient,
  localCentralId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from('central_catalog_products')
    .delete()
    .eq('id', id)
    .eq('local_central_id', localCentralId);
  if (error) throw new Error(error.message);
}
