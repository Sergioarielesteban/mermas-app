'use client';

import React, { useCallback, useMemo, useState } from 'react';
import MermasStyleHero from '@/components/MermasStyleHero';
import ClockPanel from '@/components/staff/ClockPanel';
import { useAuth } from '@/components/AuthProvider';
import { useStaffBundle } from '@/hooks/useStaffBundle';
import { useStaffRealtime } from '@/hooks/useStaffRealtime';
import { buildStaffPermissions } from '@/lib/staff/permissions';
import { startOfWeekMonday, ymdLocal } from '@/lib/staff/staff-dates';
import { todayYmd } from '@/lib/staff/attendance-logic';
import { filterEntriesForLocalDay } from '@/lib/staff/staff-heuristics';
import { getSupabaseClient } from '@/lib/supabase-client';

export default function PersonalFichajePage() {
  const { localId, profileRole, profileReady, userId } = useAuth();
  const perms = useMemo(() => buildStaffPermissions(profileRole), [profileRole]);
  const [weekStart] = useState(() => ymdLocal(startOfWeekMonday(new Date())));
  const { employees, shifts, timeEntries, loading, error, reload } = useStaffBundle(localId, weekStart);

  const ymd = todayYmd();
  const entriesToday = useMemo(() => filterEntriesForLocalDay(timeEntries, ymd), [timeEntries, ymd]);

  const onRt = useCallback(() => void reload(), [reload]);
  useStaffRealtime(localId, onRt);

  const supabase = getSupabaseClient();

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!localId) return <p className="text-sm text-amber-800">Sin local asignado.</p>;
  if (!supabase) return <p className="text-sm text-red-700">Supabase no disponible.</p>;

  return (
    <div className="space-y-4">
      <MermasStyleHero
        eyebrow="Fichaje"
        title="Entrada y salida"
        tagline="Botones grandes, secuencia guiada y PIN opcional."
        compact
      />
      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">{error}</p> : null}
      {loading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}
      <ClockPanel
        supabase={supabase}
        employees={employees}
        shifts={shifts}
        entriesToday={entriesToday}
        permissions={perms}
        authUserId={userId}
        onRecorded={() => void reload()}
      />
    </div>
  );
}
