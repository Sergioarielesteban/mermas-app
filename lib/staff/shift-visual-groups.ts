import type { StaffShift } from '@/lib/staff/types';

/** Normaliza HH:MM o HH:MM:SS para comparar franjas. */
function clockKey(t: string): string {
  const parts = t.split(':');
  const h = (parts[0] ?? '0').padStart(2, '0');
  const m = (parts[1] ?? '0').padStart(2, '0');
  const sec = (parts[2] ?? '00').padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

export type VisualShiftSlotGroup = {
  slotKey: string;
  items: StaffShift[];
};

/**
 * Agrupa turnos de una misma celda (mismo día y puesto) con la misma franja horaria.
 * No cambia el modelo de datos: sigue habiendo un registro por persona.
 */
export function groupShiftsByVisualSlot(shifts: StaffShift[]): VisualShiftSlotGroup[] {
  const m = new Map<string, StaffShift[]>();
  for (const s of shifts) {
    const slotKey = [
      clockKey(s.startTime),
      clockKey(s.endTime),
      s.endsNextDay ? '1' : '0',
      String(Number(s.breakMinutes) || 0),
    ].join('|');
    const arr = m.get(slotKey) ?? [];
    arr.push(s);
    m.set(slotKey, arr);
  }
  const out: VisualShiftSlotGroup[] = [...m.entries()].map(([slotKey, items]) => ({ slotKey, items }));
  out.sort((a, b) => (a.items[0]?.startTime ?? '').localeCompare(b.items[0]?.startTime ?? ''));
  return out;
}
