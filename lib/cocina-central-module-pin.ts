const STORAGE_KEY = 'mermas_cocina_central_module_unlocked';

/**
 * Valor de `NEXT_PUBLIC_COCINA_CENTRAL_MODULE_PIN`: exactamente 4 dígitos.
 * Si no está definido o inválido, el módulo no pide clave.
 *
 * Nota: hay que leer con `process.env.NEXT_PUBLIC_…` literal. En el cliente, Next.js
 * solo inyecta variables públicas si el nombre es estático; `process.env[clave]` no funciona.
 */
export function getConfiguredCocinaCentralModulePin(): string | null {
  if (typeof process === 'undefined' || !process.env) return null;
  const raw = (process.env.NEXT_PUBLIC_COCINA_CENTRAL_MODULE_PIN ?? '').trim();
  if (raw.length !== 4) return null;
  if (!/^\d{4}$/.test(raw)) return null;
  return raw;
}

export function isCocinaCentralModulePinConfigured(): boolean {
  return getConfiguredCocinaCentralModulePin() != null;
}

export function isCocinaCentralModuleUnlockedInSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setCocinaCentralModuleUnlockedInSession(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.sessionStorage.setItem(STORAGE_KEY, '1');
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode, etc. */
  }
}

export function tryCocinaCentralModulePin(entered: string): boolean {
  const expected = getConfiguredCocinaCentralModulePin();
  if (!expected) return true;
  const d = entered.replace(/\D/g, '').slice(0, 4);
  if (d !== expected) return false;
  setCocinaCentralModuleUnlockedInSession(true);
  return true;
}

export function clearCocinaCentralModuleSession(): void {
  setCocinaCentralModuleUnlockedInSession(false);
}
