/**
 * Modo demo: sesión aislada sin cliente Supabase ni datos reales.
 * Flag en sessionStorage para que un refresh no mezcle con producción.
 */

export const DEMO_SESSION_KEY = 'chef_one_demo_mode';

/** UUID ficticio; nunca se envía a API (getSupabaseClient devuelve null en demo). */
export const DEMO_LOCAL_ID = '00000000-0000-4000-8000-00000000DEMO';

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(DEMO_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function enterDemoMode(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(DEMO_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function exitDemoMode(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(DEMO_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
