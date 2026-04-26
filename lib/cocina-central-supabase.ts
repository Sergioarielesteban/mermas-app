import type { SupabaseClient } from '@supabase/supabase-js';

/** Unidad en lotes, entregas y trazas (alineada con check en BD). */
export type CcUnit = 'kg' | 'ud' | 'bolsa' | 'racion' | 'litros' | 'unidades';
export type CcPreparationUnit = CcUnit;

export type ProductionOrderEstado = 'borrador' | 'en_curso' | 'completada' | 'cancelada';

export type BatchEstado =
  | 'disponible'
  | 'abierto'
  | 'consumido'
  | 'congelado'
  | 'descongelado'
  | 'expedido'
  | 'bloqueado'
  | 'retirado';

export type DeliveryEstado =
  | 'borrador'
  | 'preparado'
  | 'en_reparto'
  | 'entregado'
  | 'firmado'
  | 'cancelado';

export type DestinationLocal = { id: string; code: string; name: string };

export type CentralPreparationRow = {
  id: string;
  local_central_id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  unidad_base: CcPreparationUnit;
  activo: boolean;
  rendimiento: number | null;
  caducidad_dias: number | null;
  observaciones: string | null;
  legacy_product_id: string | null;
  inventory_product_id: string | null;
  catalog_product_id: string | null;
  /** Presente tras migración producción/escandallo. */
  escandallo_recipe_id?: string | null;
  escandallo_raw_supplier_product_id?: string | null;
  escandallo_processed_product_id?: string | null;
  production_recipe_id?: string | null;
  purchase_article_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type PreparationIngredientRow = {
  id: string;
  preparation_id: string;
  ingredient_preparation_id: string;
  cantidad: number;
  unidad: CcPreparationUnit;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
  central_preparations?: { nombre: string } | { nombre: string }[] | null;
};

export type ProductionOrderRow = {
  id: string;
  product_id: string | null;
  preparation_id: string | null;
  local_central_id: string;
  fecha: string;
  cantidad_objetivo: number;
  cantidad_producida?: number | null;
  estado: ProductionOrderEstado;
  notes?: string | null;
  escandallo_recipe_id?: string | null;
  production_recipe_id?: string | null;
  created_at: string;
  created_by?: string | null;
  central_preparations?: { nombre: string; unidad_base?: string; rendimiento?: number | null; caducidad_dias?: number | null } | { nombre: string }[] | null;
  products?: { name: string } | { name: string }[] | null;
  production_recipes?: { name: string; final_unit?: string; default_expiry_days?: number | null } | { name: string }[] | null;
};

export type ProductionOrderLineRow = {
  id: string;
  production_order_id: string;
  ingredient_preparation_id: string;
  label_snapshot: string;
  theoretical_qty: number;
  unidad: CcPreparationUnit;
  real_qty: number | null;
  origin_batch_id: string | null;
  cost_estimated_eur: number | null;
  cost_real_eur: number | null;
  escandallo_line_id: string | null;
  article_id: string | null;
  production_recipe_line_id: string | null;
  created_at: string;
  updated_at: string;
  ingredient_preparation?: CentralPreparationRow | CentralPreparationRow[] | null;
};

export type ProductionBatchRow = {
  id: string;
  production_order_id: string | null;
  product_id: string | null;
  preparation_id: string | null;
  local_central_id: string;
  codigo_lote: string;
  fecha_elaboracion: string;
  fecha_caducidad: string | null;
  cantidad_producida: number;
  unidad: CcUnit;
  estado: BatchEstado;
  qr_token: string;
  created_at: string;
  central_preparations?: { nombre: string } | { nombre: string }[] | null;
  products?: { name: string } | { name: string }[] | null;
};

export type BatchStockRow = {
  batch_id: string;
  local_id: string;
  cantidad: number;
};

export type DeliveryRow = {
  id: string;
  local_origen_id: string;
  local_destino_id: string;
  fecha: string;
  estado: DeliveryEstado;
  firmado: boolean;
  firma_url: string | null;
  signature_data_url: string | null;
  nombre_receptor: string | null;
  local_origen_label: string | null;
  local_destino_label: string | null;
  confirmed_at: string | null;
  created_at: string;
};

export type DeliveryItemRow = {
  id: string;
  delivery_id: string;
  batch_id: string;
  product_id: string | null;
  preparation_id: string | null;
  cantidad: number;
  unidad: CcUnit;
  production_batches?:
    | Pick<
        ProductionBatchRow,
        'codigo_lote' | 'fecha_elaboracion' | 'fecha_caducidad' | 'id' | 'estado'
      >
    | Pick<
        ProductionBatchRow,
        'codigo_lote' | 'fecha_elaboracion' | 'fecha_caducidad' | 'id' | 'estado'
      >[]
    | null;
  central_preparations?: { nombre: string } | { nombre: string }[] | null;
  products?: { name: string } | { name: string }[] | null;
};

export type IngredientTraceRow = {
  id: string;
  batch_id: string;
  ingredient_product_id: string | null;
  ingredient_preparation_id: string | null;
  cantidad: number;
  unidad: CcUnit;
  central_preparations?: { nombre: string } | { nombre: string }[] | null;
  products?: { name: string } | { name: string }[] | null;
};

export type BatchMovementRow = {
  id: string;
  batch_id: string;
  local_from: string | null;
  local_to: string | null;
  cantidad: number;
  movimiento_en: string;
  tipo: string;
  delivery_id: string | null;
};

const PREP_SELECT =
  'id,local_central_id,nombre,descripcion,categoria,unidad_base,activo,rendimiento,caducidad_dias,observaciones,legacy_product_id,inventory_product_id,catalog_product_id,escandallo_recipe_id,escandallo_raw_supplier_product_id,escandallo_processed_product_id,production_recipe_id,purchase_article_id,created_at,updated_at';

export async function ccListDestinations(supabase: SupabaseClient): Promise<DestinationLocal[]> {
  const { data, error } = await supabase.rpc('cc_list_delivery_destinations');
  if (error) throw new Error(error.message);
  return (data ?? []) as DestinationLocal[];
}

/**
 * @deprecated Producción central ya no debe depender de `products`.
 */
export async function ccFetchProductsForLocal(
  supabase: SupabaseClient,
  localId: string,
): Promise<Array<{ id: string; name: string; unit: CcUnit }>> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, unit')
    .eq('local_id', localId)
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; name: string; unit: CcUnit }>;
}

