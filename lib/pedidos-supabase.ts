import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeDeliveryCycleWeekdays, normalizeDeliveryExceptionDates } from '@/lib/pedidos-coverage';
import {
  fetchPurchaseArticleCostHintsByIds,
  isMissingPurchaseArticlesError,
  linkPurchaseArticleToNewSupplierProduct,
} from '@/lib/purchase-articles-supabase';
import type { Unit } from '@/lib/types';

/**
 * Unidades de catálogo que no son kg pero permiten anotar **kg reales** y **€/kg** en recepción
 * (pedido en envase/unidad, cobro por peso). No incluye `kg` (esa línea usa el flujo propio de báscula).
 */
export function unitSupportsReceivedWeightKg(unit: Unit): boolean {
  return (
    unit === 'bandeja' ||
    unit === 'caja' ||
    unit === 'paquete' ||
    unit === 'bolsa' ||
    unit === 'ud' ||
    unit === 'racion'
  );
}

/** Catálogo: unidad de cobro distinta a la de pedido (ej. bandeja → kg). */
export function supplierProductHasDistinctBilling(
  p: Pick<PedidoSupplierProduct, 'unit' | 'billingUnit'>,
): boolean {
  return p.billingUnit != null && p.billingUnit !== p.unit;
}

/** Línea guardada: misma regla que catálogo (snapshot en el pedido). */
export function orderItemHasDistinctBilling(
  item: Pick<PedidoOrderItem, 'unit' | 'billingUnit'>,
): boolean {
  return item.billingUnit != null && item.billingUnit !== item.unit;
}

/** Líneas donde se puede anotar peso en báscula al recibir (kg: el peso actualiza subtotal e IVA del albarán). */
export function unitCanDeclareScaleKgOnReception(unit: Unit): boolean {
  return unit === 'kg' || unitSupportsReceivedWeightKg(unit);
}

/** Cantidad que multiplica el precio unitario en albarán (kg reales si están declarados; si no, unidades recibidas). */
export function billingQuantityForLine(item: Pick<PedidoOrderItem, 'unit' | 'receivedQuantity' | 'receivedWeightKg'>): number {
  if (item.unit === 'kg' && item.receivedWeightKg != null && item.receivedWeightKg > 0) {
    return item.receivedWeightKg;
  }
  return item.receivedQuantity;
}

function lineIsMissingNotReceived(item: Pick<PedidoOrderItem, 'incidentType'>): boolean {
  return item.incidentType === 'missing';
}

/**
 * Cantidad para recalcular subtotal al ajustar precio en Recepción.
 * Si aún no hay cantidad recibida/peso en BD (0), usa la cantidad pedida para no dejar line_total en 0.
 * No aplica si la línea es «no recibida» (missing).
 */
export function billingQuantityForReceptionPrice(item: PedidoOrderItem): number {
  const b = billingQuantityForLine(item);
  if (b > 0) return b;
  if (lineIsMissingNotReceived(item)) return 0;
  return item.quantity > 0 ? item.quantity : 0;
}

/**
 * Subtotal e importe unitario de referencia en Recepción.
 * Envases con kg reales y €/kg: el subtotal es kg × €/kg. El `price_per_unit` (€/caja, etc.) no se
 * recalcula desde ese subtotal: sigue siendo el precio de referencia del pedido salvo edición manual.
 */
export function receptionLineTotals(item: PedidoOrderItem): { lineTotal: number; effectivePricePerUnit: number } {
  if (item.unit === 'kg') {
    const bq = billingQuantityForReceptionPrice(item);
    return {
      lineTotal: Math.round(item.pricePerUnit * bq * 100) / 100,
      effectivePricePerUnit: item.pricePerUnit,
    };
  }
  if (
    unitSupportsReceivedWeightKg(item.unit) &&
    item.receivedWeightKg != null &&
    item.receivedWeightKg > 0 &&
    item.receivedPricePerKg != null &&
    Number.isFinite(item.receivedPricePerKg) &&
    item.receivedPricePerKg > 0
  ) {
    const lt = Math.round(item.receivedWeightKg * item.receivedPricePerKg * 100) / 100;
    return { lineTotal: lt, effectivePricePerUnit: item.pricePerUnit };
  }
  const bq = billingQuantityForReceptionPrice(item);
  return {
    lineTotal: Math.round(item.pricePerUnit * bq * 100) / 100,
    effectivePricePerUnit: item.pricePerUnit,
  };
}

export type PedidoStatus = 'draft' | 'sent' | 'received';

export type PedidoSupplierProduct = {
  id: string;
  /** Artículo base (purchase_articles); opcional hasta migrar o enlazar. */
  articleId?: string | null;
  name: string;
  unit: Unit;
  pricePerUnit: number;
  /**
   * Piezas usables en receta por cada unidad de pedido (ej. 40 panes por caja).
   * 1 = el precio es directamente por la unidad de receta / pedido.
   */
  unitsPerPack: number;
  /** Unidad en escandallo cuando hay varias piezas por envase (típ. ud). */
  recipeUnit: Unit | null;
  vatRate: number;
  parStock: number;
  isActive: boolean;
  /** Bandeja/caja: kg estimados por envase (referencia). */
  estimatedKgPerUnit?: number;
  /** Unidad de cobro en factura/albarán si difiere de `unit` (p. ej. kg con pedido en bandeja). */
  billingUnit?: Unit | null;
  /** Cantidad de `billingUnit` por cada unidad de pedido (p. ej. kg por bandeja). */
  billingQtyPerOrderUnit?: number | null;
  /** Precio habitual en `billingUnit` (p. ej. €/kg). */
  pricePerBillingUnit?: number | null;
};

export type PedidoSupplier = {
  id: string;
  name: string;
  contact: string;
  /** Días de reparto 0=dom..6=sáb. Vacío = cobertura 7 días al escalar PAR semanal. */
  deliveryCycleWeekdays: number[];
  /** Fechas puntuales válidas de reparto (ej. festivo mueve Jue→Mié): YYYY-MM-DD. */
  deliveryExceptionDates: string[];
  products: PedidoSupplierProduct[];
};

export type PedidoOrderItem = {
  id: string;
  supplierProductId: string | null;
  productName: string;
  unit: Unit;
  quantity: number;
  receivedQuantity: number;
  pricePerUnit: number;
  vatRate: number;
  lineTotal: number;
  /** Copia del catálogo al guardar (unidades que admiten kg estimado por envase). */
  estimatedKgPerUnit?: number;
  /** Peso real en recepción (kg) cuando la unidad de pedido admite anotación de báscula + €/kg. */
  receivedWeightKg?: number | null;
  /** €/kg reales en recepción; con kg reales, subtotal = kg × €/kg y `price_per_unit` queda como €/unidad de catálogo efectiva. */
  receivedPricePerKg?: number | null;
  incidentType?: 'missing' | 'damaged' | 'wrong-item' | null;
  incidentNotes?: string;
  /** Precio unitario del pedido al enviar (no se sobrescribe al revisar albarán). */
  basePricePerUnit?: number;
  /** Snapshot al guardar: unidad de cobro si difiere de `unit`. */
  billingUnit?: Unit | null;
  billingQtyPerOrderUnit?: number | null;
  pricePerBillingUnit?: number | null;
};

export type PedidoOrder = {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierContact?: string;
  status: PedidoStatus;
  notes: string;
  createdAt: string;
  sentAt?: string;
  receivedAt?: string;
  deliveryDate?: string;
  /** Pedido enviado archivado de la bandeja «revisión de precios» (sigue en BD y en Pedidos enviados). */
  priceReviewArchivedAt?: string;
  /** Marca de concurrencia para evitar pisar cambios entre dispositivos. */
  updatedAt?: string;
  /** Última vez que se guardaron cambios de líneas en un pedido ya enviado (requiere migración SQL). */
  contentRevisedAfterSentAt?: string;
  /** Quién creó o envió el pedido (columna opcional usuario_nombre y/o perfil por created_by). */
  usuarioNombre?: string;
  /** Alias por si el API expone otro nombre de columna en el futuro. */
  responsableNombre?: string;
  createdByName?: string;
  /** Join opcional staff → nombre (si el API lo rellena). */
  staff?: { name?: string | null };
  items: PedidoOrderItem[];
  total: number;
};

export type SupplierProductPriceHistory = {
  supplierProductId: string;
  lastPrice: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  samples: number;
};

/** Muestras recientes de precio en líneas de pedido (para gráficos / listas en Artículos). */
export type SupplierProductPriceSample = {
  supplierProductId: string;
  pricePerUnit: number;
  at: string;
};

type SupplierRow = {
  id: string;
  name: string;
  contact: string;
  delivery_cycle_weekdays?: number[] | null;
};
type SupplierDeliveryExceptionRow = {
  supplier_id: string;
  delivery_date: string;
};
type SupplierProductRow = {
  id: string;
  supplier_id: string;
  article_id?: string | null;
  name: string;
  unit: string;
  price_per_unit: number;
  units_per_pack?: number | null;
  recipe_unit?: string | null;
  vat_rate: number;
  par_stock: number;
  is_active: boolean;
  estimated_kg_per_unit: number | null;
  billing_unit?: string | null;
  billing_qty_per_order_unit?: number | null;
  price_per_billing_unit?: number | null;
};
type OrderRow = {
  id: string;
  supplier_id: string;
  status: PedidoStatus;
  notes: string;
  created_at: string;
  sent_at: string | null;
  received_at: string | null;
  delivery_date: string | null;
  price_review_archived_at?: string | null;
  updated_at?: string | null;
  content_revised_after_sent_at?: string | null;
  /** Solo si la migración añadió la columna y se vuelve a incluir en el select. */
  usuario_nombre?: string | null;
  created_by?: string | null;
  pedido_suppliers: { name: string; contact: string | null } | { name: string; contact: string | null }[] | null;
};
type OrderItemRow = {
  id: string;
  order_id: string;
  supplier_product_id: string | null;
  product_name: string;
  unit: string;
  quantity: number;
  received_quantity: number;
  price_per_unit: number;
  base_price_per_unit?: number | null;
  vat_rate: number;
  line_total: number;
  estimated_kg_per_unit: number | null;
  received_weight_kg: number | null;
  received_price_per_kg?: number | null;
  incident_type: 'missing' | 'damaged' | 'wrong-item' | null;
  incident_notes: string | null;
  billing_unit?: string | null;
  billing_qty_per_order_unit?: number | null;
  price_per_billing_unit?: number | null;
};

function isMissingReceivedPricePerKgColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('received_price_per_kg') && (m.includes('column') || m.includes('schema cache'));
}

function isMissingOrderItemBillingColumnsError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    (m.includes('billing_unit') || m.includes('billing_qty_per_order_unit') || m.includes('price_per_billing_unit')) &&
    (m.includes('column') || m.includes('schema cache'))
  );
}

function normalizeLabelUpper(value: string) {
  return value.trim().toUpperCase();
}

function isMissingDeliveryExceptionTableError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('pedido_supplier_delivery_exceptions') &&
    (m.includes('does not exist') || m.includes('not found') || m.includes('schema cache'))
  );
}

function isMissingPurchaseOrdersUpdatedAtColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('updated_at') &&
    m.includes('purchase_orders') &&
    (m.includes('column') || m.includes('schema cache') || m.includes('does not exist'))
  );
}

function isMissingSaveOrderRpcError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('save_purchase_order_with_items') &&
    (m.includes('function') || m.includes('schema cache') || m.includes('does not exist'))
  );
}

function isOrderConcurrencyConflictMessage(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('updated by another user') || m.includes('concurrency');
}

function isMissingContentRevisedAfterSentColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('content_revised_after_sent_at') &&
    (m.includes('column') || m.includes('schema cache') || m.includes('does not exist'))
  );
}

function trimRequesterLabel(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  return t.length ? t : null;
}

/**
 * Nombres visibles por `user_id` (mismo local / RLS). No lanza: si falla o no hay filas, mapa vacío.
 */
async function fetchProfileLabelsByUserId(
  supabase: SupabaseClient,
  userIds: readonly string[],
  options?: { signal?: AbortSignal },
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return out;
  let q = supabase.from('profiles').select('user_id,full_name,login_username').in('user_id', ids);
  if (options?.signal) q = q.abortSignal(options.signal);
  const { data, error } = await q;
  if (error) return out;
  for (const row of data ?? []) {
    const uid = (row as { user_id?: string }).user_id;
    if (!uid) continue;
    const full = trimRequesterLabel((row as { full_name?: string | null }).full_name);
    const login = trimRequesterLabel((row as { login_username?: string | null }).login_username);
    const label = full ?? login;
    if (label) out.set(uid, label);
  }
  return out;
}

function requesterLabelForOrderRow(
  row: OrderRow,
  profileByUserId?: ReadonlyMap<string, string>,
): string | null {
  const fromCol = trimRequesterLabel(row.usuario_nombre);
  if (fromCol) return fromCol;
  const uid = row.created_by;
  if (uid && profileByUserId?.size) {
    const fromProfile = trimRequesterLabel(profileByUserId.get(uid));
    if (fromProfile) return fromProfile;
  }
  return null;
}

/** Nombre para UI de quién hizo el pedido; nunca obligatorio. */
export function getPedidoRequesterDisplayName(order: PedidoOrder): string | null {
  const ext = order as PedidoOrder & { profile?: { display_name?: string | null } };
  return (
    trimRequesterLabel(order.usuarioNombre) ??
    trimRequesterLabel(order.responsableNombre) ??
    trimRequesterLabel(order.createdByName) ??
    trimRequesterLabel(ext.profile?.display_name) ??
    trimRequesterLabel(order.staff?.name) ??
    null
  );
}

const PURCHASE_ORDER_HEADER_SEL_WITH_REVISION =
  'id,supplier_id,status,notes,created_at,sent_at,received_at,delivery_date,price_review_archived_at,updated_at,content_revised_after_sent_at,created_by,pedido_suppliers(name,contact)';
const PURCHASE_ORDER_HEADER_SEL_WITH_UPDATED =
  'id,supplier_id,status,notes,created_at,sent_at,received_at,delivery_date,price_review_archived_at,updated_at,created_by,pedido_suppliers(name,contact)';
const PURCHASE_ORDER_HEADER_SEL_LEGACY =
  'id,supplier_id,status,notes,created_at,sent_at,received_at,delivery_date,price_review_archived_at,created_by,pedido_suppliers(name,contact)';

async function runPurchaseOrderHeaderQuery(
  supabase: SupabaseClient,
  localId: string,
  /** Cadena PostgREST tras `.select().eq('local_id', …)` (tipado laxo por variantes del cliente). */
  apply: (q: any) => any,
): Promise<OrderRow[]> {
  const runSel = async (sel: string) => {
    let q: any = supabase.from('purchase_orders').select(sel).eq('local_id', localId);
    q = apply(q);
    return q.order('created_at', { ascending: false });
  };
  let res = await runSel(PURCHASE_ORDER_HEADER_SEL_WITH_REVISION);
  if (res.error && isMissingContentRevisedAfterSentColumnError(res.error.message)) {
    res = await runSel(PURCHASE_ORDER_HEADER_SEL_WITH_UPDATED);
  }
  if (res.error && isMissingPurchaseOrdersUpdatedAtColumnError(res.error.message)) {
    res = await runSel(PURCHASE_ORDER_HEADER_SEL_LEGACY);
  }
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as OrderRow[];
}

async function fetchPurchaseOrderItemRows(
  supabase: SupabaseClient,
  orderIds: string[],
  options?: { signal?: AbortSignal; localId?: string },
): Promise<OrderItemRow[]> {
  const signal = options?.signal;
  const localId = options?.localId;
  const ids = orderIds.length ? orderIds : ['00000000-0000-0000-0000-000000000000'];
  const selFull =
    'id,order_id,supplier_product_id,product_name,unit,quantity,received_quantity,price_per_unit,base_price_per_unit,vat_rate,line_total,estimated_kg_per_unit,received_weight_kg,received_price_per_kg,incident_type,incident_notes,billing_unit,billing_qty_per_order_unit,price_per_billing_unit';
  let q = supabase.from('purchase_order_items').select(selFull).in('order_id', ids);
  if (localId) q = q.eq('local_id', localId);
  if (signal) q = q.abortSignal(signal);
  const withPricePerKg = await q;
  if (withPricePerKg.error) {
    if (isMissingOrderItemBillingColumnsError(withPricePerKg.error.message)) {
      const selNoBill =
        'id,order_id,supplier_product_id,product_name,unit,quantity,received_quantity,price_per_unit,base_price_per_unit,vat_rate,line_total,estimated_kg_per_unit,received_weight_kg,received_price_per_kg,incident_type,incident_notes';
      let q2 = supabase.from('purchase_order_items').select(selNoBill).in('order_id', ids);
      if (localId) q2 = q2.eq('local_id', localId);
      if (signal) q2 = q2.abortSignal(signal);
      const r2 = await q2;
      if (r2.error) throw new Error(r2.error.message);
      return (r2.data ?? []) as OrderItemRow[];
    }
    if (!isMissingReceivedPricePerKgColumnError(withPricePerKg.error.message)) {
      throw new Error(withPricePerKg.error.message);
    }
    let legacy = supabase
      .from('purchase_order_items')
      .select(
        'id,order_id,supplier_product_id,product_name,unit,quantity,received_quantity,price_per_unit,base_price_per_unit,vat_rate,line_total,estimated_kg_per_unit,received_weight_kg,incident_type,incident_notes',
      )
      .in('order_id', ids);
    if (localId) legacy = legacy.eq('local_id', localId);
    if (signal) legacy = legacy.abortSignal(signal);
    const legacyRes = await legacy;
    if (legacyRes.error) throw new Error(legacyRes.error.message);
    return (legacyRes.data ?? []) as OrderItemRow[];
  }
  return (withPricePerKg.data ?? []) as OrderItemRow[];
}

function buildPedidoOrdersFromRows(
  orderRows: OrderRow[],
  itemRows: OrderItemRow[],
  profileByUserId?: ReadonlyMap<string, string>,
): PedidoOrder[] {
  const byOrder = new Map<string, PedidoOrderItem[]>();
  for (const row of itemRows) {
    const list = byOrder.get(row.order_id) ?? [];
    list.push({
      id: row.id,
      supplierProductId: row.supplier_product_id,
      productName: row.product_name,
      unit: row.unit as Unit,
      quantity: Number(row.quantity),
      receivedQuantity: Number(row.received_quantity),
      pricePerUnit: Number(row.price_per_unit),
      vatRate: Number(row.vat_rate ?? 0),
      lineTotal: Number(row.line_total),
      ...(row.base_price_per_unit != null && Number.isFinite(Number(row.base_price_per_unit))
        ? { basePricePerUnit: Number(row.base_price_per_unit) }
        : {}),
      ...(row.estimated_kg_per_unit != null
        ? { estimatedKgPerUnit: Number(row.estimated_kg_per_unit) }
        : {}),
      receivedWeightKg: row.received_weight_kg != null ? Number(row.received_weight_kg) : null,
      ...(row.received_price_per_kg != null && Number.isFinite(Number(row.received_price_per_kg))
        ? { receivedPricePerKg: Number(row.received_price_per_kg) }
        : {}),
      incidentType: row.incident_type,
      incidentNotes: row.incident_notes ?? undefined,
      ...(row.billing_unit != null && String(row.billing_unit).trim() !== ''
        ? { billingUnit: row.billing_unit as Unit }
        : {}),
      ...(row.billing_qty_per_order_unit != null && Number.isFinite(Number(row.billing_qty_per_order_unit))
        ? { billingQtyPerOrderUnit: Number(row.billing_qty_per_order_unit) }
        : {}),
      ...(row.price_per_billing_unit != null && Number.isFinite(Number(row.price_per_billing_unit))
        ? { pricePerBillingUnit: Number(row.price_per_billing_unit) }
        : {}),
    });
    byOrder.set(row.order_id, list);
  }

  return orderRows.map((row) => {
    const supplier = Array.isArray(row.pedido_suppliers) ? row.pedido_suppliers[0] : row.pedido_suppliers;
    const items = byOrder.get(row.id) ?? [];
    return {
      id: row.id,
      supplierId: row.supplier_id,
      supplierName: supplier?.name ?? 'Proveedor',
      supplierContact: supplier?.contact ?? undefined,
      status: row.status,
      notes: row.notes ?? '',
      createdAt: row.created_at,
      sentAt: row.sent_at ?? undefined,
      receivedAt: row.received_at ?? undefined,
      deliveryDate: row.delivery_date ?? undefined,
      ...(row.price_review_archived_at != null && row.price_review_archived_at !== ''
        ? { priceReviewArchivedAt: row.price_review_archived_at }
        : {}),
      ...(row.updated_at != null && row.updated_at !== '' ? { updatedAt: row.updated_at } : {}),
      ...(row.content_revised_after_sent_at != null && row.content_revised_after_sent_at !== ''
        ? { contentRevisedAfterSentAt: row.content_revised_after_sent_at }
        : {}),
      ...((() => {
        const requester = requesterLabelForOrderRow(row, profileByUserId);
        return requester ? { usuarioNombre: requester } : {};
      })()),
      items,
      total: items.reduce((acc, item) => acc + item.lineTotal, 0),
    };
  });
}

