/** Marcado local «revisado» para ítems de revision pre-pedido (solo UX, mismo día). */

const PREFIX = 'pedidos_agenda_review_ok:';

function key(localId: string, ymd: string, reviewItemId: string) {
  return `${PREFIX}${localId}:${ymd}:${reviewItemId}`;
}

export function isReviewItemMarkedDone(localId: string | null, ymd: string, reviewItemId: string): boolean {
  if (!localId || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key(localId, ymd, reviewItemId)) === '1';
  } catch {
    return false;
  }
}

export function markReviewItemDone(localId: string, ymd: string, reviewItemId: string) {
  try {
    window.localStorage.setItem(key(localId, ymd, reviewItemId), '1');
  } catch {
    /* ignore */
  }
}

/** Marca todos los ítems de revisión del proveedor para ese día (checklist por proveedor). */
export function markSupplierReviewItemsDone(localId: string, ymd: string, reviewItemIds: string[]) {
  for (const id of reviewItemIds) {
    markReviewItemDone(localId, ymd, id);
  }
}
