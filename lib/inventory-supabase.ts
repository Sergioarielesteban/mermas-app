import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchEscandalloRecipeUnitCostEur } from '@/lib/inventory-escandallo-cost';

export type InventoryCatalogCategory = {
  id: string;
  local_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type InventoryCatalogItem = {
  id: string;
  local_id: string;
  catalog_category_id: string;
  name: string;
  unit: string;
  default_price_per_unit: number;
  format_label: string | null;
  sort_order: number;
  is_active: boolean;
};

export type InventoryCostOrigen = 'manual' | 'master' | 'produccion_propia';
export type InventoryMasterCostSource = 'uso' | 'compra';

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
  origenCoste: InventoryCostOrigen;
  masterCostSource: InventoryMasterCostSource;
  masterArticleId: string | null;
  escandalloRecipeId: string | null;
  precioManual: number | null;
};

export async function fetchInventoryCatalogCategories(
  supabase: SupabaseClient,
  localId: string,
  activeOnly = true,
): Promise<InventoryCatalogCategory[]> {
  let q = supabase
    .from('inventory_catalog_categories')
    .select('id,local_id,name,sort_order,is_active')
    .eq('local_id', localId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as InventoryCatalogCategory[];
}

export async function fetchInventoryCatalogItems(
  supabase: SupabaseClient,
  localId: string,
  activeOnly = true,
): Promise<InventoryCatalogItem[]> {
  let q = supabase
    .from('inventory_catalog_items')
    .select(
      'id,local_id,catalog_category_id,name,unit,default_price_per_unit,format_label,sort_order,is_active',
    )
    .eq('local_id', localId)
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
      'id,local_id,catalog_item_id,local_category_id,name,unit,price_per_unit,quantity_on_hand,format_label,notes,sort_order,is_active,origen_coste,master_cost_source,master_article_id,escandallo_recipe_id,precio_manual',
    )
    .eq('local_id', localId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapInventoryItemRow(row));
}

function mapInventoryItemRow(row: Record<string, unknown>): InventoryItem {
  const o = row.origen_coste;
  const origenCoste: InventoryCostOrigen =
    o === 'master' || o === 'produccion_propia' ? o : 'manual';
  const mcs = row.master_cost_source;
  const masterCostSource: InventoryMasterCostSource = mcs === 'compra' ? 'compra' : 'uso';
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
    notes: String(row.notes ?? ''),
    sort_order: Number(row.sort_order ?? 0),
    is_active: Boolean(row.is_active),
    origenCoste,
    masterCostSource,
    masterArticleId: row.master_article_id != null ? String(row.master_article_id) : null,
    escandalloRecipeId: row.escandallo_recipe_id != null ? String(row.escandallo_recipe_id) : null,
    precioManual: row.precio_manual != null && Number.isFinite(Number(row.precio_manual)) ? Number(row.precio_manual) : null,
  };
}

/**
 * Resuelve €/ud de valoración según origen (máster, subreceta/escandallo, manual).
 */
