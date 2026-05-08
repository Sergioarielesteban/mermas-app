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

/** Normaliza fechas YYYY-MM-DD únicas y ordenadas. */
export function normalizeDeliveryExceptionDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const dates = raw
    .map((x) => String(x ?? '').trim())
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && parseLocalDateYmd(s) != null);
  return [...new Set(dates)].sort();
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
 * Ciclo vacío → 7 días (una sola referencia semanal), salvo que exista excepción futura.
 */
export function coverageDaysUntilNextDelivery(
  deliveryDateYmd: string,
  cycleWeekdays: number[],
  exceptionDates: string[] = [],
): number {
  const start = parseLocalDateYmd(deliveryDateYmd);
  if (!start) return 7;
  const next = nextDeliveryDateYmd(deliveryDateYmd, cycleWeekdays, exceptionDates);
  if (!next) return 7;
  const nextDate = parseLocalDateYmd(next);
  if (!nextDate) return 7;
  const diff = Math.round((nextDate.getTime() - start.getTime()) / 86400000);
  return Math.max(1, Math.min(14, diff));
}

/** Próxima fecha de entrega posterior a `deliveryDateYmd` según ciclo o excepciones. */
export function nextDeliveryDateYmd(
  deliveryDateYmd: string,
  cycleWeekdays: number[],
  exceptionDates: string[] = [],
): string | null {
  const start = parseLocalDateYmd(deliveryDateYmd);
  if (!start) return null;
  const cycle = normalizeDeliveryCycleWeekdays(cycleWeekdays);
  const ex = normalizeDeliveryExceptionDates(exceptionDates);

  const nextException = ex.find((d) => d > deliveryDateYmd) ?? null;
  let nextCycleDate: string | null = null;
  if (cycle.length > 0) {
    const dow = start.getDay();
    let delta = 7;
    for (const w of cycle) {
      const cand = w > dow ? w - dow : 7 - dow + w;
      if (cand > 0 && cand < delta) delta = cand;
    }
    const d = new Date(start);
    d.setDate(d.getDate() + delta);
    nextCycleDate = [
      String(d.getFullYear()).padStart(4, '0'),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
  }
  if (nextCycleDate && nextException) return nextCycleDate <= nextException ? nextCycleDate : nextException;
  return nextCycleDate ?? nextException;
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

export function isDeliveryDateOnConfiguredCycle(
  deliveryDateYmd: string,
  cycleWeekdays: number[],
  exceptionDates: string[] = [],
): boolean {
  const ex = normalizeDeliveryExceptionDates(exceptionDates);
  if (ex.includes(deliveryDateYmd)) return true;
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
