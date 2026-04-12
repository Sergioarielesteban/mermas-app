import type { SupabaseClient } from '@supabase/supabase-js';
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

export type PedidoStatus = 'draft' | 'sent' | 'received';

export type PedidoSupplierProduct = {
  id: string;
  name: string;
  unit: Unit;
  pricePerUnit: number;
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
  incidentType?: 'missing' | 'damaged' | 'wrong-item' | null;
  incidentNotes?: string;
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

type SupplierRow = { id: string; name: string; contact: string };
type SupplierProductRow = {
  id: string;
  supplier_id: string;
  name: string;
  unit: string;
  price_per_unit: number;
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
  vat_rate: number;
  line_total: number;
  estimated_kg_per_unit: number | null;
  received_weight_kg: number | null;
  incident_type: 'missing' | 'damaged' | 'wrong-item' | null;
  incident_notes: string | null;
};

function normalizeLabelUpper(value: string) {
  return value.trim().toUpperCase();
}

export async function fetchSuppliersWithProducts(supabase: SupabaseClient, localId: string) {
  const { data: supplierRows, error: sErr } = await supabase
    .from('pedido_suppliers')
    .select('id,name,contact')
    .eq('local_id', localId)
    .order('name');
  if (sErr) throw new Error(sErr.message);

  const { data: productRows, error: pErr } = await supabase
    .from('pedido_supplier_products')
    .select('id,supplier_id,name,unit,price_per_unit,vat_rate,par_stock,is_active,estimated_kg_per_unit')
    .eq('local_id', localId)
    .eq('is_active', true)
    .order('name');
  if (pErr) throw new Error(pErr.message);

  const bySupplier = new Map<string, PedidoSupplierProduct[]>();
  for (const row of (productRows ?? []) as SupplierProductRow[]) {
    const list = bySupplier.get(row.supplier_id) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      unit: row.unit as Unit,
      pricePerUnit: Number(row.price_per_unit),
      vatRate: Number(row.vat_rate ?? 0),
      parStock: Number(row.par_stock ?? 0),
      isActive: Boolean(row.is_active),
      ...(row.estimated_kg_per_unit != null
        ? { estimatedKgPerUnit: Number(row.estimated_kg_per_unit) }
        : {}),
    });
    bySupplier.set(row.supplier_id, list);
  }

  const suppliers: PedidoSupplier[] = ((supplierRows ?? []) as SupplierRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    contact: row.contact ?? '',
    products: bySupplier.get(row.id) ?? [],
  }));
  return suppliers;
}

export async function createSupplier(supabase: SupabaseClient, localId: string, name: string, contact: string) {
  const { data, error } = await supabase
    .from('pedido_suppliers')
    .insert({ local_id: localId, name: normalizeLabelUpper(name), contact: contact.trim() })
    .select('id,name,contact')
    .single();
  if (error) throw new Error(error.message);
  return data as SupplierRow;
}

