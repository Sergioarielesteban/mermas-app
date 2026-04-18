export function toYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Semana de lunes a domingo que contiene la fecha indicada (YYYY-MM-DD). */
export function weekBoundsFromYmd(refYmd: string): { start: string; end: string } {
  const [y, m, d] = refYmd.split('-').map(Number);
  const ref = new Date(y!, m! - 1, d!);
  const day = ref.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toYmdLocal(monday), end: toYmdLocal(sunday) };
}

/** Primer y último día del mes (`yyyy-mm` desde input month). */
export function monthBoundsFromMonthInput(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(y!, m! - 1, 1);
  const end = new Date(y!, m!, 0);
  return { start: toYmdLocal(start), end: toYmdLocal(end) };
}

export function parseOptionalMoney(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function parseOptionalInt(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function addDaysToYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + deltaDays);
  return toYmdLocal(dt);
}
