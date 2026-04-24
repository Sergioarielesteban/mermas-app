/**
 * Persistencia de vista en /pedidos (PWA / multitarea): ruta, acordeones, pedido
 * desplegado, scroll e inputs de recepción. Caduca a las 12 h.
 */
export const PEDIDOS_VIEW_STATE_KEY = 'chefone:pedidos:viewState';
export const VIEW_STATE_TTL_MS = 12 * 60 * 60 * 1000;

export type PedidosOpenedSection = 'pending' | 'received' | 'sent' | null;

export type PedidosViewStateReceptionInputs = {
  priceInputByItemId: Record<string, string>;
  weightInputByItemId: Record<string, string>;
  pricePerKgInputByItemId: Record<string, string>;
};

export type PedidosViewStateStored = {
  route: string;
  activeOrderId: string | null;
  expandedOrderIds: string[];
  openedSection: PedidosOpenedSection;
  scrollY: number;
  updatedAt: number;
  localId?: string;
  /** Mes (YYYY-MM) con <details> abierto en histórico, si aplica. */
  historicoMonthKey?: string | null;
  receptionInputs?: PedidosViewStateReceptionInputs;
};

function isRecordString(x: unknown): x is Record<string, string> {
  if (!x || typeof x !== 'object') return false;
  return Object.values(x as Record<string, string>).every((v) => typeof v === 'string');
}

export function isPedidosViewStateFresh(
  st: Pick<PedidosViewStateStored, 'updatedAt'>,
  now = Date.now(),
): boolean {
  if (typeof st.updatedAt !== 'number' || !Number.isFinite(st.updatedAt)) return false;
  return now - st.updatedAt < VIEW_STATE_TTL_MS;
}

/**
 * Comprueba coherencia con el local activo. Si en el JSON hay `localId` y
 * no coincide con `currentLocalId`, se ignora.
 */
export function parsePedidosViewState(
  raw: string | null,
  currentLocalId: string | null,
  now = Date.now(),
): PedidosViewStateStored | null {
  if (!raw || !currentLocalId) return null;
  try {
    const o = JSON.parse(raw) as Partial<PedidosViewStateStored>;
    if (typeof o.route !== 'string' || !o.route.startsWith('/')) return null;
    if (o.activeOrderId != null && typeof o.activeOrderId !== 'string') return null;
    if (!Array.isArray(o.expandedOrderIds) || !o.expandedOrderIds.every((x) => typeof x === 'string')) {
      return null;
    }
    if (
      o.openedSection != null &&
      o.openedSection !== 'pending' &&
      o.openedSection !== 'received' &&
      o.openedSection !== 'sent'
    ) {
      return null;
    }
    if (typeof o.scrollY !== 'number' || !Number.isFinite(o.scrollY) || o.scrollY < 0) return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt)) return null;
    if (!isPedidosViewStateFresh({ updatedAt: o.updatedAt }, now)) return null;
    if (o.localId != null && o.localId !== currentLocalId) return null;
    if (o.historicoMonthKey != null && typeof o.historicoMonthKey !== 'string') return null;
    if (o.receptionInputs) {
      const r = o.receptionInputs;
      if (
        !isRecordString(r.priceInputByItemId) ||
        !isRecordString(r.weightInputByItemId) ||
        !isRecordString(r.pricePerKgInputByItemId)
      ) {
        return null;
      }
    }
    return o as PedidosViewStateStored;
  } catch {
    return null;
  }
}

export function serializePedidosViewState(payload: Omit<PedidosViewStateStored, 'updatedAt'>): string {
  const st: PedidosViewStateStored = { ...payload, updatedAt: Date.now() };
  return JSON.stringify(st);
}
