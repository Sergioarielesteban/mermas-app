import type { SupabaseClient } from '@supabase/supabase-js';
import type { InventoryItem } from '@/lib/inventory-supabase';

export const INVENTORY_MOVEMENT_TYPES = [
  'purchase_receipt',
  'central_kitchen_receipt',
  'initial_stock',
  'waste',
  'breakage',
  'staff_consumption',
  'transfer_in',
  'transfer_out',
  'manual_adjustment',
  'count_adjustment',
] as const;

export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export type InventoryMovement = {
  id: string;
  local_id: string;
  inventory_item_id: string;
  quantity_delta: number;
  movement_type: InventoryMovementType;
  unit: string | null;
  previous_stock: number | null;
  new_stock: number | null;
  reason: string;
  notes: string | null;
  source_module: string | null;
  source_id: string | null;
  count_session_id: string | null;
  occurred_at: string;
  created_by: string | null;
  created_at: string;
};

export type InventoryMovementWithItem = InventoryMovement & {
  item_name: string;
  item_unit: string;
};

export type InventoryCountSession = {
  id: string;
  local_id: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  notes: string | null;
  started_by: string | null;
  completed_at: string | null;
  created_at: string;
};

export const MOVEMENT_TYPE_LABELS: Record<InventoryMovementType, string> = {
  purchase_receipt: 'Recepción pedido',
  central_kitchen_receipt: 'Recepción cocina central',
  initial_stock: 'Inventario inicial',
  waste: 'Merma',
  breakage: 'Rotura',
  staff_consumption: 'Consumo interno',
  transfer_in: 'Transferencia entrada',
  transfer_out: 'Transferencia salida',
  manual_adjustment: 'Ajuste manual',
  count_adjustment: 'Ajuste por conteo',
};

export const OUTBOUND_MOVEMENT_TYPES: InventoryMovementType[] = [
  'waste',
  'breakage',
  'staff_consumption',
  'transfer_out',
];

export function isInboundMovement(type: InventoryMovementType): boolean {
  return type === 'purchase_receipt' ||
    type === 'central_kitchen_receipt' ||
    type === 'initial_stock' ||
    type === 'transfer_in' ||
    (type === 'manual_adjustment' || type === 'count_adjustment');
}

function mapMovementRow(row: Record<string, unknown>): InventoryMovement {
  const mt = String(row.movement_type ?? 'manual_adjustment');
  const movementType = (INVENTORY_MOVEMENT_TYPES as readonly string[]).includes(mt)
    ? (mt as InventoryMovementType)
    : 'manual_adjustment';
  return {
    id: String(row.id),
    local_id: String(row.local_id),
    inventory_item_id: String(row.inventory_item_id),
    quantity_delta: Number(row.quantity_delta),
    movement_type: movementType,
    unit: row.unit != null ? String(row.unit) : null,
    previous_stock: row.previous_stock != null ? Number(row.previous_stock) : null,
    new_stock: row.new_stock != null ? Number(row.new_stock) : null,
    reason: String(row.reason ?? ''),
    notes: row.notes != null ? String(row.notes) : null,
    source_module: row.source_module != null ? String(row.source_module) : null,
    source_id: row.source_id != null ? String(row.source_id) : null,
    count_session_id: row.count_session_id != null ? String(row.count_session_id) : null,
    occurred_at: String(row.occurred_at ?? row.created_at),
    created_by: row.created_by != null ? String(row.created_by) : null,
    created_at: String(row.created_at),
  };
}

export type InventoryStockRow = InventoryItem & {
  min_stock: number | null;
  last_counted_at: string | null;
};

const STOCK_SELECT =
  'id,local_id,catalog_item_id,local_category_id,name,unit,price_per_unit,quantity_on_hand,format_label,unidad_coste,formato_operativo,factor_conversion_manual,notes,sort_order,is_active,origen_coste,master_cost_source,master_article_id,supplier_product_id,supplier_id,precio_unitario_calculado,escandallo_recipe_id,central_production_recipe_id,cc_recipe_format_qty,precio_manual,min_stock,last_counted_at';

