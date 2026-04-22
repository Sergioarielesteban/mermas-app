'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase-client';
import {
  fetchIncidents,
  fetchShiftsRange,
  fetchStaffEmployees,
  fetchStaffScheduleDayMarksRange,
  fetchTimeEntriesRange,
} from '@/lib/staff/staff-supabase';
import type {
  StaffEmployee,
  StaffIncident,
  StaffScheduleDayMark,
  StaffShift,
  StaffTimeEntry,
} from '@/lib/staff/types';
import { addDays, ymdLocal } from '@/lib/staff/staff-dates';

const STAFF_BUNDLE_CACHE_TTL_MS = 2 * 60 * 1000;

type StaffBundleSnapshot = {
  employees: StaffEmployee[];
  shifts: StaffShift[];
  timeEntries: StaffTimeEntry[];
  incidents: StaffIncident[];
  scheduleDayMarks: StaffScheduleDayMark[];
  loadedAt: number;
};

const staffBundleCache = new Map<string, StaffBundleSnapshot>();
const staffBundleInflight = new Map<string, Promise<StaffBundleSnapshot>>();

export function useStaffBundle(localId: string | null, weekStartMondayYmd: string) {
  const [employees, setEmployees] = useState<StaffEmployee[]>([]);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [timeEntries, setTimeEntries] = useState<StaffTimeEntry[]>([]);
  const [incidents, setIncidents] = useState<StaffIncident[]>([]);
  const [scheduleDayMarks, setScheduleDayMarks] = useState<StaffScheduleDayMark[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bundleKey = localId ? `${localId}|${weekStartMondayYmd}` : null;

  const applySnapshot = useCallback((snapshot: StaffBundleSnapshot) => {
    setEmployees(snapshot.employees);
    setShifts(snapshot.shifts);
    setTimeEntries(snapshot.timeEntries);
    setIncidents(snapshot.incidents);
    setScheduleDayMarks(snapshot.scheduleDayMarks);
  }, []);

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    const force = opts?.silent === false;
    if (!localId || !bundleKey) {
      setEmployees([]);
      setShifts([]);
      setTimeEntries([]);
      setIncidents([]);
      setScheduleDayMarks([]);
      setLoading(false);
      return;
    }

    const cached = staffBundleCache.get(bundleKey);
    if (!force && cached && Date.now() - cached.loadedAt < STAFF_BUNDLE_CACHE_TTL_MS) {
      applySnapshot(cached);
      setError(null);
      setLoading(false);
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase no disponible');
      return;
    }
    if (!silent) setLoading(true);
    setError(null);
    const existingInflight = staffBundleInflight.get(bundleKey);
    const fetchPromise =
      existingInflight ??
      (async () => {
        const ws = new Date(weekStartMondayYmd + 'T12:00:00');
        const we = addDays(ws, 6);
        const fromYmd = weekStartMondayYmd;
        const toYmd = ymdLocal(we);
        const startDay = new Date(weekStartMondayYmd + 'T00:00:00');
        const endDay = addDays(startDay, 7);
        endDay.setMilliseconds(-1);
        const [em, sh, te, inc, marks] = await Promise.all([
          fetchStaffEmployees(supabase, localId),
          fetchShiftsRange(supabase, localId, fromYmd, toYmd),
          fetchTimeEntriesRange(supabase, localId, startDay.toISOString(), endDay.toISOString()),
          fetchIncidents(supabase, localId, fromYmd, toYmd),
          fetchStaffScheduleDayMarksRange(supabase, localId, fromYmd, toYmd).catch(
            () => [] as StaffScheduleDayMark[],
          ),
        ]);
        return {
          employees: em.filter((e) => e.active),
          shifts: sh,
          timeEntries: te,
          incidents: inc,
          scheduleDayMarks: marks,
          loadedAt: Date.now(),
        } satisfies StaffBundleSnapshot;
      })();

    if (!existingInflight) {
      staffBundleInflight.set(bundleKey, fetchPromise);
    }

    try {
      const snapshot = await fetchPromise;
      staffBundleCache.set(bundleKey, snapshot);
      applySnapshot(snapshot);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos de personal');
    } finally {
      if (staffBundleInflight.get(bundleKey) === fetchPromise) {
        staffBundleInflight.delete(bundleKey);
      }
      if (!silent) setLoading(false);
    }
  }, [applySnapshot, bundleKey, localId, weekStartMondayYmd]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { employees, shifts, timeEntries, incidents, scheduleDayMarks, loading, error, reload };
}
