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
  productId: string | null;
  label: string;
  qty: number;
  unit: Unit;
  manualPricePerUnit: number | null;
  sortOrder: number;
  createdAt: string;
};

export type EscandalloProductPick = {
  id: string;
  name: string;
  unit: Unit;
  pricePerUnit: number;
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
  product_id: string | null;
  label: string;
  qty: number;
  unit: string;
  manual_price_per_unit: number | null;
  sort_order: number;
  created_at: string;
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
    productId: row.product_id,
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
      'id,local_id,recipe_id,product_id,label,qty,unit,manual_price_per_unit,sort_order,created_at',
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
): Promise<EscandalloProductPick[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id,name,unit,price_per_unit')
    .eq('local_id', localId)
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { id: string; name: string; unit: string; price_per_unit: number }) => ({
    id: r.id,
    name: r.name,
    unit: r.unit as Unit,
    pricePerUnit: Number(r.price_per_unit),
  }));
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
    label: string;
    qty: number;
    unit: Unit;
    productId?: string | null;
    manualPricePerUnit?: number | null;
    sortOrder?: number;
  },
): Promise<EscandalloLine> {
  const { data, error } = await supabase
    .from('escandallo_recipe_lines')
    .insert({
      local_id: localId,
      recipe_id: recipeId,
      product_id: payload.productId ?? null,
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
      'id,local_id,recipe_id,product_id,label,qty,unit,manual_price_per_unit,sort_order,created_at',
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
    productId: string | null;
    manualPricePerUnit: number | null;
    sortOrder: number;
  }>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) row.label = patch.label.trim();
  if (patch.qty !== undefined && patch.qty > 0) row.qty = Math.round(patch.qty * 10000) / 10000;
  if (patch.unit !== undefined) row.unit = patch.unit;
  if (patch.productId !== undefined) row.product_id = patch.productId;
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
  productById: Map<string, EscandalloProductPick>,
): number {
  if (line.productId) {
    const p = productById.get(line.productId);
    if (p) return p.pricePerUnit;
  }
  if (line.manualPricePerUnit != null && Number.isFinite(line.manualPricePerUnit)) {
    return line.manualPricePerUnit;
  }
  return 0;
}

export function recipeTotalCostEur(lines: EscandalloLine[], productById: Map<string, EscandalloProductPick>): number {
  let sum = 0;
  for (const line of lines) {
    sum += line.qty * lineUnitPriceEur(line, productById);
  }
  return Math.round(sum * 100) / 100;
}
