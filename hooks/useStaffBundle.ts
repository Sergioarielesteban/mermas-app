'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase-client';
import {
  fetchIncidents,
  fetchShiftsRange,
  fetchStaffEmployees,
  fetchTimeEntriesRange,
} from '@/lib/staff/staff-supabase';
import type { StaffEmployee, StaffIncident, StaffShift, StaffTimeEntry } from '@/lib/staff/types';
import { addDays, ymdLocal } from '@/lib/staff/staff-dates';

export function useStaffBundle(localId: string | null, weekStartMondayYmd: string) {
  const [employees, setEmployees] = useState<StaffEmployee[]>([]);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [timeEntries, setTimeEntries] = useState<StaffTimeEntry[]>([]);
  const [incidents, setIncidents] = useState<StaffIncident[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!localId) {
      setEmployees([]);
      setShifts([]);
      setTimeEntries([]);
      setIncidents([]);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase no disponible');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const ws = new Date(weekStartMondayYmd + 'T12:00:00');
      const we = addDays(ws, 6);
      const fromYmd = weekStartMondayYmd;
      const toYmd = ymdLocal(we);
      const startDay = new Date(weekStartMondayYmd + 'T00:00:00');
      const endDay = addDays(startDay, 7);
      endDay.setMilliseconds(-1);
      const [em, sh, te, inc] = await Promise.all([
        fetchStaffEmployees(supabase, localId),
        fetchShiftsRange(supabase, localId, fromYmd, toYmd),
        fetchTimeEntriesRange(supabase, localId, startDay.toISOString(), endDay.toISOString()),
        fetchIncidents(supabase, localId, fromYmd, toYmd),
      ]);
      setEmployees(em.filter((e) => e.active));
      setShifts(sh);
      setTimeEntries(te);
      setIncidents(inc);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos de personal');
    } finally {
      setLoading(false);
    }
  }, [localId, weekStartMondayYmd]);

  const patchShiftLocal = useCallback((shiftId: string, patch: Partial<StaffShift>) => {
    setShifts((prev) => prev.map((s) => (s.id === shiftId ? { ...s, ...patch } : s)));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { employees, shifts, timeEntries, incidents, loading, error, reload, patchShiftLocal };
}
