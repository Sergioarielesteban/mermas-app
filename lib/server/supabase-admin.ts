import type { MermaRecord, Product } from '@/lib/types';

type SnapshotRow = {
  email: string;
  products: Product[];
  mermas: MermaRecord[];
  updated_at?: string;
};
const SHARED_SNAPSHOT_KEY = 'local-shared@mermas.app';

function resolveSupabaseUrl() {
  const serverUrl = process.env.SUPABASE_URL?.trim() ?? '';
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  if (serverUrl.startsWith('http://') || serverUrl.startsWith('https://')) return serverUrl;
  if (publicUrl.startsWith('http://') || publicUrl.startsWith('https://')) return publicUrl;
  return '';
}

const SUPABASE_URL = resolveSupabaseUrl();
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseAdminConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function getHeaders() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase env vars.');
  }
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

function baseUrl(path: string) {
  return `${SUPABASE_URL}/rest/v1/${path}`;
}

export async function upsertSnapshot(input: { email: string; products: Product[]; mermas: MermaRecord[] }) {
  const response = await fetch(baseUrl('mermas_snapshots'), {
    method: 'POST',
    headers: {
      ...getHeaders(),
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify([
      {
        email: input.email.toLowerCase(),
        products: input.products,
        mermas: input.mermas,
        updated_at: new Date().toISOString(),
      },
    ]),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase upsert failed: ${body}`);
  }
}

export async function getSnapshotByEmail(email: string): Promise<SnapshotRow | null> {
  const query = `mermas_snapshots?email=eq.${encodeURIComponent(email.toLowerCase())}&select=email,products,mermas,updated_at&limit=1`;
  const response = await fetch(baseUrl(query), {
    headers: getHeaders(),
    method: 'GET',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase read failed: ${body}`);
  }

  const rows = (await response.json()) as SnapshotRow[];
  return rows[0] ?? null;
}

export async function upsertSharedSnapshot(input: { products: Product[]; mermas: MermaRecord[] }) {
  await upsertSnapshot({
    email: SHARED_SNAPSHOT_KEY,
    products: input.products,
    mermas: input.mermas,
  });
}

export async function getSharedSnapshot(): Promise<SnapshotRow | null> {
  return getSnapshotByEmail(SHARED_SNAPSHOT_KEY);
}
