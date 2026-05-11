/**
 * Construye el contexto operativo modular para el asistente Chef One.
 *
 * Fase actual: datos de ejemplo (`dataSource: 'mock'`) con la forma definitiva.
 * Integración futura: sustituir cada bloque por consultas reales y poner
 * `dataSource: 'live'` sin cambiar la forma de los objetos.
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
 * @param localId UUID del local (obligatorio en producción; en mock solo metadato).
 */
export function buildAssistantContext(localId: string): ChefOneAssistantOperationalContext {
  const operationalDayYmd = ymdToday();
  const generatedAt = new Date().toISOString();

  return {
    meta: {
      generatedAt,
      localId,
      dataSource: 'mock',
      operationalDayYmd,
    },
    pedidos: {
      pendientesRecepcion: [
        {
          orderId: 'ord_mock_1',
          supplierName: 'Proveedor ejemplo',
          deliveryDateYmd: operationalDayYmd,
          status: 'sent',
          lineCount: 8,
        },
      ],
      pedidosLleganHoy: [
        {
          orderId: 'ord_mock_2',
          supplierName: 'Distribuidora ejemplo',
          windowLabel: 'Mañana',
        },
      ],
      obligatoriosHoyPendientes: [{ cutoffLabel: '12:00', pendingCount: 1 }],
    },
    albaranes: {
      pendientesRevision: 2,
      muestra: [
        {
          deliveryNoteId: 'dn_mock_1',
          supplierName: 'ASSOLIM',
          status: 'pending_review',
          incidentCount: 0,
        },
        {
          deliveryNoteId: 'dn_mock_2',
          supplierName: 'FERRER',
          status: 'ocr_read',
          incidentCount: 1,
        },
      ],
    },
    precios: {
      subidasMes: [
        {
          productName: 'Lechuga iceberg',
          supplierName: 'Verduras SL',
          deltaPct: 8.5,
          lastPrice: 2.45,
        },
      ],
    },
    incidencias: {
      abiertas: [
        {
          id: 'inc_mock_1',
          tipo: 'recepcion',
          titulo: 'Paleta con embalaje dañado',
          desdeYmd: operationalDayYmd,
        },
      ],
    },
    appcc: {
      cámarasPendientesRegistro: [
        { unitId: 'cam_mock_1', label: 'Cámara 2', slot: 'mañana' },
      ],
      aceitesHoyPendientes: 1,
    },
    fichajes: {
      sinFicharHoy: [{ staffId: 'st_mock_1', displayName: 'Ejemplo persona', expectedShift: '09:00–15:00' }],
    },
    horarios: {
      alertasHoy: [{ id: 'hr_mock_1', mensaje: 'Turno cocina sin cubrir (revisar plantilla)' }],
    },
    mermas: {
      topProductosMes: [
        { productName: 'Pan barra', kgOud: 12.4, euroEstimado: 48.2 },
        { productName: 'Tomate pera', kgOud: 6.1, euroEstimado: 22.0 },
      ],
    },
    inventario: {
      bajoPar: [{ articleName: 'Aceite oliva 5L', ubicacion: 'Almacén seco' }],
    },
    produccion: {
      planesHoy: [{ planId: 'pr_mock_1', nombre: 'Mise en place comida', estado: 'pendiente' }],
    },
    tareas: {
      checklistPendientes: [{ id: 'tsk_mock_1', titulo: 'Cierre cocina — checklist' }],
    },
    limpieza: {
      tareasPendientesHoy: [{ id: 'cln_mock_1', area: 'Sala', titulo: 'Aseo barra' }],
    },
    proveedores: {
      revisionDiariaPendiente: true,
      muestraRevision: [
        { supplierId: 'sup_mock_1', nombre: 'Carnes del norte', motivo: 'Precio fuera de rango' },
      ],
    },
    escandallos: {
      recetasSinCosteActualizado: [{ id: 'esc_mock_1', nombre: 'Salsa romesco' }],
    },
    finanzas: {
      resumenMes: {
        comprasEuroEstimado: 18420.5,
        nota: 'Cifra orientativa hasta conectar contabilidad detallada.',
      },
    },
  };
}
