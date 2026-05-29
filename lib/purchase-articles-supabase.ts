import type { SupabaseClient } from '@supabase/supabase-js';
import { validateEscandalloUsageUnitInput } from '@/lib/escandallo-ingredient-units';
import type { VolumeConversionUnit, WeightConversionUnit } from '@/lib/escandallo-input-weight';

export type PurchaseArticle = {
  id: string;
  localId: string;
  nombre: string;
  nombreCorto: string | null;
  categoria: string | null;
  subcategoria: string | null;
  descripcion: string | null;
  unidadBase: string | null;
  activo: boolean;
  costeMaster: number | null;
  metodoCosteMaster: string | null;
  costeMasterFijadoEn: string | null;
  proveedorPreferidoId: string | null;
  observaciones: string;
  createdFromSupplierProductId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Catálogo proveedor de referencia para coste de compra (ejecutar migración SQL v2). */
  referenciaPrincipalSupplierProductId: string | null;
  unidadCompra: string | null;
  costeCompraActual: number | null;
  ivaCompraPct: number | null;
  /** Unidad de uso cocina (misma nomenclatura que escandallos: kg, ud, racion…). */
  unidadUso: string | null;
  unidadesUsoPorUnidadCompra: number | null;
  rendimientoPct: number | null;
  /** € por `unidad_uso`; recalculado en BD al cambiar compra o conversión. */
  costeUnitarioUso: number | null;
  origenCoste: string | null;
  /** proveedor: compra/catálogo. cocina_central: coste desde fórmula interna (sin receta en UI máster). */
  origenArticulo: 'proveedor' | 'cocina_central';
  centralProductionRecipeId: string | null;
  centralCostSyncedAt: string | null;
  /** Nuevo motor universal inventario: unidad/coste base (origen real del coste). */
  unidadBaseCoste: 'kg' | 'l' | 'ud' | null;
  costeBase: number | null;
  formatoCompraNombre: string | null;
  cantidadPorFormato: number | null;
  unidadPorFormato: 'kg' | 'l' | 'ud' | null;
  /** Equivalencia opcional por artículo para convertir volumen usado en escandallos a peso de entrada. */
  conversionToWeightEnabled: boolean;
  conversionWeightUnit: WeightConversionUnit | null;
  conversionVolumeUnit: VolumeConversionUnit | null;
  conversionFactor: number | null;
  technicalFileUrl: string | null;
  technicalFileName: string | null;
  technicalFileType: string | null;
  technicalFileSize: number | null;
};

export type PurchaseArticleCostHint = {
  costeUnitarioUso: number | null;
  unidadUso: string | null;
  conversionToWeightEnabled: boolean;
  conversionWeightUnit: WeightConversionUnit | null;
  conversionVolumeUnit: VolumeConversionUnit | null;
  conversionFactor: number | null;
};