export async function ccListPreparations(
  supabase: SupabaseClient,
  localCentralId: string,
  opts?: { onlyActive?: boolean },
): Promise<CentralPreparationRow[]> {
  const q = supabase
    .from('central_preparations')
    .select(PREP_SELECT)
    .eq('local_central_id', localCentralId)
    .order('nombre');
  if (opts?.onlyActive) q.eq('activo', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as CentralPreparationRow[];
}

export async function ccInsertPreparation(
  supabase: SupabaseClient,
  row: {
    local_central_id: string;
    nombre: string;
    descripcion?: string | null;
    categoria?: string;
    unidad_base: CcPreparationUnit;
    activo?: boolean;
    rendimiento?: number | null;
    caducidad_dias?: number | null;
    observaciones?: string | null;
    inventory_product_id?: string | null;
    catalog_product_id?: string | null;
    escandallo_recipe_id?: string | null;
    escandallo_raw_supplier_product_id?: string | null;
    escandallo_processed_product_id?: string | null;
    production_recipe_id?: string | null;
    purchase_article_id?: string | null;
  },
): Promise<CentralPreparationRow> {
  const { data, error } = await supabase
    .from('central_preparations')
    .insert({
      local_central_id: row.local_central_id,
      nombre: row.nombre.trim(),
      descripcion: row.descripcion?.trim() || null,
      categoria: row.categoria?.trim() || 'General',
      unidad_base: row.unidad_base,
      activo: row.activo ?? true,
      rendimiento: row.rendimiento ?? null,
      caducidad_dias: row.caducidad_dias ?? null,
      observaciones: row.observaciones?.trim() || null,
      inventory_product_id: row.inventory_product_id ?? null,
      catalog_product_id: row.catalog_product_id ?? null,
      escandallo_recipe_id: row.escandallo_recipe_id ?? null,
      escandallo_raw_supplier_product_id: row.escandallo_raw_supplier_product_id ?? null,
      escandallo_processed_product_id: row.escandallo_processed_product_id ?? null,
      production_recipe_id: row.production_recipe_id ?? null,
      purchase_article_id: row.purchase_article_id ?? null,
    })
    .select(PREP_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as CentralPreparationRow;
}

export async function ccUpdateCentralPreparation(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<{
    nombre: string;
    unidad_base: CcPreparationUnit;
    rendimiento: number | null;
    caducidad_dias: number | null;
    descripcion: string | null;
    observaciones: string | null;
    activo: boolean;
  }>,
): Promise<void> {
  const { error } = await supabase.from('central_preparations').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function ccListPreparationIngredients(
  supabase: SupabaseClient,
  preparationId: string,
): Promise<PreparationIngredientRow[]> {
  const { data, error } = await supabase
    .from('central_preparation_ingredients')
    .select('*, central_preparations(nombre)')
    .eq('preparation_id', preparationId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as PreparationIngredientRow[];
}

export async function ccReplacePreparationIngredients(
  supabase: SupabaseClient,
  preparationId: string,
  ingredients: Array<{
    ingredient_preparation_id: string;
    cantidad: number;
    unidad: CcPreparationUnit;
    observaciones?: string | null;
  }>,
): Promise<void> {
  const { error: delError } = await supabase
    .from('central_preparation_ingredients')
    .delete()
    .eq('preparation_id', preparationId);
  if (delError) throw new Error(delError.message);
  if (ingredients.length === 0) return;
  const payload = ingredients
    .filter((x) => x.ingredient_preparation_id && Number.isFinite(x.cantidad) && x.cantidad > 0)
    .map((x) => ({
      preparation_id: preparationId,
      ingredient_preparation_id: x.ingredient_preparation_id,
      cantidad: x.cantidad,
      unidad: x.unidad,
      observaciones: x.observaciones?.trim() || null,
    }));
  if (payload.length === 0) return;
  const { error } = await supabase.from('central_preparation_ingredients').insert(payload);
  if (error) throw new Error(error.message);
}

export async function ccInsertProductionOrder(
  supabase: SupabaseClient,
  row: {
    preparation_id: string;
    local_central_id: string;
    fecha: string;
    cantidad_objetivo: number;
    estado?: ProductionOrderEstado;
    created_by?: string | null;
    product_id?: string | null;
    notes?: string | null;
    escandallo_recipe_id?: string | null;
    production_recipe_id?: string | null;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from('production_orders')
    .insert({
      preparation_id: row.preparation_id,
      product_id: row.product_id ?? null,
      local_central_id: row.local_central_id,
      fecha: row.fecha,
      cantidad_objetivo: row.cantidad_objetivo,
      estado: row.estado ?? 'borrador',
      created_by: row.created_by ?? null,
      notes: row.notes?.trim() || null,
      escandallo_recipe_id: row.escandallo_recipe_id ?? null,
      production_recipe_id: row.production_recipe_id ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

const PRODUCTION_ORDER_LIST_SELECT =
  '*, central_preparations(nombre, unidad_base, rendimiento, caducidad_dias), products(name), production_recipes(name, final_unit, default_expiry_days, base_yield_quantity, base_yield_unit)';

export async function ccFetchProductionOrders(
  supabase: SupabaseClient,
  localCentralId: string,
): Promise<ProductionOrderRow[]> {
  const { data, error } = await supabase
    .from('production_orders')
    .select(PRODUCTION_ORDER_LIST_SELECT)
    .eq('local_central_id', localCentralId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductionOrderRow[];
}

export async function ccFetchProductionOrderById(
  supabase: SupabaseClient,
  orderId: string,
): Promise<ProductionOrderRow | null> {
  const { data, error } = await supabase
    .from('production_orders')
    .select(PRODUCTION_ORDER_LIST_SELECT)
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as ProductionOrderRow | null;
}

export async function ccUpdateProductionOrder(
  supabase: SupabaseClient,
  orderId: string,
  patch: Partial<{
    estado: ProductionOrderEstado;
    notes: string | null;
    cantidad_producida: number | null;
    fecha: string;
  }>,
): Promise<void> {
  const { error } = await supabase.from('production_orders').update(patch).eq('id', orderId);
  if (error) throw new Error(error.message);
}

export async function ccFetchProductionOrderLines(
  supabase: SupabaseClient,
  orderId: string,
): Promise<ProductionOrderLineRow[]> {
  const { data, error } = await supabase
    .from('production_order_lines')
    .select('*')
    .eq('production_order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductionOrderLineRow[];
}

export async function ccReplaceProductionOrderLines(
  supabase: SupabaseClient,
  orderId: string,
  lines: Array<{
    ingredient_preparation_id: string;
    label_snapshot: string;
    theoretical_qty: number;
    unidad: CcPreparationUnit;
    real_qty?: number | null;
    origin_batch_id?: string | null;
    cost_estimated_eur?: number | null;
    escandallo_line_id?: string | null;
    article_id?: string | null;
    production_recipe_line_id?: string | null;
  }>,
): Promise<void> {
  const { error: delErr } = await supabase
    .from('production_order_lines')
    .delete()
    .eq('production_order_id', orderId);
  if (delErr) throw new Error(delErr.message);
  if (lines.length === 0) return;
  const payload = lines.map((x) => ({
    production_order_id: orderId,
    ingredient_preparation_id: x.ingredient_preparation_id,
    label_snapshot: x.label_snapshot,
    theoretical_qty: x.theoretical_qty,
    unidad: x.unidad,
    real_qty: x.real_qty ?? null,
    origin_batch_id: x.origin_batch_id ?? null,
    cost_estimated_eur: x.cost_estimated_eur ?? null,
    escandallo_line_id: x.escandallo_line_id ?? null,
    article_id: x.article_id ?? null,
    production_recipe_line_id: x.production_recipe_line_id ?? null,
  }));
  const { error } = await supabase.from('production_order_lines').insert(payload);
  if (error) throw new Error(error.message);
}

export async function ccUpdateProductionOrderLine(
  supabase: SupabaseClient,
  lineId: string,
  patch: Partial<{
    real_qty: number | null;
    origin_batch_id: string | null;
    cost_real_eur: number | null;
  }>,
): Promise<void> {
  const { error } = await supabase.from('production_order_lines').update(patch).eq('id', lineId);
  if (error) throw new Error(error.message);
}

/** Lotes en central con stock > 0 para una elaboración-ingrediente. */
export async function ccListBatchesForPreparationInCentral(
  supabase: SupabaseClient,
  localCentralId: string,
  preparationId: string,
): Promise<ProductionBatchRow[]> {
  const { data, error } = await supabase
    .from('production_batches')
    .select('*, batch_stock(cantidad, local_id), central_preparations(nombre), products(name)')
    .eq('local_central_id', localCentralId)
    .eq('preparation_id', preparationId)
    .in('estado', ['disponible', 'abierto'])
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<ProductionBatchRow & { batch_stock?: BatchStockRow[] }>;
  return rows.filter((b) => {
    const st = b.batch_stock ?? [];
    return st.some((s) => s.local_id === localCentralId && Number(s.cantidad) > 0);
  }) as ProductionBatchRow[];
}

export async function ccRegisterProductionBatch(
  supabase: SupabaseClient,
  args: {
    orderId: string | null;
    preparationId: string;
    localCentralId: string;
    fechaElaboracion: string;
    fechaCaducidad: string | null;
    cantidad: number;
    unidad: CcUnit;
    ingredients?: Array<{ preparation_id: string; cantidad: number; unidad: CcUnit }>;
  },
): Promise<string> {
  const ingredients =
    args.ingredients?.map((i) => ({
      preparation_id: i.preparation_id,
      cantidad: i.cantidad,
      unidad: i.unidad,
    })) ?? [];
  const { data, error } = await supabase.rpc('cc_register_production_batch_v2', {
    p_order_id: args.orderId,
    p_preparation_id: args.preparationId,
    p_local_central_id: args.localCentralId,
    p_fecha_elaboracion: args.fechaElaboracion,
    p_fecha_caducidad: args.fechaCaducidad,
    p_cantidad: args.cantidad,
    p_unidad: args.unidad,
    p_ingredients: ingredients,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Lotes producidos en esta cocina central (con desglose de stock por sede). */
export async function ccFetchBatchesCentral(
  supabase: SupabaseClient,
  centralLocalId: string,
): Promise<Array<ProductionBatchRow & { batch_stock?: BatchStockRow[] }>> {
  const { data, error } = await supabase
    .from('production_batches')
    .select('*, central_preparations(nombre), products(name), batch_stock(cantidad, local_id)')
    .eq('local_central_id', centralLocalId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<ProductionBatchRow & { batch_stock?: BatchStockRow[] }>;
}

/** Lotes que tienen stock en el local indicado (central o sede). */
export async function ccFetchBatchesWithStockHere(
  supabase: SupabaseClient,
  localId: string,
): Promise<Array<ProductionBatchRow & { batch_stock?: BatchStockRow[] }>> {
  const { data, error } = await supabase
    .from('production_batches')
    .select('*, central_preparations(nombre), products(name), batch_stock!inner(cantidad, local_id)')
    .eq('batch_stock.local_id', localId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<ProductionBatchRow & { batch_stock?: BatchStockRow[] }>;
}

export async function ccFetchBatchById(
  supabase: SupabaseClient,
  batchId: string,
): Promise<ProductionBatchRow | null> {
  const { data, error } = await supabase
    .from('production_batches')
    .select('*, central_preparations(nombre), products(name)')
    .eq('id', batchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ProductionBatchRow | null;
}

export async function ccFetchBatchByQrToken(
  supabase: SupabaseClient,
  token: string,
): Promise<ProductionBatchRow | null> {
  const clean = token.trim();
  const { data, error } = await supabase
    .from('production_batches')
    .select('*, central_preparations(nombre), products(name)')
    .eq('qr_token', clean)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ProductionBatchRow | null;
}

export async function ccFetchStockForBatch(
  supabase: SupabaseClient,
  batchId: string,
): Promise<BatchStockRow[]> {
  const { data, error } = await supabase
    .from('batch_stock')
    .select('batch_id, local_id, cantidad')
    .eq('batch_id', batchId);
  if (error) throw new Error(error.message);
  return (data ?? []) as BatchStockRow[];
}

export async function ccFetchIngredientTrace(
  supabase: SupabaseClient,
  batchId: string,
): Promise<IngredientTraceRow[]> {
  const { data, error } = await supabase
    .from('batch_ingredient_trace')
    .select('*, central_preparations(nombre), products(name)')
    .eq('batch_id', batchId);
  if (error) throw new Error(error.message);
  return (data ?? []) as IngredientTraceRow[];
}

/** Entregas donde este lote salió hacia sedes (trazabilidad hacia delante). */
export async function ccFetchForwardTrace(
  supabase: SupabaseClient,
  batchId: string,
): Promise<
  Array<{
    cantidad: number;
    unidad: CcUnit;
    deliveries:
      | {
          id: string;
          fecha: string;
          estado: DeliveryEstado;
          local_destino_label: string | null;
        }
      | {
          id: string;
          fecha: string;
          estado: DeliveryEstado;
          local_destino_label: string | null;
        }[]
      | null;
  }>
> {
  const { data, error } = await supabase
    .from('delivery_items')
    .select('cantidad, unidad, deliveries(id, fecha, estado, local_destino_label)')
    .eq('batch_id', batchId);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    cantidad: number;
    unidad: CcUnit;
    deliveries:
      | {
          id: string;
          fecha: string;
          estado: DeliveryEstado;
          local_destino_label: string | null;
        }
      | {
          id: string;
          fecha: string;
          estado: DeliveryEstado;
          local_destino_label: string | null;
        }[]
      | null;
  }>;
}

export async function ccFetchMovements(
  supabase: SupabaseClient,
  batchId: string,
): Promise<BatchMovementRow[]> {
  const { data, error } = await supabase
    .from('batch_movements')
    .select('*')
    .eq('batch_id', batchId)
    .order('movimiento_en', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as BatchMovementRow[];
}

export async function ccFetchDeliveriesOrigin(
  supabase: SupabaseClient,
  localId: string,
): Promise<DeliveryRow[]> {
  const { data, error } = await supabase
    .from('deliveries')
    .select('*')
    .eq('local_origen_id', localId)
    .order('fecha', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DeliveryRow[];
}

export async function ccFetchDeliveriesDestination(
  supabase: SupabaseClient,
  localId: string,
): Promise<DeliveryRow[]> {
  const { data, error } = await supabase
    .from('deliveries')
    .select('*')
    .eq('local_destino_id', localId)
    .order('fecha', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DeliveryRow[];
}

export async function ccFetchDeliveryDetail(
  supabase: SupabaseClient,
  deliveryId: string,
): Promise<{ delivery: DeliveryRow | null; items: DeliveryItemRow[] }> {
  const { data: delivery, error: dErr } = await supabase
    .from('deliveries')
    .select('*')
    .eq('id', deliveryId)
    .maybeSingle();
  if (dErr) throw new Error(dErr.message);
  const { data: items, error: iErr } = await supabase
    .from('delivery_items')
    .select(
      '*, production_batches(codigo_lote, fecha_elaboracion, fecha_caducidad, id, estado), central_preparations(nombre), products(name)',
    )
    .eq('delivery_id', deliveryId);
  if (iErr) throw new Error(iErr.message);
  return {
    delivery: delivery as DeliveryRow | null,
    items: (items ?? []) as DeliveryItemRow[],
  };
}

export async function ccInsertDelivery(
  supabase: SupabaseClient,
  row: {
    local_origen_id: string;
    local_destino_id: string;
    fecha: string;
    local_origen_label: string | null;
    local_destino_label: string | null;
    created_by?: string | null;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from('deliveries')
    .insert({
      local_origen_id: row.local_origen_id,
      local_destino_id: row.local_destino_id,
      fecha: row.fecha,
      estado: 'borrador',
      local_origen_label: row.local_origen_label,
      local_destino_label: row.local_destino_label,
      created_by: row.created_by ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function ccInsertDeliveryItem(
  supabase: SupabaseClient,
  row: {
    delivery_id: string;
    batch_id: string;
    product_id?: string | null;
    preparation_id?: string | null;
    cantidad: number;
    unidad: CcUnit;
  },
): Promise<void> {
  const { error } = await supabase.from('delivery_items').insert(row);
  if (error) throw new Error(error.message);
}

export async function ccUpdateDeliveryEstado(
  supabase: SupabaseClient,
  deliveryId: string,
  estado: DeliveryEstado,
): Promise<void> {
  const { error } = await supabase.from('deliveries').update({ estado }).eq('id', deliveryId);
  if (error) throw new Error(error.message);
}

export async function ccConfirmDeliveryDispatch(
  supabase: SupabaseClient,
  deliveryId: string,
): Promise<void> {
  const { error } = await supabase.rpc('cc_confirm_delivery_dispatch', {
    p_delivery_id: deliveryId,
  });
  if (error) throw new Error(error.message);
}

export async function ccSignDeliveryReceipt(
  supabase: SupabaseClient,
  args: {
    deliveryId: string;
    nombreReceptor: string;
    signatureDataUrl: string;
    firmaUrl: string | null;
  },
): Promise<void> {
  const { error } = await supabase.rpc('cc_sign_delivery_receipt', {
    p_delivery_id: args.deliveryId,
    p_nombre_receptor: args.nombreReceptor,
    p_signature_data_url: args.signatureDataUrl,
    p_firma_url: args.firmaUrl,
  });
  if (error) throw new Error(error.message);
}

export async function ccSetBatchEstado(
  supabase: SupabaseClient,
  batchId: string,
  estado: BatchEstado,
): Promise<void> {
  const { error } = await supabase.rpc('cc_set_batch_estado', {
    p_batch_id: batchId,
    p_estado: estado,
  });
  if (error) throw new Error(error.message);
}

export async function ccInsertIncident(
  supabase: SupabaseClient,
  row: { batch_id: string; tipo: string; descripcion: string | null; created_by?: string | null },
): Promise<void> {
  const { error } = await supabase.from('traceability_incidents').insert({
    batch_id: row.batch_id,
    tipo: row.tipo,
    descripcion: row.descripcion,
    estado: 'abierta',
    created_by: row.created_by ?? null,
  });
  if (error) throw new Error(error.message);
}

export function ccProductName(
  source:
    | { name?: string | null; nombre?: string | null }
    | { name?: string | null; nombre?: string | null }[]
    | null
    | undefined,
): string {
  if (!source) return '—';
  const p = Array.isArray(source) ? source[0] : source;
  const n = p?.nombre?.trim?.();
  if (n) return n;
  const legacy = p?.name?.trim?.();
  if (legacy) return legacy;
  return '—';
}

export function ccBatchStockAt(
  rows: BatchStockRow[] | undefined,
  localId: string,
): number {
  if (!rows) return 0;
  const hit = rows.find((r) => r.local_id === localId);
  return hit ? Number(hit.cantidad) : 0;
}
