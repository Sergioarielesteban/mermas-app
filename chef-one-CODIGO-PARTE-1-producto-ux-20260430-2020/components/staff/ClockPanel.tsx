'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { StaffEmployee, StaffShift, StaffTimeEntry, StaffTimeEventType } from '@/lib/staff/types';
import {
  findShiftForToday,
  getClockSessionState,
  sortEntriesByTime,
} from '@/lib/staff/attendance-logic';
import { todayYmd } from '@/lib/staff/attendance-logic';
import { staffDisplayName, recordStaffTimeEvent } from '@/lib/staff/staff-supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StaffPermissions } from '@/lib/staff/types';

const LABELS: Record<string, string> = {
  clock_in: 'Llegada',
  break_start: 'Pausa',
  break_end: 'Volver',
  clock_out: 'Salida',
};

const QUOTES = [
  'Cada día es una nueva oportunidad para ser mejor que ayer.',
  'La constancia se nota en los pequeños gestos.',
  'Un buen servicio empieza con un equipo organizado.',
];

type Props = {
  supabase: SupabaseClient;
  employees: StaffEmployee[];
  shifts: StaffShift[];
  entriesToday: StaffTimeEntry[];
  permissions: StaffPermissions;
  authUserId: string | null;
  onRecorded: () => void;
};

