/**
 * Patrones temporales sobre histórico real de pedidos (sin IA externa).
 * Local + proveedor en el caller; aquí solo matemática y redacción prudente.
 */

import { medianPositive } from '@/lib/pedidos-historial-stats';
import type { PedidoOrder, PedidoSupplierProduct } from '@/lib/pedidos-supabase';

const MS_DAY = 86_400_000;
const LOOKBACK_DAYS = 120;

const WD_LONG: Record<number, string> = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
};

const DRINK_KEYWORDS = /\b(cerveza|cervezas|cola|coca|refresco|agua|nestea|monster|red\s*bull|monster|tonica|tónica|sidra|vino|bebida)\b/i;

export type TemporalInsightKind =
  | 'weekday_lift'
  | 'recent_trend'
  | 'weekend_rhythm'
  | 'drink_cluster_trend'
  | 'vs_three_weeks_ago';

export type TemporalInsight = {
  id: string;
  kind: TemporalInsightKind;
  /** Una línea corta para chips */
  headline: string;
  /** Detalle opcional (sheet / tooltip) */
  detail?: string;
  confidence: 'alta' | 'media' | 'baja';
};

/** Nivel conceptual Fase 3 (progresivo); no persiste en BD. */
export type InsightMaturityLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type TemporalPatternsResult = {
  maturityLevel: InsightMaturityLevel;
  learningMessage: string | null;
  insights: TemporalInsight[];
  /** Subconjunto para UI compacta */
  displayInsights: TemporalInsight[];
};

