/** YYYY-MM-DD en calendario local */
export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Lunes como inicio de semana ISO */
export function startOfWeekMonday(d: Date): Date {
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = base.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  base.setDate(base.getDate() + delta);
  return base;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

export function parseYmd(s: string): Date {
  const [y, m, day] = s.split('-').map((x) => Number(x));
  return new Date(y, (m ?? 1) - 1, day ?? 1);
}

export function formatWeekdayShort(d: Date): string {
  return d.toLocaleDateString('es', { weekday: 'short' });
}

export function formatDayMonth(d: Date): string {
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

export function minutesBetween(isoA: string, isoB: string): number {
  return Math.round((Date.parse(isoB) - Date.parse(isoA)) / 60000);
}

/** Combina fecha YYYY-MM-DD + HH:MM:SS time string (local) a ISO-ish for sorting */
export function shiftDateTimeIso(shiftDate: string, timeHHMM: string): number {
  const [h, m, s] = timeHHMM.split(':').map((x) => Number(x));
  const d = parseYmd(shiftDate);
  d.setHours(h ?? 0, m ?? 0, s ?? 0, 0);
  return d.getTime();
}
