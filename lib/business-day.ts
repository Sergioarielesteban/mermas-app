export const BUSINESS_DAY_START_HOUR = 7;
export const BUSINESS_DAY_START_MINUTE = 30;

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function shiftToPreviousDay(date: Date) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() - 1);
  return shifted;
}

export function toBusinessDate(dateLike: string | Date) {
  const date = typeof dateLike === 'string' ? new Date(dateLike) : new Date(dateLike);
  const hour = date.getHours();
  const minute = date.getMinutes();
  const isBeforeBusinessStart =
    hour < BUSINESS_DAY_START_HOUR ||
    (hour === BUSINESS_DAY_START_HOUR && minute < BUSINESS_DAY_START_MINUTE);

  const base = isBeforeBusinessStart ? shiftToPreviousDay(date) : date;
  return startOfDay(base);
}

export function toBusinessDateKey(dateLike: string | Date) {
  const d = toBusinessDate(dateLike);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