/** Ventana móvil por defecto sobre `created_at` (~26 meses) para no descargar todo el histórico. */
export const FETCH_ORDERS_DEFAULT_RECENT_DAYS = 800;

export type FetchOrdersOptions = {
  signal?: AbortSignal;
  /** `null` = sin tope (histórico completo). Omisión = `FETCH_ORDERS_DEFAULT_RECENT_DAYS`. */
  recentDays?: number | null;
};

export async function fetchSuppliersWithProducts(supabase: SupabaseClient, localId: string) {
  const { data: supplierRows, error: sErr } = await supabase
    .from('pedido_suppliers')
    .select('id,name,contact,delivery_cycle_weekdays')
    .eq('local_id', localId)
    .order('name');
  if (sErr) throw new Error(sErr.message);

  let productRows: unknown[] | null = null;
  {
    const full = await supabase
      .from('pedido_supplier_products')
      .select(
        'id,supplier_id,article_id,name,unit,price_per_unit,units_per_pack,recipe_unit,vat_rate,par_stock,is_active,estimated_kg_per_unit,billing_unit,billing_qty_per_order_unit,price_per_billing_unit',
      )
      .eq('local_id', localId)
      .eq('is_active', true)
      .order('name');
    if (full.error && isMissingOrderItemBillingColumnsError(full.error.message)) {
      const legacy = await supabase
        .from('pedido_supplier_products')
        .select(
          'id,supplier_id,article_id,name,unit,price_per_unit,units_per_pack,recipe_unit,vat_rate,par_stock,is_active,estimated_kg_per_unit',
        )
        .eq('local_id', localId)
        .eq('is_active', true)
        .order('name');
      if (legacy.error) throw new Error(legacy.error.message);
      productRows = legacy.data ?? [];
    } else if (full.error) {
      throw new Error(full.error.message);
    } else {
      productRows = full.data ?? [];
    }
  }

  let exceptionRows: SupplierDeliveryExceptionRow[] = [];
  {
    const exQ = await supabase
      .from('pedido_supplier_delivery_exceptions')
      .select('supplier_id,delivery_date')
      .eq('local_id', localId)
      .order('delivery_date', { ascending: true });
    if (exQ.error) {
      if (!isMissingDeliveryExceptionTableError(exQ.error.message)) throw new Error(exQ.error.message);
    } else {
      exceptionRows = (exQ.data ?? []) as SupplierDeliveryExceptionRow[];
    }
  }

  const bySupplier = new Map<string, PedidoSupplierProduct[]>();
  for (const row of (productRows ?? []) as SupplierProductRow[]) {
    const packRaw = row.units_per_pack != null ? Number(row.units_per_pack) : 1;
    const unitsPerPack = Number.isFinite(packRaw) && packRaw > 0 ? packRaw : 1;
    const recipeUnit: Unit | null =
      unitsPerPack > 1 && row.recipe_unit != null && String(row.recipe_unit).trim() !== ''
        ? (String(row.recipe_unit) as Unit)
        : null;
    const list = bySupplier.get(row.supplier_id) ?? [];
    list.push({
      id: row.id,
      ...(row.article_id != null && String(row.article_id).trim() !== ''
        ? { articleId: String(row.article_id) }
        : {}),
      name: row.name,
      unit: row.unit as Unit,
      pricePerUnit: Number(row.price_per_unit),
      unitsPerPack,
      recipeUnit,
      vatRate: Number(row.vat_rate ?? 0),
      parStock: Number(row.par_stock ?? 0),
      isActive: Boolean(row.is_active),
      ...(row.estimated_kg_per_unit != null
        ? { estimatedKgPerUnit: Number(row.estimated_kg_per_unit) }
        : {}),
      ...(row.billing_unit != null && String(row.billing_unit).trim() !== ''
        ? { billingUnit: row.billing_unit as Unit }
        : {}),
      ...(row.billing_qty_per_order_unit != null && Number.isFinite(Number(row.billing_qty_per_order_unit))
        ? { billingQtyPerOrderUnit: Number(row.billing_qty_per_order_unit) }
        : {}),
      ...(row.price_per_billing_unit != null && Number.isFinite(Number(row.price_per_billing_unit))
        ? { pricePerBillingUnit: Number(row.price_per_billing_unit) }
        : {}),
    });
    bySupplier.set(row.supplier_id, list);
  }

  const exBySupplier = new Map<string, string[]>();
  for (const row of exceptionRows) {
    const list = exBySupplier.get(row.supplier_id) ?? [];
    list.push(String(row.delivery_date));
    exBySupplier.set(row.supplier_id, list);
  }

  const suppliers: PedidoSupplier[] = ((supplierRows ?? []) as SupplierRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    contact: row.contact ?? '',
    deliveryCycleWeekdays: normalizeDeliveryCycleWeekdays(row.delivery_cycle_weekdays),
    deliveryExceptionDates: normalizeDeliveryExceptionDates(exBySupplier.get(row.id) ?? []),
    products: bySupplier.get(row.id) ?? [],
  }));
  return suppliers;
}

export async function createSupplier(
  supabase: SupabaseClient,
  localId: string,
  name: string,
  contact: string,
  opts?: { deliveryCycleWeekdays?: number[] },
) {
  const cycle = normalizeDeliveryCycleWeekdays(opts?.deliveryCycleWeekdays ?? []);
  const { data, error } = await supabase
    .from('pedido_suppliers')
    .insert({
      local_id: localId,
      name: normalizeLabelUpper(name),
      contact: contact.trim(),
      delivery_cycle_weekdays: cycle,
    })
    .select('id,name,contact,delivery_cycle_weekdays')
    .single();
  if (error) throw new Error(error.message);
  return data as SupplierRow;
}

export async function updateSupplier(
  supabase: SupabaseClient,
  localId: string,
  supplierId: string,
  input: {
    name: string;
    contact: string;
    deliveryCycleWeekdays?: number[];
    deliveryExceptionDates?: string[];
  },
) {
  const row: Record<string, unknown> = {
    name: normalizeLabelUpper(input.name),
    contact: input.contact.trim(),
  };
  if (input.deliveryCycleWeekdays !== undefined) {
    row.delivery_cycle_weekdays = normalizeDeliveryCycleWeekdays(input.deliveryCycleWeekdays);
  }
  const { data, error } = await supabase.from('pedido_suppliers').update(row).eq('id', supplierId).eq('local_id', localId).select('id,name,contact,delivery_cycle_weekdays').single();
  if (error) throw new Error(error.message);

  if (input.deliveryExceptionDates !== undefined) {
    const dates = normalizeDeliveryExceptionDates(input.deliveryExceptionDates);
    const del = await supabase
      .from('pedido_supplier_delivery_exceptions')
      .delete()
      .eq('local_id', localId)
      .eq('supplier_id', supplierId);
    if (del.error && !isMissingDeliveryExceptionTableError(del.error.message)) {
      throw new Error(del.error.message);
    }
    if (dates.length > 0) {
      const ins = await supabase.from('pedido_supplier_delivery_exceptions').insert(
        dates.map((d) => ({
          local_id: localId,
          supplier_id: supplierId,
          delivery_date: d,
          reason: 'excepcion-semanal',
        })),
      );
      if (ins.error && !isMissingDeliveryExceptionTableError(ins.error.message)) {
        throw new Error(ins.error.message);
      }
    }
  }

  return data as SupplierRow;
}

export async function deleteSupplier(supabase: SupabaseClient, localId: string, supplierId: string) {
  const { error } = await supabase
    .from('pedido_suppliers')
    .delete()
    .eq('id', supplierId)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}

function normalizePackRecipeFields(input: { unitsPerPack?: number; recipeUnit?: Unit | null }) {
  const raw = input.unitsPerPack != null && Number.isFinite(input.unitsPerPack) ? Number(input.unitsPerPack) : 1;
  const unitsPerPack = raw > 0 ? Math.round(raw * 10000) / 10000 : 1;
  const recipeUnit: Unit | null =
    unitsPerPack > 1 ? (input.recipeUnit != null ? input.recipeUnit : 'ud') : null;
  return { unitsPerPack, recipeUnit };
}

type SupplierProductBillingResolved = {
  pricePerUnit: number;
  billingUnit: Unit | null;
  billingQtyPerOrderUnit: number | null;
  pricePerBillingUnit: number | null;
  estimatedKgPerUnit: number | null;
};

