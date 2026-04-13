import type { SupabaseClient } from '@supabase/supabase-js';
import type { Unit } from '@/lib/types';

export type EscandalloRecipe = {
  id: string;
  localId: string;
  name: string;
  notes: string;
  yieldQty: number;
  yieldLabel: string;
  createdAt: string;
  updatedAt: string;
};

export type EscandalloLine = {
  id: string;
  localId: string;
  recipeId: string;
  sourceType: 'raw' | 'processed' | 'manual';
  rawSupplierProductId: string | null;
  processedProductId: string | null;
  label: string;
  qty: number;
  unit: Unit;
  manualPricePerUnit: number | null;
  sortOrder: number;
  createdAt: string;
};

export type EscandalloRawProduct = {
  id: string;
  supplierId: string;
  supplierName: string;
  name: string;
  unit: Unit;
  pricePerUnit: number;
};

export type EscandalloProcessedProduct = {
  id: string;
  localId: string;
  name: string;
  sourceSupplierProductId: string;
  inputQty: number;
  outputQty: number;
  outputUnit: Unit;
  extraCostEur: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type RecipeRow = {
  id: string;
  local_id: string;
  name: string;
  notes: string;
  yield_qty: number;
  yield_label: string;
  created_at: string;
  updated_at: string;
};

type LineRow = {
  id: string;
  local_id: string;
  recipe_id: string;
  source_type: 'raw' | 'processed' | 'manual' | null;
  raw_supplier_product_id: string | null;
  processed_product_id: string | null;
  label: string;
  qty: number;
  unit: string;
  manual_price_per_unit: number | null;
  sort_order: number;
  created_at: string;
};

type RawProductRow = {
  id: string;
  supplier_id: string;
  name: string;
  unit: string;
  price_per_unit: number;
  pedido_suppliers: { name: string } | { name: string }[] | null;
};

type ProcessedRow = {
  id: string;
  local_id: string;
  name: string;
  source_supplier_product_id: string;
  input_qty: number;
  output_qty: number;
  output_unit: string;
  extra_cost_eur: number;
  notes: string;
  created_at: string;
  updated_at: string;
};

function mapRecipe(row: RecipeRow): EscandalloRecipe {
  return {
    id: row.id,
    localId: row.local_id,
    name: row.name,
    notes: row.notes ?? '',
    yieldQty: Number(row.yield_qty),
    yieldLabel: row.yield_label ?? 'raciones',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLine(row: LineRow): EscandalloLine {
  return {
    id: row.id,
    localId: row.local_id,
    recipeId: row.recipe_id,
    sourceType: row.source_type ?? 'manual',
    rawSupplierProductId: row.raw_supplier_product_id,
    processedProductId: row.processed_product_id,
    label: row.label,
    qty: Number(row.qty),
    unit: row.unit as Unit,
    manualPricePerUnit:
      row.manual_price_per_unit != null && Number.isFinite(Number(row.manual_price_per_unit))
        ? Number(row.manual_price_per_unit)
        : null,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at,
  };
}

function mapProcessed(row: ProcessedRow): EscandalloProcessedProduct {
  return {
    id: row.id,
    localId: row.local_id,
    name: row.name,
    sourceSupplierProductId: row.source_supplier_product_id,
    inputQty: Number(row.input_qty),
    outputQty: Number(row.output_qty),
    outputUnit: row.output_unit as Unit,
    extraCostEur: Number(row.extra_cost_eur ?? 0),
    notes: row.notes ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchEscandalloRecipes(supabase: SupabaseClient, localId: string): Promise<EscandalloRecipe[]> {
  const { data, error } = await supabase
    .from('escandallo_recipes')
    .select('id,local_id,name,notes,yield_qty,yield_label,created_at,updated_at')
    .eq('local_id', localId)
    .order('name');
  if (error) throw new Error(error.message);
  return ((data ?? []) as RecipeRow[]).map(mapRecipe);
}

export async function fetchEscandalloLines(
  supabase: SupabaseClient,
  localId: string,
  recipeId: string,
): Promise<EscandalloLine[]> {
  const { data, error } = await supabase
    .from('escandallo_recipe_lines')
    .select(
      'id,local_id,recipe_id,source_type,raw_supplier_product_id,processed_product_id,label,qty,unit,manual_price_per_unit,sort_order,created_at',
    )
    .eq('local_id', localId)
    .eq('recipe_id', recipeId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as LineRow[]).map(mapLine);
}

export async function fetchProductsForEscandallo(
  supabase: SupabaseClient,
  localId: string,
): Promise<EscandalloRawProduct[]> {
  const { data, error } = await supabase
    .from('pedido_supplier_products')
    .select('id,supplier_id,name,unit,price_per_unit,pedido_suppliers(name)')
    .eq('local_id', localId)
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawProductRow[]).map((r) => ({
    id: r.id,
    supplierId: r.supplier_id,
    supplierName: Array.isArray(r.pedido_suppliers) ? r.pedido_suppliers[0]?.name ?? '-' : r.pedido_suppliers?.name ?? '-',
    name: r.name,
    unit: r.unit as Unit,
    pricePerUnit: Number(r.price_per_unit),
  }));
}

export async function fetchProcessedProductsForEscandallo(
  supabase: SupabaseClient,
  localId: string,
): Promise<EscandalloProcessedProduct[]> {
  const { data, error } = await supabase
    .from('escandallo_processed_products')
    .select(
      'id,local_id,name,source_supplier_product_id,input_qty,output_qty,output_unit,extra_cost_eur,notes,created_at,updated_at',
    )
    .eq('local_id', localId)
    .order('name');
  if (error) throw new Error(error.message);
  return ((data ?? []) as ProcessedRow[]).map(mapProcessed);
}

export async function insertProcessedProductForEscandallo(
  supabase: SupabaseClient,
  localId: string,
  payload: {
    name: string;
    sourceSupplierProductId: string;
    inputQty: number;
    outputQty: number;
    outputUnit: Unit;
    extraCostEur?: number;
    notes?: string;
  },
): Promise<EscandalloProcessedProduct> {
  const { data, error } = await supabase
    .from('escandallo_processed_products')
    .insert({
      local_id: localId,
      name: payload.name.trim(),
      source_supplier_product_id: payload.sourceSupplierProductId,
      input_qty: Math.round(payload.inputQty * 10000) / 10000,
      output_qty: Math.round(payload.outputQty * 10000) / 10000,
      output_unit: payload.outputUnit,
      extra_cost_eur: Math.max(0, Math.round((payload.extraCostEur ?? 0) * 10000) / 10000),
      notes: (payload.notes ?? '').trim(),
    })
    .select(
      'id,local_id,name,source_supplier_product_id,input_qty,output_qty,output_unit,extra_cost_eur,notes,created_at,updated_at',
    )
    .single();
  if (error) throw new Error(error.message);
  return mapProcessed(data as ProcessedRow);
}

export async function deleteProcessedProductForEscandallo(
  supabase: SupabaseClient,
  localId: string,
  processedId: string,
): Promise<void> {
  const { error } = await supabase
    .from('escandallo_processed_products')
    .delete()
    .eq('id', processedId)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function insertEscandalloRecipe(
  supabase: SupabaseClient,
  localId: string,
  name: string,
  opts?: { notes?: string; yieldQty?: number; yieldLabel?: string },
): Promise<EscandalloRecipe> {
  const yieldQty = opts?.yieldQty != null && opts.yieldQty > 0 ? opts.yieldQty : 1;
  const { data, error } = await supabase
    .from('escandallo_recipes')
    .insert({
      local_id: localId,
      name: name.trim(),
      notes: (opts?.notes ?? '').trim(),
      yield_qty: Math.round(yieldQty * 100) / 100,
      yield_label: (opts?.yieldLabel ?? 'raciones').trim() || 'raciones',
    })
    .select('id,local_id,name,notes,yield_qty,yield_label,created_at,updated_at')
    .single();
  if (error) throw new Error(error.message);
  return mapRecipe(data as RecipeRow);
}

export async function updateEscandalloRecipe(
  supabase: SupabaseClient,
  localId: string,
  recipeId: string,
  patch: { name?: string; notes?: string; yieldQty?: number; yieldLabel?: string },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.notes !== undefined) row.notes = patch.notes.trim();
  if (patch.yieldQty !== undefined && patch.yieldQty > 0) row.yield_qty = Math.round(patch.yieldQty * 100) / 100;
  if (patch.yieldLabel !== undefined) row.yield_label = patch.yieldLabel.trim() || 'raciones';
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase
    .from('escandallo_recipes')
    .update(row)
    .eq('id', recipeId)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function deleteEscandalloRecipe(
  supabase: SupabaseClient,
  localId: string,
  recipeId: string,
): Promise<void> {
  const { error } = await supabase.from('escandallo_recipes').delete().eq('id', recipeId).eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function insertEscandalloLine(
  supabase: SupabaseClient,
  localId: string,
  recipeId: string,
  payload: {
    sourceType: 'raw' | 'processed' | 'manual';
    label: string;
    qty: number;
    unit: Unit;
    rawSupplierProductId?: string | null;
    processedProductId?: string | null;
    manualPricePerUnit?: number | null;
    sortOrder?: number;
  },
): Promise<EscandalloLine> {
  const { data, error } = await supabase
    .from('escandallo_recipe_lines')
    .insert({
      local_id: localId,
      recipe_id: recipeId,
      source_type: payload.sourceType,
      raw_supplier_product_id: payload.rawSupplierProductId ?? null,
      processed_product_id: payload.processedProductId ?? null,
      label: payload.label.trim(),
      qty: Math.max(0.0001, Math.round(payload.qty * 10000) / 10000),
      unit: payload.unit,
      manual_price_per_unit:
        payload.manualPricePerUnit != null && Number.isFinite(payload.manualPricePerUnit)
          ? Math.round(payload.manualPricePerUnit * 10000) / 10000
          : null,
      sort_order: payload.sortOrder ?? 0,
    })
    .select(
      'id,local_id,recipe_id,source_type,raw_supplier_product_id,processed_product_id,label,qty,unit,manual_price_per_unit,sort_order,created_at',
    )
    .single();
  if (error) throw new Error(error.message);
  return mapLine(data as LineRow);
}

export async function updateEscandalloLine(
  supabase: SupabaseClient,
  localId: string,
  lineId: string,
  patch: Partial<{
    label: string;
    qty: number;
    unit: Unit;
    sourceType: 'raw' | 'processed' | 'manual';
    rawSupplierProductId: string | null;
    processedProductId: string | null;
    manualPricePerUnit: number | null;
    sortOrder: number;
  }>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) row.label = patch.label.trim();
  if (patch.qty !== undefined && patch.qty > 0) row.qty = Math.round(patch.qty * 10000) / 10000;
  if (patch.unit !== undefined) row.unit = patch.unit;
  if (patch.sourceType !== undefined) row.source_type = patch.sourceType;
  if (patch.rawSupplierProductId !== undefined) row.raw_supplier_product_id = patch.rawSupplierProductId;
  if (patch.processedProductId !== undefined) row.processed_product_id = patch.processedProductId;
  if (patch.manualPricePerUnit !== undefined) {
    row.manual_price_per_unit =
      patch.manualPricePerUnit != null && Number.isFinite(patch.manualPricePerUnit)
        ? Math.round(patch.manualPricePerUnit * 10000) / 10000
        : null;
  }
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase
    .from('escandallo_recipe_lines')
    .update(row)
    .eq('id', lineId)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function deleteEscandalloLine(supabase: SupabaseClient, localId: string, lineId: string): Promise<void> {
  const { error } = await supabase.from('escandallo_recipe_lines').delete().eq('id', lineId).eq('local_id', localId);
  if (error) throw new Error(error.message);
}

/** Precio unitario efectivo para coste (producto del registro Mermas o precio manual). */
export function lineUnitPriceEur(
  line: EscandalloLine,
  rawProductById: Map<string, EscandalloRawProduct>,
  processedById: Map<string, EscandalloProcessedProduct>,
): number {
  if (line.sourceType === 'raw' && line.rawSupplierProductId) {
    const p = rawProductById.get(line.rawSupplierProductId);
    if (p) return p.pricePerUnit;
  }
  if (line.sourceType === 'processed' && line.processedProductId) {
    const p = processedById.get(line.processedProductId);
    if (p) {
      const raw = rawProductById.get(p.sourceSupplierProductId);
      if (!raw || p.outputQty <= 0) return 0;
      const totalInput = raw.pricePerUnit * p.inputQty + p.extraCostEur;
      return Math.round((totalInput / p.outputQty) * 10000) / 10000;
    }
  }
  if (line.manualPricePerUnit != null && Number.isFinite(line.manualPricePerUnit)) {
    return line.manualPricePerUnit;
  }
  return 0;
}

export function recipeTotalCostEur(
  lines: EscandalloLine[],
  rawProductById: Map<string, EscandalloRawProduct>,
  processedById: Map<string, EscandalloProcessedProduct>,
): number {
  let sum = 0;
  for (const line of lines) {
    sum += line.qty * lineUnitPriceEur(line, rawProductById, processedById);
  }
  return Math.round(sum * 100) / 100;
}
