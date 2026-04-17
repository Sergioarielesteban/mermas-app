import type { PedidoOrder } from '@/lib/pedidos-supabase';

export type OidoChefIntent =
  | 'price_lookup'
  | 'quantity_lookup'
  | 'product_list'
  | 'price_changes'
  | 'merma_summary'
  | 'checklist_pending'
  | 'appcc_alerts'
  | 'inventory_stock'
  | 'production_summary'
  | 'food_cost'
  | 'unknown';

export type OidoChefResultMetric = {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn';
};

export type OidoChefResultAction = {
  label: string;
  href: string;
};

export type OidoChefResultColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right';
};

export type OidoChefResultRow = Record<string, string>;

export type OidoChefPremiumResult = {
  intent: OidoChefIntent;
  question: string;
  summary: string;
  emptyMessage?: string;
  metrics?: OidoChefResultMetric[];
  columns?: OidoChefResultColumn[];
  rows?: OidoChefResultRow[];
  actions?: OidoChefResultAction[];
};

type FlattenedOrderLine = {
  productName: string;
  supplierName: string;
  unit: string;
  quantity: number;
  pricePerUnit: number;
  when: Date;
  whenKey: string;
};

export function normalizeOidoText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PRODUCT_ALIAS_GROUPS: Record<string, string[]> = {
  bacon: ['beicon', 'tocino', 'bacon'],
  lechuga: ['lechuga', 'iceberg', 'romana', 'mix hojas'],
  cheddar: ['cheddar', 'queso cheddar'],
  tomate: ['tomate', 'tomate ensalada', 'tomate pera'],
  pan: ['pan burger', 'pan hamburguesa', 'brioche', 'pan'],
};

const MONTH_NAME_TO_INDEX: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

type ParsedRange = {
  from: Date;
  to: Date;
  label: string;
};

export type OidoChefParsedRange = ParsedRange;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function parseRange(normalized: string, now = new Date()): ParsedRange {
  const today = startOfDay(now);
  const endToday = endOfDay(now);
  if (/\bhoy\b/.test(normalized)) {
    return { from: today, to: endToday, label: 'hoy' };
  }
  if (/\bayer\b/.test(normalized)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return { from: startOfDay(d), to: endOfDay(d), label: 'ayer' };
  }
  if (/\bsemana pasada\b/.test(normalized)) {
    const d = new Date(today);
    const day = d.getDay() === 0 ? 7 : d.getDay();
    d.setDate(d.getDate() - day - 6);
    const from = startOfDay(d);
    const to = endOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6));
    return { from, to, label: 'la semana pasada' };
  }
  if (/\besta semana\b/.test(normalized)) {
    const d = new Date(today);
    const day = d.getDay() === 0 ? 7 : d.getDay();
    d.setDate(d.getDate() - day + 1);
    return { from: startOfDay(d), to: endToday, label: 'esta semana' };
  }
  if (/\bmes pasado\b/.test(normalized)) {
    const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    return {
      from: new Date(year, month, 1, 0, 0, 0, 0),
      to: new Date(year, month + 1, 0, 23, 59, 59, 999),
      label: 'el mes pasado',
    };
  }
  if (/\beste mes\b/.test(normalized)) {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      to: endToday,
      label: 'este mes',
    };
  }
  for (const [name, idx] of Object.entries(MONTH_NAME_TO_INDEX)) {
    if (new RegExp(`\\b${name}\\b`).test(normalized)) {
      const year = now.getFullYear();
      return {
        from: new Date(year, idx, 1, 0, 0, 0, 0),
        to: new Date(year, idx + 1, 0, 23, 59, 59, 999),
        label: name,
      };
    }
  }
  return {
    from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0, 0),
    to: endToday,
    label: 'los ultimos 7 dias',
  };
}

function flattenOrders(orders: PedidoOrder[]): FlattenedOrderLine[] {
  const rows: FlattenedOrderLine[] = [];
  for (const order of orders) {
    const when = new Date(order.receivedAt ?? order.sentAt ?? order.createdAt);
    if (Number.isNaN(when.getTime())) continue;
    const whenKey = when.toLocaleDateString('es-ES');
    for (const item of order.items) {
      rows.push({
        productName: item.productName,
        supplierName: order.supplierName,
        unit: item.unit,
        quantity: item.receivedQuantity > 0 ? item.receivedQuantity : item.quantity,
        pricePerUnit: item.pricePerUnit,
        when,
        whenKey,
      });
    }
  }
  return rows;
}