function resolveSupplierProductBilling(input: {
  unit: Unit;
  pricePerUnit: number;
  billingUnit?: Unit | null;
  billingQtyPerOrderUnit?: number | null;
  pricePerBillingUnit?: number | null;
  estimatedKgPerUnit?: number | null;
}): SupplierProductBillingResolved {
  const bUnit = input.billingUnit ?? null;
  const bQty =
    input.billingQtyPerOrderUnit != null && Number.isFinite(input.billingQtyPerOrderUnit)
      ? Number(input.billingQtyPerOrderUnit)
      : null;
  const pBill =
    input.pricePerBillingUnit != null && Number.isFinite(input.pricePerBillingUnit)
      ? Number(input.pricePerBillingUnit)
      : null;

  const dual =
    bUnit != null &&
    bUnit !== input.unit &&
    bQty != null &&
    bQty > 0 &&
    pBill != null &&
    pBill >= 0;

  if (dual) {
    const pricePerUnit = Math.round(bQty * pBill * 100) / 100;
    const pricePerBillingUnit = Math.round(pBill * 10000) / 10000;
    const billingQtyPerOrderUnit = Math.round(bQty * 10000) / 10000;
    let estimatedKgPerUnit: number | null = null;
    if (bUnit === 'kg') {
      estimatedKgPerUnit = Math.round(bQty * 1000) / 1000;
    } else if (unitSupportsReceivedWeightKg(input.unit)) {
      const est = input.estimatedKgPerUnit;
      if (est != null && Number.isFinite(est) && est > 0) estimatedKgPerUnit = Math.round(est * 1000) / 1000;
    }
    return {
      pricePerUnit,
      billingUnit: bUnit,
      billingQtyPerOrderUnit,
      pricePerBillingUnit,
      estimatedKgPerUnit,
    };
  }

  const estSimple =
    unitSupportsReceivedWeightKg(input.unit) &&
    input.estimatedKgPerUnit != null &&
    Number.isFinite(input.estimatedKgPerUnit) &&
    input.estimatedKgPerUnit > 0
      ? Math.round(input.estimatedKgPerUnit * 1000) / 1000
      : null;
  return {
    pricePerUnit: Math.round(input.pricePerUnit * 100) / 100,
    billingUnit: null,
    billingQtyPerOrderUnit: null,
    pricePerBillingUnit: null,
    estimatedKgPerUnit: estSimple,
  };
}

const SUPPLIER_PRODUCT_SELECT_FULL =
  'id,supplier_id,article_id,name,unit,price_per_unit,units_per_pack,recipe_unit,vat_rate,par_stock,is_active,estimated_kg_per_unit,billing_unit,billing_qty_per_order_unit,price_per_billing_unit';
const SUPPLIER_PRODUCT_SELECT_LEGACY =
  'id,supplier_id,article_id,name,unit,price_per_unit,units_per_pack,recipe_unit,vat_rate,par_stock,is_active,estimated_kg_per_unit';

export async function createSupplierProduct(
  supabase: SupabaseClient,
  localId: string,
  supplierId: string,
  input: {
    name: string;
    unit: Unit;
    pricePerUnit: number;
    vatRate?: number;
    parStock?: number;
    estimatedKgPerUnit?: number | null;
    unitsPerPack?: number;
    recipeUnit?: Unit | null;
    billingUnit?: Unit | null;
    billingQtyPerOrderUnit?: number | null;
    pricePerBillingUnit?: number | null;
  },
) {
  const bill = resolveSupplierProductBilling({
    unit: input.unit,
    pricePerUnit: input.pricePerUnit,
    billingUnit: input.billingUnit,
    billingQtyPerOrderUnit: input.billingQtyPerOrderUnit,
    pricePerBillingUnit: input.pricePerBillingUnit,
    estimatedKgPerUnit: input.estimatedKgPerUnit,
  });
  const { unitsPerPack, recipeUnit } = normalizePackRecipeFields({
    unitsPerPack: input.unitsPerPack,
    recipeUnit: input.recipeUnit,
  });
  const insertRow: Record<string, unknown> = {
    local_id: localId,
    supplier_id: supplierId,
    name: normalizeLabelUpper(input.name),
    unit: input.unit,
    price_per_unit: bill.pricePerUnit,
    units_per_pack: unitsPerPack,
    recipe_unit: recipeUnit,
    vat_rate: Math.max(0, Math.round((input.vatRate ?? 0) * 10000) / 10000),
    par_stock: Math.max(0, Math.round((input.parStock ?? 0) * 100) / 100),
    is_active: true,
    estimated_kg_per_unit: bill.estimatedKgPerUnit,
    billing_unit: bill.billingUnit,
    billing_qty_per_order_unit: bill.billingQtyPerOrderUnit,
    price_per_billing_unit: bill.pricePerBillingUnit,
  };
  let data: SupplierProductRow | null = null;
  {
    const ins = await supabase.from('pedido_supplier_products').insert(insertRow).select(SUPPLIER_PRODUCT_SELECT_FULL).single();
    if (ins.error && isMissingOrderItemBillingColumnsError(ins.error.message)) {
      const { billing_unit: _b, billing_qty_per_order_unit: _q, price_per_billing_unit: _p, ...legacyInsert } = insertRow;
      const ins2 = await supabase
        .from('pedido_supplier_products')
        .insert(legacyInsert)
        .select(SUPPLIER_PRODUCT_SELECT_LEGACY)
        .single();
      if (ins2.error) throw new Error(ins2.error.message);
      data = ins2.data as SupplierProductRow;
    } else if (ins.error) {
      throw new Error(ins.error.message);
    } else {
      data = ins.data as SupplierProductRow;
    }
  }
  if (!data) throw new Error('No se pudo crear el producto.');
  const row = data;
  try {
    const linked = await linkPurchaseArticleToNewSupplierProduct(supabase, localId, row.id, row.supplier_id, {
      nombre: row.name,
      unidadBase: row.unit,
      activo: row.is_active,
      costeMaster: Number(row.price_per_unit),
    });
    if (linked) {
      const refetch = await supabase
        .from('pedido_supplier_products')
        .select(SUPPLIER_PRODUCT_SELECT_FULL)
        .eq('id', row.id)
        .eq('local_id', localId)
        .single();
      if (!refetch.error && refetch.data) return refetch.data as SupplierProductRow;
      const refLegacy = await supabase
        .from('pedido_supplier_products')
        .select(SUPPLIER_PRODUCT_SELECT_LEGACY)
        .eq('id', row.id)
        .eq('local_id', localId)
        .single();
      if (!refLegacy.error && refLegacy.data) return refLegacy.data as SupplierProductRow;
    }
  } catch (e: unknown) {
    if (e instanceof Error && isMissingPurchaseArticlesError(e.message)) {
      return row;
    }
    throw e;
  }
  return row;
}

export async function updateSupplierProduct(
  supabase: SupabaseClient,
  localId: string,
  supplierProductId: string,
  input: {
    name: string;
    unit: Unit;
    pricePerUnit: number;
    vatRate?: number;
    parStock?: number;
    estimatedKgPerUnit?: number | null;
    unitsPerPack?: number;
    recipeUnit?: Unit | null;
    /** Si true, escribe `last_price_update` (requiere migración SQL fase 10). */
    lastPriceUpdatedAt?: boolean;
    billingUnit?: Unit | null;
    billingQtyPerOrderUnit?: number | null;
    pricePerBillingUnit?: number | null;
    /** Si viene de histórico de precios: actualizar solo €/ud y, si aplica, €/kg derivado. */
    priceUpdateOnly?: boolean;
  },
) {
  const bill = input.priceUpdateOnly
    ? null
    : resolveSupplierProductBilling({
        unit: input.unit,
        pricePerUnit: input.pricePerUnit,
        billingUnit: input.billingUnit,
        billingQtyPerOrderUnit: input.billingQtyPerOrderUnit,
        pricePerBillingUnit: input.pricePerBillingUnit,
        estimatedKgPerUnit: input.estimatedKgPerUnit,
      });
  const { unitsPerPack, recipeUnit } = normalizePackRecipeFields({
    unitsPerPack: input.unitsPerPack,
    recipeUnit: input.recipeUnit,
  });
  const patch: Record<string, unknown> = input.priceUpdateOnly
    ? {
        price_per_unit: Math.round(input.pricePerUnit * 100) / 100,
        ...(input.pricePerBillingUnit != null && Number.isFinite(input.pricePerBillingUnit)
          ? { price_per_billing_unit: Math.round(input.pricePerBillingUnit * 10000) / 10000 }
          : {}),
      }
    : {
        name: normalizeLabelUpper(input.name),
        unit: input.unit,
        price_per_unit: bill!.pricePerUnit,
        units_per_pack: unitsPerPack,
        recipe_unit: recipeUnit,
        vat_rate: Math.max(0, Math.round((input.vatRate ?? 0) * 10000) / 10000),
        par_stock: Math.max(0, Math.round((input.parStock ?? 0) * 100) / 100),
        estimated_kg_per_unit: bill!.estimatedKgPerUnit,
        billing_unit: bill!.billingUnit,
        billing_qty_per_order_unit: bill!.billingQtyPerOrderUnit,
        price_per_billing_unit: bill!.pricePerBillingUnit,
      };
  if (input.lastPriceUpdatedAt) {
    patch.last_price_update = new Date().toISOString();
  }
  let data: SupplierProductRow | null = null;
  {
    const res = await supabase
      .from('pedido_supplier_products')
      .update(patch)
      .eq('id', supplierProductId)
      .eq('local_id', localId)
      .select(SUPPLIER_PRODUCT_SELECT_FULL)
      .single();
    if (res.error && isMissingOrderItemBillingColumnsError(res.error.message)) {
      const legacyPatch = { ...patch };
      delete legacyPatch.billing_unit;
      delete legacyPatch.billing_qty_per_order_unit;
      delete legacyPatch.price_per_billing_unit;
      const res2 = await supabase
        .from('pedido_supplier_products')
        .update(legacyPatch)
        .eq('id', supplierProductId)
        .eq('local_id', localId)
        .select(SUPPLIER_PRODUCT_SELECT_LEGACY)
        .single();
      if (res2.error) throw new Error(res2.error.message);
      data = res2.data as SupplierProductRow;
    } else if (res.error) {
      throw new Error(res.error.message);
    } else {
      data = res.data as SupplierProductRow;
    }
  }
  return data as SupplierProductRow;
}

