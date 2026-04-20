import type { StaffShift } from '@/lib/staff/types';

/** Ventana operativa del local (cuadrante / referencia horaria). */
export type LocalOperationalWindow = {
  /** Hora de inicio del servicio (mismo día calendario que la fecha del turno). HH:MM */
  operationalStart: string;
  /** Hora de fin operativo (interpretación según operationalEndNextDay). HH:MM */
  operationalEnd: string;
  /** Si es true, operationalEnd es del día siguiente al de la fecha del turno (medianoche, cierre tardío, etc.). */
  operationalEndNextDay: boolean;
  /**
   * Opcional: hasta qué hora del día siguiente se muestra la escala (p. ej. 02:00 para planificar cierres).
   * Si es null, la escala llega hasta el fin operativo (sin extender).
   */
  operationalExtendUntil: string | null;
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

export function operationalWindowFooterLegend(w: LocalOperationalWindow, m: OperationalTimelineMetrics): string {
  const parts: string[] = [normalizeTimeToHHMM(w.operationalStart)];
  parts.push(`${normalizeTimeToHHMM(w.operationalEnd)}${w.operationalEndNextDay ? ' (+1)' : ''}`);
  if (
    w.operationalExtendUntil != null &&
    w.operationalExtendUntil.trim() !== '' &&
    m.displayEndMin > m.serviceEndMin + 1
  ) {
    parts.push(`${normalizeTimeToHHMM(w.operationalExtendUntil)} (+1)`);
  }
  return parts.join(' · ');
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
  operational_start?: string | null;
  operational_end?: string | null;
  operational_end_next_day?: boolean | null;
  operational_extend_until?: string | null;
};

export function operationalWindowFromLocalsRow(row: LocalsOperationalRow | null | undefined): LocalOperationalWindow {
  if (!row) return { ...DEFAULT_LOCAL_OPERATIONAL_WINDOW };
  const start = row.operational_start != null && String(row.operational_start).length > 0
    ? normalizeTimeToHHMM(String(row.operational_start))
    : DEFAULT_LOCAL_OPERATIONAL_WINDOW.operationalStart;
  const end = row.operational_end != null && String(row.operational_end).length > 0
    ? normalizeTimeToHHMM(String(row.operational_end))
    : DEFAULT_LOCAL_OPERATIONAL_WINDOW.operationalEnd;
  const endNext =
    row.operational_end_next_day != null
      ? Boolean(row.operational_end_next_day)
      : DEFAULT_LOCAL_OPERATIONAL_WINDOW.operationalEndNextDay;
  let ext: string | null = null;
  if (row.operational_extend_until != null && String(row.operational_extend_until).trim().length > 0) {
    ext = normalizeTimeToHHMM(String(row.operational_extend_until));
  }
  return {
    operationalStart: start,
    operationalEnd: end,
    operationalEndNextDay: endNext,
    operationalExtendUntil: ext,
  };
}
