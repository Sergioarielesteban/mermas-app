import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeliveryNote, DeliveryNoteItem } from '@/lib/delivery-notes-supabase';
import {
  fetchDeliveryNoteItemsForNotes,
  fetchDeliveryNotesForFinanzas,
} from '@/lib/delivery-notes-supabase';
import { fetchOrders, type PedidoOrder, type PedidoOrderItem } from '@/lib/pedidos-supabase';
import { fetchProductsAndMermas } from '@/lib/mermas-supabase';

export type FinanzasPeriodPreset = 'today' | '7d' | 'this_month' | 'prev_month';

/** Opciones de UI para el selector de periodo (query `?p=`). */
export const FINANZAS_PERIOD_PRESET_OPTIONS: { id: FinanzasPeriodPreset; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: '7d', label: '7 días' },
  { id: 'this_month', label: 'Este mes' },
  { id: 'prev_month', label: 'Mes anterior' },
];

/**
 * Umbrales únicos para salud, alertas “Qué revisar” y PMP.
 * Ajustar aquí si el negocio necesita sensibilidad distinta.
 */
export const FINANZAS_UMBRALES = {
  salud: {
    gastoMinPrevEur: 5,
    gastoSubeRatio: 1.08,
    gastoBajaRatio: 0.92,
    mermaMinPrevEur: 3,
    mermaSubeRatio: 1.2,
    mermaBajaRatio: 0.85,
    /** Gasto neto mínimo para usar ratio mermas/compra en salud. */
    mermaPctGastoNetoMin: 100,
    /** Periodo anterior: ratio mermas/compra mínimo para que la comparación sea relevante (%). */
    mermaPctPrevMin: 2,
    mermaPctSubeVsPrev: 1.15,
    mermaPctBajaVsPrev: 0.85,
    /** Nº de referencias con subida fuerte PMP que suman una señal “a la baja” en salud. */
    preciosPicosEmpeoran: 5,
  },
  revision: {
    albaranVsPedidoRatio: 0.08,
    albaranVsPedidoMinEur: 25,
    albaranVsPedidoSinPedidoMinEur: 50,
    pedidosVsAlbaranesMinEur: 200,
    /** También alertar si el desvío supera este % del compromiso pedidos (neto). */
    pedidosVsAlbaranesFraccionCompromiso: 0.06,
    /** Gasto neto mínimo para evaluar alerta por % mermas/compra. */
    mermaPctCompraMinGastoNeto: 50,
    /** % mermas sobre gasto neto que dispara alerta de revisión. */
    mermaPctCompraAlerta: 6,
  },
  preciosPmp: {
    minPrevAvgEur: 0.02,
    spikeRatio: 1.08,
  },
} as const;

/** Texto breve para mostrar criterios en UI (resumen ejecutivo). */
export function finanzasUmbralesDescripcion(): string[] {
  const u = FINANZAS_UMBRALES;
  const pctGasto = Math.round((u.salud.gastoSubeRatio - 1) * 100);
  const pctPmp = Math.round((u.preciosPmp.spikeRatio - 1) * 100);
  return [
    `Salud (gasto y mermas en €): periodo anterior de gasto ≥ ${u.salud.gastoMinPrevEur} €; subida ≥ ${pctGasto}% o baja ≥ ${pctGasto}% vs anterior. Mermas: si anterior ≥ ${u.salud.mermaMinPrevEur} €, +${Math.round((u.salud.mermaSubeRatio - 1) * 100)}% / −${Math.round((1 - u.salud.mermaBajaRatio) * 100)}% vs anterior.`,
    `Salud (mermas % compra): con gasto neto ≥ ${u.salud.mermaPctGastoNetoMin} € y mermas previas ≥ ${u.salud.mermaPctPrevMin}% del gasto, empeora si el ratio sube ≥ ${Math.round((u.salud.mermaPctSubeVsPrev - 1) * 100)}% relativo al anterior.`,
    `Salud (precios): ≥ ${u.salud.preciosPicosEmpeoran} artículos con PMP +${pctPmp}% o más vs periodo previo añade señal de presión de costes.`,
    `Revisar hoy: albarán vs pedido vinculado > ${Math.round(u.revision.albaranVsPedidoRatio * 100)}% y > ${u.revision.albaranVsPedidoMinEur} € (o > ${u.revision.albaranVsPedidoSinPedidoMinEur} € sin pedido). Pedidos vs albaranes: > ${u.revision.pedidosVsAlbaranesMinEur} € o > ${Math.round(u.revision.pedidosVsAlbaranesFraccionCompromiso * 100)}% del compromiso. Mermas ≥ ${u.revision.mermaPctCompraAlerta}% del gasto neto (con compra ≥ ${u.revision.mermaPctCompraMinGastoNeto} €).`,
  ];
}