export async function fetchSupplierProductRow(
  supabase: SupabaseClient,
  localId: string,
  supplierProductId: string,
): Promise<SupplierProductRow | null> {
  const full = await supabase
    .from('pedido_supplier_products')
    .select(SUPPLIER_PRODUCT_SELECT_FULL)
    .eq('local_id', localId)
    .eq('id', supplierProductId)
    .maybeSingle();
  if (full.error && isMissingOrderItemBillingColumnsError(full.error.message)) {
    const leg = await supabase
      .from('pedido_supplier_products')
      .select(SUPPLIER_PRODUCT_SELECT_LEGACY)
      .eq('local_id', localId)
      .eq('id', supplierProductId)
      .maybeSingle();
    if (leg.error) throw new Error(leg.error.message);
    return leg.data ? (leg.data as SupplierProductRow) : null;
  }
  if (full.error) throw new Error(full.error.message);
  return full.data ? (full.data as SupplierProductRow) : null;
}

export type SupplierProductPriceChangeSource = 'delivery_note_validated' | 'quick_input';

/**
 * Cambia solo el precio de catálogo, guardando fila de histórico.
 * Omite si el precio redondeado coincide con el actual.
 */
export async function updateSupplierProductPriceWithHistory(
  supabase: SupabaseClient,
  localId: string,
  supplierProductId: string,
  newPricePerUnit: number,
  meta: {
    source: SupplierProductPriceChangeSource;
    deliveryNoteId?: string | null;
    userId?: string | null;
    /** Si ya tienes la fila (p. ej. comprobación de unidad), evita un segundo SELECT. */
    existingRow?: SupplierProductRow | null;
  },
): Promise<{ changed: boolean }> {
  const row = meta.existingRow ?? (await fetchSupplierProductRow(supabase, localId, supplierProductId));
  if (!row) throw new Error('Producto de proveedor no encontrado.');
  const oldP = Math.round(Number(row.price_per_unit) * 100) / 100;
  const newP = Math.round(newPricePerUnit * 100) / 100;
  if (!Number.isFinite(newP) || newP < 0) throw new Error('Precio no válido.');
  if (Math.abs(oldP - newP) < 0.005) return { changed: false };

  const { error: hErr } = await supabase.from('pedido_supplier_product_price_history').insert({
    local_id: localId,
    supplier_product_id: supplierProductId,
    old_price_per_unit: oldP,
    new_price_per_unit: newP,
    source: meta.source,
    delivery_note_id: meta.deliveryNoteId ?? null,
    created_by: meta.userId ?? null,
  });
  if (hErr) {
    const msg = hErr.message.toLowerCase();
    if (
      msg.includes('pedido_supplier_product_price_history') &&
      (msg.includes('does not exist') || msg.includes('schema cache'))
    ) {
      throw new Error('Falta la tabla de histórico de precios. Ejecuta el SQL de supabase-pedidos-delivery-notes.sql.');
    }
    throw new Error(hErr.message);
  }

  const packRaw = row.units_per_pack != null ? Number(row.units_per_pack) : 1;
  const unitsPerPack = Number.isFinite(packRaw) && packRaw > 0 ? packRaw : 1;
  const recipeUnit: Unit | null =
    unitsPerPack > 1 && row.recipe_unit != null && String(row.recipe_unit).trim() !== ''
      ? (String(row.recipe_unit) as Unit)
      : null;

  let derivedPricePerBilling: number | undefined;
  if (
    row.billing_unit === 'kg' &&
    row.billing_qty_per_order_unit != null &&
    Number(row.billing_qty_per_order_unit) > 0
  ) {
    derivedPricePerBilling = Math.round((newP / Number(row.billing_qty_per_order_unit)) * 10000) / 10000;
  }

  await updateSupplierProduct(supabase, localId, supplierProductId, {
    name: row.name,
    unit: row.unit as Unit,
    pricePerUnit: newP,
    vatRate: Number(row.vat_rate ?? 0),
    parStock: Number(row.par_stock ?? 0),
    estimatedKgPerUnit: row.estimated_kg_per_unit != null ? Number(row.estimated_kg_per_unit) : null,
    unitsPerPack,
    recipeUnit,
    lastPriceUpdatedAt: true,
    priceUpdateOnly: true,
    ...(derivedPricePerBilling != null ? { pricePerBillingUnit: derivedPricePerBilling } : {}),
  });

  return { changed: true };
}

export async function setSupplierProductActive(
  supabase: SupabaseClient,
  localId: string,
  supplierProductId: string,
  isActive: boolean,
) {
  const { error } = await supabase
    .from('pedido_supplier_products')
    .update({ is_active: isActive })
    .eq('id', supplierProductId)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function fetchOrders(
  supabase: SupabaseClient,
  localId: string,
  options?: FetchOrdersOptions,
): Promise<PedidoOrder[]> {
  const signal = options?.signal;
  const recentDays =
    options?.recentDays === undefined ? FETCH_ORDERS_DEFAULT_RECENT_DAYS : options.recentDays;
  const createdCutoffIso =
    recentDays != null && recentDays > 0
      ? new Date(Date.now() - recentDays * 86_400_000).toISOString()
      : null;

  const orderRows = await runPurchaseOrderHeaderQuery(supabase, localId, (q) => {
    let r = q;
    if (signal) r = r.abortSignal(signal);
    if (createdCutoffIso) r = r.gte('created_at', createdCutoffIso);
    return r;
  });

  const itemRows = await fetchPurchaseOrderItemRows(
    supabase,
    orderRows.map((row) => row.id),
    { signal },
  );
  const profileByUserId = await fetchProfileLabelsByUserId(
    supabase,
    orderRows.map((r) => r.created_by).filter((id): id is string => Boolean(id)),
    { signal },
  );
  return buildPedidoOrdersFromRows(orderRows, itemRows, profileByUserId);
}

/**
 * Pedidos enviados/recibidos cuya fecha de compromiso (sent_at o created_at) cae en [fromYmd, toYmd].
 * Para Finanzas: evita descargar todo el histórico.
 */
export async function fetchOrdersForFinanzasCommitment(
  supabase: SupabaseClient,
  localId: string,
  fromYmd: string,
  toYmd: string,
  options?: { signal?: AbortSignal },
): Promise<PedidoOrder[]> {
  const signal = options?.signal;
  const fromIso = `${fromYmd}T00:00:00.000Z`;
  const toIso = `${toYmd}T23:59:59.999Z`;

  const partA = await runPurchaseOrderHeaderQuery(supabase, localId, (q) => {
    let r = q
      .in('status', ['sent', 'received'])
      .not('sent_at', 'is', null)
      .gte('sent_at', fromIso)
      .lte('sent_at', toIso);
    if (signal) r = r.abortSignal(signal);
    return r;
  });
  const partB = await runPurchaseOrderHeaderQuery(supabase, localId, (q) => {
    let r = q
      .in('status', ['sent', 'received'])
      .is('sent_at', null)
      .gte('created_at', fromIso)
      .lte('created_at', toIso);
    if (signal) r = r.abortSignal(signal);
    return r;
  });

  const byId = new Map<string, OrderRow>();
  for (const row of partA) byId.set(row.id, row);
  for (const row of partB) byId.set(row.id, row);
  const orderRows = Array.from(byId.values()).sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );

  const itemRows = await fetchPurchaseOrderItemRows(
    supabase,
    orderRows.map((r) => r.id),
    { signal },
  );
  const profileByUserId = await fetchProfileLabelsByUserId(
    supabase,
    orderRows.map((r) => r.created_by).filter((id): id is string => Boolean(id)),
    { signal },
  );
  return buildPedidoOrdersFromRows(orderRows, itemRows, profileByUserId);
}

/** Una sola cabecera + líneas (menos datos que `fetchOrders`; útil tras crear un pedido). */
export async function fetchOrderById(
  supabase: SupabaseClient,
  localId: string,
  orderId: string,
): Promise<PedidoOrder | null> {
  let row: OrderRow | null = null;
  {
    const withRevision = await supabase
      .from('purchase_orders')
      .select(PURCHASE_ORDER_HEADER_SEL_WITH_REVISION)
      .eq('local_id', localId)
      .eq('id', orderId)
      .maybeSingle();
    if (withRevision.error) {
      if (isMissingContentRevisedAfterSentColumnError(withRevision.error.message)) {
        const withUpdated = await supabase
          .from('purchase_orders')
          .select(PURCHASE_ORDER_HEADER_SEL_WITH_UPDATED)
          .eq('local_id', localId)
          .eq('id', orderId)
          .maybeSingle();
        if (withUpdated.error) {
          if (!isMissingPurchaseOrdersUpdatedAtColumnError(withUpdated.error.message)) {
            throw new Error(withUpdated.error.message);
          }
          const legacy = await supabase
            .from('purchase_orders')
            .select(PURCHASE_ORDER_HEADER_SEL_LEGACY)
            .eq('local_id', localId)
            .eq('id', orderId)
            .maybeSingle();
          if (legacy.error) throw new Error(legacy.error.message);
          row = (legacy.data as OrderRow | null) ?? null;
        } else {
          row = (withUpdated.data as OrderRow | null) ?? null;
        }
      } else if (isMissingPurchaseOrdersUpdatedAtColumnError(withRevision.error.message)) {
        const legacy = await supabase
          .from('purchase_orders')
          .select(PURCHASE_ORDER_HEADER_SEL_LEGACY)
          .eq('local_id', localId)
          .eq('id', orderId)
          .maybeSingle();
        if (legacy.error) throw new Error(legacy.error.message);
        row = (legacy.data as OrderRow | null) ?? null;
      } else {
        throw new Error(withRevision.error.message);
      }
    } else {
      row = (withRevision.data as OrderRow | null) ?? null;
    }
  }
  if (!row) return null;

  const itemRows = await fetchPurchaseOrderItemRows(supabase, [orderId], { localId });
  const profileByUserId = await fetchProfileLabelsByUserId(
    supabase,
    row.created_by ? [row.created_by] : [],
  );
  const [order] = buildPedidoOrdersFromRows([row], itemRows, profileByUserId);
  return order ?? null;
}

