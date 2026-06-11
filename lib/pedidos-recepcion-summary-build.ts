import {
  estimatedOrderLineSubtotal,
  formatQuantityWithUnit,
  lineSubtotalForOrderListDisplay,
  orderItemHasIncident,
  unitPriceCatalogSuffix,
} from '@/lib/pedidos-format';
import { buildPedidoReceptionPreviewItem } from '@/lib/pedidos-reception-preview-item';
import {
  formatReceptionPriceAlertSingleLine,
  receptionPriceAlertFromPreview,
  type ReceptionHistoricoComparable,
} from '@/lib/pedidos-reception-price-alert';
import { orderLineDisplayName } from '@/lib/pedidos-line-display-name';
import {
  receptionCalculationUnit,
  receptionBillsByWeight,
  type PedidoOrder,
  type PedidoOrderItem,
} from '@/lib/pedidos-supabase';

export type PedidosRecepcionSummaryTone = 'rose' | 'amber' | 'sky' | 'emerald';

export type PedidosRecepcionSummaryIncidentRow = {
  name: string;
  qtyDeltaLabel: string;
  priceBaseLabel?: string;
  priceNewLabel?: string;
  priceDeltaLabel: string;
  impactEur: number;
};

export type PedidosRecepcionSummaryAlert = {
  id: string;
  tone: PedidosRecepcionSummaryTone;
  text: string;
};

export type PedidosRecepcionSummaryPayload = {
  orderId: string;
  orderLabel: string;
  supplierName: string;
  completedAtIso: string;
  userDisplayName: string;
  originalTotals: { base: number; vat: number; total: number };
  receivedTotals: { base: number; vat: number; total: number };
  diffEur: number;
  diffPct: number | null;
  lineCount: number;
  linesOk: number;
  linesIncidencia: number;
  incidentRows: PedidosRecepcionSummaryIncidentRow[];
  smartAlerts: PedidosRecepcionSummaryAlert[];
  /** Sin backend agregado: copy neutro o null para ocultar fila */
  weeklyPurchasesHint: string | null;
  productsWithIncidentCount: number;
  linesToMonitorCount: number;
  /** Opcional: versión del snapshot persistido */
  snapshotVersion?: number;
  /** Resumen operativo de impacto en inventario tras validar recepción */
  inventoryStock?: import('@/lib/inventory-reception-stock-ui').PedidosRecepcionInventorySummary;
};

const SNAPSHOT_VERSION = 1;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Restaura el payload guardado en BD sin recalcular. Devuelve null si el JSON no es válido.
 */
