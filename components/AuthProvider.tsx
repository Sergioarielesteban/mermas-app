'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { isAllowedEmail } from '@/lib/auth-access';

type AuthContextValue = {
  email: string | null;
  login: (email: string, password: string) => Promise<{ ok: boolean; reason?: string }>;
  logout: () => Promise<void>;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_KEY = 'mermas_user_email';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      });
      return;
    }

    let isMounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      const sessionEmail = data.session?.user?.email?.toLowerCase() ?? null;
      setEmail(sessionEmail);
      persistEmail(sessionEmail);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextEmail = session?.user?.email?.toLowerCase() ?? null;
      setEmail(nextEmail);
      persistEmail(nextEmail);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      email,
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
        if (error) return { ok: false, reason: error.message };
        setEmail(clean);
        if (typeof window !== 'undefined') window.localStorage.setItem(AUTH_KEY, clean);
        return { ok: true };
      },
      logout: async () => {
        const supabase = getSupabaseClient();
        if (supabase) await supabase.auth.signOut();
        setEmail(null);
        if (typeof window !== 'undefined') window.localStorage.removeItem(AUTH_KEY);
      },
      loading,
    }),
    [email, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