export type MergePedidoOrdersOptions = {
  /** Ids borrados en BD en esta sesión: no revivirlos aunque sigan en `prev` o en caché local. */
  tombstoneIds?: ReadonlySet<string>;
  /**
   * Tras marcar recibido: mientras exista entrada, si Supabase devuelve `sent` (réplica atrasada), fusionar como `received`.
   * Quitar con clearPendingReceivedOrder. `priceReviewArchivedAt` opcional en el pin.
   */
  pendingReceivedById?: ReadonlyMap<
    string,
    { markedAt: number; receivedAtIso: string; priceReviewArchivedAt?: string }
  >;
};

/**
 * Fusiona lista previa con la respuesta del servidor. Si pasas `pinUntilSeenOnServer`, esas ids se mantienen
 * en pantalla hasta que el servidor las devuelva; luego se eliminan del Set (mutación intencionada).
 */
export function mergePedidoOrdersFromServer(
  prev: PedidoOrder[],
  server: PedidoOrder[],
  pinUntilSeenOnServer?: Set<string>,
  opts?: MergePedidoOrdersOptions,
): PedidoOrder[] {
  const tombstones = opts?.tombstoneIds;
  const pendingReceived = opts?.pendingReceivedById;
  const serverIds = new Set(server.map((o) => o.id));
  /** Solo pins (pedido recién creado): sin ventana «reciente», para que borrados en otro dispositivo no reaparezcan. */
  const extras = prev.filter((o) => {
    if (tombstones?.has(o.id)) return false;
    if (serverIds.has(o.id)) return false;
    return pinUntilSeenOnServer?.has(o.id) ?? false;
  });
  const byId = new Map<string, PedidoOrder>();
  for (const row of server) {
    const prevRow = prev.find((p) => p.id === row.id);
    let out: PedidoOrder =
      prevRow?.priceReviewArchivedAt && row.priceReviewArchivedAt == null
        ? { ...row, priceReviewArchivedAt: prevRow.priceReviewArchivedAt }
        : row;
    const pend = pendingReceived?.get(out.id);
    // Pin de «marcar recibido»: si la lectura sigue en `sent` (réplica), forzar vista recibida hasta quitar el pin.
    if (pend && out.status === 'sent') {
      out = {
        ...out,
        status: 'received',
        receivedAt: pend.receivedAtIso,
        ...(pend.priceReviewArchivedAt != null ? { priceReviewArchivedAt: pend.priceReviewArchivedAt } : {}),
      };
    }
    byId.set(row.id, out);
  }
  for (const row of extras) {
    if (tombstones?.has(row.id)) continue;
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  if (pinUntilSeenOnServer) {
    for (const id of serverIds) pinUntilSeenOnServer.delete(id);
  }
  return Array.from(byId.values())
    .filter((o) => !tombstones?.has(o.id))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * Actualización incremental (Realtime): sustituye un pedido en lista sin refetch global.
 * Replica overlays de `mergePedidoOrdersFromServer` (archivo recepción / pin recibido).
 */
export function upsertPedidoOrderInList(
  prev: PedidoOrder[],
  fresh: PedidoOrder,
  opts?: MergePedidoOrdersOptions,
): PedidoOrder[] {
  const tombstones = opts?.tombstoneIds;
  const pendingReceived = opts?.pendingReceivedById;
  const prevRow = prev.find((p) => p.id === fresh.id);
  let out = fresh;
  if (prevRow?.priceReviewArchivedAt && fresh.priceReviewArchivedAt == null) {
    out = { ...fresh, priceReviewArchivedAt: prevRow.priceReviewArchivedAt };
  }
  const pend = pendingReceived?.get(out.id);
  if (pend && out.status === 'sent') {
    out = {
      ...out,
      status: 'received',
      receivedAt: pend.receivedAtIso,
      ...(pend.priceReviewArchivedAt != null ? { priceReviewArchivedAt: pend.priceReviewArchivedAt } : {}),
    };
  }
  const others = prev.filter((o) => o.id !== fresh.id);
  const merged = [out, ...others];
  return merged
    .filter((o) => !tombstones?.has(o.id))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Borrado incremental (Realtime u otra fuente). */
export function removePedidoOrderFromList(
  prev: PedidoOrder[],
  orderId: string,
  opts?: { tombstoneIds?: ReadonlySet<string> },
): PedidoOrder[] {
  const tombstones = opts?.tombstoneIds;
  return prev
    .filter((o) => o.id !== orderId)
    .filter((o) => !tombstones?.has(o.id));
}

export async function saveOrder(
  supabase: SupabaseClient,
  localId: string,
  payload: {
    orderId?: string;
    supplierId: string;
    status: PedidoStatus;
    notes: string;
    sentAt?: string;
    createdAt?: string;
    deliveryDate?: string;
    expectedOrderUpdatedAt?: string;
    /** Pedido ya enviado: marcar columna content_revised_after_sent_at en BD (requiere RPC migrado). */
    markContentRevisedAfterSent?: boolean;
    /** Nombre del responsable del pedido (se guarda en usuario_nombre). */
    usuarioNombre?: string;
    items: Array<{
      supplierProductId: string | null;
      productName: string;
      unit: Unit;
      quantity: number;
      receivedQuantity: number;
      pricePerUnit: number;
      vatRate: number;
      lineTotal: number;
      estimatedKgPerUnit?: number | null;
      receivedWeightKg?: number | null;
      basePricePerUnit?: number | null;
      incidentType?: 'missing' | 'damaged' | 'wrong-item' | null;
      incidentNotes?: string | null;
      receivedPricePerKg?: number | null;
      billingUnit?: Unit | null;
      billingQtyPerOrderUnit?: number | null;
      pricePerBillingUnit?: number | null;
    }>;
  },
) {
  const rpcItems = payload.items.map((item) => ({
    supplier_product_id: item.supplierProductId,
    product_name: item.productName,
    unit: item.unit,
    quantity: item.quantity,
    received_quantity: item.receivedQuantity,
    price_per_unit: Math.round(item.pricePerUnit * 100) / 100,
    base_price_per_unit:
      item.basePricePerUnit != null && Number.isFinite(item.basePricePerUnit)
        ? Math.round(item.basePricePerUnit * 100) / 100
        : Math.round(item.pricePerUnit * 100) / 100,
    vat_rate: Math.max(0, Math.round((item.vatRate ?? 0) * 10000) / 10000),
    line_total: Math.round(item.lineTotal * 100) / 100,
    estimated_kg_per_unit:
      unitSupportsReceivedWeightKg(item.unit) &&
      item.estimatedKgPerUnit != null &&
      Number.isFinite(item.estimatedKgPerUnit) &&
      item.estimatedKgPerUnit > 0
        ? Math.round(item.estimatedKgPerUnit * 1000) / 1000
        : null,
    received_weight_kg:
      item.unit === 'kg'
        ? item.receivedWeightKg != null &&
          Number.isFinite(item.receivedWeightKg) &&
          item.receivedWeightKg > 0
          ? Math.round(item.receivedWeightKg * 1000) / 1000
          : null
        : unitSupportsReceivedWeightKg(item.unit) &&
            item.receivedWeightKg != null &&
            Number.isFinite(item.receivedWeightKg) &&
            item.receivedWeightKg > 0
          ? Math.round(item.receivedWeightKg * 1000) / 1000
          : null,
    incident_type: item.incidentType ?? null,
    incident_notes: item.incidentNotes?.trim() ? item.incidentNotes.trim() : null,
    received_price_per_kg:
      item.receivedPricePerKg != null && Number.isFinite(item.receivedPricePerKg)
        ? Math.round(item.receivedPricePerKg * 10000) / 10000
        : null,
    billing_unit: item.billingUnit ?? null,
    billing_qty_per_order_unit:
      item.billingQtyPerOrderUnit != null && Number.isFinite(item.billingQtyPerOrderUnit) && item.billingQtyPerOrderUnit > 0
        ? Math.round(item.billingQtyPerOrderUnit * 10000) / 10000
        : null,
    price_per_billing_unit:
      item.pricePerBillingUnit != null && Number.isFinite(item.pricePerBillingUnit) && item.pricePerBillingUnit >= 0
        ? Math.round(item.pricePerBillingUnit * 10000) / 10000
        : null,
  }));

  const { data, error } = await supabase.rpc('save_purchase_order_with_items', {
    p_order_id: payload.orderId ?? null,
    p_local_id: localId,
    p_supplier_id: payload.supplierId,
    p_status: payload.status,
    p_notes: payload.notes.trim(),
    p_sent_at: payload.status === 'sent' ? payload.sentAt ?? new Date().toISOString() : null,
    p_delivery_date: payload.deliveryDate ?? null,
    p_items: rpcItems,
    p_expected_order_updated_at: payload.expectedOrderUpdatedAt ?? null,
    p_mark_content_revised_after_sent: Boolean(payload.markContentRevisedAfterSent),
    p_usuario_nombre: payload.usuarioNombre?.trim() ? payload.usuarioNombre.trim() : null,
  });

  if (error) {
    if (isMissingSaveOrderRpcError(error.message)) {
      throw new Error(
        'Falta la función SQL save_purchase_order_with_items en Supabase. Ejecuta el último supabase-pedidos-schema.sql y vuelve a intentar.',
      );
    }
    if (isOrderConcurrencyConflictMessage(error.message)) {
      throw new Error('Otro dispositivo actualizó este pedido antes que tú. Recarga Pedidos y vuelve a guardar.');
    }
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const orderId = row && typeof row === 'object' && 'order_id' in row ? String((row as { order_id: string }).order_id) : '';
  if (!orderId) throw new Error('No se pudo guardar el pedido.');
  return orderId;
}

export async function updateOrderItemIncident(
  supabase: SupabaseClient,
  localId: string,
  itemId: string,
  incident: { type: 'missing' | 'damaged' | 'wrong-item' | null; notes?: string },
) {
  const { error } = await supabase
    .from('purchase_order_items')
    .update({
      incident_type: incident.type,
      incident_notes: incident.notes?.trim() ? incident.notes.trim() : null,
    })
    .eq('id', itemId)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function fetchSupplierProductPriceHistory(
  supabase: SupabaseClient,
  localId: string,
  supplierProductIds: string[],
) {
  if (!supplierProductIds.length) return new Map<string, SupplierProductPriceHistory>();
  const { data, error } = await supabase
    .from('purchase_order_items')
    .select('supplier_product_id,price_per_unit,created_at')
    .eq('local_id', localId)
    .in('supplier_product_id', supplierProductIds)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const out = new Map<string, SupplierProductPriceHistory>();
  const grouped = new Map<string, number[]>();
  for (const row of (data ?? []) as Array<{ supplier_product_id: string | null; price_per_unit: number }>) {
    if (!row.supplier_product_id) continue;
    const list = grouped.get(row.supplier_product_id) ?? [];
    list.push(Number(row.price_per_unit));
    grouped.set(row.supplier_product_id, list);
  }
  for (const [id, prices] of grouped.entries()) {
    if (!prices.length) continue;
    const sum = prices.reduce((acc, n) => acc + n, 0);
    out.set(id, {
      supplierProductId: id,
      lastPrice: prices[0],
      avgPrice: Math.round((sum / prices.length) * 100) / 100,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      samples: prices.length,
    });
  }
  return out;
}

/**
 * Último €/kg guardado en recepción por producto de proveedor (líneas con `received_price_per_kg` > 0).
 */
export async function fetchLastReceivedPricePerKgBySupplierProductIds(
  supabase: SupabaseClient,
  localId: string,
  supplierProductIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!supplierProductIds.length) return out;

  const { data, error } = await supabase
    .from('purchase_order_items')
    .select('supplier_product_id, received_price_per_kg, created_at')
    .eq('local_id', localId)
    .in('supplier_product_id', supplierProductIds)
    .not('received_price_per_kg', 'is', null)
    .gt('received_price_per_kg', 0)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as Array<{
    supplier_product_id: string | null;
    received_price_per_kg: number | string | null;
  }>) {
    const sid = row.supplier_product_id;
    if (!sid || out.has(sid)) continue;
    const v = Number(row.received_price_per_kg);
    if (!Number.isFinite(v) || v <= 0) continue;
    out.set(sid, Math.round(v * 10000) / 10000);
  }
  return out;
}

/** Pistas para sugerir €/kg en recepción (artículo máster + catálogo vivo facturación por kg). */
export type ReceptionEuroPerKgHints = {
  /** `purchase_articles.coste_unitario_uso` cuando `unidad_uso` es kg. */
  articleEuroPerKg: number | null;
  /** `pedido_supplier_products.price_per_billing_unit` cuando `billing_unit` es kg. */
  catalogBillingEuroPerKg: number | null;
};

/**
 * Por producto de proveedor: coste máster en €/kg (si aplica) y €/kg de catálogo cuando la factura es por kg.
 */
export async function fetchReceptionEuroPerKgHintsBySupplierProductIds(
  supabase: SupabaseClient,
  localId: string,
  supplierProductIds: string[],
): Promise<Map<string, ReceptionEuroPerKgHints>> {
  const out = new Map<string, ReceptionEuroPerKgHints>();
  if (!supplierProductIds.length) return out;

  const { data, error } = await supabase
    .from('pedido_supplier_products')
    .select('id,article_id,billing_unit,price_per_billing_unit')
    .eq('local_id', localId)
    .in('id', supplierProductIds);
  if (error) throw new Error(error.message);

  const articleIds = new Set<string>();
  const catalogBillingByPid = new Map<string, number | null>();
  const articleIdByPid = new Map<string, string | null>();

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const id = String(row.id);
    const aid = row.article_id != null ? String(row.article_id) : null;
    articleIdByPid.set(id, aid);
    if (aid) articleIds.add(aid);
    const bu = row.billing_unit != null ? String(row.billing_unit).trim().toLowerCase() : '';
    const rawPpb = row.price_per_billing_unit != null ? Number(row.price_per_billing_unit) : null;
    const billingEuro =
      bu === 'kg' && rawPpb != null && Number.isFinite(rawPpb) && rawPpb > 0
        ? Math.round(rawPpb * 10000) / 10000
        : null;
    catalogBillingByPid.set(id, billingEuro);
  }

  const articleHints = await fetchPurchaseArticleCostHintsByIds(supabase, localId, [...articleIds]);

  for (const pid of supplierProductIds) {
    let articleEuroPerKg: number | null = null;
    const aid = articleIdByPid.get(pid) ?? null;
    if (aid) {
      const ah = articleHints.get(aid);
      if (ah) {
        const u = (ah.unidadUso ?? '').trim().toLowerCase();
        if (
          u === 'kg' &&
          ah.costeUnitarioUso != null &&
          Number.isFinite(ah.costeUnitarioUso) &&
          ah.costeUnitarioUso > 0
        ) {
          articleEuroPerKg = Math.round(ah.costeUnitarioUso * 10000) / 10000;
        }
      }
    }
    out.set(pid, {
      articleEuroPerKg,
      catalogBillingEuroPerKg: catalogBillingByPid.get(pid) ?? null,
    });
  }
  return out;
}

/** Media de €/kg declarados en recepciones anteriores (PMP simple por líneas con dato). */
export async function fetchAvgReceivedPricePerKgBySupplierProductIds(
  supabase: SupabaseClient,
  localId: string,
  supplierProductIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!supplierProductIds.length) return out;

  const { data, error } = await supabase
    .from('purchase_order_items')
    .select('supplier_product_id,received_price_per_kg')
    .eq('local_id', localId)
    .in('supplier_product_id', supplierProductIds)
    .not('received_price_per_kg', 'is', null)
    .gt('received_price_per_kg', 0);
  if (error) throw new Error(error.message);

  const sums = new Map<string, { sum: number; count: number }>();
  for (const row of (data ?? []) as Array<{
    supplier_product_id: string | null;
    received_price_per_kg: number | string | null;
  }>) {
    const sid = row.supplier_product_id;
    if (!sid) continue;
    const v = Number(row.received_price_per_kg);
    if (!Number.isFinite(v) || v <= 0) continue;
    const cur = sums.get(sid) ?? { sum: 0, count: 0 };
    cur.sum += v;
    cur.count += 1;
    sums.set(sid, cur);
  }
  for (const [sid, { sum, count }] of sums) {
    if (count < 1) continue;
    out.set(sid, Math.round((sum / count) * 10000) / 10000);
  }
  return out;
}

/**
 * Precios efectivos en pedidos recientes por producto de proveedor (más recientes primero).
 * Agrupa en memoria y recorta a `maxPerProduct` filas por id.
 */
export async function fetchSupplierProductPriceSamples(
  supabase: SupabaseClient,
  localId: string,
  supplierProductIds: string[],
  opts?: { maxTotalRows?: number; maxPerProduct?: number },
): Promise<Map<string, SupplierProductPriceSample[]>> {
  const maxTotal = opts?.maxTotalRows ?? 500;
  const maxPerProduct = opts?.maxPerProduct ?? 14;
  const out = new Map<string, SupplierProductPriceSample[]>();
  if (!supplierProductIds.length) return out;

  const { data, error } = await supabase
    .from('purchase_order_items')
    .select('supplier_product_id,price_per_unit,created_at')
    .eq('local_id', localId)
    .in('supplier_product_id', supplierProductIds)
    .order('created_at', { ascending: false })
    .limit(maxTotal);
  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{
    supplier_product_id: string | null;
    price_per_unit: number;
    created_at: string;
  }>) {
    const sid = row.supplier_product_id;
    if (!sid) continue;
    const c = counts.get(sid) ?? 0;
    if (c >= maxPerProduct) continue;
    counts.set(sid, c + 1);
    const list = out.get(sid) ?? [];
    list.push({
      supplierProductId: sid,
      pricePerUnit: Math.round(Number(row.price_per_unit) * 100) / 100,
      at: String(row.created_at),
    });
    out.set(sid, list);
  }
  return out;
}

