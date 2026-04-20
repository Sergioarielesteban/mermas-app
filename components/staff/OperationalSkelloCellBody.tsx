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

  const ruler = (
    <div className="relative w-6 shrink-0 border-r border-zinc-200 bg-zinc-50/90 sm:w-7">
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

  if (here.length === 0) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-0.5">
        <div className="text-center text-[8px] font-extrabold text-zinc-600 sm:text-[9px]">0 pers. · —</div>
        <div className="flex min-h-[13rem] w-full gap-0.5 sm:min-h-[16rem]">
          {ruler}
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
  const blockMeta = groups
    .map((g, idx) => {
      const rep = g.items[0]!;
      const iv = shiftIntervalClippedOnTimeline(rep, ymd, FULL_DAY_OPERATIONAL_METRICS);
      const seg = iv
        ? segmentShiftVerticalOnOperationalTimeline(rep, ymd, FULL_DAY_OPERATIONAL_METRICS)
        : null;
      if (!iv || !seg) return null;
      return { g, idx, iv, seg, rep };
    })
    .filter((x) => x != null);

  const intervals = blockMeta.map((b) => ({
    idx: b!.idx,
    startM: b!.iv.clipStart,
    endM: b!.iv.clipEnd,
  }));
  const laneMap = assignOverlapLanesMeta(intervals);

  const cellMins = here.reduce((a, s) => a + plannedShiftMinutes(s), 0);
  const cellPeople = new Set(here.filter((s) => s.employeeId).map((s) => s.employeeId!)).size;
  const cellUnassigned = here.filter((s) => !s.employeeId).length;
  const zStyle = zoneBlockStyle(rowKey);

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <div className="text-center text-[8px] font-extrabold text-zinc-800 sm:text-[9px]">
        {cellPeople} pers. · {cellMins > 0 ? formatHoursSum(cellMins) : '—'}
        {cellUnassigned > 0 ? (
          <span className="text-[#B91C1C]"> · {cellUnassigned} huecos</span>
        ) : null}
      </div>
      <div className="flex min-h-[13rem] w-full gap-0.5 sm:min-h-[16rem]">
        {ruler}
        <div
          data-vertical-track
          className="relative flex-1 overflow-hidden rounded-md border border-zinc-200 bg-gradient-to-b from-white to-zinc-50/90"
        >
          {GRID_MARKS.map((h) => (
            <div
              key={h}
              className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-zinc-200/80"
              style={{ top: `${(h / 24) * 100}%` }}
            />
          ))}
          {blockMeta.map((b) => {
            if (!b) return null;
            const { g, idx, iv, seg, rep } = b;
            const lanes = laneMap.get(idx)!;
            const laneW = 100 / Math.max(1, lanes.laneCount);
            const left = lanes.laneCount <= 1 ? 1 : lanes.lane * laneW + 0.25;
            const width = lanes.laneCount <= 1 ? 98 : laneW - 0.5;
            const compositeKey = `${ymd}|${rowKey}|${g.slotKey}`;
            const expanded = expandedSlotKeys.has(compositeKey);
            const isSingle = g.items.length === 1;
            const sOne = isSingle ? g.items[0]! : null;

            if (isSingle && sOne) {
              const unassigned = sOne.employeeId == null;
              return (
                <div
                  key={g.slotKey}
                  className="absolute overflow-hidden rounded-md shadow-md ring-1 ring-black/10"
                  style={{
                    top: `${seg.topPct}%`,
                    height: `${Math.max(seg.heightPct, 4)}%`,
                    left: `${left}%`,
                    width: `${width}%`,
                    zIndex: selectedShiftId === sOne.id ? 5 : 3,
                  }}
                >
                  <div className="flex h-full min-h-0 w-full items-stretch">
                    {canEdit ? (
                      <div
                        draggable
                        onDragStart={(e) => onDragStart(e, sOne.id)}
                        onDragEnd={onDragEnd}
                        className="flex w-5 shrink-0 cursor-grab touch-none items-center justify-center border-r border-white/25 bg-black/15 text-white/90 active:cursor-grabbing"
                        title="Mover a otro día o puesto"
                        aria-label="Arrastrar turno"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GripVertical className="h-3 w-3" />
                      </div>
                    ) : null}
                    <div
                      role="button"
                      tabIndex={canEdit ? 0 : undefined}
                      className="min-w-0 flex-1 touch-none px-0.5 py-0.5 text-left outline-none"
                      style={{ background: zStyle.bg, color: zStyle.text }}
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
                      <div
                        className={[
                          'truncate text-[8px] font-extrabold leading-tight sm:text-[9px]',
                          unassigned ? 'opacity-95' : '',
                        ].join(' ')}
                      >
                        {unassigned ? 'Sin asignar' : employeeName(sOne.employeeId)}
                      </div>
                      <div className="truncate text-[7px] font-semibold tabular-nums opacity-95 sm:text-[8px]">
                        {shortTime(sOne.startTime)}–{shortTime(sOne.endTime)}
                        {sOne.endsNextDay ? ' +1' : ''}
                      </div>
                      <div className="text-[7px] font-bold opacity-90 sm:text-[8px]">
                        {formatShiftHoursLabel(plannedShiftMinutes(sOne))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            const n = g.items.length;
            const nUnassigned = g.items.filter((x) => x.employeeId == null).length;
            return (
                <button
                  key={g.slotKey}
                  type="button"
                  className="absolute overflow-hidden rounded-md text-left shadow-md ring-1 ring-black/15 transition hover:brightness-95"
                  style={{
                    top: `${seg.topPct}%`,
                    height: `${Math.max(seg.heightPct, 4)}%`,
                    left: `${left}%`,
                    width: `${width}%`,
                    zIndex: expanded ? 4 : 2,
                    background: zStyle.bg,
                    color: zStyle.text,
                  }}
                  {...(canEdit ? bindShiftLongPress(rep) : ({} as Record<string, never>))}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (Date.now() < ignoreClicksUntilRef.current) return;
                    setSelectedCell(null);
                    toggleExpandedSlot(compositeKey);
                  }}
                >
                  <div className="flex h-full flex-col justify-center px-0.5">
                    <div className="flex items-start gap-0.5">
                      <span className="shrink-0 opacity-80" aria-hidden>
                        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[8px] font-extrabold leading-tight sm:text-[9px]">
                          {shortTime(rep.startTime)}–{shortTime(rep.endTime)}
                          {rep.endsNextDay ? ' +1' : ''}
                        </div>
                        <div className="text-[8px] font-bold">
                          {n} pers.{nUnassigned > 0 ? ` · ${nUnassigned} hueco` : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                  {canEdit && onAddPersonSameSlot ? (
                    <span
                      className="absolute bottom-0 right-0 rounded-tl bg-black/25 px-1 py-0.5 text-[7px] font-extrabold text-white"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (Date.now() < ignoreClicksUntilRef.current) return;
                        onAddPersonSameSlot(rep);
                      }}
                      role="presentation"
                    >
                      + pers.
                    </span>
                  ) : null}
                </button>
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
