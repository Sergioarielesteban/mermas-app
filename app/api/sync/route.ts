import { NextResponse } from 'next/server';
import { isAllowedEmail } from '@/lib/auth-access';
import { verifySupabaseBearer } from '@/lib/supabase-verify-bearer';
import {
  getSnapshotByEmail,
  isSupabaseAdminConfigured,
  upsertSnapshot,
} from '@/lib/server/supabase-admin';
import type { MermaRecord, Product } from '@/lib/types';

type SyncPayload = {
  products?: Product[];
  mermas?: MermaRecord[];
};

type SyncUserResult =
  | { ok: true; email: string }
  | { ok: false; message: string; status: number };

async function resolveSyncUser(request: Request): Promise<SyncUserResult> {
  const auth = await verifySupabaseBearer(request);
  if (!auth.ok) {
    return { ok: false, message: auth.message, status: auth.status };
  }
  const email = (auth.email ?? '').trim().toLowerCase();
  if (!email) {
    return { ok: false, message: 'Usuario sin email.', status: 403 };
  }
  if (!isAllowedEmail(email)) {
    return { ok: false, message: 'Unauthorized email', status: 401 };
  }
  return { ok: true, email };
}

export async function GET(request: Request) {
  try {
    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'Sync disabled: missing server env vars' });
    }

    const user = await resolveSyncUser(request);
    if (!user.ok) {
      return NextResponse.json({ ok: false, reason: user.message }, { status: user.status });
    }

    const row = await getSnapshotByEmail(user.email);
    return NextResponse.json({
      ok: true,
      snapshot: row
        ? {
            products: row.products,
            mermas: row.mermas,
            updatedAt: row.updated_at ?? null,
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

    const user = await resolveSyncUser(request);
    if (!user.ok) {
      return NextResponse.json({ ok: false, reason: user.message }, { status: user.status });
    }

    const payload = (await request.json()) as SyncPayload;
    if (!Array.isArray(payload.products) || !Array.isArray(payload.mermas)) {
      return NextResponse.json({ ok: false, reason: 'Invalid payload' }, { status: 400 });
    }

    await upsertSnapshot({
      email: user.email,
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
