/**
 * Cruce albarán OCR ↔ pedido + catálogo + histórico.
 *
 * Premisas:
 *  - El comparador NUNCA muta nada: solo devuelve un `AlbaranDiffReport`.
 *  - La unidad de comparación SIEMPRE es la `purchaseUnit` del master.
 *  - Los umbrales son configurables aquí (constantes) para no enterrar magic numbers.
 */

import type {
  AlbaranOcrPayload,
  AlbaranOcrLine,
  AlbaranDiff,
  AlbaranDiffReport,
  AlbaranMasterProduct,
} from '@/lib/ocr/types-document';
import type { PedidoOrder, PedidoOrderItem } from '@/lib/pedidos-supabase';
import { unitsCompatible, matchOcrLinesAgainstCatalog } from '@/lib/ocr/normalize-unit';

const PRICE_TOLERANCE_PCT = 0.02; // 2% de margen contra precio del pedido.
const PRICE_SPIKE_PCT = 0.15; // ≥15% sobre último precio recibido → alerta.
const QTY_TOLERANCE = 0.001;
const DOC_TOTAL_TOLERANCE = 0.5; // 0,50 € de margen en el total documento.
const LOW_CONFIDENCE_THRESHOLD = 'low';

function abs(n: number): number {
  return n < 0 ? -n : n;
}

function pctDiff(a: number, b: number): number {
  if (b === 0) return 0;
  return (a - b) / abs(b);
}

function summariseQuantity(item: PedidoOrderItem): number {
  return Math.round(item.quantity * 1000) / 1000;
}

function pushDiff(out: AlbaranDiff[], diff: AlbaranDiff): void {
  out.push(diff);
}

/**
 * Cruza el payload OCR contra un pedido vinculado y el catálogo del proveedor.
 *
 * @param payload   resultado tipado de Document AI + Gemini.
 * @param order     pedido vinculado (o null si no hay).
 * @param catalog   productos master del proveedor (mejor pasar solo los del supplier del pedido).
 */
