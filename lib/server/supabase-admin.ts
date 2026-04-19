import type { MermaRecord, Product } from '@/lib/types';

type SnapshotRow = {
  email: string;
  products: Product[];
  mermas: MermaRecord[];
  updated_at?: string;
};

export type ProfileAccessRow = {
  local_id: string;
  role: string;
  is_active: boolean;
};

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

function authBaseUrl(path: string) {
  return `${SUPABASE_URL}/auth/v1/${path}`;
}

async function readErrorBody(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return '';
  try {
    const parsed = JSON.parse(text) as { message?: unknown; msg?: unknown; error_description?: unknown };
    const message =
      (typeof parsed.message === 'string' && parsed.message) ||
      (typeof parsed.msg === 'string' && parsed.msg) ||
      (typeof parsed.error_description === 'string' && parsed.error_description) ||
      text;
    return String(message);
  } catch {
    return text;
  }
}

/** GET al REST de Supabase con service role (solo servidor). */
export async function adminRestGet<T>(pathAndQuery: string): Promise<T> {
  const response = await fetch(baseUrl(pathAndQuery), {
    method: 'GET',
    headers: getHeaders(),
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase admin GET failed: ${response.status} ${body}`);
  }
  return (await response.json()) as T;
}

/** POST una fila JSON (array de un elemento si la tabla lo espera). */
export async function adminRestPost(path: string, body: unknown): Promise<void> {
  const response = await fetch(baseUrl(path), {
    method: 'POST',
    headers: {
      ...getHeaders(),
      Prefer: 'return=minimal',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await readErrorBody(response);
    throw new Error(`Supabase admin POST failed: ${response.status} ${text}`);
  }
}

/** POST a RPC/endpoint y devuelve JSON del body. */
export async function adminRestPostJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(baseUrl(path), {
    method: 'POST',
    headers: {
      ...getHeaders(),
      Prefer: 'return=representation',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await readErrorBody(response);
    throw new Error(`Supabase admin POST failed: ${response.status} ${text}`);
  }
  return (await response.json()) as T;
}

/** DELETE en REST de Supabase con service role. */
export async function adminRestDelete(pathAndQuery: string): Promise<void> {
  const response = await fetch(baseUrl(pathAndQuery), {
    method: 'DELETE',
    headers: {
      ...getHeaders(),
      Prefer: 'return=minimal',
    },
  });
  if (!response.ok) {
    const text = await readErrorBody(response);
    throw new Error(`Supabase admin DELETE failed: ${response.status} ${text}`);
  }
}

/** PATCH en REST de Supabase con service role. */
export async function adminRestPatch<T>(pathAndQuery: string, body: unknown): Promise<T> {
  const response = await fetch(baseUrl(pathAndQuery), {
    method: 'PATCH',
    headers: {
      ...getHeaders(),
      Prefer: 'return=representation',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await readErrorBody(response);
    throw new Error(`Supabase admin PATCH failed: ${response.status} ${text}`);
  }
  return (await response.json()) as T;
}

export type AdminCreatedAuthUser = {
  id: string;
  email: string;
};

export async function adminCreateAuthUser(input: {
  email: string;
  password: string;
}): Promise<AdminCreatedAuthUser> {
  const response = await fetch(authBaseUrl('admin/users'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      email_confirm: true,
    }),
  });
  if (!response.ok) {
    const text = await readErrorBody(response);
    throw new Error(`Supabase auth admin create failed: ${response.status} ${text}`);
  }
  const data = (await response.json()) as { id?: unknown; email?: unknown };
  const id = typeof data.id === 'string' ? data.id : '';
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (!id || !email) throw new Error('Supabase auth admin create failed: invalid response');
  return { id, email };
}

export async function adminDeleteAuthUser(userId: string): Promise<void> {
  const response = await fetch(authBaseUrl(`admin/users/${encodeURIComponent(userId)}`), {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!response.ok) {
    const text = await readErrorBody(response);
    throw new Error(`Supabase auth admin delete failed: ${response.status} ${text}`);
  }
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
        // Las mermas son datos operativos por local (tabla public.mermas + RLS). No replicar por email.
        mermas: [],
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

/** Resuelve alias/email de login vía RPC usando service-role (evita exponer RPC a anon). */
export async function resolveLoginEmailWithServiceRole(loginIdentifier: string): Promise<string | null> {
  const normalized = loginIdentifier.trim().toLowerCase();
  if (!normalized) return null;
  const out = await adminRestPostJson<string | null>('rpc/resolve_login_email', {
    login_identifier: normalized,
  });
  if (typeof out !== 'string') return null;
  const email = out.trim().toLowerCase();
  return email || null;
}

export async function getProfileAccessByUserId(userId: string): Promise<ProfileAccessRow | null> {
  const uid = userId.trim();
  if (!uid) return null;
  const query = `profiles?user_id=eq.${encodeURIComponent(uid)}&select=local_id,role,is_active&limit=1`;
  const rows = await adminRestGet<ProfileAccessRow[]>(query);
  return rows[0] ?? null;
}

export async function insertMarketingLead(input: {
  name: string | null;
  email: string;
  phone: string | null;
  restaurantName: string | null;
  message: string | null;
  source?: string;
}): Promise<void> {
  if (!isSupabaseAdminConfigured()) {
    throw new Error('Supabase admin not configured');
  }
  const response = await fetch(baseUrl('marketing_leads'), {
    method: 'POST',
    headers: {
      ...getHeaders(),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify([
      {
        name: input.name?.trim() || null,
        email: input.email.trim().toLowerCase(),
        phone: input.phone?.trim() || null,
        restaurant_name: input.restaurantName?.trim() || null,
        message: input.message?.trim() || null,
        source: input.source ?? 'chef-one-landing',
      },
    ]),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`marketing_leads insert failed: ${body}`);
  }
}