export type ArticleUsageFormat = {
  id: string;
  articleId: string;
  organizationId: string | null;
  name: string;
  usageUnit: string;
  piecesPerPurchaseUnit: number | null;
  weightPerPiece: number | null;
  weightUnit: string | null;
  costPerUsageUnit: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ArticleUsageFormatInput = {
  name: string;
  usageUnit: string;
  piecesPerPurchaseUnit?: number | null;
  weightPerPiece?: number | null;
  weightUnit?: string | null;
  costPerUsageUnit: number;
  isDefault?: boolean;
};

export type PurchaseArticleDuplicateCandidate = {
  articleIdA: string;
  articleIdB: string;
  localId: string;
  nombreA: string;
  nombreB: string;
  score: number;
};

/** Fila de catálogo proveedor enlazada a un artículo (misma `article_id`). */
export type SupplierCatalogRow = {
  id: string;
  supplierId: string;
  supplierName: string;
  articleId: string | null;
  name: string;
  unit: string;
  pricePerUnit: number;
  billingUnit: string | null;
  billingQtyPerOrderUnit: number | null;
  pricePerBillingUnit: number | null;
  isActive: boolean;
};

export function labelMetodoCosteMaster(code: string | null | undefined): string {
  if (!code) return 'No indicado';
  const c = code.trim().toLowerCase();
  if (c === 'migrado') return 'Migración inicial';
  if (c === 'alta_proveedor') return 'Alta en catálogo proveedor';
  if (c === 'cocina_central') return 'Cocina Central';
  return code;
}

function mapArticleUsageFormatRow(row: Record<string, unknown>): ArticleUsageFormat {
  return {
    id: String(row.id),
    articleId: String(row.article_id),
    organizationId: row.organization_id != null ? String(row.organization_id) : null,
    name: String(row.name ?? ''),
    usageUnit: String(row.usage_unit ?? ''),
    piecesPerPurchaseUnit:
      row.pieces_per_purchase_unit != null && Number.isFinite(Number(row.pieces_per_purchase_unit))
        ? Number(row.pieces_per_purchase_unit)
        : null,
    weightPerPiece:
      row.weight_per_piece != null && Number.isFinite(Number(row.weight_per_piece))
        ? Number(row.weight_per_piece)
        : null,
    weightUnit: row.weight_unit != null ? String(row.weight_unit) : null,
    costPerUsageUnit:
      row.cost_per_usage_unit != null && Number.isFinite(Number(row.cost_per_usage_unit))
        ? Number(row.cost_per_usage_unit)
        : 0,
    isDefault: Boolean(row.is_default),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function articleUsageFormatRow(input: ArticleUsageFormatInput): Record<string, unknown> {
  const name = input.name.trim().replace(/\s+/g, ' ');
  const usageUnit = input.usageUnit.trim().replace(/\s+/g, ' ');
  const weightUnit = input.weightUnit?.trim().replace(/\s+/g, ' ') || null;
  if (!name) throw new Error('Indica el nombre del formato.');
  const unitError = validateEscandalloUsageUnitInput(usageUnit);
  if (unitError) throw new Error(unitError);
  if (input.costPerUsageUnit == null || !Number.isFinite(input.costPerUsageUnit) || input.costPerUsageUnit < 0) {
    throw new Error('Coste por unidad de uso no válido.');
  }
  if (
    input.piecesPerPurchaseUnit != null &&
    (!Number.isFinite(input.piecesPerPurchaseUnit) || input.piecesPerPurchaseUnit <= 0)
  ) {
    throw new Error('Piezas por unidad de compra debe ser mayor que 0.');
  }
  if (input.weightPerPiece != null && (!Number.isFinite(input.weightPerPiece) || input.weightPerPiece <= 0)) {
    throw new Error('Peso por pieza debe ser mayor que 0.');
  }
  return {
    name,
    usage_unit: usageUnit,
    pieces_per_purchase_unit:
      input.piecesPerPurchaseUnit != null ? Math.round(input.piecesPerPurchaseUnit * 10000) / 10000 : null,
    weight_per_piece: input.weightPerPiece != null ? Math.round(input.weightPerPiece * 10000) / 10000 : null,
    weight_unit: weightUnit,
    cost_per_usage_unit: Math.round(input.costPerUsageUnit * 1000000) / 1000000,
    is_default: Boolean(input.isDefault),
  };
}

export async function fetchArticleUsageFormats(
  supabase: SupabaseClient,
  articleIds: string[],
): Promise<Map<string, ArticleUsageFormat[]>> {
  const map = new Map<string, ArticleUsageFormat[]>();
  const uniq = [...new Set(articleIds)].filter(Boolean);
  if (!uniq.length) return map;
  try {
    const { data, error } = await supabase
      .from('article_usage_formats')
      .select(
        'id,article_id,organization_id,name,usage_unit,pieces_per_purchase_unit,weight_per_piece,weight_unit,cost_per_usage_unit,is_default,created_at,updated_at',
      )
      .in('article_id', uniq)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true });
    if (error) return map;
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const f = mapArticleUsageFormatRow(row);
      const list = map.get(f.articleId) ?? [];
      list.push(f);
      map.set(f.articleId, list);
    }
  } catch {
    return map;
  }
  return map;
}

export async function createArticleUsageFormat(
  supabase: SupabaseClient,
  articleId: string,
  input: ArticleUsageFormatInput,
): Promise<ArticleUsageFormat> {
  const row: Record<string, unknown> = { article_id: articleId, ...articleUsageFormatRow(input) };
  if (row.is_default) {
    await supabase.from('article_usage_formats').update({ is_default: false }).eq('article_id', articleId);
  }
  const { data, error } = await supabase
    .from('article_usage_formats')
    .insert(row)
    .select(
      'id,article_id,organization_id,name,usage_unit,pieces_per_purchase_unit,weight_per_piece,weight_unit,cost_per_usage_unit,is_default,created_at,updated_at',
    )
    .single();
  if (error) throw new Error(error.message);
  return mapArticleUsageFormatRow(data as Record<string, unknown>);
}

export async function updateArticleUsageFormat(
  supabase: SupabaseClient,
  articleId: string,
  formatId: string,
  input: ArticleUsageFormatInput,
): Promise<ArticleUsageFormat> {
  const row = articleUsageFormatRow(input);
  if (row.is_default) {
    await supabase
      .from('article_usage_formats')
      .update({ is_default: false })
      .eq('article_id', articleId)
      .neq('id', formatId);
  }
  const { data, error } = await supabase
    .from('article_usage_formats')
    .update(row)
    .eq('id', formatId)
    .eq('article_id', articleId)
    .select(
      'id,article_id,organization_id,name,usage_unit,pieces_per_purchase_unit,weight_per_piece,weight_unit,cost_per_usage_unit,is_default,created_at,updated_at',
    )
    .single();
  if (error) throw new Error(error.message);
  return mapArticleUsageFormatRow(data as Record<string, unknown>);
}