export function compareOcrWithOrderAndCatalog(
  payload: AlbaranOcrPayload,
  order: PedidoOrder | null,
  catalog: AlbaranMasterProduct[],
): AlbaranDiffReport {
  const diffs: AlbaranDiff[] = [];

  // 1) Avisos por línea con confidence baja directamente desde el OCR.
  payload.lines.forEach((line, i) => {
    if (line.confidence === LOW_CONFIDENCE_THRESHOLD) {
      pushDiff(diffs, {
        kind: 'ocr_low_confidence',
        severity: 'warn',
        message: `Línea ${i + 1}: confianza OCR baja (${line.description || line.rawText.slice(0, 40)})`,
        ocrLineIndex: i,
      });
    }
  });

  // 2) Comprobación de fecha sospechosa (>15 días en el futuro).
  if (payload.document.date) {
    const dt = new Date(`${payload.document.date}T00:00:00`);
    const today = new Date();
    const diffDays = (dt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 15) {
      pushDiff(diffs, {
        kind: 'date_suspicious',
        severity: 'warn',
        message: `Fecha del albarán muy futura (${payload.document.date}).`,
      });
    }
  }

  // 3) Match contra catálogo (necesario incluso sin pedido para detectar productos nuevos).
  const matches = matchOcrLinesAgainstCatalog(payload.lines, catalog);

  let matchedLines = 0;
  let unmatchedLines = 0;
  let newProducts = 0;

  matches.forEach((m, i) => {
    const line = payload.lines[m.ocrLineIndex];
    if (!line) return;
    if (!m.best || m.best.score < 0.25) {
      unmatchedLines += 1;
      // Si no encontró nada en catálogo, probablemente es producto nuevo.
      if (line.description.trim().length > 0) {
        newProducts += 1;
        pushDiff(diffs, {
          kind: 'new_product',
          severity: 'info',
          message: `Producto sin catálogo: "${line.description.slice(0, 60)}".`,
          ocrLineIndex: i,
        });
      } else {
        pushDiff(diffs, {
          kind: 'unmatched_line',
          severity: 'warn',
          message: `Línea ${i + 1} no se pudo emparejar.`,
          ocrLineIndex: i,
        });
      }
      return;
    }
    matchedLines += 1;

    const master = m.best.product;
    // Unidad diferente al master → diff.
    if (!unitsCompatible(line.unit, master.purchaseUnit)) {
      pushDiff(diffs, {
        kind: 'unit_diff',
        severity: 'warn',
        message: `${master.name}: el OCR trae unidad ${line.unit ?? '—'} pero la compra es por ${master.purchaseUnit}.`,
        ocrLineIndex: i,
      });
    }

    // Spike de precio sobre último recibido.
    if (
      master.lastReceivedPrice != null &&
      line.unitPrice != null &&
      master.lastReceivedPrice > 0
    ) {
      const delta = pctDiff(line.unitPrice, master.lastReceivedPrice);
      if (delta >= PRICE_SPIKE_PCT) {
        pushDiff(diffs, {
          kind: 'price_spike',
          severity: delta >= 0.3 ? 'critical' : 'warn',
          message: `${master.name}: precio +${(delta * 100).toFixed(1)}% sobre el último recibido (${master.lastReceivedPrice.toFixed(2)} → ${line.unitPrice.toFixed(2)}).`,
          ocrLineIndex: i,
          metrics: { previous: master.lastReceivedPrice, current: line.unitPrice, deltaPct: delta },
        });
      }
    }
  });

  // 4) Cruce contra el pedido si existe.
  let documentTotalDelta: number | null = null;
  if (order) {
    // Verificación de proveedor.
    if (
      payload.supplier.name &&
      payload.supplier.name.trim().toLowerCase() !== order.supplierName.trim().toLowerCase()
    ) {
      pushDiff(diffs, {
        kind: 'supplier_mismatch',
        severity: 'warn',
        message: `Proveedor OCR "${payload.supplier.name}" no coincide con el del pedido "${order.supplierName}".`,
      });
    }

    // Index de líneas del pedido por producto match (asumiendo que el catalog viene del supplier del pedido).
    const orderItemsBySupplierProductId = new Map<string, PedidoOrderItem>();
    for (const it of order.items) {
      if (it.supplierProductId) orderItemsBySupplierProductId.set(it.supplierProductId, it);
    }

    const seenOrderItemIds = new Set<string>();

    matches.forEach((m, i) => {
      if (!m.best) return;
      const line = payload.lines[m.ocrLineIndex];
      if (!line) return;
      const master = m.best.product;
      const orderItem = orderItemsBySupplierProductId.get(master.id);
      if (!orderItem) {
        // El producto está en catálogo pero no en este pedido.
        pushDiff(diffs, {
          kind: 'new_product',
          severity: 'info',
          message: `${master.name}: recibido pero no estaba en el pedido.`,
          ocrLineIndex: i,
        });
        return;
      }
      seenOrderItemIds.add(orderItem.id);

      // Cantidad: comparar en la unidad master.
      if (line.quantity != null && unitsCompatible(line.unit, master.purchaseUnit)) {
        const dq = line.quantity - summariseQuantity(orderItem);
        if (abs(dq) > QTY_TOLERANCE) {
          pushDiff(diffs, {
            kind: 'qty_diff',
            severity: 'warn',
            message: `${master.name}: cantidad ${line.quantity} ${master.purchaseUnit} vs pedido ${summariseQuantity(orderItem)} ${master.purchaseUnit} (Δ ${dq > 0 ? '+' : ''}${dq.toFixed(2)}).`,
            ocrLineIndex: i,
            orderItemId: orderItem.id,
            metrics: { orderQty: summariseQuantity(orderItem), albaranQty: line.quantity, delta: dq },
          });
        }
      }

      // Precio: comparar contra `pricePerUnit` del pedido.
      if (line.unitPrice != null && orderItem.pricePerUnit > 0) {
        const dp = pctDiff(line.unitPrice, orderItem.pricePerUnit);
        if (abs(dp) > PRICE_TOLERANCE_PCT) {
          pushDiff(diffs, {
            kind: 'price_diff',
            severity: abs(dp) > 0.1 ? 'critical' : 'warn',
            message: `${master.name}: precio ${line.unitPrice.toFixed(2)} €/${master.purchaseUnit} vs pedido ${orderItem.pricePerUnit.toFixed(2)} (${(dp * 100).toFixed(1)}%).`,
            ocrLineIndex: i,
            orderItemId: orderItem.id,
            metrics: {
              orderPrice: orderItem.pricePerUnit,
              albaranPrice: line.unitPrice,
              deltaPct: dp,
            },
          });
        }
      }
    });

    // Productos del pedido NO presentes en el albarán.
    for (const it of order.items) {
      if (!seenOrderItemIds.has(it.id)) {
        pushDiff(diffs, {
          kind: 'missing_in_albaran',
          severity: 'warn',
          message: `${it.productName}: estaba en el pedido y no aparece en el albarán.`,
          orderItemId: it.id,
        });
      }
    }

    // Diferencia de total documento.
    const orderTotalFromLines = order.items.reduce(
      (acc, it) => acc + (Number.isFinite(it.lineTotal) ? it.lineTotal : 0),
      0,
    );
    if (payload.totals.total != null && Number.isFinite(orderTotalFromLines)) {
      documentTotalDelta = Math.round((payload.totals.total - orderTotalFromLines) * 100) / 100;
      if (abs(documentTotalDelta) > DOC_TOTAL_TOLERANCE) {
        pushDiff(diffs, {
          kind: 'price_diff',
          severity: abs(documentTotalDelta) > 5 ? 'critical' : 'warn',
          message: `Total documento (${payload.totals.total.toFixed(2)} €) ≠ total pedido (${orderTotalFromLines.toFixed(2)} €).`,
          metrics: {
            albaranTotal: payload.totals.total,
            orderTotal: orderTotalFromLines,
            delta: documentTotalDelta,
          },
        });
      }
    }
  }

  return {
    matchedLines,
    unmatchedLines,
    newProducts,
    documentTotalDelta,
    diffs,
  };
}

/**
 * Adaptador: convierte la estructura `PedidoSupplier.products` en `AlbaranMasterProduct[]`
 * para pasar al comparador. Vive aquí porque el cruce está acoplado al schema interno.
 */
export function masterProductsFromSupplier(
  supplierId: string,
  supplierName: string,
  products: Array<{
    id: string;
    name: string;
    unit: AlbaranMasterProduct['purchaseUnit'];
    pricePerUnit: number;
    ultimoPrecioRecibido?: number | null;
    articleAliasInterno?: string | null;
    articleMasterName?: string | null;
  }>,
): AlbaranMasterProduct[] {
  return products.map((p) => ({
    id: p.id,
    supplierId,
    name: p.name || p.articleMasterName || p.articleAliasInterno || '',
    purchaseUnit: p.unit,
    basePrice: Number.isFinite(p.pricePerUnit) ? p.pricePerUnit : null,
    lastReceivedPrice: p.ultimoPrecioRecibido ?? null,
    aliases: [p.articleMasterName, p.articleAliasInterno, supplierName].filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    ),
  }));
}

export const __testables__ = { pctDiff, unitsCompatible };