export type FinanzasHealth = 'stable' | 'improving' | 'worsening' | 'no_data';

export type FinanzasReviewItem = {
  priority: 1 | 2 | 3;
  kind: string;
  title: string;
  impactLabel: string;
  href: string;
};

export type FinanzasSupplierRow = {
  supplierId: string | null;
  supplierName: string;
  net: number;
  count: number;
  pctOfTotal: number;
  /** Variación % del neto del proveedor vs periodo anterior (no euros). */
  deltaVsPrev: number | null;
};

export type FinanzasArticleRow = {
  key: string;
  label: string;
  net: number;
  lines: number;
};

export type FinanzasMermaRow = {
  key: string;
  label: string;
  eur: number;
  pctOfSpend: number;
};

export type FinanzasPriceSpikeRow = {
  label: string;
  supplierName: string;
  prevAvg: number;
  last: number;
  deltaPct: number;
};

export type FinanzasValidatedNoteRow = {
  id: string;
  supplierName: string;
  net: number;
  gross: number;
  imputationDate: string;
  relatedOrderId: string | null;
  deliveryNoteNumber: string;
};

export type FinanzasDashboardData = {
  periodFrom: string;
  periodTo: string;
  prevFrom: string;
  prevTo: string;
  spendValidatedNet: number;
  spendValidatedGross: number;
  spendPrevNet: number;
  ordersCommitmentNet: number;
  ordersCommitmentPrevNet: number;
  deviationOrdersVsDn: number;
  mermaEur: number;
  mermaPrevEur: number;
  mermaPctOfSpend: number;
  pendingCount: number;
  pendingEstimateNet: number;
  pendingEstimateGross: number;
  alertsOpenIncidents: number;
  priceSpikeCount: number;
  dailySpend: { date: string; net: number }[];
  topSuppliers: FinanzasSupplierRow[];
  topArticles: FinanzasArticleRow[];
  topMermas: FinanzasMermaRow[];
  topPriceIncreases: FinanzasPriceSpikeRow[];
  reviewItems: FinanzasReviewItem[];
  health: FinanzasHealth;
  healthReasons: string[];
  validatedNotesRows: FinanzasValidatedNoteRow[];
  hasDeliveryNotesTable: boolean;
};

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + deltaDays);
  return toYmd(dt);
}

/** Periodo actual y comparativa (misma lógica de longitud cuando aplica). */
export function finanzasPeriodRanges(
  preset: FinanzasPeriodPreset,
  now = new Date(),
): { current: { from: string; to: string }; previous: { from: string; to: string } } {
  const to = toYmd(now);
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  if (preset === 'today') {
    const prev = addDaysYmd(to, -1);
    return { current: { from: to, to }, previous: { from: prev, to: prev } };
  }

  if (preset === '7d') {
    const from = addDaysYmd(to, -6);
    const prevTo = addDaysYmd(from, -1);
    const prevFrom = addDaysYmd(prevTo, -6);
    return { current: { from, to }, previous: { from: prevFrom, to: prevTo } };
  }

  if (preset === 'this_month') {
    const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastPrevMonth = new Date(y, m, 0);
    const py = lastPrevMonth.getFullYear();
    const pm = lastPrevMonth.getMonth() + 1;
    const lastDayPrev = lastPrevMonth.getDate();
    const dayClamped = Math.min(d, lastDayPrev);
    const prevTo = `${py}-${String(pm).padStart(2, '0')}-${String(dayClamped).padStart(2, '0')}`;
    const prevFrom = `${py}-${String(pm).padStart(2, '0')}-01`;
    return { current: { from, to }, previous: { from: prevFrom, to: prevTo } };
  }

  /* prev_month: mes calendario anterior completo vs el mes anterior a ese */
  const curStart = new Date(y, m - 1, 1);
  const curEnd = new Date(y, m, 0);
  const prevStart = new Date(y, m - 2, 1);
  const prevEnd = new Date(y, m - 1, 0);
  return {
    current: { from: toYmd(curStart), to: toYmd(curEnd) },
    previous: { from: toYmd(prevStart), to: toYmd(prevEnd) },
  };
}

