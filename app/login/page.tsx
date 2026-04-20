'use client';

import Link from 'next/link';
import React, { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import Logo from '@/components/Logo';
import { getAllowedEmails, isAllowedEmail } from '@/lib/auth-access';
import { isSupabaseEnabled } from '@/lib/supabase-client';

const REMEMBERED_USER_KEY = 'mermas_remembered_user';

export default function LoginPage() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberIdentifier, setRememberIdentifier] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const allowedEmails = getAllowedEmails();

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const remembered = window.localStorage.getItem(REMEMBERED_USER_KEY);
    if (remembered) setIdentifier(remembered);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = identifier.trim().toLowerCase();
    if (!clean) {
      setError('Introduce tu usuario o email.');
      return;
    }
    if (!isSupabaseEnabled() && clean.includes('@') && !isAllowedEmail(clean)) {
      setError('Este email no está autorizado para acceder.');
      return;
    }
    if (!password) {
      setError('Introduce tu contraseña.');
      return;
    }
    setSubmitting(true);
    const result = await login(clean, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.reason ?? 'No se pudo iniciar sesión.');
      return;
    }
    if (typeof window !== 'undefined') {
      if (rememberIdentifier) window.localStorage.setItem(REMEMBERED_USER_KEY, clean);
      else window.localStorage.removeItem(REMEMBERED_USER_KEY);
    }
  };

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-white">
      <div className="flex min-h-[100dvh] flex-1 flex-col items-center px-5 pb-12 pt-4 sm:px-6 sm:pb-14 sm:pt-6">
        <div className="flex w-full max-w-md flex-col items-center text-center">
          <Logo variant="login" className="shrink-0" fetchPriority="high" />

          <form onSubmit={handleSubmit} className="mt-5 w-full space-y-4 text-left sm:mt-6">
            <div className="text-center sm:text-left">
              <h1 className="text-xl font-black tracking-tight text-zinc-900 sm:text-2xl">Acceso de Usuario</h1>
              <p className="pt-2 text-sm leading-snug text-zinc-600 sm:text-[0.9375rem]">
                Entra con tu usuario (o email) y contraseña.
              </p>
              <p className="pt-3 text-xs leading-relaxed text-zinc-500 sm:text-sm">
                ¿Primera vez?{' '}
                <Link href="/onboarding" className="font-semibold text-[#D32F2F] underline underline-offset-2">
                  Ver introducción
                </Link>{' '}
                ·{' '}
                <Link href="/precio" className="font-semibold text-zinc-700 underline underline-offset-2">
                  Saber más
                </Link>
              </p>
              {!isSupabaseEnabled() && allowedEmails.length > 0 ? (
                <p className="pt-1 text-xs text-zinc-500">Acceso restringido a usuarios autorizados.</p>
              ) : null}
            </div>

            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Usuario o email
              <input
                type="text"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  setError(null);
                }}
                placeholder="sergio.mataro o usuario@empresa.com"
                className="mt-2 h-12 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-900 outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
                autoFocus
              />
            </label>

            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Contraseña
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="********"
                className="mt-2 h-12 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-900 outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20"
              />
            </label>

            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              <input
                type="checkbox"
                checked={rememberIdentifier}
                onChange={(e) => setRememberIdentifier(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-[#D32F2F] focus:ring-[#D32F2F]/30"
              />
              Recordar usuario en este dispositivo
            </label>

            {error ? <p className="text-sm text-[#B91C1C]">{error}</p> : null}

            <button
              type="submit"
              disabled={submitting}
              className="h-12 w-full rounded-xl bg-[#D32F2F] text-sm font-black uppercase tracking-wide text-white shadow-md shadow-[#D32F2F]/35 hover:bg-[#c62828]"
            >
              {submitting ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
