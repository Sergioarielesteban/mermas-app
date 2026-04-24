/**
 * Navegación Escandallos (asistente nueva receta) ↔ Artículos máster.
 * Referencia en sessionStorage para volver sin romper el borrador del wizard.
 */

const STORAGE_KEY = 'escandallo-wizard-to-articulos-v1';
const MAX_AGE_MS = 1000 * 60 * 60 * 12; // 12 h

export type EscandalloWizardArticulosReturnV1 = {
  v: 1;
  localId: string;
  /** Paso del asistente al salir hacia Artículos máster. */
  step: number;
  at: number;
};

export function writeEscandalloWizardBeforeArticulosNav(localId: string, step: number): void {
  if (typeof window === 'undefined' || !localId) return;
  try {
    const payload: EscandalloWizardArticulosReturnV1 = {
      v: 1,
      localId,
      step,
      at: Date.now(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function readEscandalloWizardArticulosReturn(localId: string): EscandalloWizardArticulosReturnV1 | null {
  if (typeof window === 'undefined' || !localId) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as EscandalloWizardArticulosReturnV1;
    if (p?.v !== 1 || p.localId !== localId) return null;
    if (typeof p.at !== 'number' || Date.now() - p.at > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function clearEscandalloWizardArticulosReturn(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