export async function resolveInventoryItemUnitPriceEur(
  supabase: SupabaseClient,
  localId: string,
  row: Pick<
    InventoryItem,
    'origenCoste' | 'masterCostSource' | 'masterArticleId' | 'escandalloRecipeId' | 'price_per_unit' | 'precioManual' | 'unit'
  >,
): Promise<number | null> {
  if (row.origenCoste === 'manual') {
    const p = row.precioManual;
    if (p != null && Number.isFinite(p) && p >= 0) return Math.round(p * 100) / 100;
    return row.price_per_unit >= 0 ? Math.round(row.price_per_unit * 100) / 100 : null;
  }
  if (row.origenCoste === 'master' && row.masterArticleId) {
    const { data, error } = await supabase
      .from('purchase_articles')
      .select('id,unidad_compra,unidad_uso,coste_compra_actual,coste_unitario_uso')
      .eq('id', row.masterArticleId)
      .eq('local_id', localId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const compra = data.coste_compra_actual != null ? Number(data.coste_compra_actual) : null;
    const uso = data.coste_unitario_uso != null ? Number(data.coste_unitario_uso) : null;
    const unitInv = String(row.unit ?? '').trim().toLowerCase();
    const unitCompra = String(data.unidad_compra ?? '').trim().toLowerCase();
    const unitUso = String(data.unidad_uso ?? '').trim().toLowerCase();
    if (row.masterCostSource === 'compra') {
      if (compra != null && Number.isFinite(compra) && compra > 0 && (!unitCompra || unitInv === unitCompra)) {
        return Math.round(compra * 10000) / 10000;
      }
      return null;
    }
    if (uso != null && Number.isFinite(uso) && uso > 0 && (!unitUso || unitInv === unitUso)) {
      return Math.round(uso * 10000) / 10000;
    }
    return null;
  }
  if (row.origenCoste === 'produccion_propia' && row.escandalloRecipeId) {
    const r = await fetchEscandalloRecipeUnitCostEur(supabase, localId, row.escandalloRecipeId);
    return r?.costPerUnit ?? null;
  }
  return null;
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
  if (c.local_id !== params.localId) {
    throw new Error('El artículo no pertenece al inventario de tu local.');
  }
  const q0 = Math.round((params.initialQuantity ?? 0) * 1000) / 1000;
  const { data: maxRow } = await supabase
    .from('inventory_items')
    .select('sort_order')
    .eq('local_id', params.localId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (maxRow?.sort_order ?? 0) + 1;

  const basePrice = Math.round(c.default_price_per_unit * 100) / 100;
  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      local_id: params.localId,
      catalog_item_id: c.id,
      local_category_id: null,
      name: c.name,
      unit: c.unit,
      price_per_unit: basePrice,
      quantity_on_hand: q0,
      format_label: c.format_label,
      notes: '',
      sort_order: nextSort,
      is_active: true,
      created_by: params.userId,
      origen_coste: 'manual',
      master_cost_source: 'uso',
      master_article_id: null,
      escandallo_recipe_id: null,
      precio_manual: basePrice,
    })
    .select(
      'id,local_id,catalog_item_id,local_category_id,name,unit,price_per_unit,quantity_on_hand,format_label,notes,sort_order,is_active,origen_coste,master_cost_source,master_article_id,escandallo_recipe_id,precio_manual',
    )
    .single();
  if (error) throw new Error(error.message);
  return mapInventoryItemRow(data as Record<string, unknown>);
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
    origenCoste?: InventoryCostOrigen;
    masterCostSource?: InventoryMasterCostSource;
    masterArticleId?: string | null;
    escandalloRecipeId?: string | null;
    precioManual?: number | null;
  },
): Promise<void> {
  const q = Math.round(params.quantity_on_hand * 1000) / 1000;
  const p = Math.round(params.price_per_unit * 100) / 100;
  const nm = params.name.trim();
  const row: Record<string, unknown> = {
    quantity_on_hand: q,
    price_per_unit: p,
    name: nm,
    format_label: params.format_label?.trim() ? params.format_label.trim() : null,
    unit: params.unit,
  };
  if (params.origenCoste != null) row.origen_coste = params.origenCoste;
  if (params.masterCostSource != null) row.master_cost_source = params.masterCostSource;
  if (params.masterArticleId !== undefined) row.master_article_id = params.masterArticleId;
  if (params.escandalloRecipeId !== undefined) row.escandallo_recipe_id = params.escandalloRecipeId;
  if (params.precioManual !== undefined) {
    row.precio_manual =
      params.precioManual != null && Number.isFinite(params.precioManual)
        ? Math.round(params.precioManual * 10000) / 10000
        : null;
  }
  const { error } = await supabase.from('inventory_items').update(row).eq('id', params.itemId).eq('local_id', params.localId);
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

/** Línea serializada en historial (JSON en Supabase). */
export type InventoryHistoryLineSnapshot = {
  id: string;
  catalog_item_id: string | null;
  name: string;
  unit: string;
  price_per_unit: number;
  quantity_on_hand: number;
  format_label: string | null;
};

export type InventoryHistorySnapshot = {
  id: string;
  local_id: string;
  created_at: string;
  event_type: 'before_reset' | 'before_line_delete' | 'inventory_final';
  summary: string | null;
  total_value_snapshot: number;
  lines_snapshot: InventoryHistoryLineSnapshot[];
};

export function buildLinesSnapshotPayload(lines: InventoryItem[]): InventoryHistoryLineSnapshot[] {
  return lines.map((row) => ({
    id: row.id,
    catalog_item_id: row.catalog_item_id,
    name: row.name,
    unit: row.unit,
    price_per_unit: row.price_per_unit,
    quantity_on_hand: row.quantity_on_hand,
    format_label: row.format_label,
  }));
}

export function totalInventoryValueFromLines(lines: InventoryItem[]): number {
  let t = 0;
  for (const row of lines) {
    t += row.quantity_on_hand * row.price_per_unit;
  }
  return Math.round(t * 100) / 100;
}

export async function insertInventoryHistorySnapshot(
  supabase: SupabaseClient,
  params: {
    localId: string;
    eventType: 'before_reset' | 'before_line_delete' | 'inventory_final';
    summary: string | null;
    lines: InventoryItem[];
    userId: string | null;
  },
): Promise<void> {
  const payload = buildLinesSnapshotPayload(params.lines);
  const total = totalInventoryValueFromLines(params.lines);
  const { error } = await supabase.from('inventory_history_snapshots').insert({
    local_id: params.localId,
    event_type: params.eventType,
    summary: params.summary,
    total_value_snapshot: total,
    lines_snapshot: payload,
    created_by: params.userId,
  });
  if (error) throw new Error(error.message);
}

export async function fetchInventoryHistorySnapshots(
  supabase: SupabaseClient,
  localId: string,
  limit = 80,
): Promise<InventoryHistorySnapshot[]> {
  const { data, error } = await supabase
    .from('inventory_history_snapshots')
    .select('id,local_id,created_at,event_type,summary,total_value_snapshot,lines_snapshot')
    .eq('local_id', localId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const raw = r.lines_snapshot;
    let lines: InventoryHistoryLineSnapshot[] = [];
    if (Array.isArray(raw)) {
      lines = raw.map((x) => {
        const o = x as Record<string, unknown>;
        return {
          id: String(o.id),
          catalog_item_id: o.catalog_item_id ? String(o.catalog_item_id) : null,
          name: String(o.name ?? ''),
          unit: String(o.unit ?? ''),
          price_per_unit: Number(o.price_per_unit),
          quantity_on_hand: Number(o.quantity_on_hand),
          format_label: o.format_label != null ? String(o.format_label) : null,
        };
      });
    }
    return {
      id: String(r.id),
      local_id: String(r.local_id),
      created_at: String(r.created_at),
      event_type: r.event_type as InventoryHistorySnapshot['event_type'],
      summary: r.summary != null ? String(r.summary) : null,
      total_value_snapshot: Number(r.total_value_snapshot),
      lines_snapshot: lines,
    };
  });
}

