import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchEscandalloRecipeUnitCostEur } from '@/lib/inventory-escandallo-cost';
import { fetchProductionRecipeUnitCostEur } from '@/lib/production-recipe-cost';
import {
  fetchEffectiveSupplierProductUnitPriceEur,
  fetchSupplierProductRowForInventory,
  resolveSupplierRealPricingModel,
  resolveSupplierLinkedInventoryUnitPriceEur,
} from '@/lib/inventory-supplier-pricing';

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

export type InventoryCostOrigen = 'manual' | 'articulo_proveedor' | 'produccion_propia' | 'recetario_cc';
export type InventoryMasterCostSource = 'uso' | 'compra';

/** Unidad del precio de valoración (€/kg, €/L, €/ud); independiente de `unit` (cantidad/stock). */
export type InventoryUnidadCoste = 'kg' | 'l' | 'ud';

export const INVENTORY_UNIDAD_COSTE_VALUES: InventoryUnidadCoste[] = ['kg', 'l', 'ud'];

export function normalizeInventoryUnidadCoste(raw: string | null | undefined): InventoryUnidadCoste {
  const x = String(raw ?? 'kg').trim().toLowerCase();
  if (x === 'l' || x === 'litro' || x === 'litros' || x === 'lt') return 'l';
  if (x === 'ud' || x === 'uds' || x === 'unidad' || x === 'unidades' || x === 'u') return 'ud';
  if (x === 'kg' || x === 'kilogramo' || x === 'kilogramos' || x === 'kilo' || x === 'kilos') return 'kg';
  return 'kg';
}

/** Valor por defecto al crear línea desde catálogo: si el catálogo ya es kg/L/ud, coincide; si no (ej. bandeja), coste en kg. */
export function defaultInventoryUnidadCosteFromStockUnit(unit: string): InventoryUnidadCoste {
  const u = String(unit ?? '').trim().toLowerCase();
  if (u === 'l') return 'l';
  if (u === 'ud') return 'ud';
  if (u === 'kg') return 'kg';
  return 'kg';
}

/** Normaliza lectura desde BD (trim/caso); solo «manual» si valor ausente o no reconocido. */
export function normalizeInventoryOrigenCosteFromDb(
  raw: unknown,
  ctx?: { supplierProductId?: string | null },
): InventoryCostOrigen {
  if (raw === null || raw === undefined) return 'manual';
  const s = String(raw).trim().toLowerCase();
  if (s === 'articulo_proveedor') return 'articulo_proveedor';
  if (s === 'master') {
    const sid = ctx?.supplierProductId?.trim();
    return sid ? 'articulo_proveedor' : 'manual';
  }
  if (s === 'produccion_propia') return 'produccion_propia';
  if (s === 'recetario_cc') return 'recetario_cc';
  if (s === 'manual') return 'manual';
  return 'manual';
}

export type InventoryItem = {
  id: string;
  local_id: string;
  catalog_item_id: string | null;
  local_category_id: string | null;
  name: string;
  unit: string;
  /** € por `unidadCoste` (no por `unit` de stock). */
  price_per_unit: number;
  quantity_on_hand: number;
  format_label: string | null;
  /** €/kg, €/L o €/ud según precio/compra; usado al enlazar con artículo máster. */
  unidadCoste: InventoryUnidadCoste;
  /** Presentación (bandeja, caja…); solo informativo. */
  formatoOperativo: string | null;
  /**
   * Equivalencia manual opcional para motor universal máster:
   * 1 `unit` (unidad inventario) = `factorConversionManual` en `unidadCoste`.
   * Ejemplo: 1 bandeja = 1.5 kg.
   */
  factorConversionManual: number | null;
  notes: string;
  sort_order: number;
  is_active: boolean;
  origenCoste: InventoryCostOrigen;
  masterCostSource: InventoryMasterCostSource;
  /** @deprecated en inventario; conservado por filas antiguas. */
  masterArticleId: string | null;
  supplierProductId: string | null;
  supplierId: string | null;
  /** Último precio calculado desde proveedor (€/unidad de conteo). */
  precioUnitarioCalculado: number | null;
  escandalloRecipeId: string | null;
  centralProductionRecipeId: string | null;
  ccRecipeFormatQty: number | null;
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
      'id,local_id,catalog_item_id,local_category_id,name,unit,price_per_unit,quantity_on_hand,format_label,unidad_coste,formato_operativo,factor_conversion_manual,notes,sort_order,is_active,origen_coste,master_cost_source,master_article_id,supplier_product_id,supplier_id,precio_unitario_calculado,escandallo_recipe_id,central_production_recipe_id,cc_recipe_format_qty,precio_manual',
    )
    .eq('local_id', localId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapInventoryItemRow(row));
}

function mapInventoryItemRow(row: Record<string, unknown>): InventoryItem {
  const supplierProductId =
    row.supplier_product_id != null ? String(row.supplier_product_id) : null;
  const origenCoste = normalizeInventoryOrigenCosteFromDb(row.origen_coste, {
    supplierProductId,
  });
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
    unidadCoste: normalizeInventoryUnidadCoste(row.unidad_coste != null ? String(row.unidad_coste) : undefined),
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
    origenCoste,
    masterCostSource,
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
  };
}

