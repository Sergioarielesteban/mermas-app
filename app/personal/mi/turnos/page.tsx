'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useStaffBundle } from '@/hooks/useStaffBundle';
import { useLinkedStaffEmployee } from '@/lib/staff/useLinkedStaffEmployee';
import { fetchShiftsRange } from '@/lib/staff/staff-supabase';
import { getSupabaseClient } from '@/lib/supabase-client';
import { addDays, parseYmd, startOfWeekMonday, ymdLocal } from '@/lib/staff/staff-dates';
import { fetchStaffWeekPublication, type StaffWeekPublication } from '@/lib/staff/staff-week-publication';
import { zoneLabel } from '@/lib/staff/staff-zone-styles';
import type { StaffShift } from '@/lib/staff/types';
import { plannedShiftMinutes } from '@/lib/staff/attendance-logic';

export default function PersonalMiTurnosPage() {
  const { localId, profileReady, userId } = useAuth();
  const searchParams = useSearchParams();
  const semanaQuery = searchParams.get('semana');
  const [weekStart] = useState(() => ymdLocal(startOfWeekMonday(new Date())));
  const publicationWeekMonday = useMemo(() => {
    if (semanaQuery && /^\d{4}-\d{2}-\d{2}$/.test(semanaQuery)) return semanaQuery;
    return weekStart;
  }, [semanaQuery, weekStart]);
  const publicationWeekEnd = useMemo(
    () => ymdLocal(addDays(parseYmd(publicationWeekMonday), 6)),
    [publicationWeekMonday],
  );
  const { employees, loading: le, error: be } = useStaffBundle(localId, weekStart);
  const linked = useLinkedStaffEmployee(employees, userId);
  const [extra, setExtra] = useState<StaffShift[]>([]);
  const [loading2, setLoading2] = useState(false);
  const [weekPublication, setWeekPublication] = useState<StaffWeekPublication | null>(null);

  useEffect(() => {
    if (!localId || !linked) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const from = ymdLocal(new Date());
    const to = ymdLocal(addDays(new Date(), 20));
    let cancelled = false;
    setLoading2(true);
    void fetchShiftsRange(supabase, localId, from, to)
      .then((sh) => {
        if (!cancelled) setExtra(sh.filter((s) => s.employeeId === linked.id));
      })
      .finally(() => {
        if (!cancelled) setLoading2(false);
      });
    return () => {
      cancelled = true;
    };
  }, [localId, linked]);

  useEffect(() => {
    if (!localId || !linked) {
      setWeekPublication(null);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    void fetchStaffWeekPublication(supabase, localId, publicationWeekMonday).then((p) => {
      if (!cancelled) setWeekPublication(p);
    });
    return () => {
      cancelled = true;
    };
  }, [localId, linked, publicationWeekMonday]);

  const byDay = useMemo(() => {
    const m = new Map<string, StaffShift[]>();
    for (const s of extra) {
      const arr = m.get(s.shiftDate) ?? [];
      arr.push(s);
      m.set(s.shiftDate, arr);
    }
    for (const [, arr] of m) arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [extra]);

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!localId) return <p className="text-sm text-amber-800">Sin local.</p>;
  if (!linked) {
    return <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Vincula tu usuario en Equipo.</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold text-zinc-900">Mis turnos</h1>
      {weekPublication &&
      (weekPublication.status === 'published' || weekPublication.status === 'updated_after_publish') ? (
        <div
          className={[
            'rounded-2xl px-4 py-3 text-sm font-semibold ring-1',
            weekPublication.status === 'updated_after_publish'
              ? 'bg-amber-50 text-amber-950 ring-amber-200'
              : 'bg-emerald-50 text-emerald-950 ring-emerald-200',
          ].join(' ')}
        >
          <p className="font-extrabold text-zinc-900">
            Semana del {publicationWeekMonday} al {publicationWeekEnd}
          </p>
          <p className="mt-1">
            {weekPublication.status === 'updated_after_publish'
              ? 'Este cuadrante fue actualizado después de publicarse. Revisa tus turnos.'
              : 'Este es el horario publicado para esa semana.'}
          </p>
        </div>
      ) : null}
      {be ? <p className="text-sm text-red-700">{be}</p> : null}
      {le || loading2 ? <p className="text-sm text-zinc-500">Cargando…</p> : null}

      <div className="space-y-3">
        {byDay.length === 0 ? (
          <p className="text-sm text-zinc-600">No hay turnos próximos en el calendario.</p>
        ) : (
          byDay.map(([day, list]) => {
            const inPublishedWeek =
              weekPublication &&
              (weekPublication.status === 'published' ||
                weekPublication.status === 'updated_after_publish') &&
              day >= publicationWeekMonday &&
              day <= publicationWeekEnd;
            return (
            <section
              key={day}
              className={[
                'rounded-2xl border bg-white p-3 shadow-sm',
                inPublishedWeek
                  ? 'border-emerald-300 ring-2 ring-emerald-100'
                  : 'border-zinc-200',
              ].join(' ')}
            >
              <p className="text-xs font-extrabold uppercase text-zinc-500">
                {new Date(day + 'T12:00:00').toLocaleDateString('es-ES', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
              <ul className="mt-2 space-y-2">
                {list.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-xl bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-100"
                  >
                    <p className="text-base font-extrabold text-zinc-900">
                      {s.startTime.slice(0, 5)} – {s.endTime.slice(0, 5)}
                    </p>
                    <p className="text-sm font-semibold text-zinc-600">
                      {s.zone ? zoneLabel(s.zone) : 'Puesto por confirmar'} ·{' '}
                      {Math.round((plannedShiftMinutes(s) / 60) * 10) / 10} h
                    </p>
                  </li>
                ))}
              </ul>
            </section>
            );
          })
        )}
      </div>
    </div>
  );
}
