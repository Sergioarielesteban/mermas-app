import type { PedidosViewStateReceptionInputs } from '@/lib/pedidos-view-state';

/**
 * Estado UI de /pedidos en sessionStorage: continuidad al volver de multitarea o F5
 * sin depender de re-renders. Se borra al salir del layout del módulo (otra ruta).
 *
 * No incluye datos de negocio ni pedidos completos — solo flags UI y borradores de inputs.
 */
export const CHEFONE_PEDIDOS_UI_STATE_KEY = 'chefone_pedidos_ui_state';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type PedidosUiSessionV1 = {
  v: 1;
  localId: string;
  updatedAt: number;
  /** pathname + search en el momento de guardar */
  route: string;
  pendientesAccordionOpen: boolean;
  historicoAccordionOpen: boolean;
  expandedSentId: string | null;
  expandedHistoricoId: string | null;
  historicoMonthOpen: Record<string, boolean>;
  incidentOpenBySentOrderId: Record<string, boolean>;
  quickLineMarks: Record<string, 'ok' | 'bad'>;
  scrollY: number;
  receptionInputs?: PedidosViewStateReceptionInputs;
};

function isRecordBool(x: unknown): x is Record<string, boolean> {
  if (!x || typeof x !== 'object') return false;
  return Object.values(x as Record<string, boolean>).every((v) => typeof v === 'boolean');
}

function isQuickMarks(x: unknown): x is Record<string, 'ok' | 'bad'> {
  if (!x || typeof x !== 'object') return false;
  return Object.values(x as Record<string, 'ok' | 'bad'>).every((v) => v === 'ok' || v === 'bad');
}

function receptionInputsValid(r: PedidosViewStateReceptionInputs): boolean {
  const ok = (m: Record<string, string>) => Object.values(m).every((v) => typeof v === 'string');
  return (
    ok(r.priceInputByItemId) &&
    ok(r.weightInputByItemId) &&
    ok(r.pricePerKgInputByItemId) &&
    (r.orderQtyInputByItemId == null || ok(r.orderQtyInputByItemId))
  );
}

export function parsePedidosUiSessionState(
  raw: string | null,
  currentLocalId: string | null,
  currentRoute: string,
  now = Date.now(),
): PedidosUiSessionV1 | null {
  if (!raw || !currentLocalId) return null;
  try {
    const o = JSON.parse(raw) as Partial<PedidosUiSessionV1>;
    if (o.v !== 1) return null;
    if (o.localId !== currentLocalId) return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt)) return null;
    if (now - o.updatedAt > SESSION_TTL_MS) return null;
    if (typeof o.route !== 'string' || !o.route.startsWith('/pedidos')) return null;
    if (o.route !== currentRoute) return null;
    if (typeof o.pendientesAccordionOpen !== 'boolean') return null;
    if (typeof o.historicoAccordionOpen !== 'boolean') return null;
    if (o.expandedSentId != null && typeof o.expandedSentId !== 'string') return null;
    if (o.expandedHistoricoId != null && typeof o.expandedHistoricoId !== 'string') return null;
    if (!o.historicoMonthOpen || typeof o.historicoMonthOpen !== 'object' || !isRecordBool(o.historicoMonthOpen)) {
      return null;
    }
    if (
      !o.incidentOpenBySentOrderId ||
      typeof o.incidentOpenBySentOrderId !== 'object' ||
      !isRecordBool(o.incidentOpenBySentOrderId)
    ) {
      return null;
    }
    if (!o.quickLineMarks || typeof o.quickLineMarks !== 'object' || !isQuickMarks(o.quickLineMarks)) {
      return null;
    }
    if (typeof o.scrollY !== 'number' || !Number.isFinite(o.scrollY) || o.scrollY < 0) return null;
    if (o.receptionInputs != null && !receptionInputsValid(o.receptionInputs)) return null;
    return o as PedidosUiSessionV1;
  } catch {
    return null;
  }
}

export function serializePedidosUiSessionState(payload: Omit<PedidosUiSessionV1, 'updatedAt'>): string {
  const st: PedidosUiSessionV1 = { ...payload, updatedAt: Date.now() };
  return JSON.stringify(st);
}
