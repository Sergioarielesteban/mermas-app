'use client';

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, LogIn } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useStaffBundle } from '@/hooks/useStaffBundle';
import { useStaffRealtime } from '@/hooks/useStaffRealtime';
import { canAccessTeamManagement } from '@/lib/app-role-permissions';
import { useLinkedStaffEmployee } from '@/lib/staff/useLinkedStaffEmployee';
import {
  findShiftForToday,
  formatMinutesHuman,
  getClockSessionState,
  plannedShiftMinutes,
  sortEntriesByTime,
  todayYmd,
  workedMinutesForDay,
} from '@/lib/staff/attendance-logic';
import { filterEntriesForLocalDay } from '@/lib/staff/staff-heuristics';
import { shiftDateTimeIso, startOfWeekMonday, ymdLocal } from '@/lib/staff/staff-dates';
import { zoneLabel } from '@/lib/staff/staff-zone-styles';
import { staffDisplayName } from '@/lib/staff/staff-supabase';

export default function PersonalMiHomePage() {
  const { localId, profileReady, userId, displayName, profileRole } = useAuth();
  const [weekStart] = useState(() => ymdLocal(startOfWeekMonday(new Date())));
  const { employees, shifts, timeEntries, loading, error, reload } = useStaffBundle(localId, weekStart);
  const linked = useLinkedStaffEmployee(employees, userId);
  const ymd = todayYmd();
  const entriesToday = useMemo(() => filterEntriesForLocalDay(timeEntries, ymd), [timeEntries, ymd]);

  const onRt = useCallback(() => void reload(), [reload]);
  useStaffRealtime(localId, onRt);

  const greeting =
    displayName?.trim() || (linked ? staffDisplayName(linked) : 'Equipo');
  const canGoTeamManagement = canAccessTeamManagement(profileRole);

  const myToday = useMemo(() => {
    if (!linked) return null;
    const planned = findShiftForToday(shifts, linked.id, ymd);
    const mine = sortEntriesByTime(entriesToday.filter((e) => e.employeeId === linked.id));
    const session = getClockSessionState(mine);
    const worked = workedMinutesForDay(mine);
    const plannedM = planned ? plannedShiftMinutes(planned) : 0;
    return { planned, session, worked, plannedM, mine };
  }, [linked, shifts, ymd, entriesToday]);

  const nextShift = useMemo(() => {
    if (!linked) return null;
    const now = Date.now();
    const upcoming = shifts
      .filter((s) => s.employeeId === linked.id)
      .map((s) => ({ s, start: shiftDateTimeIso(s.shiftDate, s.startTime) }))
      .filter((x) => x.start > now)
      .sort((a, b) => a.start - b.start)[0];
    return upcoming?.s ?? null;
  }, [linked, shifts]);

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!localId) return <p className="text-sm text-amber-800">Sin local.</p>;

  if (!linked) {
    return (
      <div className="space-y-4">
        <div className="rounded-3xl bg-gradient-to-br from-zinc-900 to-zinc-800 px-5 py-8 text-white shadow-lg">
          <p className="text-sm font-bold text-white/80">Mi espacio</p>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight">Vincula tu usuario</h1>
          <p className="mt-3 text-sm text-white/85">
            Pide a un encargado que asocie tu cuenta en <strong>Personal → Equipo</strong> (campo usuario).
          </p>
        </div>
        {canGoTeamManagement ? (
          <Link
            href="/personal/empleados"
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#D32F2F] px-4 text-sm font-extrabold text-white"
          >
            Ir a Equipo
          </Link>
        ) : (
          <p className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-200">
            Solicita a un encargado que vincule tu usuario.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-gradient-to-br from-emerald-700 to-emerald-900 px-5 py-6 text-white shadow-lg">
        <p className="text-xs font-extrabold uppercase tracking-widest text-white/75">Hola</p>
        <h1 className="mt-1 text-2xl font-extrabold leading-tight">{greeting}</h1>
        <p className="mt-2 text-sm font-medium text-white/90">
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}

      {myToday ? (
        <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
          <h2 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-zinc-500">
            <LogIn className="h-4 w-4" />
            Hoy
          </h2>
          {myToday.planned ? (
            <p className="mt-2 text-lg font-extrabold text-zinc-900">
              {myToday.planned.startTime.slice(0, 5)} – {myToday.planned.endTime.slice(0, 5)}
              {myToday.planned.zone ? (
                <span className="block text-sm font-semibold text-zinc-600">
                  {zoneLabel(myToday.planned.zone)}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="mt-2 text-sm font-semibold text-zinc-600">Sin turno planificado hoy.</p>
          )}
          <p className="mt-3 text-sm text-zinc-700">
            Llevas <span className="font-extrabold text-zinc-900">{formatMinutesHuman(myToday.worked)}</span>
            {myToday.plannedM > 0 ? (
              <>
                {' '}
                · Plan {formatMinutesHuman(myToday.plannedM)}
              </>
            ) : null}
          </p>
          <p className="mt-1 text-xs font-semibold text-zinc-500">
            Estado:{' '}
            {myToday.session.lastEventType == null
              ? 'Sin fichar'
              : myToday.session.lastEventType === 'clock_out'
                ? 'Jornada cerrada'
                : 'Jornada en curso'}
          </p>
          <Link
            href="/personal/fichaje"
            className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-zinc-900 text-sm font-extrabold text-white"
          >
            Ir a fichar
          </Link>
        </section>
      ) : null}

      {nextShift ? (
        <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
          <h2 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-zinc-500">
            <CalendarClock className="h-4 w-4" />
            Próximo turno
          </h2>
          <p className="mt-2 text-base font-extrabold text-zinc-900">
            {new Date(nextShift.shiftDate + 'T12:00:00').toLocaleDateString('es-ES', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}
          </p>
          <p className="text-lg font-extrabold text-[#B91C1C]">
            {nextShift.startTime.slice(0, 5)} – {nextShift.endTime.slice(0, 5)}
          </p>
          {nextShift.zone ? (
            <p className="text-sm font-semibold text-zinc-600">{zoneLabel(nextShift.zone)}</p>
          ) : null}
          <Link href="/personal/mi/turnos" className="mt-3 inline-block text-sm font-bold text-[#D32F2F]">
            Ver todos →
          </Link>
        </section>
      ) : null}
    </div>
  );
}
