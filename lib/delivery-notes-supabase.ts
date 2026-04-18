import type { SupabaseClient } from '@supabase/supabase-js';
import type { PedidoOrderItem } from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';

export type DeliveryNoteStatus =
  | 'draft'
  | 'ocr_read'
  | 'pending_review'
  | 'validated'
  | 'with_incidents'
  | 'archived';

export type DeliveryNoteSourceType = 'manual' | 'ocr' | 'linked_order';

export type DeliveryNoteOcrStatus = 'pending' | 'ok' | 'partial' | 'failed' | 'skipped';

export type DeliveryNoteItemMatchStatus =
  | 'unmatched'
  | 'matched'
  | 'mismatch_qty'
  | 'mismatch_price'
  | 'extra_line'
  | 'not_applicable';

export type DeliveryNoteIncidentType =
  | 'qty_diff'
  | 'price_diff'
  | 'not_ordered'
  | 'line_unknown'
  | 'total_mismatch'
  | 'incomplete_doc'
  | 'other';

export type DeliveryNote = {
  id: string;
  localId: string;
  supplierId: string | null;
  supplierName: string;
  deliveryNoteNumber: string;
  relatedOrderId: string | null;
  deliveryDate: string | null;
  status: DeliveryNoteStatus;
  subtotal: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  currency: string;
  ocrStatus: DeliveryNoteOcrStatus | null;
  sourceType: DeliveryNoteSourceType;
  originalStoragePath: string | null;
  originalMimeType: string | null;
  originalFileName: string | null;
  notes: string;
  validatedAt: string | null;
  validatedBy: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryNoteItem = {
  id: string;
  localId: string;
  deliveryNoteId: string;
  supplierProductName: string;
  internalProductId: string | null;
  quantity: number;
  unit: Unit;
  unitPrice: number | null;
  lineSubtotal: number | null;
  vatRate: number | null;
  matchedOrderItemId: string | null;
  matchStatus: DeliveryNoteItemMatchStatus | null;
  notes: string;
  sortOrder: number;
  createdAt: string;
};

export type DeliveryNoteIncident = {
  id: string;
  localId: string;
  deliveryNoteId: string;
  deliveryNoteItemId: string | null;
  incidentType: DeliveryNoteIncidentType;
  description: string;
  status: 'open' | 'resolved';
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionComment: string;
  createdAt: string;
};

export type DeliveryNoteListEntry = DeliveryNote & {
  hasOpenIncidents: boolean;
  openIncidentCount: number;
};

function normTokens(s: string): Set<string> {
  const t = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 2);
  return new Set(t);
}

function tokenScore(a: string, b: string): number {
  const A = normTokens(a);
  const B = normTokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let c = 0;
  for (const t of A) if (B.has(t)) c++;
  return c;
}

function qtyOrderedForCompare(item: PedidoOrderItem): number {
  return Math.round(item.quantity * 100) / 100;
}

function priceClose(a: number | null, b: number, tol = 0.02): boolean {
  if (a == null) return true;
  return Math.abs(a - b) <= tol || (b > 0 && Math.abs(a - b) / b < 0.015);
}

type NoteRow = Record<string, unknown>;
type ItemRow = Record<string, unknown>;