export async function deleteArticleUsageFormat(
  supabase: SupabaseClient,
  articleId: string,
  formatId: string,
): Promise<void> {
  const { error } = await supabase
    .from('article_usage_formats')
    .delete()
    .eq('id', formatId)
    .eq('article_id', articleId);
  if (error) throw new Error(error.message);
}

const SUPPLIER_CATALOG_SELECT =
  'id,supplier_id,article_id,name,unit,price_per_unit,billing_unit,billing_qty_per_order_unit,price_per_billing_unit,is_active,pedido_suppliers(name)';

function mapPedidoSupplierProductToCatalogRow(
  row: Record<string, unknown>,
  articleIdOverride?: string,
): SupplierCatalogRow | null {
  const articleId =
    articleIdOverride ?? (row.article_id != null ? String(row.article_id) : null);
  if (!articleId) return null;
  const sup = row.pedido_suppliers;
  let supplierName = '';
  if (Array.isArray(sup)) {
    supplierName = String((sup[0] as { name?: string } | undefined)?.name ?? '');
  } else if (sup && typeof sup === 'object' && 'name' in sup) {
    supplierName = String((sup as { name: string }).name ?? '');
  }
  return {
    id: String(row.id),
    supplierId: String(row.supplier_id),
    supplierName,
    articleId,
    name: String(row.name ?? ''),
    unit: String(row.unit ?? ''),
    pricePerUnit: Number(row.price_per_unit ?? 0),
    billingUnit: row.billing_unit != null ? String(row.billing_unit) : null,
    billingQtyPerOrderUnit:
      row.billing_qty_per_order_unit != null && Number.isFinite(Number(row.billing_qty_per_order_unit))
        ? Number(row.billing_qty_per_order_unit)
        : null,
    pricePerBillingUnit:
      row.price_per_billing_unit != null && Number.isFinite(Number(row.price_per_billing_unit))
        ? Number(row.price_per_billing_unit)
        : null,
    isActive: Boolean(row.is_active),
  };
}

function sortSupplierCatalogRows(list: SupplierCatalogRow[]): void {
  list.sort((a, b) => a.pricePerUnit - b.pricePerUnit || a.supplierName.localeCompare(b.supplierName));
}

function mergeCatalogRow(map: Map<string, SupplierCatalogRow[]>, articleId: string, row: SupplierCatalogRow): void {
  const list = map.get(articleId) ?? [];
  if (list.some((r) => r.id === row.id)) return;
  list.push(row);
  sortSupplierCatalogRows(list);
  map.set(articleId, list);
}

/**
 * Todos los productos de proveedor que comparten `article_id` (comparativa precios / proveedores).
 * Ordenados por precio ascendente.
 */
export async function fetchSupplierCatalogRowsForArticleIds(
  supabase: SupabaseClient,
  localId: string,
  articleIds: string[],
): Promise<Map<string, SupplierCatalogRow[]>> {
  const map = new Map<string, SupplierCatalogRow[]>();
  if (!articleIds.length) return map;
  const { data, error } = await supabase
    .from('pedido_supplier_products')
    .select(SUPPLIER_CATALOG_SELECT)
    .eq('local_id', localId)
    .in('article_id', articleIds);
  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const mapped = mapPedidoSupplierProductToCatalogRow(row);
    if (!mapped?.articleId) continue;
    mergeCatalogRow(map, mapped.articleId, mapped);
  }
  return map;
}

/**
 * Artículos sin filas por `article_id` suelen ser migraciones incompletas: recupera la fila de
 * `created_from_supplier_product_id` / `referencia_principal_supplier_product_id`.
 */
function pickCatalogNameSearchToken(nombre: string): string | null {
  const stop = new Set(['con', 'sin', 'para', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'c', 'c/12', 'c/6']);
  for (const part of nombre.split(/[\s,/·\-]+/)) {
    const token = part.trim();
    if (token.length >= 4 && !stop.has(token.toLowerCase())) return token;
  }
  return null;
}

