import type { SupabaseClient } from '@supabase/supabase-js';
import type { CcUnit } from '@/lib/cocina-central-supabase';

/** Etiqueta corta para unidades clásicas de cocina central; si no coincide, se muestra el texto tal cual (ej. «cubo 4kg»). */
export function formatSupplyUnitLabel(unit: string): string {
  const u = unit.trim();
  if (!u) return '—';
  const map: Record<string, string> = {
    kg: 'kg',
    ud: 'ud.',
    bolsa: 'bolsa',
    racion: 'ración',
    litros: 'L',
    unidades: 'ud.',
  };
  return map[u] ?? u;
}

export type SupplyOrderEstado =
  | 'enviado'
  | 'visto'
  | 'en_preparacion'
  | 'servido'
  | 'cancelado';

/** Catálogo de venta a sedes (RPC `cc_list_central_supply_catalog`). */
export type CentralSupplyCatalogRow = {
  catalog_product_id: string;
  nombre_producto: string;
  descripcion: string;
  unidad_venta: string;
  precio_venta: number;
};

export type CentralSupplyOrderRow = {
  id: string;
  local_solicitante_id: string;
  local_central_id: string;
  fecha_entrega_deseada: string;
  estado: SupplyOrderEstado;
  notas: string | null;
  local_solicitante_label: string | null;
  local_central_label: string | null;
  total_eur: number;
  created_at: string;
  updated_at: string;
};

export type CentralSupplyOrderItemRow = {
  id: string;
  order_id: string;
  catalog_product_id: string | null;
  /** Legado: líneas antiguas enlazadas a `products` de la cocina central. */
  product_id: string | null;
  product_name: string;
  cantidad: number;
  /** Unidad de venta (texto libre en catálogo o legado CcUnit). */
  unidad: string;
  precio_unitario_eur: number;
  line_total_eur: number;
  created_at: string;
};

export const SUPPLY_ORDER_ESTADO_LABEL: Record<SupplyOrderEstado, string> = {
  enviado: 'Enviado',
  visto: 'Visto',
  en_preparacion: 'En preparación',
  servido: 'Servido',
  cancelado: 'Cancelado',
};

export const CC_UNIT_SHORT: Record<CcUnit, string> = {
  kg: 'kg',
  ud: 'ud.',
  bolsa: 'bolsa',
  racion: 'ración',
  litros: 'L',
  unidades: 'ud.',
};

export function monthEntregaRange(monthKey: string): { from: string; to: string } {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error('Mes inválido (usa YYYY-MM)');
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(y, m, 0);
  const to = `${y}-${String(m).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  return { from, to };
}

export function formatMonthLabelEs(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  const d = new Date(y, m - 1, 1);
  const month = d.toLocaleString('es-ES', { month: 'long' });
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${y}`;
}

export function formatEur(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

export async function ccFetchSupplyCatalog(supabase: SupabaseClient): Promise<CentralSupplyCatalogRow[]> {
  const { data, error } = await supabase.rpc('cc_list_central_supply_catalog');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    catalog_product_id: string;
    nombre_producto: string;
    descripcion: string | null;
    unidad_venta: string;
    precio_venta: number;
  }>;
  return rows.map((r) => ({
    catalog_product_id: String(r.catalog_product_id),
    nombre_producto: String(r.nombre_producto),
    descripcion: r.descripcion != null ? String(r.descripcion) : '',
    unidad_venta: String(r.unidad_venta),
    precio_venta: Number(r.precio_venta),
  }));
}

