import type { StaffShift } from '@/lib/staff/types';

/**
 * Ventana operativa del local (cuadrante / referencia horaria).
 * Nombres canónicos (API / UI): equivalen en BD a start_operating_time, end_operating_time,
 * allow_next_day_end, max_extended_end_time cuando existan; si no, a operational_* legacy.
 */
export type LocalOperationalWindow = {
  /** start_operating_time — inicio del servicio (día del turno). HH:MM */
  operationalStart: string;
  /** end_operating_time — fin operativo (según allowNextDayEnd). HH:MM */
  operationalEnd: string;
  /** allow_next_day_end — si true, operationalEnd es del día siguiente. */
  operationalEndNextDay: boolean;
  /** max_extended_end_time — hora del día siguiente hasta la que se alarga la escala; null = sin extender. */
  operationalExtendUntil: string | null;
};

/**
 * FUTURE: eje vertical de horas a la izquierda o vista calendario continua.
 * Mantener `OperationalTimelineMetrics` + `segmentShiftOnOperationalTimeline` como base.
 */
export type FutureOperationalTimelineAxis = {
  mode: 'none';
};

export const DEFAULT_LOCAL_OPERATIONAL_WINDOW: LocalOperationalWindow = {
  operationalStart: '07:30',
  operationalEnd: '00:00',
  operationalEndNextDay: true,
  operationalExtendUntil: '02:00',
};

export type OperationalTimelineMetrics = {
  startMin: number;
  serviceEndMin: number;
  displayEndMin: number;
  rangeMin: number;
};

export function normalizeTimeToHHMM(t: string): string {
  const raw = t.trim();
  const parts = raw.split(':');
  const h = Math.min(23, Math.max(0, Number(parts[0] ?? 0)));
  const m = Math.min(59, Math.max(0, Number(parts[1] ?? 0)));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseToMinutesFromShiftMidnight(hhmm: string): number {
  const n = normalizeTimeToHHMM(hhmm);
  const [h, m] = n.split(':').map((x) => Number(x));
  return h * 60 + m;
}

export function computeOperationalTimelineMetrics(w: LocalOperationalWindow): OperationalTimelineMetrics {
  const s = parseToMinutesFromShiftMidnight(w.operationalStart);
  const endClock = parseToMinutesFromShiftMidnight(w.operationalEnd);
  let serviceEnd: number;
  if (w.operationalEndNextDay) {
    serviceEnd = 24 * 60 + endClock;
  } else {
    serviceEnd = endClock;
    if (serviceEnd <= s) serviceEnd += 24 * 60;
  }
  let displayEnd = serviceEnd;
  if (w.operationalExtendUntil != null && w.operationalExtendUntil.trim() !== '') {
    const ext = 24 * 60 + parseToMinutesFromShiftMidnight(w.operationalExtendUntil);
    displayEnd = Math.max(displayEnd, ext);
  }
  const range = Math.max(displayEnd - s, 60);
  return { startMin: s, serviceEndMin: serviceEnd, displayEndMin: displayEnd, rangeMin: range };
}

export function operationalWindowSummaryHeading(w: LocalOperationalWindow): string {
  const a = normalizeTimeToHHMM(w.operationalStart);
  const b = normalizeTimeToHHMM(w.operationalEnd);
  const tag = w.operationalEndNextDay ? ' (+1)' : '';
  let line = `${a} → ${b}${tag}`;
  if (w.operationalExtendUntil != null && w.operationalExtendUntil.trim() !== '') {
    line += ` · ${normalizeTimeToHHMM(w.operationalExtendUntil)} (+1)`;
  }
  return line;
}

/** Una sola línea para cabecera del cuadrante. */
export function operationalFranjaOperativaBanner(w: LocalOperationalWindow, m: OperationalTimelineMetrics): string {
  const a = normalizeTimeToHHMM(w.operationalStart);
  const b = normalizeTimeToHHMM(w.operationalEnd);
  const tag = w.operationalEndNextDay ? ' (+1)' : '';
  let s = `Franja operativa: ${a} → ${b}${tag}`;
  if (
    w.operationalExtendUntil != null &&
    w.operationalExtendUntil.trim() !== '' &&
    m.displayEndMin > m.serviceEndMin + 1
  ) {
    s += ` (hasta ${normalizeTimeToHHMM(w.operationalExtendUntil)} +1)`;
  }
  return s;
}

function shiftClockToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map((x) => Number(x));
  return (h ?? 0) * 60 + (m ?? 0);
}

