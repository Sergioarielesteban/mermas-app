'use client';

import React from 'react';
import { ChevronDown, ChevronRight, GripVertical, Plus } from 'lucide-react';
import { plannedShiftMinutes } from '@/lib/staff/attendance-logic';
import {
  FULL_DAY_OPERATIONAL_METRICS,
  segmentShiftVerticalOnOperationalTimeline,
  shiftIntervalClippedOnTimeline,
} from '@/lib/staff/local-operational-window';
import { groupShiftsByVisualSlot } from '@/lib/staff/shift-visual-groups';
import { zoneBlockStyle, zoneLabel } from '@/lib/staff/staff-zone-styles';
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

/** Duración tipo Skello: `8,5h` (compacto, sin espacio). */
function formatDurationSkello(mins: number): string {
  if (mins <= 0) return '0h';
  const h = mins / 60;
  if (Math.abs(h - Math.round(h)) < 0.05) return `${Math.round(h)}h`;
  return `${h.toFixed(1).replace('.', ',')}h`;
}

/** Tarjeta tipo Skello: barra de color a la izquierda, hora abajo-izq en referencia móvil; aquí fila1 hora | nombre+duración, fila2 puesto. */
function OperationalSkelloCardFace({
  nameLabel,
  zoneTitle,
  accentBg,
  startTime,
  endTime,
  endsNextDay,
  durationMins,
  showAlert,
}: {
  nameLabel: string;
  /** Etiqueta del puesto (Cocina, Barra…). */
  zoneTitle: string;
  /** Color de la barra lateral (identidad del puesto). */
  accentBg: string;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  durationMins: number;
  showAlert: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 items-stretch rounded-md bg-white">
      <div className="w-1 shrink-0 self-stretch rounded-l-md" style={{ background: accentBg }} aria-hidden />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-0.5 px-1.5 py-1 sm:px-2 sm:py-1.5">
        <div className="flex items-start justify-between gap-1.5">
          <span className="shrink-0 text-[9px] font-extrabold tabular-nums tracking-tight text-zinc-900 sm:text-[10px]">
            {shortTime(startTime)} – {shortTime(endTime)}
            {endsNextDay ? ' +1' : ''}
          </span>
          <div className="min-w-0 max-w-[60%] text-right leading-tight">
            <span className="break-words text-[8px] font-semibold text-zinc-800 sm:text-[9px]">{nameLabel}</span>
            {showAlert ? (
              <span
                className="ml-1 inline-flex h-3 w-3 align-middle items-center justify-center rounded-full bg-red-600 text-[7px] font-bold text-white"
                title="Requiere atención"
                aria-label="Aviso"
              >
                !
              </span>
            ) : null}
            <span className="ml-1 whitespace-nowrap text-[8px] font-bold tabular-nums text-zinc-500 sm:text-[9px]">
              {formatDurationSkello(durationMins)}
            </span>
          </div>
        </div>
        <p className="text-[8px] font-extrabold leading-none text-zinc-900 sm:text-[9px]">{zoneTitle}</p>
      </div>
    </div>
  );
}

function formatHoursSum(mins: number): string {
  const h = mins / 60;
  if (h < 10) return `${h.toFixed(1).replace('.', ',')} h`;
  return `${Math.round(h)} h`;
}

function zoneTitleFromRowKey(rowKey: string) {
  if (!rowKey || rowKey === '__none__') return 'Sin puesto';
  return zoneLabel(rowKey) || rowKey;
}

function assignOverlapLanesMeta(
  items: { idx: number; startM: number; endM: number }[],
): Map<number, { lane: number; laneCount: number }> {
  if (items.length === 0) return new Map();
  const sorted = [...items].sort((a, b) => a.startM - b.startM || a.endM - b.endM);
  const ends: number[] = [];
  const laneByIdx = new Map<number, number>();
  for (const it of sorted) {
    let lane = 0;
    while (lane < ends.length && ends[lane]! > it.startM + 0.5) lane++;
    if (lane === ends.length) ends.push(it.endM);
    else ends[lane] = Math.max(ends[lane]!, it.endM);
    laneByIdx.set(it.idx, lane);
  }
  const laneCount = Math.max(1, ends.length);
  const out = new Map<number, { lane: number; laneCount: number }>();
  for (const it of items) {
    out.set(it.idx, { lane: laneByIdx.get(it.idx) ?? 0, laneCount });
  }
  return out;
}

const HOUR_MARKS = [0, 4, 8, 12, 16, 20, 24] as const;
const GRID_MARKS = [4, 8, 12, 16, 20] as const;

