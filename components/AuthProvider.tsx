'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { isAllowedEmail } from '@/lib/auth-access';

type AuthContextValue = {
  email: string | null;
  /** Nombre visible (profiles.full_name). */
  displayName: string | null;
  /** Alias de acceso (profiles.login_username), por si no hay full_name. */
  loginUsername: string | null;
  /** auth.users.id cuando hay sesión Supabase. */
  userId: string | null;
  /** Supabase multi-local: usuario vinculado a un local (opción B). */
  localId: string | null;
  localCode: string | null;
  localName: string | null;
  /** true cuando ya se intentó cargar el perfil (o no aplica). */
  profileReady: boolean;
  login: (identifier: string, password: string) => Promise<{ ok: boolean; reason?: string }>;
  /** Valida la contraseña actual y la sustituye en Supabase Auth (sesión activa). */
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; reason?: string }>;
  logout: () => Promise<void>;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_KEY = 'mermas_user_email';
const PROFILE_CACHE_KEY = 'chef_one_profile_cache_v2';
const PROFILE_TIMEOUT_MS = 6000;
/**
 * Si getSession tarda (Wi‑Fi cocina, móvil al volver de suspensión), no enviar al login:
 * rellenar email desde localStorage y perfil en caché para desbloquear la UI.
 */
const SESSION_SOFT_UNLOCK_MS = 4000;
/** Último recurso si getSession nunca resuelve (muy raro). */
const SESSION_SAFETY_MS = 20000;

function isInvalidRefreshTokenError(message: string | undefined) {
  const m = (message ?? '').toLowerCase();
  return m.includes('invalid refresh token') || m.includes('refresh token not found');
}

function mapSupabaseAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid_credentials')) {
    return 'Usuario/email o contraseña incorrectos.';
  }
  if (m.includes('email not confirmed')) {
    return 'Tienes que confirmar el correo (enlace de Supabase) o desactivar “Confirm email” en Authentication → Providers → Email.';
  }
  return message;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error('Perfil tardó demasiado en cargar.')), ms);
    }),
  ]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loginUsername, setLoginUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [localId, setLocalId] = useState<string | null>(null);
  const [localCode, setLocalCode] = useState<string | null>(null);
  const [localName, setLocalName] = useState<string | null>(null);
  const [profileReady, setProfileReady] = useState(false);

  const clearProfile = React.useCallback(() => {
    setLocalId(null);
    setLocalCode(null);
    setLocalName(null);
    setDisplayName(null);
    setLoginUsername(null);
  }, []);

  const persistProfileCache = React.useCallback(
    (profile: {
      localId: string;
      localCode: string | null;
      localName: string | null;
      displayName: string | null;
      loginUsername: string | null;
    }) => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
    },
    [],
  );

  const restoreProfileFromCache = React.useCallback(() => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as {
        localId?: string;
        localCode?: string | null;
        localName?: string | null;
        displayName?: string | null;
        loginUsername?: string | null;
      };
      if (!parsed?.localId) return false;
      setLocalId(parsed.localId);
      setLocalCode(parsed.localCode ?? null);
      setLocalName(parsed.localName ?? null);
      setDisplayName(parsed.displayName ?? null);
      setLoginUsername(parsed.loginUsername ?? null);
      return true;
    } catch {
      return false;
    }
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
    window.localStorage.removeItem(PROFILE_CACHE_KEY);
  }, []);

  const loadProfileForUser = React.useCallback(async (uid: string | undefined) => {
    if (!uid) {
      setUserId(null);
      clearProfile();
      setProfileReady(true);
      return;
    }
    setUserId(uid);
    const supabase = getSupabaseClient();
    if (!supabase || !isSupabaseEnabled()) {
      clearProfile();
      setProfileReady(true);
      return;
    }
    setProfileReady(false);
    let data:
      | {
          local_id: string;
          full_name: string | null;
          login_username: string | null;
          locals: { code: string; name: string } | { code: string; name: string }[] | null;
        }
      | null = null;
    let error: Error | null = null;
    try {
      const res = await withTimeout(
        Promise.resolve(
          supabase
            .from('profiles')
            .select('local_id, full_name, login_username, locals(code, name)')
            .eq('user_id', uid)
            .maybeSingle(),
        ),
        PROFILE_TIMEOUT_MS,
      );
      data = (res.data as typeof data) ?? null;
      error = res.error ? new Error(res.error.message) : null;
    } catch {
      error = new Error('timeout');
    }

    // Some projects have stricter RLS on `locals`; keep local_id even if nested read fails.
    if (error || !data) {
      let profileOnly: { local_id: string; full_name: string | null; login_username: string | null } | null = null;
      let profileErr: Error | null = null;
      try {
        const res = await withTimeout(
          Promise.resolve(
            supabase
              .from('profiles')
              .select('local_id, full_name, login_username')
              .eq('user_id', uid)
              .maybeSingle(),
          ),
          PROFILE_TIMEOUT_MS,
        );
        profileOnly =
          (res.data as { local_id: string; full_name: string | null; login_username: string | null } | null) ?? null;
        profileErr = res.error ? new Error(res.error.message) : null;
      } catch {
        profileErr = new Error('timeout');
      }
      if (profileErr || !profileOnly?.local_id) {
        if (!restoreProfileFromCache()) clearProfile();
        setProfileReady(true);
        return;
      }
      setLocalId(profileOnly.local_id);
      setLocalCode(null);
      setLocalName(null);
      const dn = profileOnly.full_name?.trim() ? profileOnly.full_name.trim() : null;
      const lu = profileOnly.login_username?.trim() ? profileOnly.login_username.trim() : null;
      setDisplayName(dn);
      setLoginUsername(lu);
      persistProfileCache({
        localId: profileOnly.local_id,
        localCode: null,
        localName: null,
        displayName: dn,
        loginUsername: lu,
      });
      setProfileReady(true);
      return;
    }

    const row = data as {
      local_id: string;
      full_name: string | null;
      login_username: string | null;
      locals: { code: string; name: string } | { code: string; name: string }[] | null;
    } | null;
    if (!row) {
      clearProfile();
      setProfileReady(true);
      return;
    }
    const loc = Array.isArray(row.locals) ? row.locals[0] : row.locals;
    setLocalId(row.local_id);
    setLocalCode(loc?.code ?? null);
    setLocalName(loc?.name ?? null);
    const dn = row.full_name?.trim() ? row.full_name.trim() : null;
    const lu = row.login_username?.trim() ? row.login_username.trim() : null;
    setDisplayName(dn);
    setLoginUsername(lu);
    persistProfileCache({
      localId: row.local_id,
      localCode: loc?.code ?? null,
      localName: loc?.name ?? null,
      displayName: dn,
      loginUsername: lu,
    });
    setProfileReady(true);
  }, [clearProfile, persistProfileCache, restoreProfileFromCache]);

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

    const unlockFromLocalHints = () => {
      const remembered = window.localStorage.getItem(AUTH_KEY)?.trim().toLowerCase() ?? null;
      if (remembered) setEmail(remembered);
      void restoreProfileFromCache();
      setLoading(false);
      setProfileReady(true);
    };

    const softUnlockTimer = window.setTimeout(() => {
      if (!isMounted) return;
      unlockFromLocalHints();
    }, SESSION_SOFT_UNLOCK_MS);

    const safetyTimer = window.setTimeout(() => {
      if (!isMounted) return;
      window.clearTimeout(softUnlockTimer);
      unlockFromLocalHints();
    }, SESSION_SAFETY_MS);

    let sessionPromise: ReturnType<typeof supabase.auth.getSession>;
    try {
      sessionPromise = supabase.auth.getSession();
    } catch {
      window.clearTimeout(softUnlockTimer);
      window.clearTimeout(safetyTimer);
      if (isMounted) {
        setLoading(false);
        setProfileReady(true);
      }
      return;
    }

    const applySessionOrSignOut = (
      session: { user: { id: string; email?: string | null } } | null,
      error: { message?: string } | null,
    ) => {
      if (!isMounted) return;
      if (error && isInvalidRefreshTokenError(error.message)) {
        setEmail(null);
        setUserId(null);
        clearProfile();
        clearLocalAuthCache();
        return;
      }
      const sessionEmail = session?.user?.email?.toLowerCase() ?? null;
      setEmail(sessionEmail);
      persistEmail(sessionEmail);
      if (session?.user?.id) void loadProfileForUser(session.user.id);
    };

    void sessionPromise
      .then(({ data, error }) => {
        if (!isMounted) return;
        window.clearTimeout(softUnlockTimer);
        window.clearTimeout(safetyTimer);
        if (error && isInvalidRefreshTokenError(error.message)) {
          setEmail(null);
          setUserId(null);
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
        setProfileReady(true);
        void loadProfileForUser(data.session?.user?.id);
      })
      .catch(() => {
        if (!isMounted) return;
        window.clearTimeout(softUnlockTimer);
        window.clearTimeout(safetyTimer);
        unlockFromLocalHints();
      });

    /**
     * Tras rato en segundo plano / pantalla apagada, el access token puede caducar:
     * refreshSession renueva con el refresh guardado en localStorage (crítico en móvil/PWA).
     */
    const rehydrateSessionAfterIdle = () => {
      if (!isMounted || document.visibilityState !== 'visible') return;
      void (async () => {
        try {
          const { data: ref, error: refErr } = await supabase.auth.refreshSession();
          if (!isMounted) return;
          if (ref.session) {
            applySessionOrSignOut(ref.session, refErr);
            return;
          }
        } catch {
          /* red / throttling */
        }
        const { data, error } = await supabase.auth.getSession();
        if (!isMounted) return;
        applySessionOrSignOut(data.session ?? null, error);
      })();
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || !isMounted) return;
      rehydrateSessionAfterIdle();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onPageShow = (ev: PageTransitionEvent) => {
      if (!isMounted) return;
      if (document.visibilityState !== 'visible') return;
      if (ev.persisted) rehydrateSessionAfterIdle();
    };
    window.addEventListener('pageshow', onPageShow);

    const onOnline = () => {
      rehydrateSessionAfterIdle();
    };
    window.addEventListener('online', onOnline);

    let focusDebounce: number | undefined;
    const onWindowFocus = () => {
      window.clearTimeout(focusDebounce);
      focusDebounce = window.setTimeout(() => {
        if (document.visibilityState === 'visible') rehydrateSessionAfterIdle();
      }, 400);
    };
    window.addEventListener('focus', onWindowFocus);

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        clearLocalAuthCache();
      }
      const nextEmail = session?.user?.email?.toLowerCase() ?? null;
      setEmail(nextEmail);
      persistEmail(nextEmail);
      setLoading(false);
      // No volver a pedir `profiles` en cada refresco de token (p. ej. al volver a la app).
      if (event === 'TOKEN_REFRESHED') return;
      void loadProfileForUser(session?.user?.id);
    });

    return () => {
      isMounted = false;
      window.clearTimeout(softUnlockTimer);
      window.clearTimeout(safetyTimer);
      window.clearTimeout(focusDebounce);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onWindowFocus);
      sub.subscription.unsubscribe();
    };
  }, [clearLocalAuthCache, clearProfile, loadProfileForUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      email,
      displayName,
      loginUsername,
      userId,
      localId,
      localCode,
      localName,
      profileReady,
      login: async (identifier: string, password: string) => {
        const clean = identifier.trim().toLowerCase();
        if (!clean || !password) return { ok: false, reason: 'Completa usuario y contraseña.' };

        const supabase = getSupabaseClient();
        if (!supabase || !isSupabaseEnabled()) {
          return { ok: false, reason: 'Supabase no está configurado.' };
        }

        let emailForAuth = clean;
        // Soporta login por alias (profiles.login_username) además de email.
        if (!clean.includes('@')) {
          const res = await fetch('/api/auth/resolve-login-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: clean }),
          });
          const payload = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            email?: string | null;
            reason?: string;
          };
          if (!res.ok || payload.ok !== true) {
            if (res.status === 429) {
              return { ok: false, reason: 'Demasiados intentos. Espera un minuto y vuelve a probar.' };
            }
            return {
              ok: false,
              reason: payload.reason ?? 'No se pudo validar el usuario en este momento.',
            };
          }
          const resolved = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
          if (!resolved) return { ok: false, reason: 'Usuario/email o contraseña incorrectos.' };
          emailForAuth = resolved;
        }

        const { error } = await supabase.auth.signInWithPassword({
          email: emailForAuth,
          password,
        });
        if (error) return { ok: false, reason: mapSupabaseAuthError(error.message) };
        setEmail(emailForAuth);
        if (typeof window !== 'undefined') window.localStorage.setItem(AUTH_KEY, emailForAuth);
        return { ok: true };
      },
      changePassword: async (currentPassword: string, newPassword: string) => {
        const trimmedNew = newPassword.trim();
        if (trimmedNew.length < 8) {
          return { ok: false, reason: 'La nueva contraseña debe tener al menos 8 caracteres.' };
        }
        if (trimmedNew === currentPassword) {
          return { ok: false, reason: 'La nueva contraseña debe ser distinta de la actual.' };
        }
        const supabase = getSupabaseClient();
        if (!supabase || !isSupabaseEnabled()) {
          return { ok: false, reason: 'Supabase no está configurado.' };
        }
        const sessionEmail = email?.trim().toLowerCase();
        if (!sessionEmail) {
          return { ok: false, reason: 'No hay sesión activa.' };
        }
        const { error: verifyErr } = await supabase.auth.signInWithPassword({
          email: sessionEmail,
          password: currentPassword,
        });
        if (verifyErr) {
          return { ok: false, reason: 'La contraseña actual no es correcta.' };
        }
        const { error: updateErr } = await supabase.auth.updateUser({ password: trimmedNew });
        if (updateErr) {
          return { ok: false, reason: mapSupabaseAuthError(updateErr.message) };
        }
        return { ok: true };
      },
      logout: async () => {
        const supabase = getSupabaseClient();
        if (supabase) await supabase.auth.signOut();
        setEmail(null);
        setUserId(null);
        clearProfile();
        setProfileReady(true);
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(AUTH_KEY);
          window.localStorage.removeItem(PROFILE_CACHE_KEY);
        }
      },
      loading,
    }),
    [
      clearProfile,
      displayName,
      email,
      localCode,
      localId,
      localName,
      loading,
      loginUsername,
      profileReady,
      userId,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

