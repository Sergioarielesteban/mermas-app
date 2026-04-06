import { NextResponse } from 'next/server';
import { isAllowedEmail } from '@/lib/auth-access';
import { isSupabaseAdminConfigured, upsertSnapshot } from '@/lib/server/supabase-admin';
import type { MermaRecord, Product } from '@/lib/types';

type SyncPayload = {
  email?: string;
  products?: Product[];
  mermas?: MermaRecord[];
};

export async function POST(request: Request) {
  try {
    if (!isSupabaseAdminConfigured()) {
      // Allow local development without service-role secrets.
      return NextResponse.json({ ok: true, skipped: true, reason: 'Sync disabled: missing server env vars' });
    }

    const payload = (await request.json()) as SyncPayload;
    const email = String(payload.email ?? '')
      .trim()
      .toLowerCase();
    if (!email || !isAllowedEmail(email)) {
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
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 },
    );
  }
}