function inferIntent(normalized: string): OidoChefIntent {
  if (
    normalized.includes('checklist') &&
    (normalized.includes('falta') || normalized.includes('faltan') || normalized.includes('pendiente'))
  ) {
    return 'checklist_pending';
  }
  if (
    normalized.includes('incidencia') ||
    normalized.includes('nevera fuera de rango') ||
    (normalized.includes('nevera') && normalized.includes('rango')) ||
    (normalized.includes('appcc') && normalized.includes('alerta'))
  ) {
    return 'appcc_alerts';
  }
  if (
    normalized.includes('food cost') ||
    (normalized.includes('peor') && (normalized.includes('coste') || normalized.includes('costo')))
  ) {
    return 'food_cost';
  }
  if (normalized.includes('stock') || normalized.includes('inventario')) {
    return 'inventory_stock';
  }
  if (normalized.includes('produccion')) {
    return 'production_summary';
  }
  if (normalized.includes('merma')) return 'merma_summary';
  if (
    normalized.includes('subio') ||
    normalized.includes('subieron') ||
    (normalized.includes('producto') && normalized.includes('precio') && normalized.includes('semana'))
  ) {
    return 'price_changes';
  }
  if (normalized.includes('muestrame') || normalized.includes('muestrame todos') || normalized.includes('muestame')) {
    return 'product_list';
  }
  if (normalized.includes('cuantas') || normalized.includes('cuantos') || normalized.includes('cuanto compre')) {
    return 'quantity_lookup';
  }
  if (normalized.includes('precio') || normalized.includes('a que precio') || normalized.includes('ultimo precio')) {
    return 'price_lookup';
  }
  return 'unknown';
}

function inferRequestedUnit(normalized: string): string | null {
  if (normalized.includes('cajas') || normalized.includes('caja')) return 'caja';
  if (normalized.includes('kilos') || normalized.includes('kilo') || normalized.includes('kg')) return 'kg';
  if (normalized.includes('litros') || normalized.includes('litro')) return 'l';
  if (normalized.includes('bolsas') || normalized.includes('bolsa')) return 'bolsa';
  if (normalized.includes('unidades') || normalized.includes('unidad') || normalized.includes('uds')) return 'ud';
  return null;
}

