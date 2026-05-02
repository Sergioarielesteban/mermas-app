'use client';

import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Pencil, Trash2 } from 'lucide-react';
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

/** Altura fija por turno (−25% vs ~68–72px). Bloques visuales compactos y alineados a la izquierda. */
const SHIFT_CARD_ROW_H = 'h-[3.1875rem] sm:h-[3.375rem]';
const SHIFT_CARD_ROW_W = 'w-[90%] max-w-[90%]';

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
      className={`flex h-full min-h-0 w-full min-w-0 items-stretch overflow-hidden border-white/15 ${shellClassName}`}
      style={{ backgroundColor: zoneAccent, color: zoneText }}
    >
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] items-start gap-x-1.5 gap-y-0 px-1.5 py-1 sm:px-2 sm:py-1.5">
        <span
          className="line-clamp-2 min-w-0 text-[10px] font-extrabold uppercase leading-tight tracking-tight sm:text-[11px]"
          style={showAlert ? { color: '#fecaca' } : undefined}
          title={nameLabel}
        >
          {nameLabel}
          {showAlert ? (
            <span
              className="ml-1 inline-flex h-3 w-3 align-middle items-center justify-center rounded-full bg-red-600 text-[7px] font-bold text-white"
              title="Requiere atención"
              aria-label="Aviso"
            >
              !
            </span>
          ) : null}
        </span>
        <span className="row-span-2 self-center text-right text-[9px] font-black tabular-nums sm:text-[10px]">
          {hoursLabel}
        </span>
        <span className="min-w-0 text-[9px] font-bold tabular-nums opacity-95 sm:text-[10px]">
          {timeRng}
        </span>
      </div>
    </div>
  );
});

export type OperationalSkelloCellBodyProps = {
  ymd: string;
  rowKey: string;
  here: StaffShift[];
  employeeLineOrder: Map<string, number> | null;
  canEdit: boolean;
  employees: StaffEmployee[];
  selectedCell: { ymd: string; zoneKey: string } | null;
  selectedShiftId: string | null;
  setSelectedCell: (v: { ymd: string; zoneKey: string } | null) => void;
  setSelectedShiftId: (v: string | null) => void;
  ignoreClicksUntilRef: React.MutableRefObject<number>;
  dropCellId: string;
  makeDraggableShiftId: (shiftId: string) => string;
  handleEmptyCellTap: (ymd: string, zk: string) => void;
  bindEmptyLongPress: (ymd: string, zk: string) => Record<string, unknown>;
  onShiftAdvancedEdit: (shift: StaffShift) => void;
  bindShiftLongPress: (shift: StaffShift) => Record<string, unknown>;
  removeShiftFromGroup: (shift: StaffShift) => Promise<void>;
};

