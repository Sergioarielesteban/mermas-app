import type { StaffShift } from '@/lib/staff/types';
import { shiftDateTimeIso } from '@/lib/staff/staff-dates';

/** Ventana de cuadrante visible (regla 08:00 → 24:00). */
export const TIMELINE_DAY_START_MIN = 8 * 60;
export const TIMELINE_DAY_END_MIN = 24 * 60;
export const TIMELINE_SPAN_MIN = TIMELINE_DAY_END_MIN - TIMELINE_DAY_START_MIN;

function timeToMinutesFromMidnight(hhmmss: string): number {
  const [h, m] = hhmmss.split(':').map((x) => Number(x));
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Duración bruta entrada→salida (sin restar descanso), en minutos. */
export function grossShiftMinutes(s: StaffShift): number {
  const start = shiftDateTimeIso(s.shiftDate, s.startTime);
  let end = shiftDateTimeIso(s.shiftDate, s.endTime);
  if (s.endsNextDay || end <= start) {
    end += 24 * 60 * 60 * 1000;
  }
  return Math.max(0, Math.round((end - start) / 60000));
}

/** Inicio/fin del turno en minutos desde medianoche del día del turno (fin puede pasar de 1440). */
export function shiftGrossBoundsMinutes(s: StaffShift): { start: number; end: number } {
  const start = timeToMinutesFromMidnight(s.startTime);
  let end = timeToMinutesFromMidnight(s.endTime);
  if (s.endsNextDay || end <= start) {
    end += 24 * 60;
  }
  return { start, end };
}

export type TimelineLayout = {
  leftPct: number;
  widthPct: number;
};

/** Posición del bloque completo (bruto) sobre la regla 08:00–24:00. */
export function layoutGrossOnTimeline(s: StaffShift): TimelineLayout {
  const { start, end } = shiftGrossBoundsMinutes(s);
  const visStart = Math.max(start, TIMELINE_DAY_START_MIN);
  const visEnd = Math.min(end, TIMELINE_DAY_END_MIN);
  if (visEnd <= visStart) {
    return { leftPct: 0, widthPct: 0 };
  }
  const leftPct = ((visStart - TIMELINE_DAY_START_MIN) / TIMELINE_SPAN_MIN) * 100;
  const widthPct = ((visEnd - visStart) / TIMELINE_SPAN_MIN) * 100;
  return {
    leftPct: Math.max(0, Math.min(100, leftPct)),
    widthPct: Math.max(0, Math.min(100 - leftPct, widthPct)),
  };
}

/** Fracción [0,1] del ancho del bloque ocupada por descanso (visual centrado). */
export function breakFractionInBar(s: StaffShift): number {
  const gross = grossShiftMinutes(s);
  if (gross <= 0) return 0;
  const br = Math.max(0, s.breakMinutes ?? 0);
  return Math.min(1, br / gross);
}

export type LaneShift = {
  shift: StaffShift;
  lane: number;
};

/** Asigna carriles para turnos solapados en el mismo día/empleado. */
export function assignShiftLanes(sortedShifts: StaffShift[]): LaneShift[] {
  const sorted = [...sortedShifts].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const laneEnds: number[] = [];
  const out: LaneShift[] = [];
  for (const s of sorted) {
    const { start, end } = shiftGrossBoundsMinutes(s);
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane]! > start) {
      lane += 1;
    }
    if (lane === laneEnds.length) {
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    out.push({ shift: s, lane });
  }
  return out;
}

export const RULER_HOUR_TICKS = [8, 10, 12, 14, 16, 18, 20, 22, 24] as const;
