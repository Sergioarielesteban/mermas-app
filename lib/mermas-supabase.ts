import type { SupabaseClient } from '@supabase/supabase-js';
import type { MermaMotiveKey, MermaRecord, Product, Unit } from '@/lib/types';

type ProductRow = {
  id: string;
  name: string;
  unit: string;
  price_per_unit: number;
  created_at: string;
};

type MermaRow = {
  id: string;
  product_id: string;
  quantity: number;
  motive_key: string;
  notes: string | null;
  occurred_at: string;
  photo_data_url: string | null;
  cost_eur: number;
  created_at: string;
};

export function mapProductRow(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit as Unit,
    pricePerUnit: Number(row.price_per_unit),
    createdAt: row.created_at,
  };
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
  };
}

export async function fetchProductsAndMermas(supabase: SupabaseClient) {
  const { data: productRows, error: pErr } = await supabase
    .from('products')
    .select('id,name,unit,price_per_unit,created_at')
    .eq('is_active', true)
    .order('name');

  if (pErr) throw new Error(pErr.message);

  const { data: mermaRows, error: mErr } = await supabase
    .from('mermas')
    .select('id,product_id,quantity,motive_key,notes,occurred_at,photo_data_url,cost_eur,created_at')
    .order('occurred_at', { ascending: false });

  if (mErr) throw new Error(mErr.message);

  const products = (productRows ?? []).map((r) => mapProductRow(r as ProductRow));
  const mermas = (mermaRows ?? []).map((r) => mapMermaRow(r as MermaRow));
  return { products, mermas };
}
