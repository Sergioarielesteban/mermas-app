'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { isAllowedEmail } from '@/lib/auth-access';

type AuthContextValue = {
  email: string | null;
  /** Supabase multi-local: usuario vinculado a un local (opción B). */
  localId: string | null;
  localCode: string | null;
  localName: string | null;
  /** true cuando ya se intentó cargar el perfil (o no aplica). */
  profileReady: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; reason?: string }>;
  logout: () => Promise<void>;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_KEY = 'mermas_user_email';

function isInvalidRefreshTokenError(message: string | undefined) {
  const m = (message ?? '').toLowerCase();
  return m.includes('invalid refresh token') || m.includes('refresh token not found');
}

function mapSupabaseAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid_credentials')) {
    return 'Email o contraseña incorrectos.';
  }
  if (m.includes('email not confirmed')) {
    return 'Tienes que confirmar el correo (enlace de Supabase) o desactivar “Confirm email” en Authentication → Providers → Email.';
  }
  return message;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [localId, setLocalId] = useState<string | null>(null);
  const [localCode, setLocalCode] = useState<string | null>(null);
  const [localName, setLocalName] = useState<string | null>(null);
  const [profileReady, setProfileReady] = useState(false);

  const clearProfile = React.useCallback(() => {
    setLocalId(null);
    setLocalCode(null);
    setLocalName(null);
  }, []);

  const clearLocalAuthCache = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(AUTH_KEY);
    // Remove stale Supabase session tokens that can cause refresh-loop errors.
    const keys = Object.keys(window.localStorage);
    for (const key of keys) {
      if (key.startsWith('sb-') && key.includes('-auth-token')) {
        window.localStorage.removeItem(key);
      }
    }
  }, []);

  const loadProfileForUser = React.useCallback(async (userId: string | undefined) => {
    if (!userId) {
      clearProfile();
      setProfileReady(true);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase || !isSupabaseEnabled()) {
      clearProfile();
      setProfileReady(true);
      return;
    }
    setProfileReady(false);
    const { data, error } = await supabase
      .from('profiles')
      .select('local_id, locals(code, name)')
      .eq('user_id', userId)
      .maybeSingle();

    // Some projects have stricter RLS on `locals`; keep local_id even if nested read fails.
    if (error || !data) {
      const { data: profileOnly, error: profileErr } = await supabase
        .from('profiles')
        .select('local_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (profileErr || !profileOnly?.local_id) {
        clearProfile();
        setProfileReady(true);
        return;
      }
      setLocalId(profileOnly.local_id);
      setLocalCode(null);
      setLocalName(null);
      setProfileReady(true);
      return;
    }

    const row = data as {
      local_id: string;
      locals: { code: string; name: string } | { code: string; name: string }[] | null;
    };
    const loc = Array.isArray(row.locals) ? row.locals[0] : row.locals;
    setLocalId(row.local_id);
    setLocalCode(loc?.code ?? null);
    setLocalName(loc?.name ?? null);
    setProfileReady(true);
  }, [clearProfile]);

  useEffect(() => {
    const persistEmail = (nextEmail: string | null) => {
      if (typeof window === 'undefined') return;
      if (nextEmail) window.localStorage.setItem(AUTH_KEY, nextEmail);
      else window.localStorage.removeItem(AUTH_KEY);
    };

    const supabase = getSupabaseClient();
    if (!supabase || !isSupabaseEnabled()) {
      queueMicrotask(() => {
        if (typeof window !== 'undefined') {
          const remembered = window.localStorage.getItem(AUTH_KEY)?.trim().toLowerCase() ?? null;
          if (remembered && isAllowedEmail(remembered)) setEmail(remembered);
          else persistEmail(null);
        }
        setLoading(false);
        setProfileReady(true);
      });
      return;
    }

    let isMounted = true;
    const safetyTimeout = window.setTimeout(() => {
      if (!isMounted) return;
      // Prevent indefinite "Cargando sesión..." when auth request hangs.
      setLoading(false);
      setProfileReady(true);
    }, 8000);
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error && isInvalidRefreshTokenError(error.message)) {
          setEmail(null);
          clearProfile();
          clearLocalAuthCache();
          setLoading(false);
          setProfileReady(true);
          return;
        }
        const sessionEmail = data.session?.user?.email?.toLowerCase() ?? null;
        setEmail(sessionEmail);
        persistEmail(sessionEmail);
        setLoading(false);
        void loadProfileForUser(data.session?.user?.id);
      })
      .catch(() => {
        if (!isMounted) return;
        setLoading(false);
        setProfileReady(true);
      })
      .finally(() => {
        window.clearTimeout(safetyTimeout);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        clearLocalAuthCache();
      }
      const nextEmail = session?.user?.email?.toLowerCase() ?? null;
      setEmail(nextEmail);
      persistEmail(nextEmail);
      setLoading(false);
      void loadProfileForUser(session?.user?.id);
    });

    return () => {
      isMounted = false;
      window.clearTimeout(safetyTimeout);
      sub.subscription.unsubscribe();
    };
  }, [clearLocalAuthCache, clearProfile, loadProfileForUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      email,
      localId,
      localCode,
      localName,
      profileReady,
      login: async (nextEmail: string, password: string) => {
        const clean = nextEmail.trim().toLowerCase();
        if (!clean || !password) return { ok: false, reason: 'Completa email y contraseña.' };

        const supabase = getSupabaseClient();
        if (!supabase || !isSupabaseEnabled()) {
          return { ok: false, reason: 'Supabase no está configurado.' };
        }

        const { error } = await supabase.auth.signInWithPassword({
          email: clean,
          password,
        });
        if (error) return { ok: false, reason: mapSupabaseAuthError(error.message) };
        setEmail(clean);
        if (typeof window !== 'undefined') window.localStorage.setItem(AUTH_KEY, clean);
        return { ok: true };
      },
      logout: async () => {
        const supabase = getSupabaseClient();
        if (supabase) await supabase.auth.signOut();
        setEmail(null);
        clearProfile();
        setProfileReady(true);
        if (typeof window !== 'undefined') window.localStorage.removeItem(AUTH_KEY);
      },
      loading,
    }),
    [clearProfile, email, localCode, localId, localName, loading, profileReady],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