export async function enrichSupplierCatalogMapWithArticleHints(
  supabase: SupabaseClient,
  localId: string,
  articles: Pick<
    PurchaseArticle,
    'id' | 'nombre' | 'createdFromSupplierProductId' | 'referenciaPrincipalSupplierProductId'
  >[],
  map: Map<string, SupplierCatalogRow[]>,
): Promise<Map<string, SupplierCatalogRow[]>> {
  let missing = articles.filter((a) => !(map.get(a.id)?.length ?? 0));
  if (!missing.length) return map;

  const productIdToArticleId = new Map<string, string>();
  for (const article of missing) {
    for (const productId of [
      article.referenciaPrincipalSupplierProductId,
      article.createdFromSupplierProductId,
    ]) {
      if (productId) productIdToArticleId.set(productId, article.id);
    }
  }
  const productIds = [...productIdToArticleId.keys()];
  if (productIds.length) {
    const { data, error } = await supabase
      .from('pedido_supplier_products')
      .select(SUPPLIER_CATALOG_SELECT)
      .eq('local_id', localId)
      .in('id', productIds);
    if (error) throw new Error(error.message);

    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const productId = String(row.id);
      const articleId = productIdToArticleId.get(productId);
      if (!articleId) continue;
      const mapped = mapPedidoSupplierProductToCatalogRow(row, articleId);
      if (!mapped) continue;
      mergeCatalogRow(map, articleId, mapped);
    }
  }

  missing = articles.filter((a) => !(map.get(a.id)?.length ?? 0));
  if (!missing.length) return map;

  const tokenToArticleIds = new Map<string, string[]>();
  for (const article of missing) {
    const token = pickCatalogNameSearchToken(article.nombre);
    if (!token) continue;
    const ids = tokenToArticleIds.get(token) ?? [];
    ids.push(article.id);
    tokenToArticleIds.set(token, ids);
  }

  for (const [token, articleIds] of tokenToArticleIds) {
    const { data, error } = await supabase
      .from('pedido_supplier_products')
      .select(SUPPLIER_CATALOG_SELECT)
      .eq('local_id', localId)
      .ilike('name', `%${token}%`)
      .limit(12);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      for (const articleId of articleIds) {
        const mapped = mapPedidoSupplierProductToCatalogRow(row, articleId);
        if (!mapped) continue;
        mergeCatalogRow(map, articleId, mapped);
      }
    }
  }

  return map;
}

type ArticleRow = Record<string, unknown>;

function mapArticleRow(row: ArticleRow): PurchaseArticle {
  const ubcRaw = row.unidad_base_coste != null ? String(row.unidad_base_coste).trim().toLowerCase() : null;
  const ubc: PurchaseArticle['unidadBaseCoste'] =
    ubcRaw === 'kg' || ubcRaw === 'l' || ubcRaw === 'ud' ? ubcRaw : null;
  const upfRaw = row.unidad_por_formato != null ? String(row.unidad_por_formato).trim().toLowerCase() : null;
  const upf: PurchaseArticle['unidadPorFormato'] =
    upfRaw === 'kg' || upfRaw === 'l' || upfRaw === 'ud' ? upfRaw : null;
  const conversionWeightRaw =
    row.conversion_weight_unit != null ? String(row.conversion_weight_unit).trim().toLowerCase() : null;
  const conversionWeightUnit: WeightConversionUnit | null =
    conversionWeightRaw === 'kg' || conversionWeightRaw === 'g' ? conversionWeightRaw : null;
  const conversionVolumeRaw =
    row.conversion_volume_unit != null ? String(row.conversion_volume_unit).trim().toLowerCase() : null;
  const conversionVolumeUnit: VolumeConversionUnit | null =
    conversionVolumeRaw === 'l' || conversionVolumeRaw === 'ml' ? conversionVolumeRaw : null;
  return {
    id: String(row.id),
    localId: String(row.local_id),
    nombre: String(row.nombre ?? ''),
    nombreCorto: row.nombre_corto != null ? String(row.nombre_corto) : null,
    categoria: row.categoria != null ? String(row.categoria) : null,
    subcategoria: row.subcategoria != null ? String(row.subcategoria) : null,
    descripcion: row.descripcion != null ? String(row.descripcion) : null,
    unidadBase: row.unidad_base != null ? String(row.unidad_base) : null,
    activo: Boolean(row.activo),
    costeMaster: row.coste_master != null ? Number(row.coste_master) : null,
    metodoCosteMaster: row.metodo_coste_master != null ? String(row.metodo_coste_master) : null,
    costeMasterFijadoEn: row.coste_master_fijado_en != null ? String(row.coste_master_fijado_en) : null,
    proveedorPreferidoId: row.proveedor_preferido_id != null ? String(row.proveedor_preferido_id) : null,
    observaciones: String(row.observaciones ?? ''),
    createdFromSupplierProductId:
      row.created_from_supplier_product_id != null ? String(row.created_from_supplier_product_id) : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    referenciaPrincipalSupplierProductId:
      row.referencia_principal_supplier_product_id != null
        ? String(row.referencia_principal_supplier_product_id)
        : null,
    unidadCompra: row.unidad_compra != null ? String(row.unidad_compra) : null,
    costeCompraActual: row.coste_compra_actual != null ? Number(row.coste_compra_actual) : null,
    ivaCompraPct: row.iva_compra_pct != null ? Number(row.iva_compra_pct) : null,
    unidadUso: row.unidad_uso != null ? String(row.unidad_uso) : null,
    unidadesUsoPorUnidadCompra:
      row.unidades_uso_por_unidad_compra != null ? Number(row.unidades_uso_por_unidad_compra) : null,
    rendimientoPct: row.rendimiento_pct != null ? Number(row.rendimiento_pct) : null,
    costeUnitarioUso: row.coste_unitario_uso != null ? Number(row.coste_unitario_uso) : null,
    origenCoste: row.origen_coste != null ? String(row.origen_coste) : null,
    origenArticulo: row.origen_articulo === 'cocina_central' ? 'cocina_central' : 'proveedor',
    centralProductionRecipeId:
      row.central_production_recipe_id != null ? String(row.central_production_recipe_id) : null,
    centralCostSyncedAt: row.central_cost_synced_at != null ? String(row.central_cost_synced_at) : null,
    unidadBaseCoste: ubc,
    costeBase: row.coste_base != null ? Number(row.coste_base) : null,
    formatoCompraNombre:
      row.formato_compra_nombre != null ? String(row.formato_compra_nombre) : null,
    cantidadPorFormato:
      row.cantidad_por_formato != null ? Number(row.cantidad_por_formato) : null,
    unidadPorFormato: upf,
    conversionToWeightEnabled: Boolean(row.conversion_to_weight_enabled),
    conversionWeightUnit,
    conversionVolumeUnit,
    conversionFactor:
      row.conversion_factor != null && Number.isFinite(Number(row.conversion_factor))
        ? Number(row.conversion_factor)
        : null,
    technicalFileUrl: row.technical_file_url != null ? String(row.technical_file_url) : null,
    technicalFileName: row.technical_file_name != null ? String(row.technical_file_name) : null,
    technicalFileType: row.technical_file_type != null ? String(row.technical_file_type) : null,
    technicalFileSize:
      row.technical_file_size != null && Number.isFinite(Number(row.technical_file_size))
        ? Number(row.technical_file_size)
        : null,
  };
}

