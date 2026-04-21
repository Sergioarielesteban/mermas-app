'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { OperationalSkelloCellBody } from '@/components/staff/OperationalSkelloCellBody';
import { plannedShiftMinutes } from '@/lib/staff/attendance-logic';
import { addDays, formatDayMonth, formatWeekdayShort, ymdLocal } from '@/lib/staff/staff-dates';
import { zoneBlockStyle, zoneLabel } from '@/lib/staff/staff-zone-styles';
import {
  computeOperationalTimelineMetrics,
  operationalFranjaOperativaBanner,
  type LocalOperationalWindow,
} from '@/lib/staff/local-operational-window';
import type { CustomOperationalZoneRow } from '@/lib/staff/operational-custom-zones';
import { STAFF_ZONE_PRESETS, type StaffEmployee, type StaffShift } from '@/lib/staff/types';
export const OPERATIONAL_NONE_ZONE = '__none__' as const;

/** Cobertura en cabecera (puestos que deben tener turno). */
const COVERAGE_MAIN_ZONES = ['cocina', 'barra', 'sala'] as const;
/** Orden fijo tipo Skello: cocina, barra, sala, cocina central. */
const DISPLAY_ZONE_ORDER = ['cocina', 'barra', 'sala', 'cocina_central'] as const;

const LONG_PRESS_MS_EMPTY = 820;
const LONG_PRESS_MS_SHIFT = 820;
const DOUBLE_TAP_MS = 500;

function formatHoursSum(mins: number): string {
  const h = mins / 60;
  if (h < 10) return `${h.toFixed(1).replace('.', ',')} h`;
  return `${Math.round(h)} h`;
}

function shiftZoneKey(s: StaffShift): string {
  const z = (s.zone ?? '').trim().toLowerCase();
  return z || OPERATIONAL_NONE_ZONE;
}

