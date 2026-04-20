import type { SupabaseClient } from '@supabase/supabase-js';
import type { MermaMotiveKey, MermaRecord, Product, Unit } from '@/lib/types';

export type ProductRow = {
  id: string;
  name: string;
  unit: string;
  price_per_unit: number;
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
};

/** Filas de merma sin foto (consultas masivas / Finanzas). */
export type MermaRowLean = Pick<MermaRecord, 'id' | 'motiveKey' | 'costEur' | 'occurredAt'>;

export function mapProductRow(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit as Unit,
    pricePerUnit: Number(row.price_per_unit),
    createdAt: row.created_at,
  };
}

function mapShift(raw: string | null | undefined): MermaRecord['shift'] {
  if (raw === 'manana' || raw === 'tarde') return raw;
  return null;
}

export function mapMermaRow(row: MermaRow): MermaRecord {
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
  };
}

export async function fetchProductsAndMermas(supabase: SupabaseClient, localId: string) {
  const { data: productRows, error: pErr } = await supabase
    .from('products')
    .select('id,name,unit,price_per_unit,created_at')
    .eq('local_id', localId)
    .eq('is_active', true)
    .order('name');

  if (pErr) throw new Error(pErr.message);

  const { data: mermaRows, error: mErr } = await supabase
    .from('mermas')
    .select('id,product_id,quantity,motive_key,notes,occurred_at,cost_eur,created_at,shift,optional_user_label')
    .eq('local_id', localId)
    .order('occurred_at', { ascending: false });

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
