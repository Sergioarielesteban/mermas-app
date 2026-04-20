'use client';

import React, { useMemo } from 'react';
import { GripVertical } from 'lucide-react';
import { plannedShiftMinutes } from '@/lib/staff/attendance-logic';
import { useShiftWeekDrag } from '@/hooks/useShiftWeekDrag';
import {
  assignShiftLanes,
  breakFractionInBar,
  layoutGrossOnTimeline,
  RULER_HOUR_TICKS,
} from '@/lib/staff/shift-timeline-layout';
import { addDays, formatDayMonth, formatWeekdayShort, ymdLocal } from '@/lib/staff/staff-dates';
import { zoneBlockStyle, zoneLabel } from '@/lib/staff/staff-zone-styles';
import type { StaffEmployee, StaffShift } from '@/lib/staff/types';
import { staffDisplayName } from '@/lib/staff/staff-supabase';

const GRID_TEMPLATE = '[grid-template-columns:11.25rem_repeat(7,minmax(0,1fr))_4.5rem]';
const LANE_H = 24;

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

function TimelineRuler() {
  return (
    <div className="flex h-7 items-end border-b border-zinc-200 bg-zinc-50/90 text-[9px] font-semibold tabular-nums text-zinc-400">
      {RULER_HOUR_TICKS.map((hour, i) => (
        <div
          key={`${hour}-${i}`}
          className="min-w-0 flex-1 border-l border-zinc-100/90 pl-0.5 first:border-l-0 first:pl-0"
        >
          {hour === 24 ? '00' : `${String(hour).padStart(2, '0')}`}
        </div>
      ))}
    </div>
  );
}

type ShiftBarProps = {
  s: StaffShift;
  lane: number;
  zStyle: { bg: string; text: string; subtleBg: string };
  canDragShifts: boolean;
  onDragStart: (e: React.DragEvent, shiftId: string) => void;
  onDragEnd: () => void;
  onEdit: () => void;
  draggingId: string | null;
  ghost?: boolean;
};

function ShiftBar({
  s,
  lane,
  zStyle,
  canDragShifts,
  onDragStart,
  onDragEnd,
  onEdit,
  draggingId,
  ghost,
}: ShiftBarProps) {
  const { leftPct, widthPct } = layoutGrossOnTimeline(s);
  if (widthPct <= 0) return null;

  const bf = breakFractionInBar(s);
  const dur = plannedShiftMinutes(s);
  const dimmed = !ghost && draggingId === s.id;

  return (
    <div
      className={[
        'absolute flex overflow-hidden rounded-md shadow-sm ring-1 ring-black/10 transition-opacity',
        ghost ? 'z-[25] pointer-events-none border-2 border-dashed border-zinc-400 bg-white/70 opacity-80' : 'z-[6]',
        dimmed ? 'opacity-35' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        top: lane * LANE_H + 2,
        height: LANE_H - 4,
      }}
      title={ghost ? undefined : `${shortTime(s.startTime)}–${shortTime(s.endTime)} · ${formatDurationMin(dur)}`}
    >
      {canDragShifts && !ghost ? (
        <button
          type="button"
          draggable
          title="Arrastrar turno"
          onDragStart={(e) => onDragStart(e, s.id)}
          onDragEnd={onDragEnd}
          className="flex w-4 shrink-0 cursor-grab items-center justify-center border-r border-black/10 bg-black/10 text-zinc-600 active:cursor-grabbing"
          aria-label="Arrastrar turno"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (!ghost) onEdit();
        }}
        disabled={ghost}
        className="flex min-w-0 flex-1 items-stretch text-left"
        style={{ background: zStyle.subtleBg }}
      >
        {bf > 0 && bf < 1 ? (
          <span className="relative flex min-w-0 flex-1">
            <span
              className="min-h-full min-w-0"
              style={{ flex: (1 - bf) / 2, background: zStyle.bg, color: zStyle.text }}
            />
            <span
              className="min-h-full shrink-0 bg-[repeating-linear-gradient(-45deg,rgba(0,0,0,0.18),rgba(0,0,0,0.18)_3px,transparent_3px,transparent_6px)]"
              style={{ width: `${bf * 100}%` }}
              title="Descanso"
            />
            <span
              className="min-h-full min-w-0"
              style={{ flex: (1 - bf) / 2, background: zStyle.bg, color: zStyle.text }}
            />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-0.5 text-[8px] font-extrabold leading-none text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)] sm:text-[9px]">
              {shortTime(s.startTime)}–{shortTime(s.endTime)}
              {s.zone ? ` · ${zoneLabel(s.zone)}` : ''}
            </span>
          </span>
        ) : (
          <span
            className="flex min-h-full min-w-0 flex-1 items-center px-1"
            style={{ background: zStyle.bg, color: zStyle.text }}
          >
            <span className="block min-w-0 truncate text-[9px] font-extrabold leading-tight sm:text-[10px]">
              {shortTime(s.startTime)}–{shortTime(s.endTime)}
              {s.zone ? ` · ${zoneLabel(s.zone)}` : ''}
            </span>
          </span>
        )}
      </button>
    </div>
  );
}