export async function deleteOrder(supabase: SupabaseClient, localId: string, orderId: string) {
  const { error } = await supabase
    .from('purchase_orders')
    .delete()
    .eq('id', orderId)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);

  // Some deployments can return empty delete payloads even when row-level delete succeeded.
  // Confirm by checking current state after delete.
  const { data: stillExists, error: checkError } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('id', orderId)
    .eq('local_id', localId)
    .maybeSingle();
  if (checkError) throw new Error(checkError.message);
  if (stillExists?.id) {
    throw new Error('No se pudo eliminar el pedido: sin permisos o pedido no encontrado para este local.');
  }
}

export async function setOrderStatus(
  supabase: SupabaseClient,
  localId: string,
  orderId: string,
  status: PedidoStatus,
  nowIso = new Date().toISOString(),
  options?: { expectedUpdatedAt?: string },
) {
  const patch: {
    status: PedidoStatus;
    sent_at?: string | null;
    received_at?: string | null;
    price_review_archived_at?: string | null;
  } = { status };
  if (status === 'sent') patch.sent_at = nowIso;
  if (status === 'received') {
    patch.received_at = nowIso;
    patch.price_review_archived_at = null;
  }
  if (status === 'draft') {
    patch.sent_at = null;
    patch.received_at = null;
  }
  let query = supabase.from('purchase_orders').update(patch).eq('id', orderId).eq('local_id', localId);
  if (options?.expectedUpdatedAt) {
    query = query.eq('updated_at', options.expectedUpdatedAt);
  }
  const { data, error } = await query.select('id').maybeSingle();
  if (error) {
    if (options?.expectedUpdatedAt && isMissingPurchaseOrdersUpdatedAtColumnError(error.message)) {
      throw new Error(
        'Falta la columna purchase_orders.updated_at en Supabase. Ejecuta el último supabase-pedidos-schema.sql.',
      );
    }
    throw new Error(error.message);
  }
  if (!data?.id) {
    if (options?.expectedUpdatedAt) {
      throw new Error('Otro dispositivo cambió este pedido antes de marcarlo. Recarga y vuelve a intentarlo.');
    }
    throw new Error('No se pudo actualizar el estado del pedido.');
  }
}