function TimelineRuler({ widthRem }: { widthRem: number }) {
  return (
    <div
      className="relative shrink-0 border-r border-zinc-200 bg-zinc-50/90"
      style={{ width: `${widthRem}rem` }}
    >
      {HOUR_MARKS.map((h) => (
        <div
          key={h}
          className="pointer-events-none absolute left-0 right-0 flex justify-end pr-0.5"
          style={{ top: `${(h / 24) * 100}%` }}
        >
          <span className="-translate-y-1 text-[7px] font-extrabold tabular-nums text-zinc-500 sm:text-[8px]">
            {String(h).padStart(2, '0')}
          </span>
        </div>
      ))}
    </div>
  );
}

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
  expandedSlotKeys: Set<string>;
  toggleExpandedSlot: (k: string) => void;
  ignoreClicksUntilRef: React.MutableRefObject<number>;
  onDragStart: (e: React.DragEvent, shiftId: string) => void;
  onDragEnd: () => void;
  handleEmptyCellTap: (ymd: string, zk: string) => void;
  bindEmptyLongPress: (ymd: string, zk: string) => Record<string, unknown>;
  quickCreateFromButton: (e: React.MouseEvent, ymd: string, zk: string) => void;
  onShiftAdvancedEdit: (shift: StaffShift) => void;
  bindShiftLongPress: (shift: StaffShift) => Record<string, unknown>;
  onAddPersonSameSlot?: (template: StaffShift) => void;
  removeShiftFromGroup: (shift: StaffShift) => Promise<void>;
  sortGroupedItems: (items: StaffShift[]) => StaffShift[];
  onVerticalShiftPointerDown: (
    e: React.PointerEvent,
    s: StaffShift,
    iv: { clipStart: number; clipEnd: number },
  ) => void;
  onVerticalShiftPointerMove: (e: React.PointerEvent, s: StaffShift) => void;
  onVerticalShiftPointerUp: (e: React.PointerEvent, s: StaffShift) => void | Promise<void>;
};

