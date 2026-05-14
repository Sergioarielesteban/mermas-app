export const DEFAULT_OPERATIONAL_CUTOFF_TIME = '05:00';
export const MERMAS_OPERATIONAL_CUTOFF_TIME_KEY = 'chef_one_mermas_operational_cutoff_time';

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function normalizeCutoffTime(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return DEFAULT_OPERATIONAL_CUTOFF_TIME;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return DEFAULT_OPERATIONAL_CUTOFF_TIME;
  }
  return `${pad2(hour)}:${pad2(minute)}`;
}

export function readOperationalCutoffTime(): string {
  if (typeof window === 'undefined') return DEFAULT_OPERATIONAL_CUTOFF_TIME;
  try {
    return normalizeCutoffTime(window.localStorage.getItem(MERMAS_OPERATIONAL_CUTOFF_TIME_KEY));
  } catch {
    return DEFAULT_OPERATIONAL_CUTOFF_TIME;
  }
}

export function writeOperationalCutoffTime(value: string): string {
  const next = normalizeCutoffTime(value);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(MERMAS_OPERATIONAL_CUTOFF_TIME_KEY, next);
      window.dispatchEvent(new CustomEvent('chef-one:mermas-operational-cutoff-change', { detail: { cutoffTime: next } }));
    } catch {
      /* localStorage no disponible */
    }
  }
  return next;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function shiftToPreviousDay(date: Date) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() - 1);
  return shifted;
}

export function getOperationalDate(date: Date, cutoffTime: string): string {
  const cutoff = normalizeCutoffTime(cutoffTime);
  const [hourRaw = '0', minuteRaw = '0'] = cutoff.split(':');
  const cutoffMinutes = Number(hourRaw) * 60 + Number(minuteRaw);
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const base = currentMinutes < cutoffMinutes ? shiftToPreviousDay(date) : date;
  return localDateKey(base);
}

export function toBusinessDate(dateLike: string | Date, cutoffTime = readOperationalCutoffTime()) {
  const date = typeof dateLike === 'string' ? new Date(dateLike) : new Date(dateLike);
  const [y = 0, m = 1, d = 1] = getOperationalDate(date, cutoffTime).split('-').map(Number);
  const base = new Date(y, m - 1, d);
  return startOfDay(base);
}

export function toBusinessDateKey(dateLike: string | Date, cutoffTime = readOperationalCutoffTime()) {
  const date = typeof dateLike === 'string' ? new Date(dateLike) : new Date(dateLike);
  return getOperationalDate(date, cutoffTime);
}
