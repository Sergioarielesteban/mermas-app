'use client';

import React, { useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useStaffBundle } from '@/hooks/useStaffBundle';
import { useLinkedStaffEmployee } from '@/lib/staff/useLinkedStaffEmployee';
import { startOfWeekMonday, ymdLocal } from '@/lib/staff/staff-dates';
import { staffDisplayName } from '@/lib/staff/staff-supabase';
import { zoneLabel } from '@/lib/staff/staff-zone-styles';
import { todayYmd } from '@/lib/staff/attendance-logic';

export default function PersonalMiEquipoPage() {
  const { localId, profileReady, userId } = useAuth();
  const [weekStart] = useState(() => ymdLocal(startOfWeekMonday(new Date())));
  const { employees, shifts, loading, error } = useStaffBundle(localId, weekStart);
  const linked = useLinkedStaffEmployee(employees, userId);
  const ymd = todayYmd();

  const mates = useMemo(() => {
    const ids = new Set(shifts.filter((s) => s.shiftDate === ymd).map((s) => s.employeeId));
    return employees.filter((e) => ids.has(e.id) && e.id !== linked?.id);
  }, [employees, shifts, ymd, linked?.id]);

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!localId) return <p className="text-sm text-amber-800">Sin local.</p>;
  if (!linked) {
    return <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Vincula tu usuario en Equipo.</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold text-zinc-900">Compañeros hoy</h1>
      <p className="text-sm text-zinc-600">Quién tiene turno contigo en este local.</p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}

      <ul className="space-y-2">
        {mates.length === 0 ? (
          <li className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600 ring-1 ring-zinc-200">
            No hay otros compañeros con turno hoy, o aún no está publicado el cuadrante.
          </li>
        ) : (
          mates.map((e) => {
            const s = shifts.find((sh) => sh.employeeId === e.id && sh.shiftDate === ymd);
            return (
              <li
                key={e.id}
                className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm"
              >
                <span
                  className="h-10 w-1.5 shrink-0 rounded-full"
                  style={{ background: e.color ?? '#D32F2F' }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-zinc-900">{staffDisplayName(e)}</p>
                  {s ? (
                    <p className="text-sm font-semibold text-zinc-600">
                      {s.startTime.slice(0, 5)} – {s.endTime.slice(0, 5)}
                      {s.zone ? ` · ${zoneLabel(s.zone)}` : ''}
                    </p>
                  ) : (
                    <p className="text-sm text-zinc-500">Turno hoy</p>
                  )}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
