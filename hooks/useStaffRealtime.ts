'use client';

import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase-client';

/**
 * Refresco ligero cuando cambian fichajes, turnos o incidencias del local.
 */
export function useStaffRealtime(localId: string | null, onEvent: () => void) {
  useEffect(() => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let ch: RealtimeChannel | null = null;
    let t: number | null = null;
    const schedule = () => {
      if (t != null) window.clearTimeout(t);
      t = window.setTimeout(() => {
        t = null;
        onEvent();
      }, 400);
    };
    ch = supabase
      .channel(`staff-rt:${localId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff_time_entries', filter: `local_id=eq.${localId}` },
        schedule,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff_shifts', filter: `local_id=eq.${localId}` },
        schedule,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'staff_attendance_incidents',
          filter: `local_id=eq.${localId}`,
        },
        schedule,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'staff_schedule_day_marks',
          filter: `local_id=eq.${localId}`,
        },
        schedule,
      )
      .subscribe();
    return () => {
      if (t != null) window.clearTimeout(t);
      if (ch) void supabase.removeChannel(ch);
    };
  }, [localId, onEvent]);
}