type Props = {
  weekStartMonday: Date;
  employees: StaffEmployee[];
  shifts: StaffShift[];
  onCellActivate: (employeeId: string, dateYmd: string, shiftsHere: StaffShift[]) => void;
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

  const { draggingId, draggingShift, hoverTarget, onDragStart, onDragEnd, onCellDragEnter, onCellDragOver, onCellDrop } =
    useShiftWeekDrag({
      canDrag: Boolean(canDragShifts && onShiftMoved),
      shifts,
      onDrop: async (shift, employeeId, dateYmd) => {
        await onShiftMoved?.(shift, employeeId, dateYmd);
      },
    });

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

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-zinc-500 sm:text-xs">
        {canDragShifts ? (
          <>
            <span className="font-semibold text-zinc-700">Arrastra</span> por el asa{' '}
            <GripVertical className="inline h-3 w-3 align-middle opacity-60" aria-hidden /> entre filas (empleado) o
            columnas (día). Regla 08:00–00:00.
          </>
        ) : (
          <>Toca una celda para crear turno o el bloque para editarlo.</>
        )}
      </p>
      <div className="overflow-x-auto rounded-2xl ring-1 ring-zinc-200/90">
        <div className={`grid w-full min-w-[880px] text-left text-xs sm:text-sm ${GRID_TEMPLATE}`}>
          <div className="sticky left-0 z-30 border-b border-r border-zinc-200 bg-zinc-50 px-2 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-zinc-500 sm:px-3">
            Equipo
          </div>
          {days.map((d) => {
            const ymd = ymdLocal(d);
            return (
              <div
                key={`h-${ymd}`}
                className="border-b border-zinc-200 bg-zinc-50 px-1 py-2 text-center font-extrabold text-zinc-800 sm:px-2"
              >
                <span className="block text-[10px] uppercase text-zinc-500">{formatWeekdayShort(d)}</span>
                <span className="block text-sm">{formatDayMonth(d)}</span>
              </div>
            );
          })}
          <div className="border-b border-l border-zinc-200 bg-zinc-50 px-1 py-2 text-center text-[10px] font-extrabold uppercase text-zinc-500">
            Σ semana
          </div>

          <div className="sticky left-0 z-30 border-b border-r border-zinc-200 bg-zinc-50 px-2 py-1 text-[9px] font-bold text-zinc-400 sm:px-3">
            Hora
          </div>
          {days.map((d) => (
            <div key={`r-${ymdLocal(d)}`} className="min-w-0 border-b border-zinc-200">
              <TimelineRuler />
            </div>
          ))}
          <div className="border-b border-l border-zinc-200 bg-zinc-50" />

          {employees.map((em) => (
            <React.Fragment key={em.id}>
              <div className="sticky left-0 z-20 border-b border-r border-zinc-100 bg-white px-2 py-2 sm:px-3">
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
              </div>
              {days.map((d) => {
                const ymd = ymdLocal(d);
                const here = (shiftsByKey.get(`${em.id}|${ymd}`) ?? []).sort((a, b) =>
                  a.startTime.localeCompare(b.startTime),
                );
                const lanes = assignShiftLanes(here);
                const maxLane = lanes.length ? Math.max(...lanes.map((l) => l.lane)) : -1;
                const innerH = Math.max(52, (maxLane + 1) * LANE_H + 6);

                const isOriginCell =
                  Boolean(draggingShift) &&
                  draggingShift!.employeeId === em.id &&
                  draggingShift!.shiftDate === ymd;
                const showGhost =
                  Boolean(canDragShifts && draggingShift && hoverTarget?.employeeId === em.id && hoverTarget?.dateYmd === ymd) &&
                  !isOriginCell;

                const isHoverWhileDrag =
                  Boolean(draggingId && hoverTarget?.employeeId === em.id && hoverTarget?.dateYmd === ymd);

                return (
                  <div
                    key={ymd}
                    className={[
                      'group relative min-w-0 border-b border-zinc-100',
                      isHoverWhileDrag ? 'bg-amber-50/40' : 'bg-white',
                    ].join(' ')}
                    onDragEnter={() => onCellDragEnter(em.id, ymd)}
                    onDragOver={onCellDragOver}
                    onDrop={(e) => void onCellDrop(e, em.id, ymd)}
                  >
                    <button
                      type="button"
                      onClick={() => onCellActivate(em.id, ymd, [])}
                      className={[
                        'absolute z-20 rounded-md border border-zinc-200/80 bg-white/90 px-2 py-0.5 text-[10px] font-bold text-zinc-500 shadow-sm transition hover:bg-zinc-50 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100',
                        here.length === 0
                          ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-80 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100'
                          : 'right-1 top-1 opacity-90 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100',
                      ].join(' ')}
                    >
                      + Añadir
                    </button>
                    <div
                      role={here.length === 0 ? 'button' : undefined}
                      tabIndex={here.length === 0 ? 0 : undefined}
                      onClick={here.length === 0 ? () => onCellActivate(em.id, ymd, []) : undefined}
                      onKeyDown={
                        here.length === 0
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onCellActivate(em.id, ymd, []);
                              }
                            }
                          : undefined
                      }
                      className={[
                        'relative mx-0.5 my-1 rounded-lg border border-dashed border-zinc-200/80 bg-zinc-50/30',
                        here.length === 0 ? 'cursor-pointer' : '',
                      ].join(' ')}
                      style={{ minHeight: innerH }}
                    >
                      {lanes.map(({ shift: s, lane }) => {
                        const zStyle = s.colorHint
                          ? { bg: s.colorHint, text: '#ffffff', subtleBg: `${s.colorHint}22` }
                          : zoneBlockStyle(s.zone);
                        return (
                          <ShiftBar
                            key={s.id}
                            s={s}
                            lane={lane}
                            zStyle={zStyle}
                            canDragShifts={canDragShifts}
                            onDragStart={onDragStart}
                            onDragEnd={onDragEnd}
                            onEdit={() => onCellActivate(em.id, ymd, here.length === 1 ? [s] : here)}
                            draggingId={draggingId}
                          />
                        );
                      })}
                      {showGhost && draggingShift ? (
                        <ShiftBar
                          s={draggingShift}
                          lane={0}
                          zStyle={
                            draggingShift.colorHint
                              ? {
                                  bg: draggingShift.colorHint,
                                  text: '#ffffff',
                                  subtleBg: `${draggingShift.colorHint}22`,
                                }
                              : zoneBlockStyle(draggingShift.zone)
                          }
                          canDragShifts={false}
                          onDragStart={onDragStart}
                          onDragEnd={onDragEnd}
                          onEdit={() => {}}
                          draggingId={draggingId}
                          ghost
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <div className="border-b border-l border-zinc-100 bg-zinc-50/80 px-1 py-2 text-center align-middle">
                <span className="text-sm font-extrabold tabular-nums text-zinc-900">
                  {formatHoursSum(minutesByEmployeeWeek.get(em.id) ?? 0)}
                </span>
              </div>
            </React.Fragment>
          ))}

          <div className="sticky left-0 z-20 border-t border-r border-zinc-200 bg-zinc-100/90 px-2 py-2 text-[10px] font-extrabold uppercase text-zinc-600 sm:px-3">
            Horas / día
          </div>
          {days.map((d) => {
            const ymd = ymdLocal(d);
            const m = minutesByDay.get(ymd) ?? 0;
            return (
              <div
                key={`f-${ymd}`}
                className="border-t border-zinc-200 bg-zinc-100/90 px-1 py-2 text-center text-sm font-extrabold text-zinc-900"
              >
                {m > 0 ? formatHoursSum(m) : '—'}
              </div>
            );
          })}
          <div className="border-t border-l border-zinc-200 bg-zinc-100/90 px-2 py-2 text-center text-sm font-extrabold text-[#B91C1C]">
            {formatHoursSum([...minutesByDay.values()].reduce((a, b) => a + b, 0))}
          </div>
        </div>
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