const ARTICLE_SEL_BASE =
  'id,local_id,nombre,nombre_corto,categoria,subcategoria,descripcion,unidad_base,activo,coste_master,metodo_coste_master,coste_master_fijado_en,proveedor_preferido_id,observaciones,created_from_supplier_product_id,referencia_principal_supplier_product_id,unidad_compra,coste_compra_actual,iva_compra_pct,unidad_uso,unidades_uso_por_unidad_compra,rendimiento_pct,coste_unitario_uso,origen_coste,origen_articulo,central_production_recipe_id,central_cost_synced_at,unidad_base_coste,coste_base,formato_compra_nombre,cantidad_por_formato,unidad_por_formato,created_at,updated_at';
const ARTICLE_SEL_WITH_TECH =
  `${ARTICLE_SEL_BASE},technical_file_url,technical_file_name,technical_file_type,technical_file_size`;
const ARTICLE_SEL =
  `${ARTICLE_SEL_WITH_TECH},conversion_to_weight_enabled,conversion_weight_unit,conversion_volume_unit,conversion_factor`;

export function isMissingPurchaseArticlesError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('purchase_articles') &&
    (m.includes('does not exist') || m.includes('schema cache') || m.includes('could not find'))
  );
}

export async function fetchPurchaseArticles(supabase: SupabaseClient, localId: string): Promise<PurchaseArticle[]> {
  const { data, error } = await supabase
    .from('purchase_articles')
    .select(ARTICLE_SEL)
    .eq('local_id', localId)
    .order('nombre', { ascending: true });
  if (error) {
    const techLegacy = await supabase
      .from('purchase_articles')
      .select(ARTICLE_SEL_WITH_TECH)
      .eq('local_id', localId)
      .order('nombre', { ascending: true });
    if (!techLegacy.error) return ((techLegacy.data ?? []) as ArticleRow[]).map(mapArticleRow);
    const legacy = await supabase
      .from('purchase_articles')
      .select(ARTICLE_SEL_BASE)
      .eq('local_id', localId)
      .order('nombre', { ascending: true });
    if (legacy.error) throw new Error(legacy.error.message);
    return ((legacy.data ?? []) as ArticleRow[]).map(mapArticleRow);
  }
  return ((data ?? []) as ArticleRow[]).map(mapArticleRow);
}

