import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeWeightedAvgBySupplierProductId,
  ESCANDALLOS_WEIGHTED_PRICE_WINDOW_DAYS,
} from '@/lib/escandallos-weighted-purchase-prices';
import {
  sanitizeEscandalloIngredientUnit,
  unitsMatchForIngredientCost,
  type EscandalloIngredientUnit,
} from '@/lib/escandallo-ingredient-units';
import { formatUnitPriceEur, roundMoney } from '@/lib/money-format';
import { resolveOperationalPrice, type OperationalPriceSource } from '@/lib/operational-price';
import { fetchPurchaseArticleCostHintsByIds } from '@/lib/purchase-articles-supabase';
import { fetchOrders } from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';

export type EscandalloRecipe = {
  id: string;
  localId: string;
  name: string;
  notes: string;
  yieldQty: number;
  yieldLabel: string;
  /** true = base / picadillo; false = plato principal en listado. */
  isSubRecipe: boolean;
  /** IVA % del PVP (ej. 10). null = no configurado. */
  saleVatRatePct: number | null;
  /** PVP con IVA por unidad de yield (ración). null = sin precio venta. */
  salePriceGrossEur: number | null;
  /** Código artículo en TPV (ej. 00042). null = sin enlace a export POS. */
  posArticleCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EscandalloLine = {
  id: string;
  localId: string;
  recipeId: string;
  sourceType: 'raw' | 'processed' | 'manual' | 'subrecipe';
  rawSupplierProductId: string | null;
  processedProductId: string | null;
  subRecipeId: string | null;
  label: string;
  qty: number;
  unit: EscandalloIngredientUnit;
  manualPricePerUnit: number | null;
  sortOrder: number;
  createdAt: string;
};

/** Contexto para costes con sub-recetas (picadillo → nachos). */
export type EscandalloRecipePriceContext = {
  linesByRecipe: Record<string, EscandalloLine[]>;
  recipesById: Map<string, EscandalloRecipe>;
  recipeId: string;
};

type LinePriceInnerContext = {
  linesByRecipe: Record<string, EscandalloLine[]>;
  recipesById: Map<string, EscandalloRecipe>;
  expanding: Set<string>;
};

export type EscandalloRawProduct = {
  id: string;
  supplierId: string;
  supplierName: string;
  name: string;
  unit: Unit;
  /**
   * Precio por unidad de pedido (envase, kg…) usado en costes.
   * Tras `fetchEscandalloRawProductsWithWeightedPurchasePrices`, si hay compras en ventana,
   * es el PMP (misma idea que Pedidos → Precios, modo €/ud); si no, el precio de ficha del catálogo.
   */
  pricePerUnit: number;
  /** Fuente aplicada al precio operativo del proveedor (PMP > último precio > sin precio). */
  operationalPriceSource?: OperationalPriceSource;
  /** Piezas de receta por cada unidad de pedido. 1 = el precio ya es €/unidad de receta. */
  unitsPerPack: number;
  /** Unidad en escandallo cuando unitsPerPack > 1. */
  recipeUnit: Unit | null;
  /** `purchase_articles.id` cuando el catálogo está enlazado. */
  articleId?: string | null;
  /**
   * Coste € por unidad de uso cocina (Artículo Master), si existe y coincide la unidad de la línea.
   * Fallback cuando no hay PMP ni último precio proveedor en `rawSupplierLineUnitPriceEur`.
   */
  internalCostPerUsageUnitEur?: number | null;
  /** Texto de `purchase_articles.unidad_uso` (debe coincidir con la unidad de la línea para aplicar coste interno). */
  internalUsageUnitLabel?: string | null;
};

export type EscandalloProcessedProduct = {
  id: string;
  localId: string;
  name: string;
  sourceSupplierProductId: string;
  inputQty: number;
  outputQty: number;
  outputUnit: EscandalloIngredientUnit;
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
  is_sub_recipe?: boolean | null;
  sale_vat_rate_pct?: number | null;
  sale_price_gross_eur?: number | null;
  pos_article_code?: string | null;
  created_at: string;
  updated_at: string;
};

type LineRow = {
  id: string;
  local_id: string;
  recipe_id: string;
  source_type: 'raw' | 'processed' | 'manual' | 'subrecipe' | null;
  raw_supplier_product_id: string | null;
  processed_product_id: string | null;
  sub_recipe_id: string | null;
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
  units_per_pack?: number | null;
  recipe_unit?: string | null;
  article_id?: string | null;
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
  const vat = row.sale_vat_rate_pct;
  const gross = row.sale_price_gross_eur;
  return {
    id: row.id,
    localId: row.local_id,
    name: row.name,
    notes: row.notes ?? '',
    yieldQty: Number(row.yield_qty),
    yieldLabel: row.yield_label ?? 'raciones',
    isSubRecipe: Boolean(row.is_sub_recipe),
    saleVatRatePct:
      vat != null && Number.isFinite(Number(vat)) ? Math.round(Number(vat) * 100) / 100 : null,
    salePriceGrossEur:
      gross != null && Number.isFinite(Number(gross)) && Number(gross) > 0
        ? Math.round(Number(gross) * 10000) / 10000
        : null,
    posArticleCode:
      row.pos_article_code != null && String(row.pos_article_code).trim() !== ''
        ? String(row.pos_article_code).trim()
        : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLine(row: LineRow): EscandalloLine {
  const rawSt = row.source_type ?? 'manual';
  const sourceType: EscandalloLine['sourceType'] =
    rawSt === 'raw' || rawSt === 'processed' || rawSt === 'manual' || rawSt === 'subrecipe' ? rawSt : 'manual';
  return {
    id: row.id,
    localId: row.local_id,
    recipeId: row.recipe_id,
    sourceType,
    rawSupplierProductId: row.raw_supplier_product_id,
    processedProductId: row.processed_product_id,
    subRecipeId: row.sub_recipe_id ?? null,
    label: row.label,
    qty: Number(row.qty),
    unit: sanitizeEscandalloIngredientUnit(String(row.unit)),
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
    outputUnit: sanitizeEscandalloIngredientUnit(String(row.output_unit)),
    extraCostEur: Number(row.extra_cost_eur ?? 0),
    notes: row.notes ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchEscandalloRecipes(supabase: SupabaseClient, localId: string): Promise<EscandalloRecipe[]> {
  const { data, error } = await supabase
    .from('escandallo_recipes')
    .select(
      'id,local_id,name,notes,yield_qty,yield_label,is_sub_recipe,sale_vat_rate_pct,sale_price_gross_eur,pos_article_code,created_at,updated_at',
    )
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
      'id,local_id,recipe_id,source_type,raw_supplier_product_id,processed_product_id,sub_recipe_id,label,qty,unit,manual_price_per_unit,sort_order,created_at',
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
    .select('id,supplier_id,name,unit,price_per_unit,units_per_pack,recipe_unit,article_id,pedido_suppliers(name)')
    .eq('local_id', localId)
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawProductRow[]).map((r) => {
    const packRaw = r.units_per_pack != null ? Number(r.units_per_pack) : 1;
    const unitsPerPack = Number.isFinite(packRaw) && packRaw > 0 ? packRaw : 1;
    const recipeUnit: Unit | null =
      unitsPerPack > 1 && r.recipe_unit != null && String(r.recipe_unit).trim() !== ''
        ? (String(r.recipe_unit) as Unit)
        : null;
    const supplierPrice = Number(r.price_per_unit);
    const { price, source } = resolveOperationalPrice({ supplierLastPrice: supplierPrice });
    return {
      id: r.id,
      supplierId: r.supplier_id,
      supplierName: Array.isArray(r.pedido_suppliers) ? r.pedido_suppliers[0]?.name ?? '-' : r.pedido_suppliers?.name ?? '-',
      name: r.name,
      unit: r.unit as Unit,
      pricePerUnit: price ?? 0,
      operationalPriceSource: source,
      unitsPerPack,
      recipeUnit,
      articleId: r.article_id != null ? String(r.article_id) : null,
    };
  });
}

/**
 * Productos de proveedor para escandallo con **precio medio ponderado** de compras (últimos
 * `ESCANDALLOS_WEIGHTED_PRICE_WINDOW_DAYS` días) cuando la línea de pedido lleva `supplier_product_id`
 * y hay cantidad facturada; si no hay datos, se usa el `price_per_unit` del catálogo.
 */
export async function fetchEscandalloRawProductsWithWeightedPurchasePrices(
  supabase: SupabaseClient,
  localId: string,
): Promise<EscandalloRawProduct[]> {
  const [products, orders] = await Promise.all([
    fetchProductsForEscandallo(supabase, localId),
    fetchOrders(supabase, localId, { recentDays: 120 }),
  ]);
  const weighted = computeWeightedAvgBySupplierProductId(
    orders.filter((o) => o.status !== 'draft'),
    ESCANDALLOS_WEIGHTED_PRICE_WINDOW_DAYS,
  );
  const withPmp = products.map((p) => {
    const w = weighted.get(p.id);
    const resolved = resolveOperationalPrice({
      pmpPrice: w != null && w.weightedQty > 0 ? w.weightedAvg : null,
      supplierLastPrice: p.pricePerUnit,
    });
    return { ...p, pricePerUnit: resolved.price ?? 0, operationalPriceSource: resolved.source };
  });
  const articleIds = withPmp.map((p) => p.articleId).filter((x): x is string => Boolean(x));
  const hints = await fetchPurchaseArticleCostHintsByIds(supabase, localId, articleIds);
  return withPmp.map((p) => {
    if (!p.articleId) return p;
    const h = hints.get(p.articleId);
    if (!h) return p;
    const label = h.unidadUso?.trim().replace(/\s+/g, ' ') ?? '';
    if (!label) return p;
    const next: EscandalloRawProduct = { ...p, internalUsageUnitLabel: label };
    if (h.costeUnitarioUso != null && Number.isFinite(h.costeUnitarioUso)) {
      return { ...next, internalCostPerUsageUnitEur: h.costeUnitarioUso };
    }
    return next;
  });
}

/** Unidad en la que se expresa la cantidad del ingrediente en escandallo (p. ej. ud sueltas si la compra es por caja). */
export function escandalloRecipeUnitForRawProduct(p: EscandalloRawProduct): EscandalloIngredientUnit {
  const master = p.internalUsageUnitLabel?.trim();
  if (master) return sanitizeEscandalloIngredientUnit(master);
  const n = p.unitsPerPack > 0 ? p.unitsPerPack : 1;
  if (n > 1) return sanitizeEscandalloIngredientUnit(String(p.recipeUnit ?? 'ud'));
  return sanitizeEscandalloIngredientUnit(String(p.unit));
}

/** € por unidad de receta (o € por unidad de compra si la línea va en envases). */
export function rawSupplierLineUnitPriceEur(line: EscandalloLine, p: EscandalloRawProduct): number {
  const packSize = p.unitsPerPack > 0 ? p.unitsPerPack : 1;
  const purchaseUnit = String(p.unit);
  const perUsageFromPack = packSize > 0 ? p.pricePerUnit / packSize : p.pricePerUnit;
  const operational = resolveOperationalPrice({
    pmpPrice: p.operationalPriceSource === 'pmp' ? p.pricePerUnit : null,
    supplierLastPrice: p.operationalPriceSource !== 'pmp' ? p.pricePerUnit : null,
    articleMasterPrice: p.internalCostPerUsageUnitEur ?? null,
  });

  const internalLooksValid =
    p.internalCostPerUsageUnitEur != null &&
    Number.isFinite(p.internalCostPerUsageUnitEur) &&
    p.internalUsageUnitLabel &&
    unitsMatchForIngredientCost(line.unit, p.internalUsageUnitLabel) &&
    !(packSize > 1 && p.internalCostPerUsageUnitEur > p.pricePerUnit + 1e-6);

  if (operational.source === 'pmp' || operational.source === 'ultimo_precio') {
    if (unitsMatchForIngredientCost(line.unit, purchaseUnit)) {
      return roundMoney(p.pricePerUnit);
    }
    if (packSize > 1) {
      return roundMoney(perUsageFromPack);
    }
    return roundMoney(p.pricePerUnit);
  }

  if (internalLooksValid && p.internalCostPerUsageUnitEur != null) {
    return roundMoney(p.internalCostPerUsageUnitEur);
  }
  return 0;
}

export function rawProductPickerSummaryLine(p: EscandalloRawProduct): string {
  const pack = p.unitsPerPack > 0 ? p.unitsPerPack : 1;
  const base = `${p.supplierName} · ${p.name}`;
  if (pack > 1) {
    const ru = p.recipeUnit ?? 'ud';
    const each = roundMoney(p.pricePerUnit / pack);
    return `${base} (compra ${formatUnitPriceEur(p.pricePerUnit, p.unit)} · coste uso ${formatUnitPriceEur(each, ru)} · ×${pack})`;
  }
  return `${base} (${formatUnitPriceEur(p.pricePerUnit, p.unit)})`;
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
    outputUnit: EscandalloIngredientUnit;
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
      output_unit: sanitizeEscandalloIngredientUnit(payload.outputUnit),
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
  opts?: {
    notes?: string;
    yieldQty?: number;
    yieldLabel?: string;
    isSubRecipe?: boolean;
    saleVatRatePct?: number | null;
    salePriceGrossEur?: number | null;
    posArticleCode?: string | null;
  },
): Promise<EscandalloRecipe> {
  const yieldQty = opts?.yieldQty != null && opts.yieldQty > 0 ? opts.yieldQty : 1;
  const row: Record<string, unknown> = {
    local_id: localId,
    name: name.trim(),
    notes: (opts?.notes ?? '').trim(),
    yield_qty: Math.round(yieldQty * 100) / 100,
    yield_label: (opts?.yieldLabel ?? 'raciones').trim() || 'raciones',
    is_sub_recipe: opts?.isSubRecipe ?? false,
  };
  if (opts?.saleVatRatePct != null && Number.isFinite(opts.saleVatRatePct)) {
    row.sale_vat_rate_pct = Math.round(opts.saleVatRatePct * 100) / 100;
  }
  if (opts?.salePriceGrossEur != null && Number.isFinite(opts.salePriceGrossEur) && opts.salePriceGrossEur > 0) {
    row.sale_price_gross_eur = Math.round(opts.salePriceGrossEur * 10000) / 10000;
  }
  if (opts?.posArticleCode !== undefined) {
    const c = opts.posArticleCode?.trim() ?? '';
    row.pos_article_code = c === '' ? null : c;
  }
  const { data, error } = await supabase
    .from('escandallo_recipes')
    .insert(row)
    .select(
      'id,local_id,name,notes,yield_qty,yield_label,is_sub_recipe,sale_vat_rate_pct,sale_price_gross_eur,pos_article_code,created_at,updated_at',
    )
    .single();
  if (error) throw new Error(error.message);
  return mapRecipe(data as RecipeRow);
}

export async function updateEscandalloRecipe(
  supabase: SupabaseClient,
  localId: string,
  recipeId: string,
  patch: {
    name?: string;
    notes?: string;
    yieldQty?: number;
    yieldLabel?: string;
    isSubRecipe?: boolean;
    saleVatRatePct?: number | null;
    salePriceGrossEur?: number | null;
    posArticleCode?: string | null;
  },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.notes !== undefined) row.notes = patch.notes.trim();
  if (patch.yieldQty !== undefined && patch.yieldQty > 0) row.yield_qty = Math.round(patch.yieldQty * 100) / 100;
  if (patch.yieldLabel !== undefined) row.yield_label = patch.yieldLabel.trim() || 'raciones';
  if (patch.isSubRecipe !== undefined) row.is_sub_recipe = patch.isSubRecipe;
  if (patch.saleVatRatePct !== undefined) {
    row.sale_vat_rate_pct =
      patch.saleVatRatePct != null && Number.isFinite(patch.saleVatRatePct)
        ? Math.round(patch.saleVatRatePct * 100) / 100
        : null;
  }
  if (patch.salePriceGrossEur !== undefined) {
    row.sale_price_gross_eur =
      patch.salePriceGrossEur != null && Number.isFinite(patch.salePriceGrossEur) && patch.salePriceGrossEur > 0
        ? Math.round(patch.salePriceGrossEur * 10000) / 10000
        : null;
  }
  if (patch.posArticleCode !== undefined) {
    const c = patch.posArticleCode?.trim() ?? '';
    row.pos_article_code = c === '' ? null : c;
  }
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
    sourceType: 'raw' | 'processed' | 'manual' | 'subrecipe';
    label: string;
    qty: number;
    unit: EscandalloIngredientUnit;
    rawSupplierProductId?: string | null;
    processedProductId?: string | null;
    subRecipeId?: string | null;
    manualPricePerUnit?: number | null;
    sortOrder?: number;
  },
): Promise<EscandalloLine> {
  if (payload.sourceType === 'subrecipe' && payload.subRecipeId === recipeId) {
    throw new Error('Una receta no puede incluirse a sí misma como sub-receta.');
  }
  const { data, error } = await supabase
    .from('escandallo_recipe_lines')
    .insert({
      local_id: localId,
      recipe_id: recipeId,
      source_type: payload.sourceType,
      raw_supplier_product_id:
        payload.sourceType === 'raw' ? (payload.rawSupplierProductId ?? null) : null,
      processed_product_id:
        payload.sourceType === 'processed' ? (payload.processedProductId ?? null) : null,
      sub_recipe_id: payload.sourceType === 'subrecipe' ? (payload.subRecipeId ?? null) : null,
      label: payload.label.trim(),
      qty: Math.max(0.0001, Math.round(payload.qty * 10000) / 10000),
      unit: sanitizeEscandalloIngredientUnit(payload.unit),
      manual_price_per_unit:
        payload.sourceType === 'manual' &&
        payload.manualPricePerUnit != null &&
        Number.isFinite(payload.manualPricePerUnit)
          ? Math.round(payload.manualPricePerUnit * 10000) / 10000
          : null,
      sort_order: payload.sortOrder ?? 0,
    })
    .select(
      'id,local_id,recipe_id,source_type,raw_supplier_product_id,processed_product_id,sub_recipe_id,label,qty,unit,manual_price_per_unit,sort_order,created_at',
    )
    .single();
  if (error) throw new Error(error.message);
  return mapLine(data as LineRow);
}

export type EscandalloLineInsertPayload = {
  sourceType: 'raw' | 'processed' | 'manual' | 'subrecipe';
  label: string;
  qty: number;
  unit: EscandalloIngredientUnit;
  rawSupplierProductId?: string | null;
  processedProductId?: string | null;
  subRecipeId?: string | null;
  manualPricePerUnit?: number | null;
};

export async function insertEscandalloLinesBatch(
  supabase: SupabaseClient,
  localId: string,
  recipeId: string,
  payloads: EscandalloLineInsertPayload[],
  startSortOrder: number,
): Promise<EscandalloLine[]> {
  if (payloads.length === 0) return [];
  const rows = payloads.map((payload, i) => {
    if (payload.sourceType === 'subrecipe' && payload.subRecipeId === recipeId) {
      throw new Error('Una receta no puede incluirse a sí misma como sub-receta.');
    }
    return {
      local_id: localId,
      recipe_id: recipeId,
      source_type: payload.sourceType,
      raw_supplier_product_id:
        payload.sourceType === 'raw' ? (payload.rawSupplierProductId ?? null) : null,
      processed_product_id:
        payload.sourceType === 'processed' ? (payload.processedProductId ?? null) : null,
      sub_recipe_id: payload.sourceType === 'subrecipe' ? (payload.subRecipeId ?? null) : null,
      label: payload.label.trim(),
      qty: Math.max(0.0001, Math.round(payload.qty * 10000) / 10000),
      unit: sanitizeEscandalloIngredientUnit(payload.unit),
      manual_price_per_unit:
        payload.sourceType === 'manual' &&
        payload.manualPricePerUnit != null &&
        Number.isFinite(payload.manualPricePerUnit)
          ? Math.round(payload.manualPricePerUnit * 10000) / 10000
          : null,
      sort_order: startSortOrder + i,
    };
  });
  const { data, error } = await supabase
    .from('escandallo_recipe_lines')
    .insert(rows)
    .select(
      'id,local_id,recipe_id,source_type,raw_supplier_product_id,processed_product_id,sub_recipe_id,label,qty,unit,manual_price_per_unit,sort_order,created_at',
    );
  if (error) throw new Error(error.message);
  return ((data ?? []) as LineRow[]).map(mapLine);
}

export async function updateEscandalloLine(
  supabase: SupabaseClient,
  localId: string,
  lineId: string,
  patch: Partial<{
    label: string;
    qty: number;
    unit: EscandalloIngredientUnit;
    sourceType: 'raw' | 'processed' | 'manual' | 'subrecipe';
    rawSupplierProductId: string | null;
    processedProductId: string | null;
    subRecipeId: string | null;
    manualPricePerUnit: number | null;
    sortOrder: number;
  }>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) row.label = patch.label.trim();
  if (patch.qty !== undefined && patch.qty > 0) row.qty = Math.round(patch.qty * 10000) / 10000;
  if (patch.unit !== undefined) row.unit = sanitizeEscandalloIngredientUnit(patch.unit);
  if (patch.sourceType !== undefined) row.source_type = patch.sourceType;
  if (patch.rawSupplierProductId !== undefined) row.raw_supplier_product_id = patch.rawSupplierProductId;
  if (patch.processedProductId !== undefined) row.processed_product_id = patch.processedProductId;
  if (patch.subRecipeId !== undefined) row.sub_recipe_id = patch.subRecipeId;
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

function recipeLinesTotalRecursive(
  recipeId: string,
  linesByRecipe: Record<string, EscandalloLine[]>,
  recipesById: Map<string, EscandalloRecipe>,
  rawProductById: Map<string, EscandalloRawProduct>,
  processedById: Map<string, EscandalloProcessedProduct>,
  expanding: Set<string>,
): number {
  if (expanding.has(recipeId)) return 0;
  expanding.add(recipeId);
  let sum = 0;
  for (const line of linesByRecipe[recipeId] ?? []) {
    sum += line.qty * lineUnitPriceEur(line, rawProductById, processedById, {
      linesByRecipe,
      recipesById,
      expanding,
    });
  }
  expanding.delete(recipeId);
  return Math.round(sum * 100) / 100;
}

/** Precio unitario efectivo para coste (crudo, elaborado 1-ingrediente, sub-receta o manual). */
export function lineUnitPriceEur(
  line: EscandalloLine,
  rawProductById: Map<string, EscandalloRawProduct>,
  processedById: Map<string, EscandalloProcessedProduct>,
  innerCtx?: LinePriceInnerContext,
): number {
  if (line.sourceType === 'subrecipe' && line.subRecipeId && innerCtx) {
    const sub = innerCtx.recipesById.get(line.subRecipeId);
    if (!sub || sub.yieldQty <= 0) return 0;
    const total = recipeLinesTotalRecursive(
      line.subRecipeId,
      innerCtx.linesByRecipe,
      innerCtx.recipesById,
      rawProductById,
      processedById,
      innerCtx.expanding,
    );
    return roundMoney(total / sub.yieldQty);
  }
  if (line.sourceType === 'raw' && line.rawSupplierProductId) {
    const p = rawProductById.get(line.rawSupplierProductId);
    if (p) return rawSupplierLineUnitPriceEur(line, p);
  }
  if (line.sourceType === 'processed' && line.processedProductId) {
    const p = processedById.get(line.processedProductId);
    if (p) {
      const raw = rawProductById.get(p.sourceSupplierProductId);
      if (!raw || p.outputQty <= 0) return 0;
      const unitRaw = rawSupplierLineUnitPriceEur(
        {
          ...line,
          sourceType: 'raw',
          rawSupplierProductId: raw.id,
          unit: raw.unit as string,
          qty: p.inputQty,
        },
        raw,
      );
      const totalInput = unitRaw * p.inputQty + p.extraCostEur;
      return roundMoney(totalInput / p.outputQty);
    }
  }
  if (line.sourceType === 'manual' && line.manualPricePerUnit != null && Number.isFinite(line.manualPricePerUnit)) {
    return line.manualPricePerUnit;
  }
  return 0;
}

export function recipeTotalCostEur(
  lines: EscandalloLine[],
  rawProductById: Map<string, EscandalloRawProduct>,
  processedById: Map<string, EscandalloProcessedProduct>,
  ctx?: EscandalloRecipePriceContext,
): number {
  const expanding = new Set<string>();
  if (ctx) expanding.add(ctx.recipeId);
  const innerCtx: LinePriceInnerContext | undefined = ctx
    ? { linesByRecipe: ctx.linesByRecipe, recipesById: ctx.recipesById, expanding }
    : undefined;
  let sum = 0;
  for (const line of lines) {
    sum += line.qty * lineUnitPriceEur(line, rawProductById, processedById, innerCtx);
  }
  return Math.round(sum * 100) / 100;
}

/** Precio neto (sin IVA) por unidad de venta, a partir del PVP con IVA. */
export function saleNetPerUnitFromGross(grossEur: number, vatRatePct: number): number {
  const v = Math.max(0, vatRatePct);
  const denom = 1 + v / 100;
  if (denom <= 0 || !Number.isFinite(grossEur)) return 0;
  return Math.round((grossEur / denom) * 10000) / 10000;
}

/**
 * Food cost % sobre venta neta: (coste por unidad de yield / precio neto por unidad) × 100.
 * Referencia orientativa: &lt;30 % suele ser cómodo; 30–35 % revisar; &gt;35 % ajustar carta o precios.
 */
export function foodCostPercentOfNetSale(
  recipeTotalCostEur: number,
  yieldQty: number,
  saleNetPerUnit: number | null,
): number | null {
  if (saleNetPerUnit == null || saleNetPerUnit <= 0 || yieldQty <= 0) return null;
  const costPerUnit = recipeTotalCostEur / yieldQty;
  if (costPerUnit < 0) return null;
  return Math.round((costPerUnit / saleNetPerUnit) * 10000) / 100;
}

export type EscandalloMonthlySale = {
  id: string;
  localId: string;
  yearMonth: string;
  recipeId: string;
  quantitySold: number;
  createdAt: string;
  updatedAt: string;
};

type MonthlySaleRow = {
  id: string;
  local_id: string;
  year_month: string;
  recipe_id: string;
  quantity_sold: number;
  created_at: string;
  updated_at: string;
};

function mapMonthlySale(row: MonthlySaleRow): EscandalloMonthlySale {
  return {
    id: row.id,
    localId: row.local_id,
    yearMonth: row.year_month,
    recipeId: row.recipe_id,
    quantitySold: Number(row.quantity_sold),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchEscandalloMonthlySales(
  supabase: SupabaseClient,
  localId: string,
  yearMonth: string,
): Promise<EscandalloMonthlySale[]> {
  const { data, error } = await supabase
    .from('escandallo_monthly_sales')
    .select('id,local_id,year_month,recipe_id,quantity_sold,created_at,updated_at')
    .eq('local_id', localId)
    .eq('year_month', yearMonth);
  if (error) throw new Error(error.message);
  return ((data ?? []) as MonthlySaleRow[]).map(mapMonthlySale);
}

export async function upsertEscandalloMonthlySalesBatch(
  supabase: SupabaseClient,
  localId: string,
  yearMonth: string,
  rows: { recipeId: string; quantitySold: number }[],
): Promise<void> {
  const ym = yearMonth.trim();
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error('Mes inválido (usa YYYY-MM).');
  const payload = rows
    .filter((r) => r.recipeId && Number.isFinite(r.quantitySold) && r.quantitySold >= 0)
    .map((r) => ({
      local_id: localId,
      year_month: ym,
      recipe_id: r.recipeId,
      quantity_sold: Math.round(Math.min(1e9, r.quantitySold) * 100) / 100,
    }));
  if (payload.length === 0) return;
  const { error } = await supabase.from('escandallo_monthly_sales').upsert(payload, {
    onConflict: 'local_id,year_month,recipe_id',
  });
  if (error) throw new Error(error.message);
}