/** Importe sin IVA para cabecera albarán (KPIs principales). */
export function deliveryNoteNetAmount(note: DeliveryNote): number {
  if (note.subtotal != null && Number.isFinite(note.subtotal)) {
    return Math.round(note.subtotal * 100) / 100;
  }
  if (note.totalAmount != null && note.taxAmount != null && Number.isFinite(note.totalAmount) && Number.isFinite(note.taxAmount)) {
    return Math.round((note.totalAmount - note.taxAmount) * 100) / 100;
  }
  return 0;
}

export function deliveryNoteGrossAmount(note: DeliveryNote): number {
  if (note.totalAmount != null && Number.isFinite(note.totalAmount)) {
    return Math.round(note.totalAmount * 100) / 100;
  }
  if (note.subtotal != null && note.taxAmount != null) {
    return Math.round((note.subtotal + note.taxAmount) * 100) / 100;
  }
  return deliveryNoteNetAmount(note);
}

/** Fecha de imputación: entrega; si falta, fecha creación (documento). */
export function deliveryNoteImputationYmd(note: DeliveryNote): string {
  if (note.deliveryDate && /^\d{4}-\d{2}-\d{2}/.test(note.deliveryDate)) {
    return note.deliveryDate.slice(0, 10);
  }
  return note.createdAt.slice(0, 10);
}

function noteInClosedPeriod(note: DeliveryNote, from: string, to: string): boolean {
  const d = deliveryNoteImputationYmd(note);
  return d >= from && d <= to;
}

function orderNetFromItems(items: PedidoOrderItem[]): number {
  let s = 0;
  for (const i of items) {
    const v = i.vatRate ?? 0;
    const lt = i.lineTotal;
    s += v > 0 && Number.isFinite(v) ? lt / (1 + v) : lt;
  }
  return Math.round(s * 100) / 100;
}

function orderInCommitmentPeriod(o: PedidoOrder, from: string, to: string): boolean {
  const raw = o.sentAt ?? o.createdAt;
  const d = raw.slice(0, 10);
  return d >= from && d <= to && (o.status === 'sent' || o.status === 'received');
}

function dnItemNet(it: DeliveryNoteItem): number {
  if (it.lineSubtotal != null && Number.isFinite(it.lineSubtotal)) {
    return Math.round(it.lineSubtotal * 100) / 100;
  }
  if (it.unitPrice != null && Number.isFinite(it.unitPrice)) {
    return Math.round(it.quantity * it.unitPrice * 100) / 100;
  }
  return 0;
}

/** Precio unitario neto de línea de albarán (para comparar periodos). */
function dnItemUnitPrice(it: DeliveryNoteItem): number | null {
  if (it.unitPrice != null && Number.isFinite(it.unitPrice) && it.unitPrice > 0) {
    return Math.round(it.unitPrice * 10000) / 10000;
  }
  if (
    it.lineSubtotal != null &&
    Number.isFinite(it.lineSubtotal) &&
    it.quantity > 0 &&
    Number.isFinite(it.quantity)
  ) {
    return Math.round((it.lineSubtotal / it.quantity) * 10000) / 10000;
  }
  return null;
}

type UnitPriceBucket = { sumPQ: number; sumQ: number; supplierName: string; label: string };

function accumulateWeightedUnitPrices(
  items: DeliveryNoteItem[],
  noteById: Map<string, DeliveryNote>,
  bucket: Map<string, UnitPriceBucket>,
) {
  for (const it of items) {
    const note = noteById.get(it.deliveryNoteId);
    if (!note) continue;
    const up = dnItemUnitPrice(it);
    if (up == null) continue;
    const q = it.quantity > 0 && Number.isFinite(it.quantity) ? it.quantity : 1;
    const supKey = note.supplierId ?? (note.supplierName.trim() || '—');
    const prodKey = it.internalProductId ?? (it.supplierProductName.trim().toUpperCase() || '—');
    const key = `${supKey}||${prodKey}`;
    const label = it.supplierProductName.trim() || prodKey;
    const cur = bucket.get(key) ?? { sumPQ: 0, sumQ: 0, supplierName: note.supplierName, label };
    cur.sumPQ += up * q;
    cur.sumQ += q;
    if (label) cur.label = label;
    if (note.supplierName) cur.supplierName = note.supplierName;
    bucket.set(key, cur);
  }
}

