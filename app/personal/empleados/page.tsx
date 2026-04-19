'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { buildStaffPermissions } from '@/lib/staff/permissions';
import { STAFF_ZONE_PRESETS } from '@/lib/staff/types';
import { createStaffEmployee, fetchStaffEmployees, staffDisplayName, updateStaffEmployee } from '@/lib/staff/staff-supabase';
import { countOperationalUsersForLocal } from '@/lib/subscriptions-supabase';
import { getSupabaseClient } from '@/lib/supabase-client';
import type { StaffEmployee } from '@/lib/staff/types';

export default function PersonalEmpleadosPage() {
  const { localId, profileRole, profileReady, maxUsers } = useAuth();
  const perms = useMemo(() => buildStaffPermissions(profileRole), [profileRole]);
  const [list, setList] = useState<StaffEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [alias, setAlias] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [operationalRole, setOperationalRole] = useState('');
  const [color, setColor] = useState('#D32F2F');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [operationalUsers, setOperationalUsers] = useState(0);
  const userLimitReached = operationalUsers >= maxUsers;

  const reload = useCallback(async () => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoading(true);
    setErr(null);
    try {
      const [rows, opCount] = await Promise.all([
        fetchStaffEmployees(supabase, localId),
        countOperationalUsersForLocal(supabase, localId),
      ]);
      setList(rows);
      setOperationalUsers(opCount);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [localId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localId || !perms.canManageEmployees) return;
    if (userLimitReached) {
      setErr('Has alcanzado el límite de usuarios de tu plan');
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setErr(null);
    try {
      await createStaffEmployee(supabase, {
        localId,
        firstName,
        lastName,
        alias: alias || null,
        phone: phone || null,
        email: email || null,
        operationalRole: operationalRole || null,
        color: color || null,
        pinFichaje: pin || null,
      });
      setFormOpen(false);
      setFirstName('');
      setLastName('');
      setAlias('');
      setPhone('');
      setEmail('');
      setOperationalRole('');
      setPin('');
      await reload();
    } catch (er: unknown) {
      setErr(er instanceof Error ? er.message : 'No se pudo crear');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (em: StaffEmployee) => {
    if (!perms.canManageEmployees) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    try {
      await updateStaffEmployee(supabase, em.id, { active: !em.active });
      await reload();
    } catch (er: unknown) {
      alert(er instanceof Error ? er.message : 'Error');
    }
  };

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!localId) return <p className="text-sm text-amber-800">Sin local.</p>;
  if (!perms.canManageEmployees) {
    return (
      <div className="space-y-4">
        <MermasStyleHero eyebrow="Equipo" title="Empleados" compact />
        <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <p className="text-sm font-semibold text-zinc-800">No tienes permiso para ver la gestión del equipo.</p>
          <Link
            href="/personal/mi"
            className="mt-3 inline-flex rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-bold text-zinc-800"
          >
            Volver a Mi espacio
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MermasStyleHero eyebrow="Equipo" title="Empleados" tagline="Ficha rápida, color en cuadrante y PIN opcional." compact />

      {!perms.canManageEmployees ? (
        <p className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600 ring-1 ring-zinc-200">
          Solo los encargados gestionan el equipo.
        </p>
      ) : userLimitReached ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
          Has alcanzado el límite de usuarios operativos de tu plan ({operationalUsers}/{maxUsers})
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D32F2F] py-3 text-sm font-extrabold text-white sm:w-auto sm:px-6"
        >
          <Plus className="h-5 w-5" />
          Nuevo empleado
        </button>
      )}

      {err ? <p className="text-sm font-bold text-red-700">{err}</p> : null}
      {loading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}

      <ul className="space-y-2">
        {list.map((em) => (
          <li
            key={em.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-4 ring-1 ring-zinc-200"
          >
            <div className="flex items-center gap-3">
              <span className="h-10 w-2 rounded-full" style={{ background: em.color ?? '#ccc' }} />
              <div>
                <p className="font-extrabold text-zinc-900">{staffDisplayName(em)}</p>
                <p className="text-xs font-medium text-zinc-500">
                  {[em.operationalRole, em.phone, em.email].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
            </div>
            {perms.canManageEmployees ? (
              <button
                type="button"
                onClick={() => void toggleActive(em)}
                className={[
                  'rounded-xl px-3 py-2 text-xs font-extrabold',
                  em.active ? 'bg-zinc-100 text-zinc-800' : 'bg-emerald-100 text-emerald-900',
                ].join(' ')}
              >
                {em.active ? 'Desactivar' : 'Reactivar'}
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {formOpen && perms.canManageEmployees ? (
        <>
          <button type="button" className="fixed inset-0 z-[80] bg-black/40" aria-hidden onClick={() => setFormOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-[90] max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white p-4 shadow-xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
            <p className="text-lg font-extrabold text-zinc-900">Alta rápida</p>
            <form onSubmit={submit} className="mt-3 space-y-2 pb-28 sm:pb-0">
              <input
                required
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold"
                placeholder="Nombre *"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <input
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Apellidos"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
              <input
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Nombre corto / mote"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
              />
              <select
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                value={operationalRole}
                onChange={(e) => setOperationalRole(e.target.value)}
              >
                <option value="">Puesto operativo…</option>
                {STAFF_ZONE_PRESETS.map((z) => (
                  <option key={z.value} value={z.label}>
                    {z.label}
                  </option>
                ))}
              </select>
              <input
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Teléfono"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <input
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <label className="flex items-center gap-2 text-xs font-bold text-zinc-600">
                Color
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </label>
              <input
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-mono"
                placeholder="PIN fichaje (opcional)"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
              <div className="fixed inset-x-0 bottom-0 z-[95] border-t border-zinc-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0">
                <button
                  type="submit"
                  disabled={busy || userLimitReached}
                  className="h-14 w-full rounded-2xl bg-[#D32F2F] px-4 text-base font-extrabold text-white shadow-sm disabled:opacity-50"
                >
                  Guardar empleado
                </button>
              </div>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
