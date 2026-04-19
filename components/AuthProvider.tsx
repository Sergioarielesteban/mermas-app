'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEMO_LOCAL_ID, exitDemoMode, isDemoMode } from '@/lib/demo-mode';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { isAllowedEmail } from '@/lib/auth-access';
import { parseProfileAppRole, type ProfileAppRole } from '@/lib/profile-app-role';
import { DEFAULT_MAX_USERS, DEFAULT_PLAN, type PlanCode } from '@/lib/planPermissions';

export type { ProfileAppRole };

type AuthContextValue = {
  email: string | null;
  /** Nombre visible (profiles.full_name). */
  displayName: string | null;
  /** Alias de acceso (profiles.login_username), por si no hay full_name. */
  loginUsername: string | null;
  /** auth.users.id cuando hay sesión Supabase. */
  userId: string | null;
  /** Rol de aplicación (profiles.role). */
  profileRole: ProfileAppRole | null;
  /** Supabase multi-local: usuario vinculado a un local (opción B). */
  localId: string | null;
  localCode: string | null;
  localName: string | null;
  /** Cocina central (columna `locals.is_central_kitchen`). */
  isCentralKitchen: boolean;
  /** Plan de suscripcion del local. */
  plan: PlanCode;
  /** Limite de usuarios del plan. */
  maxUsers: number;
  /** Simulación local de cambio de plan (sin persistir en backend). */
  selectPlan: (plan: PlanCode) => void;
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
const PROFILE_CACHE_KEY = 'chef_one_profile_cache_v4';
const PLAN_OVERRIDE_KEY = 'chef_one_plan_override_v1';
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
  const [profileRole, setProfileRole] = useState<ProfileAppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [localId, setLocalId] = useState<string | null>(null);
  const [localCode, setLocalCode] = useState<string | null>(null);
  const [localName, setLocalName] = useState<string | null>(null);
  const [isCentralKitchen, setIsCentralKitchen] = useState(false);
  const [plan, setPlan] = useState<PlanCode>(DEFAULT_PLAN);
  const [maxUsers, setMaxUsers] = useState<number>(DEFAULT_MAX_USERS);
  const [profileReady, setProfileReady] = useState(false);

  const clearProfile = React.useCallback(() => {
    setLocalId(null);
    setLocalCode(null);
    setLocalName(null);
    setIsCentralKitchen(false);
    setPlan(DEFAULT_PLAN);
    setMaxUsers(DEFAULT_MAX_USERS);
    setDisplayName(null);
    setLoginUsername(null);
    setProfileRole(null);
  }, []);

  const persistProfileCache = React.useCallback(
    (profile: {
      localId: string;
      localCode: string | null;
      localName: string | null;
      isCentralKitchen: boolean;
      plan: PlanCode;
      maxUsers: number;
      displayName: string | null;
      loginUsername: string | null;
      profileRole: ProfileAppRole | null;
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
        isCentralKitchen?: boolean;
        plan?: PlanCode;
        maxUsers?: number;
        displayName?: string | null;
        loginUsername?: string | null;
        profileRole?: ProfileAppRole | null;
      };
      if (!parsed?.localId) return false;
      setLocalId(parsed.localId);
      setLocalCode(parsed.localCode ?? null);
      setLocalName(parsed.localName ?? null);
      setIsCentralKitchen(!!parsed.isCentralKitchen);
      setPlan(parsed.plan ?? DEFAULT_PLAN);
      setMaxUsers(typeof parsed.maxUsers === 'number' && parsed.maxUsers > 0 ? parsed.maxUsers : DEFAULT_MAX_USERS);
      setDisplayName(parsed.displayName ?? null);
      setLoginUsername(parsed.loginUsername ?? null);
      setProfileRole(parsed.profileRole ?? null);
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
    window.localStorage.removeItem(PLAN_OVERRIDE_KEY);
  }, []);

  const readPlanOverride = React.useCallback((localIdArg: string | null): PlanCode | null => {
    if (typeof window === 'undefined' || !localIdArg) return null;
    try {
      const raw = window.localStorage.getItem(PLAN_OVERRIDE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Record<string, PlanCode>;
      const value = parsed[localIdArg];
      if (value === 'OPERATIVO' || value === 'CONTROL' || value === 'PRO') return value;
      return null;
    } catch {
      return null;
    }
  }, []);

  const writePlanOverride = React.useCallback((localIdArg: string | null, nextPlan: PlanCode) => {
    if (typeof window === 'undefined' || !localIdArg) return;
    try {
      const raw = window.localStorage.getItem(PLAN_OVERRIDE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, PlanCode>) : {};
      parsed[localIdArg] = nextPlan;
      window.localStorage.setItem(PLAN_OVERRIDE_KEY, JSON.stringify(parsed));
    } catch {
      /* ignore localStorage quota/parse errors */
    }
  }, []);

  const loadPlanForLocal = React.useCallback(async (localId: string): Promise<{ plan: PlanCode; maxUsers: number }> => {
    const supabase = getSupabaseClient();
    if (!supabase || !isSupabaseEnabled()) {
      const fallback = { plan: DEFAULT_PLAN, maxUsers: DEFAULT_MAX_USERS };
      setPlan(fallback.plan);
      setMaxUsers(fallback.maxUsers);
      return fallback;
    }
    try {
      const { data, error } = await withTimeout(
        Promise.resolve(
          supabase
            .from('subscriptions')
            .select('plan, max_users, status, created_at')
            .eq('local_id', localId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1),
        ),
        PROFILE_TIMEOUT_MS,
      );
      if (error || !Array.isArray(data) || data.length === 0) {
        const fallback = { plan: DEFAULT_PLAN, maxUsers: DEFAULT_MAX_USERS };
        const overriddenPlan = readPlanOverride(localId) ?? fallback.plan;
        setPlan(overriddenPlan);
        setMaxUsers(fallback.maxUsers);
        return { plan: overriddenPlan, maxUsers: fallback.maxUsers };
      }
      const row = data[0] as { plan?: string | null; max_users?: number | null };
      const nextPlan = row.plan === 'OPERATIVO' || row.plan === 'CONTROL' || row.plan === 'PRO' ? row.plan : DEFAULT_PLAN;
      const effectivePlan = readPlanOverride(localId) ?? nextPlan;
      const nextMaxUsers =
        typeof row.max_users === 'number' && Number.isFinite(row.max_users) && row.max_users > 0
          ? Math.floor(row.max_users)
          : DEFAULT_MAX_USERS;
      setPlan(effectivePlan);
      setMaxUsers(nextMaxUsers);
      return { plan: effectivePlan, maxUsers: nextMaxUsers };
    } catch {
      const fallback = { plan: DEFAULT_PLAN, maxUsers: DEFAULT_MAX_USERS };
      const overriddenPlan = readPlanOverride(localId) ?? fallback.plan;
      setPlan(overriddenPlan);
      setMaxUsers(fallback.maxUsers);
      return { plan: overriddenPlan, maxUsers: fallback.maxUsers };
    }
  }, [readPlanOverride]);

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
          role: string | null;
          locals:
            | { code: string; name: string; is_central_kitchen?: boolean | null }
            | { code: string; name: string; is_central_kitchen?: boolean | null }[]
            | null;
        }
      | null = null;
    let error: Error | null = null;
    try {
      const res = await withTimeout(
        Promise.resolve(
          supabase
            .from('profiles')
            .select('local_id, full_name, login_username, role, locals(code, name, is_central_kitchen)')
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
      let profileOnly: {
        local_id: string;
        full_name: string | null;
        login_username: string | null;
        role: string | null;
      } | null = null;
      let profileErr: Error | null = null;
      try {
        const res = await withTimeout(
          Promise.resolve(
            supabase
              .from('profiles')
              .select('local_id, full_name, login_username, role')
              .eq('user_id', uid)
              .maybeSingle(),
          ),
          PROFILE_TIMEOUT_MS,
        );
        profileOnly =
          (res.data as {
            local_id: string;
            full_name: string | null;
            login_username: string | null;
            role: string | null;
          } | null) ?? null;
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
      let centralFallback = false;
      try {
        const lr = await withTimeout(
          Promise.resolve(
            supabase
              .from('locals')
              .select('is_central_kitchen')
              .eq('id', profileOnly.local_id)
              .maybeSingle(),
          ),
          PROFILE_TIMEOUT_MS,
        );
        centralFallback = !!(lr.data as { is_central_kitchen?: boolean } | null)?.is_central_kitchen;
      } catch {
        centralFallback = false;
      }
      setIsCentralKitchen(centralFallback);
      const planState = await loadPlanForLocal(profileOnly.local_id);
      const dn = profileOnly.full_name?.trim() ? profileOnly.full_name.trim() : null;
      const lu = profileOnly.login_username?.trim() ? profileOnly.login_username.trim() : null;
      setDisplayName(dn);
      setLoginUsername(lu);
      const pr = parseProfileAppRole(profileOnly.role);
      setProfileRole(pr);
      persistProfileCache({
        localId: profileOnly.local_id,
        localCode: null,
        localName: null,
        isCentralKitchen: centralFallback,
        plan: planState.plan,
        maxUsers: planState.maxUsers,
        displayName: dn,
        loginUsername: lu,
        profileRole: pr,
      });
      setProfileReady(true);
      return;
    }

    const row = data as {
      local_id: string;
      full_name: string | null;
      login_username: string | null;
      role: string | null;
      locals:
        | { code: string; name: string; is_central_kitchen?: boolean | null }
        | { code: string; name: string; is_central_kitchen?: boolean | null }[]
        | null;
    } | null;
    if (!row) {
      clearProfile();
      setProfileReady(true);
      return;
    }
    const loc = Array.isArray(row.locals) ? row.locals[0] : row.locals;
    const central = !!loc?.is_central_kitchen;
    setLocalId(row.local_id);
    setLocalCode(loc?.code ?? null);
    setLocalName(loc?.name ?? null);
    setIsCentralKitchen(central);
    const planState = await loadPlanForLocal(row.local_id);
    const dn = row.full_name?.trim() ? row.full_name.trim() : null;
    const lu = row.login_username?.trim() ? row.login_username.trim() : null;
    setDisplayName(dn);
    setLoginUsername(lu);
    const pr = parseProfileAppRole(row.role);
    setProfileRole(pr);
    persistProfileCache({
      localId: row.local_id,
      localCode: loc?.code ?? null,
      localName: loc?.name ?? null,
      isCentralKitchen: central,
      plan: planState.plan,
      maxUsers: planState.maxUsers,
      displayName: dn,
      loginUsername: lu,
      profileRole: pr,
    });
    setProfileReady(true);
  }, [clearProfile, loadPlanForLocal, persistProfileCache, restoreProfileFromCache]);

  useEffect(() => {
    if (typeof window !== 'undefined' && isDemoMode()) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setEmail('demo@chef-one.app');
      setDisplayName('Modo demo');
      setLoginUsername('demo');
      setUserId(null);
      setLocalId(DEMO_LOCAL_ID);
      setLocalCode('DEMO');
      setLocalName('Restaurante Demo');
      setIsCentralKitchen(false);
      setPlan('PRO');
      setMaxUsers(999);
      setProfileRole('staff');
      setLoading(false);
      setProfileReady(true);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }

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
  }, [clearLocalAuthCache, clearProfile, loadProfileForUser, restoreProfileFromCache]);

  const value = useMemo<AuthContextValue>(
    () => ({
      email,
      displayName,
      loginUsername,
      userId,
      profileRole,
      localId,
      localCode,
      localName,
      isCentralKitchen,
      plan,
      maxUsers,
      selectPlan: (nextPlan: PlanCode) => {
        setPlan(nextPlan);
        writePlanOverride(localId, nextPlan);
      },
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
            error?: string;
          };
          if (!res.ok || payload.ok !== true) {
            if (res.status === 429) {
              return { ok: false, reason: 'Demasiados intentos. Espera un minuto y vuelve a probar.' };
            }
            return {
              ok: false,
              reason:
                (typeof payload.reason === 'string' ? payload.reason : undefined) ??
                (typeof payload.error === 'string' ? payload.error : undefined) ??
                'No se pudo validar el usuario en este momento.',
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
        if (typeof window !== 'undefined' && isDemoMode()) {
          exitDemoMode();
        }
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
      isCentralKitchen,
      maxUsers,
      loading,
      loginUsername,
      plan,
      profileReady,
      profileRole,
      userId,
      writePlanOverride,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

