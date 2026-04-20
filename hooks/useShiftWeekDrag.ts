'use client';

import { useCallback, useState } from 'react';
import type { StaffShift } from '@/lib/staff/types';

export type ShiftDragHover = {
  employeeId: string;
  dateYmd: string;
} | null;

export type UseShiftWeekDragOptions = {
  canDrag: boolean;
  shifts: StaffShift[];
  onDrop: (shift: StaffShift, employeeId: string, dateYmd: string) => void | Promise<void>;
};

export function useShiftWeekDrag({ canDrag, shifts, onDrop }: UseShiftWeekDragOptions) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverTarget, setHoverTarget] = useState<ShiftDragHover>(null);

  const draggingShift = draggingId ? (shifts.find((s) => s.id === draggingId) ?? null) : null;

  const onDragStart = useCallback(
    (e: React.DragEvent, shiftId: string) => {
      if (!canDrag) return;
      setDraggingId(shiftId);
      e.dataTransfer.setData('text/staff-shift-id', shiftId);
      e.dataTransfer.effectAllowed = 'move';
    },
    [canDrag],
  );

  const onDragEnd = useCallback(() => {
    setDraggingId(null);
    setHoverTarget(null);
  }, []);

  const onCellDragEnter = useCallback(
    (employeeId: string, dateYmd: string) => {
      if (!canDrag || !draggingId) return;
      setHoverTarget({ employeeId, dateYmd });
    },
    [canDrag, draggingId],
  );

  const onCellDrop = useCallback(
    async (e: React.DragEvent, employeeId: string, dateYmd: string) => {
      if (!canDrag) return;
      e.preventDefault();
      const id = e.dataTransfer.getData('text/staff-shift-id');
      setDraggingId(null);
      setHoverTarget(null);
      if (!id) return;
      const shift = shifts.find((s) => s.id === id);
      if (!shift) return;
      if (shift.employeeId === employeeId && shift.shiftDate === dateYmd) return;
      await onDrop(shift, employeeId, dateYmd);
    },
    [canDrag, onDrop, shifts],
  );

  const onCellDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!canDrag) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    [canDrag],
  );

  return {
    draggingId,
    draggingShift,
    hoverTarget,
    onDragStart,
    onDragEnd,
    onCellDragEnter,
    onCellDragOver,
    onCellDrop,
  };
}
