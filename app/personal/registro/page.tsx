'use client';

import React, { useEffect, useMemo, useState } from 'react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { buildStaffPermissions } from '@/lib/staff/permissions';
import {
  findShiftForToday,
  formatMinutesHuman,
  plannedShiftMinutes,
  sortEntriesByTime,
  workedMinutesForDay,
} from '@/lib/staff/attendance-logic';
import { hintForEmployeeDay } from '@/lib/staff/staff-heuristics';
import { staffDisplayName } from '@/lib/staff/staff-supabase';
import { fetchShiftsRange, fetchStaffEmployees, fetchTimeEntriesRange } from '@/lib/staff/staff-supabase';
import { getSupabaseClient } from '@/lib/supabase-client';
import type { StaffEmployee, StaffShift, StaffTimeEntry } from '@/lib/staff/types';

const HINT_LABEL: Record<string, string> = {
  late: 'Retraso',
  no_clock_in: 'Sin entrada',
  incomplete: 'Jornada abierta',
  early_out: 'Salida temprana',
  ok: 'OK',
  none: '—',
};

export default function PersonalRegistroPage() {
  const { localId, profileRole, profileReady, userId } = useAuth();
  const perms = useMemo(() => buildStaffPermissions(profileRole), [profileRole]);
  const [day, setDay] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [empFilter, setEmpFilter] = useState('');
  const [employees, setEmployees] = useState<StaffEmployee[]>([]);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [entries, setEntries] = useState<StaffTimeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const start = new Date(day + 'T00:00:00');
        const end = new Date(day + 'T23:59:59');
        const [em, sh, te] = await Promise.all([
          fetchStaffEmployees(supabase, localId),
          fetchShiftsRange(supabase, localId, day, day),
          fetchTimeEntriesRange(supabase, localId, start.toISOString(), end.toISOString()),
        ]);
        if (cancelled) return;
        setEmployees(em.filter((e) => e.active));
        setShifts(sh);
        setEntries(te);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [localId, day]);

  const rows = useMemo(() => {
    const linked = employees.find((e) => e.userId === userId);
    let list = employees;
    if (!perms.canViewTeamSummary && linked) list = [linked];
    if (empFilter.trim()) {
      const q = empFilter.trim().toLowerCase();
      list = list.filter((e) => staffDisplayName(e).toLowerCase().includes(q));
    }
    return list.map((e) => {
      const dayEntries = sortEntriesByTime(entries.filter((x) => x.employeeId === e.id));
      const planned = findShiftForToday(shifts, e.id, day);
      const worked = workedMinutesForDay(dayEntries);
      const plannedM = planned ? plannedShiftMinutes(planned) : 0;
      const hint = hintForEmployeeDay(shifts, entries, e.id, day);
      const firstIn = dayEntries.find((x) => x.eventType === 'clock_in');
      const lastOut = [...dayEntries].reverse().find((x) => x.eventType === 'clock_out');
      return {
        e,
        planned,
        worked,
        plannedM,
        hint: hint.hint,
        firstIn,
        lastOut,
        delta: worked - plannedM,
      };
    });
  }, [employees, entries, shifts, day, empFilter, perms.canViewTeamSummary, userId]);

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!localId) return <p className="text-sm text-amber-800">Sin local.</p>;

  return (
    <div className="space-y-4">
      <MermasStyleHero eyebrow="Control horario" title="Registro diario" compact />

      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm font-bold"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
        {perms.canViewTeamSummary ? (
          <input
            className="min-w-[160px] flex-1 rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
            placeholder="Filtrar por nombre…"
            value={empFilter}
            onChange={(e) => setEmpFilter(e.target.value)}
          />
        ) : (
          <p className="text-xs text-zinc-500">Solo ves tu registro.</p>
        )}
      </div>

      {err ? <p className="text-sm font-semibold text-red-700">{err}</p> : null}
      {loading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}

      <div className="overflow-x-auto rounded-2xl ring-1 ring-zinc-200">
        <table className="min-w-[720px] w-full text-left text-xs sm:text-sm">
          <thead className="bg-zinc-50 text-[10px] font-extrabold uppercase text-zinc-500">
            <tr>
              <th className="px-2 py-2 sm:px-3">Persona</th>
              <th className="px-2 py-2">Plan</th>
              <th className="px-2 py-2">Entrada</th>
              <th className="px-2 py-2">Salida</th>
              <th className="px-2 py-2">Trab.</th>
              <th className="px-2 py-2">Δ</th>
              <th className="px-2 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, planned, worked, plannedM, hint, firstIn, lastOut, delta }) => (
              <tr key={e.id} className="border-t border-zinc-100">
                <td className="px-2 py-2 font-bold text-zinc-900 sm:px-3">{staffDisplayName(e)}</td>
                <td className="px-2 py-2 text-zinc-600">
                  {planned
                    ? `${planned.startTime.slice(0, 5)}–${planned.endTime.slice(0, 5)}`
                    : '—'}
                </td>
                <td className="px-2 py-2">
                  {firstIn
                    ? new Date(firstIn.occurredAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </td>
                <td className="px-2 py-2">
                  {lastOut
                    ? new Date(lastOut.occurredAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </td>
                <td className="px-2 py-2 font-semibold">{formatMinutesHuman(worked)}</td>
                <td
                  className={[
                    'px-2 py-2 font-bold',
                    delta > 10 ? 'text-emerald-700' : delta < -10 ? 'text-red-700' : 'text-zinc-600',
                  ].join(' ')}
                >
                  {plannedM ? `${delta >= 0 ? '+' : ''}${delta} min` : '—'}
                </td>
                <td className="px-2 py-2">
                  <span
                    className={[
                      'rounded-full px-2 py-0.5 text-[10px] font-extrabold',
                      hint === 'ok' || hint === 'none'
                        ? 'bg-zinc-100 text-zinc-700'
                        : 'bg-amber-100 text-amber-900',
                    ].join(' ')}
                  >
                    {HINT_LABEL[hint] ?? hint}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
