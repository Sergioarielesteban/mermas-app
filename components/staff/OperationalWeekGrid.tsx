'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Copy, GripVertical, Plus, Trash2 } from 'lucide-react';
import { plannedShiftMinutes } from '@/lib/staff/attendance-logic';
import { addDays, formatDayMonth, formatWeekdayShort, ymdLocal } from '@/lib/staff/staff-dates';
import { zoneBlockStyle, zoneDefaultColorHint, zoneLabel } from '@/lib/staff/staff-zone-styles';
import { QUICK_SHIFT_PRESETS, type QuickShiftPreset } from '@/lib/staff/shift-quick-presets';
import {
  buildOperationalTimelineTicks,
  computeOperationalTimelineMetrics,
  operationalWindowFooterLegend,
  operationalWindowSummaryHeading,
  segmentShiftOnOperationalTimeline,
  tickPositionPct,
  type LocalOperationalWindow,
} from '@/lib/staff/local-operational-window';
import { STAFF_ZONE_PRESETS, type StaffEmployee, type StaffShift } from '@/lib/staff/types';
import { staffDisplayName } from '@/lib/staff/staff-supabase';

export const OPERATIONAL_NONE_ZONE = '__none__' as const;

const MAIN_ZONES = ['cocina', 'barra', 'sala'] as const;

const LONG_PRESS_MS_EMPTY = 820;
const LONG_PRESS_MS_SHIFT = 820;
const DOUBLE_TAP_MS = 500;

function shortTime(t: string) {
  const [h, m] = t.split(':');
  return `${h}:${m ?? '00'}`;
}

function toPgTime(hhmm: string) {
  const p = hhmm.split(':');
  return `${p[0] ?? '09'}:${p[1] ?? '00'}:00`;
}

function formatShiftHoursLabel(mins: number): string {
  if (mins <= 0) return '0 h';
  const h = mins / 60;
  if (Math.abs(h - Math.round(h)) < 0.05) return `${Math.round(h)} h`;
  return `${h.toFixed(1).replace('.', ',')} h`;
}

function formatHoursSum(mins: number): string {
  const h = mins / 60;
  if (h < 10) return `${h.toFixed(1).replace('.', ',')} h`;
  return `${Math.round(h)} h`;
}

function shiftZoneKey(s: StaffShift): string {
  const z = (s.zone ?? '').trim().toLowerCase();
  return z || OPERATIONAL_NONE_ZONE;
}

function buildZoneRows(shifts: StaffShift[]): { key: string; label: string }[] {
  const first = ['cocina', 'barra', 'sala'] as const;
  const seen = new Set<string>();
  const rows: { key: string; label: string }[] = [];
  for (const k of first) {
    rows.push({ key: k, label: zoneLabel(k) });
    seen.add(k);
  }
  for (const p of STAFF_ZONE_PRESETS) {
    if (!seen.has(p.value)) {
      rows.push({ key: p.value, label: p.label });
      seen.add(p.value);
    }
  }
  for (const s of shifts) {
    const z = (s.zone ?? '').trim().toLowerCase();
    if (z && !seen.has(z)) {
      rows.push({ key: z, label: zoneLabel(z) || z });
      seen.add(z);
    }
  }
  rows.push({ key: OPERATIONAL_NONE_ZONE, label: 'Sin puesto' });
  return rows;
}

function presetMatchesShift(s: StaffShift, p: QuickShiftPreset): boolean {
  return (
    shortTime(s.startTime) === p.startTime &&
    shortTime(s.endTime) === p.endTime &&
    Boolean(s.endsNextDay) === p.endsNextDay &&
    Number(s.breakMinutes) === p.breakMinutes
  );
}

function guessPresetId(s: StaffShift): string {
  const hit = QUICK_SHIFT_PRESETS.find((p) => presetMatchesShift(s, p));
  return hit?.id ?? '';
}

