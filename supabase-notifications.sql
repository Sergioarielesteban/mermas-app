-- =============================================================================
-- Chef-One: notificaciones por local + lecturas por usuario + dispositivos (push)
-- Ejecutar en Supabase SQL Editor después de multilocal (profiles.current_local_id).
-- Luego: añadir `notifications` a supabase_realtime (ver supabase-realtime-publication.sql).
-- =============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  type text not null,
  severity text not null default 'info'
    check (severity in ('info', 'warning', 'critical')),
  title text not null,
  message text not null,
  created_by uuid references auth.users(id) on delete set null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_local_created
  on public.notifications (local_id, created_at desc);

comment on table public.notifications is 'Eventos del local visibles para todos los usuarios del mismo local; lectura individual en notification_reads.';

create table if not exists public.notification_reads (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (notification_id, user_id)
);

create index if not exists idx_notification_reads_user
  on public.notification_reads (user_id, read_at desc);

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id uuid not null references public.locals(id) on delete cascade,
  device_type text,
  push_token text,
  platform text,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_devices_user_local
  on public.user_devices (user_id, local_id);

-- Preferencias futuras (por usuario y tipo de evento)
create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (user_id, event_type)
);

drop trigger if exists trg_user_devices_updated_at on public.user_devices;
create trigger trg_user_devices_updated_at
before update on public.user_devices
for each row execute procedure public.set_updated_at();

alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;
alter table public.user_devices enable row level security;
alter table public.notification_preferences enable row level security;

-- notifications: mismo local que el perfil
drop policy if exists notifications_select_local on public.notifications;
create policy notifications_select_local on public.notifications
for select to authenticated
using (local_id = public.current_local_id());

drop policy if exists notifications_insert_local on public.notifications;
create policy notifications_insert_local on public.notifications
for insert to authenticated
with check (local_id = public.current_local_id());

-- notification_reads: solo el propio usuario; notificación del mismo local
drop policy if exists notification_reads_select_own on public.notification_reads;
create policy notification_reads_select_own on public.notification_reads
for select to authenticated
using (user_id = auth.uid());

drop policy if exists notification_reads_insert_own on public.notification_reads;
create policy notification_reads_insert_own on public.notification_reads
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.notifications n
    where n.id = notification_id and n.local_id = public.current_local_id()
  )
);

drop policy if exists notification_reads_update_own on public.notification_reads;
create policy notification_reads_update_own on public.notification_reads
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- user_devices
drop policy if exists user_devices_select_own on public.user_devices;
create policy user_devices_select_own on public.user_devices
for select to authenticated
using (user_id = auth.uid() and local_id = public.current_local_id());

drop policy if exists user_devices_upsert_own on public.user_devices;
create policy user_devices_upsert_own on public.user_devices
for insert to authenticated
with check (user_id = auth.uid() and local_id = public.current_local_id());

drop policy if exists user_devices_update_own on public.user_devices;
create policy user_devices_update_own on public.user_devices
for update to authenticated
using (user_id = auth.uid() and local_id = public.current_local_id())
with check (user_id = auth.uid() and local_id = public.current_local_id());

drop policy if exists user_devices_delete_own on public.user_devices;
create policy user_devices_delete_own on public.user_devices
for delete to authenticated
using (user_id = auth.uid() and local_id = public.current_local_id());

-- notification_preferences
drop policy if exists notification_preferences_all_own on public.notification_preferences;
create policy notification_preferences_all_own on public.notification_preferences
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Marcar todas como leídas en el local actual (evita N round-trips)
create or replace function public.mark_all_notifications_read_for_local()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.notification_reads (notification_id, user_id, read_at)
  select n.id, auth.uid(), now()
  from public.notifications n
  where n.local_id = public.current_local_id()
  and not exists (
    select 1 from public.notification_reads r
    where r.notification_id = n.id and r.user_id = auth.uid()
  );
end;
$$;

revoke all on function public.mark_all_notifications_read_for_local() from public;
grant execute on function public.mark_all_notifications_read_for_local() to authenticated;
