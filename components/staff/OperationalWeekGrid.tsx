'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Copy, GripVertical, Trash2 } from 'lucide-react';
import { plannedShiftMinutes } from '@/lib/staff/attendance-logic';
import { addDays, formatDayMonth, formatWeekdayShort, ymdLocal } from '@/lib/staff/staff-dates';
import { zoneBlockStyle, zoneDefaultColorHint, zoneLabel } from '@/lib/staff/staff-zone-styles';
import { QUICK_SHIFT_PRESETS, type QuickShiftPreset } from '@/lib/staff/shift-quick-presets';
import { STAFF_ZONE_PRESETS, type StaffEmployee, type StaffShift } from '@/lib/staff/types';
import { staffDisplayName } from '@/lib/staff/staff-supabase';

export const OPERATIONAL_NONE_ZONE = '__none__' as const;

const MAIN_ZONES = ['cocina', 'barra', 'sala'] as const;

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

export type OperationalWeekGridProps = {
  weekStartMonday: Date;
  employees: StaffEmployee[];
  shifts: StaffShift[];
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

function useLongPressEmptyCell(
  canEdit: boolean,
  onQuick: (ymd: string, zk: string) => void,
  onLong: (ymd: string, zk: string) => void,
) {
  const timerRef = useRef<number | null>(null);
  const longFiredRef = useRef(false);

  const bind = (ymd: string, zoneKey: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (!canEdit || e.button !== 0) return;
      longFiredRef.current = false;
      timerRef.current = window.setTimeout(() => {
        longFiredRef.current = true;
        onLong(ymd, zoneKey);
        timerRef.current = null;
      }, 520);
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (!canEdit) return;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!longFiredRef.current) {
        e.preventDefault();
        void onQuick(ymd, zoneKey);
      }
    },
    onPointerCancel: () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    onPointerLeave: () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
  });

  return bind;
}

export default function OperationalWeekGrid({
  weekStartMonday,
  employees,
  shifts,
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
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const emptyPress = useLongPressEmptyCell(canEdit, onQuickCreateShift, onEmptyLongPress);

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
            <span className="font-semibold text-zinc-700">Toque corto</span> = turno rápido (sin empleado).{' '}
            <span className="font-semibold text-zinc-700">Mantener pulsado</span> = edición completa. Arrastra con el
            asa.
          </>
        ) : (
          <>Vista operativa por puesto.</>
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
                        <button
                          type="button"
                          disabled={!canEdit}
                          className="flex min-h-[3.1rem] w-full items-center justify-center rounded-lg border border-dashed border-zinc-200/90 bg-zinc-50/50 p-0.5 text-center text-[9px] font-semibold text-zinc-400 transition hover:border-[#D32F2F]/35 hover:bg-[#D32F2F]/5 disabled:opacity-50 sm:min-h-[3.35rem] sm:text-[10px] touch-manipulation"
                          {...(canEdit ? emptyPress(ymd, row.key) : ({} as Record<string, never>))}
                        >
                          + Rápido
                        </button>
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
                                  unassigned ? 'ring-2 ring-amber-400/90' : '',
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
                                  <button
                                    type="button"
                                    className="w-full text-left"
                                    onClick={() => onShiftAdvancedEdit(s)}
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
                                    </span>
                                    <span className="mt-0.5 block text-[9px] font-bold opacity-90">
                                      {formatShiftHoursLabel(mins)}
                                    </span>
                                  </button>
                                  {canEdit ? (
                                    <div className="mt-1 space-y-1 border-t border-white/25 pt-1">
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