function mapStockRow(row: Record<string, unknown>): InventoryStockRow {
  const supplierProductId =
    row.supplier_product_id != null ? String(row.supplier_product_id) : null;
  return {
    id: String(row.id),
    local_id: String(row.local_id),
    catalog_item_id: row.catalog_item_id != null ? String(row.catalog_item_id) : null,
    local_category_id: row.local_category_id != null ? String(row.local_category_id) : null,
    name: String(row.name ?? ''),
    unit: String(row.unit ?? ''),
    price_per_unit: Number(row.price_per_unit),
    quantity_on_hand: Number(row.quantity_on_hand),
    format_label: row.format_label != null ? String(row.format_label) : null,
    unidadCoste: (row.unidad_coste === 'l' ? 'l' : row.unidad_coste === 'ud' ? 'ud' : 'kg') as InventoryStockRow['unidadCoste'],
    formatoOperativo:
      row.formato_operativo != null && String(row.formato_operativo).trim()
        ? String(row.formato_operativo).trim()
        : null,
    factorConversionManual:
      row.factor_conversion_manual != null && Number.isFinite(Number(row.factor_conversion_manual))
        ? Number(row.factor_conversion_manual)
        : null,
    notes: String(row.notes ?? ''),
    sort_order: Number(row.sort_order ?? 0),
    is_active: Boolean(row.is_active),
    origenCoste: (row.origen_coste === 'articulo_proveedor'
      ? 'articulo_proveedor'
      : row.origen_coste === 'produccion_propia'
        ? 'produccion_propia'
        : row.origen_coste === 'recetario_cc'
          ? 'recetario_cc'
          : 'manual') as InventoryStockRow['origenCoste'],
    masterCostSource: row.master_cost_source === 'compra' ? 'compra' : 'uso',
    masterArticleId: row.master_article_id != null ? String(row.master_article_id) : null,
    supplierProductId,
    supplierId: row.supplier_id != null ? String(row.supplier_id) : null,
    precioUnitarioCalculado:
      row.precio_unitario_calculado != null && Number.isFinite(Number(row.precio_unitario_calculado))
        ? Number(row.precio_unitario_calculado)
        : null,
    escandalloRecipeId: row.escandallo_recipe_id != null ? String(row.escandallo_recipe_id) : null,
    centralProductionRecipeId:
      row.central_production_recipe_id != null ? String(row.central_production_recipe_id) : null,
    ccRecipeFormatQty:
      row.cc_recipe_format_qty != null && Number.isFinite(Number(row.cc_recipe_format_qty))
        ? Number(row.cc_recipe_format_qty)
        : null,
    precioManual: row.precio_manual != null && Number.isFinite(Number(row.precio_manual)) ? Number(row.precio_manual) : null,
    min_stock:
      row.min_stock != null && Number.isFinite(Number(row.min_stock)) ? Number(row.min_stock) : null,
    last_counted_at: row.last_counted_at != null ? String(row.last_counted_at) : null,
  };
}

export async function fetchInventoryStockRows(
  supabase: SupabaseClient,
  localId: string,
  options?: { search?: string; limit?: number },
): Promise<InventoryStockRow[]> {
  let q = supabase
    .from('inventory_items')
    .select(STOCK_SELECT)
    .eq('local_id', localId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  const search = options?.search?.trim();
  if (search) q = q.ilike('name', `%${search}%`);
  if (options?.limit != null) q = q.limit(options.limit);
  const { data, error } = await q;
  if (error) {
    if (/min_stock|last_counted_at|column/i.test(error.message)) {
      const { data: fallback, error: fbErr } = await supabase
        .from('inventory_items')
        .select(
          'id,local_id,catalog_item_id,local_category_id,name,unit,price_per_unit,quantity_on_hand,format_label,unidad_coste,formato_operativo,factor_conversion_manual,notes,sort_order,is_active,origen_coste,master_cost_source,master_article_id,supplier_product_id,supplier_id,precio_unitario_calculado,escandallo_recipe_id,central_production_recipe_id,cc_recipe_format_qty,precio_manual',
        )
        .eq('local_id', localId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (fbErr) throw new Error(fbErr.message);
      return (fallback ?? []).map((row) => ({ ...mapStockRow(row as Record<string, unknown>), min_stock: null, last_counted_at: null }));
    }
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapStockRow(row as Record<string, unknown>));
}

export async function fetchInventoryMovements(
  supabase: SupabaseClient,
  localId: string,
  options?: { itemId?: string; limit?: number },
): Promise<InventoryMovementWithItem[]> {
  const limit = options?.limit ?? 80;
  let q = supabase
    .from('inventory_movements')
    .select(
      'id,local_id,inventory_item_id,quantity_delta,movement_type,unit,previous_stock,new_stock,reason,notes,source_module,source_id,count_session_id,occurred_at,created_by,created_at,inventory_items(name,unit)',
    )
    .eq('local_id', localId)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (options?.itemId) q = q.eq('inventory_item_id', options.itemId);
  const { data, error } = await q;
  if (error) {
    if (/movement_type|previous_stock|column/i.test(error.message)) {
      let legacy = supabase
        .from('inventory_movements')
        .select('id,local_id,inventory_item_id,quantity_delta,reason,occurred_at,created_by,created_at,inventory_items(name,unit)')
        .eq('local_id', localId)
        .order('occurred_at', { ascending: false })
        .limit(limit);
      if (options?.itemId) legacy = legacy.eq('inventory_item_id', options.itemId);
      const { data: fb, error: fbErr } = await legacy;
      if (fbErr) throw new Error(fbErr.message);
      return (fb ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        const item = r.inventory_items as Record<string, unknown> | null;
        const base = mapMovementRow({ ...r, movement_type: 'manual_adjustment' });
        return {
          ...base,
          item_name: String(item?.name ?? ''),
          item_unit: String(item?.unit ?? ''),
        };
      });
    }
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const item = r.inventory_items as Record<string, unknown> | null;
    return {
      ...mapMovementRow(r),
      item_name: String(item?.name ?? ''),
      item_unit: String(item?.unit ?? ''),
    };
  });
}