function removeStopWords(normalized: string): string {
  return normalized
    .replace(/\boido chef\b/g, '')
    .replace(/\ba que precio\b/g, '')
    .replace(/\bcuantas\b|\bcuantos\b|\bcuanto\b/g, '')
    .replace(/\bcompre\b|\bcompramos\b|\bcomprado\b|\bcompras\b/g, '')
    .replace(/\bmuestrame\b|\bmuéstrame\b|\bmostrar\b|\btodos\b|\btodos los\b/g, '')
    .replace(/\bfood cost\b|\bpeor coste\b|\bpeor costo\b|\bcoste\b|\bcosto\b/g, '')
    .replace(/\bstock\b|\binventario\b|\bproduccion\b/g, '')
    .replace(/\bcual\b|\bcuál\b|\bes\b|\btiene\b|\btienen\b|\bplato\b|\bproductos\b/g, '')
    .replace(/\besta semana\b|\bla semana pasada\b|\beste mes\b|\bel mes pasado\b|\bhoy\b|\bayer\b/g, '')
    .replace(/\bque\b|\bde\b|\bdel\b|\bla\b|\bel\b|\blos\b|\blas\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandEntityTerms(entity: string): string[] {
  const clean = normalizeOidoText(entity);
  const terms = new Set<string>();
  if (!clean) return [];
  terms.add(clean);
  for (const [root, aliases] of Object.entries(PRODUCT_ALIAS_GROUPS)) {
    if (clean.includes(root) || aliases.some((a) => clean.includes(a))) {
      terms.add(root);
      aliases.forEach((a) => terms.add(a));
    }
  }
  return Array.from(terms).filter(Boolean);
}

function scoreProduct(name: string, terms: string[]): number {
  const n = normalizeOidoText(name);
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (n === term) score += 7;
    else if (n.startsWith(term)) score += 5;
    else if (n.includes(term)) score += 3;
    const tokens = term.split(' ').filter(Boolean);
    if (tokens.length > 1 && tokens.every((t) => n.includes(t))) score += 4;
  }
  return score;
}

function filterByRange(rows: FlattenedOrderLine[], range: ParsedRange): FlattenedOrderLine[] {
  const from = range.from.getTime();
  const to = range.to.getTime();
  return rows.filter((r) => {
    const ts = r.when.getTime();
    return ts >= from && ts <= to;
  });
}

function toMoney(n: number): string {
  return `${n.toFixed(2)} EUR`;
}

export async function runPremiumOidoChefQuery(params: {
  question: string;
  orders: PedidoOrder[];
  loadMermaSummary?: (range: OidoChefParsedRange) => Promise<{
    totalCostEur: number;
    totalQty: number;
    unitLabel?: string;
    topItems: Array<{ name: string; costEur: number }>;
  }>;
  loadChecklistPending?: (range: OidoChefParsedRange) => Promise<{
    totalPending: number;
    totalRuns: number;
    rows: Array<{ checklist: string; date: string; pendingItems: number }>;
  }>;
  loadAppccAlerts?: (range: OidoChefParsedRange) => Promise<{
    outOfRangeCount: number;
    missingTempCount: number;
    rows: Array<{ alert: string; detail: string }>;
  }>;
  loadInventoryItems?: () => Promise<Array<{ name: string; unit: string; qty: number; pricePerUnit: number }>>;
  loadProductionSummary?: (range: OidoChefParsedRange) => Promise<{
    totalRuns: number;
    closedRuns: number;
    rows: Array<{ plan: string; date: string; status: string }>;
  }>;
  loadFoodCostRows?: () => Promise<Array<{ name: string; foodCostPct: number | null; costPerYieldEur: number }>>;
}): Promise<OidoChefPremiumResult | null> {
  const raw = params.question.trim();
  if (!raw) return null;
  const normalized = normalizeOidoText(raw);
  const intent = inferIntent(normalized);
  if (intent === 'unknown') return null;

  const range = parseRange(normalized, new Date());
  const rows = flattenOrders(params.orders);
  const entity = removeStopWords(normalized);
  const entityTerms = expandEntityTerms(entity);

  if (intent === 'product_list') {
    if (entityTerms.length === 0) return null;
    const grouped = new Map<string, FlattenedOrderLine[]>();
    rows.forEach((r) => {
      if (scoreProduct(r.productName, entityTerms) <= 0) return;
      const key = r.productName;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(r);
    });
    const sorted = Array.from(grouped.entries()).sort((a, b) => b[1].length - a[1].length);
    return {
      intent,
      question: raw,
      summary:
        sorted.length === 0
          ? `No encontre variantes para "${entity || raw}".`
          : `Encontre ${sorted.length} variante(s) para "${entity || raw}".`,
      columns: [
        { key: 'producto', label: 'Producto' },
        { key: 'apariciones', label: 'Registros', align: 'right' },
        { key: 'ultimo', label: 'Ultimo precio', align: 'right' },
      ],
      rows: sorted.slice(0, 25).map(([product, lines]) => ({
        producto: product,
        apariciones: String(lines.length),
        ultimo: toMoney(lines.sort((x, y) => y.when.getTime() - x.when.getTime())[0].pricePerUnit),
      })),
      actions: [{ label: 'Abrir precios', href: '/pedidos/precios' }],
    };
  }

  if (intent === 'price_lookup') {
    if (entityTerms.length === 0) return null;
    const inRange = filterByRange(rows, range).filter((r) => scoreProduct(r.productName, entityTerms) > 0);
    if (inRange.length === 0) {
      return {
        intent,
        question: raw,
        summary: `No encontre compras de "${entity || raw}" en ${range.label}.`,
        emptyMessage: 'Prueba con otra variante de nombre o amplia el periodo.',
      };
    }
    const byProduct = new Map<string, FlattenedOrderLine[]>();
    inRange.forEach((r) => {
      if (!byProduct.has(r.productName)) byProduct.set(r.productName, []);
      byProduct.get(r.productName)!.push(r);
    });
    const productRows: OidoChefResultRow[] = [];
    byProduct.forEach((list, product) => {
      const ordered = [...list].sort((a, b) => b.when.getTime() - a.when.getTime());
      const last = ordered[0];
      const avg = list.reduce((acc, item) => acc + item.pricePerUnit, 0) / list.length;
      productRows.push({
        producto: product,
        proveedor: last.supplierName,
        fecha: last.whenKey,
        unidad: last.unit,
        precio: toMoney(last.pricePerUnit),
        media: toMoney(avg),
      });
    });
    productRows.sort((a, b) => a.producto.localeCompare(b.producto, 'es'));
    return {
      intent,
      question: raw,
      summary: `En ${range.label} aparece "${entity || raw}" en ${productRows.length} variante(s).`,
      metrics: [
        { label: 'Variantes', value: String(productRows.length) },
        { label: 'Registros', value: String(inRange.length) },
      ],
      columns: [
        { key: 'producto', label: 'Producto' },
        { key: 'proveedor', label: 'Proveedor' },
        { key: 'fecha', label: 'Fecha' },
        { key: 'unidad', label: 'Unidad' },
        { key: 'precio', label: 'Ultimo precio', align: 'right' },
        { key: 'media', label: 'Media', align: 'right' },
      ],
      rows: productRows.slice(0, 40),
      actions: [
        { label: 'Abrir historial compras', href: '/pedidos/historial-mes' },
        { label: 'Abrir precios', href: '/pedidos/precios' },
      ],
    };
  }

  if (intent === 'quantity_lookup') {
    if (entityTerms.length === 0) return null;
    const requestedUnit = inferRequestedUnit(normalized);
    const inRange = filterByRange(rows, range).filter((r) => scoreProduct(r.productName, entityTerms) > 0);
    const unitFiltered = requestedUnit
      ? inRange.filter((r) => normalizeOidoText(r.unit).includes(normalizeOidoText(requestedUnit)))
      : inRange;
    const total = unitFiltered.reduce((acc, r) => acc + r.quantity, 0);
    if (unitFiltered.length === 0) {
      return {
        intent,
        question: raw,
        summary: `No encontre compras de "${entity || raw}" en ${range.label}.`,
      };
    }
    return {
      intent,
      question: raw,
      summary: `Compraste ${total.toFixed(2)} ${requestedUnit ?? unitFiltered[0].unit} de "${entity || raw}" en ${range.label}.`,
      metrics: [
        { label: 'Total', value: `${total.toFixed(2)} ${requestedUnit ?? unitFiltered[0].unit}`, tone: 'good' },
        { label: 'Registros', value: String(unitFiltered.length) },
      ],
      columns: [
        { key: 'producto', label: 'Producto' },
        { key: 'proveedor', label: 'Proveedor' },
        { key: 'fecha', label: 'Fecha' },
        { key: 'cantidad', label: 'Cantidad', align: 'right' },
      ],
      rows: unitFiltered
        .sort((a, b) => b.when.getTime() - a.when.getTime())
        .slice(0, 35)
        .map((r) => ({
          producto: r.productName,
          proveedor: r.supplierName,
          fecha: r.whenKey,
          cantidad: `${r.quantity.toFixed(2)} ${r.unit}`,
        })),
      actions: [{ label: 'Abrir historial compras', href: '/pedidos/historial-mes' }],
    };
  }

  if (intent === 'price_changes') {
    const inRange = filterByRange(rows, range);
    const beforeRange = rows.filter((r) => r.when.getTime() < range.from.getTime());
    const groupedCurrent = new Map<string, FlattenedOrderLine[]>();
    inRange.forEach((r) => {
      if (!groupedCurrent.has(r.productName)) groupedCurrent.set(r.productName, []);
      groupedCurrent.get(r.productName)!.push(r);
    });

    const changed: Array<{
      product: string;
      previous: number;
      current: number;
      diff: number;
      supplier: string;
      date: string;
    }> = [];

    groupedCurrent.forEach((list, product) => {
      const latestCurrent = [...list].sort((a, b) => b.when.getTime() - a.when.getTime())[0];
      const previous = beforeRange
        .filter((r) => normalizeOidoText(r.productName) === normalizeOidoText(product))
        .sort((a, b) => b.when.getTime() - a.when.getTime())[0];
      if (!previous) return;
      const diff = latestCurrent.pricePerUnit - previous.pricePerUnit;
      if (diff <= 0.0001) return;
      changed.push({
        product,
        previous: previous.pricePerUnit,
        current: latestCurrent.pricePerUnit,
        diff,
        supplier: latestCurrent.supplierName,
        date: latestCurrent.whenKey,
      });
    });

    changed.sort((a, b) => b.diff - a.diff);
    if (changed.length === 0) {
      return {
        intent,
        question: raw,
        summary: `No detecte subidas de precio en ${range.label} con el historico disponible.`,
      };
    }
    return {
      intent,
      question: raw,
      summary: `Detecte ${changed.length} producto(s) con subida de precio en ${range.label}.`,
      columns: [
        { key: 'producto', label: 'Producto' },
        { key: 'proveedor', label: 'Proveedor' },
        { key: 'antes', label: 'Antes', align: 'right' },
        { key: 'ahora', label: 'Ahora', align: 'right' },
        { key: 'subida', label: 'Subida', align: 'right' },
      ],
      rows: changed.slice(0, 35).map((row) => ({
        producto: row.product,
        proveedor: row.supplier,
        antes: toMoney(row.previous),
        ahora: toMoney(row.current),
        subida: `+${row.diff.toFixed(2)} EUR`,
      })),
      metrics: [{ label: 'Con subida', value: String(changed.length), tone: 'warn' }],
      actions: [{ label: 'Abrir precios', href: '/pedidos/precios' }],
    };
  }

  if (intent === 'merma_summary' && params.loadMermaSummary) {
    const merma = await params.loadMermaSummary(range);
    return {
      intent,
      question: raw,
      summary: `La merma en ${range.label} es ${toMoney(merma.totalCostEur)} (${merma.totalQty.toFixed(2)} ${merma.unitLabel ?? 'uds'}).`,
      metrics: [
        { label: 'Merma EUR', value: toMoney(merma.totalCostEur), tone: merma.totalCostEur > 0 ? 'warn' : 'neutral' },
        { label: 'Cantidad', value: `${merma.totalQty.toFixed(2)} ${merma.unitLabel ?? 'uds'}` },
      ],
      columns: [
        { key: 'producto', label: 'Producto' },
        { key: 'coste', label: 'Coste', align: 'right' },
      ],
      rows: merma.topItems.slice(0, 8).map((i) => ({ producto: i.name, coste: toMoney(i.costEur) })),
      actions: [{ label: 'Abrir mermas', href: '/dashboard' }],
    };
  }

  if (intent === 'checklist_pending' && params.loadChecklistPending) {
    const checklist = await params.loadChecklistPending(range);
    return {
      intent,
      question: raw,
      summary:
        checklist.totalPending > 0
          ? `Hay ${checklist.totalPending} checklist pendiente(s) por cerrar en ${range.label}.`
          : `No hay checklist pendientes por cerrar en ${range.label}.`,
      metrics: [
        { label: 'Pendientes', value: String(checklist.totalPending), tone: checklist.totalPending > 0 ? 'warn' : 'good' },
        { label: 'Ejecuciones', value: String(checklist.totalRuns) },
      ],
      columns: [
        { key: 'checklist', label: 'Checklist' },
        { key: 'fecha', label: 'Fecha' },
        { key: 'pendientes', label: 'Items pendientes', align: 'right' },
      ],
      rows: checklist.rows.slice(0, 12).map((r) => ({
        checklist: r.checklist,
        fecha: r.date,
        pendientes: String(r.pendingItems),
      })),
      actions: [{ label: 'Abrir checklist', href: '/checklist' }],
    };
  }

  if (intent === 'appcc_alerts' && params.loadAppccAlerts) {
    const alerts = await params.loadAppccAlerts(range);
    return {
      intent,
      question: raw,
      summary:
        alerts.rows.length > 0
          ? `Detecte ${alerts.rows.length} alerta(s) operativas de APPCC en ${range.label}.`
          : `No detecte alertas de APPCC en ${range.label}.`,
      metrics: [
        { label: 'Fuera rango', value: String(alerts.outOfRangeCount), tone: alerts.outOfRangeCount > 0 ? 'warn' : 'good' },
        { label: 'Sin lectura', value: String(alerts.missingTempCount), tone: alerts.missingTempCount > 0 ? 'warn' : 'neutral' },
      ],
      columns: [
        { key: 'alerta', label: 'Alerta' },
        { key: 'detalle', label: 'Detalle' },
      ],
      rows: alerts.rows.slice(0, 18).map((r) => ({
        alerta: r.alert,
        detalle: r.detail,
      })),
      actions: [{ label: 'Abrir APPCC', href: '/appcc' }],
    };
  }

  if (intent === 'inventory_stock' && params.loadInventoryItems) {
    const inv = await params.loadInventoryItems();
    const filtered =
      entityTerms.length > 0
        ? inv.filter((r) => scoreProduct(r.name, entityTerms) > 0)
        : inv;
    if (filtered.length === 0) {
      return {
        intent,
        question: raw,
        summary: `No encontre stock para "${entity || raw}".`,
        actions: [{ label: 'Abrir inventario', href: '/inventario' }],
      };
    }
    const totalValue = filtered.reduce((acc, row) => acc + row.qty * row.pricePerUnit, 0);
    const sorted = [...filtered].sort((a, b) => b.qty - a.qty);
    return {
      intent,
      question: raw,
      summary: `Stock encontrado en ${sorted.length} articulo(s).`,
      metrics: [
        { label: 'Articulos', value: String(sorted.length) },
        { label: 'Valor stock', value: toMoney(totalValue) },
      ],
      columns: [
        { key: 'producto', label: 'Producto' },
        { key: 'stock', label: 'Stock', align: 'right' },
        { key: 'precio', label: 'Precio ud', align: 'right' },
      ],
      rows: sorted.slice(0, 25).map((r) => ({
        producto: r.name,
        stock: `${r.qty.toFixed(2)} ${r.unit}`,
        precio: toMoney(r.pricePerUnit),
      })),
      actions: [{ label: 'Abrir inventario', href: '/inventario' }],
    };
  }

  if (intent === 'production_summary' && params.loadProductionSummary) {
    const production = await params.loadProductionSummary(range);
    return {
      intent,
      question: raw,
      summary:
        production.totalRuns > 0
          ? `En ${range.label} hay ${production.totalRuns} ejecucion(es) de produccion, ${production.closedRuns} cerrada(s).`
          : `No hay ejecuciones de produccion en ${range.label}.`,
      metrics: [
        { label: 'Ejecuciones', value: String(production.totalRuns) },
        { label: 'Cerradas', value: String(production.closedRuns), tone: 'good' },
      ],
      columns: [
        { key: 'plan', label: 'Plan' },
        { key: 'fecha', label: 'Fecha' },
        { key: 'estado', label: 'Estado' },
      ],
      rows: production.rows.slice(0, 14).map((r) => ({
        plan: r.plan,
        fecha: r.date,
        estado: r.status,
      })),
      actions: [{ label: 'Abrir produccion', href: '/produccion' }],
    };
  }

  if (intent === 'food_cost' && params.loadFoodCostRows) {
    const rows = await params.loadFoodCostRows();
    if (rows.length === 0) {
      return {
        intent,
        question: raw,
        summary: 'No hay datos de food cost disponibles en escandallos.',
        actions: [{ label: 'Abrir escandallos', href: '/escandallos' }],
      };
    }
    const withCost = rows.filter((r) => r.foodCostPct != null);
    const entityMatches =
      entityTerms.length > 0
        ? withCost.filter((r) => scoreProduct(r.name, entityTerms) > 0)
        : [];
    if (entityMatches.length > 0) {
      const recipe = entityMatches.sort((a, b) => (b.foodCostPct ?? 0) - (a.foodCostPct ?? 0))[0];
      return {
        intent,
        question: raw,
        summary: `${recipe.name} tiene food cost ${recipe.foodCostPct?.toFixed(2)}%.`,
        metrics: [{ label: 'Coste por racion', value: toMoney(recipe.costPerYieldEur) }],
        columns: [
          { key: 'plato', label: 'Plato' },
          { key: 'food', label: 'Food cost', align: 'right' },
          { key: 'coste', label: 'Coste por racion', align: 'right' },
        ],
        rows: entityMatches.slice(0, 10).map((r) => ({
          plato: r.name,
          food: `${(r.foodCostPct ?? 0).toFixed(2)}%`,
          coste: toMoney(r.costPerYieldEur),
        })),
        actions: [{ label: 'Abrir escandallos', href: '/escandallos' }],
      };
    }
    const worst = [...withCost].sort((a, b) => (b.foodCostPct ?? 0) - (a.foodCostPct ?? 0)).slice(0, 8);
    return {
      intent,
      question: raw,
      summary: `Estos son los platos con peor food cost ahora mismo.`,
      columns: [
        { key: 'plato', label: 'Plato' },
        { key: 'food', label: 'Food cost', align: 'right' },
        { key: 'coste', label: 'Coste por racion', align: 'right' },
      ],
      rows: worst.map((r) => ({
        plato: r.name,
        food: `${(r.foodCostPct ?? 0).toFixed(2)}%`,
        coste: toMoney(r.costPerYieldEur),
      })),
      actions: [{ label: 'Abrir escandallos', href: '/escandallos' }],
    };
  }

  return null;
}
