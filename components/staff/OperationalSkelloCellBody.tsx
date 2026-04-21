'use client';

import React from 'react';
import { GripVertical, Plus } from 'lucide-react';
import { plannedShiftMinutes } from '@/lib/staff/attendance-logic';
import { zoneBlockStyle } from '@/lib/staff/staff-zone-styles';
import type { StaffEmployee, StaffShift } from '@/lib/staff/types';
import { staffDisplayName } from '@/lib/staff/staff-supabase';

function shortTime(t: string) {
  const [h, m] = t.split(':');
  return `${h}:${m ?? '00'}`;
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

/** Altura fija por turno (~68–72px). Padding horizontal ligeramente reducido solo dentro de la tarjeta. */
const SHIFT_CARD_ROW_H = 'h-[4.25rem] sm:h-[4.5rem]';

/**
 * Tarjeta compacta: horario | persona | horas totales.
 * Relleno uniforme con el color del puesto (mismo tono que la leyenda); texto legible vía zoneText.
 */
const ShiftEmployeeRowCard = React.memo(function ShiftEmployeeRowCard({
  nameLabel,
  hoursLabel,
  zoneAccent,
  zoneText,
  startTime,
  endTime,
  endsNextDay,
  showAlert,
  shellClassName = 'rounded-lg border border-solid shadow-sm',
}: {
  nameLabel: string;
  hoursLabel: string;
  /** Color sólido del puesto (fondo completo de la tarjeta). */
  zoneAccent: string;
  /** Color de texto sobre el fondo del puesto. */
  zoneText: string;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  showAlert: boolean;
  shellClassName?: string;
}) {
  const timeRng = (
    <>
      {shortTime(startTime)}–{shortTime(endTime)}
      {endsNextDay ? ' +1' : ''}
    </>
  );

  return (
    <div
      className={`flex w-full min-w-0 shrink-0 items-stretch overflow-hidden border-white/20 ${SHIFT_CARD_ROW_H} ${shellClassName}`}
      style={{ backgroundColor: zoneAccent, color: zoneText }}
    >
      <div className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1.5 gap-y-0 px-1 py-0 sm:gap-x-2 sm:px-1.5">
        <span className="shrink-0 text-[10px] font-extrabold tabular-nums tracking-tight sm:text-[11px]">
          {timeRng}
        </span>
        <span
          className="line-clamp-2 min-w-0 text-[11px] font-bold leading-snug sm:text-xs"
          style={showAlert ? { color: '#fecaca' } : undefined}
          title={nameLabel}
        >
          {nameLabel}
          {showAlert ? (
            <span
              className="ml-1 inline-flex h-3.5 w-3.5 align-middle items-center justify-center rounded-full bg-red-600 text-[8px] font-bold text-white"
              title="Requiere atención"
              aria-label="Aviso"
            >
              !
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-right text-[10px] font-extrabold opacity-95 sm:text-[11px]">{hoursLabel}</span>
      </div>
    </div>
  );
});

export type OperationalSkelloCellBodyProps = {
  ymd: string;
  rowKey: string;
  here: StaffShift[];
  canEdit: boolean;
  employees: StaffEmployee[];
  selectedCell: { ymd: string; zoneKey: string } | null;
  selectedShiftId: string | null;
  setSelectedCell: (v: { ymd: string; zoneKey: string } | null) => void;
  setSelectedShiftId: (v: string | null) => void;
  ignoreClicksUntilRef: React.MutableRefObject<number>;
  onDragStart: (e: React.DragEvent, shiftId: string) => void;
  onDragEnd: () => void;
  handleEmptyCellTap: (ymd: string, zk: string) => void;
  bindEmptyLongPress: (ymd: string, zk: string) => Record<string, unknown>;
  quickCreateFromButton: (e: React.MouseEvent, ymd: string, zk: string) => void;
  onShiftAdvancedEdit: (shift: StaffShift) => void;
  bindShiftLongPress: (shift: StaffShift) => Record<string, unknown>;
  removeShiftFromGroup: (shift: StaffShift) => Promise<void>;
};

function OperationalSkelloCellBodyInner({
  ymd,
  rowKey,
  here,
  canEdit,
  employees,
  selectedCell,
  selectedShiftId,
  setSelectedCell,
  setSelectedShiftId,
  ignoreClicksUntilRef,
  onDragStart,
  onDragEnd,
  handleEmptyCellTap,
  bindEmptyLongPress,
  quickCreateFromButton,
  onShiftAdvancedEdit,
  bindShiftLongPress,
  removeShiftFromGroup,
}: OperationalSkelloCellBodyProps) {
  const employeeName = (id: string | null) =>
    id
      ? staffDisplayName(
          employees.find((e) => e.id === id) ?? { firstName: '', lastName: '', alias: null },
        )
      : '';

  const sortedShifts = React.useMemo(
    () =>
      [...here].sort(
        (a, b) =>
          a.startTime.localeCompare(b.startTime) ||
          a.endTime.localeCompare(b.endTime) ||
          a.id.localeCompare(b.id),
      ),
    [here],
  );

  if (here.length === 0) {
    return (
      <div className="flex w-full min-w-0 flex-col">
        <div
          role={canEdit ? 'button' : undefined}
          tabIndex={canEdit ? 0 : undefined}
          className={[
            'relative flex min-h-[3.75rem] w-full items-center justify-center rounded-lg border border-dashed px-2 py-2 transition touch-manipulation select-none sm:min-h-[4rem]',
            canEdit
              ? 'cursor-pointer border-zinc-300 bg-zinc-50/40 hover:border-[#D32F2F]/45 hover:bg-white'
              : 'cursor-default border-zinc-100 bg-zinc-50/30',
            selectedCell?.ymd === ymd && selectedCell?.zoneKey === rowKey
              ? 'ring-1 ring-zinc-900 ring-offset-1'
              : '',
            !canEdit ? 'opacity-60' : '',
          ].join(' ')}
          onClick={() => handleEmptyCellTap(ymd, rowKey)}
          onKeyDown={(e) => {
            if (!canEdit) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleEmptyCellTap(ymd, rowKey);
            }
          }}
          {...(canEdit ? bindEmptyLongPress(ymd, rowKey) : ({} as Record<string, never>))}
        >
          {canEdit ? (
            <button
              type="button"
              className="relative z-10 inline-flex items-center justify-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[11px] font-extrabold text-[#D32F2F] shadow-sm hover:bg-[#D32F2F]/5 sm:text-xs"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => quickCreateFromButton(e, ymd, rowKey)}
            >
              <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
              Añadir
            </button>
          ) : (
            <span className="text-[10px] font-semibold text-zinc-400">Sin turnos</span>
          )}
        </div>
      </div>
    );
  }

  const cellMins = here.reduce((a, s) => a + plannedShiftMinutes(s), 0);
  const cellPeople = new Set(here.filter((s) => s.employeeId).map((s) => s.employeeId!)).size;
  const cellUnassigned = here.filter((s) => !s.employeeId).length;
  const zStyle = zoneBlockStyle(rowKey);

  const summaryBits: React.ReactNode[] = [];
  if (cellPeople > 0) summaryBits.push(<span key="p">{cellPeople} pers.</span>);
  if (cellMins > 0) summaryBits.push(<span key="h">{formatHoursSum(cellMins)}</span>);
  if (cellUnassigned > 0) {
    summaryBits.push(
      <span key="u" className="text-[#B91C1C]">
        {cellUnassigned} hueco{cellUnassigned > 1 ? 's' : ''}
      </span>,
    );
  }

  const renderShiftRow = (sOne: StaffShift) => {
    const unassigned = sOne.employeeId == null;
    const smins = plannedShiftMinutes(sOne);

    const rowShell = (
      <div
        role="button"
        tabIndex={canEdit ? 0 : undefined}
        className="min-w-0 flex-1 touch-manipulation text-left outline-none"
        {...(canEdit ? bindShiftLongPress(sOne) : ({} as Record<string, never>))}
        onClick={(e) => {
          e.stopPropagation();
          if (Date.now() < ignoreClicksUntilRef.current) return;
          setSelectedShiftId(sOne.id);
          setSelectedCell(null);
        }}
        onKeyDown={(e) => {
          if (!canEdit) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onShiftAdvancedEdit(sOne);
          }
        }}
      >
        <ShiftEmployeeRowCard
          nameLabel={unassigned ? 'Sin asignar' : employeeName(sOne.employeeId)}
          hoursLabel={formatShiftHoursLabel(smins)}
          zoneAccent={zStyle.bg}
          zoneText={zStyle.text}
          startTime={sOne.startTime}
          endTime={sOne.endTime}
          endsNextDay={sOne.endsNextDay}
          showAlert={unassigned}
          shellClassName={
            canEdit
              ? 'rounded-r-lg border-y border-r shadow-sm'
              : 'rounded-lg border border-white/20 shadow-sm ring-1 ring-black/[0.06]'
          }
        />
      </div>
    );

    return (
      <div key={sOne.id} className="flex min-w-0 w-full max-w-full flex-col gap-1">
        <div
          className={[
            'flex w-full max-w-full min-w-0 shrink-0 flex-row items-stretch overflow-hidden rounded-lg',
            selectedShiftId === sOne.id ? 'ring-2 ring-zinc-900/45 ring-offset-0' : '',
          ].join(' ')}
        >
          {canEdit ? (
            <>
              <div
                className="flex w-10 shrink-0 flex-col items-center self-stretch rounded-l-lg border-y border-l border-zinc-200/90 bg-zinc-100 px-0.5 py-1.5"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="mb-2 shrink-0 rounded px-0.5 py-0.5 text-[7px] font-extrabold leading-tight text-red-700 hover:bg-red-100/90 sm:text-[8px]"
                  onClick={(e) => {
                    e.stopPropagation();
                    void removeShiftFromGroup(sOne);
                  }}
                >
                  Quitar
                </button>
                <div
                  draggable
                  onDragStart={(e) => onDragStart(e, sOne.id)}
                  onDragEnd={onDragEnd}
                  className="flex min-h-[1.35rem] flex-1 w-full cursor-grab touch-none items-center justify-center text-zinc-800 active:cursor-grabbing"
                  title="Mover a otro día o puesto"
                  aria-label="Arrastrar turno"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical className="h-2.5 w-2.5 opacity-80 sm:h-3 sm:w-3" />
                </div>
                <button
                  type="button"
                  className="mt-2 shrink-0 rounded px-0.5 py-0.5 text-[7px] font-extrabold leading-tight text-zinc-700 underline decoration-zinc-300/90 hover:bg-zinc-200/80 sm:text-[8px]"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShiftAdvancedEdit(sOne);
                  }}
                >
                  Editar
                </button>
              </div>
              {rowShell}
            </>
          ) : (
            rowShell
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      {summaryBits.length > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0 text-center text-[8px] font-extrabold text-zinc-800 sm:text-[9px]">
          {summaryBits.map((node, i) => (
            <React.Fragment key={i}>
              {i > 0 ? <span className="text-zinc-300">·</span> : null}
              {node}
            </React.Fragment>
          ))}
        </div>
      ) : null}
      <div className="max-h-[min(40vh,20rem)] overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col gap-2">{sortedShifts.map(renderShiftRow)}</div>
      </div>
      {canEdit ? (
        <button
          type="button"
          className="flex w-full touch-manipulation items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 py-2 text-[10px] font-extrabold text-[#D32F2F] hover:border-[#D32F2F]/40 hover:bg-white sm:text-[11px]"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => quickCreateFromButton(e, ymd, rowKey)}
        >
          <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
          Añadir turno
        </button>
      ) : null}
    </div>
  );
}

export const OperationalSkelloCellBody = React.memo(OperationalSkelloCellBodyInner);