export function parsePedidosRecepcionSummaryPayload(raw: unknown): PedidosRecepcionSummaryPayload | null {
  if (!isRecord(raw)) return null;
  const orderId = typeof raw.orderId === 'string' ? raw.orderId : null;
  const orderLabel = typeof raw.orderLabel === 'string' ? raw.orderLabel : null;
  const supplierName = typeof raw.supplierName === 'string' ? raw.supplierName : null;
  const completedAtIso = typeof raw.completedAtIso === 'string' ? raw.completedAtIso : null;
  const userDisplayName = typeof raw.userDisplayName === 'string' ? raw.userDisplayName : null;
  if (!orderId || !orderLabel || !supplierName || !completedAtIso || !userDisplayName) return null;

  const diffPctRaw = raw.diffPct;
  const diffPct =
    diffPctRaw === null ? null : typeof diffPctRaw === 'number' && Number.isFinite(diffPctRaw) ? diffPctRaw : null;

  const ot = raw.originalTotals;
  const rt = raw.receivedTotals;
  if (!isRecord(ot) || !isRecord(rt)) return null;
  const ob = num(ot.base);
  const ov = num(ot.vat);
  const otol = num(ot.total);
  const rb = num(rt.base);
  const rv = num(rt.vat);
  const rtol = num(rt.total);
  if (ob == null || ov == null || otol == null || rb == null || rv == null || rtol == null) return null;

  const diffEur = num(raw.diffEur);
  const lineCount = num(raw.lineCount);
  const linesOk = num(raw.linesOk);
  const linesIncidencia = num(raw.linesIncidencia);
  const productsWithIncidentCount = num(raw.productsWithIncidentCount);
  const linesToMonitorCount = num(raw.linesToMonitorCount);
  if (
    diffEur == null ||
    lineCount == null ||
    linesOk == null ||
    linesIncidencia == null ||
    productsWithIncidentCount == null ||
    linesToMonitorCount == null
  ) {
    return null;
  }

  if (!Array.isArray(raw.incidentRows) || !Array.isArray(raw.smartAlerts)) return null;

  const incidentRows: PedidosRecepcionSummaryIncidentRow[] = [];
  for (const row of raw.incidentRows) {
    if (!isRecord(row)) continue;
    const name = typeof row.name === 'string' ? row.name : '';
    const qtyDeltaLabel = typeof row.qtyDeltaLabel === 'string' ? row.qtyDeltaLabel : '—';
    const priceBaseLabel = typeof row.priceBaseLabel === 'string' ? row.priceBaseLabel : undefined;
    const priceNewLabel = typeof row.priceNewLabel === 'string' ? row.priceNewLabel : undefined;
    const priceDeltaLabel = typeof row.priceDeltaLabel === 'string' ? row.priceDeltaLabel : '—';
    const impactEur = num(row.impactEur);
    if (impactEur == null) continue;
    incidentRows.push({ name, qtyDeltaLabel, priceBaseLabel, priceNewLabel, priceDeltaLabel, impactEur });
  }

  const smartAlerts: PedidosRecepcionSummaryAlert[] = [];
  for (const a of raw.smartAlerts) {
    if (!isRecord(a)) continue;
    const id = typeof a.id === 'string' ? a.id : '';
    const tone = a.tone as PedidosRecepcionSummaryTone;
    const text = typeof a.text === 'string' ? a.text : '';
    if (!id || !text) continue;
    if (tone !== 'rose' && tone !== 'amber' && tone !== 'sky' && tone !== 'emerald') continue;
    smartAlerts.push({ id, tone, text });
  }

  const weeklyHint =
    raw.weeklyPurchasesHint === null || raw.weeklyPurchasesHint === undefined
      ? null
      : typeof raw.weeklyPurchasesHint === 'string'
        ? raw.weeklyPurchasesHint
        : null;

  let inventoryStock: PedidosRecepcionSummaryPayload['inventoryStock'];
  const invRaw = raw.inventoryStock;
  if (isRecord(invRaw)) {
    const linkedLines: NonNullable<PedidosRecepcionSummaryPayload['inventoryStock']>['linkedLines'] = [];
    const unlinkedLines: NonNullable<PedidosRecepcionSummaryPayload['inventoryStock']>['unlinkedLines'] = [];
    if (Array.isArray(invRaw.linkedLines)) {
      for (const row of invRaw.linkedLines) {
        if (!isRecord(row)) continue;
        const label = typeof row.label === 'string' ? row.label : '';
        const qtyLabel = typeof row.qtyLabel === 'string' ? row.qtyLabel : '—';
        const inventoryName = typeof row.inventoryName === 'string' ? row.inventoryName : '';
        linkedLines.push({ label, qtyLabel, inventoryName, applied: row.applied === true });
      }
    }
    if (Array.isArray(invRaw.unlinkedLines)) {
      for (const row of invRaw.unlinkedLines) {
        if (!isRecord(row)) continue;
        const label = typeof row.label === 'string' ? row.label : '';
        const qtyLabel = typeof row.qtyLabel === 'string' ? row.qtyLabel : '—';
        unlinkedLines.push({ label, qtyLabel });
      }
    }
    const linkedLineCount = num(invRaw.linkedLineCount);
    const unlinkedLineCount = num(invRaw.unlinkedLineCount);
    const stockEntriesApplied = num(invRaw.stockEntriesApplied);
    const stockEntriesSkipped = num(invRaw.stockEntriesSkipped);
    if (
      linkedLineCount != null &&
      unlinkedLineCount != null &&
      stockEntriesApplied != null &&
      stockEntriesSkipped != null
    ) {
      inventoryStock = {
        linkedLineCount,
        unlinkedLineCount,
        stockEntriesApplied,
        stockEntriesSkipped,
        linkedLines,
        unlinkedLines,
      };
    }
  }

  return {
    orderId,
    orderLabel,
    supplierName,
    completedAtIso,
    userDisplayName,
    originalTotals: { base: ob, vat: ov, total: otol },
    receivedTotals: { base: rb, vat: rv, total: rtol },
    diffEur,
    diffPct,
    lineCount,
    linesOk,
    linesIncidencia,
    incidentRows,
    smartAlerts,
    weeklyPurchasesHint: weeklyHint,
    productsWithIncidentCount,
    linesToMonitorCount,
    snapshotVersion: SNAPSHOT_VERSION,
    inventoryStock,
  };
}