/**
 * Resuelve el precio de valoración (€ por unidad de conteo) según origen.
 */
export async function resolveInventoryItemUnitPriceEur(
  supabase: SupabaseClient,
  localId: string,
  row: Pick<
    InventoryItem,
    | 'origenCoste'
    | 'supplierProductId'
    | 'escandalloRecipeId'
    | 'centralProductionRecipeId'
    | 'ccRecipeFormatQty'
    | 'price_per_unit'
    | 'precioManual'
    | 'factorConversionManual'
    | 'unit'
  >,
): Promise<number | null> {
  if (row.origenCoste === 'manual') {
    const p = row.precioManual;
    if (p != null && Number.isFinite(p) && p >= 0) return Math.round(p * 100) / 100;
    return row.price_per_unit >= 0 ? Math.round(row.price_per_unit * 100) / 100 : null;
  }
  const supplierProductRowId = row.supplierProductId?.trim();
  if (row.origenCoste === 'articulo_proveedor' && supplierProductRowId) {
    const eff = await fetchEffectiveSupplierProductUnitPriceEur(supabase, localId, supplierProductRowId);
    if (eff == null || !Number.isFinite(eff) || eff < 0) {
      return row.price_per_unit >= 0 ? Math.round(row.price_per_unit * 100) / 100 : null;
    }
    const prod = await fetchSupplierProductRowForInventory(supabase, localId, supplierProductRowId);
    if (!prod) return row.price_per_unit >= 0 ? Math.round(row.price_per_unit * 100) / 100 : null;
    const pricingModel = resolveSupplierRealPricingModel(prod, eff);
    if (!pricingModel) {
      return row.price_per_unit >= 0 ? Math.round(row.price_per_unit * 100) / 100 : null;
    }
    const resolved = await resolveSupplierLinkedInventoryUnitPriceEur(supabase, localId, {
      supplierProductId: supplierProductRowId,
      pricingModel,
      inventoryUnit: row.unit,
      factorConversionManual: row.factorConversionManual,
      productName: prod.name,
    });
    if (resolved == null) {
      return row.price_per_unit >= 0 ? Math.round(row.price_per_unit * 100) / 100 : null;
    }
    return resolved;
  }
  if (row.origenCoste === 'produccion_propia' && row.escandalloRecipeId) {
    const r = await fetchEscandalloRecipeUnitCostEur(supabase, localId, row.escandalloRecipeId);
    return r?.costPerUnit ?? null;
  }
  if (row.origenCoste === 'recetario_cc' && row.centralProductionRecipeId) {
    const unitCost = await fetchProductionRecipeUnitCostEur(supabase, localId, row.centralProductionRecipeId);
    const fmt = row.ccRecipeFormatQty;
    const mult =
      fmt != null && Number.isFinite(fmt) && fmt > 0 ? fmt : 1;
    if (unitCost != null && Number.isFinite(unitCost) && unitCost >= 0) {
      return Math.round(unitCost * mult * 10000) / 10000;
    }
    return null;
  }
  return null;
}

/** Tras cargar líneas: recalcula `price_per_unit` en memoria si el origen no es manual (proveedor / escandallo / CC). */
export async function hydrateInventoryItemsPricingFromOrigin(
  supabase: SupabaseClient,
  localId: string,
  items: InventoryItem[],
): Promise<InventoryItem[]> {
  return Promise.all(
    items.map(async (item) => {
      if (item.origenCoste === 'manual') return item;
      const resolved = await resolveInventoryItemUnitPriceEur(supabase, localId, item);
      if (resolved == null || !Number.isFinite(resolved)) {
        return { ...item, precioManual: null };
      }
      const rounded = Math.round(resolved * 100) / 100;
      return {
        ...item,
        price_per_unit: rounded,
        precioManual: null,
      };
    }),
  );
}

