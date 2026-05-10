/**
 * Persistencia agenda operativa (cortes + revisiones previas al pedido).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PedidoSupplierOrderScheduleRow } from '@/lib/pedidos-order-agenda-engine';

export type PedidoSupplierOrderScheduleDb = {
  id: string;
  local_id: string;
  supplier_id: string;
  enabled: boolean;
  order_weekdays: number[];
  cutoff_time: string;
  reminder_minutes_before: number;
  delivery_weekdays: number[] | null;
};

export type PedidoSupplierReviewItemDb = {
  id: string;
  local_id: string;
  supplier_id: string;
  supplier_product_id: string | null;
  product_name_snapshot: string;
  enabled: boolean;
  sort_order: number;
};

function rowToSchedule(row: PedidoSupplierOrderScheduleDb): PedidoSupplierOrderScheduleRow & { id: string } {
  return {
    id: row.id,
    enabled: row.enabled,
    orderWeekdays: [...(row.order_weekdays ?? [])],
    cutoffTime: row.cutoff_time,
    reminderMinutesBefore: row.reminder_minutes_before ?? 30,
    deliveryWeekdays: row.delivery_weekdays != null ? [...row.delivery_weekdays] : null,
  };
}

export async function fetchScheduleForSupplier(
  supabase: SupabaseClient,
  localId: string,
  supplierId: string,
): Promise<PedidoSupplierOrderScheduleDb | null> {
  const { data, error } = await supabase
    .from('pedido_supplier_order_schedules')
    .select(
      'id,local_id,supplier_id,enabled,order_weekdays,cutoff_time,reminder_minutes_before,delivery_weekdays',
    )
    .eq('local_id', localId)
    .eq('supplier_id', supplierId)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116' || error.message?.includes('does not exist')) return null;
    throw new Error(error.message);
  }
  return (data as PedidoSupplierOrderScheduleDb) ?? null;
}

export async function fetchReviewItemsForSupplier(
  supabase: SupabaseClient,
  localId: string,
  supplierId: string,
): Promise<PedidoSupplierReviewItemDb[]> {
  const { data, error } = await supabase
    .from('pedido_supplier_review_items')
    .select('id,local_id,supplier_id,supplier_product_id,product_name_snapshot,enabled,sort_order')
    .eq('local_id', localId)
    .eq('supplier_id', supplierId)
    .order('sort_order', { ascending: true });

  if (error) {
    if (error.message?.includes('does not exist')) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as PedidoSupplierReviewItemDb[];
}

export async function fetchSupplierNamesMap(
  supabase: SupabaseClient,
  localId: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('pedido_suppliers').select('id,name').eq('local_id', localId);
  if (error) {
    if (error.message?.includes('does not exist')) return new Map();
    throw new Error(error.message);
  }
  const m = new Map<string, string>();
  for (const raw of data ?? []) {
    const row = raw as { id: string; name: string };
    m.set(row.id, row.name);
  }
  return m;
}

export async function fetchOrderSchedulesForLocal(
  supabase: SupabaseClient,
  localId: string,
): Promise<Map<string, PedidoSupplierOrderScheduleRow & { id: string }>> {
  const { data, error } = await supabase
    .from('pedido_supplier_order_schedules')
    .select(
      'id,local_id,supplier_id,enabled,order_weekdays,cutoff_time,reminder_minutes_before,delivery_weekdays',
    )
    .eq('local_id', localId);

  if (error) {
    if (error.message?.includes('does not exist') || error.code === '42P01') {
      return new Map();
    }
    throw new Error(error.message);
  }

  const m = new Map<string, PedidoSupplierOrderScheduleRow & { id: string }>();
  for (const raw of data ?? []) {
    const row = raw as PedidoSupplierOrderScheduleDb;
    m.set(row.supplier_id, rowToSchedule(row));
  }
  return m;
}

export async function fetchReviewItemsForLocal(
  supabase: SupabaseClient,
  localId: string,
): Promise<Map<string, PedidoSupplierReviewItemDb[]>> {
  const { data, error } = await supabase
    .from('pedido_supplier_review_items')
    .select(
      'id,local_id,supplier_id,supplier_product_id,product_name_snapshot,enabled,sort_order',
    )
    .eq('local_id', localId)
    .order('sort_order', { ascending: true });

  if (error) {
    if (error.message?.includes('does not exist') || error.code === '42P01') {
      return new Map();
    }
    throw new Error(error.message);
  }

  const bySupplier = new Map<string, PedidoSupplierReviewItemDb[]>();
  for (const raw of data ?? []) {
    const row = raw as PedidoSupplierReviewItemDb;
    const list = bySupplier.get(row.supplier_id) ?? [];
    list.push(row);
    bySupplier.set(row.supplier_id, list);
  }
  return bySupplier;
}

export async function upsertOrderSchedule(
  supabase: SupabaseClient,
  localId: string,
  supplierId: string,
  input: PedidoSupplierOrderScheduleRow,
): Promise<void> {
  const { error } = await supabase.from('pedido_supplier_order_schedules').upsert(
    {
      local_id: localId,
      supplier_id: supplierId,
      enabled: input.enabled,
      order_weekdays: input.orderWeekdays,
      cutoff_time: normalizeTimeForDb(input.cutoffTime),
      reminder_minutes_before: input.reminderMinutesBefore,
      delivery_weekdays:
        input.deliveryWeekdays != null && input.deliveryWeekdays.length > 0
          ? input.deliveryWeekdays
          : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'local_id,supplier_id' },
  );

  if (error) throw new Error(error.message);
}

function normalizeTimeForDb(hm: string): string {
  const t = hm.trim();
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  return '17:00:00';
}

export async function replaceReviewItemsForSupplier(
  supabase: SupabaseClient,
  localId: string,
  supplierId: string,
  items: Array<{ supplierProductId: string | null; productNameSnapshot: string; enabled: boolean }>,
): Promise<void> {
  const del = await supabase
    .from('pedido_supplier_review_items')
    .delete()
    .eq('local_id', localId)
    .eq('supplier_id', supplierId);
  if (del.error) throw new Error(del.error.message);

  if (items.length === 0) return;

  const rows = items.map((it, i) => ({
    local_id: localId,
    supplier_id: supplierId,
    supplier_product_id: it.supplierProductId,
    product_name_snapshot: it.productNameSnapshot.trim(),
    enabled: it.enabled,
    sort_order: i,
    updated_at: new Date().toISOString(),
  }));

  const ins = await supabase.from('pedido_supplier_review_items').insert(rows);
  if (ins.error) throw new Error(ins.error.message);
}