/** Coste de uso cocina por artículo (para escandallos). Silencia error si aún no existe la migración v2. */
export async function fetchPurchaseArticleCostHintsByIds(
  supabase: SupabaseClient,
  localId: string,
  articleIds: string[],
): Promise<Map<string, PurchaseArticleCostHint>> {
  const map = new Map<string, PurchaseArticleCostHint>();
  const uniq = [...new Set(articleIds)].filter(Boolean);
  if (!uniq.length) return map;
  const mapHintRow = (row: Record<string, unknown>): PurchaseArticleCostHint => {
    const weightRaw =
      row.conversion_weight_unit != null ? String(row.conversion_weight_unit).trim().toLowerCase() : null;
    const volumeRaw =
      row.conversion_volume_unit != null ? String(row.conversion_volume_unit).trim().toLowerCase() : null;
    return {
      unidadUso: row.unidad_uso != null ? String(row.unidad_uso) : null,
      costeUnitarioUso: row.coste_unitario_uso != null ? Number(row.coste_unitario_uso) : null,
      conversionToWeightEnabled: Boolean(row.conversion_to_weight_enabled),
      conversionWeightUnit: weightRaw === 'kg' || weightRaw === 'g' ? weightRaw : null,
      conversionVolumeUnit: volumeRaw === 'l' || volumeRaw === 'ml' ? volumeRaw : null,
      conversionFactor:
        row.conversion_factor != null && Number.isFinite(Number(row.conversion_factor))
          ? Number(row.conversion_factor)
          : null,
    };
  };
  try {
    const full = await supabase
      .from('purchase_articles')
      .select('id,unidad_uso,coste_unitario_uso,conversion_to_weight_enabled,conversion_weight_unit,conversion_volume_unit,conversion_factor')
      .eq('local_id', localId)
      .in('id', uniq);
    if (!full.error) {
      for (const row of (full.data ?? []) as Record<string, unknown>[]) {
        map.set(String(row.id), mapHintRow(row));
      }
      return map;
    }
    const legacy = await supabase
      .from('purchase_articles')
      .select('id,unidad_uso,coste_unitario_uso')
      .eq('local_id', localId)
      .in('id', uniq);
    if (legacy.error) return map;
    for (const row of (legacy.data ?? []) as Record<string, unknown>[]) {
      map.set(String(row.id), mapHintRow(row));
    }
  } catch {
    /* sin columnas o sin tabla */
  }
  return map;
}

export type PurchaseArticleWeightConversionPatch = {
  conversionToWeightEnabled: boolean;
  conversionWeightUnit: WeightConversionUnit | null;
  conversionVolumeUnit: VolumeConversionUnit | null;
  conversionFactor: number | null;
};

