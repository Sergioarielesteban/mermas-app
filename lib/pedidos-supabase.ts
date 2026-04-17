import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeDeliveryCycleWeekdays, normalizeDeliveryExceptionDates } from '@/lib/pedidos-coverage';
import type { Unit } from '@/lib/types';

/** Bandeja o caja: referencia kg por envase en catálogo; en recepción peso báscula opcional (no cambia el subtotal). */
export function unitSupportsReceivedWeightKg(unit: Unit): boolean {
  return unit === 'bandeja' || unit === 'caja';
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
 * Subtotal e importe unitario efectivo en Recepción.
 * Bandeja/caja: si hay kg reales y €/kg real, el subtotal es kg × €/kg y el unitario efectivo es subtotal / envases (para albarán e histórico).
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
    const denom =
      item.receivedQuantity > 0
        ? item.receivedQuantity
        : item.quantity > 0 && !lineIsMissingNotReceived(item)
          ? item.quantity
          : 0;
    const eff = denom > 0 ? Math.round((lt / denom) * 100) / 100 : item.pricePerUnit;
    return { lineTotal: lt, effectivePricePerUnit: eff };
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
  /** Copia del catálogo al guardar (bandeja/caja). */
  estimatedKgPerUnit?: number;
  /** Peso real en recepción (kg), bandeja/caja. */
  receivedWeightKg?: number | null;
  /** €/kg reales en recepción (bandeja/caja); con kg reales, subtotal = kg × €/kg. */
  receivedPricePerKg?: number | null;
  incidentType?: 'missing' | 'damaged' | 'wrong-item' | null;
  incidentNotes?: string;
  /** Precio unitario del pedido al enviar (no se sobrescribe al revisar albarán). */
  basePricePerUnit?: number;
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
  name: string;
  unit: string;
  price_per_unit: number;
  units_per_pack?: number | null;
  recipe_unit?: string | null;
  vat_rate: number;
  par_stock: number;
  is_active: boolean;
  estimated_kg_per_unit: number | null;
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
};

function isMissingReceivedPricePerKgColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('received_price_per_kg') && (m.includes('column') || m.includes('schema cache'));
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

