/** Evento para refrescar el resumen económico sin recargar la app (solo clientes con `window`). */
export const FINANZAS_DATA_CHANGED_EVENT = 'mermas:finanzas-data-changed';

export function emitFinanzasDataChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(FINANZAS_DATA_CHANGED_EVENT));
}
