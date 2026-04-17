'use client';

import React, { useMemo, useState } from 'react';
import type { StaffEmployee, StaffShift, StaffTimeEntry } from '@/lib/staff/types';
import {
  findShiftForToday,
  formatMinutesHuman,
  getClockSessionState,
  plannedShiftMinutes,
  sortEntriesByTime,
  workedMinutesForDay,
} from '@/lib/staff/attendance-logic';
import { todayYmd } from '@/lib/staff/attendance-logic';
import { staffDisplayName, recordStaffTimeEvent } from '@/lib/staff/staff-supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StaffPermissions } from '@/lib/staff/types';

const LABELS: Record<string, string> = {
  clock_in: 'Entrar',
  break_start: 'Iniciar pausa',
  break_end: 'Finalizar pausa',
  clock_out: 'Salir',
};

type Props = {
  supabase: SupabaseClient;
  employees: StaffEmployee[];
  shifts: StaffShift[];
  entriesToday: StaffTimeEntry[];
  permissions: StaffPermissions;
  authUserId: string | null;
  onRecorded: () => void;
};

export default function ClockPanel({
  supabase,
  employees,
  shifts,
  entriesToday,
  permissions,
  authUserId,
  onRecorded,
}: Props) {
  const ymd = todayYmd();
  const linked = useMemo(
    () => employees.find((e) => e.userId && authUserId && e.userId === authUserId),
    [employees, authUserId],
  );
  const [selectedId, setSelectedId] = useState<string>(linked?.id ?? '');
  React.useEffect(() => {
    if (linked?.id) setSelectedId(linked.id);
  }, [linked?.id]);

  const selected = employees.find((e) => e.id === selectedId) ?? null;
  const dayEntries = useMemo(() => {
    if (!selectedId) return [];
    return sortEntriesByTime(entriesToday.filter((e) => e.employeeId === selectedId));
  }, [entriesToday, selectedId]);

  const session = getClockSessionState(dayEntries);
  const planned = selected ? findShiftForToday(shifts, selected.id, ymd) : null;
  const worked = workedMinutesForDay(dayEntries);
  const plannedMin = planned ? plannedShiftMinutes(planned) : 0;
  const delta = worked - plannedMin;

  const [pin, setPin] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const canPickOther = permissions.canManageSchedules;
  const showPicker = canPickOther;

  const fire = async (eventType: (typeof session.availableActions)[number]) => {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    try {
      await recordStaffTimeEvent(supabase, {
        employeeId: selected.id,
        eventType,
        shiftId: planned?.id ?? null,
        note: note.trim() || null,
        origin: 'app',
        pin: selected.hasPin ? pin.trim() || null : null,
        force: false,
      });
      setPin('');
      setNote('');
      onRecorded();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'No se pudo registrar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {showPicker ? (
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">Quién fichas</span>
          <select
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white py-3 pl-3 pr-8 text-base font-bold text-zinc-900"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={!canPickOther && Boolean(linked)}
          >
            <option value="">— Elige —</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {staffDisplayName(e)}
                {e.operationalRole ? ` · ${e.operationalRole}` : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {!selected ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-100">
          No hay empleado seleccionado. Pide a un encargado que te dé de alta en Equipo o vincule tu usuario.
        </p>
      ) : (
        <>
          <div className="rounded-3xl bg-gradient-to-br from-zinc-900 to-zinc-800 px-5 py-6 text-white shadow-lg">
            <p className="text-xs font-bold uppercase tracking-widest text-white/70">Estado</p>
            <p className="mt-1 text-2xl font-extrabold leading-tight">{staffDisplayName(selected)}</p>
            <p className="mt-3 text-sm font-medium text-white/85">
              Hoy llevas <span className="font-bold text-white">{formatMinutesHuman(worked)}</span>
              {plannedMin > 0 ? (
                <>
                  {' '}
                  · Plan: <span className="font-bold">{formatMinutesHuman(plannedMin)}</span>
                </>
              ) : null}
            </p>
            {plannedMin > 0 ? (
              <p
                className={[
                  'mt-2 text-sm font-bold',
                  delta > 15 ? 'text-amber-200' : delta < -10 ? 'text-red-200' : 'text-emerald-200',
                ].join(' ')}
              >
                {delta >= 0 ? '+' : ''}
                {delta} min vs plan
              </p>
            ) : null}
            {planned ? (
              <p className="mt-3 text-xs font-semibold text-white/75">
                Turno: {planned.startTime.slice(0, 5)} – {planned.endTime.slice(0, 5)}
                {planned.zone ? ` · ${planned.zone}` : ''}
              </p>
            ) : (
              <p className="mt-3 text-xs font-semibold text-white/60">Sin turno planificado hoy</p>
            )}
          </div>

          {selected.hasPin ? (
            <label className="block">
              <span className="text-xs font-bold text-zinc-600">PIN fichaje</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="mt-1 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-center text-2xl font-mono tracking-widest"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••"
              />
            </label>
          ) : null}

          <label className="block">
            <span className="text-xs font-bold text-zinc-600">Nota (opcional)</span>
            <input
              className="mt-1 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Incidencia, llegada con X…"
            />
          </label>

          <div className="flex flex-col gap-3">
            {session.availableActions.map((act) => (
              <button
                key={act}
                type="button"
                disabled={busy}
                onClick={() => void fire(act)}
                className={[
                  'min-h-[56px] w-full rounded-2xl px-4 text-base font-extrabold shadow-md transition active:scale-[0.99]',
                  act === 'clock_in'
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : act === 'clock_out'
                      ? 'bg-[#D32F2F] text-white hover:bg-red-800'
                      : act === 'break_start'
                        ? 'bg-amber-500 text-white hover:bg-amber-600'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700',
                ].join(' ')}
              >
                {LABELS[act] ?? act}
              </button>
            ))}
          </div>

          {dayEntries.length > 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3">
              <p className="text-xs font-extrabold uppercase text-zinc-500">Historial hoy</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {[...dayEntries].reverse().map((e) => (
                  <li key={e.id} className="flex justify-between gap-2 font-medium text-zinc-800">
                    <span>{LABELS[e.eventType] ?? e.eventType}</span>
                    <span className="text-zinc-500">
                      {new Date(e.occurredAt).toLocaleTimeString('es', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {msg ? <p className="text-center text-sm font-bold text-red-700">{msg}</p> : null}
        </>
      )}
    </div>
  );
}
