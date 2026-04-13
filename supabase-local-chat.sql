-- =============================================================================
-- Chat interno por local (mismo local_id = mismo hilo)
-- =============================================================================
-- Ejecutar en Supabase SQL Editor DESPUÉS de supabase-multilocal-schema.sql
-- (necesita public.locals, public.profiles, public.current_local_id()).
--
-- Añade también la tabla a supabase_realtime (supabase-realtime-publication.sql).
-- =============================================================================

create table if not exists public.local_chat_messages (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  author_label text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint local_chat_messages_body_len check (
    char_length(trim(body)) >= 1
    and char_length(body) <= 4000
  )
);

create index if not exists idx_local_chat_messages_local_created
  on public.local_chat_messages (local_id, created_at desc);

comment on table public.local_chat_messages is 'Mensajes de chat solo visibles para usuarios del mismo local.';

-- Rellena local_id, user_id y author_label desde el perfil (sin confiar en el cliente).
create or replace function public.local_chat_messages_before_insert()
returns trigger
language plpgsql
as $$
declare
  v_label text;
begin
  if auth.uid() is null then
    raise exception 'local_chat_messages: no autenticado';
  end if;
  new.user_id := auth.uid();
  new.local_id := public.current_local_id();
  if new.local_id is null then
    raise exception 'local_chat_messages: perfil sin local';
  end if;
  select coalesce(nullif(trim(p.full_name), ''), p.email, 'Usuario')
 into v_label
  from public.profiles p
  where p.user_id = auth.uid();
  new.author_label := coalesce(v_label, 'Usuario');
  return new;
end;
$$;

drop trigger if exists trg_local_chat_messages_bi on public.local_chat_messages;
create trigger trg_local_chat_messages_bi
before insert on public.local_chat_messages
for each row execute procedure public.local_chat_messages_before_insert();

alter table public.local_chat_messages enable row level security;

drop policy if exists "local_chat_messages select same local" on public.local_chat_messages;
create policy "local_chat_messages select same local"
on public.local_chat_messages
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "local_chat_messages insert same local" on public.local_chat_messages;
create policy "local_chat_messages insert same local"
on public.local_chat_messages
for insert
to authenticated
with check (
  local_id = public.current_local_id()
  and user_id = auth.uid()
);