export async function fetchLastMovementByItemIds(
  supabase: SupabaseClient,
  localId: string,
  itemIds: string[],
): Promise<Map<string, InventoryMovement>> {
  const out = new Map<string, InventoryMovement>();
  if (itemIds.length === 0) return out;
  const { data, error } = await supabase
    .from('inventory_movements')
    .select(
      'id,local_id,inventory_item_id,quantity_delta,movement_type,unit,previous_stock,new_stock,reason,notes,source_module,source_id,count_session_id,occurred_at,created_by,created_at',
    )
    .eq('local_id', localId)
    .in('inventory_item_id', itemIds)
    .order('occurred_at', { ascending: false });
  if (error) {
    if (!/movement_type|column/i.test(error.message)) throw new Error(error.message);
    return out;
  }
  for (const row of data ?? []) {
    const m = mapMovementRow(row as Record<string, unknown>);
    if (!out.has(m.inventory_item_id)) out.set(m.inventory_item_id, m);
  }
  return out;
}

export type ApplyStockMovementParams = {
  localId: string;
  inventoryItemId: string;
  movementType: InventoryMovementType;
  quantityDelta: number;
  unit?: string | null;
  reason?: string;
  notes?: string | null;
  sourceModule?: string | null;
  sourceId?: string | null;
  countSessionId?: string | null;
  userId?: string | null;
};

export async function applyInventoryStockMovement(
  supabase: SupabaseClient,
  params: ApplyStockMovementParams,
): Promise<InventoryMovement> {
  const delta = Math.round(params.quantityDelta * 1000) / 1000;
  if (delta === 0) throw new Error('La cantidad del movimiento no puede ser cero.');

  const { data, error } = await supabase.rpc('inventory_apply_stock_movement', {
    p_local_id: params.localId,
    p_inventory_item_id: params.inventoryItemId,
    p_movement_type: params.movementType,
    p_quantity_delta: delta,
    p_unit: params.unit ?? null,
    p_reason: params.reason ?? '',
    p_notes: params.notes ?? null,
    p_source_module: params.sourceModule ?? null,
    p_source_id: params.sourceId ?? null,
    p_count_session_id: params.countSessionId ?? null,
    p_created_by: params.userId ?? null,
  });

  if (error) {
    if (/inventory_apply_stock_movement|function/i.test(error.message)) {
      return applyInventoryStockMovementFallback(supabase, params, delta);
    }
    throw new Error(error.message);
  }
  return mapMovementRow(data as Record<string, unknown>);
}