export async function updatePurchaseArticleWeightConversionFields(
  supabase: SupabaseClient,
  localId: string,
  articleId: string,
  patch: PurchaseArticleWeightConversionPatch,
): Promise<void> {
  const enabled = Boolean(patch.conversionToWeightEnabled);
  const factor = patch.conversionFactor;
  if (enabled) {
    if (patch.conversionWeightUnit !== 'kg' && patch.conversionWeightUnit !== 'g') {
      throw new Error('Selecciona unidad de peso para la equivalencia.');
    }
    if (patch.conversionVolumeUnit !== 'l' && patch.conversionVolumeUnit !== 'ml') {
      throw new Error('Selecciona unidad de volumen para la equivalencia.');
    }
    if (factor == null || !Number.isFinite(factor) || factor <= 0) {
      throw new Error('La equivalencia debe ser mayor que 0.');
    }
  }

  const row = {
    conversion_to_weight_enabled: enabled,
    conversion_weight_unit: enabled ? patch.conversionWeightUnit : null,
    conversion_volume_unit: enabled ? patch.conversionVolumeUnit : null,
    conversion_factor: enabled && factor != null ? Math.round(factor * 1000000) / 1000000 : null,
  };
  const { error } = await supabase
    .from('purchase_articles')
    .update(row)
    .eq('id', articleId)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export type PurchaseArticleMasterCostPatch = {
  referenciaPrincipalSupplierProductId?: string | null;
  unidadCompra?: string | null;
  costeCompraActual?: number | null;
  ivaCompraPct?: number | null;
  unidadUso?: string | null;
  unidadesUsoPorUnidadCompra?: number | null;
  rendimientoPct?: number | null;
  costeUnitarioUso?: number | null;
  origenCoste?: string | null;
};

export async function updatePurchaseArticleMasterCostFields(
  supabase: SupabaseClient,
  localId: string,
  articleId: string,
  patch: PurchaseArticleMasterCostPatch,
): Promise<void> {
  const { data: originRow, error: originErr } = await supabase
    .from('purchase_articles')
    .select('origen_articulo')
    .eq('id', articleId)
    .eq('local_id', localId)
    .maybeSingle();
  if (originErr) {
    const m = originErr.message.toLowerCase();
    if (!m.includes('column') && !m.includes('schema cache')) throw new Error(originErr.message);
  }
  const oa = (originRow as { origen_articulo?: string } | null)?.origen_articulo;
  if (oa === 'cocina_central') {
    throw new Error(
      'Este artículo lo sincroniza Cocina Central desde la fórmula de producción; no se edita la compra aquí.',
    );
  }

  const touchesUsage =
    patch.unidadUso !== undefined ||
    patch.unidadesUsoPorUnidadCompra !== undefined ||
    patch.rendimientoPct !== undefined;

  if (touchesUsage) {
    let principal: string | null = null;
    if (patch.referenciaPrincipalSupplierProductId !== undefined) {
      principal =
        patch.referenciaPrincipalSupplierProductId === '' ? null : patch.referenciaPrincipalSupplierProductId;
    } else {
      const { data } = await supabase
        .from('purchase_articles')
        .select('referencia_principal_supplier_product_id')
        .eq('id', articleId)
        .eq('local_id', localId)
        .maybeSingle();
      principal = (data as { referencia_principal_supplier_product_id?: string | null } | null)
        ?.referencia_principal_supplier_product_id ?? null;
    }
    if (!principal) {
      throw new Error('Asigna la referencia principal de compra antes de guardar unidad de uso o conversión.');
    }
  }

  if (patch.unidadUso !== undefined) {
    const err = validateEscandalloUsageUnitInput(patch.unidadUso ?? '');
    if (err) throw new Error(err);
  }
  if (patch.unidadesUsoPorUnidadCompra !== undefined) {
    const u = patch.unidadesUsoPorUnidadCompra;
    if (u == null || !Number.isFinite(u) || u <= 0) {
      throw new Error('Unidades de uso por unidad de compra debe ser mayor que 0.');
    }
  }
  if (patch.rendimientoPct !== undefined) {
    const r = patch.rendimientoPct;
    if (r == null || !Number.isFinite(r)) throw new Error('Rendimiento útil no válido.');
    if (r <= 0 || r > 100) throw new Error('Rendimiento útil debe ser mayor que 0 y como máximo 100.');
  }

  const row: Record<string, unknown> = {};
  if (patch.referenciaPrincipalSupplierProductId !== undefined) {
    const principalId =
      patch.referenciaPrincipalSupplierProductId === '' ? null : patch.referenciaPrincipalSupplierProductId;
    row.referencia_principal_supplier_product_id = principalId;
    if (principalId) {
      const nowIso = new Date().toISOString();
      const link = await supabase
        .from('pedido_supplier_products')
        .update({
          article_id: articleId,
          migrated_to_article: true,
          migrated_at: nowIso,
        })
        .eq('id', principalId)
        .eq('local_id', localId);
      if (link.error) throw new Error(link.error.message);
    }
  }
  if (patch.unidadCompra !== undefined) row.unidad_compra = patch.unidadCompra;
  if (patch.costeCompraActual !== undefined && patch.costeCompraActual != null && Number.isFinite(patch.costeCompraActual)) {
    row.coste_compra_actual = Math.round(patch.costeCompraActual * 1000000) / 1000000;
  }
  if (patch.ivaCompraPct !== undefined && patch.ivaCompraPct != null && Number.isFinite(patch.ivaCompraPct)) {
    row.iva_compra_pct = Math.round(patch.ivaCompraPct * 10000) / 10000;
  }
  if (patch.unidadUso !== undefined) {
    row.unidad_uso = String(patch.unidadUso ?? '')
      .trim()
      .replace(/\s+/g, ' ');
  }
  if (patch.unidadesUsoPorUnidadCompra !== undefined && patch.unidadesUsoPorUnidadCompra != null) {
    row.unidades_uso_por_unidad_compra = Math.round(patch.unidadesUsoPorUnidadCompra * 1e8) / 1e8;
  }
  if (patch.rendimientoPct !== undefined && patch.rendimientoPct != null) {
    row.rendimiento_pct = Math.round(patch.rendimientoPct * 100) / 100;
  }
  if (patch.costeUnitarioUso !== undefined) {
    row.coste_unitario_uso =
      patch.costeUnitarioUso != null && Number.isFinite(patch.costeUnitarioUso) && patch.costeUnitarioUso >= 0
        ? Math.round(patch.costeUnitarioUso * 1e8) / 1e8
        : null;
  }
  if (patch.origenCoste !== undefined) row.origen_coste = patch.origenCoste?.trim() || null;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('purchase_articles').update(row).eq('id', articleId).eq('local_id', localId);
  if (error) throw new Error(error.message);
}

/** Solo cambia el flag `activo` del artículo máster (no borra datos). */
export async function setPurchaseArticleActivo(
  supabase: SupabaseClient,
  localId: string,
  articleId: string,
  activo: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('purchase_articles')
    .update({ activo })
    .eq('id', articleId)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export type PurchaseArticleTechnicalFilePatch = {
  technicalFileUrl: string | null;
  technicalFileName: string | null;
  technicalFileType: string | null;
  technicalFileSize: number | null;
};

export async function updatePurchaseArticleTechnicalFileFields(
  supabase: SupabaseClient,
  localId: string,
  articleId: string,
  patch: PurchaseArticleTechnicalFilePatch,
): Promise<void> {
  const row = {
    technical_file_url: patch.technicalFileUrl,
    technical_file_name: patch.technicalFileName,
    technical_file_type: patch.technicalFileType,
    technical_file_size:
      patch.technicalFileSize != null && Number.isFinite(patch.technicalFileSize)
        ? Math.round(patch.technicalFileSize)
        : null,
  };
  const { error } = await supabase
    .from('purchase_articles')
    .update(row)
    .eq('id', articleId)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}

/**
 * Sincroniza coste de compra del artículo desde el catálogo proveedor (fallback si el trigger SQL no está desplegado).
 */
export async function syncPurchaseArticlesFromSupplierCatalogPrice(
  supabase: SupabaseClient,
  localId: string,
  supplierProductId: string,
  pricePerUnit: number,
  unit: string,
  vatRate: number,
): Promise<void> {
  const price = Math.round(pricePerUnit * 100) / 100;
  const q1 = supabase
    .from('purchase_articles')
    .update({
      coste_compra_actual: price,
      unidad_compra: unit,
      iva_compra_pct: Math.round(vatRate * 10000) / 10000,
      origen_coste: 'proveedor_catalogo',
    })
    .eq('local_id', localId)
    .neq('origen_articulo', 'cocina_central')
    .eq('referencia_principal_supplier_product_id', supplierProductId);
  const q2 = supabase
    .from('purchase_articles')
    .update({
      coste_compra_actual: price,
      unidad_compra: unit,
      iva_compra_pct: Math.round(vatRate * 10000) / 10000,
      origen_coste: 'proveedor_catalogo',
    })
    .eq('local_id', localId)
    .neq('origen_articulo', 'cocina_central')
    .is('referencia_principal_supplier_product_id', null)
    .eq('created_from_supplier_product_id', supplierProductId);
  const [r1, r2] = await Promise.all([q1, q2]);
  if (r1.error && !r1.error.message.includes('column')) throw new Error(r1.error.message);
  if (r2.error && !r2.error.message.includes('column')) throw new Error(r2.error.message);
}

export async function fetchPurchaseArticleDuplicateCandidates(
  supabase: SupabaseClient,
  localId: string,
): Promise<PurchaseArticleDuplicateCandidate[]> {
  const { data, error } = await supabase
    .from('purchase_article_duplicate_candidates')
    .select('article_id_a,article_id_b,local_id,nombre_a,nombre_b,score')
    .eq('local_id', localId)
    .order('score', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    articleIdA: String(row.article_id_a),
    articleIdB: String(row.article_id_b),
    localId: String(row.local_id),
    nombreA: String(row.nombre_a ?? ''),
    nombreB: String(row.nombre_b ?? ''),
    score: Number(row.score ?? 0),
  }));
}

