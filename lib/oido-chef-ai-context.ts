import type { PedidoOrder } from '@/lib/pedidos-supabase';

export type OidoChefAiContext = {
  localLabel: string | null;
  currency: 'EUR';
  note: string;
  pedidosEnviados: Array<{ proveedor: string; entrega: string | null }>;
  comprasRecientes: Array<{
    proveedor: string;
    fecha: string;
    estado: string;
    lineas: Array<{ producto: string; precioUd: number; unidad: string }>;
  }>;
};

const MAX_ORDERS = 55;
const MAX_ITEMS_PER_ORDER = 35;
const MAX_DAYS = 120;

export function buildOidoChefAiContext(
  orders: PedidoOrder[],
  sentOrders: PedidoOrder[],
  localName?: string | null,
  localCode?: string | null,
): OidoChefAiContext {
  const cutoff = Date.now() - MAX_DAYS * 86400000;
  const sorted = [...orders]
    .filter((o) => new Date(o.receivedAt ?? o.sentAt ?? o.createdAt).getTime() >= cutoff)
    .sort(
      (a, b) =>
        new Date(b.receivedAt ?? b.sentAt ?? b.createdAt).getTime() -
        new Date(a.receivedAt ?? a.sentAt ?? a.createdAt).getTime(),
    )
    .slice(0, MAX_ORDERS);

  const pedidosEnviados = sentOrders.slice(0, 25).map((o) => ({
    proveedor: o.supplierName,
    entrega: o.deliveryDate ?? o.createdAt.slice(0, 10),
  }));

  return {
    localLabel: [localName, localCode].filter(Boolean).join(' · ') || null,
    currency: 'EUR',
    note: 'precioUd es precio por unidad en euros según el pedido/recibido en la app. No inventes datos fuera de este JSON.',
    pedidosEnviados,
    comprasRecientes: sorted.map((o) => ({
      proveedor: o.supplierName,
      fecha: (o.receivedAt ?? o.sentAt ?? o.createdAt).slice(0, 10),
      estado: o.status,
      lineas: o.items.slice(0, MAX_ITEMS_PER_ORDER).map((i) => ({
        producto: i.productName,
        precioUd: i.pricePerUnit,
        unidad: i.unit,
      })),
    })),
  };
}
