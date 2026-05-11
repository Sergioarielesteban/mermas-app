/**
 * Contrato del contexto operativo inyectado en el asistente IA.
 *
 * `dataSource: 'mock'` → datos de ejemplo con la misma forma que tendrá `live`
 * cuando cada dominio se conecte a Supabase (swap sin cambiar tipos).
 */

export type AssistantDataSource = 'mock' | 'live';

export type AssistantContextMeta = {
  generatedAt: string;
  localId: string;
  dataSource: AssistantDataSource;
  /** Zona operativa día (YYYY-MM-DD), típ. Madrid. */
  operationalDayYmd: string;
};

/** Pedidos y recepción */
export type AssistantPedidosContext = {
  pendientesRecepcion: Array<{
    orderId: string;
    supplierName: string;
    deliveryDateYmd: string;
    status: string;
    lineCount: number;
  }>;
  pedidosLleganHoy: Array<{
    orderId: string;
    supplierName: string;
    windowLabel: string | null;
  }>;
  obligatoriosHoyPendientes: Array<{
    cutoffLabel: string;
    pendingCount: number;
  }>;
};

/** Albaranes (solo metadatos agregados; sin tocar flujo OCR) */
export type AssistantAlbaranesContext = {
  pendientesRevision: number;
  muestra: Array<{
    deliveryNoteId: string;
    supplierName: string;
    status: string;
    incidentCount: number;
  }>;
};

/** Precios / compras */
export type AssistantPreciosContext = {
  subidasMes: Array<{
    productName: string;
    supplierName: string;
    deltaPct: number | null;
    lastPrice: number | null;
  }>;
};

/** Incidencias operativas (genérico) */
export type AssistantIncidenciasContext = {
  abiertas: Array<{
    id: string;
    tipo: string;
    titulo: string;
    desdeYmd: string | null;
  }>;
};

/** APPCC temperaturas */
export type AssistantAppccContext = {
  cámarasPendientesRegistro: Array<{
    unitId: string;
    label: string;
    slot: string;
  }>;
  aceitesHoyPendientes: number;
};

/** Fichajes */
export type AssistantFichajesContext = {
  sinFicharHoy: Array<{
    staffId: string;
    displayName: string;
    expectedShift: string | null;
  }>;
};

/** Horarios */
export type AssistantHorariosContext = {
  alertasHoy: Array<{ id: string; mensaje: string }>;
};

/** Mermas */
export type AssistantMermasContext = {
  topProductosMes: Array<{
    productName: string;
    kgOud: number | null;
    euroEstimado: number | null;
  }>;
};

/** Inventario (alto nivel) */
export type AssistantInventarioContext = {
  bajoPar: Array<{ articleName: string; ubicacion: string | null }>;
};

/** Producción */
export type AssistantProduccionContext = {
  planesHoy: Array<{ planId: string; nombre: string; estado: string }>;
};

/** Tareas / checklist */
export type AssistantTareasContext = {
  checklistPendientes: Array<{ id: string; titulo: string }>;
};

/** Limpieza */
export type AssistantLimpiezaContext = {
  tareasPendientesHoy: Array<{ id: string; area: string; titulo: string }>;
};

/** Proveedores */
export type AssistantProveedoresContext = {
  revisionDiariaPendiente: boolean;
  muestraRevision: Array<{ supplierId: string; nombre: string; motivo: string | null }>;
};

/** Escandallos */
export type AssistantEscandallosContext = {
  recetasSinCosteActualizado: Array<{ id: string; nombre: string }>;
};

/** Finanzas (alto nivel) */
export type AssistantFinanzasContext = {
  resumenMes: {
    comprasEuroEstimado: number | null;
    nota: string | null;
  };
};

export type ChefOneAssistantOperationalContext = {
  meta: AssistantContextMeta;
  pedidos: AssistantPedidosContext;
  albaranes: AssistantAlbaranesContext;
  precios: AssistantPreciosContext;
  incidencias: AssistantIncidenciasContext;
  appcc: AssistantAppccContext;
  fichajes: AssistantFichajesContext;
  horarios: AssistantHorariosContext;
  mermas: AssistantMermasContext;
  inventario: AssistantInventarioContext;
  produccion: AssistantProduccionContext;
  tareas: AssistantTareasContext;
  limpieza: AssistantLimpiezaContext;
  proveedores: AssistantProveedoresContext;
  escandallos: AssistantEscandallosContext;
  finanzas: AssistantFinanzasContext;
};
