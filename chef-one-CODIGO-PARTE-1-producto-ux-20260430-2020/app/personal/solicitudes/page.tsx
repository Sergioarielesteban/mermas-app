'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { PersonalSectionNav } from '@/components/staff/StaffPersonalShell';
import { useAuth } from '@/components/AuthProvider';
import { buildStaffPermissions } from '@/lib/staff/permissions';
import {
  fetchStaffEmployees,
  fetchStaffRequests,
  setStaffRequestStatus,
  staffDisplayName,
} from '@/lib/staff/staff-supabase';
import { getSupabaseClient } from '@/lib/supabase-client';
import type { StaffEmployee, StaffRequest } from '@/lib/staff/types';

export default function PersonalSolicitudesManagerPage() {
  const { localId, profileReady, profileRole } = useAuth();
  const permissions = useMemo(() => buildStaffPermissions(profileRole), [profileRole]);

  const [employees, setEmployees] = useState<StaffEmployee[]>([]);
  const [rows, setRows] = useState<StaffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoading(true);
    setErr(null);
    try {
      const [em, req] = await Promise.all([
        fetchStaffEmployees(supabase, localId),
        fetchStaffRequests(supabase, localId),
      ]);
      setEmployees(em.filter((e) => e.active));
      setRows(req);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [localId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, status: 'approved' | 'rejected') => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusyId(id);
    setErr(null);
    try {
      await setStaffRequestStatus(supabase, id, status);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusyId(null);
    }
  };

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!localId) return <p className="text-sm text-amber-800">Sin local.</p>;
  if (!permissions.canManageEmployees) {
    return (
      <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
        Solo administración puede gestionar solicitudes aquí. Los empleados usan «Mi espacio → Pedidos».
      </p>
    );
  }

  const pending = rows.filter((r) => r.status === 'pending');
  const rest = rows.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-4">
      <MermasStyleHero
        eyebrow="Gestión"
        title="Solicitudes del equipo"
        tagline="Días libres y otras peticiones. Responde en un toque."
        compact
      />
      <PersonalSectionNav />
      {err ? <p className="text-sm font-semibold text-red-700">{err}</p> : null}
      {loading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}

      <section className="space-y-2">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Pendientes</h2>
        {pending.length === 0 ? (
          <p className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600 ring-1 ring-zinc-200">
            No hay solicitudes pendientes.
          </p>
        ) : (
          <ul className="space-y-2">
            {pending.map((r) => {
              const em = employees.find((e) => e.id === r.employeeId);
              return (
                <li
                  key={r.id}
                  className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 ring-1 ring-amber-100"
                >
                  <p className="font-extrabold text-zinc-900">{em ? staffDisplayName(em) : 'Empleado'}</p>
                  <p className="mt-1 text-sm text-zinc-700">
                    {r.requestType === 'time_off' ? 'Día(s) libre(s)' : 'Otro'} ·{' '}
                    {new Date(r.startDate + 'T12:00:00').toLocaleDateString('es-ES')}
                    {r.endDate && r.endDate !== r.startDate
                      ? ` → ${new Date(r.endDate + 'T12:00:00').toLocaleDateString('es-ES')}`
                      : ''}
                  </p>
                  {r.notes?.trim() ? (
                    <p className="mt-2 text-sm leading-relaxed text-zinc-800">{r.notes.trim()}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => void act(r.id, 'approved')}
                      className="min-h-[48px] flex-1 rounded-2xl bg-emerald-600 px-4 text-sm font-extrabold text-white disabled:opacity-50"
                    >
                      Aprobar
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => void act(r.id, 'rejected')}
                      className="min-h-[48px] flex-1 rounded-2xl border border-red-300 bg-white px-4 text-sm font-extrabold text-red-800 disabled:opacity-50"
                    >
                      Rechazar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Historial reciente</h2>
        <ul className="space-y-1.5">
          {rest.slice(0, 20).map((r) => {
            const em = employees.find((e) => e.id === r.employeeId);
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2 text-sm ring-1 ring-zinc-100"
              >
                <span className="font-semibold text-zinc-800">{em ? staffDisplayName(em) : '—'}</span>
                <span
                  className={[
                    'rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase',
                    r.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-700',
                  ].join(' ')}
                >
                  {r.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