export async function insertInventoryLineFromCatalog(
  supabase: SupabaseClient,
  params: {
    localId: string;
    catalogItem: InventoryCatalogItem;
    userId: string | null;
    /** Cantidad inicial (ej. 0,2); por defecto 0. */
    initialQuantity?: number;
    /** Configuración inicial de coste al crear (opcional). */
    initialCostConfig?: {
      origenCoste: InventoryCostOrigen;
      masterCostSource: InventoryMasterCostSource;
      supplierProductId: string | null;
      supplierId: string | null;
      escandalloRecipeId: string | null;
      centralProductionRecipeId: string | null;
      ccRecipeFormatQty: number | null;
      precioManual: number | null;
      pricePerUnit: number;
      precioUnitarioCalculado?: number | null;
      name: string;
      unit: string;
      formatLabel: string | null;
      unidadCoste?: InventoryUnidadCoste;
      formatoOperativo?: string | null;
      factorConversionManual?: number | null;
    };
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
  const cfg = params.initialCostConfig;
  const resolvedPrice =
    cfg != null && Number.isFinite(cfg.pricePerUnit) && cfg.pricePerUnit >= 0
      ? Math.round(cfg.pricePerUnit * 100) / 100
      : basePrice;
  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      local_id: params.localId,
      catalog_item_id: c.id,
      local_category_id: null,
      name: cfg?.name?.trim() ? cfg.name.trim() : c.name,
      unit: cfg?.unit?.trim() ? cfg.unit : c.unit,
      price_per_unit: resolvedPrice,
      quantity_on_hand: q0,
      format_label: cfg?.formatLabel?.trim() ? cfg.formatLabel.trim() : c.format_label,
      unidad_coste:
        cfg?.unidadCoste != null
          ? normalizeInventoryUnidadCoste(String(cfg.unidadCoste))
          : defaultInventoryUnidadCosteFromStockUnit(c.unit),
      formato_operativo: cfg?.formatoOperativo?.trim() ? cfg.formatoOperativo.trim() : null,
      factor_conversion_manual:
        cfg?.factorConversionManual != null && Number.isFinite(Number(cfg.factorConversionManual))
          ? Math.round(Number(cfg.factorConversionManual) * 1000000) / 1000000
          : null,
      notes: '',
      sort_order: nextSort,
      is_active: true,
      created_by: params.userId,
      origen_coste: cfg?.origenCoste ?? 'manual',
      master_cost_source: cfg?.masterCostSource ?? 'uso',
      master_article_id: null,
      supplier_product_id: cfg?.supplierProductId ?? null,
      supplier_id: cfg?.supplierId ?? null,
      precio_unitario_calculado:
        cfg?.precioUnitarioCalculado != null && Number.isFinite(Number(cfg.precioUnitarioCalculado))
          ? Math.round(Number(cfg.precioUnitarioCalculado) * 10000) / 10000
          : cfg != null && Number.isFinite(cfg.pricePerUnit)
            ? Math.round(cfg.pricePerUnit * 10000) / 10000
            : null,
      escandallo_recipe_id: cfg?.escandalloRecipeId ?? null,
      central_production_recipe_id: cfg?.centralProductionRecipeId ?? null,
      cc_recipe_format_qty: cfg?.ccRecipeFormatQty ?? null,
      precio_manual:
        cfg?.origenCoste === 'manual' &&
        cfg?.precioManual != null &&
        Number.isFinite(Number(cfg.precioManual))
          ? Math.round(Number(cfg.precioManual) * 10000) / 10000
          : null,
    })
    .select(
      'id,local_id,catalog_item_id,local_category_id,name,unit,price_per_unit,quantity_on_hand,format_label,unidad_coste,formato_operativo,factor_conversion_manual,notes,sort_order,is_active,origen_coste,master_cost_source,master_article_id,supplier_product_id,supplier_id,precio_unitario_calculado,escandallo_recipe_id,central_production_recipe_id,cc_recipe_format_qty,precio_manual',
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
    unidadCoste: InventoryUnidadCoste;
    formatoOperativo: string | null;
    factorConversionManual: number | null;
    origenCoste: InventoryCostOrigen;
    masterCostSource?: InventoryMasterCostSource;
    supplierProductId?: string | null;
    supplierId?: string | null;
    precioUnitarioCalculado?: number | null;
    escandalloRecipeId?: string | null;
    centralProductionRecipeId?: string | null;
    ccRecipeFormatQty?: number | null;
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
    unidad_coste: normalizeInventoryUnidadCoste(params.unidadCoste),
    formato_operativo: params.formatoOperativo?.trim() ? params.formatoOperativo.trim() : null,
    factor_conversion_manual:
      params.factorConversionManual != null && Number.isFinite(params.factorConversionManual)
        ? Math.round(params.factorConversionManual * 1000000) / 1000000
        : null,
  };
  row.origen_coste = params.origenCoste;
  if (params.masterCostSource != null) row.master_cost_source = params.masterCostSource;
  if (params.origenCoste === 'articulo_proveedor') {
    row.master_article_id = null;
    if (params.supplierProductId !== undefined) row.supplier_product_id = params.supplierProductId;
    if (params.supplierId !== undefined) row.supplier_id = params.supplierId;
  } else {
    row.supplier_product_id = null;
    row.supplier_id = null;
  }
  if (params.precioUnitarioCalculado !== undefined) {
    row.precio_unitario_calculado =
      params.precioUnitarioCalculado != null && Number.isFinite(params.precioUnitarioCalculado)
        ? Math.round(params.precioUnitarioCalculado * 10000) / 10000
        : null;
  }
  if (params.escandalloRecipeId !== undefined) row.escandallo_recipe_id = params.escandalloRecipeId;
  if (params.centralProductionRecipeId !== undefined)
    row.central_production_recipe_id = params.centralProductionRecipeId;
  if (params.ccRecipeFormatQty !== undefined) {
    row.cc_recipe_format_qty =
      params.ccRecipeFormatQty != null && Number.isFinite(params.ccRecipeFormatQty)
        ? Math.round(params.ccRecipeFormatQty * 1000000) / 1000000
        : null;
  }
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
