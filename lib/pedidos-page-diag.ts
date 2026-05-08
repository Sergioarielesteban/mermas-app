/**
 * Diagnóstico temporal: traza flujo de UI en /pedidos.
 * Activar en consola: localStorage.setItem('CHEFONE_PEDIDOS_TRACE','1') y recargar.
 * Desactivar: localStorage.removeItem('CHEFONE_PEDIDOS_TRACE')
 */
const LS_KEY = 'CHEFONE_PEDIDOS_TRACE';

export function pedidosDiagEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(LS_KEY) === '1';
  } catch {
    return false;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function perfMs() {
  return typeof performance !== 'undefined' ? performance.now().toFixed(2) : '?';
}

export function pedidosDiagLog(phase: string, detail: Record<string, unknown> & { withStack?: boolean }) {
  if (!pedidosDiagEnabled()) return;
  const { withStack, ...rest } = detail;
  // eslint-disable-next-line no-console
  console.log(
    `[PEDIDOS_TRACE] ${nowIso()} +${perfMs()}ms | ${phase}`,
    rest,
  );
  if (withStack) {
    // eslint-disable-next-line no-console
    console.trace(`[PEDIDOS_TRACE] stack ← ${phase}`);
  }
}

/** Snapshot legible para before/after */
export function pedidosDiagUiSnap(input: {
  pendientesOpen: boolean;
  historicoOpen: boolean;
  expandedSentId: string | null;
  expandedHistoricoId: string | null;
  uiHydrated: boolean;
  scrollPending: number | null;
  suppressPruneUntil: number;
  visibility?: string;
}) {
  return { ...input };
}
