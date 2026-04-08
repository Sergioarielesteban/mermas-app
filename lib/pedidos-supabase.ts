import type { SupabaseClient } from '@supabase/supabase-js';
import type { Unit } from '@/lib/types';

export type PedidoStatus = 'draft' | 'sent' | 'received';

export type PedidoSupplierProduct = {
  id: string;
  name: string;
  unit: Unit;
  pricePerUnit: number;
  vatRate: number;
  isActive: boolean;
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
  items: PedidoOrderItem[];
  total: number;
};

type SupplierRow = { id: string; name: string; contact: string };
type SupplierProductRow = {
  id: string;
  supplier_id: string;
  name: string;
  unit: string;
  price_per_unit: number;
  vat_rate: number;
  is_active: boolean;
};
type OrderRow = {
  id: string;
  supplier_id: string;
  status: PedidoStatus;
  notes: string;
  created_at: string;
  sent_at: string | null;
  received_at: string | null;
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
    .select('id,supplier_id,name,unit,price_per_unit,vat_rate,is_active')
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
      isActive: Boolean(row.is_active),
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
  input: { name: string; unit: Unit; pricePerUnit: number; vatRate?: number },
) {
  const { data, error } = await supabase
    .from('pedido_supplier_products')
    .insert({
      local_id: localId,
      supplier_id: supplierId,
      name: normalizeLabelUpper(input.name),
      unit: input.unit,
      price_per_unit: Math.round(input.pricePerUnit * 100) / 100,
      vat_rate: Math.max(0, Math.round((input.vatRate ?? 0) * 10000) / 10000),
      is_active: true,
    })
    .select('id,supplier_id,name,unit,price_per_unit,vat_rate,is_active')
    .single();
  if (error) throw new Error(error.message);
  return data as SupplierProductRow;
}

export async function updateSupplierProduct(
  supabase: SupabaseClient,
  localId: string,
  supplierProductId: string,
  input: { name: string; unit: Unit; pricePerUnit: number; vatRate?: number },
) {
  const { data, error } = await supabase
    .from('pedido_supplier_products')
    .update({
      name: normalizeLabelUpper(input.name),
      unit: input.unit,
      price_per_unit: Math.round(input.pricePerUnit * 100) / 100,
      vat_rate: Math.max(0, Math.round((input.vatRate ?? 0) * 10000) / 10000),
    })
    .eq('id', supplierProductId)
    .eq('local_id', localId)
    .select('id,supplier_id,name,unit,price_per_unit,vat_rate,is_active')
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
    .select('id,supplier_id,status,notes,created_at,sent_at,received_at,pedido_suppliers(name,contact)')
    .eq('local_id', localId)
    .order('created_at', { ascending: false });
  if (oErr) throw new Error(oErr.message);

  const ids = ((orderRows ?? []) as OrderRow[]).map((row) => row.id);
  const { data: itemRows, error: iErr } = await supabase
    .from('purchase_order_items')
    .select('id,order_id,supplier_product_id,product_name,unit,quantity,received_quantity,price_per_unit,vat_rate,line_total')
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
      items,
      total: items.reduce((acc, item) => acc + item.lineTotal, 0),
    };
  });
  return orders;
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
    items: Array<{
      supplierProductId: string | null;
      productName: string;
      unit: Unit;
      quantity: number;
      receivedQuantity: number;
      pricePerUnit: number;
      vatRate: number;
      lineTotal: number;
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
      })),
    );
    if (insErr) throw new Error(insErr.message);
  }

  return orderId;
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
  const patch: { status: PedidoStatus; sent_at?: string | null; received_at?: string | null } = { status };
  if (status === 'sent') patch.sent_at = nowIso;
  if (status === 'received') patch.received_at = nowIso;
  if (status === 'draft') {
    patch.sent_at = null;
    patch.received_at = null;
  }
  const { error } = await supabase.from('purchase_orders').update(patch).eq('id', orderId).eq('local_id', localId);
  if (error) throw new Error(error.message);
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
