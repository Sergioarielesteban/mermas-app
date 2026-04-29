import type { SupabaseClient } from '@supabase/supabase-js';
import { validateEscandalloUsageUnitInput } from '@/lib/escandallo-ingredient-units';

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
    .select('id,supplier_id,article_id,name,unit,price_per_unit,is_active,pedido_suppliers(name)')
    .eq('local_id', localId)
    .in('article_id', articleIds);
  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const aid = row.article_id != null ? String(row.article_id) : null;
    if (!aid) continue;
    const sup = row.pedido_suppliers;
    let supplierName = '';
    if (Array.isArray(sup)) {
      supplierName = String((sup[0] as { name?: string } | undefined)?.name ?? '');
    } else if (sup && typeof sup === 'object' && 'name' in sup) {
      supplierName = String((sup as { name: string }).name ?? '');
    }
    const r: SupplierCatalogRow = {
      id: String(row.id),
      supplierId: String(row.supplier_id),
      supplierName,
      articleId: aid,
      name: String(row.name ?? ''),
      unit: String(row.unit ?? ''),
      pricePerUnit: Number(row.price_per_unit ?? 0),
      isActive: Boolean(row.is_active),
    };
    const list = map.get(aid) ?? [];
    list.push(r);
    map.set(aid, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.pricePerUnit - b.pricePerUnit || a.supplierName.localeCompare(b.supplierName));
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
  };
}

const ARTICLE_SEL =
  'id,local_id,nombre,nombre_corto,categoria,subcategoria,descripcion,unidad_base,activo,coste_master,metodo_coste_master,coste_master_fijado_en,proveedor_preferido_id,observaciones,created_from_supplier_product_id,referencia_principal_supplier_product_id,unidad_compra,coste_compra_actual,iva_compra_pct,unidad_uso,unidades_uso_por_unidad_compra,rendimiento_pct,coste_unitario_uso,origen_coste,origen_articulo,central_production_recipe_id,central_cost_synced_at,unidad_base_coste,coste_base,formato_compra_nombre,cantidad_por_formato,unidad_por_formato,created_at,updated_at';

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
  if (error) throw new Error(error.message);
  return ((data ?? []) as ArticleRow[]).map(mapArticleRow);
}

/** Coste de uso cocina por artículo (para escandallos). Silencia error si aún no existe la migración v2. */
export async function fetchPurchaseArticleCostHintsByIds(
  supabase: SupabaseClient,
  localId: string,
  articleIds: string[],
): Promise<Map<string, { costeUnitarioUso: number | null; unidadUso: string | null }>> {
  const map = new Map<string, { costeUnitarioUso: number | null; unidadUso: string | null }>();
  const uniq = [...new Set(articleIds)].filter(Boolean);
  if (!uniq.length) return map;
  try {
    const { data, error } = await supabase
      .from('purchase_articles')
      .select('id,unidad_uso,coste_unitario_uso')
      .eq('local_id', localId)
      .in('id', uniq);
    if (error) return map;
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      map.set(String(row.id), {
        unidadUso: row.unidad_uso != null ? String(row.unidad_uso) : null,
        costeUnitarioUso: row.coste_unitario_uso != null ? Number(row.coste_unitario_uso) : null,
      });
    }
  } catch {
    /* sin columnas o sin tabla */
  }
  return map;
}

export type PurchaseArticleMasterCostPatch = {
  referenciaPrincipalSupplierProductId?: string | null;
  unidadCompra?: string | null;
  costeCompraActual?: number | null;
  ivaCompraPct?: number | null;
  unidadUso?: string | null;
  unidadesUsoPorUnidadCompra?: number | null;
  rendimientoPct?: number | null;
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
    row.referencia_principal_supplier_product_id =
      patch.referenciaPrincipalSupplierProductId === '' ? null : patch.referenciaPrincipalSupplierProductId;
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
