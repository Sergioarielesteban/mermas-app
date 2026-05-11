/** Omisión manual «no pedir hoy» para cortes obligatorios de agenda (solo UX, mismo día). */

const PREFIX = 'pedidos_agenda_mandatory_omit:';

function key(localId: string, ymd: string, supplierId: string) {
  return `${PREFIX}${localId}:${ymd}:${supplierId}`;
}

export function isMandatoryOmitted(localId: string | null, ymd: string, supplierId: string): boolean {
  if (!localId || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key(localId, ymd, supplierId)) === '1';
  } catch {
    return false;
  }
}

export function markMandatoryOmitted(localId: string, ymd: string, supplierId: string) {
  try {
    window.localStorage.setItem(key(localId, ymd, supplierId), '1');
  } catch {
    /* ignore */
  }
}