function OperationalSkelloCellBodyInner({
  ymd,
  rowKey,
  here,
  employeeLineOrder,
  canEdit,
  employees,
  selectedCell,
  selectedShiftId,
  setSelectedCell,
  setSelectedShiftId,
  ignoreClicksUntilRef,
  dropCellId,
  makeDraggableShiftId,
  handleEmptyCellTap,
  bindEmptyLongPress,
  onShiftAdvancedEdit,
  bindShiftLongPress,
  removeShiftFromGroup,
}: OperationalSkelloCellBodyProps) {
  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: dropCellId,
    data: { ymd, rowKey },
    disabled: !canEdit,
  });

  const employeeNameById = React.useMemo(
    () =>
      new Map(
        employees.map((employee) => [employee.id, staffDisplayName(employee)] as const),
      ),
    [employees],
  );

  const employeeName = React.useCallback(
    (id: string | null) => (id ? employeeNameById.get(id) ?? '' : ''),
    [employeeNameById],
  );

  const sortedShifts = React.useMemo(
    () =>
      [...here].sort(
        (a, b) =>
          (employeeLineOrder?.get(a.employeeId ?? '') ?? Number.MAX_SAFE_INTEGER) -
            (employeeLineOrder?.get(b.employeeId ?? '') ?? Number.MAX_SAFE_INTEGER) ||
          a.startTime.localeCompare(b.startTime) ||
          a.endTime.localeCompare(b.endTime) ||
          employeeName(a.employeeId).localeCompare(employeeName(b.employeeId), 'es', {
            sensitivity: 'base',
          }) ||
          a.id.localeCompare(b.id),
      ),
    [employeeLineOrder, here, employeeName],
  );

  if (here.length === 0) {
    return (
      <div className="flex w-full min-w-0 flex-col">
        <div
          role={canEdit ? 'button' : undefined}
          tabIndex={canEdit ? 0 : undefined}
          className={[
            `relative flex min-h-[2.8125rem] ${SHIFT_CARD_ROW_W} self-start items-center justify-center rounded-lg border border-dashed px-2 py-1.5 transition touch-manipulation select-none sm:min-h-[3rem]`,
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
            <span className="text-center text-[10px] font-semibold text-zinc-400">Vacío</span>
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

  const DraggableShiftRow = ({ shift }: { shift: StaffShift }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      isDragging,
    } = useDraggable({
      id: makeDraggableShiftId(shift.id),
      data: {
        shiftId: shift.id,
        dateYmd: ymd,
        zoneKey: rowKey,
      },
      disabled: !canEdit,
    });

    const dragStyle: React.CSSProperties = {
      transform: CSS.Translate.toString(transform),
      transition: isDragging
        ? 'none'
        : 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms cubic-bezier(0.22, 1, 0.36, 1)',
      zIndex: isDragging ? 60 : 1,
      opacity: isDragging ? 0.9 : 1,
      boxShadow: isDragging ? '0 18px 36px rgba(15, 23, 42, 0.28)' : undefined,
      willChange: isDragging ? 'transform' : undefined,
    };

    return renderShiftRow(shift, {
      setNodeRef,
      listeners,
      attributes,
      isDragging,
      dragStyle,
    });
  };

  const renderShiftRow = (
    sOne: StaffShift,
    dragBindings: {
      setNodeRef: (element: HTMLElement | null) => void;
      listeners: React.HTMLAttributes<HTMLElement> | undefined;
      attributes: React.HTMLAttributes<HTMLElement>;
      isDragging: boolean;
      dragStyle: React.CSSProperties;
    },
  ) => {
    const unassigned = sOne.employeeId == null;
    const smins = plannedShiftMinutes(sOne);

    const rowShell = (
      <div
        role="button"
        tabIndex={canEdit ? 0 : undefined}
        className={[
          'relative flex h-full min-h-0 min-w-0 flex-1 touch-pan-y touch-manipulation text-left outline-none',
          canEdit ? 'cursor-grab active:cursor-grabbing' : '',
        ].join(' ')}
        {...(canEdit ? bindShiftLongPress(sOne) : ({} as Record<string, never>))}
        {...(canEdit ? dragBindings.listeners : {})}
        {...(canEdit ? dragBindings.attributes : {})}
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
        {canEdit ? (
          <div className="absolute right-1 top-1 z-20 flex items-center gap-0.5">
            <button
              type="button"
              className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-black/18 text-white/90 transition hover:bg-black/28"
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                onShiftAdvancedEdit(sOne);
              }}
              aria-label="Editar turno"
              title="Editar"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-black/18 text-white/90 transition hover:bg-red-700/80"
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                void removeShiftFromGroup(sOne);
              }}
              aria-label="Eliminar turno"
              title="Eliminar"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ) : null}
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
              ? 'rounded-lg border shadow-sm ring-1 ring-black/10'
              : 'rounded-lg border border-white/20 shadow-sm ring-1 ring-black/[0.06]'
          }
        />
      </div>
    );

    return (
      <div key={sOne.id} className={`flex min-w-0 flex-col gap-0.5 ${SHIFT_CARD_ROW_W} self-start`}>
        <div
          ref={dragBindings.setNodeRef}
          style={dragBindings.dragStyle}
          className={[
            `flex w-full max-w-full min-w-0 shrink-0 flex-row items-stretch overflow-hidden rounded-lg ${SHIFT_CARD_ROW_H}`,
            dragBindings.isDragging ? 'scale-[1.03]' : '',
            selectedShiftId === sOne.id ? 'ring-2 ring-zinc-900/45 ring-offset-0' : '',
          ].join(' ')}
        >
          <div className={`flex w-full min-w-0 ${SHIFT_CARD_ROW_H}`}>{rowShell}</div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={setDropNodeRef}
      className={[
        'flex w-full min-w-0 flex-col gap-1 transition-colors duration-150',
        isOver && canEdit ? 'bg-zinc-100/55' : '',
      ].join(' ')}
    >
      {summaryBits.length > 0 ? (
        <div
          className={`flex ${SHIFT_CARD_ROW_W} self-start flex-wrap items-center justify-start gap-x-1.5 gap-y-0 text-left text-[8px] font-extrabold text-zinc-800 sm:text-[9px]`}
        >
          {summaryBits.map((node, i) => (
            <React.Fragment key={i}>
              {i > 0 ? <span className="text-zinc-300">·</span> : null}
              {node}
            </React.Fragment>
          ))}
        </div>
      ) : null}
      <div className="flex w-full min-w-0 flex-col gap-1 overflow-visible">
        {sortedShifts.map((shift) => (
          <DraggableShiftRow key={shift.id} shift={shift} />
        ))}
      </div>
    </div>
  );
}

export const OperationalSkelloCellBody = React.memo(OperationalSkelloCellBodyInner);
