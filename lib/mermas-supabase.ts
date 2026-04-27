import type { SupabaseClient } from '@supabase/supabase-js';
import type { MermaMotiveKey, MermaRecord, Product, Unit } from '@/lib/types';

export type ProductRow = {
  id: string;
  name: string;
  unit: string;
  price_per_unit: number;
  tipo_origen?: string | null;
  master_article_id?: string | null;
  escandallo_id?: string | null;
  precio_manual?: number | null;
  composicion_json?: unknown;
  created_at: string;
};

export type MermaRow = {
  id: string;
  product_id: string;
  quantity: number;
  motive_key: string;
  notes: string | null;
  occurred_at: string;
  photo_data_url: string | null;
  cost_eur: number;
  created_at: string;
  shift?: string | null;
  optional_user_label?: string | null;
  tipo_origen_usado?: string | null;
  coste_unitario_snapshot?: number | null;
  coste_total_snapshot?: number | null;
  composicion_snapshot_json?: unknown;
};

/** Filas de merma sin foto (consultas masivas / Finanzas). */
export type MermaRowLean = Pick<MermaRecord, 'id' | 'motiveKey' | 'costEur' | 'occurredAt'>;

export function mapProductRow(row: ProductRow): Product {
  const compositionLines = Array.isArray(row.composicion_json)
    ? row.composicion_json
        .map((x) => {
          const r = x as Record<string, unknown>;
          const masterArticleId = typeof r.masterArticleId === 'string' ? r.masterArticleId : '';
          const unit = typeof r.unit === 'string' ? r.unit : '';
          const qtyRaw = Number(r.qty);
          if (!masterArticleId || !unit || !Number.isFinite(qtyRaw) || qtyRaw <= 0) return null;
          return {
            id: typeof r.id === 'string' ? r.id : `${masterArticleId}-${unit}`,
            masterArticleId,
            qty: qtyRaw,
            unit,
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
    : [];
  return {
    id: row.id,
    name: row.name,
    unit: row.unit as Unit,
    pricePerUnit: Number(row.price_per_unit),
    typeOrigin:
      row.tipo_origen === 'manual' || row.tipo_origen === 'master' || row.tipo_origen === 'escandallo' || row.tipo_origen === 'composicion'
        ? row.tipo_origen
        : 'manual',
    masterArticleId: row.master_article_id ?? null,
    escandalloId: row.escandallo_id ?? null,
    manualPricePerUnit:
      row.precio_manual != null && Number.isFinite(Number(row.precio_manual)) ? Number(row.precio_manual) : null,
    compositionLines,
    createdAt: row.created_at,
  };
}

function mapShift(raw: string | null | undefined): MermaRecord['shift'] {
  if (raw === 'manana' || raw === 'tarde') return raw;
  return null;
}

export function mapMermaRow(row: MermaRow): MermaRecord {
  const compositionSnapshot = Array.isArray(row.composicion_snapshot_json)
    ? row.composicion_snapshot_json
        .map((x) => {
          const r = x as Record<string, unknown>;
          const masterArticleId = typeof r.masterArticleId === 'string' ? r.masterArticleId : '';
          const unit = typeof r.unit === 'string' ? r.unit : '';
          const qty = Number(r.qty);
          const unitCost = Number(r.unitCost);
          const lineCost = Number(r.lineCost);
          if (!masterArticleId || !unit || !Number.isFinite(qty) || !Number.isFinite(unitCost) || !Number.isFinite(lineCost)) return null;
          return { masterArticleId, qty, unit, unitCost, lineCost };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
    : [];
  return {
    id: row.id,
    productId: row.product_id,
    quantity: Number(row.quantity),
    motiveKey: row.motive_key as MermaMotiveKey,
    notes: row.notes ?? '',
    occurredAt: row.occurred_at,
    photoDataUrl: row.photo_data_url ?? undefined,
    costEur: Number(row.cost_eur),
    createdAt: row.created_at,
    shift: mapShift(row.shift),
    optionalUserLabel: row.optional_user_label?.trim() || undefined,
    originTypeUsed:
      row.tipo_origen_usado === 'manual' || row.tipo_origen_usado === 'master' || row.tipo_origen_usado === 'escandallo' || row.tipo_origen_usado === 'composicion'
        ? row.tipo_origen_usado
        : row.tipo_origen_usado === 'sin_precio'
          ? 'sin_precio'
          : undefined,
    unitCostSnapshot:
      row.coste_unitario_snapshot != null && Number.isFinite(Number(row.coste_unitario_snapshot))
        ? Number(row.coste_unitario_snapshot)
        : null,
    totalCostSnapshot:
      row.coste_total_snapshot != null && Number.isFinite(Number(row.coste_total_snapshot))
        ? Number(row.coste_total_snapshot)
        : null,
    compositionSnapshot,
  };
}

/** Listado masivo: sin `photo_data_url` (egress). La foto se obtiene con `fetchMermaPhotoDataUrlById`. */
export function mapMermaRowLean(row: Omit<MermaRow, 'photo_data_url'>): MermaRecord {
  return {
    id: row.id,
    productId: row.product_id,
    quantity: Number(row.quantity),
    motiveKey: row.motive_key as MermaMotiveKey,
    notes: row.notes ?? '',
    occurredAt: row.occurred_at,
    costEur: Number(row.cost_eur),
    createdAt: row.created_at,
    shift: mapShift(row.shift),
    optionalUserLabel: row.optional_user_label?.trim() || undefined,
    originTypeUsed:
      row.tipo_origen_usado === 'manual' || row.tipo_origen_usado === 'master' || row.tipo_origen_usado === 'escandallo' || row.tipo_origen_usado === 'composicion'
        ? row.tipo_origen_usado
        : row.tipo_origen_usado === 'sin_precio'
          ? 'sin_precio'
          : undefined,
    unitCostSnapshot:
      row.coste_unitario_snapshot != null && Number.isFinite(Number(row.coste_unitario_snapshot))
        ? Number(row.coste_unitario_snapshot)
        : null,
    totalCostSnapshot:
      row.coste_total_snapshot != null && Number.isFinite(Number(row.coste_total_snapshot))
        ? Number(row.coste_total_snapshot)
        : null,
  };
}

export async function fetchProductsAndMermas(supabase: SupabaseClient, localId: string) {
  let productRows: ProductRow[] | null = null;
  let pErr: { message: string } | null = null;
  try {
    const q = await supabase
      .from('products')
      .select('id,name,unit,price_per_unit,tipo_origen,master_article_id,escandallo_id,precio_manual,composicion_json,created_at')
      .eq('local_id', localId)
      .eq('is_active', true)
      .order('name');
    productRows = (q.data ?? null) as ProductRow[] | null;
    pErr = q.error;
  } catch {
    pErr = { message: 'fallback' };
  }
  if (pErr) {
    const fallback = await supabase
      .from('products')
      .select('id,name,unit,price_per_unit,created_at')
      .eq('local_id', localId)
      .eq('is_active', true)
      .order('name');
    productRows = (fallback.data ?? null) as ProductRow[] | null;
    pErr = fallback.error;
  }

  if (pErr) throw new Error(pErr.message);

  let mermaRows: Omit<MermaRow, 'photo_data_url'>[] | null = null;
  let mErr: { message: string } | null = null;
  try {
    const q = await supabase
      .from('mermas')
      .select('id,product_id,quantity,motive_key,notes,occurred_at,cost_eur,created_at,shift,optional_user_label,tipo_origen_usado,coste_unitario_snapshot,coste_total_snapshot,composicion_snapshot_json')
      .eq('local_id', localId)
      .order('occurred_at', { ascending: false });
    mermaRows = (q.data ?? null) as Omit<MermaRow, 'photo_data_url'>[] | null;
    mErr = q.error;
  } catch {
    mErr = { message: 'fallback' };
  }
  if (mErr) {
    const fallback = await supabase
      .from('mermas')
      .select('id,product_id,quantity,motive_key,notes,occurred_at,cost_eur,created_at,shift,optional_user_label')
      .eq('local_id', localId)
      .order('occurred_at', { ascending: false });
    mermaRows = (fallback.data ?? null) as Omit<MermaRow, 'photo_data_url'>[] | null;
    mErr = fallback.error;
  }

  if (mErr) throw new Error(mErr.message);

  const products = (productRows ?? []).map((r) => mapProductRow(r as ProductRow));
  const mermas = (mermaRows ?? []).map((r) => mapMermaRowLean(r as Omit<MermaRow, 'photo_data_url'>));
  return { products, mermas };
}

/** Una sola columna de foto (detalle / bajo demanda). */
export async function fetchMermaPhotoDataUrlById(
  supabase: SupabaseClient,
  localId: string,
  mermaId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('mermas')
    .select('photo_data_url')
    .eq('local_id', localId)
    .eq('id', mermaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const raw = data?.photo_data_url;
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/** Finanzas / agregados: solo campos necesarios y acotado al rango de fechas (occurred_at). */
export async function fetchMermasForFinanzasRange(
  supabase: SupabaseClient,
  localId: string,
  occurredFromYmd: string,
  occurredToYmd: string,
): Promise<MermaRowLean[]> {
  const fromIso = `${occurredFromYmd}T00:00:00.000Z`;
  const toIso = `${occurredToYmd}T23:59:59.999Z`;
  const { data, error } = await supabase
    .from('mermas')
    .select('id,motive_key,cost_eur,occurred_at')
    .eq('local_id', localId)
    .gte('occurred_at', fromIso)
    .lte('occurred_at', toIso);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String((r as { id: string }).id),
    motiveKey: String((r as { motive_key: string }).motive_key) as MermaMotiveKey,
    costEur: Number((r as { cost_eur: number }).cost_eur),
    occurredAt: String((r as { occurred_at: string }).occurred_at),
  }));
}