export async function ccSubmitSupplyOrder(
  supabase: SupabaseClient,
  args: {
    fechaEntrega: string;
    items: Array<{ catalog_product_id: string; cantidad: number }>;
    notas?: string | null;
  },
): Promise<string> {
  const payload = args.items.map((i) => ({
    catalog_product_id: i.catalog_product_id,
    cantidad: i.cantidad,
  }));
  const { data, error } = await supabase.rpc('cc_submit_supply_order', {
    p_fecha_entrega: args.fechaEntrega,
    p_items: payload,
    p_notas: args.notas ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function ccUpdateSupplyOrderEstado(
  supabase: SupabaseClient,
  orderId: string,
  estado: SupplyOrderEstado,
): Promise<void> {
  const { error } = await supabase.rpc('cc_update_supply_order_estado', {
    p_order_id: orderId,
    p_estado: estado,
  });
  if (error) throw new Error(error.message);
}

export async function ccListMySupplyOrders(supabase: SupabaseClient): Promise<CentralSupplyOrderRow[]> {
  const { data, error } = await supabase
    .from('central_supply_orders')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CentralSupplyOrderRow[];
}

export async function ccListCentralSupplyOrders(
  supabase: SupabaseClient,
  opts: {
    solicitanteId?: string;
    entregaDesde?: string;
    entregaHasta?: string;
  } = {},
): Promise<CentralSupplyOrderRow[]> {
  let q = supabase.from('central_supply_orders').select('*');
  if (opts.solicitanteId) q = q.eq('local_solicitante_id', opts.solicitanteId);
  if (opts.entregaDesde) q = q.gte('fecha_entrega_deseada', opts.entregaDesde);
  if (opts.entregaHasta) q = q.lte('fecha_entrega_deseada', opts.entregaHasta);
  const { data, error } = await q.order('fecha_entrega_deseada', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CentralSupplyOrderRow[];
}

export async function ccFetchSupplyOrderWithItems(
  supabase: SupabaseClient,
  orderId: string,
): Promise<{ order: CentralSupplyOrderRow; items: CentralSupplyOrderItemRow[] }> {
  const { data: order, error: oErr } = await supabase
    .from('central_supply_orders')
    .select('*')
    .eq('id', orderId)
    .single();
  if (oErr) throw new Error(oErr.message);
  const { data: items, error: iErr } = await supabase
    .from('central_supply_order_items')
    .select(
      'id,order_id,catalog_product_id,product_id,product_name,cantidad,unidad,precio_unitario_eur,line_total_eur,created_at',
    )
    .eq('order_id', orderId)
    .order('product_name');
  if (iErr) throw new Error(iErr.message);
  return { order: order as CentralSupplyOrderRow, items: (items ?? []) as CentralSupplyOrderItemRow[] };
}

export async function ccFetchSupplyItemsForOrders(
  supabase: SupabaseClient,
  orderIds: string[],
): Promise<CentralSupplyOrderItemRow[]> {
  if (orderIds.length === 0) return [];
  const { data, error } = await supabase
    .from('central_supply_order_items')
    .select(
      'id,order_id,catalog_product_id,product_id,product_name,cantidad,unidad,precio_unitario_eur,line_total_eur,created_at',
    )
    .in('order_id', orderIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as CentralSupplyOrderItemRow[];
}

export type SupplyProductAgg = {
  product_name: string;
  unidad: string;
  cantidad_total: number;
  importe_eur: number;
};

export function aggregateSupplyItemsByProduct(
  orders: CentralSupplyOrderRow[],
  items: CentralSupplyOrderItemRow[],
  opts: { excludeCancelled?: boolean } = {},
): SupplyProductAgg[] {
  const exclude = opts.excludeCancelled ?? true;
  const allowed = new Set(
    orders.filter((o) => (exclude ? o.estado !== 'cancelado' : true)).map((o) => o.id),
  );
  const map = new Map<string, SupplyProductAgg>();
  for (const it of items) {
    if (!allowed.has(it.order_id)) continue;
    const lineKey = it.catalog_product_id ?? it.product_id ?? it.id;
    const key = `${lineKey}:${it.unidad}`;
    const prev = map.get(key);
    const cant = Number(it.cantidad);
    const imp = Number(it.line_total_eur);
    if (prev) {
      prev.cantidad_total += cant;
      prev.importe_eur += imp;
    } else {
      map.set(key, {
        product_name: it.product_name,
        unidad: it.unidad,
        cantidad_total: cant,
        importe_eur: imp,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.product_name.localeCompare(b.product_name, 'es'));
}
