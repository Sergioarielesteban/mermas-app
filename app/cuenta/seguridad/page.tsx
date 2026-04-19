'use client';

import Link from 'next/link';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { isSupabaseEnabled } from '@/lib/supabase-client';

export default function CuentaSeguridadPage() {
  const { email, plan, changePassword } = useAuth();
  const supabaseOk = isSupabaseEnabled();

  const [currentPass, setCurrentPass] = React.useState('');
  const [newPass, setNewPass] = React.useState('');
  const [confirmPass, setConfirmPass] = React.useState('');
  const [passMsg, setPassMsg] = React.useState<string | null>(null);
  const [passBusy, setPassBusy] = React.useState(false);

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
          El cambio de contraseña de acceso requiere Supabase. Contacta con administración si necesitas cambiar tu
          acceso.
        </section>
      )}

      {email ? (
        <div className="space-y-1 text-center text-[11px] text-zinc-500">
          <p>
            Sesión: <span className="font-medium text-zinc-700">{email}</span>
          </p>
          <p>
            Plan actual: <span className="font-bold text-zinc-800">{plan}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
