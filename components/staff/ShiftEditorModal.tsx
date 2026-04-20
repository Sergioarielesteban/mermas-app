'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { STAFF_ZONE_PRESETS, type StaffEmployee, type StaffShift, type StaffShiftStatus } from '@/lib/staff/types';
import { zoneDefaultColorHint } from '@/lib/staff/staff-zone-styles';
import { appConfirm } from '@/lib/app-dialog-bridge';
import { QUICK_SHIFT_PRESETS } from '@/lib/staff/shift-quick-presets';
import { deleteStaffShift, staffDisplayName, upsertStaffShift } from '@/lib/staff/staff-supabase';

/** Señal interna: la acción se canceló tras avisar al usuario (no cerrar modal). */
export const PLANIFICACION_MODAL_ABORT = 'PLANIFICACION_MODAL_ABORT';

export type ShiftDraft =
  | {
      mode: 'new';
      employeeId?: string | null;
      shiftDate: string;
      /** Puesto sugerido (cuadrante operativo) */
      defaultZone?: string;
      /** Copia horario, pausa, puesto y estado desde un turno (añadir persona al mismo bloque). */
      cloneSlotFrom?: StaffShift;
    }
  | { mode: 'edit'; shift: StaffShift };

function shortTimeForInput(t: string) {
  const [h = '09', m = '00'] = t.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

function toPgTime(val: string) {
  const parts = val.split(':');
  if (parts.length >= 3) return val;
  return `${parts[0] ?? '09'}:${parts[1] ?? '00'}:00`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  supabase: SupabaseClient;
  localId: string;
  employees: StaffEmployee[];
  draft: ShiftDraft | null;
  onSaved: () => void;
  canDelete: boolean;
  /** Puestos extra del cuadrante (localStorage / «+ Puesto»). */
  operationalExtraZones?: { value: string; label: string }[];
  onDuplicateFromModal?: (shift: StaffShift) => void | Promise<void>;
  onCopyPrevCalendarDayFromModal?: (shift: StaffShift) => void | Promise<void>;
  onCopyPrevWeekdayFromModal?: (shift: StaffShift) => void | Promise<void>;
};

export default function ShiftEditorModal({
  open,
  onClose,
  supabase,
  localId,
  employees,
  draft,
  onSaved,
  canDelete,
  operationalExtraZones = [],
  onDuplicateFromModal,
  onCopyPrevCalendarDayFromModal,
  onCopyPrevWeekdayFromModal,
}: Props) {
  const [employeeId, setEmployeeId] = useState('');
  const [shiftDate, setShiftDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [endsNextDay, setEndsNextDay] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState(30);
  const [zone, setZone] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<StaffShiftStatus>('planned');
  const [colorHint, setColorHint] = useState('');
  const [shiftId, setShiftId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !draft) return;
    setErr(null);
    if (draft.mode === 'new') {
      setShiftId(undefined);
      setEmployeeId(draft.employeeId?.trim() ? draft.employeeId.trim() : '');
      setShiftDate(draft.shiftDate);
      const tpl = draft.cloneSlotFrom;
      if (tpl) {
        setStartTime(shortTimeForInput(tpl.startTime));
        setEndTime(shortTimeForInput(tpl.endTime));
        setEndsNextDay(tpl.endsNextDay);
        setBreakMinutes(tpl.breakMinutes);
        const z = (tpl.zone ?? draft.defaultZone ?? '').trim();
        setZone(z);
        setNotes('');
        setStatus(tpl.status);
        setColorHint(tpl.colorHint?.trim() ? tpl.colorHint : z ? zoneDefaultColorHint(z) ?? '' : '');
      } else {
        setStartTime('09:00');
        setEndTime('17:00');
        setEndsNextDay(false);
        setBreakMinutes(30);
        const dz = (draft.defaultZone ?? '').trim();
        setZone(dz);
        setNotes('');
        setStatus('planned');
        setColorHint(dz ? zoneDefaultColorHint(dz) ?? '' : '');
      }
    } else {
      const s = draft.shift;
      setShiftId(s.id);
      setEmployeeId(s.employeeId ?? '');
      setShiftDate(s.shiftDate);
      setStartTime(shortTimeForInput(s.startTime));
      setEndTime(shortTimeForInput(s.endTime));
      setEndsNextDay(s.endsNextDay);
      setBreakMinutes(s.breakMinutes);
      setZone(s.zone ?? '');
      setNotes(s.notes ?? '');
      setStatus(s.status);
      setColorHint(s.colorHint ?? '');
    }
  }, [open, draft]);

  if (!open || !draft) return null;

  const runSecondaryAction = async (fn?: (shift: StaffShift) => void | Promise<void>) => {
    if (!fn || draft.mode !== 'edit') return;
    setBusy(true);
    setErr(null);
    try {
      await fn(draft.shift);
      onSaved();
      onClose();
    } catch (er: unknown) {
      if (er instanceof Error && er.message === PLANIFICACION_MODAL_ABORT) return;
      setErr(er instanceof Error ? er.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const hint =
        colorHint.trim() || zoneDefaultColorHint(zone.trim() || null) || null;
      await upsertStaffShift(supabase, {
        id: shiftId,
        localId,
        employeeId: employeeId.trim() ? employeeId.trim() : null,
        shiftDate,
        startTime: toPgTime(startTime),
        endTime: toPgTime(endTime),
        endsNextDay,
        breakMinutes,
        zone: zone.trim() || null,
        notes: notes.trim() || null,
        status,
        colorHint: hint,
      });
      onSaved();
      onClose();
    } catch (er: unknown) {
      setErr(er instanceof Error ? er.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!shiftId || !canDelete) return;
    if (!(await appConfirm('¿Eliminar este turno?'))) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteStaffShift(supabase, shiftId);
      onSaved();
      onClose();
    } catch (er: unknown) {
      setErr(er instanceof Error ? er.message : 'No se pudo eliminar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-hidden
        className="fixed inset-0 z-[60] bg-black/40"
        onClick={() => !busy && onClose()}
      />
      <div className="fixed inset-x-0 bottom-0 z-[70] flex max-h-[92vh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl ring-1 ring-zinc-200 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-h-[min(92vh,720px)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-100 px-4 pb-3 pt-4">
          <p className="text-base font-extrabold text-zinc-900">
            {draft.mode === 'new' ? 'Nuevo turno' : 'Editar turno'}
          </p>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain px-4 py-3">
          <label className="block text-xs font-bold text-zinc-600">
            Empleado
            <select
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-900"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Sin asignar</option>
              {employees.map((em) => (
                <option key={em.id} value={em.id}>
                  {staffDisplayName(em)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold text-zinc-600">
            Día
            <input
              type="date"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold text-zinc-900"
              value={shiftDate}
              onChange={(e) => setShiftDate(e.target.value)}
              required
            />
          </label>
          <div>
            <p className="text-xs font-extrabold text-zinc-800">Horario</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Ajusta entrada y salida a mano; marca «termina al día siguiente» si el turno cruza medianoche.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block text-xs font-bold text-zinc-600">
                Entrada
                <input
                  type="time"
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </label>
              <label className="block text-xs font-bold text-zinc-600">
                Salida
                <input
                  type="time"
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </label>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-zinc-700">
            <input
              type="checkbox"
              checked={endsNextDay}
              onChange={(e) => setEndsNextDay(e.target.checked)}
            />
            Termina al día siguiente
          </label>
          <div className="space-y-1.5 rounded-xl bg-zinc-50 px-2 py-2 ring-1 ring-zinc-100">
            <p className="text-[11px] font-bold text-zinc-600">Atajos (opcional)</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_SHIFT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="rounded-full bg-white px-2.5 py-1 text-[11px] font-extrabold text-zinc-800 ring-1 ring-zinc-200/80 hover:bg-zinc-100"
                  onClick={() => {
                    setStartTime(p.startTime);
                    setEndTime(p.endTime);
                    setEndsNextDay(p.endsNextDay);
                    setBreakMinutes(p.breakMinutes);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-xs font-bold text-zinc-600">
            Descanso (minutos, p. ej. 30)
            <input
              type="number"
              min={0}
              step={5}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold"
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(Number(e.target.value))}
            />
          </label>
          <label className="block text-xs font-bold text-zinc-600">
            Zona / puesto
            <select
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            >
              <option value="">—</option>
              {STAFF_ZONE_PRESETS.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
              {operationalExtraZones
                .filter((z) => !STAFF_ZONE_PRESETS.some((p) => p.value === z.value))
                .map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.label}
                  </option>
                ))}
            </select>
          </label>
          <label className="block text-xs font-bold text-zinc-600">
            Estado
            <select
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold"
              value={status}
              onChange={(e) => setStatus(e.target.value as StaffShiftStatus)}
            >
              <option value="planned">Planificado</option>
              <option value="confirmed">Confirmado</option>
              <option value="worked">Trabajado</option>
              <option value="incident">Incidencia</option>
            </select>
          </label>
          <label className="block text-xs font-bold text-zinc-600">
            Color (hex opcional)
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold"
              value={colorHint}
              onChange={(e) => setColorHint(e.target.value)}
              placeholder="#c62828"
            />
          </label>
          <label className="block text-xs font-bold text-zinc-600">
            Notas
            <textarea
              className="mt-1 min-h-[72px] w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {draft.mode === 'edit' &&
          (onDuplicateFromModal || onCopyPrevCalendarDayFromModal || onCopyPrevWeekdayFromModal) ? (
            <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
              <p className="w-full text-[11px] font-bold text-zinc-500">Más acciones</p>
              {onDuplicateFromModal ? (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                  onClick={() => void runSecondaryAction(onDuplicateFromModal)}
                >
                  Duplicar
                </button>
              ) : null}
              {onCopyPrevCalendarDayFromModal ? (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                  onClick={() => void runSecondaryAction(onCopyPrevCalendarDayFromModal)}
                >
                  Copiar a día anterior
                </button>
              ) : null}
              {onCopyPrevWeekdayFromModal ? (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                  onClick={() => void runSecondaryAction(onCopyPrevWeekdayFromModal)}
                >
                  Copiar −7 días
                </button>
              ) : null}
            </div>
          ) : null}
          {err ? <p className="text-sm font-semibold text-red-700">{err}</p> : null}
          </div>
          <div className="shrink-0 border-t border-zinc-200 bg-white px-4 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy}
                className="min-h-[48px] flex-1 rounded-2xl bg-[#D32F2F] px-4 text-sm font-extrabold text-white shadow-sm disabled:opacity-60"
              >
                Guardar
              </button>
              {shiftId && canDelete ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDelete()}
                  className="min-h-[48px] rounded-2xl border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-800"
                >
                  Eliminar
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
