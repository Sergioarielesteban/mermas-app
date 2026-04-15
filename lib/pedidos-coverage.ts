/**
 * Cobertura entre entregas para pedidos (días de consumo hasta el siguiente reparto).
 * Días de la semana en convención JS: 0 = domingo … 6 = sábado (Date.getDay()).
 */

export function parseLocalDateYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

/** Normaliza y ordena días 0–6 únicos. */
export function normalizeDeliveryCycleWeekdays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const nums = raw
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return [...new Set(nums)].sort((a, b) => a - b);
}

/**
 * Días de cobertura desde la fecha de entrega (inclusive) hasta el día anterior al siguiente reparto.
 * Ciclo vacío → 7 días (una sola referencia semanal).
 */
export function coverageDaysUntilNextDelivery(deliveryDateYmd: string, cycleWeekdays: number[]): number {
  const start = parseLocalDateYmd(deliveryDateYmd);
  if (!start) return 7;
  const cycle = normalizeDeliveryCycleWeekdays(cycleWeekdays);
  if (cycle.length === 0) return 7;
  const dow = start.getDay();
  for (const w of cycle) {
    if (w > dow) return w - dow;
  }
  return 7 - dow + cycle[0];
}

/** Escala una referencia semanal (7 días) al tramo actual. */
export function weeklyParScaledToCoverageDays(weeklyPar: number, coverageDays: number): number {
  if (!(weeklyPar > 0) || !Number.isFinite(coverageDays)) return 0;
  const d = Math.max(1, Math.min(14, coverageDays));
  return Math.round((weeklyPar * d) / 7 * 100) / 100;
}

export function coverageDateRangeLabel(deliveryDateYmd: string, coverageDays: number): string {
  const start = parseLocalDateYmd(deliveryDateYmd);
  if (!start || coverageDays < 1) return '';
  const end = new Date(start);
  end.setDate(end.getDate() + coverageDays - 1);
  const fmt = (dt: Date) =>
    dt.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${fmt(start)} → ${fmt(end)} · ${coverageDays} días`;
}

const WD_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function formatDeliveryCycleSummary(cycleWeekdays: number[]): string {
  const c = normalizeDeliveryCycleWeekdays(cycleWeekdays);
  if (c.length === 0) return 'Sin ciclo (objetivo = semana completa, 7 días)';
  return c.map((d) => WD_SHORT[d] ?? d).join(', ');
}

export function isDeliveryDateOnConfiguredCycle(deliveryDateYmd: string, cycleWeekdays: number[]): boolean {
  const cycle = normalizeDeliveryCycleWeekdays(cycleWeekdays);
  if (cycle.length === 0) return true;
  const d = parseLocalDateYmd(deliveryDateYmd);
  if (!d) return true;
  return cycle.includes(d.getDay());
}

export function suggestedOrderQuantityForPar(unit: 'kg' | string, parScaled: number): number {
  if (!(parScaled > 0)) return 0;
  if (unit === 'kg') return Math.round(parScaled * 100) / 100;
  return Math.max(1, Math.ceil(parScaled - 1e-9));
}