function formatMoney(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function positiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function kgPerOrderUnit(item: PedidoOrderItem): number | null {
  if (positiveNumber(item.billingQtyPerOrderUnit)) return item.billingQtyPerOrderUnit;
  if (positiveNumber(item.estimatedKgPerUnit)) return item.estimatedKgPerUnit;
  return null;
}

function baseComparablePrice(item: PedidoOrderItem, basePricePerUnit: number): number | null {
  if (!receptionBillsByWeight(item)) return basePricePerUnit;
  if (item.unit === 'kg') return basePricePerUnit;
  if (item.billingUnit === 'kg' && positiveNumber(item.pricePerBillingUnit)) {
    return item.pricePerBillingUnit;
  }
  const kg = kgPerOrderUnit(item);
  if (kg != null && positiveNumber(basePricePerUnit)) return basePricePerUnit / kg;
  return null;
}

function receivedComparablePrice(item: PedidoOrderItem, preview: PedidoOrderItem): number | null {
  if (!receptionBillsByWeight(item)) return preview.pricePerUnit;
  if (item.unit === 'kg') return preview.pricePerUnit;
  if (positiveNumber(preview.receivedPricePerKg)) return preview.receivedPricePerKg;
  if (positiveNumber(item.receivedPricePerKg)) return item.receivedPricePerKg;
  if (item.billingUnit === 'kg' && positiveNumber(item.pricePerBillingUnit)) {
    return item.pricePerBillingUnit;
  }
  const kg = kgPerOrderUnit(item);
  if (kg != null && positiveNumber(preview.pricePerUnit)) return preview.pricePerUnit / kg;
  return null;
}

function receptionPriceDisplayUnit(item: PedidoOrderItem): string {
  if (item.unit === 'kg') return 'kg';
  if (receptionBillsByWeight(item)) return 'kg';
  return unitPriceCatalogSuffix[receptionCalculationUnit(item)];
}

function shortOrderLabel(order: PedidoOrder): string {
  const raw = order.id.replace(/-/g, '');
  return raw.length >= 8 ? `#${raw.slice(0, 8).toUpperCase()}` : `#${order.id.slice(0, 8)}`;
}

function lineOk(
  item: PedidoOrderItem,
  marks: Record<string, 'ok' | 'bad'>,
): boolean {
  const m = marks[item.id];
  const serverOk =
    item.receivedQuantity >= item.quantity && item.quantity > 0 && !item.incidentType;
  return m === 'ok' || (m === undefined && serverOk);
}

function lineBad(item: PedidoOrderItem, marks: Record<string, 'ok' | 'bad'>): boolean {
  const m = marks[item.id];
  return m === 'bad' || (m === undefined && Boolean(item.incidentType));
}

/**
 * Construye el snapshot para el resumen inteligente post-validación (solo lectura de estado ya calculado en pantalla).
 */
export function buildPedidosRecepcionSummaryPayload(args: {
  order: PedidoOrder;
  completedAtIso: string;
  userDisplayName: string;
  weightInputByItemId: Record<string, string>;
  pricePerKgInputByItemId: Record<string, string>;
  orderQtyInputByItemId: Record<string, string>;
  priceInputByItemId: Record<string, string>;
  sentOrderPpkSuggestionByItemId: Map<string, number | null>;
  quickLineMarks: Record<string, 'ok' | 'bad'>;
  catalogNameByProductId: ReadonlyMap<string, string> | null;
  historicoComparableByProductId: ReadonlyMap<string, ReceptionHistoricoComparable> | null;
}): PedidosRecepcionSummaryPayload {
  const {
    order,
    completedAtIso,
    userDisplayName,
    weightInputByItemId,
    pricePerKgInputByItemId,
    orderQtyInputByItemId,
    priceInputByItemId,
    sentOrderPpkSuggestionByItemId,
    quickLineMarks,
    catalogNameByProductId,
    historicoComparableByProductId,
  } = args;

  let baseOrig = 0;
  let vatOrig = 0;
  let baseRec = 0;
  let vatRec = 0;

  const incidentCandidates: {
    name: string;
    qtyDeltaLabel: string;
    priceBaseLabel?: string;
    priceNewLabel?: string;
    priceDeltaLabel: string;
    impactEur: number;
    absImpact: number;
  }[] = [];

  const smartAlerts: PedidosRecepcionSummaryAlert[] = [];
  const alertDedupe = new Set<string>();

  let qtyShortLines = 0;
  let priceAlertLines = 0;

  for (const item of order.items) {
    const orderedSub = estimatedOrderLineSubtotal(item);
    baseOrig += orderedSub;
    vatOrig += orderedSub * (item.vatRate ?? 0);

    const ppkSug = sentOrderPpkSuggestionByItemId.get(item.id) ?? null;
    const priceDraft =
      priceInputByItemId[item.id] !== undefined
        ? String(priceInputByItemId[item.id])
        : item.pricePerUnit.toFixed(2);

    const preview = buildPedidoReceptionPreviewItem(item, {
      weightDraft: weightInputByItemId[item.id],
      ppkDraft: pricePerKgInputByItemId[item.id],
      orderQtyDraft: orderQtyInputByItemId[item.id],
      priceDraft,
      ppkSuggestion: ppkSug,
    });

    const receivedSub = lineSubtotalForOrderListDisplay(preview);
    baseRec += receivedSub;
    vatRec += receivedSub * (item.vatRate ?? 0);

    const hist =
      item.supplierProductId && historicoComparableByProductId
        ? historicoComparableByProductId.get(item.supplierProductId)
        : undefined;
    const alert = receptionPriceAlertFromPreview(preview, hist ?? null);
    if (alert) {
      priceAlertLines++;
      const line = formatReceptionPriceAlertSingleLine(alert);
      const product = orderLineDisplayName(item, catalogNameByProductId);
      const full = `${product}: ${line}`;
      if (!alertDedupe.has(full)) {
        alertDedupe.add(full);
        smartAlerts.push({
          id: `price-${item.id}`,
          tone: alert.direction === 'up' ? 'rose' : 'emerald',
          text: full,
        });
      }
    }

    const recvQty = preview.receivedQuantity;
    const orderedQty = item.quantity;
    if (
      !preview.incidentType &&
      orderedQty > 0 &&
      recvQty + 1e-6 < orderedQty
    ) {
      qtyShortLines++;
    }

    const impact = Math.round((receivedSub - orderedSub) * 100) / 100;
    const showRow =
      lineBad(item, quickLineMarks) ||
      orderItemHasIncident(item) ||
      Math.abs(impact) >= 0.01 ||
      !lineOk(item, quickLineMarks);

    if (showRow && (Math.abs(impact) >= 0.005 || lineBad(item, quickLineMarks) || orderItemHasIncident(item))) {
      const dq = recvQty - orderedQty;
      let qtyDeltaLabel = '—';
      if (Math.abs(dq) > 1e-6) {
        const sign = dq > 0 ? '+' : '−';
        qtyDeltaLabel = `${sign}${formatQuantityWithUnit(Math.abs(dq), item.unit)}`;
      } else if (preview.incidentType === 'missing') {
        qtyDeltaLabel = 'No recibido';
      }

    const baseRef =
      item.basePricePerUnit != null && Number.isFinite(item.basePricePerUnit)
        ? item.basePricePerUnit
        : item.pricePerUnit;
    const comparableBase = baseComparablePrice(item, baseRef);
    const comparableNew = receivedComparablePrice(item, preview);
    const comparableUnit = receptionPriceDisplayUnit(item);
    const formatUnitPrice = (n: number) =>
      `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/${comparableUnit}`;
    let priceDeltaLabel = '—';
    let priceBaseLabel: string | undefined;
    let priceNewLabel: string | undefined;
    if (comparableBase != null && comparableBase > 0 && comparableNew != null && comparableNew > 0) {
      priceBaseLabel = formatUnitPrice(comparableBase);
      priceNewLabel = formatUnitPrice(comparableNew);
    }
    if (
      comparableBase != null &&
      comparableBase > 0 &&
      comparableNew != null &&
      Math.abs(comparableNew - comparableBase) > 0.005
    ) {
      const pct = ((comparableNew - comparableBase) / comparableBase) * 100;
      const pctStr =
        Math.abs(pct) >= 10 ? `${Math.round(pct)} %` : `${(Math.round(pct * 10) / 10).toLocaleString('es-ES')}%`;
      priceDeltaLabel = `${comparableNew >= comparableBase ? '+' : '−'}${Math.abs(comparableNew - comparableBase).toLocaleString('es-ES', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} €/${comparableUnit} (${comparableNew >= comparableBase ? '+' : ''}${pctStr})`;
    }

    incidentCandidates.push({
      name: orderLineDisplayName(item, catalogNameByProductId),
      qtyDeltaLabel,
      priceBaseLabel,
      priceNewLabel,
      priceDeltaLabel,
      impactEur: impact,
      absImpact: Math.abs(impact),
    });
    }
  }

  incidentCandidates.sort((a, b) => b.absImpact - a.absImpact);
  const incidentRows: PedidosRecepcionSummaryIncidentRow[] = incidentCandidates.slice(0, 8).map((r) => ({
    name: r.name,
    qtyDeltaLabel: r.qtyDeltaLabel,
    priceBaseLabel: r.priceBaseLabel,
    priceNewLabel: r.priceNewLabel,
    priceDeltaLabel: r.priceDeltaLabel,
    impactEur: r.impactEur,
  }));

  if (qtyShortLines > 0) {
    const msg =
      qtyShortLines === 1
        ? 'Hay al menos una línea con menos cantidad recibida que la pedida.'
        : `${qtyShortLines} líneas con menos cantidad recibida que la pedida.`;
    if (!alertDedupe.has(msg)) {
      alertDedupe.add(msg);
      smartAlerts.unshift({
        id: 'qty-short-summary',
        tone: 'sky',
        text: msg,
      });
    }
  }

  const totalOrig = baseOrig + vatOrig;
  const totalRec = baseRec + vatRec;
  const diffEur = Math.round((totalRec - totalOrig) * 100) / 100;
  const diffPct = totalOrig > 0.01 ? Math.round(((totalRec - totalOrig) / totalOrig) * 10000) / 100 : null;

  let nOk = 0;
  let nBad = 0;
  for (const item of order.items) {
    const ok = lineOk(item, quickLineMarks);
    const bad = lineBad(item, quickLineMarks);
    if (ok) nOk++;
    if (bad) nBad++;
  }

  const linesToMonitorCount = Math.min(
    order.items.length,
    priceAlertLines + qtyShortLines + nBad,
  );

  return {
    orderId: order.id,
    orderLabel: shortOrderLabel(order),
    supplierName: order.supplierName,
    completedAtIso,
    userDisplayName,
    originalTotals: { base: baseOrig, vat: vatOrig, total: totalOrig },
    receivedTotals: { base: baseRec, vat: vatRec, total: totalRec },
    diffEur,
    diffPct,
    lineCount: order.items.length,
    linesOk: nOk,
    linesIncidencia: nBad,
    incidentRows,
    smartAlerts: smartAlerts.slice(0, 8),
    weeklyPurchasesHint: null,
    productsWithIncidentCount: nBad,
    linesToMonitorCount,
    snapshotVersion: SNAPSHOT_VERSION,
  };
}

export function formatPedidosRecepcionSummaryMoney(n: number): string {
  return formatMoney(n);
}
