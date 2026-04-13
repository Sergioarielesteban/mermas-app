-- Permite vaciar mensajes del chat SOLO del local actual
-- Ejecutar en Supabase SQL Editor (si quieres usar botón "Eliminar chat")

drop policy if exists "local_chat_messages delete same local" on public.local_chat_messages;
create policy "local_chat_messages delete same local"
on public.local_chat_messages
for delete
to authenticated
using (local_id = public.current_local_id());
