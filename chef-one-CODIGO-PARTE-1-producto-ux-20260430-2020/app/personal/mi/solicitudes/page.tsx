'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useStaffBundle } from '@/hooks/useStaffBundle';
import { canAccessMiEspacioPersonalContent } from '@/lib/staff/mi-espacio-access';
import { useLinkedStaffEmployee } from '@/lib/staff/useLinkedStaffEmployee';
import { createStaffRequest, fetchStaffRequests } from '@/lib/staff/staff-supabase';
import { getSupabaseClient } from '@/lib/supabase-client';
import { startOfWeekMonday, ymdLocal } from '@/lib/staff/staff-dates';
import type { StaffRequest } from '@/lib/staff/types';

export default function PersonalMiSolicitudesPage() {
  const { localId, profileReady, userId, profileRole } = useAuth();
  const [weekStart] = useState(() => ymdLocal(startOfWeekMonday(new Date())));
  const { employees, loading: le, error: be, reload } = useStaffBundle(localId, weekStart);
  const linked = useLinkedStaffEmployee(employees, userId);
  const canSeeMi = canAccessMiEspacioPersonalContent(linked, profileRole);
  const [rows, setRows] = useState<StaffRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => ymdLocal(new Date()));
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const loadReq = useCallback(async () => {
    if (!localId || !linked) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoading(true);
    try {
      const r = await fetchStaffRequests(supabase, localId, { employeeId: linked.id });
      setRows(r);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Error al cargar solicitudes');
    } finally {
      setLoading(false);
    }
  }, [localId, linked]);

  useEffect(() => {
    void loadReq();
  }, [loadReq]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localId || !linked) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    try {
      await createStaffRequest(supabase, {
        localId,
        employeeId: linked.id,
        requestType: 'time_off',
        startDate,
        endDate: endDate.trim() || null,
        notes: notes.trim() || null,
      });
      setNotes('');
      setEndDate('');
      await loadReq();
      void reload();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'No se pudo enviar');
    } finally {
      setBusy(false);
    }
  };

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!localId) return <p className="text-sm text-amber-800">Sin local.</p>;
  if (!canSeeMi) {
    return <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Vincula tu usuario en Equipo.</p>;
  }
  if (!linked) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-extrabold text-zinc-900">Solicitudes</h1>
        <p className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200">
          Para enviar solicitudes de ausencia necesitas una ficha vinculada. Hazlo en{' '}
          <strong>Personal → Equipo</strong> (editar empleado → Usuario asociado o «Vincularme a este empleado»).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold text-zinc-900">Solicitudes</h1>
      <p className="text-sm text-zinc-600">Pide días libres. Tu encargado las recibe en Personal → Solicitudes.</p>
      {be ? <p className="text-sm text-red-700">{be}</p> : null}
      {msg ? <p className="text-sm font-semibold text-amber-800">{msg}</p> : null}

      <form onSubmit={submit} className="space-y-3 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
        <label className="block text-xs font-extrabold uppercase text-zinc-500">
          Desde
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-3 text-base font-bold"
          />
        </label>
        <label className="block text-xs font-extrabold uppercase text-zinc-500">
          Hasta (opcional)
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-3 text-base font-bold"
          />
        </label>
        <label className="block text-xs font-extrabold uppercase text-zinc-500">
          Motivo
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
            placeholder="Ej.: boda, trámite médico…"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="min-h-[52px] w-full rounded-2xl bg-[#D32F2F] text-sm font-extrabold text-white disabled:opacity-50"
        >
          Enviar solicitud
        </button>
      </form>

      <section>
        <h2 className="text-xs font-extrabold uppercase text-zinc-500">Mis peticiones</h2>
        {le || loading ? <p className="mt-2 text-sm text-zinc-500">Cargando…</p> : null}
        <ul className="mt-2 space-y-2">
          {rows.length === 0 ? (
            <li className="text-sm text-zinc-500">Aún no has enviado ninguna.</li>
          ) : (
            rows.map((r) => (
              <li key={r.id} className="rounded-2xl bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-200">
                <p className="font-bold text-zinc-900">
                  {new Date(r.startDate + 'T12:00:00').toLocaleDateString('es-ES')}
                  {r.endDate && r.endDate !== r.startDate
                    ? ` → ${new Date(r.endDate + 'T12:00:00').toLocaleDateString('es-ES')}`
                    : ''}
                </p>
                <p className="text-xs font-extrabold uppercase text-zinc-500">
                  {r.status === 'pending' ? 'Pendiente' : r.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                </p>
                {r.notes?.trim() ? <p className="mt-1 text-sm text-zinc-700">{r.notes}</p> : null}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