/** Comparativa PMP ponderada: periodo actual vs anterior (solo albaranes validados). */
function computePriceIncreasesFromDnItems(args: {
  itemsCurrent: DeliveryNoteItem[];
  itemsPrev: DeliveryNoteItem[];
  noteById: Map<string, DeliveryNote>;
  minPrevAvg: number;
  spikeRatio: number;
}): FinanzasPriceSpikeRow[] {
  const { itemsCurrent, itemsPrev, noteById, minPrevAvg, spikeRatio } = args;
  const prevB = new Map<string, UnitPriceBucket>();
  const curB = new Map<string, UnitPriceBucket>();
  accumulateWeightedUnitPrices(itemsPrev, noteById, prevB);
  accumulateWeightedUnitPrices(itemsCurrent, noteById, curB);

  const spikes: FinanzasPriceSpikeRow[] = [];
  for (const [key, cur] of curB) {
    const prev = prevB.get(key);
    if (!prev || prev.sumQ < 0.01) continue;
    const prevAvg = prev.sumPQ / prev.sumQ;
    const last = cur.sumPQ / cur.sumQ;
    if (prevAvg < minPrevAvg) continue;
    if (last < prevAvg * spikeRatio) continue;
    const deltaPct = Math.round(((last - prevAvg) / prevAvg) * 10000) / 100;
    spikes.push({
      label: cur.label || prev.label,
      supplierName: cur.supplierName || prev.supplierName,
      prevAvg: Math.round(prevAvg * 10000) / 10000,
      last: Math.round(last * 10000) / 10000,
      deltaPct,
    });
  }
  spikes.sort((a, b) => b.deltaPct - a.deltaPct);
  return spikes;
}

async function fetchOrderNetTotalsByIds(
  supabase: SupabaseClient,
  localId: string,
  orderIds: string[],
): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (!orderIds.length) return m;
  const { data, error } = await supabase
    .from('purchase_order_items')
    .select('order_id,line_total,vat_rate')
    .eq('local_id', localId)
    .in('order_id', orderIds);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as { order_id: string; line_total: number; vat_rate: number | null }[]) {
    const lt = Number(row.line_total);
    const vat = Number(row.vat_rate ?? 0);
    const net = vat > 0 ? lt / (1 + vat) : lt;
    const oid = String(row.order_id);
    m.set(oid, Math.round(((m.get(oid) ?? 0) + net) * 100) / 100);
  }
  return m;
}