function mapNote(row: NoteRow): DeliveryNote {
  return {
    id: String(row.id),
    localId: String(row.local_id),
    supplierId: row.supplier_id != null ? String(row.supplier_id) : null,
    supplierName: String(row.supplier_name ?? ''),
    deliveryNoteNumber: String(row.delivery_note_number ?? ''),
    relatedOrderId: row.related_order_id != null ? String(row.related_order_id) : null,
    deliveryDate: row.delivery_date != null ? String(row.delivery_date) : null,
    status: row.status as DeliveryNoteStatus,
    subtotal: row.subtotal != null ? Number(row.subtotal) : null,
    taxAmount: row.tax_amount != null ? Number(row.tax_amount) : null,
    totalAmount: row.total_amount != null ? Number(row.total_amount) : null,
    currency: String(row.currency ?? 'EUR'),
    ocrStatus: (row.ocr_status as DeliveryNoteOcrStatus | null) ?? null,
    sourceType: row.source_type as DeliveryNoteSourceType,
    originalStoragePath: row.original_storage_path != null ? String(row.original_storage_path) : null,
    originalMimeType: row.original_mime_type != null ? String(row.original_mime_type) : null,
    originalFileName: row.original_file_name != null ? String(row.original_file_name) : null,
    notes: String(row.notes ?? ''),
    validatedAt: row.validated_at != null ? String(row.validated_at) : null,
    validatedBy: row.validated_by != null ? String(row.validated_by) : null,
    createdBy: row.created_by != null ? String(row.created_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapItem(row: ItemRow): DeliveryNoteItem {
  return {
    id: String(row.id),
    localId: String(row.local_id),
    deliveryNoteId: String(row.delivery_note_id),
    supplierProductName: String(row.supplier_product_name ?? ''),
    internalProductId: row.internal_product_id != null ? String(row.internal_product_id) : null,
    quantity: Number(row.quantity ?? 0),
    unit: row.unit as Unit,
    unitPrice: row.unit_price != null ? Number(row.unit_price) : null,
    lineSubtotal: row.line_subtotal != null ? Number(row.line_subtotal) : null,
    vatRate: row.vat_rate != null ? Number(row.vat_rate) : null,
    matchedOrderItemId: row.matched_order_item_id != null ? String(row.matched_order_item_id) : null,
    matchStatus: (row.match_status as DeliveryNoteItemMatchStatus | null) ?? null,
    notes: String(row.notes ?? ''),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
  };
}

function mapIncident(row: Record<string, unknown>): DeliveryNoteIncident {
  return {
    id: String(row.id),
    localId: String(row.local_id),
    deliveryNoteId: String(row.delivery_note_id),
    deliveryNoteItemId: row.delivery_note_item_id != null ? String(row.delivery_note_item_id) : null,
    incidentType: row.incident_type as DeliveryNoteIncidentType,
    description: String(row.description ?? ''),
    status: row.status as 'open' | 'resolved',
    resolvedBy: row.resolved_by != null ? String(row.resolved_by) : null,
    resolvedAt: row.resolved_at != null ? String(row.resolved_at) : null,
    resolutionComment: String(row.resolution_comment ?? ''),
    createdAt: String(row.created_at),
  };
}

const NOTE_SEL =
  'id,local_id,supplier_id,supplier_name,delivery_note_number,related_order_id,delivery_date,status,subtotal,tax_amount,total_amount,currency,ocr_status,source_type,original_storage_path,original_mime_type,original_file_name,notes,validated_at,validated_by,created_by,created_at,updated_at';

const ITEM_SEL =
  'id,local_id,delivery_note_id,supplier_product_name,internal_product_id,quantity,unit,unit_price,line_subtotal,vat_rate,matched_order_item_id,match_status,notes,sort_order,created_at';

export async function fetchDeliveryNotesList(supabase: SupabaseClient, localId: string): Promise<DeliveryNoteListEntry[]> {
  const { data, error } = await supabase
    .from('delivery_notes')
    .select(NOTE_SEL)
    .eq('local_id', localId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const notes = ((data ?? []) as NoteRow[]).map(mapNote);
  if (notes.length === 0) return [];
  const ids = notes.map((n) => n.id);
  const { data: incRows, error: incErr } = await supabase
    .from('delivery_note_incidents')
    .select('delivery_note_id,status')
    .eq('local_id', localId)
    .in('delivery_note_id', ids)
    .eq('status', 'open');
  if (incErr) throw new Error(incErr.message);
  const countByNote = new Map<string, number>();
  for (const r of incRows ?? []) {
    const id = String((r as { delivery_note_id: string }).delivery_note_id);
    countByNote.set(id, (countByNote.get(id) ?? 0) + 1);
  }
  return notes.map((n) => ({
    ...n,
    hasOpenIncidents: (countByNote.get(n.id) ?? 0) > 0,
    openIncidentCount: countByNote.get(n.id) ?? 0,
  }));
}

function addDaysToYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Margen alrededor del periodo Finanzas para alinear delivery_date vs created_at. */
const FINANZAS_DN_QUERY_SLACK_DAYS = 50;

export type FetchDeliveryNotesForFinanzasOptions = {
  /** Fecha mínima/máxima de imputación relevante (YYYY-MM-DD); se amplía con margen interno. */
  imputeFromYmd?: string;
  imputeToYmd?: string;
  limit?: number;
};

/**
 * Finanzas / albaranes por periodo: por defecto acota por rango de imputación (+ margen)
 * en lugar de traer miles de filas irrelevantes.
 */
export async function fetchDeliveryNotesForFinanzas(
  supabase: SupabaseClient,
  localId: string,
  options?: FetchDeliveryNotesForFinanzasOptions,
): Promise<DeliveryNote[]> {
  const hasWindow = Boolean(options?.imputeFromYmd && options?.imputeToYmd);
  const limit =
    options?.limit ?? (hasWindow ? 1200 : 2000);

  if (!hasWindow) {
    const { data, error } = await supabase
      .from('delivery_notes')
      .select(NOTE_SEL)
      .eq('local_id', localId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return ((data ?? []) as NoteRow[]).map(mapNote);
  }

  const dFrom = addDaysToYmd(options!.imputeFromYmd!, -FINANZAS_DN_QUERY_SLACK_DAYS);
  const dTo = addDaysToYmd(options!.imputeToYmd!, FINANZAS_DN_QUERY_SLACK_DAYS);
  const isoFrom = `${dFrom}T00:00:00.000Z`;
  const isoTo = `${dTo}T23:59:59.999Z`;

  const { data: withDeliv, error: e1 } = await supabase
    .from('delivery_notes')
    .select(NOTE_SEL)
    .eq('local_id', localId)
    .not('delivery_date', 'is', null)
    .gte('delivery_date', dFrom)
    .lte('delivery_date', dTo);

  const { data: noDeliv, error: e2 } = await supabase
    .from('delivery_notes')
    .select(NOTE_SEL)
    .eq('local_id', localId)
    .is('delivery_date', null)
    .gte('created_at', isoFrom)
    .lte('created_at', isoTo);

  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);

  const byId = new Map<string, NoteRow>();
  for (const row of (withDeliv ?? []) as NoteRow[]) {
    byId.set(String(row.id), row);
  }
  for (const row of (noDeliv ?? []) as NoteRow[]) {
    byId.set(String(row.id), row);
  }
  const merged = Array.from(byId.values()).sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  );
  return merged.slice(0, limit).map(mapNote);
}

/**
 * Conteo ligero (HEAD) de albaranes no validados ni archivados cuya fecha de imputación cae en [fromYmd, toYmd]:
 * `delivery_date` en rango, o sin fecha de entrega y `created_at` en el mismo rango UTC.
 * Usado por Finanzas (alertas) sin traer filas.
 */
export async function countPendingDeliveryNotesInImputationRange(
  supabase: SupabaseClient,
  localId: string,
  fromYmd: string,
  toYmd: string,
): Promise<number> {
  const isoStart = `${fromYmd}T00:00:00.000Z`;
  const isoEnd = `${toYmd}T23:59:59.999Z`;

  const base = () =>
    supabase
      .from('delivery_notes')
      .select('id', { count: 'exact', head: true })
      .eq('local_id', localId)
      .neq('status', 'validated')
      .neq('status', 'archived');

  const { count: c1, error: e1 } = await base()
    .not('delivery_date', 'is', null)
    .gte('delivery_date', fromYmd)
    .lte('delivery_date', toYmd);

  const { count: c2, error: e2 } = await base()
    .is('delivery_date', null)
    .gte('created_at', isoStart)
    .lte('created_at', isoEnd);

  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  return (c1 ?? 0) + (c2 ?? 0);
}

export async function fetchDeliveryNoteItemsForNotes(
  supabase: SupabaseClient,
  localId: string,
  noteIds: string[],
): Promise<DeliveryNoteItem[]> {
  if (!noteIds.length) return [];
  const { data, error } = await supabase
    .from('delivery_note_items')
    .select(ITEM_SEL)
    .eq('local_id', localId)
    .in('delivery_note_id', noteIds);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ItemRow[]).map(mapItem);
}

export async function fetchDeliveryNoteById(
  supabase: SupabaseClient,
  localId: string,
  id: string,
): Promise<{
  note: DeliveryNote;
  items: DeliveryNoteItem[];
  incidents: DeliveryNoteIncident[];
  lastOcrText: string | null;
} | null> {
  const { data: row, error } = await supabase.from('delivery_notes').select(NOTE_SEL).eq('local_id', localId).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  const note = mapNote(row as NoteRow);
  const { data: items, error: iErr } = await supabase
    .from('delivery_note_items')
    .select(ITEM_SEL)
    .eq('local_id', localId)
    .eq('delivery_note_id', id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (iErr) throw new Error(iErr.message);
  const { data: inc, error: eErr } = await supabase
    .from('delivery_note_incidents')
    .select(
      'id,local_id,delivery_note_id,delivery_note_item_id,incident_type,description,status,resolved_by,resolved_at,resolution_comment,created_at',
    )
    .eq('local_id', localId)
    .eq('delivery_note_id', id)
    .order('created_at', { ascending: false });
  if (eErr) throw new Error(eErr.message);
  const { data: ocr, error: oErr } = await supabase
    .from('delivery_note_ocr_runs')
    .select('raw_text,created_at')
    .eq('local_id', localId)
    .eq('delivery_note_id', id)
    .order('created_at', { ascending: false })
    .limit(1);
  if (oErr) throw new Error(oErr.message);
  const lastOcr = (ocr ?? [])[0] as { raw_text?: string } | undefined;
  return {
    note,
    items: ((items ?? []) as ItemRow[]).map(mapItem),
    incidents: ((inc ?? []) as Record<string, unknown>[]).map(mapIncident),
    lastOcrText: lastOcr?.raw_text?.trim() ? String(lastOcr.raw_text) : null,
  };
}

export type DeliveryNoteInsert = {
  supplierId?: string | null;
  supplierName?: string;
  deliveryNoteNumber?: string;
  relatedOrderId?: string | null;
  deliveryDate?: string | null;
  status?: DeliveryNoteStatus;
  sourceType?: DeliveryNoteSourceType;
  notes?: string;
  createdBy?: string | null;
};

export async function insertDeliveryNote(
  supabase: SupabaseClient,
  localId: string,
  input: DeliveryNoteInsert,
): Promise<DeliveryNote> {
  const payload = {
    local_id: localId,
    supplier_id: input.supplierId ?? null,
    supplier_name: input.supplierName?.trim() ?? '',
    delivery_note_number: input.deliveryNoteNumber?.trim() ?? '',
    related_order_id: input.relatedOrderId ?? null,
    delivery_date: input.deliveryDate ?? null,
    status: input.status ?? 'draft',
    source_type: input.sourceType ?? 'manual',
    notes: input.notes?.trim() ?? '',
    created_by: input.createdBy ?? null,
  };
  const { data, error } = await supabase.from('delivery_notes').insert(payload).select(NOTE_SEL).single();
  if (error) throw new Error(error.message);
  return mapNote(data as NoteRow);
}

export type DeliveryNotePatch = Partial<{
  supplierId: string | null;
  supplierName: string;
  deliveryNoteNumber: string;
  relatedOrderId: string | null;
  deliveryDate: string | null;
  status: DeliveryNoteStatus;
  subtotal: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  currency: string;
  ocrStatus: DeliveryNoteOcrStatus | null;
  sourceType: DeliveryNoteSourceType;
  originalStoragePath: string | null;
  originalMimeType: string | null;
  originalFileName: string | null;
  notes: string;
  validatedAt: string | null;
  validatedBy: string | null;
}>;

export async function updateDeliveryNote(
  supabase: SupabaseClient,
  localId: string,
  noteId: string,
  patch: DeliveryNotePatch,
): Promise<DeliveryNote> {
  const row: Record<string, unknown> = {};
  if (patch.supplierId !== undefined) row.supplier_id = patch.supplierId;
  if (patch.supplierName !== undefined) row.supplier_name = patch.supplierName;
  if (patch.deliveryNoteNumber !== undefined) row.delivery_note_number = patch.deliveryNoteNumber;
  if (patch.relatedOrderId !== undefined) row.related_order_id = patch.relatedOrderId;
  if (patch.deliveryDate !== undefined) row.delivery_date = patch.deliveryDate;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.subtotal !== undefined) row.subtotal = patch.subtotal;
  if (patch.taxAmount !== undefined) row.tax_amount = patch.taxAmount;
  if (patch.totalAmount !== undefined) row.total_amount = patch.totalAmount;
  if (patch.currency !== undefined) row.currency = patch.currency;
  if (patch.ocrStatus !== undefined) row.ocr_status = patch.ocrStatus;
  if (patch.sourceType !== undefined) row.source_type = patch.sourceType;
  if (patch.originalStoragePath !== undefined) row.original_storage_path = patch.originalStoragePath;
  if (patch.originalMimeType !== undefined) row.original_mime_type = patch.originalMimeType;
  if (patch.originalFileName !== undefined) row.original_file_name = patch.originalFileName;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.validatedAt !== undefined) row.validated_at = patch.validatedAt;
  if (patch.validatedBy !== undefined) row.validated_by = patch.validatedBy;
  const { data, error } = await supabase
    .from('delivery_notes')
    .update(row)
    .eq('local_id', localId)
    .eq('id', noteId)
    .select(NOTE_SEL)
    .single();
  if (error) throw new Error(error.message);
  return mapNote(data as NoteRow);
}

export type DeliveryNoteItemDraft = {
  supplierProductName: string;
  internalProductId?: string | null;
  quantity: number;
  unit: Unit;
  unitPrice?: number | null;
  lineSubtotal?: number | null;
  vatRate?: number | null;
  matchedOrderItemId?: string | null;
  matchStatus?: DeliveryNoteItemMatchStatus | null;
  notes?: string;
};

export async function replaceDeliveryNoteItems(
  supabase: SupabaseClient,
  localId: string,
  noteId: string,
  drafts: DeliveryNoteItemDraft[],
): Promise<DeliveryNoteItem[]> {
  const { error: delErr } = await supabase
    .from('delivery_note_items')
    .delete()
    .eq('local_id', localId)
    .eq('delivery_note_id', noteId);
  if (delErr) throw new Error(delErr.message);
  if (drafts.length === 0) return [];
  const payload = drafts.map((d, idx) => ({
    local_id: localId,
    delivery_note_id: noteId,
    supplier_product_name: d.supplierProductName.trim(),
    internal_product_id: d.internalProductId ?? null,
    quantity: d.quantity,
    unit: d.unit,
    unit_price: d.unitPrice ?? null,
    line_subtotal: d.lineSubtotal ?? null,
    vat_rate: d.vatRate ?? null,
    matched_order_item_id: d.matchedOrderItemId ?? null,
    match_status: d.matchStatus ?? 'not_applicable',
    notes: d.notes?.trim() ?? '',
    sort_order: idx,
  }));
  const { data, error } = await supabase.from('delivery_note_items').insert(payload).select(ITEM_SEL);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ItemRow[]).map(mapItem);
}

