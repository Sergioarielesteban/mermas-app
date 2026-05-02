'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useStaffBundle } from '@/hooks/useStaffBundle';
import { useLinkedStaffEmployee } from '@/lib/staff/useLinkedStaffEmployee';
import { startOfWeekMonday, ymdLocal } from '@/lib/staff/staff-dates';
import { staffDisplayName } from '@/lib/staff/staff-supabase';

export default function PersonalMiCuentaPage() {
  const { localId, localName, profileReady, userId, email, displayName } = useAuth();
  const [weekStart] = useState(() => ymdLocal(startOfWeekMonday(new Date())));
  const { employees, loading, error } = useStaffBundle(localId, weekStart);
  const linked = useLinkedStaffEmployee(employees, userId);

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!localId) return <p className="text-sm text-amber-800">Sin local.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold text-zinc-900">Cuenta</h1>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}

      <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <p className="text-xs font-extrabold uppercase text-zinc-500">Local</p>
        <p className="mt-1 text-lg font-extrabold text-zinc-900">{localName ?? '—'}</p>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <p className="text-xs font-extrabold uppercase text-zinc-500">Usuario app</p>
        <p className="mt-1 font-semibold text-zinc-800">{displayName ?? '—'}</p>
        <p className="text-sm text-zinc-600">{email ?? '—'}</p>
      </div>

      {linked ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
          <p className="text-xs font-extrabold uppercase text-zinc-500">Ficha empleado</p>
          <p className="mt-1 text-lg font-extrabold text-zinc-900">{staffDisplayName(linked)}</p>
          {linked.operationalRole ? (
            <p className="text-sm font-semibold text-zinc-600">{linked.operationalRole}</p>
          ) : null}
          {linked.phone ? <p className="mt-2 text-sm text-zinc-700">Tel. {linked.phone}</p> : null}
          {linked.hasPin ? (
            <p className="mt-2 text-xs font-semibold text-zinc-500">PIN de fichaje activo</p>
          ) : (
            <p className="mt-2 text-xs font-semibold text-zinc-500">Sin PIN (tu encargado puede activarlo)</p>
          )}
        </div>
      ) : (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Tu usuario no está vinculado a una ficha de empleado. Pide el alta en Personal → Equipo.
        </p>
      )}
    </div>
  );
}