async function applyInventoryStockMovementFallback(
  supabase: SupabaseClient,
  params: ApplyStockMovementParams,
  delta: number,
): Promise<InventoryMovement> {
  const { data: item, error: itemErr } = await supabase
    .from('inventory_items')
    .select('id,local_id,unit,quantity_on_hand')
    .eq('id', params.inventoryItemId)
    .eq('local_id', params.localId)
    .single();
  if (itemErr) throw new Error(itemErr.message);
  const prev = Number(item.quantity_on_hand);
  const next = Math.round((prev + delta) * 1000) / 1000;
  if (next < 0) throw new Error('Stock insuficiente para esta salida.');

  const patch: Record<string, unknown> = { quantity_on_hand: next };
  if (params.movementType === 'count_adjustment') patch.last_counted_at = new Date().toISOString();

  const { error: updErr } = await supabase
    .from('inventory_items')
    .update(patch)
    .eq('id', params.inventoryItemId)
    .eq('local_id', params.localId);
  if (updErr) throw new Error(updErr.message);

  const insertPayload: Record<string, unknown> = {
    local_id: params.localId,
    inventory_item_id: params.inventoryItemId,
    quantity_delta: delta,
    reason: params.reason ?? '',
    movement_type: params.movementType,
    unit: params.unit ?? item.unit,
    previous_stock: prev,
    new_stock: next,
    notes: params.notes ?? null,
    source_module: params.sourceModule ?? null,
    source_id: params.sourceId ?? null,
    count_session_id: params.countSessionId ?? null,
    created_by: params.userId ?? null,
  };

  const { data: mov, error: movErr } = await supabase
    .from('inventory_movements')
    .insert(insertPayload)
    .select(
      'id,local_id,inventory_item_id,quantity_delta,movement_type,unit,previous_stock,new_stock,reason,notes,source_module,source_id,count_session_id,occurred_at,created_by,created_at',
    )
    .single();

  if (movErr) {
    const minimal = {
      local_id: params.localId,
      inventory_item_id: params.inventoryItemId,
      quantity_delta: delta,
      reason: params.reason ?? '',
      created_by: params.userId ?? null,
    };
    const { data: mov2, error: mov2Err } = await supabase
      .from('inventory_movements')
      .insert(minimal)
      .select('id,local_id,inventory_item_id,quantity_delta,reason,occurred_at,created_by,created_at')
      .single();
    if (mov2Err) throw new Error(mov2Err.message);
    return mapMovementRow({ ...(mov2 as Record<string, unknown>), movement_type: params.movementType, previous_stock: prev, new_stock: next });
  }
  return mapMovementRow(mov as Record<string, unknown>);
}

export async function applyManualStockAdjustment(
  supabase: SupabaseClient,
  params: {
    localId: string;
    inventoryItemId: string;
    direction: 'in' | 'out';
    quantity: number;
    movementType: InventoryMovementType;
    reason: string;
    notes?: string | null;
    userId?: string | null;
  },
): Promise<InventoryMovement> {
  const q = Math.abs(params.quantity);
  if (!Number.isFinite(q) || q <= 0) throw new Error('Indica una cantidad válida.');
  const delta = params.direction === 'in' ? q : -q;
  return applyInventoryStockMovement(supabase, {
    localId: params.localId,
    inventoryItemId: params.inventoryItemId,
    movementType: params.movementType,
    quantityDelta: delta,
    reason: params.reason.trim() || (params.direction === 'in' ? 'Entrada manual' : 'Salida manual'),
    notes: params.notes ?? null,
    userId: params.userId ?? null,
    sourceModule: 'inventario',
  });
}

export async function applyCountAdjustment(
  supabase: SupabaseClient,
  params: {
    localId: string;
    inventoryItemId: string;
    countedQuantity: number;
    reason: string;
    countSessionId?: string | null;
    userId?: string | null;
  },
): Promise<InventoryMovement | null> {
  const { data: item, error } = await supabase
    .from('inventory_items')
    .select('quantity_on_hand')
    .eq('id', params.inventoryItemId)
    .eq('local_id', params.localId)
    .single();
  if (error) throw new Error(error.message);
  const systemQty = Number(item.quantity_on_hand);
  const counted = Math.round(params.countedQuantity * 1000) / 1000;
  const delta = Math.round((counted - systemQty) * 1000) / 1000;
  if (delta === 0) return null;
  return applyInventoryStockMovement(supabase, {
    localId: params.localId,
    inventoryItemId: params.inventoryItemId,
    movementType: 'count_adjustment',
    quantityDelta: delta,
    reason: params.reason.trim() || 'Conteo físico',
    countSessionId: params.countSessionId ?? null,
    userId: params.userId ?? null,
    sourceModule: 'inventario_conteo',
  });
}

export async function startInventoryCountSession(
  supabase: SupabaseClient,
  localId: string,
  userId: string | null,
): Promise<InventoryCountSession | null> {
  const { data, error } = await supabase
    .from('inventory_counts')
    .insert({ local_id: localId, started_by: userId, status: 'in_progress' })
    .select('id,local_id,status,notes,started_by,completed_at,created_at')
    .single();
  if (error) {
    if (/inventory_counts|relation/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    local_id: String(r.local_id),
    status: r.status as InventoryCountSession['status'],
    notes: r.notes != null ? String(r.notes) : null,
    started_by: r.started_by != null ? String(r.started_by) : null,
    completed_at: r.completed_at != null ? String(r.completed_at) : null,
    created_at: String(r.created_at),
  };
}

export async function completeInventoryCountSession(
  supabase: SupabaseClient,
  localId: string,
  countSessionId: string,
): Promise<void> {
  const { error } = await supabase
    .from('inventory_counts')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', countSessionId)
    .eq('local_id', localId);
  if (error && !/inventory_counts|relation/i.test(error.message)) throw new Error(error.message);
}
