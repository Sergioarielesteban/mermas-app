'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { plannedShiftMinutes } from '@/lib/staff/attendance-logic';
import { addDays, formatDayMonth, formatWeekdayShort, ymdLocal } from '@/lib/staff/staff-dates';
import { zoneBlockStyle, zoneLabel } from '@/lib/staff/staff-zone-styles';
import type { StaffEmployee, StaffScheduleDayMark, StaffScheduleDayMarkKind, StaffShift } from '@/lib/staff/types';
import { staffDisplayName } from '@/lib/staff/staff-supabase';
import { appAlert, appConfirm } from '@/lib/app-dialog-bridge';

/** Fila especial en cuadrante por empleado: turnos sin `employee_id`. */
export const SHIFT_GRID_UNASSIGNED_ROW_ID = '__unassigned__' as const;

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

function markLabel(kind: StaffScheduleDayMarkKind): string {
  return kind === 'holiday' ? 'Día libre' : 'Descanso';
}

function markBlockClasses(kind: StaffScheduleDayMarkKind): { box: string; sub: string } {
  if (kind === 'holiday') {
    return {
      box: 'rounded-lg border border-zinc-200/95 bg-zinc-100/95 text-zinc-700 ring-1 ring-zinc-200/80',
      sub: 'text-zinc-500',
    };
  }
  return {
    box: 'rounded-lg border border-violet-200 bg-violet-50/90 text-violet-900 ring-1 ring-violet-200/80',
    sub: 'text-violet-700',
  };
}

type Props = {
  weekStartMonday: Date;
  employees: StaffEmployee[];
  shifts: StaffShift[];
  scheduleDayMarks: StaffScheduleDayMark[];
  canManageSchedules: boolean;
  onEditShift: (s: StaffShift) => void;
  onNewShift: (employeeId: string, dateYmd: string) => void;
  onRemoveShift?: (shift: StaffShift) => void | Promise<void>;
  onCopyShiftToDays?: (template: StaffShift, targetYmds: string[]) => Promise<void>;
  onUpsertDayMark?: (employeeId: string, dateYmd: string, kind: StaffScheduleDayMarkKind) => Promise<void>;
  onRemoveDayMark?: (mark: StaffScheduleDayMark) => Promise<void>;
};

