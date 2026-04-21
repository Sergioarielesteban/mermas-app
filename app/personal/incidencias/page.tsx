'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { PersonalSectionNav } from '@/components/staff/StaffPersonalShell';
import { useAuth } from '@/components/AuthProvider';
import { buildStaffPermissions } from '@/lib/staff/permissions';
import {
  createIncident,
  fetchIncidents,
  fetchStaffEmployees,
  resolveIncident,
  staffDisplayName,
} from '@/lib/staff/staff-supabase';
import { appAlert, appPrompt } from '@/lib/app-dialog-bridge';
import { getSupabaseClient } from '@/lib/supabase-client';
import type { StaffEmployee, StaffIncident, StaffIncidentStatus } from '@/lib/staff/types';

const TYPES: StaffIncident['incidentType'][] = [
  'late',
  'no_clock_in',
  'incomplete',
  'early_out',
  'overlap',
  'overtime',
  'unassigned',
  'other',
];

const TYPE_LABEL: Record<string, string> = {
  late: 'Retraso',
  no_clock_in: 'Sin fichar entrada',
  incomplete: 'Fichaje incompleto',
  early_out: 'Salida anticipada',
  overlap: 'Solapamiento',
  overtime: 'Horas extra',
  unassigned: 'Turno mal asignado',
  other: 'Otro',
};

export default function PersonalIncidenciasPage() {
  const { localId, profileRole, profileReady, userId } = useAuth();
  const perms = useMemo(() => buildStaffPermissions(profileRole), [profileRole]);
  const [rows, setRows] = useState<StaffIncident[]>([]);
  const [employees, setEmployees] = useState<StaffEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoading(true);
    try {
      const [inc, em] = await Promise.all([
        fetchIncidents(supabase, localId),
        fetchStaffEmployees(supabase, localId),
      ]);
      setRows(inc);
      setEmployees(em);
    } finally {
      setLoading(false);
    }
  }, [localId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = useMemo(() => {
    let r = filter === 'open' ? rows.filter((x) => x.status === 'open') : rows;
    if (!perms.canResolveIncidents && userId) {
      const mine = new Set(employees.filter((e) => e.userId === userId).map((e) => e.id));
      r = r.filter((i) => mine.has(i.employeeId));
    }
    return r;
  }, [rows, filter, perms.canResolveIncidents, employees, userId]);

  const resolve = async (id: string, status: StaffIncidentStatus) => {
    if (!perms.canResolveIncidents) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const note = (await appPrompt('Comentario de cierre (opcional)')) ?? '';
    setBusyId(id);
    try {
      await resolveIncident(supabase, id, { status, resolutionNote: note.trim() || null });
      await reload();
    } catch (e: unknown) {
      await appAlert(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusyId(null);
    }
  };

  const quickCreate = async () => {
    if (!perms.canResolveIncidents || !localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const empId = await appPrompt(
      'ID empleado (UUID) — mejor desde Equipo en una futura versión con selector',
    );
    if (!empId?.trim()) return;
    const tRaw = await appPrompt(`Tipo: ${TYPES.join(', ')}`, 'other');
    if (tRaw == null) return;
    const t = tRaw as StaffIncident['incidentType'];
    if (!TYPES.includes(t)) return;
    const d = new Date();
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    try {
      await createIncident(supabase, {
        localId,
        employeeId: empId.trim(),
        incidentDate: ymd,
        incidentType: t,
        description: 'Creada manualmente',
      });
      await reload();
    } catch (e: unknown) {
      await appAlert(e instanceof Error ? e.message : 'Error');
    }
  };

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!localId) return <p className="text-sm text-amber-800">Sin local.</p>;

  return (
    <div className="space-y-4">
      <MermasStyleHero eyebrow="Incidencias" title="Alertas de asistencia" compact />
      <PersonalSectionNav />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter('open')}
          className={`rounded-full px-4 py-2 text-xs font-extrabold ${filter === 'open' ? 'bg-zinc-900 text-white' : 'bg-zinc-100'}`}
        >
          Abiertas
        </button>
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-full px-4 py-2 text-xs font-extrabold ${filter === 'all' ? 'bg-zinc-900 text-white' : 'bg-zinc-100'}`}
        >
          Todas
        </button>
        {perms.canResolveIncidents ? (
          <button
            type="button"
            onClick={() => void quickCreate()}
            className="rounded-full bg-[#D32F2F]/15 px-4 py-2 text-xs font-extrabold text-[#D32F2F]"
          >
            + Manual (avanzado)
          </button>
        ) : null}
      </div>
      {loading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}
      <ul className="space-y-2">
        {visible.length === 0 ? (
          <li className="text-sm text-zinc-500">No hay incidencias en esta vista.</li>
        ) : (
          visible.map((i) => {
            const em = employees.find((e) => e.id === i.employeeId);
            return (
              <li key={i.id} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-extrabold text-zinc-900">
                      {em ? staffDisplayName(em) : 'Empleado'} · {i.incidentDate}
                    </p>
                    <p className="text-xs font-bold uppercase text-amber-800">
                      {TYPE_LABEL[i.incidentType] ?? i.incidentType}
                    </p>
                    {i.description ? <p className="mt-1 text-sm text-zinc-600">{i.description}</p> : null}
                  </div>
                  <span
                    className={[
                      'rounded-full px-2 py-1 text-[10px] font-extrabold',
                      i.status === 'open' ? 'bg-amber-100 text-amber-900' : 'bg-zinc-100 text-zinc-600',
                    ].join(' ')}
                  >
                    {i.status}
                  </span>
                </div>
                {perms.canResolveIncidents && i.status === 'open' ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === i.id}
                      onClick={() => void resolve(i.id, 'resolved')}
                      className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white"
                    >
                      Resolver
                    </button>
                    <button
                      type="button"
                      disabled={busyId === i.id}
                      onClick={() => void resolve(i.id, 'dismissed')}
                      className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-extrabold text-zinc-700"
                    >
                      Descartar
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
      <p className="text-xs text-zinc-500">
        Las incidencias automáticas (retrasos, ausencias) se pueden generar desde procesos futuros; ahora puedes
        registrarlas manualmente como encargado.
      </p>
    </div>
  );
}