export function segmentShiftOnOperationalTimeline(
  s: StaffShift,
  columnYmd: string,
  m: OperationalTimelineMetrics,
): { leftPct: number; widthPct: number } | null {
  if (s.shiftDate !== columnYmd) return null;
  const start = shiftClockToMinutes(s.startTime);
  let end = shiftClockToMinutes(s.endTime);
  if (s.endsNextDay) end += 24 * 60;
  else if (end <= start) end += 24 * 60;
  const clipStart = Math.max(start, m.startMin);
  const clipEnd = Math.min(end, m.displayEndMin);
  if (clipEnd <= clipStart) return null;
  const leftPct = ((clipStart - m.startMin) / m.rangeMin) * 100;
  const widthPct = ((clipEnd - clipStart) / m.rangeMin) * 100;
  return { leftPct, widthPct: Math.max(widthPct, 0.65) };
}

export function tickPositionPct(minuteFromShiftMidnight: number, m: OperationalTimelineMetrics): number {
  return ((minuteFromShiftMidnight - m.startMin) / m.rangeMin) * 100;
}

/** Marcas cada ~4 h dentro de la ventana (para líneas verticales). */
export function buildOperationalTimelineTicks(startMin: number, displayEndMin: number, maxTicks = 5): number[] {
  const step = 4 * 60;
  const out: number[] = [];
  let t = Math.ceil((startMin + 1) / step) * step;
  if (t <= startMin) t += step;
  while (t < displayEndMin && out.length < maxTicks) {
    out.push(t);
    t += step;
  }
  return out;
}

export type LocalsOperationalRow = {
  start_operating_time?: string | null;
  end_operating_time?: string | null;
  allow_next_day_end?: boolean | null;
  max_extended_end_time?: string | null;
  operational_start?: string | null;
  operational_end?: string | null;
  operational_end_next_day?: boolean | null;
  operational_extend_until?: string | null;
};

export function operationalWindowFromLocalsRow(row: LocalsOperationalRow | null | undefined): LocalOperationalWindow {
  if (!row) return { ...DEFAULT_LOCAL_OPERATIONAL_WINDOW };
  const startRaw = row.start_operating_time ?? row.operational_start;
  const endRaw = row.end_operating_time ?? row.operational_end;
  const endNextRaw = row.allow_next_day_end ?? row.operational_end_next_day;
  const extRaw = row.max_extended_end_time ?? row.operational_extend_until;

  const start =
    startRaw != null && String(startRaw).length > 0
      ? normalizeTimeToHHMM(String(startRaw))
      : DEFAULT_LOCAL_OPERATIONAL_WINDOW.operationalStart;
  const end =
    endRaw != null && String(endRaw).length > 0
      ? normalizeTimeToHHMM(String(endRaw))
      : DEFAULT_LOCAL_OPERATIONAL_WINDOW.operationalEnd;
  const endNext =
    endNextRaw != null ? Boolean(endNextRaw) : DEFAULT_LOCAL_OPERATIONAL_WINDOW.operationalEndNextDay;
  let ext: string | null = null;
  if (extRaw != null && String(extRaw).trim().length > 0) {
    ext = normalizeTimeToHHMM(String(extRaw));
  }
  return {
    operationalStart: start,
    operationalEnd: end,
    operationalEndNextDay: endNext,
    operationalExtendUntil: ext,
  };
}
