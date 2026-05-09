import type { SupabaseClient } from '@supabase/supabase-js';
import type { PedidosRecepcionSummaryPayload } from '@/lib/pedidos-recepcion-summary-build';
import { parsePedidosRecepcionSummaryPayload } from '@/lib/pedidos-recepcion-summary-build';

export type PedidosReceptionSummaryMeta = {
  purchaseOrderId: string;
  /** Fila en BD */
  hasSnapshot: boolean;
  /** Quién validó la recepción (columna usuario_nombre / snapshot). */
  receiverDisplayName?: string;
  lineasIncidencia: number;
  diferenciaEur: number;
  alertasSubidaCount: number;
  lineasTotales: number;
};

function countRoseAlerts(payload: PedidosRecepcionSummaryPayload): number {
  return payload.smartAlerts.filter((a) => a.tone === 'rose').length;
}

function trimReceiverLabel(value: unknown): string | undefined {
  if (value == null) return undefined;
  const t = String(value).trim();
  return t.length ? t : undefined;
}

/**
 * Guarda el snapshot del resumen tal cual se mostró al validar (upsert por pedido + local).
 */
export async function savePedidosReceptionSummary(
  supabase: SupabaseClient,
  localId: string,
  supplierId: string,
  payload: PedidosRecepcionSummaryPayload,
): Promise<void> {
  const alertasSubida = countRoseAlerts(payload);
  const row = {
    local_id: localId,
    purchase_order_id: payload.orderId,
    supplier_id: supplierId,
    supplier_name: payload.supplierName,
    usuario_nombre: payload.userDisplayName,
    completed_at: payload.completedAtIso,
    total_previsto: payload.originalTotals.total,
    total_recibido: payload.receivedTotals.total,
    diferencia_euros: payload.diffEur,
    diferencia_porcentaje: payload.diffPct,
    lineas_totales: payload.lineCount,
    lineas_correctas: payload.linesOk,
    lineas_incidencia: payload.linesIncidencia,
    alertas_count: payload.smartAlerts.length,
    alertas_subida_count: alertasSubida,
    summary_json: payload as unknown as Record<string, unknown>,
  };

  const { error } = await supabase.from('pedidos_reception_summaries').upsert(row, {
    onConflict: 'local_id,purchase_order_id',
  });
  if (error) throw new Error(error.message);
}

export async function fetchPedidosReceptionSummaryPayload(
  supabase: SupabaseClient,
  localId: string,
  purchaseOrderId: string,
): Promise<PedidosRecepcionSummaryPayload | null> {
  const { data, error } = await supabase
    .from('pedidos_reception_summaries')
    .select('summary_json')
    .eq('local_id', localId)
    .eq('purchase_order_id', purchaseOrderId)
    .maybeSingle();

  if (error) {
    if (/relation|does not exist|schema cache/i.test(error.message)) {
      return null;
    }
    throw new Error(error.message);
  }
  if (!data?.summary_json) return null;
  return parsePedidosRecepcionSummaryPayload(data.summary_json);
}

/**
 * Metadatos ligeros para badges en listas (sin parsear JSON completo por fila).
 */
export async function fetchPedidosReceptionSummaryMetaBatch(
  supabase: SupabaseClient,
  localId: string,
  purchaseOrderIds: string[],
): Promise<Map<string, PedidosReceptionSummaryMeta>> {
  const out = new Map<string, PedidosReceptionSummaryMeta>();
  if (purchaseOrderIds.length === 0) return out;

  const { data, error } = await supabase
    .from('pedidos_reception_summaries')
    .select(
      'purchase_order_id, usuario_nombre, lineas_incidencia, diferencia_euros, alertas_subida_count, lineas_totales',
    )
    .eq('local_id', localId)
    .in('purchase_order_id', purchaseOrderIds);

  if (error) {
    if (/relation|does not exist|schema cache/i.test(error.message)) {
      return out;
    }
    throw new Error(error.message);
  }
  for (const row of data ?? []) {
    const id = row.purchase_order_id as string;
    const receiverDisplayName = trimReceiverLabel(row.usuario_nombre);
    out.set(id, {
      purchaseOrderId: id,
      hasSnapshot: true,
      ...(receiverDisplayName ? { receiverDisplayName } : {}),
      lineasIncidencia: Number(row.lineas_incidencia ?? 0),
      diferenciaEur: Number(row.diferencia_euros ?? 0),
      alertasSubidaCount: Number(row.alertas_subida_count ?? 0),
      lineasTotales: Number(row.lineas_totales ?? 0),
    });
  }
  return out;
}