export function OperationalSkelloCellBody({
  ymd,
  rowKey,
  here,
  canEdit,
  employees,
  selectedCell,
  selectedShiftId,
  setSelectedCell,
  setSelectedShiftId,
  expandedSlotKeys,
  toggleExpandedSlot,
  ignoreClicksUntilRef,
  onDragStart,
  onDragEnd,
  handleEmptyCellTap,
  bindEmptyLongPress,
  quickCreateFromButton,
  onShiftAdvancedEdit,
  bindShiftLongPress,
  onAddPersonSameSlot,
  removeShiftFromGroup,
  sortGroupedItems,
  onVerticalShiftPointerDown,
  onVerticalShiftPointerMove,
  onVerticalShiftPointerUp,
}: OperationalSkelloCellBodyProps) {
  const employeeName = (id: string | null) =>
    id
      ? staffDisplayName(
          employees.find((e) => e.id === id) ?? { firstName: '', lastName: '', alias: null },
        )
      : '';

  if (here.length === 0) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-0.5">
        <div className="text-center text-[8px] font-extrabold text-zinc-600 sm:text-[9px]">0 pers. · —</div>
        <div className="flex min-h-[10rem] w-full gap-0.5 sm:min-h-[11.5rem]">
          <TimelineRuler widthRem={1.2} />
          <div
            role={canEdit ? 'button' : undefined}
            tabIndex={canEdit ? 0 : undefined}
            data-vertical-track
            className={[
              'relative flex flex-1 items-center justify-center rounded-md border border-dashed px-1 transition touch-manipulation select-none',
              canEdit
                ? 'cursor-pointer border-zinc-300 bg-white hover:border-[#D32F2F]/40'
                : 'cursor-default border-zinc-100 bg-zinc-50/50',
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
                className="relative z-10 flex items-center justify-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[10px] font-extrabold text-[#D32F2F] shadow-sm hover:bg-[#D32F2F]/5 sm:text-[11px]"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => quickCreateFromButton(e, ymd, rowKey)}
              >
                <Plus className="h-3 w-3 shrink-0" strokeWidth={2.5} />
                Añadir
              </button>
            ) : (
              <span className="text-zinc-400">—</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  const groups = groupShiftsByVisualSlot(here);

  /** Una entrada por franja horaria (varias personas = una columna apilada, no carriles horizontales). */
  const groupLayout = groups
    .map((g) => {
      const rep = g.items[0]!;
      const iv = shiftIntervalClippedOnTimeline(rep, ymd, FULL_DAY_OPERATIONAL_METRICS);
      const seg =
        iv != null
          ? segmentShiftVerticalOnOperationalTimeline(rep, ymd, FULL_DAY_OPERATIONAL_METRICS)
          : null;
      if (!iv || !seg) return null;
      return { g, iv, seg, rep };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => {
      const ts = a.iv.clipStart - b.iv.clipStart;
      if (ts !== 0) return ts;
      return a.g.slotKey.localeCompare(b.g.slotKey);
    });

  const intervals = groupLayout.map((x, idx) => ({
    idx,
    startM: x.iv.clipStart,
    endM: x.iv.clipEnd,
  }));
  const laneMap = assignOverlapLanesMeta(intervals);

  let maxLanes = 1;
  for (let i = 0; i < groupLayout.length; i++) {
    maxLanes = Math.max(maxLanes, laneMap.get(i)!.laneCount);
  }
  const maxSlotTeam = Math.max(1, ...groups.map((g) => g.items.length));
  const rulerSpread = Math.min(8, Math.max(maxLanes, maxSlotTeam));
  const rulerWidthRem = Math.min(3.5, 1.05 + Math.max(0, rulerSpread - 1) * 0.34);

  const cellMins = here.reduce((a, s) => a + plannedShiftMinutes(s), 0);
  const cellPeople = new Set(here.filter((s) => s.employeeId).map((s) => s.employeeId!)).size;
  const cellUnassigned = here.filter((s) => !s.employeeId).length;
  const zStyle = zoneBlockStyle(rowKey);
  const rowZoneTitle = zoneTitleFromRowKey(rowKey);

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <div className="text-center text-[8px] font-extrabold text-zinc-800 sm:text-[9px]">
        {cellPeople} pers. · {cellMins > 0 ? formatHoursSum(cellMins) : '—'}
        {cellUnassigned > 0 ? (
          <span className="text-[#B91C1C]"> · {cellUnassigned} huecos</span>
        ) : null}
      </div>
      <div className="flex min-h-[10rem] w-full gap-1 sm:min-h-[11.5rem]">
        <TimelineRuler widthRem={rulerWidthRem} />
        <div
          data-vertical-track
          className="relative min-w-0 flex-1 overflow-hidden rounded-md border border-zinc-200 bg-gradient-to-b from-white to-zinc-50/90"
        >
          {GRID_MARKS.map((h) => (
            <div
              key={h}
              className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-zinc-200/80"
              style={{ top: `${(h / 24) * 100}%` }}
            />
          ))}
          {groupLayout.map((gl, idx) => {
            const { g, iv, seg, rep } = gl;
            const teamSize = g.items.length;
            const sortedShifts = sortGroupedItems(g.items);
            const lanes = laneMap.get(idx)!;
            const laneW = 100 / Math.max(1, lanes.laneCount);
            const gutter = 0.1;
            const left = lanes.laneCount <= 1 ? gutter : lanes.lane * laneW + gutter;
            const width = lanes.laneCount <= 1 ? 100 - 2 * gutter : laneW - 2 * gutter;
            const compositeKey = `${ymd}|${rowKey}|${g.slotKey}`;
            const expanded = expandedSlotKeys.has(compositeKey);
            const slotH = Math.max(seg.heightPct, 1.15);
            const maxBottom = 100 - seg.topPct - 0.35;
            const singleH = Math.min(maxBottom, Math.max(slotH, 3.35));
            const stackDesired = Math.max(slotH * 0.42, 2.4 + teamSize * 6.2);
            const stackH = Math.min(maxBottom, slotH, stackDesired);
            const heightPct = teamSize > 1 ? stackH : singleH;
            const zGroup = sortedShifts.some((s) => s.id === selectedShiftId) ? 6 : expanded ? 5 : 3;

            if (teamSize === 1) {
              const sOne = g.items[0]!;
              const unassigned = sOne.employeeId == null;
              const accentBg =
                sOne.colorHint && sOne.colorHint.trim().length > 0 ? sOne.colorHint.trim() : zStyle.bg;
              return (
                <div
                  key={g.slotKey}
                  className="absolute overflow-x-hidden overflow-y-auto rounded-lg shadow-md ring-1 ring-black/15"
                  style={{
                    top: `${seg.topPct}%`,
                    height: `${heightPct}%`,
                    left: `${left}%`,
                    width: `${width}%`,
                    zIndex: selectedShiftId === sOne.id ? 6 : expanded ? 5 : 3,
                  }}
                >
                  {canEdit && onAddPersonSameSlot ? (
                    <button
                      type="button"
                      className="absolute bottom-0 right-0 z-20 rounded-tl bg-white/55 px-2 py-0.5 text-[8px] font-extrabold text-zinc-900 shadow-sm hover:bg-white/70 sm:text-[9px]"
                      title="Añadir otra persona en esta misma franja y puesto"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (Date.now() < ignoreClicksUntilRef.current) return;
                        onAddPersonSameSlot(rep);
                      }}
                    >
                      + pers.
                    </button>
                  ) : null}
                  <div className="flex h-full min-h-0 w-full items-stretch">
                    {canEdit ? (
                      <div
                        draggable
                        onDragStart={(e) => onDragStart(e, sOne.id)}
                        onDragEnd={onDragEnd}
                        className="flex w-2.5 shrink-0 cursor-grab touch-none items-center justify-center border-r border-black/15 bg-black/20 text-zinc-900 active:cursor-grabbing sm:w-3"
                        title="Mover a otro día o puesto"
                        aria-label="Arrastrar turno"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GripVertical className="h-2.5 w-2.5 opacity-80 sm:h-3 sm:w-3" />
                      </div>
                    ) : null}
                    <div
                      role="button"
                      tabIndex={canEdit ? 0 : undefined}
                      className={[
                        'min-w-0 flex-1 touch-none text-left outline-none',
                        canEdit && onAddPersonSameSlot ? 'pr-1 pb-5' : '',
                      ].join(' ')}
                      onPointerDown={(e) => onVerticalShiftPointerDown(e, sOne, iv)}
                      onPointerMove={(e) => onVerticalShiftPointerMove(e, sOne)}
                      onPointerUp={(e) => void onVerticalShiftPointerUp(e, sOne)}
                      onPointerCancel={(e) => void onVerticalShiftPointerUp(e, sOne)}
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
                      <OperationalSkelloCardFace
                        nameLabel={unassigned ? 'Sin asignar' : employeeName(sOne.employeeId)}
                        zoneTitle={rowZoneTitle}
                        accentBg={accentBg}
                        startTime={sOne.startTime}
                        endTime={sOne.endTime}
                        endsNextDay={sOne.endsNextDay}
                        durationMins={plannedShiftMinutes(sOne)}
                        showAlert={unassigned}
                      />
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={g.slotKey}
                className="absolute overflow-x-hidden overflow-y-auto rounded-lg shadow-md ring-1 ring-black/15"
                style={{
                  top: `${seg.topPct}%`,
                  height: `${heightPct}%`,
                  left: `${left}%`,
                  width: `${width}%`,
                  zIndex: zGroup,
                }}
              >
                <button
                  type="button"
                  className="absolute right-0 top-0 z-20 rounded-bl bg-white/45 p-0.5 text-zinc-900 shadow-sm hover:bg-white/60"
                  title={expanded ? 'Ocultar panel inferior' : 'Abrir panel: editar / quitar'}
                  aria-expanded={expanded}
                  aria-label="Detalle del equipo"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (Date.now() < ignoreClicksUntilRef.current) return;
                    setSelectedCell(null);
                    toggleExpandedSlot(compositeKey);
                  }}
                >
                  {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </button>
                {canEdit && onAddPersonSameSlot ? (
                  <button
                    type="button"
                    className="absolute bottom-0 right-0 z-20 rounded-tl bg-white/55 px-2 py-0.5 text-[8px] font-extrabold text-zinc-900 shadow-sm hover:bg-white/70 sm:text-[9px]"
                    title="Añadir otra persona en esta misma franja y puesto"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (Date.now() < ignoreClicksUntilRef.current) return;
                      onAddPersonSameSlot(rep);
                    }}
                  >
                    + pers.
                  </button>
                ) : null}
                <div className="flex h-full min-h-0 flex-col gap-1 overflow-y-auto p-0.5 pb-6 pt-5">
                  {sortedShifts.map((sOne) => {
                    const unassigned = sOne.employeeId == null;
                    const accentBg =
                      sOne.colorHint && sOne.colorHint.trim().length > 0 ? sOne.colorHint.trim() : zStyle.bg;
                    return (
                      <div
                        key={sOne.id}
                        className={[
                          'flex min-h-0 shrink-0 items-stretch overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-zinc-200/90',
                          selectedShiftId === sOne.id ? 'ring-2 ring-zinc-900/35' : '',
                        ].join(' ')}
                      >
                        {canEdit ? (
                          <div
                            draggable
                            onDragStart={(e) => onDragStart(e, sOne.id)}
                            onDragEnd={onDragEnd}
                            className="flex w-2.5 shrink-0 cursor-grab touch-none items-center justify-center border-r border-black/15 bg-black/20 text-zinc-900 active:cursor-grabbing sm:w-3"
                            title="Mover a otro día o puesto"
                            aria-label="Arrastrar turno"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <GripVertical className="h-2.5 w-2.5 opacity-80 sm:h-3 sm:w-3" />
                          </div>
                        ) : null}
                        <div
                          role="button"
                          tabIndex={canEdit ? 0 : undefined}
                          className="min-w-0 flex-1 touch-none outline-none"
                          {...(canEdit ? bindShiftLongPress(sOne) : ({} as Record<string, never>))}
                          onPointerDown={(e) => onVerticalShiftPointerDown(e, sOne, iv)}
                          onPointerMove={(e) => onVerticalShiftPointerMove(e, sOne)}
                          onPointerUp={(e) => void onVerticalShiftPointerUp(e, sOne)}
                          onPointerCancel={(e) => void onVerticalShiftPointerUp(e, sOne)}
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
                          <OperationalSkelloCardFace
                            nameLabel={unassigned ? 'Sin asignar' : employeeName(sOne.employeeId)}
                            zoneTitle={rowZoneTitle}
                            accentBg={accentBg}
                            startTime={sOne.startTime}
                            endTime={sOne.endTime}
                            endsNextDay={sOne.endsNextDay}
                            durationMins={plannedShiftMinutes(sOne)}
                            showAlert={unassigned}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {groups
        .filter((g) => g.items.length > 1)
        .map((g) => {
          const compositeKey = `${ymd}|${rowKey}|${g.slotKey}`;
          if (!expandedSlotKeys.has(compositeKey)) return null;
          const sortedItems = sortGroupedItems(g.items);
          return (
            <div
              key={`exp-${g.slotKey}`}
              className="rounded-md border border-zinc-200 bg-zinc-50/95 shadow-sm ring-1 ring-zinc-100"
            >
              <div className="border-b border-zinc-200 bg-white px-1.5 py-1 text-[8px] font-extrabold text-zinc-600">
                Equipo ({sortedItems.length})
              </div>
              <div className="max-h-[10rem] overflow-y-auto">
                {sortedItems.map((s) => {
                  const unassigned = s.employeeId == null;
                  const smins = plannedShiftMinutes(s);
                  return (
                    <div
                      key={s.id}
                      className={[
                        'flex w-full min-w-0 items-stretch border-b border-zinc-100 last:border-b-0',
                        selectedShiftId === s.id ? 'bg-white' : '',
                      ].join(' ')}
                    >
                      {canEdit ? (
                        <div
                          draggable
                          onDragStart={(e) => onDragStart(e, s.id)}
                          onDragEnd={onDragEnd}
                          className="flex w-6 shrink-0 cursor-grab touch-none items-center justify-center border-r border-zinc-200 bg-white text-zinc-500 active:cursor-grabbing"
                          title="Arrastrar"
                          aria-label="Arrastrar turno"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <GripVertical className="h-3.5 w-3.5" />
                        </div>
                      ) : null}
                      <div
                        role="button"
                        tabIndex={canEdit ? 0 : undefined}
                        className="min-w-0 flex-1 cursor-pointer px-1 py-1 text-left outline-none sm:px-1.5"
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
                        <div
                          className={[
                            'truncate text-[10px] font-bold text-zinc-900 sm:text-[11px]',
                            unassigned ? 'text-[#B71C1C]' : '',
                          ].join(' ')}
                        >
                          {unassigned ? 'Sin asignar' : employeeName(s.employeeId)}
                        </div>
                        <div className="text-[9px] font-semibold tabular-nums text-zinc-500">
                          {formatShiftHoursLabel(smins)}
                        </div>
                      </div>
                      {canEdit ? (
                        <div className="flex shrink-0 flex-col justify-center gap-0.5 border-l border-zinc-200 bg-white px-1 py-0.5">
                          <button
                            type="button"
                            className="whitespace-nowrap rounded px-1 py-0.5 text-[8px] font-extrabold text-zinc-700 hover:bg-zinc-100 sm:text-[9px]"
                            onClick={(e) => {
                              e.stopPropagation();
                              onShiftAdvancedEdit(s);
                            }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="whitespace-nowrap rounded px-1 py-0.5 text-[8px] font-extrabold text-red-700 hover:bg-red-50 sm:text-[9px]"
                            onClick={(e) => {
                              e.stopPropagation();
                              void removeShiftFromGroup(s);
                            }}
                          >
                            Quitar
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
    </div>
  );
}