/** Pedido marcado recibido por error: vuelve a enviados sin tocar sent_at ni las líneas. */
export async function reopenReceivedOrderToSent(supabase: SupabaseClient, localId: string, orderId: string) {
  const { data, error } = await supabase
    .from('purchase_orders')
    .update({ status: 'sent', received_at: null, price_review_archived_at: null })
    .eq('id', orderId)
    .eq('local_id', localId)
    .eq('status', 'received')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) {
    throw new Error('No se pudo reabrir: el pedido no está en estado recibido o no existe.');
  }
}

export async function setOrderPriceReviewArchived(
  supabase: SupabaseClient,
  localId: string,
  orderId: string,
  archived: boolean,
) {
  const { data, error } = await supabase
    .from('purchase_orders')
    .update({ price_review_archived_at: archived ? new Date().toISOString() : null })
    .eq('id', orderId)
    .eq('local_id', localId)
    .in('status', ['sent', 'received'])
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) {
    throw new Error(
      'No se pudo archivar: ningún pedido coincidió. Suele ser falta de la columna price_review_archived_at en purchase_orders (ejecuta la migración del módulo pedidos en Supabase) o el pedido ya no está en enviado/recibido.',
    );
  }
}

/**
 * Marca el pedido recibido. Por defecto recalcula subtotales con el precio del snapshot.
 * Con `preserveOrderPricing: true` (botón «Pendiente de recibir» en Pedidos) solo guarda cantidades/peso recibidos
 * y no modifica `price_per_unit` ni `line_total`, para cotejar precios más tarde con el albarán.
 */
export async function persistSentOrderAsReceived(
  supabase: SupabaseClient,
  localId: string,
  order: PedidoOrder,
  options?: { preserveOrderPricing?: boolean },
) {
  const preserveOrderPricing = options?.preserveOrderPricing === true;
  for (const item of order.items) {
    if (item.unit === 'kg') {
      await updateOrderItemReceivedWeightKg(
        supabase,
        localId,
        item.id,
        item.receivedWeightKg != null && item.receivedWeightKg > 0 ? item.receivedWeightKg : null,
      );
    } else if (unitSupportsReceivedWeightKg(item.unit)) {
      await updateOrderItemReceivedWeightKg(
        supabase,
        localId,
        item.id,
        item.receivedWeightKg != null && item.receivedWeightKg > 0 ? item.receivedWeightKg : null,
      );
    }
    await updateOrderItemReceived(supabase, localId, item.id, item.receivedQuantity);
    if (!preserveOrderPricing) {
      if (unitCanDeclareScaleKgOnReception(item.unit)) {
        await persistReceptionItemTotals(supabase, localId, item);
      } else {
        const billingQty = billingQuantityForReceptionPrice(item);
        await updateOrderItemPrice(supabase, localId, item.id, item.pricePerUnit, billingQty);
      }
    }
  }
  await setOrderStatus(supabase, localId, order.id, 'received');
}

export async function updateOrderItemReceived(
  supabase: SupabaseClient,
  localId: string,
  itemId: string,
  receivedQuantity: number,
) {
  const { error } = await supabase
    .from('purchase_order_items')
    .update({ received_quantity: Math.max(0, Math.round(receivedQuantity * 100) / 100) })
    .eq('id', itemId)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function updateOrderItemReceivedWeightKg(
  supabase: SupabaseClient,
  localId: string,
  itemId: string,
  receivedWeightKg: number | null,
) {
  const safe =
    receivedWeightKg == null || !Number.isFinite(receivedWeightKg) || receivedWeightKg <= 0
      ? null
      : Math.round(receivedWeightKg * 1000) / 1000;
  const { error } = await supabase
    .from('purchase_order_items')
    .update({ received_weight_kg: safe })
    .eq('id', itemId)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}

/**
 * Persiste peso, €/kg real (envases ponderables), precio unitario efectivo y subtotal en una sola escritura.
 * Para líneas kg o `unitSupportsReceivedWeightKg`; el resto delega en `updateOrderItemPrice`.
 */
export async function persistReceptionItemTotals(supabase: SupabaseClient, localId: string, item: PedidoOrderItem) {
  if (!unitCanDeclareScaleKgOnReception(item.unit)) {
    const qty = billingQuantityForReceptionPrice(item);
    await updateOrderItemPrice(supabase, localId, item.id, item.pricePerUnit, qty);
    return;
  }

  const w =
    item.receivedWeightKg == null || !Number.isFinite(item.receivedWeightKg) || item.receivedWeightKg <= 0
      ? null
      : Math.round(item.receivedWeightKg * 1000) / 1000;
  let ppk: number | null =
    item.unit !== 'kg' &&
    unitSupportsReceivedWeightKg(item.unit) &&
    w != null &&
    item.receivedPricePerKg != null &&
    Number.isFinite(item.receivedPricePerKg) &&
    item.receivedPricePerKg > 0
      ? Math.round(item.receivedPricePerKg * 10000) / 10000
      : null;
  if (w == null) ppk = null;

  const { lineTotal, effectivePricePerUnit } = receptionLineTotals({
    ...item,
    receivedWeightKg: w,
    receivedPricePerKg: ppk,
  });

  const { error } = await supabase
    .from('purchase_order_items')
    .update({
      received_weight_kg: w,
      received_price_per_kg: ppk,
      price_per_unit: effectivePricePerUnit,
      line_total: lineTotal,
    })
    .eq('id', item.id)
    .eq('local_id', localId);
  if (error) {
    if (!isMissingReceivedPricePerKgColumnError(error.message)) {
      throw new Error(error.message);
    }
    const legacy = await supabase
      .from('purchase_order_items')
      .update({
        received_weight_kg: w,
        price_per_unit: effectivePricePerUnit,
        line_total: lineTotal,
      })
      .eq('id', item.id)
      .eq('local_id', localId);
    if (legacy.error) throw new Error(legacy.error.message);
  }
}

export async function updateOrderItemPrice(
  supabase: SupabaseClient,
  localId: string,
  itemId: string,
  pricePerUnit: number,
  quantity: number,
) {
  const safePrice = Math.max(0, Math.round(pricePerUnit * 100) / 100);
  const lineTotal = Math.round(safePrice * Math.max(0, quantity) * 100) / 100;
  const { error } = await supabase
    .from('purchase_order_items')
    .update({
      price_per_unit: safePrice,
      line_total: lineTotal,
    })
    .eq('id', itemId)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}

/** Parches aplicados desde OCR (solo campos definidos). */
export type AlbaranOcrApplyPatch = {
  itemId: string;
  pricePerUnit?: number;
  receivedQuantity?: number;
  receivedWeightKg?: number | null;
  receivedPricePerKg?: number | null;
};

/**
 * Aplica sugerencias OCR a líneas de recepción (Supabase + modelo coherente con `receptionLineTotals`).
 */
export async function applyAlbaranOcrPatches(
  supabase: SupabaseClient,
  localId: string,
  items: PedidoOrderItem[],
  patches: AlbaranOcrApplyPatch[],
): Promise<void> {
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const patch of patches) {
    const base = byId.get(patch.itemId);
    if (!base) continue;

    const merged: PedidoOrderItem = { ...base };
    if (patch.receivedQuantity !== undefined) {
      merged.receivedQuantity = Math.max(0, Math.round(patch.receivedQuantity * 100) / 100);
    }
    if (patch.pricePerUnit !== undefined) {
      merged.pricePerUnit = Math.max(0, Math.round(patch.pricePerUnit * 100) / 100);
    }
    if (patch.receivedWeightKg !== undefined) {
      const w = patch.receivedWeightKg;
      merged.receivedWeightKg =
        w == null || !Number.isFinite(w) || w <= 0 ? null : Math.round(w * 1000) / 1000;
    }
    if (patch.receivedPricePerKg !== undefined) {
      const p = patch.receivedPricePerKg;
      merged.receivedPricePerKg =
        p == null || !Number.isFinite(p) || p <= 0 ? null : Math.round(p * 10000) / 10000;
    }
    if (merged.unit === 'kg' && merged.receivedWeightKg != null && merged.receivedWeightKg > 0) {
      merged.receivedQuantity = merged.receivedWeightKg;
    }

    await updateOrderItemReceived(supabase, localId, patch.itemId, merged.receivedQuantity);

    if (unitCanDeclareScaleKgOnReception(merged.unit)) {
      await updateOrderItemReceivedWeightKg(
        supabase,
        localId,
        patch.itemId,
        merged.receivedWeightKg != null && merged.receivedWeightKg > 0 ? merged.receivedWeightKg : null,
      );
      await persistReceptionItemTotals(supabase, localId, merged);
    } else if (patch.pricePerUnit !== undefined || patch.receivedQuantity !== undefined) {
      await updateOrderItemPrice(
        supabase,
        localId,
        patch.itemId,
        merged.pricePerUnit,
        billingQuantityForReceptionPrice(merged),
      );
    }
  }
}
