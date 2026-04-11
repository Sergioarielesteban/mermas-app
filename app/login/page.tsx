'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getAllowedEmails, isAllowedEmail } from '@/lib/auth-access';
import { isSupabaseEnabled } from '@/lib/supabase-client';
import ChefOneGlowLine from '@/components/ChefOneGlowLine';

const REMEMBERED_EMAIL_KEY = 'mermas_remembered_email';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberEmail, setRememberEmail] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const allowedEmails = getAllowedEmails();

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const remembered = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (remembered) setEmail(remembered);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean || !clean.includes('@')) {
      setError('Introduce un email válido.');
      return;
    }
    // Con Supabase, quien autoriza es Auth (usuarios creados en el panel). Sin Supabase, lista en código.
    if (!isSupabaseEnabled() && !isAllowedEmail(clean)) {
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
      if (rememberEmail) window.localStorage.setItem(REMEMBERED_EMAIL_KEY, clean);
      else window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }
    // La redirección la hace AppFrame (→ /panel con flag de una sola vez en sessionStorage).
  };

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-white">
      {/* Fondo blanco: logo + línea sangre (sin caja negra) */}
      <section className="flex flex-shrink-0 justify-center bg-white px-4 pb-2 pt-10 sm:px-6 sm:pt-12">
        <div className="flex w-full max-w-md flex-col items-center py-2">
          <img
            src="/logo-chef-one-wordmark.svg"
            alt="Chef-One"
            className="mx-auto w-[min(92vw,440px)] max-w-full select-none"
            width={512}
            height={176}
            decoding="async"
          />
          <ChefOneGlowLine className="mt-5 max-w-[300px] sm:mt-6" />
        </div>
      </section>

      <section className="mx-auto w-full max-w-md flex-1 bg-white px-5 pb-10 pt-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <h1 className="text-lg font-black text-zinc-900">Acceso de Usuario</h1>
            <p className="pt-1 text-sm text-zinc-600">Entra con tu email y contraseña.</p>
            {!isSupabaseEnabled() && allowedEmails.length > 0 ? (
              <p className="pt-1 text-xs text-zinc-500">
                Acceso restringido a usuarios autorizados.
              </p>
            ) : null}
          </div>

          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-600">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder="usuario@empresa.com"
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
              checked={rememberEmail}
              onChange={(e) => setRememberEmail(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-[#D32F2F] focus:ring-[#D32F2F]/30"
            />
            Recordar email en este dispositivo
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
      </section>
    </div>
  );
}