export async function updateSupplier(
  supabase: SupabaseClient,
  localId: string,
  supplierId: string,
  input: { name: string; contact: string },
) {
  const { data, error } = await supabase
    .from('pedido_suppliers')
    .update({ name: normalizeLabelUpper(input.name), contact: input.contact.trim() })
    .eq('id', supplierId)
    .eq('local_id', localId)
    .select('id,name,contact')
    .single();
  if (error) throw new Error(error.message);
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
  },
) {
  const est =
    unitSupportsReceivedWeightKg(input.unit) &&
    input.estimatedKgPerUnit != null &&
    Number.isFinite(input.estimatedKgPerUnit) &&
    input.estimatedKgPerUnit > 0
      ? Math.round(input.estimatedKgPerUnit * 1000) / 1000
      : null;
  const { data, error } = await supabase
    .from('pedido_supplier_products')
    .insert({
      local_id: localId,
      supplier_id: supplierId,
      name: normalizeLabelUpper(input.name),
      unit: input.unit,
      price_per_unit: Math.round(input.pricePerUnit * 100) / 100,
      vat_rate: Math.max(0, Math.round((input.vatRate ?? 0) * 10000) / 10000),
      par_stock: Math.max(0, Math.round((input.parStock ?? 0) * 100) / 100),
      is_active: true,
      estimated_kg_per_unit: est,
    })
    .select('id,supplier_id,name,unit,price_per_unit,vat_rate,par_stock,is_active,estimated_kg_per_unit')
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
  },
) {
  const est =
    unitSupportsReceivedWeightKg(input.unit) &&
    input.estimatedKgPerUnit != null &&
    Number.isFinite(input.estimatedKgPerUnit) &&
    input.estimatedKgPerUnit > 0
      ? Math.round(input.estimatedKgPerUnit * 1000) / 1000
      : null;
  const { data, error } = await supabase
    .from('pedido_supplier_products')
    .update({
      name: normalizeLabelUpper(input.name),
      unit: input.unit,
      price_per_unit: Math.round(input.pricePerUnit * 100) / 100,
      vat_rate: Math.max(0, Math.round((input.vatRate ?? 0) * 10000) / 10000),
      par_stock: Math.max(0, Math.round((input.parStock ?? 0) * 100) / 100),
      estimated_kg_per_unit: unitSupportsReceivedWeightKg(input.unit) ? est : null,
    })
    .eq('id', supplierProductId)
    .eq('local_id', localId)
    .select('id,supplier_id,name,unit,price_per_unit,vat_rate,par_stock,is_active,estimated_kg_per_unit')
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
  const { data: orderRows, error: oErr } = await supabase
    .from('purchase_orders')
    .select(
      'id,supplier_id,status,notes,created_at,sent_at,received_at,delivery_date,price_review_archived_at,pedido_suppliers(name,contact)',
    )
    .eq('local_id', localId)
    .order('created_at', { ascending: false });
  if (oErr) throw new Error(oErr.message);

  const ids = ((orderRows ?? []) as OrderRow[]).map((row) => row.id);
  const { data: itemRows, error: iErr } = await supabase
    .from('purchase_order_items')
    .select(
      'id,order_id,supplier_product_id,product_name,unit,quantity,received_quantity,price_per_unit,vat_rate,line_total,estimated_kg_per_unit,received_weight_kg,incident_type,incident_notes',
    )
    .in('order_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  if (iErr) throw new Error(iErr.message);

  const byOrder = new Map<string, PedidoOrderItem[]>();
  for (const row of (itemRows ?? []) as OrderItemRow[]) {
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
      ...(row.estimated_kg_per_unit != null
        ? { estimatedKgPerUnit: Number(row.estimated_kg_per_unit) }
        : {}),
      receivedWeightKg: row.received_weight_kg != null ? Number(row.received_weight_kg) : null,
      incidentType: row.incident_type,
      incidentNotes: row.incident_notes ?? undefined,
    });
    byOrder.set(row.order_id, list);
  }

  const orders: PedidoOrder[] = ((orderRows ?? []) as OrderRow[]).map((row) => {
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
  const { data: orderRow, error: oErr } = await supabase
    .from('purchase_orders')
    .select(
      'id,supplier_id,status,notes,created_at,sent_at,received_at,delivery_date,price_review_archived_at,pedido_suppliers(name,contact)',
    )
    .eq('local_id', localId)
    .eq('id', orderId)
    .maybeSingle();
  if (oErr) throw new Error(oErr.message);
  const row = orderRow as OrderRow | null;
  if (!row) return null;

  const { data: itemRows, error: iErr } = await supabase
    .from('purchase_order_items')
    .select(
      'id,order_id,supplier_product_id,product_name,unit,quantity,received_quantity,price_per_unit,vat_rate,line_total,estimated_kg_per_unit,received_weight_kg,incident_type,incident_notes',
    )
    .eq('order_id', orderId)
    .eq('local_id', localId);
  if (iErr) throw new Error(iErr.message);

  const items: PedidoOrderItem[] = ((itemRows ?? []) as OrderItemRow[]).map((ir) => ({
    id: ir.id,
    supplierProductId: ir.supplier_product_id,
    productName: ir.product_name,
    unit: ir.unit as Unit,
    quantity: Number(ir.quantity),
    receivedQuantity: Number(ir.received_quantity),
    pricePerUnit: Number(ir.price_per_unit),
    vatRate: Number(ir.vat_rate ?? 0),
    lineTotal: Number(ir.line_total),
    ...(ir.estimated_kg_per_unit != null ? { estimatedKgPerUnit: Number(ir.estimated_kg_per_unit) } : {}),
    receivedWeightKg: ir.received_weight_kg != null ? Number(ir.received_weight_kg) : null,
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
    items,
    total: items.reduce((acc, item) => acc + item.lineTotal, 0),
  };
}

/** Evita perder pedidos recién creados cuando la lectura va a réplica y aún no incluye la fila nueva. */
const PEDIDO_MERGE_RECENT_MS = 12 * 60 * 1000;

/**
 * Fusiona lista previa con la respuesta del servidor. Si pasas `pinUntilSeenOnServer`, esas ids se mantienen
 * en pantalla hasta que el servidor las devuelva; luego se eliminan del Set (mutación intencionada).
 */
export function mergePedidoOrdersFromServer(
  prev: PedidoOrder[],
  server: PedidoOrder[],
  pinUntilSeenOnServer?: Set<string>,
): PedidoOrder[] {
  const serverIds = new Set(server.map((o) => o.id));
  const now = Date.now();
  const extras = prev.filter((o) => {
    if (serverIds.has(o.id)) return false;
    if (pinUntilSeenOnServer?.has(o.id)) return true;
    const created = Date.parse(o.createdAt);
    if (!Number.isFinite(created)) return false;
    return now - created < PEDIDO_MERGE_RECENT_MS;
  });
  const byId = new Map<string, PedidoOrder>();
  for (const row of server) byId.set(row.id, row);
  for (const row of extras) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  if (pinUntilSeenOnServer) {
    for (const id of serverIds) pinUntilSeenOnServer.delete(id);
  }
  return Array.from(byId.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
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
  let orderId = payload.orderId;
  if (!orderId) {
    const { data, error } = await supabase
      .from('purchase_orders')
      .insert({
        local_id: localId,
        supplier_id: payload.supplierId,
        status: payload.status,
        notes: payload.notes.trim(),
        sent_at: payload.status === 'sent' ? payload.sentAt ?? new Date().toISOString() : null,
        delivery_date: payload.deliveryDate ?? null,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    orderId = data.id as string;
  } else {
    const { error } = await supabase
      .from('purchase_orders')
      .update({
        supplier_id: payload.supplierId,
        status: payload.status,
        notes: payload.notes.trim(),
        sent_at: payload.status === 'sent' ? payload.sentAt ?? new Date().toISOString() : null,
        delivery_date: payload.deliveryDate ?? null,
      })
      .eq('id', orderId)
      .eq('local_id', localId);
    if (error) throw new Error(error.message);

    const { error: delErr } = await supabase
      .from('purchase_order_items')
      .delete()
      .eq('order_id', orderId)
      .eq('local_id', localId);
    if (delErr) throw new Error(delErr.message);
  }

  if (!orderId) throw new Error('No se pudo guardar el pedido.');

  if (payload.items.length > 0) {
       const { error: insErr } = await supabase.from('purchase_order_items').insert(
      payload.items.map((item) => ({
        local_id: localId,
        order_id: orderId,
        supplier_product_id: item.supplierProductId,
        product_name: item.productName,
        unit: item.unit,
        quantity: item.quantity,
        received_quantity: item.receivedQuantity,
        price_per_unit: Math.round(item.pricePerUnit * 100) / 100,
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
      })),
    );
    if (insErr) throw new Error(insErr.message);
  }

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
  const { error } = await supabase.from('purchase_orders').update(patch).eq('id', orderId).eq('local_id', localId);
  if (error) throw new Error(error.message);
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
  const { error } = await supabase
    .from('purchase_orders')
    .update({ price_review_archived_at: archived ? new Date().toISOString() : null })
    .eq('id', orderId)
    .eq('local_id', localId)
    .in('status', ['sent', 'received']);
  if (error) throw new Error(error.message);
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
      const billingQty = billingQuantityForLine(item);
      await updateOrderItemPrice(supabase, localId, item.id, item.pricePerUnit, billingQty);
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
