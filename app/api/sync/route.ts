/**
 * Snapshot legacy (service role): lectura/escritura acotada al email del JWT.
 */
import { NextResponse } from 'next/server';
import { requireAllowedSupabaseUser } from '@/lib/require-allowed-supabase-user';
import { logCriticalAndGeneric } from '@/lib/server/api-safe';
import { readJsonBodyLimitedEx } from '@/lib/server/read-json-limited';
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

const MAX_POST_BYTES = 12 * 1024 * 1024;

export async function GET(request: Request) {
  try {
    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'Sync disabled: missing server env vars' });
    }

    const user = await requireAllowedSupabaseUser(request);
    if (!user.ok) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: user.status });
    }

    const row = await getSnapshotByEmail(user.email);
    return NextResponse.json({
      ok: true,
      snapshot: row
        ? {
            products: row.products,
            mermas: [],
            updatedAt: row.updated_at ?? null,
          }
        : null,
    });
  } catch (err) {
    return logCriticalAndGeneric('GET /api/sync', err);
  }
}

export async function POST(request: Request) {
  try {
    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'Sync disabled: missing server env vars' });
    }

    const user = await requireAllowedSupabaseUser(request);
    if (!user.ok) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: user.status });
    }

    const raw = await readJsonBodyLimitedEx(request, MAX_POST_BYTES);
    if (!raw.ok) {
      return NextResponse.json(
        { ok: false, error: 'Request failed' },
        { status: raw.kind === 'too_large' ? 413 : 400 },
      );
    }
    const payload = raw.data as SyncPayload;
    if (!Array.isArray(payload.products) || !Array.isArray(payload.mermas)) {
      return NextResponse.json({ ok: false, error: 'Request failed' }, { status: 400 });
    }

    await upsertSnapshot({
      email: user.email,
      products: payload.products,
      mermas: payload.mermas,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return logCriticalAndGeneric('POST /api/sync', err);
  }
}