function nudgeEndTime(s: StaffShift, deltaMin: number): { endTime: string; endsNextDay: boolean } | null {
  if (s.endsNextDay) return null;
  const [h, m] = s.endTime.split(':').map((x) => Number(x));
  let mins = (h ?? 0) * 60 + (m ?? 0) + deltaMin;
  if (mins < 0 || mins > 24 * 60) return null;
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return { endTime: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`, endsNextDay: false };
}

type Coverage = 'ok' | 'warn' | 'bad';

function dayCoverage(ymd: string, shifts: StaffShift[]): Coverage {
  const day = shifts.filter((s) => s.shiftDate === ymd);
  let bad = false;
  let warn = false;
  for (const z of MAIN_ZONES) {
    const inZone = day.filter((s) => shiftZoneKey(s) === z);
    if (inZone.length === 0) {
      bad = true;
      continue;
    }
    const assigned = inZone.filter((s) => s.employeeId);
    if (assigned.length === 0) warn = true;
  }
  if (bad) return 'bad';
  if (warn) return 'warn';
  return 'ok';
}

function headerTone(c: Coverage): string {
  if (c === 'ok') return 'bg-emerald-100/95 text-emerald-950 ring-1 ring-emerald-200/80';
  if (c === 'warn') return 'bg-amber-100/95 text-amber-950 ring-1 ring-amber-200/80';
  return 'bg-red-100/95 text-red-950 ring-1 ring-red-200/80';
}

function OperationalDayTimeline({
  ymd,
  dayShifts,
  metrics,
  operationalWindow,
  timelineTicks,
}: {
  ymd: string;
  dayShifts: StaffShift[];
  metrics: ReturnType<typeof computeOperationalTimelineMetrics>;
  operationalWindow: LocalOperationalWindow;
  timelineTicks: number[];
}) {
  const showMidnight =
    metrics.startMin < 24 * 60 && metrics.displayEndMin > 24 * 60;
  const midnightLeftPct = Math.max(0, Math.min(100, tickPositionPct(24 * 60, metrics)));
  const dayBandEndMin = Math.min(24 * 60, metrics.displayEndMin);
  const dayBandWidthPct = Math.max(
    0,
    Math.min(100, ((dayBandEndMin - metrics.startMin) / metrics.rangeMin) * 100),
  );
  const afterMidnightWidthPct = showMidnight ? Math.max(0, 100 - midnightLeftPct) : 0;

  return (
    <div className="px-0.5 pb-1 pt-0.5">
      <div className="relative mx-auto h-6 w-full max-w-[5.5rem] overflow-visible rounded-md bg-zinc-200/50 ring-1 ring-zinc-300/60 sm:max-w-none">
        <div
          className="pointer-events-none absolute inset-y-0 rounded-md bg-gradient-to-r from-sky-500/20 via-emerald-400/15 to-violet-500/25"
          style={{
            left: 0,
            width: `${dayBandWidthPct}%`,
          }}
        />
        {showMidnight ? (
          <div
            className="pointer-events-none absolute inset-y-0 rounded-r-md bg-violet-400/20"
            style={{
              left: `${midnightLeftPct}%`,
              width: `${afterMidnightWidthPct}%`,
            }}
          />
        ) : null}
        {timelineTicks.map((tm) => {
          const left = tickPositionPct(tm, metrics);
          if (left < 0 || left > 100) return null;
          return (
            <div
              key={tm}
              className="pointer-events-none absolute bottom-0 top-0 w-px bg-zinc-500/35"
              style={{ left: `${left}%` }}
            />
          );
        })}
        {showMidnight ? (
          <div
            className="pointer-events-none absolute bottom-0 top-0 w-px bg-zinc-700/45"
            style={{ left: `${midnightLeftPct}%` }}
          />
        ) : null}
        {dayShifts.map((s) => {
          const seg = segmentShiftOnOperationalTimeline(s, ymd, metrics);
          if (!seg) return null;
          return (
            <div
              key={s.id}
              className="pointer-events-none absolute bottom-0.5 h-1 rounded-sm bg-[#D32F2F]/70 ring-1 ring-black/10"
              style={{ left: `${seg.leftPct}%`, width: `${seg.widthPct}%` }}
              title={`${shortTime(s.startTime)}–${shortTime(s.endTime)}${s.endsNextDay ? ' (+1)' : ''}`}
            />
          );
        })}
      </div>
      <div className="mt-0.5 text-center text-[6px] font-bold leading-snug text-zinc-500 sm:text-[7px]">
        {operationalWindowFooterLegend(operationalWindow, metrics)}
      </div>
    </div>
  );
}

export type OperationalWeekGridProps = {
  weekStartMonday: Date;
  employees: StaffEmployee[];
  shifts: StaffShift[];
  /** Ventana operativa del local (columnas en `public.locals`). */
  operationalWindow: LocalOperationalWindow;
  canEdit: boolean;
  onShiftPlaced: (shift: StaffShift, newDateYmd: string, zoneRowKey: string) => Promise<void>;
  onQuickCreateShift: (dateYmd: string, zoneRowKey: string) => Promise<void>;
  onEmptyLongPress: (dateYmd: string, zoneRowKey: string) => void;
  onShiftAdvancedEdit: (shift: StaffShift) => void;
  onShiftPatch: (
    shift: StaffShift,
    patch: Partial<
      Pick<StaffShift, 'employeeId' | 'startTime' | 'endTime' | 'endsNextDay' | 'breakMinutes' | 'zone' | 'colorHint'>
    >,
  ) => Promise<void>;
  onShiftDelete: (shift: StaffShift) => Promise<void>;
  onShiftDuplicateHere: (shift: StaffShift) => Promise<void>;
  onShiftCopyPrevCalendarDay: (shift: StaffShift) => Promise<void>;
  onShiftCopyPrevWeekday: (shift: StaffShift) => Promise<void>;
};

export default function OperationalWeekGrid({
  weekStartMonday,
  employees,
  shifts,
  operationalWindow,
  canEdit,
  onShiftPlaced,
  onQuickCreateShift,
  onEmptyLongPress,
  onShiftAdvancedEdit,
  onShiftPatch,
  onShiftDelete,
  onShiftDuplicateHere,
  onShiftCopyPrevCalendarDay,
  onShiftCopyPrevWeekday,
}: OperationalWeekGridProps) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStartMonday, i)), [weekStartMonday]);
  const zoneRows = useMemo(() => buildZoneRows(shifts), [shifts]);
  const operationalMetrics = useMemo(
    () => computeOperationalTimelineMetrics(operationalWindow),
    [operationalWindow],
  );
  const timelineTicks = useMemo(
    () => buildOperationalTimelineTicks(operationalMetrics.startMin, operationalMetrics.displayEndMin),
    [operationalMetrics.startMin, operationalMetrics.displayEndMin],
  );
  const operationalHeading = useMemo(
    () => operationalWindowSummaryHeading(operationalWindow),
    [operationalWindow],
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ ymd: string; zoneKey: string } | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);

  const ignoreClicksUntilRef = useRef(0);
  const emptyLongPressTimerRef = useRef<number | null>(null);
  const shiftLongPressTimerRef = useRef<number | null>(null);
  const lastEmptyTapRef = useRef<{ key: string; t: number }>({ key: '', t: 0 });

  const shiftsByDayFlat = useMemo(() => {
    const m = new Map<string, StaffShift[]>();
    for (const s of shifts) {
      const arr = m.get(s.shiftDate) ?? [];
      arr.push(s);
      m.set(s.shiftDate, arr);
    }
    return m;
  }, [shifts]);

  const clearEmptyLongPressTimer = useCallback(() => {
    if (emptyLongPressTimerRef.current != null) {
      window.clearTimeout(emptyLongPressTimerRef.current);
      emptyLongPressTimerRef.current = null;
    }
  }, []);

  const clearShiftLongPressTimer = useCallback(() => {
    if (shiftLongPressTimerRef.current != null) {
      window.clearTimeout(shiftLongPressTimerRef.current);
      shiftLongPressTimerRef.current = null;
    }
  }, []);

  const bindEmptyLongPress = useCallback(
    (ymd: string, zk: string) => ({
      onPointerDown: (e: React.PointerEvent) => {
        if (!canEdit || e.button !== 0) return;
        clearEmptyLongPressTimer();
        emptyLongPressTimerRef.current = window.setTimeout(() => {
          emptyLongPressTimerRef.current = null;
          ignoreClicksUntilRef.current = Date.now() + 500;
          onEmptyLongPress(ymd, zk);
        }, LONG_PRESS_MS_EMPTY);
      },
      onPointerUp: () => {
        clearEmptyLongPressTimer();
      },
      onPointerCancel: () => {
        clearEmptyLongPressTimer();
      },
      onPointerLeave: () => {
        clearEmptyLongPressTimer();
      },
    }),
    [canEdit, clearEmptyLongPressTimer, onEmptyLongPress],
  );

  const bindShiftLongPress = useCallback(
    (shift: StaffShift) => ({
      onPointerDown: (e: React.PointerEvent) => {
        if (!canEdit || e.button !== 0) return;
        clearShiftLongPressTimer();
        shiftLongPressTimerRef.current = window.setTimeout(() => {
          shiftLongPressTimerRef.current = null;
          ignoreClicksUntilRef.current = Date.now() + 500;
          onShiftAdvancedEdit(shift);
        }, LONG_PRESS_MS_SHIFT);
      },
      onPointerUp: () => {
        clearShiftLongPressTimer();
      },
      onPointerCancel: () => {
        clearShiftLongPressTimer();
      },
    }),
    [canEdit, clearShiftLongPressTimer, onShiftAdvancedEdit],
  );

  const handleEmptyCellTap = useCallback(
    (ymd: string, zk: string) => {
      if (!canEdit) return;
      if (Date.now() < ignoreClicksUntilRef.current) return;
      const key = `${ymd}|${zk}`;
      const now = Date.now();
      if (
        lastEmptyTapRef.current.key === key &&
        now - lastEmptyTapRef.current.t < DOUBLE_TAP_MS
      ) {
        lastEmptyTapRef.current = { key: '', t: 0 };
        void onQuickCreateShift(ymd, zk);
        return;
      }
      lastEmptyTapRef.current = { key, t: now };
      setSelectedCell({ ymd, zoneKey: zk });
      setSelectedShiftId(null);
    },
    [canEdit, onQuickCreateShift],
  );

  const quickCreateFromButton = useCallback(
    (e: React.MouseEvent, ymd: string, zk: string) => {
      e.stopPropagation();
      e.preventDefault();
      if (!canEdit) return;
      if (Date.now() < ignoreClicksUntilRef.current) return;
      lastEmptyTapRef.current = { key: '', t: 0 };
      void onQuickCreateShift(ymd, zk);
    },
    [canEdit, onQuickCreateShift],
  );

  const employeeName = useCallback(
    (id: string | null) =>
      id
        ? staffDisplayName(
            employees.find((e) => e.id === id) ?? { firstName: '', lastName: '', alias: null },
          )
        : '',
    [employees],
  );

  const shiftsByDayZone = useMemo(() => {
    const m = new Map<string, StaffShift[]>();
    for (const s of shifts) {
      const k = `${s.shiftDate}|${shiftZoneKey(s)}`;
      const arr = m.get(k) ?? [];
      arr.push(s);
      m.set(k, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return m;
  }, [shifts]);

  const statsByDay = useMemo(() => {
    const m = new Map<string, { people: number; minutes: number; byZone: Map<string, { people: number; minutes: number }> }>();
    for (const d of days) {
      const ymd = ymdLocal(d);
      const dayShifts = shifts.filter((s) => s.shiftDate === ymd);
      const people = new Set(dayShifts.filter((s) => s.employeeId).map((s) => s.employeeId!)).size;
      const minutes = dayShifts.reduce((acc, s) => acc + plannedShiftMinutes(s), 0);
      const byZone = new Map<string, { people: number; minutes: number }>();
      for (const s of dayShifts) {
        const zk = shiftZoneKey(s);
        const cur = byZone.get(zk) ?? { people: 0, minutes: 0 };
        cur.minutes += plannedShiftMinutes(s);
        byZone.set(zk, cur);
      }
      for (const zk of byZone.keys()) {
        const cur = byZone.get(zk)!;
        const ids = new Set(
          dayShifts.filter((x) => shiftZoneKey(x) === zk && x.employeeId).map((x) => x.employeeId!),
        );
        cur.people = ids.size;
      }
      m.set(ymd, { people, minutes, byZone });
    }
    return m;
  }, [days, shifts]);

  const coverageByDay = useMemo(() => {
    const m = new Map<string, Coverage>();
    for (const d of days) {
      const ymd = ymdLocal(d);
      m.set(ymd, dayCoverage(ymd, shifts));
    }
    return m;
  }, [days, shifts]);

  const onDragStart = useCallback(
    (e: React.DragEvent, shiftId: string) => {
      if (!canEdit) return;
      setDraggingId(shiftId);
      e.dataTransfer.setData('text/staff-shift-id', shiftId);
      e.dataTransfer.effectAllowed = 'move';
    },
    [canEdit],
  );

  const onDragEnd = useCallback(() => setDraggingId(null), []);

  const onCellDrop = useCallback(
    async (e: React.DragEvent, dateYmd: string, zoneRowKey: string) => {
      if (!canEdit) return;
      e.preventDefault();
      const id = e.dataTransfer.getData('text/staff-shift-id');
      setDraggingId(null);
      if (!id) return;
      const shift = shifts.find((s) => s.id === id);
      if (!shift) return;
      const currentKey = shiftZoneKey(shift);
      if (shift.shiftDate === dateYmd && currentKey === zoneRowKey) return;
      await onShiftPlaced(shift, dateYmd, zoneRowKey);
    },
    [canEdit, onShiftPlaced, shifts],
  );

  const zoneSummaryLine = (ymd: string) => {
    const st = statsByDay.get(ymd);
    if (!st) return '—';
    const parts: string[] = [];
    for (const z of MAIN_ZONES) {
      const row = st.byZone.get(z);
      if (!row || (row.people === 0 && row.minutes === 0)) {
        parts.push(`${z[0]!.toUpperCase()} 0·0h`);
        continue;
      }
      parts.push(`${z[0]!.toUpperCase()} ${row.people}·${formatHoursSum(row.minutes)}`);
    }
    return parts.join(' · ');
  };

  const applyPreset = async (s: StaffShift, presetId: string) => {
    const p = QUICK_SHIFT_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    const z = shiftZoneKey(s);
    const zoneVal = z === OPERATIONAL_NONE_ZONE ? null : z;
    await onShiftPatch(s, {
      startTime: toPgTime(p.startTime),
      endTime: toPgTime(p.endTime),
      endsNextDay: p.endsNextDay,
      breakMinutes: p.breakMinutes,
      colorHint: zoneVal ? zoneDefaultColorHint(zoneVal) : s.colorHint,
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-zinc-500 sm:text-xs">
        {canEdit ? (
          <>
            Franja de referencia (este local):{' '}
            <span className="font-semibold text-zinc-700">{operationalHeading}</span>.{' '}
            <span className="font-semibold text-zinc-700">Toque</span> = seleccionar celda o turno.{' '}
            <span className="font-semibold text-zinc-700">Doble toque</span> o botón <span className="font-semibold text-zinc-700">+</span> = turno
            rápido. <span className="font-semibold text-zinc-700">Mantener pulsado</span> = edición completa. Arrastra
            con el asa.
          </>
        ) : (
          <>
            Vista operativa por puesto. Franja de referencia:{' '}
            <span className="font-semibold text-zinc-700">{operationalHeading}</span>.
          </>
        )}
      </p>
      <div className="overflow-x-auto rounded-2xl ring-1 ring-zinc-200/90">
        <table className="w-full min-w-[760px] border-collapse text-left text-[10px] sm:text-xs">
          <thead>
            <tr className="bg-zinc-50">
              <th className="sticky left-0 z-20 min-w-[5.5rem] border-b border-r border-zinc-200 bg-zinc-50 px-1.5 py-2 text-[9px] font-extrabold uppercase tracking-wide text-zinc-500 sm:min-w-[6.5rem] sm:px-2">
                Puesto
              </th>
              {days.map((d) => {
                const ymd = ymdLocal(d);
                const cov = coverageByDay.get(ymd) ?? 'bad';
                return (
                  <th
                    key={ymd}
                    className={[
                      'min-w-[5rem] border-b border-zinc-200 px-0.5 py-1.5 text-center font-extrabold sm:min-w-[5.75rem] sm:px-1',
                      headerTone(cov),
                    ].join(' ')}
                  >
                    <span className="block text-[9px] uppercase leading-tight opacity-90">
                      {formatWeekdayShort(d)}
                    </span>
                    <span className="block text-[11px] leading-tight sm:text-xs">{formatDayMonth(d)}</span>
                  </th>
                );
              })}
            </tr>
            <tr className="bg-zinc-50/95">
              <th className="sticky left-0 z-20 min-w-[5.5rem] border-b border-r border-zinc-200 bg-zinc-50/95 px-1.5 py-1 text-left align-bottom text-[8px] font-bold leading-snug text-zinc-500 sm:min-w-[6.5rem] sm:px-2 sm:text-[9px]">
                <span className="block uppercase tracking-wide">Servicio</span>
                <span className="mt-0.5 block font-extrabold text-zinc-800">{operationalHeading}</span>
              </th>
              {days.map((d) => {
                const ymd = ymdLocal(d);
                const dayShifts = shiftsByDayFlat.get(ymd) ?? [];
                return (
                  <th
                    key={`tl-${ymd}`}
                    className="min-w-[5rem] border-b border-zinc-200 bg-zinc-50/90 align-bottom sm:min-w-[5.75rem]"
                  >
                    <OperationalDayTimeline
                      ymd={ymd}
                      dayShifts={dayShifts}
                      metrics={operationalMetrics}
                      operationalWindow={operationalWindow}
                      timelineTicks={timelineTicks}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {zoneRows.map((row) => (
              <tr key={row.key} className="bg-white">
                <td className="sticky left-0 z-10 border-b border-r border-zinc-100 bg-white px-1.5 py-1.5 align-top sm:px-2">
                  <span className="font-extrabold text-zinc-900">{row.label}</span>
                </td>
                {days.map((d) => {
                  const ymd = ymdLocal(d);
                  const here = shiftsByDayZone.get(`${ymd}|${row.key}`) ?? [];
                  const dropHighlight = Boolean(draggingId && canEdit);
                  return (
                    <td
                      key={ymd}
                      className={[
                        'align-top border-b border-zinc-100 p-0.5 sm:p-1',
                        dropHighlight ? 'bg-amber-50/25' : '',
                      ].join(' ')}
                      onDragOver={
                        canEdit
                          ? (e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                            }
                          : undefined
                      }
                      onDrop={canEdit ? (e) => void onCellDrop(e, ymd, row.key) : undefined}
                    >
                      {here.length === 0 ? (
                        <div
                          role={canEdit ? 'button' : undefined}
                          tabIndex={canEdit ? 0 : undefined}
                          className={[
                            'relative flex min-h-[3.1rem] w-full flex-col items-center justify-center rounded-lg border border-dashed p-0.5 text-center transition sm:min-h-[3.35rem] touch-manipulation select-none',
                            canEdit
                              ? 'cursor-pointer border-zinc-200/90 bg-zinc-50/50 text-zinc-500 hover:border-[#D32F2F]/35 hover:bg-[#D32F2F]/5'
                              : 'cursor-default border-zinc-100 bg-zinc-50/30 text-zinc-400',
                            selectedCell?.ymd === ymd && selectedCell?.zoneKey === row.key
                              ? 'ring-2 ring-[#D32F2F]/40 ring-offset-1'
                              : '',
                            !canEdit ? 'opacity-60' : '',
                          ].join(' ')}
                          onClick={() => handleEmptyCellTap(ymd, row.key)}
                          onKeyDown={(e) => {
                            if (!canEdit) return;
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleEmptyCellTap(ymd, row.key);
                            }
                          }}
                          {...(canEdit ? bindEmptyLongPress(ymd, row.key) : ({} as Record<string, never>))}
                        >
                          {canEdit ? (
                            <button
                              type="button"
                              className="absolute right-0.5 top-0.5 z-[1] flex h-6 w-6 items-center justify-center rounded-md bg-[#D32F2F] text-white shadow-sm ring-1 ring-black/10 hover:bg-[#b71c1c] sm:right-1 sm:top-1"
                              aria-label="Crear turno rápido"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => quickCreateFromButton(e, ymd, row.key)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          <span className="max-w-[5.5rem] px-5 text-[8px] font-semibold leading-tight sm:max-w-none sm:px-6 sm:text-[9px]">
                            {canEdit ? 'Tocar = seleccionar · 2× o + = turno' : '—'}
                          </span>
                        </div>
                      ) : (
                        <div className="min-h-[3.1rem] w-full space-y-0.5 rounded-lg p-0.5 sm:min-h-[3.35rem]">
                          {here.map((s) => {
                            const zStyle = s.colorHint
                              ? { bg: s.colorHint, text: '#ffffff', subtleBg: `${s.colorHint}22` }
                              : zoneBlockStyle(s.zone);
                            const mins = plannedShiftMinutes(s);
                            const unassigned = s.employeeId == null;
                            const nudge = nudgeEndTime(s, 15);
                            const nudgeBack = nudgeEndTime(s, -15);
                            return (
                              <div
                                key={s.id}
                                className={[
                                  'flex overflow-hidden rounded-md shadow-sm ring-1 ring-black/8',
                                  selectedShiftId === s.id
                                    ? 'ring-2 ring-sky-500/95 ring-offset-1'
                                    : unassigned
                                      ? 'ring-2 ring-amber-400/90'
                                      : '',
                                ].join(' ')}
                                style={{ background: zStyle.subtleBg }}
                              >
                                {canEdit ? (
                                  <button
                                    type="button"
                                    draggable
                                    title="Arrastrar"
                                    onDragStart={(e) => onDragStart(e, s.id)}
                                    onDragEnd={onDragEnd}
                                    className="flex shrink-0 cursor-grab items-center border-r border-black/10 bg-black/5 px-0.5 text-zinc-500 active:cursor-grabbing"
                                    aria-label="Arrastrar"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <GripVertical className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                                <div
                                  className="min-w-0 flex-1 px-1 py-0.5 sm:px-1.5"
                                  style={{ background: zStyle.bg, color: zStyle.text }}
                                >
                                  <div
                                    role="button"
                                    tabIndex={canEdit ? 0 : undefined}
                                    className="w-full cursor-pointer rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                                    {...(canEdit ? bindShiftLongPress(s) : ({} as Record<string, never>))}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (Date.now() < ignoreClicksUntilRef.current) return;
                                      setSelectedShiftId(s.id);
                                      setSelectedCell(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (!canEdit) return;
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        if (Date.now() < ignoreClicksUntilRef.current) return;
                                        setSelectedShiftId(s.id);
                                        setSelectedCell(null);
                                      }
                                    }}
                                  >
                                    <span
                                      className={[
                                        'block truncate text-[9px] font-extrabold leading-tight sm:text-[10px]',
                                        unassigned ? 'uppercase tracking-wide text-amber-100' : '',
                                      ].join(' ')}
                                    >
                                      {unassigned ? 'Sin asignar' : employeeName(s.employeeId)}
                                    </span>
                                    <span className="mt-0.5 block text-[9px] font-semibold opacity-95 sm:text-[10px]">
                                      {shortTime(s.startTime)} – {shortTime(s.endTime)}
                                      {s.endsNextDay ? (
                                        <span className="ml-0.5 font-extrabold opacity-100">(+1)</span>
                                      ) : null}
                                    </span>
                                    <span className="mt-0.5 block text-[9px] font-bold opacity-90">
                                      {formatShiftHoursLabel(mins)}
                                    </span>
                                  </div>
                                  {canEdit ? (
                                    <div
                                      className="mt-1 space-y-1 border-t border-white/25 pt-1"
                                      onClick={(e) => e.stopPropagation()}
                                      onPointerDown={(e) => e.stopPropagation()}
                                    >
                                      <select
                                        className="w-full max-w-full rounded bg-black/15 px-0.5 py-0.5 text-[9px] font-bold text-inherit ring-1 ring-white/20"
                                        value={s.employeeId ?? ''}
                                        onChange={(e) => {
                                          const v = e.target.value.trim();
                                          void onShiftPatch(s, { employeeId: v ? v : null });
                                        }}
                                      >
                                        <option value="">Sin asignar</option>
                                        {employees.map((em) => (
                                          <option key={em.id} value={em.id}>
                                            {staffDisplayName(em)}
                                          </option>
                                        ))}
                                      </select>
                                      <select
                                        className="w-full max-w-full rounded bg-black/15 px-0.5 py-0.5 text-[9px] font-bold text-inherit ring-1 ring-white/20"
                                        value={guessPresetId(s) || '__custom__'}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          if (v && v !== '__custom__') void applyPreset(s, v);
                                        }}
                                      >
                                        <option value="__custom__">Preset…</option>
                                        {QUICK_SHIFT_PRESETS.map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.label}
                                          </option>
                                        ))}
                                      </select>
                                      <div className="flex flex-wrap items-center gap-0.5">
                                        <button
                                          type="button"
                                          className="rounded bg-black/20 px-1 py-0.5 text-[8px] font-extrabold"
                                          disabled={!nudgeBack}
                                          onClick={() =>
                                            nudgeBack && void onShiftPatch(s, { endTime: nudgeBack.endTime })
                                          }
                                        >
                                          −15
                                        </button>
                                        <button
                                          type="button"
                                          className="rounded bg-black/20 px-1 py-0.5 text-[8px] font-extrabold"
                                          disabled={!nudge}
                                          onClick={() => nudge && void onShiftPatch(s, { endTime: nudge.endTime })}
                                        >
                                          +15
                                        </button>
                                        <button
                                          type="button"
                                          title="Duplicar aquí"
                                          className="rounded bg-black/20 p-0.5"
                                          onClick={() => void onShiftDuplicateHere(s)}
                                        >
                                          <Copy className="h-3 w-3" />
                                        </button>
                                        <button
                                          type="button"
                                          title="Copiar a día anterior (esta semana)"
                                          className="rounded bg-black/20 px-0.5 py-0.5 text-[8px] font-extrabold"
                                          onClick={() => void onShiftCopyPrevCalendarDay(s)}
                                        >
                                          −1d
                                        </button>
                                        <button
                                          type="button"
                                          title="Copiar a la misma fecha −7 días (esta semana)"
                                          className="rounded bg-black/20 px-0.5 py-0.5 text-[8px] font-extrabold"
                                          onClick={() => void onShiftCopyPrevWeekday(s)}
                                        >
                                          −7d
                                        </button>
                                        <button
                                          type="button"
                                          title="Eliminar"
                                          className="rounded bg-black/25 p-0.5 text-red-100"
                                          onClick={() => void onShiftDelete(s)}
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-zinc-100/90">
              <td className="sticky left-0 z-10 border-t border-r border-zinc-200 px-1.5 py-2 text-[9px] font-extrabold uppercase text-zinc-600 sm:px-2 sm:text-[10px]">
                Resumen
              </td>
              {days.map((d) => {
                const ymd = ymdLocal(d);
                const st = statsByDay.get(ymd) ?? { people: 0, minutes: 0, byZone: new Map() };
                return (
                  <td
                    key={ymd}
                    className="border-t border-zinc-200 px-0.5 py-2 text-center align-top sm:px-1"
                  >
                    <div className="text-[10px] font-extrabold tabular-nums text-zinc-900 sm:text-xs">
                      {st.people} pers.
                    </div>
                    <div className="text-[9px] font-bold tabular-nums text-zinc-600 sm:text-[10px]">
                      {st.minutes > 0 ? formatHoursSum(st.minutes) : '—'}
                    </div>
                    <div className="mx-auto mt-1 max-w-[6.5rem] text-[8px] font-semibold leading-snug text-zinc-500 sm:max-w-none sm:text-[9px]">
                      {zoneSummaryLine(ymd)}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[10px] text-zinc-500">
        Semáforo: verde = cocina/barra/sala con alguien asignado; amarillo = hay turno pero sin empleado; rojo = falta
        algún puesto principal.
      </p>
    </div>
  );
}
