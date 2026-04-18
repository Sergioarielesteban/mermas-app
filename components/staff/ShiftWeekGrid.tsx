'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { plannedShiftMinutes } from '@/lib/staff/attendance-logic';
import { addDays, formatDayMonth, formatWeekdayShort, ymdLocal } from '@/lib/staff/staff-dates';
import { zoneBlockStyle, zoneLabel } from '@/lib/staff/staff-zone-styles';
import type { StaffEmployee, StaffShift } from '@/lib/staff/types';
import { staffDisplayName } from '@/lib/staff/staff-supabase';

function shortTime(t: string) {
  const [h, m] = t.split(':');
  return `${h}:${m ?? '00'}`;
}

function formatDurationMin(mins: number): string {
  if (mins <= 0) return '0 min';
  const h = Math.floor(mins / 60);
  const mm = mins % 60;
  if (h === 0) return `${mm} min`;
  if (mm === 0) return `${h} h`;
  return `${h}h ${mm}m`;
}

function formatHoursSum(mins: number): string {
  const h = mins / 60;
  if (h < 10) return `${h.toFixed(1).replace('.', ',')} h`;
  return `${Math.round(h)} h`;
}

type Props = {
  weekStartMonday: Date;
  employees: StaffEmployee[];
  shifts: StaffShift[];
  onCellActivate: (employeeId: string, dateYmd: string, shiftsHere: StaffShift[]) => void;
  /** Arrastrar bloque a otra celda (solo escritorio; managers). */
  canDragShifts?: boolean;
  onShiftMoved?: (shift: StaffShift, newEmployeeId: string, newDateYmd: string) => void | Promise<void>;
};