export async function insertDeliveryNoteOcrRun(
  supabase: SupabaseClient,
  localId: string,
  noteId: string,
  rawText: string,
  opts?: { errorMessage?: string | null; durationMs?: number | null; createdBy?: string | null },
): Promise<void> {
  const { error } = await supabase.from('delivery_note_ocr_runs').insert({
    local_id: localId,
    delivery_note_id: noteId,
    provider: 'textract',
    raw_text: rawText,
    error_message: opts?.errorMessage ?? null,
    duration_ms: opts?.durationMs ?? null,
    created_by: opts?.createdBy ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function insertDeliveryNoteIncident(
  supabase: SupabaseClient,
  localId: string,
  input: {
    deliveryNoteId: string;
    deliveryNoteItemId?: string | null;
    incidentType: DeliveryNoteIncidentType;
    description: string;
  },
): Promise<DeliveryNoteIncident> {
  const { data, error } = await supabase
    .from('delivery_note_incidents')
    .insert({
      local_id: localId,
      delivery_note_id: input.deliveryNoteId,
      delivery_note_item_id: input.deliveryNoteItemId ?? null,
      incident_type: input.incidentType,
      description: input.description.trim(),
      status: 'open',
    })
    .select(
      'id,local_id,delivery_note_id,delivery_note_item_id,incident_type,description,status,resolved_by,resolved_at,resolution_comment,created_at',
    )
    .single();
  if (error) throw new Error(error.message);
  return mapIncident(data as Record<string, unknown>);
}

export async function resolveDeliveryNoteIncident(
  supabase: SupabaseClient,
  localId: string,
  incidentId: string,
  userId: string,
  resolutionComment: string,
): Promise<void> {
  const { error } = await supabase
    .from('delivery_note_incidents')
    .update({
      status: 'resolved',
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
      resolution_comment: resolutionComment.trim(),
    })
    .eq('local_id', localId)
    .eq('id', incidentId);
  if (error) throw new Error(error.message);
}

/** Empareja líneas del albarán con líneas del pedido y actualiza match_status + matched_order_item_id. */
export async function recomputeDeliveryNoteLineMatching(
  supabase: SupabaseClient,
  localId: string,
  noteId: string,
  orderItems: PedidoOrderItem[],
): Promise<DeliveryNoteItem[]> {
  const { data: rows, error } = await supabase
    .from('delivery_note_items')
    .select(ITEM_SEL)
    .eq('local_id', localId)
    .eq('delivery_note_id', noteId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  const items = ((rows ?? []) as ItemRow[]).map(mapItem);
  const used = new Set<string>();
  const updates: Array<{ id: string; matched_order_item_id: string | null; match_status: DeliveryNoteItemMatchStatus }> =
    [];

  for (const ni of items) {
    let best: { orderItemId: string; score: number } | null = null;
    for (const oi of orderItems) {
      if (used.has(oi.id)) continue;
      const sc = tokenScore(ni.supplierProductName, oi.productName);
      if (sc >= 1 && (!best || sc > best.score)) best = { orderItemId: oi.id, score: sc };
    }
    if (!best) {
      updates.push({
        id: ni.id,
        matched_order_item_id: null,
        match_status: 'extra_line',
      });
      continue;
    }
    used.add(best.orderItemId);
    const oi = orderItems.find((x) => x.id === best.orderItemId)!;
    const qOrd = qtyOrderedForCompare(oi);
    const qNote = Math.round(ni.quantity * 10000) / 10000;
    const qtyOk = Math.abs(qNote - qOrd) < 0.02 || Math.abs(qNote - qOrd) / Math.max(qOrd, 0.001) < 0.02;
    const priceOk = priceClose(ni.unitPrice, oi.pricePerUnit);
    let st: DeliveryNoteItemMatchStatus = 'matched';
    if (!qtyOk && !priceOk) st = 'mismatch_qty';
    else if (!qtyOk) st = 'mismatch_qty';
    else if (!priceOk) st = 'mismatch_price';
    updates.push({
      id: ni.id,
      matched_order_item_id: oi.id,
      match_status: st,
    });
  }

  for (const u of updates) {
    const { error: uErr } = await supabase
      .from('delivery_note_items')
      .update({
        matched_order_item_id: u.matched_order_item_id,
        match_status: u.match_status,
      })
      .eq('local_id', localId)
      .eq('id', u.id);
    if (uErr) throw new Error(uErr.message);
  }

  const { data: again, error: aErr } = await supabase
    .from('delivery_note_items')
    .select(ITEM_SEL)
    .eq('local_id', localId)
    .eq('delivery_note_id', noteId)
    .order('sort_order', { ascending: true });
  if (aErr) throw new Error(aErr.message);
  return ((again ?? []) as ItemRow[]).map(mapItem);
}

/** Inserta incidencias [auto] según comparación numérica (solo abiertas previas [auto]). */
export async function generateIncidentsFromDeliveryNoteComparison(
  supabase: SupabaseClient,
  localId: string,
  noteId: string,
  noteItems: DeliveryNoteItem[],
  orderItems: PedidoOrderItem[],
): Promise<void> {
  await supabase
    .from('delivery_note_incidents')
    .delete()
    .eq('local_id', localId)
    .eq('delivery_note_id', noteId)
    .eq('status', 'open')
    .like('description', '[auto]%');

  const used = new Set(noteItems.filter((n) => n.matchedOrderItemId).map((n) => n.matchedOrderItemId!));

  for (const ni of noteItems) {
    if (ni.matchStatus === 'extra_line') {
      await insertDeliveryNoteIncident(supabase, localId, {
        deliveryNoteId: noteId,
        deliveryNoteItemId: ni.id,
        incidentType: 'not_ordered',
        description: `[auto] Producto en albarán no emparejado con el pedido: ${ni.supplierProductName}`,
      });
      continue;
    }
    if (!ni.matchedOrderItemId) continue;
    const oi = orderItems.find((x) => x.id === ni.matchedOrderItemId);
    if (!oi) continue;
    const qOrd = qtyOrderedForCompare(oi);
    const qNote = Math.round(ni.quantity * 10000) / 10000;
    const qtyOk = Math.abs(qNote - qOrd) < 0.02 || Math.abs(qNote - qOrd) / Math.max(qOrd, 0.001) < 0.02;
    const priceOk = priceClose(ni.unitPrice, oi.pricePerUnit);
    if (!qtyOk) {
      await insertDeliveryNoteIncident(supabase, localId, {
        deliveryNoteId: noteId,
        deliveryNoteItemId: ni.id,
        incidentType: 'qty_diff',
        description: `[auto] Cantidad pedida ${qOrd} ${oi.unit} vs albarán ${qNote} ${ni.unit} · ${ni.supplierProductName}`,
      });
    }
    if (!priceOk) {
      await insertDeliveryNoteIncident(supabase, localId, {
        deliveryNoteId: noteId,
        deliveryNoteItemId: ni.id,
        incidentType: 'price_diff',
        description: `[auto] Precio pedido ${oi.pricePerUnit.toFixed(2)} € vs albarán ${ni.unitPrice?.toFixed(2) ?? '—'} € · ${ni.supplierProductName}`,
      });
    }
  }

  for (const oi of orderItems) {
    if (used.has(oi.id)) continue;
    await insertDeliveryNoteIncident(supabase, localId, {
      deliveryNoteId: noteId,
      incidentType: 'line_unknown',
      description: `[auto] Producto pedido no aparece en el albarán: ${oi.productName} (${qtyOrderedForCompare(oi)} ${oi.unit})`,
    });
  }
}

export async function refreshDeliveryNoteStatusFromIncidents(
  supabase: SupabaseClient,
  localId: string,
  noteId: string,
): Promise<DeliveryNote> {
  const { data: open, error } = await supabase
    .from('delivery_note_incidents')
    .select('id')
    .eq('local_id', localId)
    .eq('delivery_note_id', noteId)
    .eq('status', 'open')
    .limit(1);
  if (error) throw new Error(error.message);
  const hasOpen = (open ?? []).length > 0;
  const { data: noteRow } = await supabase.from('delivery_notes').select('status').eq('id', noteId).eq('local_id', localId).single();
  const cur = (noteRow as { status?: string } | null)?.status;
  let nextStatus: DeliveryNoteStatus | undefined;
  if (hasOpen && cur !== 'archived' && cur !== 'draft') nextStatus = 'with_incidents';
  if (!hasOpen && cur === 'with_incidents') nextStatus = 'pending_review';
  if (nextStatus) {
    return updateDeliveryNote(supabase, localId, noteId, { status: nextStatus });
  }
  const { data: full } = await supabase.from('delivery_notes').select(NOTE_SEL).eq('id', noteId).eq('local_id', localId).single();
  if (!full) throw new Error('Albarán no encontrado.');
  return mapNote(full as NoteRow);
}

export const DELIVERY_NOTE_STATUS_LABEL: Record<DeliveryNoteStatus, string> = {
  draft: 'Borrador',
  ocr_read: 'Leído OCR',
  pending_review: 'Pendiente revisión',
  validated: 'Validado',
  with_incidents: 'Con incidencias',
  archived: 'Archivado',
};

export const DELIVERY_NOTE_INCIDENT_LABEL: Record<DeliveryNoteIncidentType, string> = {
  qty_diff: 'Cantidad distinta',
  price_diff: 'Precio distinto',
  not_ordered: 'No pedido / extra',
  line_unknown: 'Línea no reconocida / falta',
  total_mismatch: 'Total inconsistente',
  incomplete_doc: 'Documento incompleto',
  other: 'Otro',
};