function formatClock(date: Date) {
  return date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDate(date: Date) {
  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

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
  const [now, setNow] = useState(() => new Date());
  const [pin, setPin] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingClockOutChoice, setPendingClockOutChoice] = useState(false);

  useEffect(() => {
    if (linked?.id) setSelectedId(linked.id);
  }, [linked?.id]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const selected = employees.find((e) => e.id === selectedId) ?? null;

  const dayEntries = useMemo(() => {
    if (!selectedId) return [];
    return sortEntriesByTime(entriesToday.filter((e) => e.employeeId === selectedId));
  }, [entriesToday, selectedId]);

  const session = getClockSessionState(dayEntries);
  const planned = selected ? findShiftForToday(shifts, selected.id, ymd) : null;

  const canPickOther = permissions.canManageSchedules;
  const quote = QUOTES[now.getDate() % QUOTES.length];

  const firstEntry = dayEntries.find((e) => e.eventType === 'clock_in');
  const activeSince = firstEntry
    ? new Date(firstEntry.occurredAt).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const leftAction = session.availableActions.includes('clock_in')
    ? 'clock_in'
    : session.availableActions.includes('break_end')
      ? 'break_end'
      : null;

  const rightAction = session.availableActions.includes('clock_out')
    ? 'clock_out'
    : session.availableActions.includes('break_start')
      ? 'break_start'
      : null;

  const pushSuccessMessage = (eventType: StaffTimeEventType) => {
    if (!selected) return;
    const firstName = selected.alias?.trim() || selected.firstName.trim() || 'compañero';

    if (eventType === 'clock_in') setMsg(`Hola, ${firstName}`);
    else if (eventType === 'break_start') setMsg(`Buen descanso, ${firstName}`);
    else if (eventType === 'break_end') setMsg(`Bienvenido de nuevo, ${firstName}`);
    else if (eventType === 'clock_out') setMsg(`Gracias por tu compromiso, ${firstName}`);
  };

  const fire = async (eventType: StaffTimeEventType) => {
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
      pushSuccessMessage(eventType);
      onRecorded();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'No se pudo registrar');
    } finally {
      setBusy(false);
    }
  };

  if (!selected) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-xl items-center justify-center px-4">
        <div className="w-full rounded-[32px] border border-amber-100 bg-amber-50 px-5 py-6 text-center shadow-sm">
          <p className="text-sm font-bold text-amber-900">
            No hay empleado seleccionado. Pide a un encargado que te dé de alta o vincule tu usuario.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto flex min-h-[72vh] w-full max-w-5xl items-center justify-center px-3 py-4 sm:px-6 lg:px-8">
      <div className="relative w-full overflow-hidden rounded-[34px] border border-zinc-100 bg-white px-5 py-7 text-center shadow-[0_22px_80px_rgba(15,23,42,0.10)] sm:px-10 sm:py-10 lg:px-16">
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-2xl text-zinc-500 transition hover:bg-zinc-100"
          aria-label="Ajustes de fichaje"
        >
          ⚙
        </button>

        <div className="mx-auto max-w-2xl">
          <h1 className="font-serif text-5xl font-semibold tracking-tight text-[#D71920] sm:text-6xl md:text-7xl">
            Chef One
          </h1>

          <p className="mt-4 text-base font-extrabold text-zinc-900 sm:text-lg">
            ¡Hola, {staffDisplayName(selected)}! 👋
          </p>

          <p className="mt-1 text-sm font-semibold capitalize text-zinc-400 sm:text-base">
            {formatDate(now)}
          </p>

          <div className="mt-6 text-[72px] font-black leading-none tracking-[-0.07em] text-zinc-950 sm:text-[110px] md:text-[128px]">
            {formatClock(now)}
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-zinc-500">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            {activeSince ? (
              <span>Sesión iniciada {activeSince}</span>
            ) : (
              <span>Sin sesión iniciada</span>
            )}
          </div>

          {planned ? (
            <p className="mt-2 text-xs font-bold text-zinc-400">
              Turno previsto: {planned.startTime.slice(0, 5)} – {planned.endTime.slice(0, 5)}
              {planned.zone ? ` · ${planned.zone}` : ''}
            </p>
          ) : null}

          <p className="mx-auto mt-6 max-w-md text-balance text-base font-medium leading-relaxed text-zinc-500 sm:text-lg">
            <span className="px-2 text-2xl font-black text-[#D71920]">“</span>
            {quote}
            <span className="px-2 text-2xl font-black text-[#D71920]">”</span>
          </p>

          {showSettings ? (
            <div className="mx-auto mt-6 max-w-md rounded-3xl border border-zinc-100 bg-zinc-50 p-4 text-left">
              {canPickOther ? (
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">
                    Quién fichas
                  </span>
                  <select
                    className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-zinc-900"
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
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

              {selected.hasPin ? (
                <label className="mt-4 block">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">
                    PIN fichaje
                  </span>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-center font-mono text-2xl tracking-widest"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                  />
                </label>
              ) : null}

              <label className="mt-4 block">
                <span className="text-xs font-black uppercase tracking-wide text-zinc-500">
                  Nota opcional
                </span>
                <input
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Incidencia, llegada tarde…"
                />
              </label>
            </div>
          ) : null}

          <div className="mx-auto mt-7 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy || !leftAction}
              onClick={() => leftAction && void fire(leftAction)}
              className="flex min-h-[64px] items-center justify-center gap-3 rounded-2xl border border-zinc-200 bg-white px-5 text-base font-black uppercase tracking-wide text-[#D71920] shadow-sm transition hover:bg-zinc-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="text-3xl">↪</span>
              {leftAction ? LABELS[leftAction] : 'Llegada'}
            </button>

            <button
              type="button"
              disabled={busy || !rightAction}
              onClick={() => {
                if (rightAction === 'clock_out' && session.availableActions.includes('break_start')) {
                  setPendingClockOutChoice(true);
                  return;
                }

                if (rightAction) void fire(rightAction);
              }}
              className="flex min-h-[64px] items-center justify-center gap-3 rounded-2xl bg-[#D71920] px-5 text-base font-black uppercase tracking-wide text-white shadow-[0_14px_34px_rgba(215,25,32,0.25)] transition hover:bg-[#b9151b] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="text-3xl">↩</span>
              {rightAction ? LABELS[rightAction] : 'Salida'}
            </button>
          </div>

          <p className="mt-7 text-sm font-medium text-zinc-500">
            Gracias por tu compromiso, ¡que tengas un gran día! ❤️
          </p>

          {msg ? (
            <p
              className={[
                'mt-4 rounded-2xl px-4 py-3 text-sm font-black',
                msg.includes('No se') || msg.includes('PIN') || msg.includes('error')
                  ? 'bg-red-50 text-red-700'
                  : 'bg-emerald-50 text-emerald-700',
              ].join(' ')}
            >
              {msg}
            </p>
          ) : null}

          {dayEntries.length > 0 ? (
            <div className="mx-auto mt-5 max-w-md rounded-3xl border border-zinc-100 bg-zinc-50 p-4 text-left">
              <p className="text-xs font-black uppercase tracking-wide text-zinc-400">
                Historial de hoy
              </p>

              <ul className="mt-3 space-y-2 text-sm">
                {[...dayEntries].reverse().map((e) => (
                  <li key={e.id} className="flex justify-between gap-3 font-bold text-zinc-700">
                    <span>{LABELS[e.eventType] ?? e.eventType}</span>
                    <span className="text-zinc-400">
                      {new Date(e.occurredAt).toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {pendingClockOutChoice ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[85] bg-black/40"
            aria-hidden
            onClick={() => setPendingClockOutChoice(false)}
          />

          <div className="fixed inset-x-0 bottom-0 z-[90] rounded-t-3xl bg-white p-4 shadow-xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
            <p className="text-center text-sm font-black text-zinc-900">
              ¿Te vas al descanso o acabaste turno?
            </p>

            <div className="mt-3 grid grid-cols-1 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPendingClockOutChoice(false);
                  void fire('break_start');
                }}
                className="min-h-[54px] rounded-2xl bg-amber-500 text-sm font-black text-white"
              >
                Me voy al descanso
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPendingClockOutChoice(false);
                  void fire('clock_out');
                }}
                className="min-h-[54px] rounded-2xl bg-[#D71920] text-sm font-black text-white"
              >
                He acabado mi turno
              </button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}