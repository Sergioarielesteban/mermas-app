/**
 * Copia local del snapshot de resumen (misma fuente que summary_json en BD).
 * Permite «Ver resumen» y badges aunque la tabla Supabase no exista o falle el guardado.
 */
import {
  parsePedidosRecepcionSummaryPayload,
  type PedidosRecepcionSummaryPayload,
} from '@/lib/pedidos-recepcion-summary-build';
import type { PedidosReceptionSummaryMeta } from '@/lib/pedidos-recepcion-summary-supabase';

function storageKey(localId: string, orderId: string): string {
  return `chef-one:pedidos-reception-summary:v1:${localId}:${orderId}`;
}

export function metaFromSummaryPayload(payload: PedidosRecepcionSummaryPayload): PedidosReceptionSummaryMeta {
  const receiverDisplayName = payload.userDisplayName?.trim();
  return {
    purchaseOrderId: payload.orderId,
    hasSnapshot: true,
    ...(receiverDisplayName ? { receiverDisplayName } : {}),
    lineasIncidencia: payload.linesIncidencia,
    diferenciaEur: payload.diffEur,
    alertasSubidaCount: payload.smartAlerts.filter((a) => a.tone === 'rose').length,
    lineasTotales: payload.lineCount,
  };
}

export function persistRecepcionSummaryLocal(
  localId: string,
  payload: PedidosRecepcionSummaryPayload,
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(localId, payload.orderId), JSON.stringify(payload));
  } catch {
    /* quota o modo privado */
  }
}

export function loadRecepcionSummaryLocal(
  localId: string,
  orderId: string,
): PedidosRecepcionSummaryPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(localId, orderId));
    if (!raw?.trim()) return null;
    return parsePedidosRecepcionSummaryPayload(JSON.parse(raw));
  } catch {
    return null;
  }
}
