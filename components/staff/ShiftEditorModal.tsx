'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { STAFF_ZONE_PRESETS, type StaffEmployee, type StaffShift, type StaffShiftStatus } from '@/lib/staff/types';
import { zoneDefaultColorHint } from '@/lib/staff/staff-zone-styles';
import { appConfirm } from '@/lib/app-dialog-bridge';
import { deleteStaffShift, staffDisplayName, upsertStaffShift } from '@/lib/staff/staff-supabase';

export type ShiftDraft =
  | { mode: 'new'; employeeId: string; shiftDate: string }
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
      setEmployeeId(draft.employeeId);
      setShiftDate(draft.shiftDate);
      setStartTime('09:00');
      setEndTime('17:00');
      setEndsNextDay(false);
      setBreakMinutes(30);
      setZone('');
      setNotes('');
      setStatus('planned');
      setColorHint('');
    } else {
      const s = draft.shift;
      setShiftId(s.id);
      setEmployeeId(s.employeeId);
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
        employeeId,
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
      <div className="fixed inset-x-0 bottom-0 z-[70] max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl ring-1 ring-zinc-200 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between gap-2">
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
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block text-xs font-bold text-zinc-600">
            Empleado
            <select
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-900"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required
            >
              <option value="">—</option>
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
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-bold text-zinc-600">
              Inicio
              <input
                type="time"
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </label>
            <label className="block text-xs font-bold text-zinc-600">
              Fin
              <input
                type="time"
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-zinc-700">
            <input
              type="checkbox"
              checked={endsNextDay}
              onChange={(e) => setEndsNextDay(e.target.checked)}
            />
            Termina al día siguiente
          </label>
          <label className="block text-xs font-bold text-zinc-600">
            Pausa (min)
            <input
              type="number"
              min={0}
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
          {err ? <p className="text-sm font-semibold text-red-700">{err}</p> : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="min-h-[48px] flex-1 rounded-2xl bg-[#D32F2F] px-4 text-sm font-extrabold text-white disabled:opacity-60"
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
        </form>
      </div>
    </>
  );
}
