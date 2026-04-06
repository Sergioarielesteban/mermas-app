import { NextResponse } from 'next/server';
import { buildAiForecast } from '@/lib/ai-forecast';
import type { MermaRecord, Product } from '@/lib/types';

type ForecastRequest = {
  products: Product[];
  mermas: MermaRecord[];
  limit?: number;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ForecastRequest;
    const products = Array.isArray(body.products) ? body.products : [];
    const mermas = Array.isArray(body.mermas) ? body.mermas : [];
    const limit = typeof body.limit === 'number' ? body.limit : 5;

    const recommendations = buildAiForecast(products, mermas, limit);
    return NextResponse.json({ recommendations });
  } catch {
    return NextResponse.json({ recommendations: [] }, { status: 200 });
  }
}