async function fetchOpenIncidentsCountForNotes(
  supabase: SupabaseClient,
  localId: string,
  noteIds: string[],
): Promise<number> {
  if (!noteIds.length) return 0;
  const { count, error } = await supabase
    .from('delivery_note_incidents')
    .select('id', { count: 'exact', head: true })
    .eq('local_id', localId)
    .in('delivery_note_id', noteIds)
    .eq('status', 'open');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function computeHealth(args: {
  spendNet: number;
  spendPrev: number;
  merma: number;
  mermaPrev: number;
  mermaPctOfSpend: number;
  mermaPrevPctOfSpend: number;
  priceSpikeCount: number;
}): { health: FinanzasHealth; reasons: string[] } {
  const u = FINANZAS_UMBRALES.salud;
  const reasons: string[] = [];
  if (args.spendNet <= 0 && args.merma <= 0) {
    return { health: 'no_data', reasons: ['Sin gasto validado ni mermas en el periodo.'] };
  }
  let worsening = 0;
  let improving = 0;
  if (args.spendPrev > u.gastoMinPrevEur && args.spendNet > args.spendPrev * u.gastoSubeRatio) {
    worsening++;
    reasons.push(`Gasto neto +${Math.round((args.spendNet / args.spendPrev - 1) * 100)}% vs periodo anterior.`);
  } else if (args.spendPrev > u.gastoMinPrevEur && args.spendNet < args.spendPrev * u.gastoBajaRatio) {
    improving++;
    reasons.push(`Gasto neto inferior al periodo anterior.`);
  }
  if (args.mermaPrev > u.mermaMinPrevEur && args.merma > args.mermaPrev * u.mermaSubeRatio) {
    worsening++;
    reasons.push('Mermas (€) por encima de la media reciente.');
  } else if (args.mermaPrev > u.mermaMinPrevEur && args.merma < args.mermaPrev * u.mermaBajaRatio) {
    improving++;
    reasons.push('Mermas (€) contenidas vs periodo anterior.');
  }
  if (
    args.spendNet >= u.mermaPctGastoNetoMin &&
    args.mermaPrevPctOfSpend >= u.mermaPctPrevMin &&
    args.mermaPctOfSpend > args.mermaPrevPctOfSpend * u.mermaPctSubeVsPrev
  ) {
    worsening++;
    reasons.push(
      `Ratio mermas/compra ${args.mermaPctOfSpend.toFixed(1)}% (antes ${args.mermaPrevPctOfSpend.toFixed(1)}%).`,
    );
  } else if (
    args.spendNet >= u.mermaPctGastoNetoMin &&
    args.mermaPrevPctOfSpend >= u.mermaPctPrevMin &&
    args.mermaPctOfSpend < args.mermaPrevPctOfSpend * u.mermaPctBajaVsPrev
  ) {
    improving++;
    reasons.push('Ratio mermas/compra mejor vs periodo anterior.');
  }
  if (args.priceSpikeCount >= u.preciosPicosEmpeoran) {
    worsening++;
    reasons.push(
      `${args.priceSpikeCount} referencias con subida fuerte de PMP (≥ ${Math.round((FINANZAS_UMBRALES.preciosPmp.spikeRatio - 1) * 100)}% vs periodo previo).`,
    );
  }
  if (worsening >= 2) return { health: 'worsening', reasons: reasons.length ? reasons : ['Varias señales a la baja.'] };
  if (worsening === 1 && improving === 0) return { health: 'worsening', reasons };
  if (improving >= 1 && worsening === 0) return { health: 'improving', reasons: reasons.length ? reasons : ['Tendencia favorable.'] };
  return { health: 'stable', reasons: reasons.length ? reasons : ['Sin cambios bruscos vs periodo anterior.'] };
}

export async function fetchFinanzasDashboard(
  supabase: SupabaseClient,
  localId: string,
  preset: FinanzasPeriodPreset,
): Promise<FinanzasDashboardData> {
  const { current, previous } = finanzasPeriodRanges(preset);
  const { from: cFrom, to: cTo } = current;
  const { from: pFrom, to: pTo } = previous;

  let notes: DeliveryNote[] = [];
  try {
    notes = await fetchDeliveryNotesForFinanzas(supabase, localId);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('delivery_notes') && (msg.includes('does not exist') || msg.includes('schema cache'))) {
      return emptyDashboard(cFrom, cTo, pFrom, pTo, false);
    }
    throw e;
  }

  const validatedCurrent = notes.filter(
    (n) => n.status === 'validated' && noteInClosedPeriod(n, cFrom, cTo),
  );
  const validatedPrev = notes.filter(
    (n) => n.status === 'validated' && noteInClosedPeriod(n, pFrom, pTo),
  );

  let spendNet = 0;
  let spendGross = 0;
  for (const n of validatedCurrent) {
    spendNet += deliveryNoteNetAmount(n);
    spendGross += deliveryNoteGrossAmount(n);
  }
  spendNet = Math.round(spendNet * 100) / 100;
  spendGross = Math.round(spendGross * 100) / 100;

  let spendPrevNet = 0;
  for (const n of validatedPrev) {
    spendPrevNet += deliveryNoteNetAmount(n);
  }
  spendPrevNet = Math.round(spendPrevNet * 100) / 100;

  const pendingNotes = notes.filter(
    (n) =>
      n.status !== 'validated' &&
      n.status !== 'archived' &&
      noteInClosedPeriod(n, cFrom, cTo),
  );
  let pendingEstimateNet = 0;
  let pendingEstimateGross = 0;
  for (const n of pendingNotes) {
    pendingEstimateNet += deliveryNoteNetAmount(n);
    pendingEstimateGross += deliveryNoteGrossAmount(n);
  }
  pendingEstimateNet = Math.round(pendingEstimateNet * 100) / 100;
  pendingEstimateGross = Math.round(pendingEstimateGross * 100) / 100;

  const orders = await fetchOrders(supabase, localId);
  let ordersCommitmentNet = 0;
  let ordersCommitmentPrevNet = 0;
  for (const o of orders) {
    if (orderInCommitmentPeriod(o, cFrom, cTo)) {
      ordersCommitmentNet += orderNetFromItems(o.items);
    }
    if (orderInCommitmentPeriod(o, pFrom, pTo)) {
      ordersCommitmentPrevNet += orderNetFromItems(o.items);
    }
  }
  ordersCommitmentNet = Math.round(ordersCommitmentNet * 100) / 100;
  ordersCommitmentPrevNet = Math.round(ordersCommitmentPrevNet * 100) / 100;

  const deviationOrdersVsDn = Math.round((ordersCommitmentNet - spendNet) * 100) / 100;

  const { mermas } = await fetchProductsAndMermas(supabase, localId);
  let mermaEur = 0;
  let mermaPrevEur = 0;
  for (const m of mermas) {
    const d = m.occurredAt.slice(0, 10);
    const c = Number(m.costEur ?? 0);
    if (d >= cFrom && d <= cTo) mermaEur += c;
    if (d >= pFrom && d <= pTo) mermaPrevEur += c;
  }
  mermaEur = Math.round(mermaEur * 100) / 100;
  mermaPrevEur = Math.round(mermaPrevEur * 100) / 100;

  const mermaPctOfSpend = spendNet > 0 ? Math.round((mermaEur / spendNet) * 10000) / 100 : 0;

  const noteIdsCurrent = validatedCurrent.map((n) => n.id);
  const openIncidents = noteIdsCurrent.length
    ? await fetchOpenIncidentsCountForNotes(supabase, localId, noteIdsCurrent)
    : 0;

  const orderIdsForDeviation = [
    ...new Set(validatedCurrent.map((n) => n.relatedOrderId).filter(Boolean) as string[]),
  ];
  const orderNetMap = await fetchOrderNetTotalsByIds(supabase, localId, orderIdsForDeviation);

  const dailyMap = new Map<string, number>();
  for (const n of validatedCurrent) {
    const key = deliveryNoteImputationYmd(n);
    dailyMap.set(key, Math.round(((dailyMap.get(key) ?? 0) + deliveryNoteNetAmount(n)) * 100) / 100);
  }
  const dailySpend: { date: string; net: number }[] = [];
  for (let t = new Date(cFrom + 'T12:00:00').getTime(); t <= new Date(cTo + 'T12:00:00').getTime(); t += 86400000) {
    const key = toYmd(new Date(t));
    dailySpend.push({ date: key, net: dailyMap.get(key) ?? 0 });
  }

  const supMap = new Map<string, { name: string; net: number; count: number }>();
  for (const n of validatedCurrent) {
    const sid = n.supplierId ?? '';
    const name = n.supplierName || '—';
    const k = sid || name;
    const cur = supMap.get(k) ?? { name, net: 0, count: 0 };
    cur.net += deliveryNoteNetAmount(n);
    cur.count += 1;
    supMap.set(k, cur);
  }
  const supPrevMap = new Map<string, number>();
  for (const n of validatedPrev) {
    const sid = n.supplierId ?? '';
    const name = n.supplierName || '—';
    const k = sid || name;
    supPrevMap.set(k, Math.round(((supPrevMap.get(k) ?? 0) + deliveryNoteNetAmount(n)) * 100) / 100);
  }
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const topSuppliers: FinanzasSupplierRow[] = [...supMap.entries()]
    .map(([k, v]) => {
      const prevN = supPrevMap.get(k) ?? null;
      const deltaVsPrev = prevN != null && prevN > 0 ? Math.round((v.net / prevN - 1) * 10000) / 100 : null;
      return {
        supplierId: uuidRe.test(k) ? k : null,
        supplierName: v.name,
        net: Math.round(v.net * 100) / 100,
        count: v.count,
        pctOfTotal: spendNet > 0 ? Math.round((v.net / spendNet) * 10000) / 100 : 0,
        deltaVsPrev,
      };
    })
    .sort((a, b) => b.net - a.net)
    .slice(0, 15);

  const items = await fetchDeliveryNoteItemsForNotes(supabase, localId, noteIdsCurrent);
  const noteIdsPrev = validatedPrev.map((n) => n.id);
  const itemsPrev =
    noteIdsPrev.length > 0 ? await fetchDeliveryNoteItemsForNotes(supabase, localId, noteIdsPrev) : [];

  const noteByIdForPricing = new Map<string, DeliveryNote>();
  for (const n of validatedCurrent) noteByIdForPricing.set(n.id, n);
  for (const n of validatedPrev) noteByIdForPricing.set(n.id, n);

  const priceSpikeRows = computePriceIncreasesFromDnItems({
    itemsCurrent: items,
    itemsPrev,
    noteById: noteByIdForPricing,
    minPrevAvg: FINANZAS_UMBRALES.preciosPmp.minPrevAvgEur,
    spikeRatio: FINANZAS_UMBRALES.preciosPmp.spikeRatio,
  });
  const topPriceIncreases = priceSpikeRows.slice(0, 15);
  const priceSpikeCount = priceSpikeRows.length;

  const articleAgg = new Map<string, { label: string; net: number; lines: number }>();
  for (const it of items) {
    const key = it.internalProductId ?? (it.supplierProductName.trim().toUpperCase() || '—');
    const label = it.supplierProductName.trim() || key;
    const cur = articleAgg.get(key) ?? { label, net: 0, lines: 0 };
    cur.net += dnItemNet(it);
    cur.lines += 1;
    if (!cur.label && label) cur.label = label;
    articleAgg.set(key, cur);
  }
  const topArticles: FinanzasArticleRow[] = [...articleAgg.values()]
    .map((v) => ({
      key: v.label,
      label: v.label,
      net: Math.round(v.net * 100) / 100,
      lines: v.lines,
    }))
    .sort((a, b) => b.net - a.net)
    .slice(0, 15);

  const mermaAgg = new Map<string, { label: string; eur: number }>();
  for (const m of mermas) {
    const d = m.occurredAt.slice(0, 10);
    if (d < cFrom || d > cTo) continue;
    const key = m.motiveKey;
    const cur = mermaAgg.get(key) ?? { label: key, eur: 0 };
    cur.eur += Number(m.costEur ?? 0);
    mermaAgg.set(key, cur);
  }
  const topMermas: FinanzasMermaRow[] = [...mermaAgg.values()]
    .map((v) => ({
      key: v.label,
      label: v.label,
      eur: Math.round(v.eur * 100) / 100,
      pctOfSpend: spendNet > 0 ? Math.round((v.eur / spendNet) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.eur - a.eur)
    .slice(0, 10);

  const mermaPrevPctOfSpend =
    spendPrevNet > 0 ? Math.round((mermaPrevEur / spendPrevNet) * 10000) / 100 : 0;

  const { health, reasons } = computeHealth({
    spendNet,
    spendPrev: spendPrevNet,
    merma: mermaEur,
    mermaPrev: mermaPrevEur,
    mermaPctOfSpend,
    mermaPrevPctOfSpend,
    priceSpikeCount,
  });

  const reviewItems: FinanzasReviewItem[] = [];
  const rv = FINANZAS_UMBRALES.revision;
  if (pendingNotes.length > 0) {
    reviewItems.push({
      priority: 3,
      kind: 'pending_validate',
      title: `${pendingNotes.length} albarán(es) sin validar en el periodo`,
      impactLabel: `~${pendingEstimateNet.toFixed(2)} € neto pendiente`,
      href: '/finanzas/albaranes?estado=pendiente',
    });
  }
  if (openIncidents > 0) {
    reviewItems.push({
      priority: 2,
      kind: 'incidents',
      title: `${openIncidents} incidencia(s) abierta(s) en albaranes validados`,
      impactLabel: 'Revisar en Albaranes',
      href: '/pedidos/albaranes',
    });
  }
  let largeDeviation = 0;
  for (const n of validatedCurrent) {
    if (!n.relatedOrderId) continue;
    const oNet = orderNetMap.get(n.relatedOrderId) ?? 0;
    const nNet = deliveryNoteNetAmount(n);
    const diff = Math.abs(nNet - oNet);
    if (oNet > 0 && diff / oNet > rv.albaranVsPedidoRatio && diff > rv.albaranVsPedidoMinEur) largeDeviation++;
    if (oNet <= 0 && diff > rv.albaranVsPedidoSinPedidoMinEur) largeDeviation++;
  }
  if (largeDeviation > 0) {
    reviewItems.push({
      priority: 1,
      kind: 'deviation',
      title: `${largeDeviation} albarán(es) con desvío fuerte vs pedido vinculado`,
      impactLabel: 'Reconciliar',
      href: '/finanzas/albaranes',
    });
  }
  const aggDesvioMin = Math.max(
    rv.pedidosVsAlbaranesMinEur,
    ordersCommitmentNet * rv.pedidosVsAlbaranesFraccionCompromiso,
  );
  if (Math.abs(deviationOrdersVsDn) > aggDesvioMin && ordersCommitmentNet > 0) {
    reviewItems.push({
      priority: 2,
      kind: 'aggregate',
      title: 'Compromiso pedidos vs albaranes validados',
      impactLabel: `${deviationOrdersVsDn >= 0 ? '+' : ''}${deviationOrdersVsDn.toFixed(0)} € neto (pedidos − albaranes; umbral ${aggDesvioMin.toFixed(0)} €)`,
      href: '/finanzas/compras',
    });
  }
  if (spendNet >= rv.mermaPctCompraMinGastoNeto && mermaPctOfSpend >= rv.mermaPctCompraAlerta) {
    reviewItems.push({
      priority: 2,
      kind: 'merma_ratio',
      title: `Mermas altas frente a compra (${mermaPctOfSpend.toFixed(1)}% del gasto neto)`,
      impactLabel: `Umbral ${rv.mermaPctCompraAlerta}% con compra ≥ ${rv.mermaPctCompraMinGastoNeto} €`,
      href: '/finanzas/mermas',
    });
  }
  if (priceSpikeCount > 0) {
    const p = FINANZAS_UMBRALES.preciosPmp;
    reviewItems.push({
      priority: 3,
      kind: 'price_spike',
      title: `${priceSpikeCount} artículo(s) con subida de PMP vs periodo anterior`,
      impactLabel: `≥ ${Math.round((p.spikeRatio - 1) * 100)}% sobre PMP media del periodo previo (mín. ${p.minPrevAvgEur} €/ud.)`,
      href: '/finanzas/precios',
    });
  }
  reviewItems.sort((a, b) => a.priority - b.priority);

  const validatedNotesRows: FinanzasValidatedNoteRow[] = validatedCurrent
    .map((n) => ({
      id: n.id,
      supplierName: n.supplierName,
      net: deliveryNoteNetAmount(n),
      gross: deliveryNoteGrossAmount(n),
      imputationDate: deliveryNoteImputationYmd(n),
      relatedOrderId: n.relatedOrderId,
      deliveryNoteNumber: n.deliveryNoteNumber,
    }))
    .sort((a, b) => b.imputationDate.localeCompare(a.imputationDate));

  return {
    periodFrom: cFrom,
    periodTo: cTo,
    prevFrom: pFrom,
    prevTo: pTo,
    spendValidatedNet: spendNet,
    spendValidatedGross: spendGross,
    spendPrevNet,
    ordersCommitmentNet,
    ordersCommitmentPrevNet,
    deviationOrdersVsDn,
    mermaEur,
    mermaPrevEur,
    mermaPctOfSpend,
    pendingCount: pendingNotes.length,
    pendingEstimateNet,
    pendingEstimateGross,
    alertsOpenIncidents: openIncidents,
    priceSpikeCount,
    dailySpend,
    topSuppliers,
    topArticles,
    topMermas,
    topPriceIncreases,
    reviewItems,
    health,
    healthReasons: reasons,
    validatedNotesRows,
    hasDeliveryNotesTable: true,
  };
}

function emptyDashboard(
  cFrom: string,
  cTo: string,
  pFrom: string,
  pTo: string,
  hasTable: boolean,
): FinanzasDashboardData {
  return {
    periodFrom: cFrom,
    periodTo: cTo,
    prevFrom: pFrom,
    prevTo: pTo,
    spendValidatedNet: 0,
    spendValidatedGross: 0,
    spendPrevNet: 0,
    ordersCommitmentNet: 0,
    ordersCommitmentPrevNet: 0,
    deviationOrdersVsDn: 0,
    mermaEur: 0,
    mermaPrevEur: 0,
    mermaPctOfSpend: 0,
    pendingCount: 0,
    pendingEstimateNet: 0,
    pendingEstimateGross: 0,
    alertsOpenIncidents: 0,
    priceSpikeCount: 0,
    dailySpend: [],
    topSuppliers: [],
    topArticles: [],
    topMermas: [],
    topPriceIncreases: [],
    reviewItems: [],
    health: 'no_data',
    healthReasons: ['No hay datos de albaranes o falta ejecutar el SQL de delivery_notes.'],
    validatedNotesRows: [],
    hasDeliveryNotesTable: hasTable,
  };
}