export default function ShiftWeekGrid({
  weekStartMonday,
  employees,
  shifts,
  onCellActivate,
  canDragShifts = false,
  onShiftMoved,
}: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStartMonday, i));
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const shiftsByKey = useMemo(() => {
    const m = new Map<string, StaffShift[]>();
    for (const s of shifts) {
      const k = `${s.employeeId}|${s.shiftDate}`;
      const arr = m.get(k) ?? [];
      arr.push(s);
      m.set(k, arr);
    }
    return m;
  }, [shifts]);

  const minutesByEmployeeWeek = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shifts) {
      m.set(s.employeeId, (m.get(s.employeeId) ?? 0) + plannedShiftMinutes(s));
    }
    return m;
  }, [shifts]);

  const minutesByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shifts) {
      m.set(s.shiftDate, (m.get(s.shiftDate) ?? 0) + plannedShiftMinutes(s));
    }
    return m;
  }, [shifts]);

  const onDragStart = useCallback((e: React.DragEvent, shiftId: string) => {
    if (!canDragShifts) return;
    setDraggingId(shiftId);
    e.dataTransfer.setData('text/staff-shift-id', shiftId);
    e.dataTransfer.effectAllowed = 'move';
  }, [canDragShifts]);

  const onDragEnd = useCallback(() => setDraggingId(null), []);

  const onCellDrop = useCallback(
    async (e: React.DragEvent, employeeId: string, dateYmd: string) => {
      if (!canDragShifts || !onShiftMoved) return;
      e.preventDefault();
      const id = e.dataTransfer.getData('text/staff-shift-id');
      setDraggingId(null);
      if (!id) return;
      const shift = shifts.find((s) => s.id === id);
      if (!shift) return;
      if (shift.employeeId === employeeId && shift.shiftDate === dateYmd) return;
      await onShiftMoved(shift, employeeId, dateYmd);
    },
    [canDragShifts, onShiftMoved, shifts],
  );

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-zinc-500 sm:text-xs">
        {canDragShifts ? (
          <>
            <span className="font-semibold text-zinc-700">Arrastra</span> un turno por el asa{' '}
            <GripVertical className="inline h-3 w-3 align-middle opacity-60" aria-hidden /> a otro día o compañero.
          </>
        ) : (
          <>Toca una celda para crear turno o pulsa un bloque para editarlo.</>
        )}
      </p>
      <div className="overflow-x-auto rounded-2xl ring-1 ring-zinc-200/90">
        <table className="min-w-[800px] w-full border-collapse text-left text-xs sm:text-sm">
          <thead>
            <tr className="bg-zinc-50">
              <th className="sticky left-0 z-20 min-w-[128px] border-b border-r border-zinc-200 bg-zinc-50 px-2 py-3 text-[10px] font-extrabold uppercase tracking-wide text-zinc-500 sm:px-3">
                Equipo
              </th>
              {days.map((d) => (
                <th
                  key={ymdLocal(d)}
                  className="border-b border-zinc-200 px-1 py-3 text-center font-extrabold text-zinc-800 sm:px-2"
                >
                  <span className="block text-[10px] uppercase text-zinc-500">{formatWeekdayShort(d)}</span>
                  <span className="block text-sm">{formatDayMonth(d)}</span>
                </th>
              ))}
              <th className="border-b border-l border-zinc-200 bg-zinc-50 px-2 py-3 text-center text-[10px] font-extrabold uppercase text-zinc-500">
                Σ semana
              </th>
            </tr>
          </thead>
          <tbody>
            {employees.map((em) => (
              <tr key={em.id} className="bg-white">
                <td className="sticky left-0 z-10 border-b border-r border-zinc-100 bg-white px-2 py-2 sm:px-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{ background: em.color ?? '#D32F2F' }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="truncate font-bold text-zinc-900">{staffDisplayName(em)}</p>
                      {em.operationalRole ? (
                        <p className="truncate text-[10px] font-medium text-zinc-500">{em.operationalRole}</p>
                      ) : null}
                    </div>
                  </div>
                </td>
                {days.map((d) => {
                  const ymd = ymdLocal(d);
                  const here = (shiftsByKey.get(`${em.id}|${ymd}`) ?? []).sort((a, b) =>
                    a.startTime.localeCompare(b.startTime),
                  );
                  return (
                    <td
                      key={ymd}
                      className={[
                        'align-top border-b border-zinc-100 p-1 sm:p-1.5',
                        draggingId ? 'bg-amber-50/30' : '',
                      ].join(' ')}
                      onDragOver={
                        canDragShifts
                          ? (e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                            }
                          : undefined
                      }
                      onDrop={
                        canDragShifts ? (e) => void onCellDrop(e, em.id, ymd) : undefined
                      }
                    >
                      <div className="min-h-[72px] w-full rounded-xl border border-dashed border-zinc-200/90 bg-zinc-50/50 p-1 text-left transition hover:border-[#D32F2F]/40 hover:bg-[#D32F2F]/5">
                        {here.length === 0 ? (
                          <button
                            type="button"
                            onClick={() => onCellActivate(em.id, ymd, here)}
                            className="flex min-h-[56px] w-full items-center justify-center text-[10px] font-semibold text-zinc-400"
                          >
                            +
                          </button>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {here.map((s) => {
                              const zStyle = s.colorHint
                                ? { bg: s.colorHint, text: '#ffffff', subtleBg: `${s.colorHint}22` }
                                : zoneBlockStyle(s.zone);
                              const dur = plannedShiftMinutes(s);
                              return (
                                <div
                                  key={s.id}
                                  className="flex items-stretch gap-0 overflow-hidden rounded-lg shadow-sm ring-1 ring-black/8"
                                  style={{ background: zStyle.subtleBg }}
                                >
                                  {canDragShifts ? (
                                    <button
                                      type="button"
                                      draggable
                                      title="Arrastrar turno"
                                      onDragStart={(e) => onDragStart(e, s.id)}
                                      onDragEnd={onDragEnd}
                                      className="flex shrink-0 cursor-grab items-center border-r border-black/10 bg-black/5 px-0.5 text-zinc-500 active:cursor-grabbing"
                                      aria-label="Arrastrar turno"
                                    >
                                      <GripVertical className="h-4 w-4" />
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="min-w-0 flex-1 px-2 py-1.5 text-left"
                                    style={{ background: zStyle.bg, color: zStyle.text }}
                                    onClick={() => onCellActivate(em.id, ymd, here.length === 1 ? [s] : here)}
                                  >
                                    <span className="block text-[10px] font-extrabold leading-tight sm:text-xs">
                                      {shortTime(s.startTime)} – {shortTime(s.endTime)}
                                    </span>
                                    <span className="mt-0.5 block text-[9px] font-semibold opacity-95">
                                      {formatDurationMin(dur)}
                                      {s.zone ? ` · ${zoneLabel(s.zone)}` : ''}
                                    </span>
                                  </button>
                                </div>
                              );
                            })}
                            <button
                              type="button"
                              onClick={() => onCellActivate(em.id, ymd, [])}
                              className="rounded-lg py-1 text-center text-[10px] font-bold text-zinc-500 hover:bg-white/80"
                            >
                              + Añadir
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="border-b border-l border-zinc-100 bg-zinc-50/80 px-2 py-2 text-center align-middle">
                  <span className="text-sm font-extrabold tabular-nums text-zinc-900">
                    {formatHoursSum(minutesByEmployeeWeek.get(em.id) ?? 0)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-zinc-100/90">
              <td className="sticky left-0 z-10 border-t border-r border-zinc-200 px-2 py-2 text-[10px] font-extrabold uppercase text-zinc-600 sm:px-3">
                Horas / día
              </td>
              {days.map((d) => {
                const ymd = ymdLocal(d);
                const m = minutesByDay.get(ymd) ?? 0;
                return (
                  <td key={ymd} className="border-t border-zinc-200 px-1 py-2 text-center text-sm font-extrabold text-zinc-900">
                    {m > 0 ? formatHoursSum(m) : '—'}
                  </td>
                );
              })}
              <td className="border-t border-l border-zinc-200 px-2 py-2 text-center text-sm font-extrabold text-[#B91C1C]">
                {formatHoursSum([...minutesByDay.values()].reduce((a, b) => a + b, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap gap-3 text-[10px] font-semibold text-zinc-600 sm:text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ background: zoneBlockStyle('cocina').bg }} />
          Cocina
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ background: zoneBlockStyle('sala').bg }} />
          Sala
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ background: zoneBlockStyle('barra').bg }} />
          Barra
        </span>
      </div>
    </div>
  );
}