export async function fetchSuppliersWithProducts(supabase: SupabaseClient, localId: string) {
  const { data: supplierRows, error: sErr } = await supabase
    .from('pedido_suppliers')
    .select('id,name,contact,delivery_cycle_weekdays')
    .eq('local_id', localId)
    .order('name');
  if (sErr) throw new Error(sErr.message);

  const { data: productRows, error: pErr } = await supabase
    .from('pedido_supplier_products')
    .select(
      'id,supplier_id,name,unit,price_per_unit,units_per_pack,recipe_unit,vat_rate,par_stock,is_active,estimated_kg_per_unit',
    )
    .eq('local_id', localId)
    .eq('is_active', true)
    .order('name');
  if (pErr) throw new Error(pErr.message);

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
  },
) {
  const est =
    unitSupportsReceivedWeightKg(input.unit) &&
    input.estimatedKgPerUnit != null &&
    Number.isFinite(input.estimatedKgPerUnit) &&
    input.estimatedKgPerUnit > 0
      ? Math.round(input.estimatedKgPerUnit * 1000) / 1000
      : null;
  const { unitsPerPack, recipeUnit } = normalizePackRecipeFields({
    unitsPerPack: input.unitsPerPack,
    recipeUnit: input.recipeUnit,
  });
  const { data, error } = await supabase
    .from('pedido_supplier_products')
    .insert({
      local_id: localId,
      supplier_id: supplierId,
      name: normalizeLabelUpper(input.name),
      unit: input.unit,
      price_per_unit: Math.round(input.pricePerUnit * 100) / 100,
      units_per_pack: unitsPerPack,
      recipe_unit: recipeUnit,
      vat_rate: Math.max(0, Math.round((input.vatRate ?? 0) * 10000) / 10000),
      par_stock: Math.max(0, Math.round((input.parStock ?? 0) * 100) / 100),
      is_active: true,
      estimated_kg_per_unit: est,
    })
    .select(
      'id,supplier_id,name,unit,price_per_unit,units_per_pack,recipe_unit,vat_rate,par_stock,is_active,estimated_kg_per_unit',
    )
    .single();
  if (error) throw new Error(error.message);
  return data as SupplierProductRow;
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
  },
) {
  const est =
    unitSupportsReceivedWeightKg(input.unit) &&
    input.estimatedKgPerUnit != null &&
    Number.isFinite(input.estimatedKgPerUnit) &&
    input.estimatedKgPerUnit > 0
      ? Math.round(input.estimatedKgPerUnit * 1000) / 1000
      : null;
  const { unitsPerPack, recipeUnit } = normalizePackRecipeFields({
    unitsPerPack: input.unitsPerPack,
    recipeUnit: input.recipeUnit,
  });
  const { data, error } = await supabase
    .from('pedido_supplier_products')
    .update({
      name: normalizeLabelUpper(input.name),
      unit: input.unit,
      price_per_unit: Math.round(input.pricePerUnit * 100) / 100,
      units_per_pack: unitsPerPack,
      recipe_unit: recipeUnit,
      vat_rate: Math.max(0, Math.round((input.vatRate ?? 0) * 10000) / 10000),
      par_stock: Math.max(0, Math.round((input.parStock ?? 0) * 100) / 100),
      estimated_kg_per_unit: unitSupportsReceivedWeightKg(input.unit) ? est : null,
    })
    .eq('id', supplierProductId)
    .eq('local_id', localId)
    .select(
      'id,supplier_id,name,unit,price_per_unit,units_per_pack,recipe_unit,vat_rate,par_stock,is_active,estimated_kg_per_unit',
    )
    .single();
  if (error) throw new Error(error.message);
  return data as SupplierProductRow;
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

export async function fetchOrders(supabase: SupabaseClient, localId: string) {
  let orderRows: OrderRow[] = [];
  {
    const withUpdated = await supabase
      .from('purchase_orders')
      .select(
        'id,supplier_id,status,notes,created_at,sent_at,received_at,delivery_date,price_review_archived_at,updated_at,pedido_suppliers(name,contact)',
      )
      .eq('local_id', localId)
      .order('created_at', { ascending: false });
    if (withUpdated.error) {
      if (!isMissingPurchaseOrdersUpdatedAtColumnError(withUpdated.error.message)) {
        throw new Error(withUpdated.error.message);
      }
      const legacy = await supabase
        .from('purchase_orders')
        .select(
          'id,supplier_id,status,notes,created_at,sent_at,received_at,delivery_date,price_review_archived_at,pedido_suppliers(name,contact)',
        )
        .eq('local_id', localId)
        .order('created_at', { ascending: false });
      if (legacy.error) throw new Error(legacy.error.message);
      orderRows = (legacy.data ?? []) as OrderRow[];
    } else {
      orderRows = (withUpdated.data ?? []) as OrderRow[];
    }
  }

  const ids = orderRows.map((row) => row.id);
  let itemRows: OrderItemRow[] = [];
  {
    const withPricePerKg = await supabase
      .from('purchase_order_items')
      .select(
        'id,order_id,supplier_product_id,product_name,unit,quantity,received_quantity,price_per_unit,base_price_per_unit,vat_rate,line_total,estimated_kg_per_unit,received_weight_kg,received_price_per_kg,incident_type,incident_notes',
      )
      .in('order_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    if (withPricePerKg.error) {
      if (!isMissingReceivedPricePerKgColumnError(withPricePerKg.error.message)) {
        throw new Error(withPricePerKg.error.message);
      }
      const legacy = await supabase
        .from('purchase_order_items')
        .select(
          'id,order_id,supplier_product_id,product_name,unit,quantity,received_quantity,price_per_unit,base_price_per_unit,vat_rate,line_total,estimated_kg_per_unit,received_weight_kg,incident_type,incident_notes',
        )
        .in('order_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
      if (legacy.error) throw new Error(legacy.error.message);
      itemRows = (legacy.data ?? []) as OrderItemRow[];
    } else {
      itemRows = (withPricePerKg.data ?? []) as OrderItemRow[];
    }
  }

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
    });
    byOrder.set(row.order_id, list);
  }

  const orders: PedidoOrder[] = orderRows.map((row) => {
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
      items,
      total: items.reduce((acc, item) => acc + item.lineTotal, 0),
    };
  });
  return orders;
}

