'use client';

import Link from 'next/link';
import React, { Suspense, useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { useStaffBundle } from '@/hooks/useStaffBundle';
import { useStaffRealtime } from '@/hooks/useStaffRealtime';
import {
  breakMinutesForDay,
  findShiftForToday,
  formatMinutesHuman,
  plannedShiftMinutes,
  sortEntriesByTime,
  todayYmd,
  workedMinutesForDay,
} from '@/lib/staff/attendance-logic';
import { buildStaffPermissions } from '@/lib/staff/permissions';
import { hintForEmployeeDay } from '@/lib/staff/staff-heuristics';
import { shiftDateTimeIso, startOfWeekMonday, ymdLocal } from '@/lib/staff/staff-dates';
import { zoneLabel } from '@/lib/staff/staff-zone-styles';
import { staffDisplayName } from '@/lib/staff/staff-supabase';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const HINT_LABEL: Record<string, string> = {
  late: 'Retraso',
  no_clock_in: 'Sin fichar',
  incomplete: 'Jornada abierta',
  early_out: 'Salida temprana',
  ok: 'Correcto',
  none: 'Sin plan',
};

/** Estado resumido para lectura rápida */
function estadoResumido(hint: string): string {
  if (hint === 'ok') return 'OK';
  if (hint === 'late') return 'Retraso';
  if (hint === 'no_clock_in') return 'Sin fichar';
  if (hint === 'none') return 'Sin plan';
  return HINT_LABEL[hint] ?? hint;
}

function hintStyles(hint: string): string {
  if (hint === 'ok') return 'bg-emerald-100 text-emerald-900 ring-emerald-200';
  if (hint === 'none') return 'bg-zinc-100 text-zinc-600 ring-zinc-200';
  return 'bg-amber-100 text-amber-950 ring-amber-300';
}

const CONTROL_FILTERS = new Set([
  'equipo',
  'planif_hoy',
  'ficharon',
  'pendientes',
  'retrasos',
  'incidencias',
  'horas_plan',
  'horas_trabajadas',
]);

const FILTER_TAGLINES: Record<string, string> = {
  equipo: 'Todo el equipo activo del local.',
  planif_hoy: 'Personal con turno asignado hoy.',
  ficharon: 'Fichaje alineado con el plan previsto.',
  pendientes: 'Sin fichar la entrada (con turno planificado).',
  retrasos: 'Retraso al fichar o sin fichar tras la hora prevista.',
  incidencias: 'Con incidencia de asistencia abierta.',
  horas_plan: 'Horas planificadas hoy (orden por duración del turno).',
  horas_trabajadas: 'Horas fichadas hoy (orden por tiempo trabajado).',
};

function PersonalControlInner() {
  const searchParams = useSearchParams();
  const filterKey = useMemo(() => {
    const f = searchParams.get('filter');
    return f && CONTROL_FILTERS.has(f) ? f : null;
  }, [searchParams]);

  const { localId, profileRole, profileReady } = useAuth();
  const perms = useMemo(() => buildStaffPermissions(profileRole), [profileRole]);
  const [day, setDay] = useState(() => todayYmd());
  const weekStart = useMemo(() => ymdLocal(startOfWeekMonday(new Date(day + 'T12:00:00'))), [day]);
  const { employees, shifts, timeEntries, incidents, loading, error, reload } = useStaffBundle(
    localId,
    weekStart,
  );

  const onRt = useCallback(() => void reload(), [reload]);
  useStaffRealtime(localId, onRt);

  const openIncidentsByEmployee = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of incidents) {
      if (i.status !== 'open') continue;
      m.set(i.employeeId, (m.get(i.employeeId) ?? 0) + 1);
    }
    return m;
  }, [incidents]);

  const rows = useMemo(() => {
    const dayEntriesByEmp = new Map<string, typeof timeEntries>();
    for (const e of timeEntries) {
      const y = new Date(e.occurredAt);
      const ymd = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
      if (ymd !== day) continue;
      const list = dayEntriesByEmp.get(e.employeeId) ?? [];
      list.push(e);
      dayEntriesByEmp.set(e.employeeId, list);
    }
    return employees.map((e) => {
      const raw = dayEntriesByEmp.get(e.id) ?? [];
      const sorted = sortEntriesByTime(raw);
      const planned = findShiftForToday(shifts, e.id, day);
      const worked = workedMinutesForDay(sorted);
      const br = breakMinutesForDay(sorted);
      const plannedM = planned ? plannedShiftMinutes(planned) : 0;
      const { hint } = hintForEmployeeDay(shifts, timeEntries, e.id, day);
      const firstIn = sorted.find((x) => x.eventType === 'clock_in');
      const lastOut = [...sorted].reverse().find((x) => x.eventType === 'clock_out');
      let entryDelayMin: number | null = null;
      if (planned && firstIn) {
        const plannedStart = shiftDateTimeIso(planned.shiftDate, planned.startTime);
        entryDelayMin = Math.round((Date.parse(firstIn.occurredAt) - plannedStart) / 60000);
      }
      return {
        e,
        planned,
        worked,
        br,
        plannedM,
        hint,
        firstIn,
        lastOut,
        delta: worked - plannedM,
        entryDelayMin,
      };
    });
  }, [employees, shifts, timeEntries, day]);

  const displayedRows = useMemo(() => {
    const byName = (a: (typeof rows)[0], b: (typeof rows)[0]) =>
      staffDisplayName(a.e).localeCompare(staffDisplayName(b.e), 'es');
    if (!filterKey) return rows;
    switch (filterKey) {
      case 'equipo':
        return [...rows].sort(byName);
      case 'planif_hoy':
        return [...rows.filter((r) => r.planned)].sort(byName);
      case 'ficharon':
        return [...rows.filter((r) => r.hint === 'ok')].sort(byName);
      case 'pendientes':
        return [...rows.filter((r) => r.planned && !r.firstIn)].sort(byName);
      case 'retrasos':
        return [...rows.filter((r) => r.hint === 'late' || r.hint === 'no_clock_in')].sort(byName);
      case 'incidencias':
        return [...rows.filter((r) => openIncidentsByEmployee.has(r.e.id))].sort(byName);
      case 'horas_plan':
        return [...rows.filter((r) => r.planned)].sort((a, b) => b.plannedM - a.plannedM);
      case 'horas_trabajadas':
        return [...rows.filter((r) => r.worked > 0)].sort((a, b) => b.worked - a.worked);
      default:
        return rows;
    }
  }, [rows, filterKey, openIncidentsByEmployee]);

  const dayDate = useMemo(() => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [day]);

  const shiftDayLabel = (d: Date) =>
    d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

  const heroTagline = filterKey
    ? FILTER_TAGLINES[filterKey] ?? 'Vista filtrada del equipo.'
    : 'Plan vs fichaje real: estados claros para cocina y sala.';

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!localId) return <p className="text-sm text-amber-800">Sin local asignado.</p>;
  if (!perms.canViewTeamSummary) {
    return (
      <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
        Solo encargados y administradores ven el control del día.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <MermasStyleHero
        eyebrow="Jefe de turno"
        title="Control de personal"
        tagline={heroTagline}
        compact
      />

      {filterKey ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-100 px-3 py-2.5 text-sm ring-1 ring-zinc-200/80">
          <span className="font-semibold text-zinc-800">Vista filtrada desde el resumen</span>
          <Link
            href="/personal/control"
            className="shrink-0 font-extrabold text-[#D32F2F] underline-offset-2 hover:underline"
          >
            Quitar filtro
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-xl border border-zinc-200 bg-white p-2 shadow-sm"
            onClick={() => {
              const t = new Date(day + 'T12:00:00');
              t.setDate(t.getDate() - 1);
              setDay(ymdLocal(t));
            }}
            aria-label="Día anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="min-w-[10rem] text-center text-sm font-extrabold capitalize text-zinc-900">
            {shiftDayLabel(dayDate)}
          </span>
          <button
            type="button"
            className="rounded-xl border border-zinc-200 bg-white p-2 shadow-sm"
            onClick={() => {
              const t = new Date(day + 'T12:00:00');
              t.setDate(t.getDate() + 1);
              setDay(ymdLocal(t));
            }}
            aria-label="Día siguiente"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDay(todayYmd())}
          className="rounded-2xl bg-zinc-900 px-4 py-2.5 text-xs font-extrabold text-white"
        >
          Hoy
        </button>
      </div>

      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">{error}</p> : null}
      {loading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}

      {!loading && displayedRows.length === 0 ? (
        <p className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-200">
          No hay empleados en este filtro para la fecha seleccionada.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {displayedRows.map(
          ({ e, planned, worked, br, plannedM, hint, firstIn, lastOut, delta, entryDelayMin }) => (
            <article
              key={e.id}
              className="rounded-3xl border border-zinc-200/90 bg-white p-4 shadow-sm ring-1 ring-zinc-100"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-extrabold text-zinc-900">{staffDisplayName(e)}</p>
                  {e.operationalRole ? (
                    <p className="truncate text-xs font-medium text-zinc-500">{e.operationalRole}</p>
                  ) : null}
                </div>
                <span
                  className={[
                    'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ring-1',
                    hintStyles(hint),
                  ].join(' ')}
                >
                  {HINT_LABEL[hint] ?? hint}
                </span>
              </div>

              <p className="mt-2 text-[11px] font-semibold text-zinc-600">
                Estado: <span className="text-zinc-900">{estadoResumido(hint)}</span>
                {openIncidentsByEmployee.has(e.id) ? (
                  <span className="ml-1.5 text-amber-800">
                    · {openIncidentsByEmployee.get(e.id)} incid. abierta(s)
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-zinc-600">
                Diferencia (real vs plan):{' '}
                <span
                  className={
                    plannedM > 0
                      ? delta > 10
                        ? 'text-emerald-700'
                        : delta < -10
                          ? 'text-red-700'
                          : 'text-zinc-900'
                      : 'text-zinc-500'
                  }
                >
                  {plannedM > 0 ? (
                    <>
                      {delta >= 0 ? '+' : ''}
                      {delta} min
                    </>
                  ) : (
                    '—'
                  )}
                </span>
                {entryDelayMin != null && entryDelayMin > 0 ? (
                  <span className="ml-1.5 text-zinc-500">
                    (entrada +{entryDelayMin} min vs plan)
                  </span>
                ) : null}
                {planned && !firstIn && (hint === 'no_clock_in' || hint === 'late') ? (
                  <span className="ml-1.5 text-amber-800">(sin entrada fichada)</span>
                ) : null}
              </p>

              <div className="mt-3 space-y-2 rounded-2xl bg-zinc-50 px-3 py-2.5 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold text-zinc-500">Plan</span>
                  <span className="text-right font-bold text-zinc-900">
                    {planned ? (
                      <>
                        {planned.startTime.slice(0, 5)} – {planned.endTime.slice(0, 5)}
                        {planned.zone ? (
                          <span className="block text-xs font-medium text-zinc-600">
                            {zoneLabel(planned.zone)}
                          </span>
                        ) : null}
                        <span className="block text-[11px] font-semibold text-zinc-500">
                          {formatMinutesHuman(plannedM)} previstas
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
                <div className="flex justify-between gap-2 border-t border-zinc-200/80 pt-2">
                  <span className="font-semibold text-zinc-500">Real</span>
                  <span className="text-right font-bold text-zinc-900">
                    {firstIn ? (
                      <span className="block">
                        Entrada{' '}
                        {new Date(firstIn.occurredAt).toLocaleTimeString('es', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    ) : (
                      <span className="text-zinc-400">Sin entrada</span>
                    )}
                    {lastOut ? (
                      <span className="block text-xs font-semibold text-zinc-700">
                        Salida{' '}
                        {new Date(lastOut.occurredAt).toLocaleTimeString('es', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="flex justify-between gap-2 border-t border-zinc-200/80 pt-2 text-xs">
                  <span className="font-semibold text-zinc-500">Trabajado</span>
                  <span className="font-extrabold text-zinc-900">{formatMinutesHuman(worked)}</span>
                </div>
                {br > 0 ? (
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="font-semibold text-zinc-500">Descanso</span>
                    <span className="font-bold text-zinc-800">{formatMinutesHuman(br)}</span>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-zinc-100 pt-3">
                <Link
                  href="/personal/registro"
                  className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-[10px] font-extrabold text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-200/80"
                >
                  Editar fichaje
                </Link>
                <Link
                  href="/personal/incidencias"
                  className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-[10px] font-extrabold text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-200/80"
                >
                  Marcar incidencia
                </Link>
                <Link
                  href="/personal/registro"
                  className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] font-extrabold text-amber-950 ring-1 ring-amber-200/90 hover:bg-amber-100/90"
                >
                  Justificar retraso
                </Link>
              </div>
            </article>
          ),
        )}
      </div>
    </div>
  );
}

export default function PersonalControlPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Cargando…</p>}>
      <PersonalControlInner />
    </Suspense>
  );
}