export default function ShiftWeekGrid({
  weekStartMonday,
  employees,
  shifts,
  scheduleDayMarks,
  canManageSchedules,
  onEditShift,
  onNewShift,
  onRemoveShift,
  onCopyShiftToDays,
  onUpsertDayMark,
  onRemoveDayMark,
}: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStartMonday, i));
  const weekYmds = useMemo(() => days.map((d) => ymdLocal(d)), [days]);

  const shiftsByKey = useMemo(() => {
    const m = new Map<string, StaffShift[]>();
    for (const s of shifts) {
      const emp = s.employeeId ?? SHIFT_GRID_UNASSIGNED_ROW_ID;
      const k = `${emp}|${s.shiftDate}`;
      const arr = m.get(k) ?? [];
      arr.push(s);
      m.set(k, arr);
    }
    return m;
  }, [shifts]);

  const marksByKey = useMemo(() => {
    const m = new Map<string, StaffScheduleDayMark>();
    for (const mk of scheduleDayMarks) {
      m.set(`${mk.employeeId}|${mk.markDate}`, mk);
    }
    return m;
  }, [scheduleDayMarks]);

  const hasUnassignedShifts = useMemo(() => shifts.some((s) => s.employeeId == null), [shifts]);

  const minutesByEmployeeWeek = useMemo(() => {
    const acc = new Map<string, number>();
    for (const s of shifts) {
      if (s.employeeId == null) continue;
      acc.set(s.employeeId, (acc.get(s.employeeId) ?? 0) + plannedShiftMinutes(s));
    }
    return acc;
  }, [shifts]);

  const minutesUnassignedWeek = useMemo(() => {
    let t = 0;
    for (const s of shifts) {
      if (s.employeeId == null) t += plannedShiftMinutes(s);
    }
    return t;
  }, [shifts]);

  const minutesByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shifts) {
      m.set(s.shiftDate, (m.get(s.shiftDate) ?? 0) + plannedShiftMinutes(s));
    }
    return m;
  }, [shifts]);

  const [shiftSheet, setShiftSheet] = useState<{
    shift: StaffShift;
    employeeId: string;
    ymd: string;
  } | null>(null);
  const [emptySheet, setEmptySheet] = useState<{ employeeId: string; ymd: string } | null>(null);
  const [markSheet, setMarkSheet] = useState<{
    mark: StaffScheduleDayMark;
    employeeId: string;
    ymd: string;
  } | null>(null);
  const [copySheet, setCopySheet] = useState<{
    shift: StaffShift;
    employeeId: string;
    sourceYmd: string;
  } | null>(null);
  const [copySelected, setCopySelected] = useState<Set<string>>(() => new Set());

  const tryRemoveShift = useCallback(
    async (s: StaffShift) => {
      if (!onRemoveShift) return;
      if (!(await appConfirm('¿Eliminar este turno?'))) return;
      await onRemoveShift(s);
      setShiftSheet(null);
    },
    [onRemoveShift],
  );

  const openCopyPicker = useCallback(
    (shift: StaffShift, employeeId: string, sourceYmd: string) => {
      setShiftSheet(null);
      setCopySelected(new Set());
      setCopySheet({ shift, employeeId, sourceYmd });
    },
    [],
  );

  const confirmCopy = useCallback(async () => {
    if (!copySheet || !onCopyShiftToDays) return;
    const targets = weekYmds.filter((d) => copySelected.has(d) && d !== copySheet.sourceYmd);
    if (targets.length === 0) {
      setCopySheet(null);
      return;
    }
    await onCopyShiftToDays(copySheet.shift, targets);
    setCopySheet(null);
  }, [copySheet, copySelected, onCopyShiftToDays, weekYmds]);

  const toggleCopyDay = useCallback((ymd: string) => {
    setCopySelected((prev) => {
      const next = new Set(prev);
      if (next.has(ymd)) next.delete(ymd);
      else next.add(ymd);
      return next;
    });
  }, []);

  const renderCellInner = (
    em: StaffEmployee,
    ymd: string,
    here: StaffShift[],
    rowVariant: 'normal' | 'unassigned',
  ) => {
    const dayMark = marksByKey.get(`${em.id}|${ymd}`) ?? null;
    const markInteractive =
      canManageSchedules &&
      em.active &&
      rowVariant === 'normal' &&
      onUpsertDayMark &&
      onRemoveDayMark;

    const borderCls =
      rowVariant === 'unassigned'
        ? 'min-h-[72px] w-full rounded-xl border border-dashed border-amber-200/90 bg-white/60 p-1 text-left'
        : 'min-h-[72px] w-full rounded-xl border border-dashed border-zinc-200/90 bg-zinc-50/50 p-1 text-left transition hover:border-[#D32F2F]/40 hover:bg-[#D32F2F]/5';

    if (here.length > 0) {
      return (
        <div className={borderCls}>
          <div className="flex flex-col gap-1">
            {here.map((s) => {
              const zStyle = s.colorHint
                ? { bg: s.colorHint, text: '#ffffff', subtleBg: `${s.colorHint}22` }
                : zoneBlockStyle(s.zone);
              const dur = plannedShiftMinutes(s);
              return (
                <div key={s.id} className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    className="flex min-h-[44px] w-full touch-manipulation items-stretch overflow-hidden rounded-lg shadow-sm ring-1 ring-black/8"
                    style={{ background: zStyle.subtleBg }}
                    onClick={() => {
                      if (!canManageSchedules) {
                        onEditShift(s);
                        return;
                      }
                      setShiftSheet({ shift: s, employeeId: em.id, ymd });
                    }}
                  >
                    <div
                      className="min-w-0 flex-1 px-2 py-1.5 text-left"
                      style={{ background: zStyle.bg, color: zStyle.text }}
                    >
                      <span className="block text-[10px] font-extrabold leading-tight sm:text-xs">
                        {shortTime(s.startTime)} – {shortTime(s.endTime)}
                      </span>
                      <span className="mt-0.5 block text-[9px] font-semibold opacity-95">
                        {formatDurationMin(dur)}
                        {s.zone ? ` · ${zoneLabel(s.zone)}` : ''}
                      </span>
                    </div>
                  </button>
                  {canManageSchedules && onRemoveShift ? (
                    <div className="flex justify-end px-0.5">
                      <button
                        type="button"
                        className="rounded-md py-0.5 text-[10px] font-extrabold text-red-700 hover:bg-red-50 sm:text-[11px]"
                        onClick={() => void tryRemoveShift(s)}
                      >
                        Eliminar
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {canManageSchedules ? (
              <button
                type="button"
                onClick={() => setEmptySheet({ employeeId: em.id, ymd })}
                className={[
                  'rounded-lg py-1 text-center text-[10px] font-bold hover:bg-white/80',
                  rowVariant === 'unassigned' ? 'text-amber-800' : 'text-zinc-500',
                ].join(' ')}
              >
                + Añadir
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    if (dayMark) {
      const ml = markLabel(dayMark.kind);
      const mc = markBlockClasses(dayMark.kind);
      return (
        <div className={borderCls}>
          {markInteractive ? (
            <button
              type="button"
              onClick={() => setMarkSheet({ mark: dayMark, employeeId: em.id, ymd })}
              className={`flex min-h-[56px] w-full flex-col items-center justify-center px-2 py-2 text-center touch-manipulation ${mc.box}`}
            >
              <span className="text-[11px] font-extrabold sm:text-xs">{ml}</span>
              <span className={`mt-0.5 text-[9px] font-semibold ${mc.sub}`}>Toca para quitar o cambiar</span>
            </button>
          ) : (
            <div className={`flex min-h-[56px] w-full flex-col items-center justify-center px-2 py-2 text-center ${mc.box}`}>
              <span className="text-[11px] font-extrabold sm:text-xs">{ml}</span>
            </div>
          )}
        </div>
      );
    }

    if (!canManageSchedules) {
      return (
        <div className={borderCls}>
          <div className="flex min-h-[56px] w-full items-center justify-center text-[10px] font-semibold text-zinc-300">
            —
          </div>
        </div>
      );
    }

    return (
      <div className={borderCls}>
        <button
          type="button"
          onClick={() =>
            rowVariant === 'unassigned'
              ? onNewShift(SHIFT_GRID_UNASSIGNED_ROW_ID, ymd)
              : setEmptySheet({ employeeId: em.id, ymd })
          }
          className={[
            'flex min-h-[56px] w-full items-center justify-center text-[10px] font-semibold',
            rowVariant === 'unassigned' ? 'text-amber-700/80' : 'text-zinc-400',
          ].join(' ')}
        >
          +
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-zinc-500 sm:text-xs">
        Toca un turno para <span className="font-semibold text-zinc-700">editar</span>,{' '}
        <span className="font-semibold text-zinc-700">eliminar</span> o{' '}
        <span className="font-semibold text-zinc-700">copiar a otros días</span>. En celda vacía: turno, descanso o
        día libre. Sin arrastre: la rejilla no se descuadra al deslizar.
      </p>
      <div className="touch-pan-x overflow-x-auto rounded-2xl ring-1 ring-zinc-200/90">
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
                    <td key={ymd} className="align-top border-b border-zinc-100 p-1 sm:p-1.5">
                      {renderCellInner(em, ymd, here, 'normal')}
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
            {hasUnassignedShifts ? (
              <tr key={SHIFT_GRID_UNASSIGNED_ROW_ID} className="bg-amber-50/40">
                <td className="sticky left-0 z-10 border-b border-r border-amber-200/80 bg-amber-50/90 px-2 py-2 sm:px-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-extrabold text-amber-950">Sin asignar</p>
                    <p className="truncate text-[10px] font-medium text-amber-800/90">Pendiente en cuadrante</p>
                  </div>
                </td>
                {days.map((d) => {
                  const ymd = ymdLocal(d);
                  const here = (shiftsByKey.get(`${SHIFT_GRID_UNASSIGNED_ROW_ID}|${ymd}`) ?? []).sort((a, b) =>
                    a.startTime.localeCompare(b.startTime),
                  );
                  const fakeEm: StaffEmployee = {
                    id: SHIFT_GRID_UNASSIGNED_ROW_ID,
                    localId: '',
                    userId: null,
                    firstName: '',
                    lastName: '',
                    alias: null,
                    phone: null,
                    email: null,
                    operationalRole: null,
                    weeklyHoursTarget: null,
                    workdayType: null,
                    color: null,
                    hasPin: false,
                    active: false,
                    createdAt: '',
                    updatedAt: '',
                  };
                  return (
                    <td key={ymd} className="align-top border-b border-amber-100 p-1 sm:p-1.5">
                      {renderCellInner(fakeEm, ymd, here, 'unassigned')}
                    </td>
                  );
                })}
                <td className="border-b border-l border-amber-100 bg-amber-50/80 px-2 py-2 text-center align-middle">
                  <span className="text-sm font-extrabold tabular-nums text-amber-950">
                    {formatHoursSum(minutesUnassignedWeek)}
                  </span>
                </td>
              </tr>
            ) : null}
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

      {/* Turno: acciones */}
      {shiftSheet && canManageSchedules ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 sm:items-center" role="presentation">
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl ring-1 ring-zinc-200"
            role="dialog"
            aria-modal="true"
            aria-label="Acciones del turno"
          >
            <p className="text-center text-xs font-extrabold text-zinc-500">
              {shortTime(shiftSheet.shift.startTime)} – {shortTime(shiftSheet.shift.endTime)}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                className="rounded-xl bg-zinc-900 py-3 text-sm font-extrabold text-white"
                onClick={() => {
                  onEditShift(shiftSheet.shift);
                  setShiftSheet(null);
                }}
              >
                Editar
              </button>
              {onCopyShiftToDays && shiftSheet.shift.employeeId ? (
                <button
                  type="button"
                  className="rounded-xl border border-zinc-200 py-3 text-sm font-extrabold text-zinc-900"
                  onClick={() => openCopyPicker(shiftSheet.shift, shiftSheet.employeeId, shiftSheet.ymd)}
                >
                  Copiar a otros días
                </button>
              ) : null}
              {onRemoveShift ? (
                <button
                  type="button"
                  className="rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-extrabold text-red-800"
                  onClick={() => void tryRemoveShift(shiftSheet.shift)}
                >
                  Eliminar
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-xl py-3 text-sm font-bold text-zinc-600"
                onClick={() => setShiftSheet(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Celda vacía: añadir / descanso */}
      {emptySheet && canManageSchedules ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 sm:items-center" role="presentation">
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl ring-1 ring-zinc-200"
            role="dialog"
            aria-modal="true"
          >
            <p className="text-center text-sm font-extrabold text-zinc-900">Celda vacía</p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                className="rounded-xl bg-zinc-900 py-3 text-sm font-extrabold text-white"
                onClick={() => {
                  onNewShift(emptySheet.employeeId, emptySheet.ymd);
                  setEmptySheet(null);
                }}
              >
                Añadir turno
              </button>
              {onUpsertDayMark &&
              employees.some((e) => e.id === emptySheet.employeeId && e.active) &&
              emptySheet.employeeId !== SHIFT_GRID_UNASSIGNED_ROW_ID ? (
                <>
                  <button
                    type="button"
                    className="rounded-xl border border-violet-200 bg-violet-50 py-3 text-sm font-extrabold text-violet-900"
                    onClick={() => {
                      void (async () => {
                        try {
                          await onUpsertDayMark(emptySheet.employeeId, emptySheet.ymd, 'rest');
                          setEmptySheet(null);
                        } catch (e) {
                          void appAlert(e instanceof Error ? e.message : 'No se pudo marcar descanso');
                        }
                      })();
                    }}
                  >
                    Marcar descanso
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-200 bg-zinc-100 py-3 text-sm font-extrabold text-zinc-800"
                    onClick={() => {
                      void (async () => {
                        try {
                          await onUpsertDayMark(emptySheet.employeeId, emptySheet.ymd, 'holiday');
                          setEmptySheet(null);
                        } catch (e) {
                          void appAlert(e instanceof Error ? e.message : 'No se pudo marcar día libre');
                        }
                      })();
                    }}
                  >
                    Marcar día libre
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="rounded-xl py-3 text-sm font-bold text-zinc-600"
                onClick={() => setEmptySheet(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Marca descanso / fiesta */}
      {markSheet && canManageSchedules && onRemoveDayMark && onUpsertDayMark ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 sm:items-center" role="presentation">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl ring-1 ring-zinc-200" role="dialog" aria-modal="true">
            <p
              className={[
                'text-center text-sm font-extrabold',
                markSheet.mark.kind === 'holiday' ? 'text-zinc-800' : 'text-violet-900',
              ].join(' ')}
            >
              {markLabel(markSheet.mark.kind)}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                className="rounded-xl bg-zinc-900 py-3 text-sm font-extrabold text-white"
                onClick={() => {
                  onNewShift(markSheet.employeeId, markSheet.ymd);
                  setMarkSheet(null);
                }}
              >
                Añadir turno (sustituye el marcador al guardar)
              </button>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 py-3 text-sm font-extrabold text-zinc-900"
                onClick={() => {
                  void (async () => {
                    try {
                      const other: StaffScheduleDayMarkKind =
                        markSheet.mark.kind === 'rest' ? 'holiday' : 'rest';
                      await onUpsertDayMark(markSheet.employeeId, markSheet.ymd, other);
                      setMarkSheet(null);
                    } catch (e) {
                      void appAlert(e instanceof Error ? e.message : 'No se pudo cambiar la marca');
                    }
                  })();
                }}
              >
                Cambiar a {markSheet.mark.kind === 'rest' ? 'día libre' : 'descanso'}
              </button>
              <button
                type="button"
                className="rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-extrabold text-red-800"
                onClick={() => {
                  void (async () => {
                    try {
                      await onRemoveDayMark(markSheet.mark);
                      setMarkSheet(null);
                    } catch (e) {
                      void appAlert(e instanceof Error ? e.message : 'No se pudo quitar la marca');
                    }
                  })();
                }}
              >
                Quitar marca
              </button>
              <button
                type="button"
                className="rounded-xl py-3 text-sm font-bold text-zinc-600"
                onClick={() => setMarkSheet(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Copiar a otros días */}
      {copySheet && canManageSchedules && onCopyShiftToDays ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 sm:items-center" role="presentation">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl ring-1 ring-zinc-200" role="dialog" aria-modal="true">
            <p className="text-sm font-extrabold text-zinc-900">Copiar a otros días</p>
            <p className="mt-1 text-xs text-zinc-600">Marca los días de esta semana. Si ya hay turno, te pediremos confirmación.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {days
                .map((d) => ({ d, ymd: ymdLocal(d) }))
                .filter(({ ymd }) => ymd !== copySheet.sourceYmd)
                .map(({ d, ymd }) => {
                  const sel = copySelected.has(ymd);
                  return (
                    <button
                      key={ymd}
                      type="button"
                      onClick={() => toggleCopyDay(ymd)}
                      className={[
                        'rounded-xl border py-2.5 text-xs font-extrabold',
                        sel ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-zinc-50 text-zinc-800',
                      ].join(' ')}
                    >
                      {formatWeekdayShort(d)} {formatDayMonth(d)}
                    </button>
                  );
                })}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                className="rounded-xl bg-[#D32F2F] py-3 text-sm font-extrabold text-white disabled:opacity-50"
                disabled={copySelected.size === 0}
                onClick={() => void confirmCopy()}
              >
                Copiar a {copySelected.size} día{copySelected.size !== 1 ? 's' : ''}
              </button>
              <button type="button" className="py-2 text-sm font-bold text-zinc-600" onClick={() => setCopySheet(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 text-[10px] font-semibold text-zinc-600 sm:text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-violet-200 ring-1 ring-violet-400" />
          Descanso
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-zinc-200 ring-1 ring-zinc-400" />
          Día libre
        </span>
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