/** Una sola cabecera + líneas (menos datos que `fetchOrders`; útil tras crear un pedido). */
export async function fetchOrderById(
  supabase: SupabaseClient,
  localId: string,
  orderId: string,
): Promise<PedidoOrder | null> {
  let row: OrderRow | null = null;
  {
    const withUpdated = await supabase
      .from('purchase_orders')
      .select(
        'id,supplier_id,status,notes,created_at,sent_at,received_at,delivery_date,price_review_archived_at,updated_at,pedido_suppliers(name,contact)',
      )
      .eq('local_id', localId)
      .eq('id', orderId)
      .maybeSingle();
    if (withUpdated.error) {
      if (!isMissingPurchaseOrdersUpdatedAtColumnError(withUpdated.error.message)) {
        throw new Error(withUpdated.error.message);
      }
      const legacy = await supabase
        .from('purchase_orders')
        .select(
          'id,supplier_id,status,notes,created_at,sent_at,received_at,delivery_date,price_review_archived_at,pedido_suppliers(name,contact)',
        )
        .eq('local_id', localId)
        .eq('id', orderId)
        .maybeSingle();
      if (legacy.error) throw new Error(legacy.error.message);
      row = (legacy.data as OrderRow | null) ?? null;
    } else {
      row = (withUpdated.data as OrderRow | null) ?? null;
    }
  }
  if (!row) return null;

  let itemRows: OrderItemRow[] = [];
  {
    const withPricePerKg = await supabase
      .from('purchase_order_items')
      .select(
        'id,order_id,supplier_product_id,product_name,unit,quantity,received_quantity,price_per_unit,base_price_per_unit,vat_rate,line_total,estimated_kg_per_unit,received_weight_kg,received_price_per_kg,incident_type,incident_notes',
      )
      .eq('order_id', orderId)
      .eq('local_id', localId);
    if (withPricePerKg.error) {
      if (!isMissingReceivedPricePerKgColumnError(withPricePerKg.error.message)) {
        throw new Error(withPricePerKg.error.message);
      }
      const legacy = await supabase
        .from('purchase_order_items')
        .select(
          'id,order_id,supplier_product_id,product_name,unit,quantity,received_quantity,price_per_unit,base_price_per_unit,vat_rate,line_total,estimated_kg_per_unit,received_weight_kg,incident_type,incident_notes',
        )
        .eq('order_id', orderId)
        .eq('local_id', localId);
      if (legacy.error) throw new Error(legacy.error.message);
      itemRows = (legacy.data ?? []) as OrderItemRow[];
    } else {
      itemRows = (withPricePerKg.data ?? []) as OrderItemRow[];
    }
  }

  const items: PedidoOrderItem[] = itemRows.map((ir) => ({
    id: ir.id,
    supplierProductId: ir.supplier_product_id,
    productName: ir.product_name,
    unit: ir.unit as Unit,
    quantity: Number(ir.quantity),
    receivedQuantity: Number(ir.received_quantity),
    pricePerUnit: Number(ir.price_per_unit),
    vatRate: Number(ir.vat_rate ?? 0),
    lineTotal: Number(ir.line_total),
    ...(ir.base_price_per_unit != null && Number.isFinite(Number(ir.base_price_per_unit))
      ? { basePricePerUnit: Number(ir.base_price_per_unit) }
      : {}),
    ...(ir.estimated_kg_per_unit != null ? { estimatedKgPerUnit: Number(ir.estimated_kg_per_unit) } : {}),
    receivedWeightKg: ir.received_weight_kg != null ? Number(ir.received_weight_kg) : null,
    ...(ir.received_price_per_kg != null && Number.isFinite(Number(ir.received_price_per_kg))
      ? { receivedPricePerKg: Number(ir.received_price_per_kg) }
      : {}),
    incidentType: ir.incident_type,
    incidentNotes: ir.incident_notes ?? undefined,
  }));

  const supplier = Array.isArray(row.pedido_suppliers) ? row.pedido_suppliers[0] : row.pedido_suppliers;
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
    items,
    total: items.reduce((acc, item) => acc + item.lineTotal, 0),
  };
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
    base_price_per_unit: Math.round(item.pricePerUnit * 100) / 100,
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
    incident_type: null,
    incident_notes: null,
    received_price_per_kg: null,
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
 * Persiste peso, €/kg real (bandeja/caja), precio unitario efectivo y subtotal en una sola escritura.
 * Para líneas kg/bandeja/caja; el resto delega en `updateOrderItemPrice`.
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
