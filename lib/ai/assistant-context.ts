/**
 * Construye el contexto operativo para el asistente Chef One.
 *
 * Estado actual: sin integración de datos reales. Cada bloque devuelve
 * estructura vacía con dataSource 'live' para que el asistente no invente datos.
 * Integración futura: reemplazar cada sección con consultas reales a Supabase.
 */

import { madridDateKey } from '@/lib/appcc-supabase';
import type { ChefOneAssistantOperationalContext } from '@/lib/ai/assistant-operational-context';

function ymdToday(): string {
  try {
    return madridDateKey(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * @param localId UUID del local.
 */
export function buildAssistantContext(localId: string): ChefOneAssistantOperationalContext {
  const operationalDayYmd = ymdToday();
  const generatedAt = new Date().toISOString();

  return {
    meta: {
      generatedAt,
      localId,
      dataSource: 'live',
      operationalDayYmd,
    },
    pedidos: {
      pendientesRecepcion: [],
      pedidosLleganHoy: [],
      obligatoriosHoyPendientes: [],
    },
    albaranes: {
      pendientesRevision: 0,
      muestra: [],
    },
    precios: {
      subidasMes: [],
    },
    incidencias: {
      abiertas: [],
    },
    appcc: {
      cámarasPendientesRegistro: [],
      aceitesHoyPendientes: 0,
    },
    fichajes: {
      sinFicharHoy: [],
    },
    horarios: {
      alertasHoy: [],
    },
    mermas: {
      topProductosMes: [],
    },
    inventario: {
      bajoPar: [],
    },
    produccion: {
      planesHoy: [],
    },
    tareas: {
      checklistPendientes: [],
    },
    limpieza: {
      tareasPendientesHoy: [],
    },
    proveedores: {
      revisionDiariaPendiente: false,
      muestraRevision: [],
    },
    escandallos: {
      recetasSinCosteActualizado: [],
    },
    finanzas: {
      resumenMes: { comprasEuroEstimado: null, nota: null },
    },
  };
}
