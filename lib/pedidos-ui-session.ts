import type { PedidosViewStateReceptionInputs } from '@/lib/pedidos-view-state';
import { readMainScrollTop } from '@/lib/pedidos-main-scroll';

/**
 * Estado UI de /pedidos (sessionStorage). Se borra solo al salir del layout del módulo.
 */
export const CHEFONE_PEDIDOS_UI_STATE_KEY = 'chefone_pedidos_ui_state';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Ruta de esta pantalla: solo índice /pedidos */
export const PEDIDOS_HOME_PATHNAME = '/pedidos';

export type PedidosUiStateV2 = {
  v: 2;
  localId: string;
  updatedAt: number;
  pathname: string;
  pendingExpanded: boolean;
  historyExpanded: boolean;
  expandedPedidoId: string | null;
  expandedHistoricoPedidoId: string | null;
  expandedLinesByPedido: Record<string, boolean>;
  scrollY: number;
  historicoMonthOpen: Record<string, boolean>;
  incidentOpenBySentOrderId: Record<string, boolean>;
  quickLineMarks: Record<string, 'ok' | 'bad'>;
  receptionInputs?: PedidosViewStateReceptionInputs;
};

/** Compat lectura v1 (deploys anteriores) */
type PedidosUiSessionV1 = {
  v: 1;
  localId: string;
  updatedAt: number;
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

function normalizePathname(p: string): string {
  if (!p || p === '') return '/';
  if (p !== '/' && p.endsWith('/')) return p.slice(0, -1) || '/';
  return p;
}

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

function isLinesRecord(x: unknown): x is Record<string, boolean> {
  if (!x || typeof x !== 'object') return false;
  for (const v of Object.values(x as Record<string, unknown>)) {
    if (typeof v !== 'boolean') return false;
  }
  return true;
}

function v1ToV2(o: PedidosUiSessionV1): PedidosUiStateV2 | null {
  const path = normalizePathname(o.route.split('?')[0] ?? '');
  const lines: Record<string, boolean> = {};
  if (o.expandedSentId) lines[o.expandedSentId] = true;
  if (o.expandedHistoricoId) lines[o.expandedHistoricoId] = true;
  return {
    v: 2,
    localId: o.localId,
    updatedAt: o.updatedAt,
    pathname: path,
    pendingExpanded: o.pendientesAccordionOpen,
    historyExpanded: o.historicoAccordionOpen,
    expandedPedidoId: o.expandedSentId,
    expandedHistoricoPedidoId: o.expandedHistoricoId,
    expandedLinesByPedido: lines,
    scrollY: o.scrollY,
    historicoMonthOpen: { ...o.historicoMonthOpen },
    incidentOpenBySentOrderId: { ...o.incidentOpenBySentOrderId },
    quickLineMarks: { ...o.quickLineMarks },
    ...(o.receptionInputs ? { receptionInputs: o.receptionInputs } : {}),
  };
}

/**
 * Carga y valida estado guardado. Solo pathname (sin query) debe coincidir con /pedidos.
 */
export function loadPedidosUiState(
  raw: string | null,
  currentLocalId: string | null,
  currentPathname: string,
  now = Date.now(),
): PedidosUiStateV2 | null {
  if (!raw || !currentLocalId) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt)) return null;
    if (now - o.updatedAt > SESSION_TTL_MS) return null;
    if (o.localId !== currentLocalId) return null;

    const pathNorm = normalizePathname(currentPathname);
    if (pathNorm !== normalizePathname(PEDIDOS_HOME_PATHNAME)) return null;

    if (o.v === 2) {
      if (typeof o.pathname !== 'string') return null;
      if (normalizePathname(o.pathname) !== pathNorm) return null;
      if (typeof o.pendingExpanded !== 'boolean' || typeof o.historyExpanded !== 'boolean') return null;
      if (o.expandedPedidoId != null && typeof o.expandedPedidoId !== 'string') return null;
      if (o.expandedHistoricoPedidoId != null && typeof o.expandedHistoricoPedidoId !== 'string') return null;
      if (!o.expandedLinesByPedido || !isLinesRecord(o.expandedLinesByPedido)) return null;
      if (typeof o.scrollY !== 'number' || !Number.isFinite(o.scrollY) || o.scrollY < 0) return null;
      if (!o.historicoMonthOpen || !isRecordBool(o.historicoMonthOpen)) return null;
      if (!o.incidentOpenBySentOrderId || !isRecordBool(o.incidentOpenBySentOrderId)) return null;
      if (!o.quickLineMarks || !isQuickMarks(o.quickLineMarks)) return null;
      if (o.receptionInputs != null && !receptionInputsValid(o.receptionInputs as PedidosViewStateReceptionInputs)) {
        return null;
      }
      return o as PedidosUiStateV2;
    }

    if (o.v === 1 && typeof (o as PedidosUiSessionV1).route === 'string') {
      const v2 = v1ToV2(o as PedidosUiSessionV1);
      if (!v2) return null;
      if (normalizePathname(v2.pathname) !== pathNorm) return null;
      return v2;
    }

    return null;
  } catch {
    return null;
  }
}

export function serializePedidosUiStateV2(payload: Omit<PedidosUiStateV2, 'updatedAt'>): string {
  const st: PedidosUiStateV2 = { ...payload, updatedAt: Date.now() };
  return JSON.stringify(st);
}

export type PedidosUiSavePayload = Omit<PedidosUiStateV2, 'updatedAt' | 'v'> & { v?: 2 };

/** Persistencia completa + log debug */
export function savePedidosUiState(payload: PedidosUiSavePayload): void {
  if (typeof window === 'undefined') return;
  try {
    const scrollY = payload.scrollY ?? readMainScrollTop();
    const full: Omit<PedidosUiStateV2, 'updatedAt'> = {
      v: 2,
      localId: payload.localId,
      pathname: normalizePathname(payload.pathname || PEDIDOS_HOME_PATHNAME),
      pendingExpanded: payload.pendingExpanded,
      historyExpanded: payload.historyExpanded,
      expandedPedidoId: payload.expandedPedidoId,
      expandedHistoricoPedidoId: payload.expandedHistoricoPedidoId,
      expandedLinesByPedido: { ...payload.expandedLinesByPedido },
      scrollY,
      historicoMonthOpen: { ...payload.historicoMonthOpen },
      incidentOpenBySentOrderId: { ...payload.incidentOpenBySentOrderId },
      quickLineMarks: { ...payload.quickLineMarks },
      ...(payload.receptionInputs ? { receptionInputs: payload.receptionInputs } : {}),
    };
    const json = serializePedidosUiStateV2(full);
    console.log('[PEDIDOS_UI] save', { ...full, receptionInputs: full.receptionInputs ? '[inputs]' : undefined });
    window.sessionStorage.setItem(CHEFONE_PEDIDOS_UI_STATE_KEY, json);
  } catch {
    /* quota / privado */
  }
}

export function clearPedidosUiStateOnlyWhenUserLeavesModule(): void {
  try {
    if (typeof window === 'undefined') return;
    console.log('[PEDIDOS_UI] clear (user left pedidos module)');
    window.sessionStorage.removeItem(CHEFONE_PEDIDOS_UI_STATE_KEY);
  } catch {
    /* ignore */
  }
}

/** @deprecated usar loadPedidosUiState */
export function parsePedidosUiSessionState(
  raw: string | null,
  currentLocalId: string | null,
  currentRoute: string,
  now = Date.now(),
): PedidosUiStateV2 | null {
  const pathname = normalizePathname(currentRoute.split('?')[0] ?? '');
  return loadPedidosUiState(raw, currentLocalId, pathname, now);
}

