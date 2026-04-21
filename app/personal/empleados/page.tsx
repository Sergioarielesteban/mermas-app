'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import MermasStyleHero from '@/components/MermasStyleHero';
import { PersonalSectionNav } from '@/components/staff/StaffPersonalShell';
import { useAuth } from '@/components/AuthProvider';
import { parseProfileAppRole, type ProfileAppRole } from '@/lib/profile-app-role';
import { buildStaffPermissions } from '@/lib/staff/permissions';
import { STAFF_ZONE_PRESETS } from '@/lib/staff/types';
import {
  createStaffEmployee,
  deleteStaffEmployee,
  fetchStaffEmployees,
  staffDisplayName,
  updateStaffEmployee,
} from '@/lib/staff/staff-supabase';
import { countOperationalUsersForLocal } from '@/lib/subscriptions-supabase';
import { getModuleActionAccess, logAccessBlocked, type ModuleAction } from '@/lib/moduleAccessControl';
import { appAlert, appConfirm } from '@/lib/app-dialog-bridge';
import { getSupabaseClient } from '@/lib/supabase-client';
import type { StaffEmployee } from '@/lib/staff/types';

function operationalRoleSelectValue(raw: string | null | undefined): string {
  if (!raw?.trim()) return '';
  const t = raw.trim();
  const byLabel = STAFF_ZONE_PRESETS.find((z) => z.label === t);
  if (byLabel) return byLabel.label;
  const byValue = STAFF_ZONE_PRESETS.find((z) => z.value.toLowerCase() === t.toLowerCase());
  if (byValue) return byValue.label;
  return t;
}