export async function deleteAllInventoryHistorySnapshots(
  supabase: SupabaseClient,
  localId: string,
): Promise<void> {
  const { error } = await supabase.from('inventory_history_snapshots').delete().eq('local_id', localId);
  if (error) throw new Error(error.message);
}

/** Borra todas las líneas de inventario del local (el catálogo no se toca). */
export async function deleteAllInventoryLinesForLocal(supabase: SupabaseClient, localId: string): Promise<void> {
  const { error } = await supabase.from('inventory_items').delete().eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function insertInventoryCatalogCategory(
  supabase: SupabaseClient,
  localId: string,
  name: string,
  sortOrder: number,
): Promise<InventoryCatalogCategory> {
  const { data, error } = await supabase
    .from('inventory_catalog_categories')
    .insert({
      local_id: localId,
      name: name.trim(),
      sort_order: sortOrder,
      is_active: true,
    })
    .select('id,local_id,name,sort_order,is_active')
    .single();
  if (error) throw new Error(error.message);
  return data as InventoryCatalogCategory;
}

/**
 * Oculta un artículo del catálogo de tu local (is_active = false) y borra las líneas
 * de inventario vinculadas a ese artículo.
 */
export async function deactivateInventoryCatalogItem(
  supabase: SupabaseClient,
  params: { catalogItemId: string; localId: string },
): Promise<void> {
  const { error: delErr } = await supabase
    .from('inventory_items')
    .delete()
    .eq('local_id', params.localId)
    .eq('catalog_item_id', params.catalogItemId);
  if (delErr) throw new Error(delErr.message);
  const { error: updErr } = await supabase
    .from('inventory_catalog_items')
    .update({ is_active: false })
    .eq('id', params.catalogItemId)
    .eq('local_id', params.localId);
  if (updErr) throw new Error(updErr.message);
}

/**
 * Oculta una categoría y todos sus artículos del catálogo de tu local; borra las líneas
 * de inventario vinculadas a esos artículos.
 */
export async function deactivateInventoryCatalogCategory(
  supabase: SupabaseClient,
  params: { categoryId: string; localId: string },
): Promise<void> {
  const { data: itemRows, error: fetchErr } = await supabase
    .from('inventory_catalog_items')
    .select('id')
    .eq('catalog_category_id', params.categoryId)
    .eq('local_id', params.localId);
  if (fetchErr) throw new Error(fetchErr.message);
  const ids = (itemRows ?? []).map((r) => r.id as string);
  if (ids.length > 0) {
    const { error: delErr } = await supabase
      .from('inventory_items')
      .delete()
      .eq('local_id', params.localId)
      .in('catalog_item_id', ids);
    if (delErr) throw new Error(delErr.message);
    const { error: updItemsErr } = await supabase
      .from('inventory_catalog_items')
      .update({ is_active: false })
      .eq('catalog_category_id', params.categoryId)
      .eq('local_id', params.localId);
    if (updItemsErr) throw new Error(updItemsErr.message);
  }
  const { error: updCatErr } = await supabase
    .from('inventory_catalog_categories')
    .update({ is_active: false })
    .eq('id', params.categoryId)
    .eq('local_id', params.localId);
  if (updCatErr) throw new Error(updCatErr.message);
}

export async function insertInventoryCatalogItem(
  supabase: SupabaseClient,
  params: {
    catalogCategoryId: string;
    name: string;
    unit: string;
    defaultPricePerUnit: number;
    formatLabel: string | null;
    sortOrder: number;
  },
): Promise<InventoryCatalogItem> {
  const p = Math.round(params.defaultPricePerUnit * 100) / 100;
  const { data, error } = await supabase
    .from('inventory_catalog_items')
    .insert({
      catalog_category_id: params.catalogCategoryId,
      name: params.name.trim(),
      unit: params.unit,
      default_price_per_unit: p,
      format_label: params.formatLabel?.trim() ? params.formatLabel.trim() : null,
      sort_order: params.sortOrder,
      is_active: true,
    })
    .select(
      'id,local_id,catalog_category_id,name,unit,default_price_per_unit,format_label,sort_order,is_active',
    )
    .single();
  if (error) throw new Error(error.message);
  const row = data as Record<string, unknown>;
  return {
    ...row,
    default_price_per_unit: Number(row.default_price_per_unit),
  } as InventoryCatalogItem;
}

export type InventoryMonthSnapshot = {
  id: string;
  local_id: string;
  year_month: string;
  total_value: number;
  lines_count: number;
  category_breakdown: Record<string, number>;
  created_at: string;
};

export async function fetchInventoryMonthSnapshots(
  supabase: SupabaseClient,
  localId: string,
  limit = 24,
): Promise<InventoryMonthSnapshot[]> {
  const { data, error } = await supabase
    .from('inventory_month_snapshots')
    .select('id,local_id,year_month,total_value,lines_count,category_breakdown,created_at')
    .eq('local_id', localId)
    .order('year_month', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const raw = r.category_breakdown;
    let breakdown: Record<string, number> = {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const n = Number(v);
        if (Number.isFinite(n)) breakdown[k] = n;
      }
    }
    return {
      id: String(r.id),
      local_id: String(r.local_id),
      year_month: String(r.year_month),
      total_value: Number(r.total_value),
      lines_count: Number(r.lines_count),
      category_breakdown: breakdown,
      created_at: String(r.created_at),
    };
  });
}