function buildZoneRows(
  shifts: StaffShift[],
  customZones: CustomOperationalZoneRow[],
): { key: string; label: string }[] {
  const seen = new Set<string>();
  const rows: { key: string; label: string }[] = [];
  for (const k of DISPLAY_ZONE_ORDER) {
    rows.push({ key: k, label: zoneLabel(k) });
    seen.add(k);
  }
  for (const cz of customZones) {
    const k = cz.key.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    rows.push({ key: k, label: cz.label });
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

type Coverage = 'ok' | 'warn' | 'bad';

function dayCoverage(ymd: string, shifts: StaffShift[]): Coverage {
  const day = shifts.filter((s) => s.shiftDate === ymd);
  let bad = false;
  let warn = false;
  for (const z of COVERAGE_MAIN_ZONES) {
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
  if (c === 'ok') return 'bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200/90';
  if (c === 'warn') return 'bg-zinc-200/90 text-zinc-900 ring-1 ring-zinc-300/80';
  return 'bg-red-50 text-red-950 ring-1 ring-red-200/90';
}

export type OperationalWeekGridProps = {
  weekStartMonday: Date;
  employees: StaffEmployee[];
  shifts: StaffShift[];
  operationalWindow: LocalOperationalWindow;
  customOperationalZones: CustomOperationalZoneRow[];
  onAddOperationalZone: () => void;
  canEdit: boolean;
  onShiftPlaced: (shift: StaffShift, newDateYmd: string, zoneRowKey: string) => Promise<void>;
  onQuickCreateShift: (dateYmd: string, zoneRowKey: string) => Promise<void>;
  onEmptyLongPress: (dateYmd: string, zoneRowKey: string) => void;
  onShiftAdvancedEdit: (shift: StaffShift) => void;
  /** Nuevo turno con la misma franja y puesto (bloque agrupado). */
  onAddPersonSameSlot?: (template: StaffShift) => void;
  /** Eliminar un turno del cuadrante (tras confirmación en UI). */
  onRemoveShift?: (shift: StaffShift) => Promise<void>;
};

export default function OperationalWeekGrid({
  weekStartMonday,
  employees,
  shifts,
  operationalWindow,
  customOperationalZones,
  onAddOperationalZone,
  canEdit,
  onShiftPlaced,
  onQuickCreateShift,
  onEmptyLongPress,
  onShiftAdvancedEdit,
  onAddPersonSameSlot,
  onRemoveShift,
}: OperationalWeekGridProps) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStartMonday, i)), [weekStartMonday]);
  const zoneRows = useMemo(
    () => buildZoneRows(shifts, customOperationalZones),
    [shifts, customOperationalZones],
  );
  const operationalMetrics = useMemo(
    () => computeOperationalTimelineMetrics(operationalWindow),
    [operationalWindow],
  );
  const franjaBanner = useMemo(
    () => operationalFranjaOperativaBanner(operationalWindow, operationalMetrics),
    [operationalWindow, operationalMetrics],
  );
  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ ymd: string; zoneKey: string } | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);

  const ignoreClicksUntilRef = useRef(0);
  const emptyLongPressTimerRef = useRef<number | null>(null);
  const shiftLongPressTimerRef = useRef<number | null>(null);
  const lastEmptyTapRef = useRef<{ key: string; t: number }>({ key: '', t: 0 });

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
      if (lastEmptyTapRef.current.key === key && now - lastEmptyTapRef.current.t < DOUBLE_TAP_MS) {
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

  const removeShiftFromGroup = useCallback(
    async (s: StaffShift) => {
      if (!onRemoveShift) return;
      await onRemoveShift(s);
    },
    [onRemoveShift],
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
    const m = new Map<
      string,
      { people: number; minutes: number; byZone: Map<string, { people: number; minutes: number }> }
    >();
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
      gridWrapRef.current?.classList.add('operational-week-grid--drop-target');
      e.dataTransfer.setData('text/staff-shift-id', shiftId);
      e.dataTransfer.setData('text/plain', shiftId);
      e.dataTransfer.effectAllowed = 'move';
    },
    [canEdit],
  );

  const onDragEnd = useCallback(() => {
    gridWrapRef.current?.classList.remove('operational-week-grid--drop-target');
  }, []);

  const onCellDrop = useCallback(
    async (e: React.DragEvent, dateYmd: string, zoneRowKey: string) => {
      if (!canEdit) return;
      e.preventDefault();
      gridWrapRef.current?.classList.remove('operational-week-grid--drop-target');
      const id =
        e.dataTransfer.getData('text/staff-shift-id') || e.dataTransfer.getData('text/plain');
      if (!id) return;
      const shift = shifts.find((s) => s.id === id);
      if (!shift) return;
      const currentKey = shiftZoneKey(shift);
      if (shift.shiftDate === dateYmd && currentKey === zoneRowKey) return;
      await onShiftPlaced(shift, dateYmd, zoneRowKey);
    },
    [canEdit, onShiftPlaced, shifts],
  );

  /** Solo puestos con datos reales; sin “C 0·0h” ni ruido. */
  const zoneSummaryLine = (ymd: string): string | null => {
    const st = statsByDay.get(ymd);
    if (!st) return null;
    const parts: string[] = [];
    for (const z of COVERAGE_MAIN_ZONES) {
      const row = st.byZone.get(z);
      if (!row || (row.people === 0 && row.minutes === 0)) continue;
      parts.push(`${z[0]!.toUpperCase()} ${row.people}·${formatHoursSum(row.minutes)}`);
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  };

  return (
    <div className="space-y-2">
      {canEdit ? (
        <p className="text-[10px] text-zinc-500 sm:text-[11px]">
          Vista por puesto: turnos en lista vertical por día (sin solapamiento). Asa izquierda = arrastrar a otro día o
          puesto · toque largo = edición avanzada · «+ pers.» = misma franja · «Añadir» / doble toque en vacío = turno
          rápido. {franjaBanner}
        </p>
      ) : (
        <p className="text-[10px] text-zinc-500 sm:text-[11px]">{franjaBanner}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <button
            type="button"
            onClick={() => onAddOperationalZone()}
            className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-[10px] font-bold text-zinc-800 shadow-sm hover:border-[#D32F2F]/40 hover:bg-zinc-50 sm:text-xs"
          >
            + Puesto
          </button>
        ) : null}
      </div>

      <div ref={gridWrapRef} className="overflow-x-auto rounded-2xl ring-1 ring-zinc-200/90">
        <table className="w-full min-w-[2520px] border-collapse text-left text-[10px] sm:min-w-[2790px] sm:text-xs">
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
                      'min-w-[21rem] border-b border-zinc-200 px-0.5 py-1.5 text-center font-extrabold sm:min-w-[24.75rem] sm:px-1',
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
                <td className="sticky left-0 z-10 border-b border-r border-zinc-100 bg-white px-1.5 py-1 align-top sm:px-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                      style={{ background: zoneBlockStyle(row.key).bg }}
                      aria-hidden
                    />
                    <span className="font-bold text-zinc-900">{row.label}</span>
                  </div>
                </td>
                {days.map((d) => {
                  const ymd = ymdLocal(d);
                  const here = shiftsByDayZone.get(`${ymd}|${row.key}`) ?? [];
                  return (
                    <td
                      key={ymd}
                      className="align-top border-b border-zinc-100 p-0.5 sm:p-1"
                      onDragOver={
                        canEdit
                          ? (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = 'move';
                            }
                          : undefined
                      }
                      onDragEnter={
                        canEdit
                          ? (e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                            }
                          : undefined
                      }
                      onDrop={canEdit ? (e) => void onCellDrop(e, ymd, row.key) : undefined}
                    >
                      <OperationalSkelloCellBody
                        ymd={ymd}
                        rowKey={row.key}
                        here={here}
                        canEdit={canEdit}
                        employees={employees}
                        selectedCell={selectedCell}
                        selectedShiftId={selectedShiftId}
                        setSelectedCell={setSelectedCell}
                        setSelectedShiftId={setSelectedShiftId}
                        ignoreClicksUntilRef={ignoreClicksUntilRef}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        handleEmptyCellTap={handleEmptyCellTap}
                        bindEmptyLongPress={bindEmptyLongPress}
                        quickCreateFromButton={quickCreateFromButton}
                        onShiftAdvancedEdit={onShiftAdvancedEdit}
                        bindShiftLongPress={bindShiftLongPress}
                        onAddPersonSameSlot={onAddPersonSameSlot}
                        removeShiftFromGroup={removeShiftFromGroup}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-zinc-50/90">
              <td className="sticky left-0 z-10 border-t border-r border-zinc-200 px-1.5 py-2 text-[9px] font-extrabold uppercase text-zinc-600 sm:px-2 sm:text-[10px]">
                Resumen
              </td>
              {days.map((d) => {
                const ymd = ymdLocal(d);
                const st = statsByDay.get(ymd) ?? { people: 0, minutes: 0, byZone: new Map() };
                const zoneLine = zoneSummaryLine(ymd);
                const hasDay = st.people > 0 || st.minutes > 0;
                return (
                  <td
                    key={ymd}
                    className="border-t border-zinc-200 px-0.5 py-2 text-center align-top sm:px-1"
                  >
                    {hasDay ? (
                      <>
                        {st.people > 0 ? (
                          <div className="text-[10px] font-extrabold tabular-nums text-zinc-900 sm:text-xs">
                            {st.people} pers.
                          </div>
                        ) : null}
                        {st.minutes > 0 ? (
                          <div className="text-[9px] font-bold tabular-nums text-zinc-600 sm:text-[10px]">
                            {formatHoursSum(st.minutes)}
                          </div>
                        ) : null}
                        {zoneLine ? (
                          <div className="mx-auto mt-1 max-w-[6.5rem] text-[8px] font-semibold leading-snug text-zinc-500 sm:max-w-none sm:text-[9px]">
                            {zoneLine}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-[9px] font-semibold text-zinc-400 sm:text-[10px]">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[9px] text-zinc-500 sm:text-[10px]">
        Cobertura: gris = ok · gris más marcado = turno sin asignar en algún puesto principal · rojo = falta puesto
        principal.
      </p>
    </div>
  );
}
