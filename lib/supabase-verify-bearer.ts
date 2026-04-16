import { createClient } from '@supabase/supabase-js';

export type BearerAuthResult =
  | { ok: true; userId: string }
  | { ok: false; message: string; status: number };

export async function verifySupabaseBearer(request: Request): Promise<BearerAuthResult> {
  const auth = request.headers.get('authorization');
  const jwt = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!jwt) {
    return { ok: false, message: 'No autorizado.', status: 401 };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { ok: false, message: 'Supabase no configurado en el servidor.', status: 500 };
  }
  const supabase = createClient(url, anon);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(jwt);
  if (error || !user) {
    return { ok: false, message: 'Sesión no válida.', status: 401 };
  }
  return { ok: true, userId: user.id };
}
