import { NextResponse } from 'next/server';
import { isAllowedEmail } from '@/lib/auth-access';
import {
  getSharedSnapshot,
  isSupabaseAdminConfigured,
  upsertSharedSnapshot,
  upsertSnapshot,
} from '@/lib/server/supabase-admin';
import type { MermaRecord, Product } from '@/lib/types';

type SyncPayload = {
  email?: string;
  products?: Product[];
  mermas?: MermaRecord[];
};

function normalizeAllowedEmail(value: string | null) {
  const clean = String(value ?? '')
    .trim()
    .toLowerCase();
  return clean && isAllowedEmail(clean) ? clean : null;
}

export async function GET(request: Request) {
  try {
    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'Sync disabled: missing server env vars' });
    }

    const url = new URL(request.url);
    const email = normalizeAllowedEmail(url.searchParams.get('email'));
    if (!email) {
      return NextResponse.json({ ok: false, reason: 'Unauthorized email' }, { status: 401 });
    }

    const shared = await getSharedSnapshot();
    return NextResponse.json({
      ok: true,
      snapshot: shared
        ? {
            products: shared.products,
            mermas: shared.mermas,
            updatedAt: shared.updated_at ?? null,
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!isSupabaseAdminConfigured()) {
      // Allow local development without service-role secrets.
      return NextResponse.json({ ok: true, skipped: true, reason: 'Sync disabled: missing server env vars' });
    }

    const payload = (await request.json()) as SyncPayload;
    const email = normalizeAllowedEmail(String(payload.email ?? ''));
    if (!email) {
      return NextResponse.json({ ok: false, reason: 'Unauthorized email' }, { status: 401 });
    }
    if (!Array.isArray(payload.products) || !Array.isArray(payload.mermas)) {
      return NextResponse.json({ ok: false, reason: 'Invalid payload' }, { status: 400 });
    }

    await upsertSnapshot({
      email,
      products: payload.products,
      mermas: payload.mermas,
    });
    await upsertSharedSnapshot({
      products: payload.products,
      mermas: payload.mermas,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 },
    );
  }
}