/**
 * Crea (o reutiliza) el artículo base 1:1 para un producto de proveedor recién insertado
 * y actualiza pedido_supplier_products.article_id. No sustituye el catálogo existente.
 */
export async function linkPurchaseArticleToNewSupplierProduct(
  supabase: SupabaseClient,
  localId: string,
  supplierProductId: string,
  supplierId: string,
  input: {
    nombre: string;
    unidadBase: string;
    activo: boolean;
    costeMaster: number;
  },
): Promise<string | null> {
  const nowIso = new Date().toISOString();
  const ins = await supabase
    .from('purchase_articles')
    .insert({
      local_id: localId,
      nombre: input.nombre.trim(),
      nombre_corto: input.nombre.trim().length > 48 ? input.nombre.trim().slice(0, 48) : null,
      unidad_base: input.unidadBase,
      activo: input.activo,
      coste_master: Math.round(input.costeMaster * 10000) / 10000,
      metodo_coste_master: 'alta_proveedor',
      coste_master_fijado_en: nowIso,
      proveedor_preferido_id: supplierId,
      observaciones: 'Artículo base creado al dar de alta el producto en el catálogo del proveedor.',
      created_from_supplier_product_id: supplierProductId,
      referencia_principal_supplier_product_id: supplierProductId,
      unidad_compra: input.unidadBase,
      coste_compra_actual: Math.round(input.costeMaster * 10000) / 10000,
      unidad_uso: input.unidadBase,
      unidades_uso_por_unidad_compra: 1,
      rendimiento_pct: 100,
      origen_coste: 'alta_proveedor',
      origen_articulo: 'proveedor',
    })
    .select('id')
    .single();

  let articleId: string | null = null;
  if (ins.error) {
    if (isMissingPurchaseArticlesError(ins.error.message)) return null;
    const msg = ins.error.message.toLowerCase();
    if (msg.includes('duplicate') || msg.includes('unique')) {
      const ex = await supabase
        .from('purchase_articles')
        .select('id')
        .eq('created_from_supplier_product_id', supplierProductId)
        .maybeSingle();
      if (ex.error) throw new Error(ex.error.message);
      articleId = ex.data?.id != null ? String(ex.data.id) : null;
    } else {
      throw new Error(ins.error.message);
    }
  } else if (ins.data?.id) {
    articleId = String(ins.data.id);
  }

  if (!articleId) throw new Error('No se pudo obtener el artículo base para el producto.');

  const up = await supabase
    .from('pedido_supplier_products')
    .update({
      article_id: articleId,
      migrated_to_article: true,
      migrated_at: nowIso,
    })
    .eq('id', supplierProductId)
    .eq('local_id', localId);
  if (up.error) throw new Error(up.error.message);

  return articleId;
}
