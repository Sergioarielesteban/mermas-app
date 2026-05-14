import { parsePricePerKg } from '@/lib/pedidos-recepcion-inputs';
import {
  receptionBillsByWeight,
  receptionLineTotals,
  resolveReceivedQuantityForReceptionPreview,
  resolveReceivedWeightKgForReceptionPreview,
  type PedidoOrderItem,
} from '@/lib/pedidos-supabase';

export type BuildPedidoReceptionPreviewOpts = {
  weightDraft?: string;
  ppkDraft?: string;
  orderQtyDraft?: string;
  /** Texto crudo del precio unitario (puede estar vacío mientras se edita). */
  priceDraft: string;
  ppkSuggestion: number | null;
};

/**
 * Línea de recepción en vivo (misma lógica que `RecepcionLineRow` / subtotales en pedidos enviados).
 */
export function buildPedidoReceptionPreviewItem(
  item: PedidoOrderItem,
  opts: BuildPedidoReceptionPreviewOpts,
): PedidoOrderItem {
  const priceText = opts.priceDraft;
  let pricePu = item.pricePerUnit;
  const pr = priceText.trim().replace(',', '.');
  if (pr !== '') {
    const p = Number(pr);
    if (Number.isFinite(p) && p >= 0) pricePu = Math.round(p * 100) / 100;
  }

  if (receptionBillsByWeight(item)) {
    const kgForMerge: number | null = resolveReceivedWeightKgForReceptionPreview(item, opts.weightDraft);

    let ppkMerge: number | null = item.receivedPricePerKg ?? null;
    if (item.unit !== 'kg') {
      if (opts.ppkDraft === undefined) {
        ppkMerge = item.receivedPricePerKg ?? opts.ppkSuggestion;
      } else {
        const ppkText = opts.ppkDraft;
        const st = parsePricePerKg(ppkText);
        if (ppkText.trim() === '') ppkMerge = opts.ppkSuggestion ?? item.receivedPricePerKg ?? null;
        else if (st !== 'invalid' && st != null) ppkMerge = st;
        else ppkMerge = item.receivedPricePerKg ?? opts.ppkSuggestion;
      }
    }

    const merged: PedidoOrderItem = {
      ...item,
      pricePerUnit: pricePu,
      receivedWeightKg: kgForMerge,
      ...(item.unit !== 'kg' ? { receivedPricePerKg: ppkMerge } : {}),
    };

    const { lineTotal, effectivePricePerUnit } = receptionLineTotals(merged);
    return { ...merged, pricePerUnit: effectivePricePerUnit, lineTotal };
  }

  const qMerge = resolveReceivedQuantityForReceptionPreview(item, opts.orderQtyDraft);
  const merged: PedidoOrderItem = {
    ...item,
    pricePerUnit: pricePu,
    receivedQuantity: qMerge,
    receivedWeightKg: null,
    receivedPricePerKg: null,
  };
  const { lineTotal, effectivePricePerUnit } = receptionLineTotals(merged);
  return { ...merged, pricePerUnit: effectivePricePerUnit, lineTotal };
}