export default function PersonalEmpleadosPage() {
  const { localId, profileRole, profileReady, maxUsers, userId, plan } = useAuth();
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
  const [createAccess, setCreateAccess] = useState(false);
  const [accessEmail, setAccessEmail] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [appRole, setAppRole] = useState<ProfileAppRole>('staff');
  const [busy, setBusy] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [operationalUsers, setOperationalUsers] = useState(0);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [clearPin, setClearPin] = useState(false);
  const [linkedAppRole, setLinkedAppRole] = useState<ProfileAppRole>('staff');
  const [linkedProfileEmail, setLinkedProfileEmail] = useState<string | null>(null);
  const isAdminActor = profileRole === 'admin';
  const roleConsumesOperationalSlot =
    createAccess && (appRole === 'admin' || appRole === 'manager') && isAdminActor;
  const userLimitReached = roleConsumesOperationalSlot && operationalUsers >= maxUsers;

  const resetForm = () => {
    setFormOpen(false);
    setErr(null);
    setFormMode('create');
    setEditingId(null);
    setEditingUserId(null);
    setClearPin(false);
    setLinkedAppRole('staff');
    setLinkedProfileEmail(null);
    setFirstName('');
    setLastName('');
    setAlias('');
    setPhone('');
    setEmail('');
    setOperationalRole('');
    setColor('#D32F2F');
    setPin('');
    setCreateAccess(false);
    setAccessEmail('');
    setTempPassword('');
    setAppRole('staff');
  };

  const openCreateModal = () => {
    resetForm();
    setOkMsg(null);
    setFormOpen(true);
  };

  const openEditModal = (em: StaffEmployee) => {
    setOkMsg(null);
    setErr(null);
    setFormMode('edit');
    setEditingId(em.id);
    setEditingUserId(em.userId);
    setFirstName(em.firstName);
    setLastName(em.lastName);
    setAlias(em.alias ?? '');
    setPhone(em.phone ?? '');
    setEmail(em.email ?? '');
    setOperationalRole(operationalRoleSelectValue(em.operationalRole));
    setColor(em.color ?? '#D32F2F');
    setPin('');
    setClearPin(false);
    setCreateAccess(false);
    setAccessEmail('');
    setTempPassword('');
    setAppRole('staff');
    setLinkedAppRole('staff');
    setLinkedProfileEmail(null);
    setFormOpen(true);
  };

  const ensurePersonalActionAccess = (action: ModuleAction): boolean => {
    const access = getModuleActionAccess(
      { userId, role: profileRole, plan },
      'personal',
      action,
    );
    if (access.allowed) return true;
    logAccessBlocked({
      userId,
      role: profileRole,
      plan,
      module: 'personal',
      action,
      cause: access.blockedBy ?? 'role',
      path: '/personal/empleados',
    });
    setErr(
      access.blockedBy === 'plan'
        ? 'Este módulo no está incluido en tu plan'
        : 'Esta acción no está disponible para tu rol',
    );
    return false;
  };

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

  useEffect(() => {
    if (formMode !== 'edit' || !editingUserId || !localId) {
      if (formMode !== 'edit') {
        setLinkedProfileEmail(null);
      }
      return;
    }
    let cancelled = false;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('role,email')
        .eq('user_id', editingUserId)
        .eq('local_id', localId)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setLinkedAppRole(parseProfileAppRole(String(data.role)));
        setLinkedProfileEmail(data.email != null ? String(data.email) : null);
      } else {
        setLinkedAppRole('staff');
        setLinkedProfileEmail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formMode, editingUserId, localId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localId || !perms.canManageEmployees) return;
    setOkMsg(null);
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setErr(null);
    try {
      if (formMode === 'edit' && editingId) {
        if (!ensurePersonalActionAccess('edit')) return;
        const patch: Parameters<typeof updateStaffEmployee>[2] = {
          firstName,
          lastName,
          alias: alias.trim() ? alias.trim() : null,
          phone: phone.trim() ? phone.trim() : null,
          email: email.trim() ? email.trim().toLowerCase() : null,
          operationalRole: operationalRole.trim() ? operationalRole.trim() : null,
          color: color.trim() ? color.trim() : null,
        };
        if (clearPin) patch.pinFichaje = null;
        else if (pin.trim()) patch.pinFichaje = pin.trim();
        await updateStaffEmployee(supabase, editingId, patch);
        if (isAdminActor && editingUserId && linkedProfileEmail) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const accessToken = session?.access_token;
          if (!accessToken) {
            throw new Error('No se pudo validar tu sesión. Vuelve a iniciar sesión.');
          }
          const res = await fetch('/api/personal/empleados/update-linked-profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ userId: editingUserId, appRole: linkedAppRole }),
          });
          const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (!res.ok || payload.ok !== true) {
            throw new Error(payload.error || 'No se pudo actualizar el rol en la app');
          }
        }
        setOkMsg('Cambios guardados');
        resetForm();
        await reload();
        return;
      }

      if (!ensurePersonalActionAccess('create')) return;
      if (userLimitReached) {
        setErr('No hay cupo para más usuarios operativos');
        return;
      }
      if (!createAccess) {
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
        setOkMsg('Empleado creado');
      } else {
        const emailForAccess = (accessEmail || email).trim().toLowerCase();
        if (!emailForAccess) {
          throw new Error('El email de acceso es obligatorio');
        }
        if (tempPassword.trim().length < 8) {
          throw new Error('La contraseña temporal debe tener al menos 8 caracteres');
        }
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const accessToken = session?.access_token;
        if (!accessToken) {
          throw new Error('No se pudo validar tu sesión. Vuelve a iniciar sesión.');
        }
        const effectiveAppRole: ProfileAppRole = isAdminActor ? appRole : 'staff';
        const res = await fetch('/api/personal/empleados/create-with-access', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            firstName,
            lastName,
            alias,
            phone,
            email,
            operationalRole,
            color,
            pinFichaje: pin,
            createAccess: true,
            accessEmail: emailForAccess,
            tempPassword,
            appRole: effectiveAppRole,
          }),
        });
        const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || payload.ok !== true) {
          throw new Error(payload.error || 'No se pudo crear el acceso a la app');
        }
        setOkMsg('Empleado y acceso a la app creados correctamente');
      }
      resetForm();
      await reload();
    } catch (er: unknown) {
      setErr(er instanceof Error ? er.message : formMode === 'edit' ? 'No se pudo guardar' : 'No se pudo crear');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (em: StaffEmployee) => {
    if (!perms.canManageEmployees) return;
    if (!ensurePersonalActionAccess('edit')) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    try {
      await updateStaffEmployee(supabase, em.id, { active: !em.active });
      await reload();
    } catch (er: unknown) {
      await appAlert(er instanceof Error ? er.message : 'Error');
    }
  };

  const removeEmployee = async (em: StaffEmployee) => {
    if (!perms.canManageEmployees) return;
    if (!ensurePersonalActionAccess('delete')) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const ok = await appConfirm(
      `Se eliminará el empleado "${staffDisplayName(em)}". Esta acción no se puede deshacer. ¿Continuar?`,
    );
    if (!ok) return;
    try {
      await deleteStaffEmployee(supabase, em.id);
      await reload();
    } catch (er: unknown) {
      await appAlert(er instanceof Error ? er.message : 'No se pudo eliminar');
    }
  };

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!localId) return <p className="text-sm text-amber-800">Sin local.</p>;
  if (!perms.canManageEmployees) {
    return (
      <div className="space-y-4">
        <MermasStyleHero eyebrow="Equipo" title="Empleados" compact />
        <PersonalSectionNav />
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
      <PersonalSectionNav />

      {!perms.canManageEmployees ? (
        <p className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600 ring-1 ring-zinc-200">
          Solo los encargados gestionan el equipo.
        </p>
      ) : roleConsumesOperationalSlot && userLimitReached ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
          Has alcanzado el límite de usuarios operativos de tu plan ({operationalUsers}/{maxUsers})
        </p>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (!ensurePersonalActionAccess('open_management_modal')) return;
            openCreateModal();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D32F2F] py-3 text-sm font-extrabold text-white sm:w-auto sm:px-6"
        >
          <Plus className="h-5 w-5" />
          Nuevo empleado
        </button>
      )}

      {err ? <p className="text-sm font-bold text-red-700">{err}</p> : null}
      {okMsg ? <p className="text-sm font-bold text-emerald-700">{okMsg}</p> : null}
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
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!ensurePersonalActionAccess('edit')) return;
                    openEditModal(em);
                  }}
                  className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-extrabold text-zinc-800"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
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
                <button
                  type="button"
                  onClick={() => void removeEmployee(em)}
                  className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-extrabold text-red-800"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {formOpen && perms.canManageEmployees ? (
        <>
          <button type="button" className="fixed inset-0 z-[80] bg-black/40" aria-hidden onClick={resetForm} />
          <div className="fixed inset-x-0 bottom-0 z-[90] max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white p-4 shadow-xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
            <p className="text-lg font-extrabold text-zinc-900">
              {formMode === 'edit' ? 'Editar empleado' : 'Alta rápida'}
            </p>
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
                onChange={(e) => {
                  const next = e.target.value;
                  setEmail(next);
                  if (!createAccess || !accessEmail.trim()) setAccessEmail(next);
                }}
              />
              <label className="flex items-center gap-2 text-xs font-bold text-zinc-600">
                Color
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </label>
              <input
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-mono"
                placeholder={
                  formMode === 'edit'
                    ? 'PIN (vacío = no cambiar; o 4 dígitos para nuevo)'
                    : 'PIN fichaje (opcional)'
                }
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
              {formMode === 'edit' ? (
                <label className="flex items-center gap-2 text-xs font-bold text-zinc-700">
                  <input
                    type="checkbox"
                    checked={clearPin}
                    onChange={(e) => setClearPin(e.target.checked)}
                  />
                  Quitar PIN de fichaje
                </label>
              ) : null}
              {formMode === 'edit' && editingUserId && isAdminActor ? (
                <section className="mt-2 space-y-2 rounded-2xl border border-amber-200 bg-amber-50/90 p-3">
                  <p className="text-sm font-extrabold text-zinc-900">Rol en la aplicación</p>
                  <p className="text-xs font-medium text-zinc-600">
                    {linkedProfileEmail ? `Cuenta: ${linkedProfileEmail}` : 'Cargando perfil…'}
                  </p>
                  <select
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    value={linkedAppRole}
                    onChange={(e) => setLinkedAppRole(e.target.value as ProfileAppRole)}
                  >
                    <option value="staff">staff</option>
                    <option value="manager">manager</option>
                    <option value="admin">admin</option>
                  </select>
                  <p className="text-[11px] font-medium text-zinc-600">
                    Los roles admin y manager cuentan para el cupo de usuarios operativos del plan.
                  </p>
                </section>
              ) : formMode === 'edit' && editingUserId && !isAdminActor ? (
                <p className="text-xs font-semibold text-zinc-600">
                  Solo administración puede cambiar el rol en la app. Puedes editar datos del empleado.
                </p>
              ) : null}
              {formMode === 'create' ? (
                <section className="mt-2 space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-sm font-extrabold text-zinc-900">Acceso a la aplicación</p>
                  {!isAdminActor ? (
                    <p className="text-xs font-semibold text-amber-900">
                      Como encargado solo puedes crear accesos con rol <strong>staff</strong>. Los roles admin y
                      manager los asigna la administración.
                    </p>
                  ) : null}
                  <label className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-zinc-800 ring-1 ring-zinc-200">
                    <span>Crear acceso a la app</span>
                    <select
                      value={createAccess ? 'si' : 'no'}
                      onChange={(e) => {
                        const next = e.target.value === 'si';
                        setCreateAccess(next);
                        if (next && !accessEmail.trim()) setAccessEmail(email);
                        if (!isAdminActor) setAppRole('staff');
                      }}
                      className="rounded-lg border border-zinc-300 px-2 py-1 text-sm font-bold"
                    >
                      <option value="no">No</option>
                      <option value="si">Sí</option>
                    </select>
                  </label>
                  {createAccess ? (
                    <>
                      <input
                        required
                        type="email"
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        placeholder="Email de acceso"
                        value={accessEmail}
                        onChange={(e) => setAccessEmail(e.target.value)}
                      />
                      <input
                        required
                        type="password"
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        placeholder="Contraseña temporal (mín. 8 caracteres)"
                        value={tempPassword}
                        onChange={(e) => setTempPassword(e.target.value)}
                      />
                      <select
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={isAdminActor ? appRole : 'staff'}
                        onChange={(e) => setAppRole(e.target.value as ProfileAppRole)}
                        disabled={!isAdminActor}
                      >
                        <option value="staff">staff</option>
                        {isAdminActor ? (
                          <>
                            <option value="manager">manager</option>
                            <option value="admin">admin</option>
                          </>
                        ) : null}
                      </select>
                      {roleConsumesOperationalSlot ? (
                        <p className="text-xs font-semibold text-zinc-600">
                          Cupo operativo: {operationalUsers}/{maxUsers}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-xs font-semibold text-zinc-600">
                      Se creará solo como empleado operativo (sin acceso de login).
                    </p>
                  )}
                </section>
              ) : null}
              <div className="fixed inset-x-0 bottom-0 z-[95] border-t border-zinc-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0">
                <button
                  type="submit"
                  disabled={busy || (formMode === 'create' && userLimitReached)}
                  className="h-14 w-full rounded-2xl bg-[#D32F2F] px-4 text-base font-extrabold text-white shadow-sm disabled:opacity-50"
                >
                  {formMode === 'edit' ? 'Guardar cambios' : 'Guardar empleado'}
                </button>
              </div>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
