import type { SupabaseClient } from '@supabase/supabase-js';

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
  };
}

const ARTICLE_SEL =
  'id,local_id,nombre,nombre_corto,categoria,subcategoria,descripcion,unidad_base,activo,coste_master,metodo_coste_master,coste_master_fijado_en,proveedor_preferido_id,observaciones,created_from_supplier_product_id,created_at,updated_at';

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
