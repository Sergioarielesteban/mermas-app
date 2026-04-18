import type { ClockSessionState, StaffShift, StaffTimeEntry, StaffTimeEventType } from '@/lib/staff/types';
import { minutesBetween, shiftDateTimeIso, ymdLocal } from '@/lib/staff/staff-dates';

export function sortEntriesByTime(entries: StaffTimeEntry[]): StaffTimeEntry[] {
  return [...entries].sort((a, b) => {
    const t = Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });
}

function lastClockIn(sorted: StaffTimeEntry[]): string | null {
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].eventType === 'clock_in') return sorted[i].occurredAt;
  }
  return null;
}

/** Estado de fichaje: acciones válidas según último evento (alineado con RPC). */
export function getClockSessionState(sortedEntries: StaffTimeEntry[]): ClockSessionState {
  const last = sortedEntries.length ? sortedEntries[sortedEntries.length - 1] : null;
  if (!last) {
    return { availableActions: ['clock_in'], lastEventType: null, openSince: null };
  }
  const t = last.eventType;
  if (t === 'clock_out') {
    return { availableActions: ['clock_in'], lastEventType: t, openSince: null };
  }
  if (t === 'clock_in') {
    return {
      availableActions: ['break_start', 'clock_out'],
      lastEventType: t,
      openSince: last.occurredAt,
    };
  }
  if (t === 'break_start') {
    return {
      availableActions: ['break_end'],
      lastEventType: t,
      openSince: lastClockIn(sortedEntries),
    };
  }
  if (t === 'break_end') {
    return {
      availableActions: ['break_start', 'clock_out'],
      lastEventType: t,
      openSince: lastClockIn(sortedEntries),
    };
  }
  return { availableActions: ['clock_in'], lastEventType: t, openSince: null };
}

/** Minutos trabajados en el día (entrada→salida menos pausas por pares break_start/break_end). */
export function workedMinutesForDay(entries: StaffTimeEntry[]): number {
  const sorted = sortEntriesByTime(entries);
  let total = 0;
  let openIn: string | null = null;
  let breakOpen: string | null = null;
  let breakSum = 0;
  for (const e of sorted) {
    if (e.eventType === 'clock_in') {
      openIn = e.occurredAt;
      breakOpen = null;
      breakSum = 0;
    } else if (e.eventType === 'break_start' && openIn) {
      breakOpen = e.occurredAt;
    } else if (e.eventType === 'break_end' && breakOpen) {
      breakSum += minutesBetween(breakOpen, e.occurredAt);
      breakOpen = null;
    } else if (e.eventType === 'clock_out' && openIn) {
      total += minutesBetween(openIn, e.occurredAt) - breakSum;
      openIn = null;
      breakOpen = null;
      breakSum = 0;
    }
  }
  if (openIn) {
    const now = new Date().toISOString();
    let b = breakSum;
    if (breakOpen) b += minutesBetween(breakOpen, now);
    total += minutesBetween(openIn, now) - b;
  }
  return Math.max(0, total);
}

/** Minutos totales en pausa (pares break_start → break_end) en el día. */
export function breakMinutesForDay(entries: StaffTimeEntry[]): number {
  const sorted = sortEntriesByTime(entries);
  let sum = 0;
  let open: string | null = null;
  for (const e of sorted) {
    if (e.eventType === 'break_start') {
      open = e.occurredAt;
    } else if (e.eventType === 'break_end' && open) {
      sum += minutesBetween(open, e.occurredAt);
      open = null;
    }
  }
  return Math.max(0, sum);
}

export function formatMinutesHuman(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h <= 0) return `${mm} min`;
  return `${h} h ${mm.toString().padStart(2, '0')} min`;
}

/** Duración planificada del turno en minutos (aprox.: cruza medianoche si ends_next_day). */
export function plannedShiftMinutes(s: StaffShift): number {
  const start = shiftDateTimeIso(s.shiftDate, s.startTime);
  let end = shiftDateTimeIso(s.shiftDate, s.endTime);
  if (s.endsNextDay || end <= start) {
    end += 24 * 60 * 60 * 1000;
  }
  let mins = Math.round((end - start) / 60000) - (s.breakMinutes ?? 0);
  return Math.max(0, mins);
}

export function findShiftForToday(shifts: StaffShift[], employeeId: string, todayYmd: string): StaffShift | null {
  const list = shifts.filter((x) => x.employeeId === employeeId && x.shiftDate === todayYmd);
  if (!list.length) return null;
  return [...list].sort((a, b) => shiftDateTimeIso(a.shiftDate, a.startTime) - shiftDateTimeIso(b.shiftDate, b.startTime))[0];
}

export function todayYmd(): string {
  return ymdLocal(new Date());
}