export async function upsertInventoryMonthSnapshot(
  supabase: SupabaseClient,
  params: {
    localId: string;
    yearMonth: string;
    totalValue: number;
    linesCount: number;
    categoryBreakdown: Record<string, number>;
  },
): Promise<void> {
  const { error } = await supabase.from('inventory_month_snapshots').upsert(
    {
      local_id: params.localId,
      year_month: params.yearMonth,
      total_value: Math.round(params.totalValue * 100) / 100,
      lines_count: params.linesCount,
      category_breakdown: params.categoryBreakdown,
    },
    { onConflict: 'local_id,year_month' },
  );
  if (error) throw new Error(error.message);
}

export async function deleteInventoryMonthSnapshot(
  supabase: SupabaseClient,
  localId: string,
  yearMonth: string,
): Promise<void> {
  const { error } = await supabase
    .from('inventory_month_snapshots')
    .delete()
    .eq('local_id', localId)
    .eq('year_month', yearMonth);
  if (error) throw new Error(error.message);
}

/** Borra todos los cierres mensuales usados en el gráfico «Valor por mes» (no toca líneas ni historial). */
export async function deleteAllInventoryMonthSnapshots(
  supabase: SupabaseClient,
  localId: string,
): Promise<void> {
  const { error } = await supabase.from('inventory_month_snapshots').delete().eq('local_id', localId);
  if (error) throw new Error(error.message);
}

/** Valor en € por id de categoría de catálogo (clave `__sin_catalogo__` si no hay enlace). */
export function computeInventoryCategoryBreakdownEuros(
  lines: InventoryItem[],
  catalogItems: InventoryCatalogItem[],
): Record<string, number> {
  const itemToCat = new Map(catalogItems.map((i) => [i.id, i.catalog_category_id]));
  const out: Record<string, number> = {};
  for (const row of lines) {
    const sub = row.quantity_on_hand * row.price_per_unit;
    const cid = row.catalog_item_id ? itemToCat.get(row.catalog_item_id) : undefined;
    const key = cid ?? '__sin_catalogo__';
    out[key] = Math.round(((out[key] ?? 0) + sub) * 100) / 100;
  }
  return out;
}

export function currentInventoryYearMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
