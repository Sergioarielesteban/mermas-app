/**
 * Contexto externo futuro (clima, festivos, eventos locales).
 * Fase actual: sin llamadas HTTP; contratos listos para ampliar sin rehacer el núcleo temporal.
 */

export type WeatherSnapshot = {
  /** °C si en el futuro se conecta API */
  tempC?: number | null;
  condition?: string | null;
  precipMm?: number | null;
};

export type HolidaySnapshot = {
  /** ISO día festivo local si existe proveedor en BD futura */
  dates?: string[];
};

export type LocalEventsSnapshot = {
  labels?: string[];
};

export type ExternalContextBundle = {
  weather?: WeatherSnapshot | null;
  holidays?: HolidaySnapshot | null;
  events?: LocalEventsSnapshot | null;
  /** Versión del bundle para invalidar cache */
  version: number;
};

/** Stub: sin red; devuelve bundle vacío. Sustituir por implementación real más adelante. */
export async function fetchExternalContextBundle(_input: {
  localId: string;
  supplierId: string;
  at: Date;
}): Promise<ExternalContextBundle> {
  return { version: 0 };
}

/** Sincrónico para combinar con insights cuando ya hay cache (futuro). */
export function emptyExternalContext(): ExternalContextBundle {
  return { version: 0 };
}
