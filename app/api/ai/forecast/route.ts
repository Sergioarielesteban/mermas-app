import { NextResponse } from 'next/server';
import { buildAiForecast } from '@/lib/ai-forecast';
import { requireAllowedSupabaseUser } from '@/lib/require-allowed-supabase-user';
import type { MermaRecord, Product } from '@/lib/types';

type ForecastRequest = {
  products: Product[];
  mermas: MermaRecord[];
  limit?: number;
};

const MAX_PRODUCTS = 800;
const MAX_MERMAS = 20_000;
const MAX_LIMIT = 25;

export async function POST(request: Request) {
  const auth = await requireAllowedSupabaseUser(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, reason: auth.message }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as ForecastRequest;
    const products = Array.isArray(body.products) ? body.products.slice(0, MAX_PRODUCTS) : [];
    const mermas = Array.isArray(body.mermas) ? body.mermas.slice(0, MAX_MERMAS) : [];
    const rawLimit = typeof body.limit === 'number' ? body.limit : 5;
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(rawLimit)));

    const recommendations = buildAiForecast(products, mermas, limit);
    return NextResponse.json({ recommendations });
  } catch {
    return NextResponse.json({ recommendations: [] }, { status: 200 });
  }
}
