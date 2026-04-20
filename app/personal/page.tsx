'use client';

import Link from 'next/link';
import React, { useCallback, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Clock, Users } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { useStaffBundle } from '@/hooks/useStaffBundle';
import { useStaffRealtime } from '@/hooks/useStaffRealtime';
import { startOfWeekMonday, ymdLocal } from '@/lib/staff/staff-dates';
import {
  employeeIdsWorkingNow,
  entriesByEmployee,
  filterEntriesForLocalDay,
  hintForEmployeeDay,
  openIncidentsCount,
  plannedMinutesToday,
  workedMinutesTodayAll,
} from '@/lib/staff/staff-heuristics';
import { staffDisplayName } from '@/lib/staff/staff-supabase';
import { formatMinutesHuman, plannedShiftMinutes } from '@/lib/staff/attendance-logic';
import { todayYmd } from '@/lib/staff/attendance-logic';
import { shiftDateTimeIso } from '@/lib/staff/staff-dates';
import { zoneBlockStyle, zoneLabel } from '@/lib/staff/staff-zone-styles';

export default function PersonalResumenPage() {
  const { localId, profileRole, profileReady, userId } = useAuth();
  const [weekStart] = useState(() => ymdLocal(startOfWeekMonday(new Date())));
  const { employees, shifts, timeEntries, incidents, loading, error, reload } = useStaffBundle(
    localId,
    weekStart,
  );

  const onRt = useCallback(() => {
    void reload();
  }, [reload]);
  useStaffRealtime(localId, onRt);

  const ymd = todayYmd();
  const todayShifts = useMemo(() => shifts.filter((s) => s.shiftDate === ymd), [shifts, ymd]);
  const plannedEmps = useMemo(
    () => new Set(todayShifts.map((s) => s.employeeId).filter(Boolean) as string[]),
    [todayShifts],
  );
  const working = useMemo(() => employeeIdsWorkingNow(timeEntries, ymd), [timeEntries, ymd]);
  const dayEntries = useMemo(() => filterEntriesForLocalDay(timeEntries, ymd), [timeEntries, ymd]);
  const clockedIds = useMemo(() => new Set(dayEntries.map((e) => e.employeeId)), [dayEntries]);
  const pendingClock = useMemo(() => {
    const out: string[] = [];
    for (const id of plannedEmps) {
      const entries = entriesByEmployee(timeEntries, id, ymd);
      if (!entries.some((e) => e.eventType === 'clock_in')) out.push(id);
    }
    return out;
  }, [plannedEmps, timeEntries, ymd]);

  const lateHints = useMemo(() => {
    let n = 0;
    for (const e of employees) {
      const h = hintForEmployeeDay(shifts, timeEntries, e.id, ymd);
      if (h.hint === 'late' || h.hint === 'no_clock_in') n += 1;
    }
    return n;
  }, [employees, shifts, timeEntries, ymd]);

  const plannedMin = plannedMinutesToday(shifts, ymd);
  const workedMin = workedMinutesTodayAll(timeEntries, employees, ymd);
  const openInc = openIncidentsCount(incidents);

  const nextBlocks = useMemo(() => {
    const now = Date.now();
    const blocks = todayShifts
      .map((s) => {
        const em = employees.find((e) => e.id === s.employeeId);
        const start = shiftDateTimeIso(s.shiftDate, s.startTime);
        return { s, em, start };
      })
      .filter((x) => x.start > now)
      .sort((a, b) => a.start - b.start)
      .slice(0, 6);
    return blocks;
  }, [todayShifts, employees]);

  const workingList = employees.filter((e) => working.has(e.id));
  const isStaffOnly = profileRole === 'staff';
  const isManagerOnly = profileRole === 'manager';
  const linkedEmployee = employees.find((e) => e.userId === userId) ?? null;
  const zoneChipStyle = (zone: string | null | undefined, colorHint: string | null | undefined) => {
    if (colorHint) return { background: colorHint, color: '#fff' };
    const z = zoneBlockStyle(zone);
    return { background: z.bg, color: z.text };
  };
  const weekdayLabel = (ymdDate: string) =>
    new Date(`${ymdDate}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long' });
  const dayLabel = (ymdDate: string) =>
    new Date(`${ymdDate}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
  const myTodayShifts = todayShifts
    .filter((s) => linkedEmployee && s.employeeId === linkedEmployee.id)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const myWeekShiftsRaw = shifts
    .filter((s) => linkedEmployee && s.employeeId === linkedEmployee.id)
    .sort((a, b) => (a.shiftDate === b.shiftDate ? a.startTime.localeCompare(b.startTime) : a.shiftDate.localeCompare(b.shiftDate)));
  const myWeekShifts = myWeekShiftsRaw.slice(0, 14);
  const teamToday = todayShifts
    .map((s) => {
      const employee = employees.find((e) => e.id === s.employeeId);
      return {
        id: s.id,
        name: employee ? staffDisplayName(employee) : 'Sin asignar',
        startTime: s.startTime.slice(0, 5),
        endTime: s.endTime.slice(0, 5),
      };
    })
    .sort((a, b) => (a.startTime === b.startTime ? a.name.localeCompare(b.name, 'es') : a.startTime.localeCompare(b.startTime)));
  const managerTeamToday = todayShifts
    .map((s) => {
      const employee = employees.find((e) => e.id === s.employeeId);
      return {
        id: s.id,
        name: employee ? staffDisplayName(employee) : 'Sin asignar',
        startTime: s.startTime.slice(0, 5),
        endTime: s.endTime.slice(0, 5),
        zone: s.zone,
      };
    })
    .sort((a, b) => (a.startTime === b.startTime ? a.name.localeCompare(b.name, 'es') : a.startTime.localeCompare(b.startTime)));
  const managerWeekPlan = [...shifts]
    .sort((a, b) => (a.shiftDate === b.shiftDate ? a.startTime.localeCompare(b.startTime) : a.shiftDate.localeCompare(b.shiftDate)))
    .slice(0, 28)
    .map((s) => {
      const employee = employees.find((e) => e.id === s.employeeId);
      return {
        id: s.id,
        day: new Date(`${s.shiftDate}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit' }),
        name: employee ? staffDisplayName(employee) : '—',
        startTime: s.startTime.slice(0, 5),
        endTime: s.endTime.slice(0, 5),
        zone: s.zone,
        minutes: plannedShiftMinutes(s),
      };
    });

  if (!profileReady) {
    return <p className="text-sm text-zinc-500">Cargando perfil…</p>;
  }
  if (!localId) {
    return (
      <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
        Tu usuario no tiene local asignado.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <MermasStyleHero
        eyebrow={isStaffOnly ? undefined : 'Personal'}
        title={isStaffOnly ? 'HORARIOS Y FICHAJES' : 'Horarios y fichajes'}
        tagline={isStaffOnly ? undefined : 'Control visual para cocina y sala: turnos, fichajes e incidencias en un vistazo.'}
        compact
      />

      <section className="rounded-3xl bg-white p-4 ring-1 ring-zinc-200/90 md:p-5">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-500">Manual y normas</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600">
          Manual de operaciones, normas de empresa y matriz de alérgenos (datos de escandallos, solo lectura).
        </p>
        <Link
          href="/personal/manual-normas"
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#D32F2F] px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-white shadow-sm hover:bg-[#c62828] active:scale-[0.99]"
        >
          Abrir sección
        </Link>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
          {error}
          <p className="mt-2 text-xs font-normal text-red-800">
            Si acabas de desplegar el módulo, ejecuta en Supabase el SQL{' '}
            <code className="rounded bg-red-100 px-1">supabase-staff-attendance-schema.sql</code>.
          </p>
        </div>
      ) : null}

      {loading ? <p className="text-sm text-zinc-500">Cargando datos…</p> : null}

      {isStaffOnly ? (
        <div className="grid gap-4 md:grid-cols-2 md:gap-5">
          <section className="rounded-3xl bg-white p-4 ring-1 ring-zinc-200/90 md:p-5">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-500">Tu horario de hoy</h2>
            {!linkedEmployee ? (
              <p className="mt-2 text-sm text-zinc-600">No tienes ficha vinculada en el local.</p>
            ) : myTodayShifts.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600">Hoy no tienes turno asignado.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {myTodayShifts.map((s) => (
                  <li key={s.id} className="rounded-2xl bg-zinc-50 px-3 py-2 text-sm ring-1 ring-zinc-100">
                    <p className="font-bold text-zinc-900">
                      {s.startTime.slice(0, 5)} - {s.endTime.slice(0, 5)}
                    </p>
                    {s.zone ? (
                      <span
                        className="mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
                        style={zoneChipStyle(s.zone, s.colorHint)}
                      >
                        {zoneLabel(s.zone)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-3xl bg-white p-4 ring-1 ring-zinc-200/90 md:p-5">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-500">Planificación semanal</h2>
            {!linkedEmployee ? (
              <p className="mt-2 text-sm text-zinc-600">Sin planificación disponible.</p>
            ) : myWeekShifts.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600">No hay turnos cargados esta semana.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {myWeekShifts.map((s) => (
                  <li key={s.id} className="rounded-2xl bg-zinc-50 px-3 py-2 text-sm ring-1 ring-zinc-100">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold capitalize text-zinc-700">
                        {weekdayLabel(s.shiftDate)} ({dayLabel(s.shiftDate)})
                      </span>
                      <span className="font-bold text-zinc-900">
                        {s.startTime.slice(0, 5)} - {s.endTime.slice(0, 5)}
                      </span>
                    </div>
                    {s.zone ? (
                      <span
                        className="mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
                        style={zoneChipStyle(s.zone, s.colorHint)}
                      >
                        {zoneLabel(s.zone)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-3xl bg-white p-4 ring-1 ring-zinc-200/90 md:col-span-2 md:p-5">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-500">Equipo del día</h2>
            {teamToday.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600">No hay personal planificado hoy.</p>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {teamToday.map((member) => (
                  <li key={member.id} className="rounded-xl bg-zinc-50 px-3 py-2 text-sm ring-1 ring-zinc-100">
                    <p className="font-semibold text-zinc-800">{member.name}</p>
                    <p className="text-xs font-bold text-zinc-600">
                      {member.startTime} - {member.endTime}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : isManagerOnly ? (
        <div className="space-y-4">
          <section className="grid gap-2 sm:grid-cols-2">
            <Link
              href="/personal/fichaje"
              className="flex min-h-[48px] items-center justify-center rounded-2xl border border-zinc-300 bg-white px-3 py-2 text-sm font-extrabold text-zinc-800"
            >
              Registrar jornada
            </Link>
            <Link
              href="/personal/registro"
              className="flex min-h-[48px] items-center justify-center rounded-2xl border border-zinc-300 bg-white px-3 py-2 text-sm font-extrabold text-zinc-800"
            >
              Ver registro del equipo
            </Link>
          </section>

          <section className="rounded-3xl bg-white p-4 ring-1 ring-zinc-200/90 md:p-5">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-500">Equipo del día</h2>
            {managerTeamToday.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600">No hay personal planificado hoy.</p>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {managerTeamToday.map((member) => (
                  <li key={member.id} className="rounded-xl bg-zinc-50 px-3 py-2 text-sm ring-1 ring-zinc-100">
                    <p className="font-semibold text-zinc-800">{member.name}</p>
                    <p className="text-xs font-bold text-zinc-600">
                      {member.startTime} - {member.endTime}
                    </p>
                    {member.zone ? (
                      <span
                        className="mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
                        style={zoneChipStyle(member.zone, null)}
                      >
                        {zoneLabel(member.zone)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-3xl bg-white p-4 ring-1 ring-zinc-200/90 md:p-5">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-500">Planificación semanal</h2>
            {managerWeekPlan.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600">No hay turnos cargados para esta semana.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {managerWeekPlan.map((item) => (
                  <li key={item.id} className="rounded-xl bg-zinc-50 px-3 py-2 text-sm ring-1 ring-zinc-100">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold capitalize text-zinc-700">{item.day}</span>
                      <span className="font-bold text-zinc-900">
                        {item.startTime} - {item.endTime}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-zinc-600">{item.name}</p>
                    <p className="text-xs font-bold text-zinc-500">{formatMinutesHuman(item.minutes)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4">
        <StatCard label="Equipo activo" value={employees.length} Icon={Users} tone="zinc" />
        <StatCard label="Planif. hoy" value={plannedEmps.size} Icon={Clock} tone="red" />
        <StatCard label="Ficharon" value={clockedIds.size} Icon={Clock} tone="emerald" />
        <StatCard label="Pend. entrada" value={pendingClock.length} Icon={AlertTriangle} tone="amber" />
        <StatCard label="Retrasos / sin fichar" value={lateHints} Icon={AlertTriangle} tone="amber" />
        <StatCard label="Incidencias" value={openInc} Icon={AlertTriangle} tone="red" />
        <StatCard
          label="Horas plan."
          value={formatMinutesHuman(plannedMin)}
          sub
          Icon={Clock}
          tone="zinc"
        />
        <StatCard label="Horas trab." value={formatMinutesHuman(workedMin)} sub Icon={Clock} tone="emerald" />
      </div>
      )}

      {!isStaffOnly && !isManagerOnly ? (
      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
      <section className="rounded-3xl bg-white p-4 ring-1 ring-zinc-200/90 md:p-5">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-500">Ahora en el local</h2>
        {workingList.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">Nadie con jornada abierta en este momento.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {workingList.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-950 ring-1 ring-emerald-100"
              >
                <span>{staffDisplayName(e)}</span>
                <span className="text-xs font-semibold text-emerald-800">En jornada</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl bg-white p-4 ring-1 ring-zinc-200/90 md:p-5">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-500">Próximos turnos hoy</h2>
        {nextBlocks.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No quedan turnos por empezar hoy.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {nextBlocks.map(({ s, em }) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-zinc-50 px-3 py-2 text-sm ring-1 ring-zinc-100"
              >
                <span className="font-bold text-zinc-900">{em ? staffDisplayName(em) : 'Sin asignar'}</span>
                <span className="text-xs font-semibold text-zinc-600">
                  {s.startTime.slice(0, 5)} – {s.endTime.slice(0, 5)}
                  {s.zone ? ` · ${s.zone}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
      ) : null}

      {openInc > 0 && !isStaffOnly && !isManagerOnly ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950">
          Hay {openInc} incidencia(s) abierta(s). Revisa la pestaña Incidencias.
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  Icon,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: boolean;
  Icon: LucideIcon;
  tone: 'zinc' | 'red' | 'emerald' | 'amber';
}) {
  const ring =
    tone === 'red'
      ? 'ring-red-100 bg-red-50/80'
      : tone === 'emerald'
        ? 'ring-emerald-100 bg-emerald-50/80'
        : tone === 'amber'
          ? 'ring-amber-100 bg-amber-50/80'
          : 'ring-zinc-100 bg-zinc-50/80';
  const icon =
    tone === 'red'
      ? 'text-[#D32F2F]'
      : tone === 'emerald'
        ? 'text-emerald-700'
        : tone === 'amber'
          ? 'text-amber-800'
          : 'text-zinc-600';
  return (
    <div className={`rounded-2xl p-3 ring-1 md:p-4 ${ring}`}>
      <Icon className={`h-4 w-4 md:h-5 md:w-5 ${icon}`} strokeWidth={2.2} />
      <p className="mt-2 text-[10px] font-extrabold uppercase leading-tight text-zinc-500 md:text-[11px]">{label}</p>
      <p
        className={`mt-1 font-extrabold leading-tight text-zinc-900 ${sub ? 'text-sm md:text-base' : 'text-xl md:text-2xl'}`}
      >
        {value}
      </p>
    </div>
  );
}
