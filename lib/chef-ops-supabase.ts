import type { SupabaseClient } from '@supabase/supabase-js';

export type ChecklistContext = 'opening' | 'shift_change' | 'closing' | 'hygiene_bathroom' | 'custom';

export const CHECKLIST_CONTEXT_LABEL: Record<ChecklistContext, string> = {
  opening: 'Apertura',
  shift_change: 'Cambio de turno',
  closing: 'Cierre',
  hygiene_bathroom: 'Limpieza lavabos',
  custom: 'Personalizado',
};

export type ChefChecklist = {
  id: string;
  localId: string;
  title: string;
  context: ChecklistContext;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChefChecklistSection = {
  id: string;
  checklistId: string;
  title: string;
  sortOrder: number;
};

export type ChefChecklistItem = {
  id: string;
  checklistId: string;
  sectionId: string | null;
  label: string;
  sortOrder: number;
};

export type ChefChecklistRun = {
  id: string;
  localId: string;
  checklistId: string;
  runDate: string;
  shiftLabel: string | null;
  startedAt: string;
  completedAt: string | null;
  createdBy: string | null;
};

export type ChefChecklistRunItem = {
  id: string;
  runId: string;
  itemId: string;
  isDone: boolean;
  doneAt: string | null;
  note: string | null;
};

/** Plantilla de producción (bloques de días con productos propios). */
export type ChefProductionTemplate = {
  id: string;
  localId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Bloque de días (ej. Lun–Jue): `weekdays` como Date.getDay() → 0=dom … 6=sáb. */
export type ChefProductionDayBlock = {
  id: string;
  templateId: string;
  label: string;
  weekdays: number[];
  sortOrder: number;
};

/** Zona de agrupación en pizarra (ej. Plancha y fritos), por plantilla. */
export type ChefProductionZone = {
  id: string;
  templateId: string;
  label: string;
  sortOrder: number;
};

/** Producto / preparación dentro de un bloque, con objetivo para ese bloque. */
export type ChefProductionBlockItem = {
  id: string;
  blockId: string;
  label: string;
  targetQty: number;
  sortOrder: number;
  /** @deprecated Preferir productionZoneId + chef_production_zones. */
  kitchenSection: string;
  productionZoneId: string | null;
  /** Días de vida útil para etiquetas; NULL = sin caducidad calculada. */
  shelfLifeDays: number | null;
};

/** Referencias de calendario fijas para resolver bloque Lun–Jue vs Vie–Dom dentro de una plantilla. */
export const CHEF_PRODUCTION_REF_MONDAY_ISO = '2024-01-01';
export const CHEF_PRODUCTION_REF_FRIDAY_ISO = '2024-01-05';

/** Filas combinadas para la vista pizarra (dos columnas de objetivos por producto). */
export type ChefProductionBoardRow = {
  /** Estable para React (evita colisión por labelKey igual en filas distintas). */
  rowKey: string;
  labelKey: string;
  displayLabel: string;
  kitchenSection: string;
  ljItem: ChefProductionBlockItem | null;
  vdItem: ChefProductionBlockItem | null;
  /** Producto en otro bloque (no Lun–Jue / Vie–Dom resueltos). */
  extraItem: ChefProductionBlockItem | null;
  sortOrder: number;
};

export function resolveLjAndVdBlocks(blocks: ChefProductionDayBlock[]): {
  ljBlock: ChefProductionDayBlock | null;
  vdBlock: ChefProductionDayBlock | null;
} {
  const ljBlock = resolveChefProductionDayBlock(blocks, CHEF_PRODUCTION_REF_MONDAY_ISO, null);
  const vdBlock = resolveChefProductionDayBlock(blocks, CHEF_PRODUCTION_REF_FRIDAY_ISO, null);
  return { ljBlock, vdBlock };
}

function normalizeProductionBoardLabelKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Une productos del bloque Lun–Jue y Vie–Dom por nombre (misma clave tras normalizar).
 */
export function buildChefProductionBoardRows(
  ljItems: ChefProductionBlockItem[],
  vdItems: ChefProductionBlockItem[],
  opts?: { zoneLabel?: (zoneId: string | null) => string },
): ChefProductionBoardRow[] {
  const zoneLabel = opts?.zoneLabel ?? ((_z: string | null) => '');
  const sectionFor = (it: ChefProductionBlockItem): string => {
    const z = zoneLabel(it.productionZoneId ?? null).trim();
    if (z) return z;
    return (it.kitchenSection ?? '').trim();
  };
  const ljSorted = [...ljItems].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  const vdSorted = [...vdItems].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  const byKey = new Map<string, ChefProductionBoardRow>();

  for (const it of ljSorted) {
    const key = normalizeProductionBoardLabelKey(it.label);
    if (!key) continue;
    const sec = sectionFor(it);
    byKey.set(key, {
      rowKey: '', // se asigna al devolver la lista (ver final de buildChefProductionBoardRows)
      labelKey: key,
      displayLabel: it.label.trim(),
      kitchenSection: sec,
      ljItem: it,
      vdItem: null,
      extraItem: null,
      sortOrder: it.sortOrder,
    });
  }

  for (const it of vdSorted) {
    const key = normalizeProductionBoardLabelKey(it.label);
    if (!key) continue;
    const existing = byKey.get(key);
    const sec = sectionFor(it);
    if (existing) {
      existing.vdItem = it;
      if (!existing.kitchenSection && sec) existing.kitchenSection = sec;
      existing.sortOrder = Math.min(existing.sortOrder, it.sortOrder);
    } else {
      byKey.set(key, {
        rowKey: '',
        labelKey: key,
        displayLabel: it.label.trim(),
        kitchenSection: sec,
        ljItem: null,
        vdItem: it,
        extraItem: null,
        sortOrder: it.sortOrder,
      });
    }
  }

  const sortedMerged = [...byKey.values()].sort((a, b) => {
    const sa = a.kitchenSection || '\uffff';
    const sb = b.kitchenSection || '\uffff';
    if (sa !== sb) return sa.localeCompare(sb, 'es');
    return a.sortOrder - b.sortOrder || a.displayLabel.localeCompare(b.displayLabel, 'es');
  });
  let anonSeq = 0;
  return sortedMerged.map((r) => {
    const canon = r.ljItem?.id ?? r.vdItem?.id ?? null;
    const rowKey =
      canon != null
        ? `m:${canon}`
        : `m:anon:${++anonSeq}:${r.labelKey}:${r.sortOrder}:${r.displayLabel}`;
    return { ...r, rowKey };
  });
}

/** Filas fusionadas Lun–Jue / Vie–Dom (opcional zona vía etiquetas desde `chef_production_zones`). */
export async function fetchMergedProductionBoardRowsForTemplate(
  supabase: SupabaseClient,
  templateId: string,
  opts?: { zoneLabel?: (zoneId: string | null) => string },
): Promise<ChefProductionBoardRow[]> {
  const blocks = await fetchChefProductionDayBlocks(supabase, templateId);
  const { ljBlock, vdBlock } = resolveLjAndVdBlocks(blocks);
  const ljItems = ljBlock ? await fetchChefProductionBlockItems(supabase, ljBlock.id) : [];
  const vdItems = vdBlock ? await fetchChefProductionBlockItems(supabase, vdBlock.id) : [];
  return buildChefProductionBoardRows(ljItems, vdItems, opts);
}

/**
 * Fusionado L–J / V–D más **todos** los productos de bloques que no son el par Lun–Jue/Vie–Dom resuelto.
 */
export async function fetchFullProductionDayBoardRowsForTemplate(
  supabase: SupabaseClient,
  templateId: string,
  opts?: { zoneLabel?: (zoneId: string | null) => string },
): Promise<ChefProductionBoardRow[]> {
  const blocks = await fetchChefProductionDayBlocks(supabase, templateId);
  const sortedBlocks = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  const { ljBlock, vdBlock } = resolveLjAndVdBlocks(blocks);
  const ljId = ljBlock?.id ?? null;
  const vdId = vdBlock?.id ?? null;
  const coreIds = new Set([ljId, vdId].filter(Boolean) as string[]);

  const merged = await fetchMergedProductionBoardRowsForTemplate(supabase, templateId, opts);
  const extras: ChefProductionBoardRow[] = [];
  let order = merged.length;

  for (const b of sortedBlocks) {
    if (coreIds.has(b.id)) continue;
    const items = await fetchChefProductionBlockItems(supabase, b.id);
    const zoneLabelFn = opts?.zoneLabel ?? ((_z: string | null) => '');
    const list = [...items].sort((a, c) => a.sortOrder - c.sortOrder || a.label.localeCompare(c.label));
    for (const it of list) {
      const nk = normalizeProductionBoardLabelKey(it.label);
      if (!nk) continue;
      const z = zoneLabelFn(it.productionZoneId ?? null).trim();
      const sec = z || (it.kitchenSection ?? '').trim();
      extras.push({
        rowKey: `e:${it.id}`,
        labelKey: nk,
        displayLabel: it.label.trim(),
        kitchenSection: sec,
        ljItem: null,
        vdItem: null,
        extraItem: it,
        sortOrder: order++,
      });
    }
  }

  extras.sort((a, b) => a.sortOrder - b.sortOrder || a.displayLabel.localeCompare(b.displayLabel, 'es'));
  return [...merged, ...extras];
}

/** Ids `block_item_id` canónicos para la pizarra (una línea por producto fusionado). */
export async function listCanonicalSessionBlockItemIdsForTemplate(
  supabase: SupabaseClient,
  templateId: string,
): Promise<string[]> {
  const rows = await fetchFullProductionDayBoardRowsForTemplate(supabase, templateId);
  return rows.map((r) => canonicalBlockItemIdForBoardRow(r)).filter((id): id is string => Boolean(id));
}

export function activeChefProductionBoardBlockItem(
  row: ChefProductionBoardRow,
  activeBlockId: string | null,
  ljBlockId: string | null,
  vdBlockId: string | null,
): ChefProductionBlockItem | null {
  if (!activeBlockId) return null;
  if (row.extraItem && activeBlockId === row.extraItem.blockId) return row.extraItem;
  if (ljBlockId && activeBlockId === ljBlockId && row.ljItem) return row.ljItem;
  if (vdBlockId && activeBlockId === vdBlockId && row.vdItem) return row.vdItem;
  return null;
}

/** Id de línea de bloque canónico para sesión / “hecho” (prioriza Lun–Jue). */
export function canonicalBlockItemIdForBoardRow(row: ChefProductionBoardRow): string | null {
  return row.ljItem?.id ?? row.vdItem?.id ?? row.extraItem?.id ?? null;
}

/**
 * Obtiene la fila de sesión asociada a un producto fusionado (prioriza línea enlazada al id canónico).
 */
export function mergedRowSessionLine(
  row: ChefProductionBoardRow,
  linesByBlockItemId: Map<string, ChefProductionSessionLine>,
): ChefProductionSessionLine | null {
  const primaryId = row.ljItem?.id ?? row.vdItem?.id ?? row.extraItem?.id ?? null;
  if (!primaryId) return null;
  const secondaryId =
    row.ljItem && row.vdItem && row.ljItem.id !== row.vdItem.id
      ? row.vdItem.id === primaryId
        ? row.ljItem.id
        : row.vdItem.id
      : null;
  const a = linesByBlockItemId.get(primaryId);
  if (a) return a;
  if (secondaryId) {
    const b = linesByBlockItemId.get(secondaryId);
    if (b) return b;
  }
  return null;
}

export type ChefProductionSession = {
  id: string;
  localId: string;
  templateId: string;
  workDate: string;
  forcedBlockId: string | null;
  periodLabel: string | null;
  linesSnapshot: ChefProductionSnapshotV1 | null;
  startedAt: string;
  completedAt: string | null;
  createdBy: string | null;
};

export type ChefProductionSessionLine = {
  id: string;
  sessionId: string;
  blockItemId: string;
  qtyOnHand: number | null;
};

/** Foto al cerrar la sesión (lectura en historial / lista cerrada). */
export type ChefProductionSnapshotV1 = {
  version: 1;
  workDate: string;
  blockLabel: string;
  sections: {
    title: string;
    items: { label: string; objective: number; hecho: number | null; hacer: number }[];
  }[];
};

export const CHEF_PRODUCTION_WEEKDAY_SHORT: { dow: number; label: string }[] = [
  { dow: 1, label: 'L' },
  { dow: 2, label: 'M' },
  { dow: 3, label: 'X' },
  { dow: 4, label: 'J' },
  { dow: 5, label: 'V' },
  { dow: 6, label: 'S' },
  { dow: 0, label: 'D' },
];

function mapChecklist(r: Record<string, unknown>): ChefChecklist {
  return {
    id: String(r.id),
    localId: String(r.local_id),
    title: String(r.title),
    context: r.context as ChecklistContext,
    sortOrder: Number(r.sort_order ?? 0),
    isActive: Boolean(r.is_active),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapSection(r: Record<string, unknown>): ChefChecklistSection {
  return {
    id: String(r.id),
    checklistId: String(r.checklist_id),
    title: String(r.title),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapItem(r: Record<string, unknown>): ChefChecklistItem {
  return {
    id: String(r.id),
    checklistId: String(r.checklist_id),
    sectionId: r.section_id != null ? String(r.section_id) : null,
    label: String(r.label),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapProductionTemplate(r: Record<string, unknown>): ChefProductionTemplate {
  return {
    id: String(r.id),
    localId: String(r.local_id),
    name: String(r.name),
    sortOrder: Number(r.sort_order ?? 0),
    isActive: Boolean(r.is_active),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapProductionDayBlock(r: Record<string, unknown>): ChefProductionDayBlock {
  const wd = r.weekdays;
  const weekdays = Array.isArray(wd) ? wd.map((x) => Number(x)) : [];
  return {
    id: String(r.id),
    templateId: String(r.template_id),
    label: String(r.label),
    weekdays,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapProductionBlockItem(r: Record<string, unknown>): ChefProductionBlockItem {
  const shelf = r.shelf_life_days;
  const shelfN = shelf != null && shelf !== '' ? Number(shelf) : NaN;
  const z = r.production_zone_id;
  return {
    id: String(r.id),
    blockId: String(r.block_id),
    label: String(r.label),
    targetQty: Number(r.target_qty ?? 0),
    sortOrder: Number(r.sort_order ?? 0),
    kitchenSection: String(r.kitchen_section ?? '').trim(),
    productionZoneId: z != null && String(z) !== '' ? String(z) : null,
    shelfLifeDays: Number.isFinite(shelfN) ? shelfN : null,
  };
}

function mapProductionZone(r: Record<string, unknown>): ChefProductionZone {
  return {
    id: String(r.id),
    templateId: String(r.template_id),
    label: String(r.label),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapProductionSession(r: Record<string, unknown>): ChefProductionSession {
  const snap = r.lines_snapshot;
  return {
    id: String(r.id),
    localId: String(r.local_id),
    templateId: String(r.template_id),
    workDate: String(r.work_date),
    forcedBlockId: r.forced_block_id != null ? String(r.forced_block_id) : null,
    periodLabel: r.period_label != null ? String(r.period_label) : null,
    linesSnapshot: snap != null && typeof snap === 'object' ? (snap as ChefProductionSnapshotV1) : null,
    startedAt: String(r.started_at),
    completedAt: r.completed_at != null ? String(r.completed_at) : null,
    createdBy: r.created_by != null ? String(r.created_by) : null,
  };
}

function mapProductionSessionLine(r: Record<string, unknown>): ChefProductionSessionLine {
  return {
    id: String(r.id),
    sessionId: String(r.session_id),
    blockItemId: String(r.block_item_id),
    qtyOnHand: r.qty_on_hand != null && r.qty_on_hand !== '' ? Number(r.qty_on_hand) : null,
  };
}

/** Bloque activo: `forcedBlockId` o el primero por `sort_order` cuyo `weekdays` contenga el día. */
export function resolveChefProductionDayBlock(
  blocks: ChefProductionDayBlock[],
  workDateIso: string,
  forcedBlockId: string | null,
): ChefProductionDayBlock | null {
  if (forcedBlockId) {
    return blocks.find((b) => b.id === forcedBlockId) ?? null;
  }
  const [y, m, d] = workDateIso.slice(0, 10).split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  const sorted = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  for (const b of sorted) {
    if (b.weekdays.includes(dow)) return b;
  }
  return null;
}

export function productionQtyToMake(target: number, hecho: number | null): number {
  const h = hecho != null && !Number.isNaN(hecho) ? hecho : 0;
  const diff = target - h;
  return diff > 0 ? diff : 0;
}

/** Si Supabase aún no tiene el esquema de producción (plantillas + bloques + productos por bloque). */
export function formatProductionMigrationError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (
    /chef_production_templates|chef_production_zones|chef_production_sessions|chef_production_day_blocks|chef_production_block_items|block_item_id|does not exist|relation.*does not exist|kitchen_section|shelf_life_days|production_zone_id/i.test(
      raw,
    )
  ) {
    return 'Falta o está desactualizado el esquema de Producción en Supabase. Ejecuta supabase-chef-production-zones-v5.sql (zonas), supabase-chef-production-board-v4.sql (pizarra/caducidad), supabase-chef-production-v3-block-items.sql si venías de v2, o supabase-chef-production-templates-v2.sql en instalación nueva, y recarga.';
  }
  return raw;
}

export async function fetchChefChecklist(
  supabase: SupabaseClient,
  localId: string,
  id: string,
): Promise<ChefChecklist | null> {
  const { data, error } = await supabase
    .from('chef_checklists')
    .select('id,local_id,title,context,sort_order,is_active,created_at,updated_at')
    .eq('local_id', localId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapChecklist(data as Record<string, unknown>);
}

export async function fetchChefChecklistRunRow(
  supabase: SupabaseClient,
  runId: string,
): Promise<ChefChecklistRun | null> {
  const { data, error } = await supabase
    .from('chef_checklist_runs')
    .select('id,local_id,checklist_id,run_date,shift_label,started_at,completed_at,created_by')
    .eq('id', runId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: String(data.id),
    localId: String(data.local_id),
    checklistId: String(data.checklist_id),
    runDate: String(data.run_date),
    shiftLabel: data.shift_label != null ? String(data.shift_label) : null,
    startedAt: String(data.started_at),
    completedAt: data.completed_at != null ? String(data.completed_at) : null,
    createdBy: data.created_by != null ? String(data.created_by) : null,
  };
}

export async function fetchChefProductionTemplate(
  supabase: SupabaseClient,
  localId: string,
  id: string,
): Promise<ChefProductionTemplate | null> {
  const { data, error } = await supabase
    .from('chef_production_templates')
    .select('id,local_id,name,sort_order,is_active,created_at,updated_at')
    .eq('local_id', localId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapProductionTemplate(data as Record<string, unknown>);
}

export async function fetchChefProductionSessionRow(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<ChefProductionSession | null> {
  const { data, error } = await supabase
    .from('chef_production_sessions')
    .select(
      'id,local_id,template_id,work_date,forced_block_id,period_label,lines_snapshot,started_at,completed_at,created_by',
    )
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapProductionSession(data as Record<string, unknown>);
}

export async function fetchChefChecklists(supabase: SupabaseClient, localId: string): Promise<ChefChecklist[]> {
  const { data, error } = await supabase
    .from('chef_checklists')
    .select('id,local_id,title,context,sort_order,is_active,created_at,updated_at')
    .eq('local_id', localId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapChecklist(r as Record<string, unknown>));
}

/** Para historial: incluye listas desactivadas si aún existen en BD. */
export async function fetchChefChecklistsByIds(
  supabase: SupabaseClient,
  localId: string,
  ids: string[],
): Promise<ChefChecklist[]> {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (uniq.length === 0) return [];
  const { data, error } = await supabase
    .from('chef_checklists')
    .select('id,local_id,title,context,sort_order,is_active,created_at,updated_at')
    .eq('local_id', localId)
    .in('id', uniq);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapChecklist(r as Record<string, unknown>));
}

export async function insertChefChecklist(
  supabase: SupabaseClient,
  localId: string,
  input: { title: string; context?: ChecklistContext },
): Promise<ChefChecklist> {
  const { data, error } = await supabase
    .from('chef_checklists')
    .insert({
      local_id: localId,
      title: input.title.trim(),
      context: input.context ?? 'custom',
      sort_order: 0,
      is_active: true,
    })
    .select('id,local_id,title,context,sort_order,is_active,created_at,updated_at')
    .single();
  if (error) throw new Error(error.message);
  return mapChecklist(data as Record<string, unknown>);
}

export async function updateChefChecklist(
  supabase: SupabaseClient,
  localId: string,
  id: string,
  patch: Partial<{ title: string; context: ChecklistContext; sortOrder: number; isActive: boolean }>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.title != null) row.title = patch.title.trim();
  if (patch.context != null) row.context = patch.context;
  if (patch.sortOrder != null) row.sort_order = patch.sortOrder;
  if (patch.isActive != null) row.is_active = patch.isActive;
  const { error } = await supabase.from('chef_checklists').update(row).eq('id', id).eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function deleteChefChecklist(supabase: SupabaseClient, localId: string, id: string): Promise<void> {
  const { error } = await supabase.from('chef_checklists').delete().eq('id', id).eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function fetchChefChecklistSections(
  supabase: SupabaseClient,
  checklistId: string,
): Promise<ChefChecklistSection[]> {
  const { data, error } = await supabase
    .from('chef_checklist_sections')
    .select('id,checklist_id,title,sort_order')
    .eq('checklist_id', checklistId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapSection(r as Record<string, unknown>));
}

export async function insertChefChecklistSection(
  supabase: SupabaseClient,
  checklistId: string,
  title: string,
  sortOrder: number,
): Promise<ChefChecklistSection> {
  const { data, error } = await supabase
    .from('chef_checklist_sections')
    .insert({ checklist_id: checklistId, title: title.trim(), sort_order: sortOrder })
    .select('id,checklist_id,title,sort_order')
    .single();
  if (error) throw new Error(error.message);
  return mapSection(data as Record<string, unknown>);
}

export async function deleteChefChecklistSection(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('chef_checklist_sections').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchChefChecklistItems(
  supabase: SupabaseClient,
  checklistId: string,
): Promise<ChefChecklistItem[]> {
  const { data, error } = await supabase
    .from('chef_checklist_items')
    .select('id,checklist_id,section_id,label,sort_order')
    .eq('checklist_id', checklistId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapItem(r as Record<string, unknown>));
}

export async function insertChefChecklistItem(
  supabase: SupabaseClient,
  checklistId: string,
  input: { label: string; sectionId?: string | null; sortOrder: number },
): Promise<ChefChecklistItem> {
  const { data, error } = await supabase
    .from('chef_checklist_items')
    .insert({
      checklist_id: checklistId,
      section_id: input.sectionId ?? null,
      label: input.label.trim(),
      sort_order: input.sortOrder,
    })
    .select('id,checklist_id,section_id,label,sort_order')
    .single();
  if (error) throw new Error(error.message);
  return mapItem(data as Record<string, unknown>);
}

export async function deleteChefChecklistItem(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('chef_checklist_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchChefChecklistRuns(
  supabase: SupabaseClient,
  localId: string,
  limit = 40,
): Promise<ChefChecklistRun[]> {
  const { data, error } = await supabase
    .from('chef_checklist_runs')
    .select('id,local_id,checklist_id,run_date,shift_label,started_at,completed_at,created_by')
    .eq('local_id', localId)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    localId: String(r.local_id),
    checklistId: String(r.checklist_id),
    runDate: String(r.run_date),
    shiftLabel: r.shift_label != null ? String(r.shift_label) : null,
    startedAt: String(r.started_at),
    completedAt: r.completed_at != null ? String(r.completed_at) : null,
    createdBy: r.created_by != null ? String(r.created_by) : null,
  }));
}

export async function startChefChecklistRun(
  supabase: SupabaseClient,
  localId: string,
  checklistId: string,
  runDate: string,
  shiftLabel: string | null,
  userId: string | null,
): Promise<{ run: ChefChecklistRun; items: ChefChecklistItem[] }> {
  const items = await fetchChefChecklistItems(supabase, checklistId);
  if (items.length === 0) throw new Error('Esta lista no tiene ítems. Añade tareas antes de ejecutarla.');

  const { data: runRow, error: runErr } = await supabase
    .from('chef_checklist_runs')
    .insert({
      local_id: localId,
      checklist_id: checklistId,
      run_date: runDate,
      shift_label: shiftLabel?.trim() || null,
      created_by: userId,
    })
    .select('id,local_id,checklist_id,run_date,shift_label,started_at,completed_at,created_by')
    .single();
  if (runErr) throw new Error(runErr.message);

  const run: ChefChecklistRun = {
    id: String(runRow.id),
    localId: String(runRow.local_id),
    checklistId: String(runRow.checklist_id),
    runDate: String(runRow.run_date),
    shiftLabel: runRow.shift_label != null ? String(runRow.shift_label) : null,
    startedAt: String(runRow.started_at),
    completedAt: runRow.completed_at != null ? String(runRow.completed_at) : null,
    createdBy: runRow.created_by != null ? String(runRow.created_by) : null,
  };

  const rows = items.map((it) => ({
    run_id: run.id,
    item_id: it.id,
    is_done: false,
  }));
  const { error: insErr } = await supabase.from('chef_checklist_run_items').insert(rows);
  if (insErr) {
    // Compensación: evitar runs huérfanos si falla el insert de ítems.
    const { error: rollbackErr } = await supabase.from('chef_checklist_runs').delete().eq('id', run.id);
    if (rollbackErr) {
      throw new Error(`Falló al iniciar checklist (${insErr.message}) y no se pudo revertir (${rollbackErr.message}).`);
    }
    throw new Error(`No se pudo iniciar el checklist. Se revirtió la apertura: ${insErr.message}`);
  }

  return { run, items };
}

export async function fetchChefChecklistRunItems(
  supabase: SupabaseClient,
  runId: string,
): Promise<ChefChecklistRunItem[]> {
  const { data, error } = await supabase
    .from('chef_checklist_run_items')
    .select('id,run_id,item_id,is_done,done_at,note')
    .eq('run_id', runId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    runId: String(r.run_id),
    itemId: String(r.item_id),
    isDone: Boolean(r.is_done),
    doneAt: r.done_at != null ? String(r.done_at) : null,
    note: r.note != null ? String(r.note) : null,
  }));
}

export async function setChefChecklistRunItemDone(
  supabase: SupabaseClient,
  runItemId: string,
  isDone: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('chef_checklist_run_items')
    .update({
      is_done: isDone,
      done_at: isDone ? new Date().toISOString() : null,
    })
    .eq('id', runItemId);
  if (error) throw new Error(error.message);
}

export async function completeChefChecklistRun(supabase: SupabaseClient, runId: string): Promise<void> {
  const { error } = await supabase
    .from('chef_checklist_runs')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', runId);
  if (error) throw new Error(error.message);
}

export async function fetchChefProductionTemplates(
  supabase: SupabaseClient,
  localId: string,
): Promise<ChefProductionTemplate[]> {
  const { data, error } = await supabase
    .from('chef_production_templates')
    .select('id,local_id,name,sort_order,is_active,created_at,updated_at')
    .eq('local_id', localId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapProductionTemplate(r as Record<string, unknown>));
}

export async function fetchChefProductionTemplatesByIds(
  supabase: SupabaseClient,
  localId: string,
  ids: string[],
): Promise<ChefProductionTemplate[]> {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (uniq.length === 0) return [];
  const { data, error } = await supabase
    .from('chef_production_templates')
    .select('id,local_id,name,sort_order,is_active,created_at,updated_at')
    .eq('local_id', localId)
    .in('id', uniq);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapProductionTemplate(r as Record<string, unknown>));
}

export async function insertChefProductionTemplate(
  supabase: SupabaseClient,
  localId: string,
  input: { name: string },
): Promise<ChefProductionTemplate> {
  const { data: last } = await supabase
    .from('chef_production_templates')
    .select('sort_order')
    .eq('local_id', localId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = last?.sort_order != null ? Number(last.sort_order) + 1 : 0;
  const { data, error } = await supabase
    .from('chef_production_templates')
    .insert({
      local_id: localId,
      name: input.name.trim(),
      sort_order: sortOrder,
      is_active: true,
    })
    .select('id,local_id,name,sort_order,is_active,created_at,updated_at')
    .single();
  if (error) throw new Error(error.message);
  return mapProductionTemplate(data as Record<string, unknown>);
}

export async function updateChefProductionTemplateName(
  supabase: SupabaseClient,
  localId: string,
  templateId: string,
  name: string,
): Promise<void> {
  const { error } = await supabase
    .from('chef_production_templates')
    .update({ name: name.trim() })
    .eq('id', templateId)
    .eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function deleteChefProductionTemplate(supabase: SupabaseClient, localId: string, id: string): Promise<void> {
  const { error: sessErr } = await supabase
    .from('chef_production_sessions')
    .delete()
    .eq('template_id', id)
    .eq('local_id', localId);
  if (sessErr) throw new Error(sessErr.message);
  const { error } = await supabase.from('chef_production_templates').delete().eq('id', id).eq('local_id', localId);
  if (error) throw new Error(error.message);
}

export async function fetchChefProductionZones(supabase: SupabaseClient, templateId: string): Promise<ChefProductionZone[]> {
  const { data, error } = await supabase
    .from('chef_production_zones')
    .select('id,template_id,label,sort_order')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapProductionZone(r as Record<string, unknown>));
}

export async function insertChefProductionZone(
  supabase: SupabaseClient,
  templateId: string,
  input: { label: string; sortOrder: number },
): Promise<ChefProductionZone> {
  const { data, error } = await supabase
    .from('chef_production_zones')
    .insert({
      template_id: templateId,
      label: input.label.trim(),
      sort_order: input.sortOrder,
    })
    .select('id,template_id,label,sort_order')
    .single();
  if (error) throw new Error(error.message);
  return mapProductionZone(data as Record<string, unknown>);
}

export async function updateChefProductionZone(
  supabase: SupabaseClient,
  zoneId: string,
  patch: { label?: string; sortOrder?: number },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) row.label = patch.label.trim();
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('chef_production_zones').update(row).eq('id', zoneId);
  if (error) throw new Error(error.message);
}

export async function deleteChefProductionZone(supabase: SupabaseClient, zoneId: string): Promise<void> {
  const { error } = await supabase.from('chef_production_zones').delete().eq('id', zoneId);
  if (error) throw new Error(error.message);
}

export async function duplicateChefProductionTemplate(
  supabase: SupabaseClient,
  localId: string,
  sourceId: string,
): Promise<ChefProductionTemplate> {
  const src = await fetchChefProductionTemplate(supabase, localId, sourceId);
  if (!src) throw new Error('Plantilla no encontrada.');
  const blocks = await fetchChefProductionDayBlocks(supabase, sourceId);
  const dup = await insertChefProductionTemplate(supabase, localId, { name: `${src.name} (copia)` });

  const srcZones = await fetchChefProductionZones(supabase, sourceId).catch(() => [] as ChefProductionZone[]);
  const zoneMap = new Map<string, string>();
  for (const z of [...srcZones].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))) {
    const nz = await insertChefProductionZone(supabase, dup.id, { label: z.label, sortOrder: z.sortOrder });
    zoneMap.set(z.id, nz.id);
  }

  for (const b of [...blocks].sort((a, z) => a.sortOrder - z.sortOrder || a.label.localeCompare(z.label))) {
    const nb = await insertChefProductionDayBlock(supabase, dup.id, {
      label: b.label,
      weekdays: [...b.weekdays],
      sortOrder: b.sortOrder,
    });
    const items = await fetchChefProductionBlockItems(supabase, b.id);
    for (const it of [...items].sort((a, z) => a.sortOrder - z.sortOrder)) {
      const mz = it.productionZoneId ? zoneMap.get(it.productionZoneId) : null;
      await insertChefProductionBlockItem(supabase, nb.id, {
        label: it.label,
        targetQty: it.targetQty,
        sortOrder: it.sortOrder,
        kitchenSection: '',
        shelfLifeDays: it.shelfLifeDays,
        productionZoneId: mz ?? null,
      });
    }
  }

  return dup;
}

export async function fetchChefProductionDayBlocks(
  supabase: SupabaseClient,
  templateId: string,
): Promise<ChefProductionDayBlock[]> {
  const { data, error } = await supabase
    .from('chef_production_day_blocks')
    .select('id,template_id,label,weekdays,sort_order')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapProductionDayBlock(r as Record<string, unknown>));
}

export async function insertChefProductionDayBlock(
  supabase: SupabaseClient,
  templateId: string,
  input: { label: string; weekdays: number[]; sortOrder: number },
): Promise<ChefProductionDayBlock> {
  const { data, error } = await supabase
    .from('chef_production_day_blocks')
    .insert({
      template_id: templateId,
      label: input.label.trim(),
      weekdays: input.weekdays,
      sort_order: input.sortOrder,
    })
    .select('id,template_id,label,weekdays,sort_order')
    .single();
  if (error) throw new Error(error.message);
  return mapProductionDayBlock(data as Record<string, unknown>);
}

export async function updateChefProductionDayBlock(
  supabase: SupabaseClient,
  blockId: string,
  patch: { label?: string; weekdays?: number[]; sortOrder?: number },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) row.label = patch.label.trim();
  if (patch.weekdays !== undefined) row.weekdays = patch.weekdays;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('chef_production_day_blocks').update(row).eq('id', blockId);
  if (error) throw new Error(error.message);
}

export async function deleteChefProductionDayBlock(supabase: SupabaseClient, blockId: string): Promise<void> {
  const { error } = await supabase.from('chef_production_day_blocks').delete().eq('id', blockId);
  if (error) throw new Error(error.message);
}

export async function fetchChefProductionBlockItems(
  supabase: SupabaseClient,
  blockId: string,
): Promise<ChefProductionBlockItem[]> {
  const { data, error } = await supabase
    .from('chef_production_block_items')
    .select('id,block_id,label,target_qty,sort_order,kitchen_section,shelf_life_days,production_zone_id')
    .eq('block_id', blockId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapProductionBlockItem(r as Record<string, unknown>));
}

export async function insertChefProductionBlockItem(
  supabase: SupabaseClient,
  blockId: string,
  input: {
    label: string;
    targetQty: number;
    sortOrder: number;
    kitchenSection?: string;
    shelfLifeDays?: number | null;
    productionZoneId?: string | null;
  },
): Promise<ChefProductionBlockItem> {
  const row: Record<string, unknown> = {
    block_id: blockId,
    label: input.label.trim(),
    target_qty: input.targetQty,
    sort_order: input.sortOrder,
    kitchen_section: (input.kitchenSection ?? '').trim(),
    shelf_life_days: input.shelfLifeDays ?? null,
    production_zone_id: input.productionZoneId ?? null,
  };
  const { data, error } = await supabase
    .from('chef_production_block_items')
    .insert(row)
    .select('id,block_id,label,target_qty,sort_order,kitchen_section,shelf_life_days,production_zone_id')
    .single();
  if (error) throw new Error(error.message);
  return mapProductionBlockItem(data as Record<string, unknown>);
}

export async function updateChefProductionBlockItem(
  supabase: SupabaseClient,
  itemId: string,
  patch: {
    label?: string;
    targetQty?: number;
    sortOrder?: number;
    kitchenSection?: string;
    shelfLifeDays?: number | null;
    productionZoneId?: string | null;
  },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) row.label = patch.label.trim();
  if (patch.targetQty !== undefined) row.target_qty = patch.targetQty;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (patch.kitchenSection !== undefined) row.kitchen_section = patch.kitchenSection.trim();
  if (patch.shelfLifeDays !== undefined) row.shelf_life_days = patch.shelfLifeDays;
  if (patch.productionZoneId !== undefined) row.production_zone_id = patch.productionZoneId;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('chef_production_block_items').update(row).eq('id', itemId);
  if (error) throw new Error(error.message);
}

export async function deleteChefProductionBlockItem(supabase: SupabaseClient, itemId: string): Promise<void> {
  const { error } = await supabase.from('chef_production_block_items').delete().eq('id', itemId);
  if (error) throw new Error(error.message);
}

export async function reorderChefProductionBlockItems(
  supabase: SupabaseClient,
  orderedItemIds: string[],
): Promise<void> {
  for (let i = 0; i < orderedItemIds.length; i++) {
    const { error } = await supabase
      .from('chef_production_block_items')
      .update({ sort_order: i })
      .eq('id', orderedItemIds[i]);
    if (error) throw new Error(error.message);
  }
}

/** Todos los productos de la plantilla (todos los bloques), para abrir sesión. */
export async function collectAllBlockItemsInTemplate(
  supabase: SupabaseClient,
  templateId: string,
): Promise<ChefProductionBlockItem[]> {
  const blocks = await fetchChefProductionDayBlocks(supabase, templateId);
  const out: ChefProductionBlockItem[] = [];
  for (const b of blocks) {
    const items = await fetchChefProductionBlockItems(supabase, b.id);
    out.push(...items);
  }
  return out;
}

function mergeChefProductionSessionQty(
  qtyCanon: number | null,
  qtyOther: number | null,
): number | null {
  const a = qtyCanon != null && !Number.isNaN(Number(qtyCanon)) ? Number(qtyCanon) : null;
  const b = qtyOther != null && !Number.isNaN(Number(qtyOther)) ? Number(qtyOther) : null;
  if (a != null && b != null) return Math.max(a, b);
  return a ?? b ?? null;
}

export async function deleteChefProductionSessionLinesByIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('chef_production_session_lines').delete().in('id', ids);
  if (error) throw new Error(error.message);
}

export async function updateChefProductionSessionLineBlockItemId(
  supabase: SupabaseClient,
  sessionLineId: string,
  blockItemId: string,
): Promise<void> {
  const { error } = await supabase
    .from('chef_production_session_lines')
    .update({ block_item_id: blockItemId })
    .eq('id', sessionLineId);
  if (error) throw new Error(error.message);
}

/** Alinea líneas de sesión con la pizarra fusionada: una fila por producto, «hecho» en el id canónico (Lun–Jue). */
export async function ensureChefProductionSessionLinesForTemplate(
  supabase: SupabaseClient,
  sessionId: string,
  templateId: string,
): Promise<void> {
  const rows = await fetchFullProductionDayBoardRowsForTemplate(supabase, templateId);
  const canonNeeded = new Set(
    rows.map((r) => canonicalBlockItemIdForBoardRow(r)).filter((id): id is string => Boolean(id)),
  );

  let existing = await fetchChefProductionSessionLines(supabase, sessionId);
  const dupDeleteIds: string[] = [];

  for (const row of rows) {
    const canon = canonicalBlockItemIdForBoardRow(row);
    if (!canon) continue;
    const secondary =
      row.ljItem && row.vdItem && row.ljItem.id !== row.vdItem.id
        ? row.ljItem.id === canon
          ? row.vdItem.id
          : row.ljItem.id
        : null;

    const lineCanon = existing.find((sl) => sl.blockItemId === canon);
    const lineSec = secondary ? existing.find((sl) => sl.blockItemId === secondary) : undefined;

    if (lineCanon && lineSec) {
      const merged = mergeChefProductionSessionQty(lineCanon.qtyOnHand, lineSec.qtyOnHand);
      if (merged !== lineCanon.qtyOnHand) {
        await updateChefProductionSessionLineQty(supabase, lineCanon.id, merged);
      }
      dupDeleteIds.push(lineSec.id);
    } else if (!lineCanon && lineSec) {
      await updateChefProductionSessionLineBlockItemId(supabase, lineSec.id, canon);
    }
  }

  if (dupDeleteIds.length > 0) {
    await deleteChefProductionSessionLinesByIds(supabase, dupDeleteIds);
  }

  existing = await fetchChefProductionSessionLines(supabase, sessionId);
  const orphanIds = existing.filter((sl) => !canonNeeded.has(sl.blockItemId)).map((sl) => sl.id);
  if (orphanIds.length > 0) {
    await deleteChefProductionSessionLinesByIds(supabase, orphanIds);
    existing = await fetchChefProductionSessionLines(supabase, sessionId);
  }

  const have = new Set(existing.map((e) => e.blockItemId));
  const missing = [...canonNeeded].filter((id) => !have.has(id));
  if (missing.length === 0) return;
  const { error } = await supabase.from('chef_production_session_lines').insert(
    missing.map((block_item_id) => ({
      session_id: sessionId,
      block_item_id,
      qty_on_hand: null as number | null,
    })),
  );
  if (error) throw new Error(error.message);
}

async function buildChefProductionSnapshotForSession(
  supabase: SupabaseClient,
  session: ChefProductionSession,
): Promise<ChefProductionSnapshotV1> {
  const blocks = await fetchChefProductionDayBlocks(supabase, session.templateId);
  const block = resolveChefProductionDayBlock(blocks, session.workDate, session.forcedBlockId);
  const blockLabel = block?.label ?? '—';
  const sessionLines = await fetchChefProductionSessionLines(supabase, session.id);
  const byBlockItemId = new Map(sessionLines.map((sl) => [sl.blockItemId, sl]));

  const items: ChefProductionSnapshotV1['sections'][0]['items'] = [];
  if (block) {
    const blockItems = await fetchChefProductionBlockItems(supabase, block.id);
    for (const it of [...blockItems].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const objective = it.targetQty;
      const sl = byBlockItemId.get(it.id);
      const hecho = sl?.qtyOnHand ?? null;
      items.push({
        label: it.label,
        objective,
        hecho,
        hacer: productionQtyToMake(objective, hecho),
      });
    }
  }

  return {
    version: 1,
    workDate: session.workDate,
    blockLabel,
    sections: items.length ? [{ title: blockLabel, items }] : [],
  };
}

export async function fetchChefProductionSessions(
  supabase: SupabaseClient,
  localId: string,
  limit = 40,
): Promise<ChefProductionSession[]> {
  const { data, error } = await supabase
    .from('chef_production_sessions')
    .select(
      'id,local_id,template_id,work_date,forced_block_id,period_label,lines_snapshot,started_at,completed_at,created_by',
    )
    .eq('local_id', localId)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapProductionSession(r as Record<string, unknown>));
}

export async function getOrCreateChefProductionSession(
  supabase: SupabaseClient,
  localId: string,
  templateId: string,
  workDate: string,
  periodLabel: string | null,
  userId: string | null,
): Promise<ChefProductionSession> {
  const { data: existing, error: exErr } = await supabase
    .from('chef_production_sessions')
    .select(
      'id,local_id,template_id,work_date,forced_block_id,period_label,lines_snapshot,started_at,completed_at,created_by',
    )
    .eq('local_id', localId)
    .eq('template_id', templateId)
    .eq('work_date', workDate)
    .maybeSingle();
  if (exErr) throw new Error(exErr.message);
  if (existing) {
    const sess = mapProductionSession(existing as Record<string, unknown>);
    const existingLines = await fetchChefProductionSessionLines(supabase, sess.id);
    if (existingLines.length === 0) {
      const canonicalIds = await listCanonicalSessionBlockItemIdsForTemplate(supabase, templateId);
      if (canonicalIds.length === 0) {
        throw new Error(
          'Esta plantilla no tiene productos en ningún bloque. Edítala en Plantillas antes de abrir el día.',
        );
      }
      const slRows = canonicalIds.map((block_item_id) => ({
        session_id: sess.id,
        block_item_id,
        qty_on_hand: null as number | null,
      }));
      const { error: lineErr } = await supabase.from('chef_production_session_lines').insert(slRows);
      if (lineErr) throw new Error(lineErr.message);
    }
    return sess;
  }

  const canonicalIds = await listCanonicalSessionBlockItemIdsForTemplate(supabase, templateId);
  if (canonicalIds.length === 0) {
    throw new Error(
      'Esta plantilla no tiene productos en ningún bloque. Edítala en Plantillas antes de abrir el día.',
    );
  }

  const { data: row, error: insErr } = await supabase
    .from('chef_production_sessions')
    .insert({
      local_id: localId,
      template_id: templateId,
      work_date: workDate,
      period_label: periodLabel?.trim() || null,
      created_by: userId,
    })
    .select(
      'id,local_id,template_id,work_date,forced_block_id,period_label,lines_snapshot,started_at,completed_at,created_by',
    )
    .single();

  if (insErr) {
    if (insErr.code === '23505') {
      const { data: again } = await supabase
        .from('chef_production_sessions')
        .select(
          'id,local_id,template_id,work_date,forced_block_id,period_label,lines_snapshot,started_at,completed_at,created_by',
        )
        .eq('local_id', localId)
        .eq('template_id', templateId)
        .eq('work_date', workDate)
        .maybeSingle();
      if (again) return mapProductionSession(again as Record<string, unknown>);
    }
    throw new Error(insErr.message);
  }

  const session = mapProductionSession(row as Record<string, unknown>);
  const slRows = canonicalIds.map((block_item_id) => ({
    session_id: session.id,
    block_item_id,
    qty_on_hand: null as number | null,
  }));
  const { error: lineErr } = await supabase.from('chef_production_session_lines').insert(slRows);
  if (lineErr) {
    await supabase.from('chef_production_sessions').delete().eq('id', session.id);
    throw new Error(lineErr.message);
  }
  return session;
}

export async function fetchChefProductionSessionLines(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<ChefProductionSessionLine[]> {
  const { data, error } = await supabase
    .from('chef_production_session_lines')
    .select('id,session_id,block_item_id,qty_on_hand')
    .eq('session_id', sessionId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapProductionSessionLine(r as Record<string, unknown>));
}

export async function updateChefProductionSessionForcedBlock(
  supabase: SupabaseClient,
  sessionId: string,
  forcedBlockId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('chef_production_sessions')
    .update({ forced_block_id: forcedBlockId })
    .eq('id', sessionId);
  if (error) throw new Error(error.message);
}

export async function updateChefProductionSessionLineQty(
  supabase: SupabaseClient,
  sessionLineId: string,
  qtyOnHand: number | null,
): Promise<void> {
  const { error } = await supabase
    .from('chef_production_session_lines')
    .update({ qty_on_hand: qtyOnHand })
    .eq('id', sessionLineId);
  if (error) throw new Error(error.message);
}

export async function completeChefProductionSession(supabase: SupabaseClient, sessionId: string): Promise<void> {
  const session = await fetchChefProductionSessionRow(supabase, sessionId);
  if (!session) throw new Error('Sesión no encontrada.');
  if (session.completedAt) return;
  const snapshot = await buildChefProductionSnapshotForSession(supabase, session);
  const { error } = await supabase
    .from('chef_production_sessions')
    .update({ completed_at: new Date().toISOString(), lines_snapshot: snapshot })
    .eq('id', sessionId);
  if (error) throw new Error(error.message);
}
