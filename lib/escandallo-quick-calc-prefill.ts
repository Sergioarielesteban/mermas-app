const STORAGE_KEY = 'escandallo-quick-calc-prefill-v1';

export type EscandalloQuickCalcPrefill = {
  v: 1;
  at: number;
  name: string;
  /** PVP con IVA, como string tecleable en el asistente (ej. 12,83) */
  saleGross: string;
  /** IVA % venta, ej. 10 */
  saleVat: string;
};

export function writeEscandalloQuickCalcPrefill(p: Omit<EscandalloQuickCalcPrefill, 'v' | 'at'>): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: EscandalloQuickCalcPrefill = { v: 1, at: Date.now(), ...p };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function parseValid(raw: string | null): EscandalloQuickCalcPrefill | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as EscandalloQuickCalcPrefill;
    if (p?.v !== 1 || typeof p.at !== 'number' || Date.now() - p.at > 120_000) {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function readEscandalloQuickCalcPrefill(): EscandalloQuickCalcPrefill | null {
  if (typeof window === 'undefined') return null;
  return parseValid(sessionStorage.getItem(STORAGE_KEY));
}

export function clearEscandalloQuickCalcPrefill(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