function orderCommitTime(o: PedidoOrder): number {
  const raw = o.sentAt ?? o.createdAt;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function includeOrder(o: PedidoOrder): boolean {
  if (o.status === 'draft') return false;
  if (!o.items?.length) return false;
  return o.items.some((i) => i.supplierProductId && i.quantity > 0);
}

type PerProductBuckets = {
  name: string;
  /** weekday -> lista de cantidades por pedido (un valor por pedido que incluye el producto) */
  byWeekday: Map<number, number[]>;
};

function buildBuckets(
  orders: PedidoOrder[],
  supplierId: string,
  catalog: Map<string, PedidoSupplierProduct>,
  cutoffMs: number,
): Map<string, PerProductBuckets> {
  const map = new Map<string, PerProductBuckets>();

  for (const o of orders) {
    if (o.supplierId !== supplierId || !includeOrder(o)) continue;
    const t = orderCommitTime(o);
    if (t < cutoffMs || t <= 0) continue;
    const wd = new Date(t).getDay();

    const perPid = new Map<string, number>();
    for (const it of o.items) {
      const pid = it.supplierProductId;
      if (!pid || !catalog.has(pid)) continue;
      if (it.incidentType === 'missing') continue;
      const q = Number(it.quantity);
      if (!(q > 0) || !Number.isFinite(q)) continue;
      perPid.set(pid, (perPid.get(pid) ?? 0) + q);
    }

    for (const [pid, qty] of perPid) {
      const p = catalog.get(pid)!;
      let b = map.get(pid);
      if (!b) {
        b = { name: p.name?.trim() || 'Producto', byWeekday: new Map() };
        map.set(pid, b);
      }
      const arr = b.byWeekday.get(wd) ?? [];
      arr.push(qty);
      b.byWeekday.set(wd, arr);
    }
  }

  return map;
}

function sumQtyWindow(
  orders: PedidoOrder[],
  supplierId: string,
  catalogIds: Set<string>,
  fromMs: number,
  toMs: number,
): Map<string, number> {
  const sums = new Map<string, number>();
  for (const o of orders) {
    if (o.supplierId !== supplierId || !includeOrder(o)) continue;
    const t = orderCommitTime(o);
    if (t < fromMs || t >= toMs) continue;
    for (const it of o.items) {
      const pid = it.supplierProductId;
      if (!pid || !catalogIds.has(pid)) continue;
      if (it.incidentType === 'missing') continue;
      const q = Number(it.quantity);
      if (!(q > 0) || !Number.isFinite(q)) continue;
      sums.set(pid, (sums.get(pid) ?? 0) + q);
    }
  }
  return sums;
}

function pctChange(prev: number, next: number): number | null {
  if (!(prev > 0) || !(next >= 0)) return null;
  return ((next - prev) / prev) * 100;
}

function confidenceFromSamples(n: number, ratioStrong: number): 'alta' | 'media' | 'baja' {
  if (n >= 6 && ratioStrong >= 1.28) return 'alta';
  if (n >= 4 && ratioStrong >= 1.18) return 'media';
  return 'baja';
}

export function computeTemporalPatterns(
  orders: PedidoOrder[],
  supplierId: string,
  supplierProducts: PedidoSupplierProduct[],
  now: Date = new Date(),
): TemporalPatternsResult {
  const catalog = new Map(supplierProducts.filter((p) => p.isActive).map((p) => [p.id, p]));
  const catalogIds = new Set(catalog.keys());
  if (!supplierId || catalogIds.size === 0) {
    return {
      maturityLevel: 1,
      learningMessage: 'Histórico insuficiente para detectar patrones.',
      insights: [],
      displayInsights: [],
    };
  }

  const nowMs = now.getTime();
  const cutoffMs = nowMs - LOOKBACK_DAYS * MS_DAY;

  const relevantOrders = orders.filter(
    (o) => o.supplierId === supplierId && includeOrder(o) && orderCommitTime(o) >= cutoffMs && orderCommitTime(o) > 0,
  );

  if (relevantOrders.length < 3) {
    return {
      maturityLevel: 1,
      learningMessage: 'Aún estamos aprendiendo tus hábitos con este proveedor.',
      insights: [],
      displayInsights: [],
    };
  }

  const buckets = buildBuckets(orders, supplierId, catalog, cutoffMs);
  const insights: TemporalInsight[] = [];

  // ── 1) Días fuertes (fin de semana vs Luna–Jue) ─────────────────────────
  const WEEKEND = new Set([5, 6, 0]);
  const MIDWEEK = new Set([1, 2, 3, 4]);

  for (const [pid, b] of buckets) {
    const weekendVals: number[] = [];
    const midVals: number[] = [];
    for (const wd of WEEKEND) {
      const a = b.byWeekday.get(wd);
      if (a) weekendVals.push(...a);
    }
    for (const wd of MIDWEEK) {
      const a = b.byWeekday.get(wd);
      if (a) midVals.push(...a);
    }
    if (weekendVals.length < 3 || midVals.length < 3) continue;

    const medW = medianPositive(weekendVals);
    const medM = medianPositive(midVals);
    if (medW == null || medM == null || medM <= 0) continue;
    const ratio = medW / medM;
    if (ratio < 1.22) continue;

    const sat = b.byWeekday.get(6) ?? [];
    const fri = b.byWeekday.get(5) ?? [];
    const sun = b.byWeekday.get(0) ?? [];
    let labelWd = 6;
    let labelArr = sat;
    if (fri.length >= sat.length && fri.length >= sun.length) {
      labelWd = 5;
      labelArr = fri;
    } else if (sun.length > sat.length) {
      labelWd = 0;
      labelArr = sun;
    }

    const conf = confidenceFromSamples(weekendVals.length + midVals.length, ratio);
    const dayName = WD_LONG[labelWd] ?? 'fin de semana';
    insights.push({
      id: `wl:${supplierId}:${pid}`,
      kind: 'weekend_rhythm',
      headline: `Los ${dayName}s suele subir ${b.name}`,
      detail: `Según histórico (mediana fin de semana vs entre semana ~${Math.round(ratio * 100 - 100)}%). No es una predicción.`,
      confidence: conf,
    });
  }

  // ── 2) Un día laborable concreto con más volumen ─────────────────────────
  for (const [pid, b] of buckets) {
    const poolMid: number[] = [];
    for (const wd of MIDWEEK) {
      const a = b.byWeekday.get(wd);
      if (a) poolMid.push(...a);
    }
    const medMid = medianPositive(poolMid);
    if (medMid == null || medMid <= 0) continue;

    for (const wd of [4, 3, 2]) {
      const arr = b.byWeekday.get(wd) ?? [];
      if (arr.length < 3) continue;
      const med = medianPositive(arr);
      if (med == null || med <= medMid * 1.2) continue;
      const ratio = med / medMid;
      insights.push({
        id: `wd:${supplierId}:${pid}:${wd}`,
        kind: 'weekday_lift',
        headline: `Los ${WD_LONG[wd]}s aumenta ${b.name}`,
        detail: `Comparado con Lun–Jue en el mismo periodo (según histórico).`,
        confidence: confidenceFromSamples(arr.length + poolMid.length, ratio),
      });
      break;
    }
  }

  // ── 3) Tendencia 14d vs 14d anterior ───────────────────────────────────
  const w14 = 14 * MS_DAY;
  const recentFrom = nowMs - w14;
  const prevFrom = nowMs - 2 * w14;
  const prevTo = nowMs - w14;

  const sumRecent = sumQtyWindow(orders, supplierId, catalogIds, recentFrom, nowMs);
  const sumPrev = sumQtyWindow(orders, supplierId, catalogIds, prevFrom, prevTo);

  for (const [pid, qR] of sumRecent) {
    const qP = sumPrev.get(pid) ?? 0;
    const pct = pctChange(qP, qR);
    if (pct == null || Math.abs(pct) < 15) continue;
    const name = catalog.get(pid)?.name?.trim() || 'Producto';
    const up = pct > 0;
    insights.push({
      id: `tr:${supplierId}:${pid}`,
      kind: 'recent_trend',
      headline: up
        ? `Últimas semanas: más ${name} (~${Math.round(Math.abs(pct))}%)`
        : `Últimas semanas: menos ${name} (~${Math.round(Math.abs(pct))}%)`,
      detail: 'Comparación 14 días vs 14 días anteriores; orientativo.',
      confidence: Math.abs(pct) >= 28 && qP >= 4 ? 'media' : 'baja',
    });
  }

  // ── 4) vs hace ~3 semanas (ventana 7d vs 7d de hace 21d) ─────────────────
  const w7 = 7 * MS_DAY;
  const last7 = sumQtyWindow(orders, supplierId, catalogIds, nowMs - w7, nowMs);
  const old7 = sumQtyWindow(orders, supplierId, catalogIds, nowMs - 21 * MS_DAY, nowMs - 14 * MS_DAY);

  for (const [pid, qN] of last7) {
    const qO = old7.get(pid) ?? 0;
    const pct = pctChange(qO, qN);
    if (pct == null || pct < 22 || qO < 3) continue;
    const name = catalog.get(pid)?.name?.trim() || 'Producto';
    insights.push({
      id: `3w:${supplierId}:${pid}`,
      kind: 'vs_three_weeks_ago',
      headline: `Compras más ${name} que hace ~3 semanas`,
      detail: 'Ventanas de 7 días comparadas; revisa temporada y picos puntuales.',
      confidence: pct >= 35 ? 'media' : 'baja',
    });
  }

  // ── 5) Bebidas / cluster nombre (ligero) ─────────────────────────────────
  let drinkRecent = 0;
  let drinkPrev = 0;
  for (const [pid, q] of sumRecent) {
    const n = catalog.get(pid)?.name ?? '';
    if (DRINK_KEYWORDS.test(n)) drinkRecent += q;
  }
  for (const [pid, q] of sumPrev) {
    const n = catalog.get(pid)?.name ?? '';
    if (DRINK_KEYWORDS.test(n)) drinkPrev += q;
  }
  const drinkPct = pctChange(drinkPrev, drinkRecent);
  if (drinkPct != null && drinkPct >= 18 && drinkPrev >= 6) {
    insights.push({
      id: `bev:${supplierId}`,
      kind: 'drink_cluster_trend',
      headline: `Últimas semanas: sube bebida fría (~${Math.round(drinkPct)}%)`,
      detail: 'Agrupación por nombre de producto; no incluye todos los formatos.',
      confidence: drinkPct >= 30 ? 'media' : 'baja',
    });
  }

  // Orden: confianza + tipo
  const rank: Record<string, number> = { alta: 3, media: 2, baja: 1 };
  insights.sort((a, b) => rank[b.confidence] - rank[a.confidence] || a.headline.localeCompare(b.headline));

  const dedup = new Set<string>();
  const unique: TemporalInsight[] = [];
  for (const i of insights) {
    const k = `${i.kind}:${i.headline.slice(0, 48)}`;
    if (dedup.has(k)) continue;
    dedup.add(k);
    unique.push(i);
    if (unique.length >= 12) break;
  }

  const displayInsights = unique.slice(0, 4);

  let maturityLevel: InsightMaturityLevel = 3;
  if (relevantOrders.length >= 25 && unique.length >= 3) maturityLevel = 4;
  else if (relevantOrders.length >= 15 && unique.length >= 1) maturityLevel = 4;
  else if (relevantOrders.length >= 8) maturityLevel = 3;
  else maturityLevel = 2;

  let learningMessage: string | null = null;
  if (unique.length === 0) {
    learningMessage =
      relevantOrders.length < 8
        ? 'Las sugerencias mejorarán con más histórico.'
        : 'Patrones poco claros todavía; seguimos aprendiendo.';
  }

  return {
    maturityLevel,
    learningMessage,
    insights: unique,
    displayInsights,
  };
}
