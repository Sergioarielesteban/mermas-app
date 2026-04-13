import type { SupabaseClient } from '@supabase/supabase-js';

export type LocalChatMessage = {
  id: string;
  local_id: string;
  user_id: string;
  author_label: string;
  body: string;
  created_at: string;
};

const DEFAULT_PAGE = 200;

export async function fetchLocalChatMessages(
  supabase: SupabaseClient,
  localId: string,
  limit = DEFAULT_PAGE,
): Promise<LocalChatMessage[]> {
  const { data, error } = await supabase
    .from('local_chat_messages')
    .select('id,local_id,user_id,author_label,body,created_at')
    .eq('local_id', localId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as LocalChatMessage[];
  return rows.slice().reverse();
}

/** Inserta solo el cuerpo; el trigger asigna local_id, user_id y author_label. */
export async function insertLocalChatMessage(
  supabase: SupabaseClient,
  body: string,
): Promise<LocalChatMessage> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Escribe un mensaje.');
  if (trimmed.length > 4000) throw new Error('El mensaje es demasiado largo (máx. 4000 caracteres).');
  const { data, error } = await supabase
    .from('local_chat_messages')
    .insert({ body: trimmed })
    .select('id,local_id,user_id,author_label,body,created_at')
    .single();
  if (error) throw new Error(error.message);
  return data as LocalChatMessage;
}
