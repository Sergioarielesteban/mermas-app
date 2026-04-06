import type { MermaRecord, Product } from '@/lib/types';
import { toBusinessDate } from '@/lib/business-day';

const WEEK_DAYS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

function toMondayIndex(jsDay: number) {
  return (jsDay + 6) % 7;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfBusinessWeek(date: Date) {
  const out = new Date(date);
  out.setDate(out.getDate() - toMondayIndex(out.getDay()));
  return out;
}

export function totals(mermas: MermaRecord[]) {
  const now = toBusinessDate(new Date());
  const weekStart = startOfBusinessWeek(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let today = 0;
  let week = 0;
  let month = 0;

  for (const m of mermas) {
    const d = toBusinessDate(m.occurredAt);
    if (isSameDay(d, now)) today += m.costEur;
    if (d >= weekStart) week += m.costEur;
    if (d >= monthStart) month += m.costEur;
  }
  return { today, week, month };
}

export function weekBars(mermas: MermaRecord[]) {
  const values = Array.from({ length: 7 }, () => 0);
  const now = toBusinessDate(new Date());
  const weekStart = startOfBusinessWeek(now);

  for (const m of mermas) {
    const d = toBusinessDate(m.occurredAt);
    if (d < weekStart) continue;
    const idx = toMondayIndex(d.getDay());
    values[idx] += m.costEur;
  }

  return WEEK_DAYS.map((label, i) => ({ day: label, cost: Math.round(values[i] * 100) / 100 }));
}

export function monthTrend(mermas: MermaRecord[]) {
  const now = toBusinessDate(new Date());
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const values = Array.from({ length: daysInMonth }, () => 0);

  for (const m of mermas) {
    const d = toBusinessDate(m.occurredAt);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    values[d.getDate() - 1] += m.costEur;
  }

  return values.map((cost, i) => ({ day: i + 1, cost: Math.round(cost * 100) / 100 }));
}

export function topByQuantity(mermas: MermaRecord[], products: Product[], top = 5) {
  const map = new Map<string, number>();
  for (const m of mermas) {
    map.set(m.productId, (map.get(m.productId) ?? 0) + m.quantity);
  }

  return Array.from(map.entries())
    .map(([productId, quantity]) => ({
      productId,
      name: products.find((p) => p.id === productId)?.name ?? 'Producto',
      value: Math.round(quantity * 100) / 100,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, top)
    .reverse();
}

export function topByValue(mermas: MermaRecord[], products: Product[], top = 5) {
  const map = new Map<string, number>();
  for (const m of mermas) {
    map.set(m.productId, (map.get(m.productId) ?? 0) + m.costEur);
  }

  return Array.from(map.entries())
    .map(([productId, amount]) => ({
      productId,
      name: products.find((p) => p.id === productId)?.name ?? 'Producto',
      value: Math.round(amount * 100) / 100,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, top)
    .reverse();
}

export function monthComparison(mermas: MermaRecord[]) {
  const now = toBusinessDate(new Date());
  const currentY = now.getFullYear();
  const currentM = now.getMonth();
  const prevDate = new Date(currentY, currentM - 1, 1);
  const prevY = prevDate.getFullYear();
  const prevM = prevDate.getMonth();

  let current = 0;
  let previous = 0;

  for (const m of mermas) {
    const d = toBusinessDate(m.occurredAt);
    if (d.getFullYear() === currentY && d.getMonth() === currentM) current += m.costEur;
    if (d.getFullYear() === prevY && d.getMonth() === prevM) previous += m.costEur;
  }

  const diff = current - previous;
  const pct = previous > 0 ? (diff / previous) * 100 : current > 0 ? 100 : 0;

  const monthLabel = (year: number, month: number) =>
    new Date(year, month, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  return {
    current,
    previous,
    diff,
    pct,
    chart: [
      { month: monthLabel(prevY, prevM), value: Math.round(previous * 100) / 100 },
      { month: monthLabel(currentY, currentM), value: Math.round(current * 100) / 100 },
    ],
  };
}

export function highWasteAlerts(mermas: MermaRecord[], products: Product[], top = 3) {
  const now = toBusinessDate(new Date());
  const days = 7;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const map = new Map<string, { total: number; events: number }>();

  for (const m of mermas) {
    const d = toBusinessDate(m.occurredAt);
    if (d < start) continue;
    const prev = map.get(m.productId) ?? { total: 0, events: 0 };
    prev.total += m.costEur;
    prev.events += 1;
    map.set(m.productId, prev);
  }

  const items = Array.from(map.entries())
    .map(([productId, data]) => ({
      productId,
      productName: products.find((p) => p.id === productId)?.name ?? 'Producto',
      totalCost: Math.round(data.total * 100) / 100,
      events: data.events,
      severity: data.total >= 12 || data.events >= 8 ? 'alta' : data.total >= 6 ? 'media' : 'baja',
    }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, top);

  return items;
}

export function topMotives(mermas: MermaRecord[], top = 5) {
  const labels: Record<MermaRecord['motiveKey'], string> = {
    'se-quemo': 'SE QUEMÓ',
    'mal-estado': 'MAL ESTADO',
    'cliente-cambio': 'EL CLIENTE CAMBIÓ',
    'error-cocina': 'ERROR DEL EQUIPO',
    'sobras-marcaje': 'SOBRAS DE MARCAJE',
    cancelado: 'CANCELADO',
  };

  const map = new Map<MermaRecord['motiveKey'], { events: number; total: number }>();
  for (const m of mermas) {
    const prev = map.get(m.motiveKey) ?? { events: 0, total: 0 };
    prev.events += 1;
    prev.total += m.costEur;
    map.set(m.motiveKey, prev);
  }

  return Array.from(map.entries())
    .map(([key, data]) => ({
      key,
      label: labels[key],
      events: data.events,
      totalCost: Math.round(data.total * 100) / 100,
    }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, top);
}

export function anomalyAlerts(mermas: MermaRecord[], products: Product[], top = 3) {
  const now = toBusinessDate(new Date());
  const currentStart = new Date(now);
  currentStart.setDate(now.getDate() - 7);
  const previousStart = new Date(now);
  previousStart.setDate(now.getDate() - 14);

  const current = new Map<string, number>();
  const previous = new Map<string, number>();

  for (const m of mermas) {
    const d = toBusinessDate(m.occurredAt);
    if (d >= currentStart) {
      current.set(m.productId, (current.get(m.productId) ?? 0) + m.costEur);
      continue;
    }
    if (d >= previousStart && d < currentStart) {
      previous.set(m.productId, (previous.get(m.productId) ?? 0) + m.costEur);
    }
  }

  return Array.from(current.entries())
    .map(([productId, currentValue]) => {
      const previousValue = previous.get(productId) ?? 0;
      const delta = currentValue - previousValue;
      const ratio = previousValue > 0 ? currentValue / previousValue : currentValue > 0 ? 2 : 1;
      const severity = ratio >= 2.2 || delta >= 8 ? 'alta' : 'media';
      return {
        productId,
        productName: products.find((p) => p.id === productId)?.name ?? 'Producto',
        current: Math.round(currentValue * 100) / 100,
        previous: Math.round(previousValue * 100) / 100,
        delta: Math.round(delta * 100) / 100,
        ratio,
        severity,
      };
    })
    .filter((item) => item.current >= 3 && item.ratio >= 1.5 && item.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, top);
}

