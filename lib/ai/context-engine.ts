/**
 * Context Engine del asistente Chef One.
 *
 * Detecta la intención de la pregunta y carga solo los módulos de Supabase
 * necesarios. Nunca inventa datos: si una consulta falla o devuelve vacío,
 * el módulo devuelve array vacío y el asistente lo comunica al usuario.
 */

import { adminRestGet } from '@/lib/server/supabase-admin';
import { madridDateKey } from '@/lib/appcc-supabase';
import type { ChefOneAssistantOperationalContext } from '@/lib/ai/assistant-operational-context';

// ── Utilidades de fecha ───────────────────────────────────────────────────────

function ymdToday(): string {
  try {
    return madridDateKey(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function firstDayOfMonth(ymd: string): string {
  return ymd.slice(0, 7) + '-01';
}

// ── Detección de intención ────────────────────────────────────────────────────

export type ContextDomain =
  | 'pedidos'
  | 'albaranes'
  | 'precios'
  | 'appcc'
  | 'mermas'
  | 'inventario'
  | 'fichajes'
  | 'horarios'
  | 'incidencias'
  | 'limpieza';

const DOMAIN_KEYWORDS: Record<ContextDomain, string[]> = {
  pedidos: [
    'pedido', 'pedidos', 'orden', 'ordenes', 'llega', 'llegan', 'llegara',
    'recepc', 'recibir', 'recibido', 'proveedor', 'proveedores', 'enviado',
    'compra', 'compras', 'mañana', 'hoy',
  ],
  albaranes: [
    'albaran', 'albaranes', 'factura', 'facturas', 'entrega', 'entrego', 'entregaron',
  ],
  precios: [
    'precio', 'precios', 'coste', 'costes', 'cuesta', 'costo', 'cuanto',
    'subida', 'subio', 'subido', 'bajo', 'importe', 'caro', 'barato',
    'economico', 'tarifa',
  ],
  appcc: [
    'temperatura', 'temperaturas', 'camara', 'camaras', 'nevera', 'congelador',
    'aceite', 'freidora', 'frite', 'appcc', 'control', 'registro', 'frio',
  ],
  mermas: [
    'merma', 'mermas', 'desperdicio', 'desperdicios', 'perdida', 'perdidas',
    'tiramos', 'tiro', 'desperdiciamos', 'tirado',
  ],
  inventario: [
    'inventario', 'stock', 'almacen', 'falta', 'quedan', 'queda',
    'par', 'existencias', 'cantidad',
  ],
  fichajes: [
    'fichaje', 'fichajes', 'fichar', 'ficho', 'ficharon', 'llego',
    'llegaron', 'presencia', 'ausente', 'ausencia', 'quien ha', 'trabajando',
  ],
  horarios: [
    'horario', 'horarios', 'planifica', 'plantilla', 'cuadrante', 'turno', 'turnos',
  ],
  incidencias: [
    'incidencia', 'incidencias', 'problema', 'problemas', 'rotura', 'dano',
    'danos', 'reclamacion', 'reclamaciones', 'incidente',
  ],
  limpieza: [
    'limpieza', 'limpiar', 'aseo', 'fregar', 'limpio', 'limpia', 'limpias',
  ],
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function detectAssistantIntent(question: string): Set<ContextDomain> {
  const q = normalize(question);
  const detected = new Set<ContextDomain>();
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS) as Array<[ContextDomain, string[]]>) {
    if (keywords.some((kw) => q.includes(normalize(kw)))) {
      detected.add(domain);
    }
  }
  return detected;
}

// ── Helpers de query ──────────────────────────────────────────────────────────

function enc(v: string): string {
  return encodeURIComponent(v);
}

// ── Fetchers por dominio ──────────────────────────────────────────────────────

async function getPedidosContext(localId: string, todayYmd: string) {
  const empty = { pendientesRecepcion: [], pedidosLleganHoy: [], obligatoriosHoyPendientes: [] };
  try {
    type OrderRow = {
      id: string;
      status: string;
      delivery_date: string | null;
      pedido_suppliers: { name: string } | Array<{ name: string }> | null;
    };
    const rows = await adminRestGet<OrderRow[]>(
      `purchase_orders?local_id=eq.${enc(localId)}&status=in.(sent,draft)&select=id,status,delivery_date,pedido_suppliers(name)&order=delivery_date.asc&limit=15`,
    );
    const tomorrowYmd = addDays(todayYmd, 1);

    const pendientesRecepcion = rows
      .filter((r) => r.status === 'sent')
      .map((r) => {
        const sup = Array.isArray(r.pedido_suppliers) ? r.pedido_suppliers[0] : r.pedido_suppliers;
        return {
          orderId: r.id,
          supplierName: sup?.name ?? '',
          deliveryDateYmd: r.delivery_date ?? todayYmd,
          status: r.status,
          lineCount: 0,
        };
      });

    const pedidosLleganHoy = rows
      .filter((r) => r.delivery_date === tomorrowYmd)
      .map((r) => {
        const sup = Array.isArray(r.pedido_suppliers) ? r.pedido_suppliers[0] : r.pedido_suppliers;
        return {
          orderId: r.id,
          supplierName: sup?.name ?? '',
          windowLabel: 'Mañana',
        };
      });

    return { pendientesRecepcion, pedidosLleganHoy, obligatoriosHoyPendientes: [] };
  } catch {
    return empty;
  }
}

async function getAlbaranesContext(localId: string) {
  const empty = {
    pendientesRevision: 0,
    muestra: [] as Array<{ deliveryNoteId: string; supplierName: string; status: string; incidentCount: number }>,
  };
  try {
    type DnRow = { id: string; supplier_name: string; status: string };
    const rows = await adminRestGet<DnRow[]>(
      `delivery_notes?local_id=eq.${enc(localId)}&status=in.(pending_review,ocr_read,with_incidents)&select=id,supplier_name,status&order=created_at.desc&limit=10`,
    );
    return {
      pendientesRevision: rows.length,
      muestra: rows.slice(0, 5).map((r) => ({
        deliveryNoteId: r.id,
        supplierName: r.supplier_name,
        status: r.status,
        incidentCount: r.status === 'with_incidents' ? 1 : 0,
      })),
    };
  } catch {
    return empty;
  }
}

async function getPreciosContext(localId: string, sinceYmd: string) {
  const empty = {
    subidasMes: [] as Array<{
      productName: string;
      supplierName: string;
      deltaPct: number | null;
      lastPrice: number | null;
    }>,
  };
  try {
    type HpRow = {
      supplier_product_id: string;
      precio_nuevo: number | string;
      diferencia_pct: number | string | null;
      fecha: string;
    };
    const rows = await adminRestGet<HpRow[]>(
      `historico_precios?local_id=eq.${enc(localId)}&fecha=gte.${sinceYmd}&select=supplier_product_id,precio_nuevo,diferencia_pct,fecha&order=diferencia_pct.desc.nullslast&limit=10`,
    );
    if (rows.length === 0) return empty;

    const spIds = [...new Set(rows.map((r) => r.supplier_product_id))];
    type SpRow = { id: string; name: string; pedido_suppliers: { name: string } | Array<{ name: string }> | null };
    const spRows = await adminRestGet<SpRow[]>(
      `pedido_supplier_products?id=in.(${spIds.join(',')})&select=id,name,pedido_suppliers(name)&limit=20`,
    ).catch(() => [] as SpRow[]);

    const spMap = new Map(spRows.map((r) => [r.id, r]));

    return {
      subidasMes: rows
        .filter((r) => r.diferencia_pct != null && Number(r.diferencia_pct) > 0)
        .map((r) => {
          const sp = spMap.get(r.supplier_product_id);
          const sup = Array.isArray(sp?.pedido_suppliers) ? sp!.pedido_suppliers[0] : sp?.pedido_suppliers;
          return {
            productName: sp?.name ?? '',
            supplierName: sup?.name ?? '',
            deltaPct: r.diferencia_pct != null ? Number(r.diferencia_pct) : null,
            lastPrice: Number(r.precio_nuevo),
          };
        })
        .filter((r) => r.productName),
    };
  } catch {
    return empty;
  }
}

async function getAppccContext(localId: string, todayYmd: string) {
  const empty = {
    cámarasPendientesRegistro: [] as Array<{ unitId: string; label: string; slot: string }>,
    aceitesHoyPendientes: 0,
  };
  try {
    type UnitRow = { id: string; name: string };
    type ReadingRow = { cold_unit_id: string; slot: string };
    type FryerRow = { id: string };
    type OilEventRow = { fryer_id: string };

    const [units, readings, fryers, oilEvents] = await Promise.all([
      adminRestGet<UnitRow[]>(
        `appcc_cold_units?local_id=eq.${enc(localId)}&is_active=eq.true&select=id,name&order=sort_order`,
      ).catch(() => [] as UnitRow[]),
      adminRestGet<ReadingRow[]>(
        `appcc_temperature_readings?local_id=eq.${enc(localId)}&reading_date=eq.${todayYmd}&select=cold_unit_id,slot`,
      ).catch(() => [] as ReadingRow[]),
      adminRestGet<FryerRow[]>(
        `appcc_fryers?local_id=eq.${enc(localId)}&is_active=eq.true&select=id`,
      ).catch(() => [] as FryerRow[]),
      adminRestGet<OilEventRow[]>(
        `appcc_oil_events?local_id=eq.${enc(localId)}&event_date=eq.${todayYmd}&select=fryer_id`,
      ).catch(() => [] as OilEventRow[]),
    ]);

    const SLOTS = ['manana', 'noche'] as const;
    const doneSet = new Set(readings.map((r) => `${r.cold_unit_id}__${r.slot}`));
    const pending: Array<{ unitId: string; label: string; slot: string }> = [];
    for (const unit of units) {
      for (const slot of SLOTS) {
        if (!doneSet.has(`${unit.id}__${slot}`)) {
          pending.push({ unitId: unit.id, label: unit.name, slot });
        }
      }
    }

    const fryersWithEvents = new Set(oilEvents.map((e) => e.fryer_id));
    const aceitesHoyPendientes = fryers.filter((f) => !fryersWithEvents.has(f.id)).length;

    return { cámarasPendientesRegistro: pending, aceitesHoyPendientes };
  } catch {
    return empty;
  }
}

async function getMermasContext(localId: string, sinceYmd: string) {
  const empty = {
    topProductosMes: [] as Array<{ productName: string; kgOud: number | null; euroEstimado: number | null }>,
  };
  try {
    type MermaRow = { product_id: string; quantity: number | string; cost_eur: number | string };
    const rows = await adminRestGet<MermaRow[]>(
      `mermas?local_id=eq.${enc(localId)}&occurred_at=gte.${sinceYmd}&select=product_id,quantity,cost_eur&limit=500`,
    );
    if (rows.length === 0) return empty;

    const aggByProduct = new Map<string, { qty: number; cost: number }>();
    for (const r of rows) {
      const prev = aggByProduct.get(r.product_id) ?? { qty: 0, cost: 0 };
      aggByProduct.set(r.product_id, {
        qty: prev.qty + Number(r.quantity),
        cost: prev.cost + Number(r.cost_eur),
      });
    }

    const topIds = [...aggByProduct.entries()]
      .sort((a, b) => b[1].cost - a[1].cost)
      .slice(0, 5)
      .map(([id]) => id);

    type ProductRow = { id: string; name: string };
    const productRows = await adminRestGet<ProductRow[]>(
      `products?id=in.(${topIds.join(',')})&select=id,name&limit=10`,
    ).catch(() => [] as ProductRow[]);
    const nameById = new Map(productRows.map((r) => [r.id, r.name]));

    return {
      topProductosMes: topIds.map((id) => ({
        productName: nameById.get(id) ?? '',
        kgOud: aggByProduct.get(id)!.qty,
        euroEstimado: Number(aggByProduct.get(id)!.cost.toFixed(2)),
      })),
    };
  } catch {
    return empty;
  }
}

async function getInventarioContext(localId: string) {
  const empty = { bajoPar: [] as Array<{ articleName: string; ubicacion: string | null }> };
  try {
    type InvRow = { id: string; name: string; quantity_on_hand: number | null };
    const rows = await adminRestGet<InvRow[]>(
      `inventory_items?local_id=eq.${enc(localId)}&is_active=eq.true&quantity_on_hand=lt.2&quantity_on_hand=not.is.null&select=id,name,quantity_on_hand&order=quantity_on_hand.asc&limit=10`,
    );
    return {
      bajoPar: rows.map((r) => ({ articleName: r.name, ubicacion: null })),
    };
  } catch {
    return empty;
  }
}

async function getStaffContext(localId: string, todayYmd: string) {
  const emptyFichajes = { sinFicharHoy: [] as Array<{ staffId: string; displayName: string; expectedShift: string | null }> };
  const emptyHorarios = { alertasHoy: [] as Array<{ id: string; mensaje: string }> };
  try {
    type EmpRow = { id: string; name: string };
    type EntryRow = { employee_id: string };

    const todayStart = `${todayYmd}T00:00:00.000Z`;
    const tomorrowStart = `${addDays(todayYmd, 1)}T00:00:00.000Z`;

    const [employees, entries] = await Promise.all([
      adminRestGet<EmpRow[]>(
        `staff_employees?local_id=eq.${enc(localId)}&is_active=eq.true&select=id,name&limit=50`,
      ).catch(() => [] as EmpRow[]),
      adminRestGet<EntryRow[]>(
        `staff_time_entries?local_id=eq.${enc(localId)}&occurred_at=gte.${todayStart}&occurred_at=lt.${tomorrowStart}&select=employee_id&limit=200`,
      ).catch(() => [] as EntryRow[]),
    ]);

    const fichadosIds = new Set(entries.map((e) => e.employee_id));
    const sinFicharHoy = employees
      .filter((e) => !fichadosIds.has(e.id))
      .slice(0, 10)
      .map((e) => ({ staffId: e.id, displayName: e.name, expectedShift: null }));

    return { fichajes: { sinFicharHoy }, horarios: emptyHorarios };
  } catch {
    return { fichajes: emptyFichajes, horarios: emptyHorarios };
  }
}

async function getLimpiezaContext(localId: string, todayYmd: string) {
  const empty = { tareasPendientesHoy: [] as Array<{ id: string; area: string; titulo: string }> };
  try {
    type TaskRow = { id: string; title: string; category_id: string | null };
    type CatRow = { id: string; name: string };
    type LogRow = { task_id: string };

    const [tasks, categories, logs] = await Promise.all([
      adminRestGet<TaskRow[]>(
        `appcc_cleaning_tasks?local_id=eq.${enc(localId)}&is_active=eq.true&select=id,title,category_id&order=sort_order.asc&limit=60`,
      ).catch(() => [] as TaskRow[]),
      adminRestGet<CatRow[]>(
        `appcc_cleaning_categories?local_id=eq.${enc(localId)}&select=id,name&limit=30`,
      ).catch(() => [] as CatRow[]),
      adminRestGet<LogRow[]>(
        `appcc_cleaning_logs?local_id=eq.${enc(localId)}&log_date=eq.${todayYmd}&select=task_id&limit=200`,
      ).catch(() => [] as LogRow[]),
    ]);

    const catName = new Map(categories.map((c) => [c.id, c.name]));
    const doneIds = new Set(logs.map((l) => l.task_id));

    const tareasPendientesHoy = tasks
      .filter((t) => !doneIds.has(t.id))
      .slice(0, 10)
      .map((t) => ({
        id: t.id,
        area: (t.category_id ? catName.get(t.category_id) : null) ?? '',
        titulo: t.title,
      }));

    return { tareasPendientesHoy };
  } catch {
    return empty;
  }
}

async function getIncidenciasContext(localId: string) {
  const empty = { abiertas: [] as Array<{ id: string; tipo: string; titulo: string; desdeYmd: string | null }> };
  try {
    type IncRow = { id: string; incident_type: string; description: string; created_at: string };
    const rows = await adminRestGet<IncRow[]>(
      `delivery_note_incidents?local_id=eq.${enc(localId)}&status=eq.open&select=id,incident_type,description,created_at&order=created_at.desc&limit=10`,
    );
    return {
      abiertas: rows.map((r) => ({
        id: r.id,
        tipo: r.incident_type,
        titulo: r.description,
        desdeYmd: r.created_at?.slice(0, 10) ?? null,
      })),
    };
  } catch {
    return empty;
  }
}

// ── Builder principal ─────────────────────────────────────────────────────────

export async function buildAssistantContext(
  localId: string,
  question: string,
): Promise<ChefOneAssistantOperationalContext> {
  const todayYmd = ymdToday();
  const generatedAt = new Date().toISOString();
  const sinceYmd = firstDayOfMonth(todayYmd);

  let domains = detectAssistantIntent(question);

  // Sin intención específica → resumen rápido de los módulos más operativos
  if (domains.size === 0) {
    domains = new Set<ContextDomain>(['pedidos', 'albaranes', 'appcc', 'fichajes', 'incidencias', 'limpieza']);
  }

  const [pedidos, albaranes, precios, appcc, mermas, inventario, staff, limpieza, incidencias] =
    await Promise.all([
      domains.has('pedidos')
        ? getPedidosContext(localId, todayYmd)
        : Promise.resolve({ pendientesRecepcion: [], pedidosLleganHoy: [], obligatoriosHoyPendientes: [] }),
      domains.has('albaranes')
        ? getAlbaranesContext(localId)
        : Promise.resolve({ pendientesRevision: 0, muestra: [] }),
      domains.has('precios')
        ? getPreciosContext(localId, sinceYmd)
        : Promise.resolve({ subidasMes: [] }),
      domains.has('appcc')
        ? getAppccContext(localId, todayYmd)
        : Promise.resolve({ cámarasPendientesRegistro: [], aceitesHoyPendientes: 0 }),
      domains.has('mermas')
        ? getMermasContext(localId, sinceYmd)
        : Promise.resolve({ topProductosMes: [] }),
      domains.has('inventario')
        ? getInventarioContext(localId)
        : Promise.resolve({ bajoPar: [] }),
      domains.has('fichajes') || domains.has('horarios')
        ? getStaffContext(localId, todayYmd)
        : Promise.resolve({ fichajes: { sinFicharHoy: [] }, horarios: { alertasHoy: [] } }),
      domains.has('limpieza')
        ? getLimpiezaContext(localId, todayYmd)
        : Promise.resolve({ tareasPendientesHoy: [] }),
      domains.has('incidencias')
        ? getIncidenciasContext(localId)
        : Promise.resolve({ abiertas: [] }),
    ]);

  return {
    meta: { generatedAt, localId, dataSource: 'live', operationalDayYmd: todayYmd },
    pedidos,
    albaranes,
    precios,
    incidencias,
    appcc,
    fichajes: staff.fichajes,
    horarios: staff.horarios,
    mermas,
    inventario,
    produccion: { planesHoy: [] },
    tareas: { checklistPendientes: [] },
    limpieza,
    proveedores: { revisionDiariaPendiente: false, muestraRevision: [] },
    escandallos: { recetasSinCosteActualizado: [] },
    finanzas: { resumenMes: { comprasEuroEstimado: null, nota: null } },
  };
}
