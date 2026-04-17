'use client';

import Link from 'next/link';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { isSupabaseEnabled } from '@/lib/supabase-client';
import {
  clearDeleteSecurityPinOnDevice,
  getDeleteSecurityPinNormalized,
  hasDeleteSecurityPinDeviceOverride,
  normalizeOpsSecurityPin,
  setDeleteSecurityPinOnDevice,
} from '@/lib/delete-security';

export default function CuentaSeguridadPage() {
  const { email, changePassword } = useAuth();
  const supabaseOk = isSupabaseEnabled();

  const [currentPass, setCurrentPass] = React.useState('');
  const [newPass, setNewPass] = React.useState('');
  const [confirmPass, setConfirmPass] = React.useState('');
  const [passMsg, setPassMsg] = React.useState<string | null>(null);
  const [passBusy, setPassBusy] = React.useState(false);

  const [pinCurrent, setPinCurrent] = React.useState('');
  const [pinNew, setPinNew] = React.useState('');
  const [pinConfirm, setPinConfirm] = React.useState('');
  const [pinMsg, setPinMsg] = React.useState<string | null>(null);
  const [pinBusy, setPinBusy] = React.useState(false);
  const [hasOverride, setHasOverride] = React.useState(false);

  React.useEffect(() => {
    setHasOverride(hasDeleteSecurityPinDeviceOverride());
  }, []);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg(null);
    if (!newPass.trim() || !confirmPass.trim()) {
      setPassMsg('Completa la nueva contraseña y la confirmación.');
      return;
    }
    if (newPass !== confirmPass) {
      setPassMsg('La nueva contraseña y la confirmación no coinciden.');
      return;
    }
    setPassBusy(true);
    const r = await changePassword(currentPass, newPass);
    setPassBusy(false);
    if (!r.ok) {
      setPassMsg(r.reason ?? 'No se pudo cambiar la contraseña.');
      return;
    }
    setPassMsg('Contraseña actualizada. Usa la nueva en el próximo acceso.');
    setCurrentPass('');
    setNewPass('');
    setConfirmPass('');
  };

  const submitPin = (e: React.FormEvent) => {
    e.preventDefault();
    setPinMsg(null);
    const cur = normalizeOpsSecurityPin(pinCurrent);
    const next = normalizeOpsSecurityPin(pinNew);
    const again = normalizeOpsSecurityPin(pinConfirm);
    if (next.length !== 4 || again.length !== 4) {
      setPinMsg('Usa 4 dígitos en la nueva clave y su repetición.');
      return;
    }
    if (next !== again) {
      setPinMsg('La nueva clave y la repetición no coinciden.');
      return;
    }
    const expected = getDeleteSecurityPinNormalized();
    if (expected.length === 4) {
      if (cur.length !== 4) {
        setPinMsg('Introduce la clave actual (4 dígitos).');
        return;
      }
      if (cur !== expected) {
        setPinMsg('La clave actual no es correcta.');
        return;
      }
    }
    setPinBusy(true);
    try {
      setDeleteSecurityPinOnDevice(next);
      setHasOverride(true);
      setPinMsg('Clave de operaciones guardada en este dispositivo.');
      setPinCurrent('');
      setPinNew('');
      setPinConfirm('');
    } finally {
      setPinBusy(false);
    }
  };

  const onResetPinToDefault = () => {
    setPinMsg(null);
    if (!hasOverride) {
      setPinMsg('No hay clave configurada en este dispositivo.');
      return;
    }
    const cur = normalizeOpsSecurityPin(pinCurrent);
    if (cur.length !== 4) {
      setPinMsg('Introduce la clave actual (4 dígitos) para quitar la clave.');
      return;
    }
    const expected = getDeleteSecurityPinNormalized();
    if (cur !== expected) {
      setPinMsg('La clave actual no es correcta.');
      return;
    }
    clearDeleteSecurityPinOnDevice();
    setHasOverride(false);
    setPinMsg('Se quitó la clave de este dispositivo. Configura una nueva cuando la necesites.');
    setPinCurrent('');
  };

  const onForgotPinResetDevice = () => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        'Esto borrará la clave de operaciones solo en este dispositivo. Tendrás que crear una nueva para desbloquear paneles protegidos. ¿Continuar?',
      );
      if (!ok) return;
    }
    clearDeleteSecurityPinOnDevice();
    setHasOverride(false);
    setPinCurrent('');
    setPinNew('');
    setPinConfirm('');
    setPinMsg('Clave local borrada. Ya puedes crear una nueva clave de 4 dígitos.');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/panel"
          className="inline-flex h-9 shrink-0 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700"
        >
          ← Panel
        </Link>
        <h1 className="text-base font-black uppercase tracking-wide text-zinc-900">Cuenta y seguridad</h1>
      </div>

      {supabaseOk ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
          <h2 className="text-sm font-extrabold text-zinc-900">Contraseña de acceso</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600">
            Es la misma que usas al entrar en la app (Supabase). Tras cambiarla, sigue usando tu email o usuario de
            siempre; solo cambia la contraseña.
          </p>
          <form onSubmit={(e) => void submitPassword(e)} className="mt-4 space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wide text-zinc-600">
              Contraseña actual
              <input
                type="password"
                autoComplete="current-password"
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-zinc-600">
              Nueva contraseña (mín. 8 caracteres)
              <input
                type="password"
                autoComplete="new-password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-zinc-600">
              Repetir nueva contraseña
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
              />
            </label>
            {passMsg ? (
              <p
                className={[
                  'rounded-lg px-2 py-2 text-center text-xs font-medium',
                  passMsg.includes('actualizada')
                    ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200'
                    : 'bg-amber-50 text-amber-950 ring-1 ring-amber-200',
                ].join(' ')}
              >
                {passMsg}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={passBusy}
              className="h-12 w-full rounded-xl bg-[#D32F2F] text-sm font-black uppercase tracking-wide text-white shadow-md shadow-[#D32F2F]/30 hover:bg-[#c62828] disabled:opacity-60"
            >
              {passBusy ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </form>
        </section>
      ) : (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950 ring-1 ring-amber-100">
          El cambio de contraseña de acceso requiere Supabase. Solo puedes ajustar aquí la clave de operaciones en este
          dispositivo.
        </section>
      )}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <h2 className="text-sm font-extrabold text-zinc-900">Clave de operaciones (4 dígitos)</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600">
          Sirve para borrados sensibles, partes de la app protegidas y estadísticas en Mermas.{' '}
          <span className="font-semibold text-zinc-800">Se guarda solo en este dispositivo</span>; en otro móvil o
          ordenador hay que configurarla otra vez si quieres la misma.
        </p>
        {hasOverride ? (
          <p className="mt-2 text-[11px] font-medium text-emerald-800">
            Hay una clave personalizada en este dispositivo.
          </p>
        ) : (
          <p className="mt-2 text-[11px] text-zinc-500">
            No hay clave de operaciones configurada en este dispositivo.
          </p>
        )}
        <form onSubmit={submitPin} className="mt-4 space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wide text-zinc-600">
            Clave actual
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pinCurrent}
              onChange={(e) => setPinCurrent(normalizeOpsSecurityPin(e.target.value))}
              placeholder="••••"
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-center text-lg font-bold tracking-[0.4em] text-zinc-900 outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-zinc-600">
            Nueva clave
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pinNew}
              onChange={(e) => setPinNew(normalizeOpsSecurityPin(e.target.value))}
              placeholder="••••"
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-center text-lg font-bold tracking-[0.4em] text-zinc-900 outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-zinc-600">
            Repetir nueva clave
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pinConfirm}
              onChange={(e) => setPinConfirm(normalizeOpsSecurityPin(e.target.value))}
              placeholder="••••"
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-center text-lg font-bold tracking-[0.4em] text-zinc-900 outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
            />
          </label>
          {pinMsg ? (
            <p className="rounded-lg bg-zinc-50 px-2 py-2 text-center text-xs font-medium text-zinc-800 ring-1 ring-zinc-200">
              {pinMsg}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pinBusy}
            className="h-12 w-full rounded-xl bg-zinc-900 text-sm font-black uppercase tracking-wide text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {pinBusy ? 'Guardando…' : 'Guardar clave en este dispositivo'}
          </button>
        </form>
        {hasOverride ? (
          <div className="mt-4 border-t border-zinc-100 pt-4">
            <p className="text-[11px] text-zinc-600">
              Para quitar la clave de este dispositivo, introduce la clave actual y pulsa quitar.
            </p>
            <button
              type="button"
              onClick={onResetPinToDefault}
              className="mt-2 h-10 w-full rounded-xl border border-zinc-300 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-50"
            >
              Quitar clave de este dispositivo
            </button>
          </div>
        ) : null}
        <div className="mt-3">
          <button
            type="button"
            onClick={onForgotPinResetDevice}
            className="h-10 w-full rounded-xl border border-zinc-300 bg-white text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            He olvidado la clave (reset solo en este dispositivo)
          </button>
        </div>
      </section>

      {email ? (
        <p className="text-center text-[11px] text-zinc-500">
          Sesión: <span className="font-medium text-zinc-700">{email}</span>
        </p>
      ) : null}
    </div>
  );
}
