'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import Logo from '@/components/Logo';
import { getAllowedEmails, isAllowedEmail } from '@/lib/auth-access';
import { isSupabaseEnabled } from '@/lib/supabase-client';

const REMEMBERED_USER_KEY = 'mermas_remembered_user';
const SESSION_EMAIL_KEY = 'mermas_user_email';

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
    const remembered =
      window.localStorage.getItem(REMEMBERED_USER_KEY) ?? window.localStorage.getItem(SESSION_EMAIL_KEY);
    if (remembered?.trim()) {
      setIdentifier(remembered.trim());
      setRememberIdentifier(true);
    }
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
    if (typeof window !== 'undefined') {
      if (rememberIdentifier) window.localStorage.setItem(REMEMBERED_USER_KEY, clean);
      else window.localStorage.removeItem(REMEMBERED_USER_KEY);
    }
    setSubmitting(true);
    const result = await login(clean, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.reason ?? 'No se pudo iniciar sesión.');
      return;
    }
  };

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-[#fafafa]">
      <div
        className={[
          'flex min-h-[100dvh] flex-1 flex-col items-center justify-center px-5 pb-10 md:justify-start',
          'pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pb-12 md:pt-10 lg:pt-12',
        ].join(' ')}
      >
        <div className="flex w-full max-w-md flex-col items-center text-center">
          <div className="w-full overflow-hidden -mb-12 sm:-mb-14 md:mb-0">
            <Logo
              variant="login"
              className="-mt-[24%] -mb-[26%] shrink-0 drop-shadow-sm md:mb-0 md:mt-0 md:h-[10rem] lg:h-[11rem]"
              fetchPriority="high"
            />
          </div>

          <form
            onSubmit={handleSubmit}
            className="mt-1 w-full space-y-5 rounded-2xl border border-zinc-200/90 bg-white px-4 py-6 text-left shadow-[0_20px_50px_-28px_rgba(15,23,42,0.2)] sm:mt-2 sm:space-y-5 sm:px-5 sm:py-7 md:mt-3"
          >
            <div className="text-center sm:text-left">
              <h1 className="text-2xl font-black tracking-tight text-zinc-900 sm:text-[1.65rem]">
                Acceso de Usuario
              </h1>
              {!isSupabaseEnabled() && allowedEmails.length > 0 ? (
                <p className="pt-2 text-xs text-zinc-500">Acceso restringido a usuarios autorizados.</p>
              ) : null}
            </div>

            <label className="block text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-zinc-600 sm:text-sm">
              Usuario o email
              <input
                type="text"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  setError(null);
                }}
                placeholder="Usuario o email"
                autoComplete="username"
                className="mt-2 min-h-[3.25rem] w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 text-base text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-[#D32F2F] focus:bg-white focus:ring-2 focus:ring-[#D32F2F]/20"
                autoFocus
              />
            </label>

            <label className="block text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-zinc-600 sm:text-sm">
              Contraseña
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="********"
                className="mt-2 min-h-[3.25rem] w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 text-base text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-[#D32F2F] focus:bg-white focus:ring-2 focus:ring-[#D32F2F]/20"
              />
            </label>

            <label className="flex cursor-pointer items-start gap-3 text-sm font-semibold text-zinc-600">
              <input
                type="checkbox"
                checked={rememberIdentifier}
                onChange={(e) => setRememberIdentifier(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-zinc-300 text-[#D32F2F] focus:ring-[#D32F2F]/30"
              />
              <span className="text-left leading-snug">Recordar usuario en este dispositivo</span>
            </label>

            {error ? <p className="text-sm font-medium text-[#B91C1C]">{error}</p> : null}

            <button
              type="submit"
              disabled={submitting}
              className="min-h-[3.35rem] w-full rounded-xl bg-[#D32F2F] text-base font-black uppercase tracking-wide text-white shadow-lg shadow-[#D32F2F]/30 transition hover:bg-[#c62828] disabled:opacity-70"
            >
              {submitting ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
