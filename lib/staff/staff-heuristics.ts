import {
  findShiftForToday,
  getClockSessionState,
  plannedShiftMinutes,
  sortEntriesByTime,
  workedMinutesForDay,
} from '@/lib/staff/attendance-logic';
import { shiftDateTimeIso, ymdLocal } from '@/lib/staff/staff-dates';
import type { StaffEmployee, StaffIncident, StaffShift, StaffTimeEntry } from '@/lib/staff/types';

export function filterEntriesForLocalDay(entries: StaffTimeEntry[], ymd: string): StaffTimeEntry[] {
  return entries.filter((e) => ymdLocal(new Date(e.occurredAt)) === ymd);
}

export function entriesByEmployee(entries: StaffTimeEntry[], employeeId: string, ymd: string): StaffTimeEntry[] {
  return sortEntriesByTime(filterEntriesForLocalDay(entries, ymd).filter((e) => e.employeeId === employeeId));
}

/** Empleados con jornada abierta (incl. en pausa). */
export function employeeIdsWorkingNow(entries: StaffTimeEntry[], ymd: string): Set<string> {
  const out = new Set<string>();
  const byEmp = new Map<string, StaffTimeEntry[]>();
  for (const e of filterEntriesForLocalDay(entries, ymd)) {
    const list = byEmp.get(e.employeeId) ?? [];
    list.push(e);
    byEmp.set(e.employeeId, list);
  }
  for (const [id, list] of byEmp) {
    const st = getClockSessionState(sortEntriesByTime(list));
    if (st.lastEventType != null && st.lastEventType !== 'clock_out') out.add(id);
  }
  return out;
}

export function plannedMinutesToday(shifts: StaffShift[], ymd: string): number {
  return shifts.filter((s) => s.shiftDate === ymd).reduce((acc, s) => acc + plannedShiftMinutes(s), 0);
}

export function workedMinutesTodayAll(entries: StaffTimeEntry[], employees: StaffEmployee[], ymd: string): number {
  let t = 0;
  for (const e of employees) {
    t += workedMinutesForDay(entriesByEmployee(entries, e.id, ymd));
  }
  return t;
}

export type DayHint =
  | 'late'
  | 'no_clock_in'
  | 'incomplete'
  | 'early_out'
  | 'ok'
  | 'none';

const GRACE_MIN = 7;

export function hintForEmployeeDay(
  shifts: StaffShift[],
  entries: StaffTimeEntry[],
  employeeId: string,
  ymd: string,
): { hint: DayHint; planned: StaffShift | null; workedMin: number } {
  const planned = findShiftForToday(shifts, employeeId, ymd);
  const dayEntries = entriesByEmployee(entries, employeeId, ymd);
  const workedMin = workedMinutesForDay(dayEntries);
  if (!planned) {
    return { hint: 'none', planned: null, workedMin };
  }
  const st = getClockSessionState(dayEntries);
  const plannedStart = shiftDateTimeIso(planned.shiftDate, planned.startTime);
  const firstIn = dayEntries.find((e) => e.eventType === 'clock_in');
  if (!firstIn && Date.now() > plannedStart + GRACE_MIN * 60 * 1000) {
    return { hint: 'no_clock_in', planned, workedMin };
  }
  if (firstIn && Date.parse(firstIn.occurredAt) > plannedStart + GRACE_MIN * 60 * 1000) {
    return { hint: 'late', planned, workedMin };
  }
  if (st.lastEventType && st.lastEventType !== 'clock_out') {
    const plannedEnd = (() => {
      let end = shiftDateTimeIso(planned.shiftDate, planned.endTime);
      if (planned.endsNextDay || end <= plannedStart) end += 24 * 60 * 60 * 1000;
      return end;
    })();
    if (Date.now() > plannedEnd + GRACE_MIN * 60 * 1000) {
      return { hint: 'incomplete', planned, workedMin };
    }
  }
  if (st.lastEventType === 'clock_out' && planned) {
    const plannedM = plannedShiftMinutes(planned);
    if (workedMin > plannedM + 25) return { hint: 'ok', planned, workedMin }; // extra time - still ok
    const plannedEnd = (() => {
      let end = shiftDateTimeIso(planned.shiftDate, planned.endTime);
      const pStart = shiftDateTimeIso(planned.shiftDate, planned.startTime);
      if (planned.endsNextDay || end <= pStart) end += 24 * 60 * 60 * 1000;
      return end;
    })();
    const lastOut = [...dayEntries].reverse().find((e) => e.eventType === 'clock_out');
    if (lastOut && Date.parse(lastOut.occurredAt) < plannedEnd - GRACE_MIN * 60 * 1000) {
      return { hint: 'early_out', planned, workedMin };
    }
  }
  return { hint: 'ok', planned, workedMin };
}

export function openIncidentsCount(incidents: StaffIncident[]): number {
  return incidents.filter((i) => i.status === 'open').length;
}
