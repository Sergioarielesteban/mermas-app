-- Módulo Servicio (platos, plan del día, producción, storage).
-- Requiere: public.locals, public.profiles, public.current_local_id(), public.set_updated_at(),
--           public.staff_is_manager_or_admin() (supabase-staff-attendance-schema.sql o equivalente).

-- ---------------------------------------------------------------------------
-- 1) Tablas
-- ---------------------------------------------------------------------------

create table if not exists public.servicio_platos (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals (id) on delete restrict,
  nombre text not null,
  slug text,
  categoria text not null default 'otros' check (categoria in ('entrante', 'principal', 'postre', 'otros')),
  descripcion_corta text not null default '',
  imagen_url text,
  raciones_base integer not null default 1 check (raciones_base >= 0),
  tiempo_total_min integer not null default 0 check (tiempo_total_min >= 0),
  dificultad text not null default 'facil' check (dificultad in ('facil', 'media', 'alta')),
  coste_por_racion numeric(12, 4),
  pvp_sugerido numeric(12, 4),
  margen_bruto numeric(12, 4),
  activo boolean not null default true,
  favorito boolean not null default false,
  orden_visual integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_servicio_platos_local on public.servicio_platos (local_id);
create index if not exists idx_servicio_platos_local_activo on public.servicio_platos (local_id, activo);

create unique index if not exists servicio_platos_local_slug_unique
  on public.servicio_platos (local_id, slug)
  where slug is not null and length(trim(slug)) > 0;

drop trigger if exists trg_servicio_platos_updated_at on public.servicio_platos;
create trigger trg_servicio_platos_updated_at
before update on public.servicio_platos
for each row execute procedure public.set_updated_at();

create table if not exists public.servicio_plato_pasos (
  id uuid primary key default gen_random_uuid(),
  plato_id uuid not null references public.servicio_platos (id) on delete cascade,
  orden integer not null default 0 check (orden >= 0),
  titulo text not null default '',
  descripcion_corta text not null default '',
  imagen_url text,
  tiempo_min integer check (tiempo_min is null or tiempo_min >= 0)
);

create index if not exists idx_servicio_plato_pasos_plato on public.servicio_plato_pasos (plato_id);

create table if not exists public.servicio_plato_ingredientes (
  id uuid primary key default gen_random_uuid(),
  plato_id uuid not null references public.servicio_platos (id) on delete cascade,
  nombre_ingrediente text not null,
  cantidad numeric(14, 4) not null default 0,
  unidad text not null default '',
  observaciones text,
  orden integer not null default 0
);

create index if not exists idx_servicio_plato_ing_plato on public.servicio_plato_ingredientes (plato_id);

create table if not exists public.servicio_plato_alergenos (
  id uuid primary key default gen_random_uuid(),
  plato_id uuid not null references public.servicio_platos (id) on delete cascade,
  alergeno_key text not null,
  unique (plato_id, alergeno_key)
);

create index if not exists idx_servicio_plato_alerg_plato on public.servicio_plato_alergenos (plato_id);

create table if not exists public.servicio_plan_dia (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals (id) on delete restrict,
  fecha date not null,
  plato_id uuid not null references public.servicio_platos (id) on delete restrict,
  categoria text not null check (categoria in ('entrante', 'principal', 'postre', 'otros')),
  raciones_previstas integer not null default 1 check (raciones_previstas > 0),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_preparacion', 'listo')),
  orden integer not null default 0
);

create unique index if not exists servicio_plan_dia_local_fecha_plato
  on public.servicio_plan_dia (local_id, fecha, plato_id);

create index if not exists idx_servicio_plan_dia_local_fecha on public.servicio_plan_dia (local_id, fecha);

create table if not exists public.servicio_produccion (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals (id) on delete restrict,
  fecha date not null,
  texto_tarea text not null,
  cantidad numeric(14, 4),
  unidad text not null default '',
  completado boolean not null default false,
  orden integer not null default 0,
  origen text not null default 'manual' check (origen in ('manual', 'plato', 'sistema'))
);

create index if not exists idx_servicio_produccion_local_fecha on public.servicio_produccion (local_id, fecha);

-- ---------------------------------------------------------------------------
-- 2) RLS
-- ---------------------------------------------------------------------------

alter table public.servicio_platos enable row level security;
alter table public.servicio_plato_pasos enable row level security;
alter table public.servicio_plato_ingredientes enable row level security;
alter table public.servicio_plato_alergenos enable row level security;
alter table public.servicio_plan_dia enable row level security;
alter table public.servicio_produccion enable row level security;

-- servicio_platos
drop policy if exists "servicio platos select local" on public.servicio_platos;
create policy "servicio platos select local"
on public.servicio_platos for select to authenticated
using (local_id = public.current_local_id());

drop policy if exists "servicio platos insert manager" on public.servicio_platos;
create policy "servicio platos insert manager"
on public.servicio_platos for insert to authenticated
with check (local_id = public.current_local_id() and public.staff_is_manager_or_admin());

drop policy if exists "servicio platos update manager" on public.servicio_platos;
create policy "servicio platos update manager"
on public.servicio_platos for update to authenticated
using (local_id = public.current_local_id() and public.staff_is_manager_or_admin())
with check (local_id = public.current_local_id() and public.staff_is_manager_or_admin());

drop policy if exists "servicio platos delete manager" on public.servicio_platos;
create policy "servicio platos delete manager"
on public.servicio_platos for delete to authenticated
using (local_id = public.current_local_id() and public.staff_is_manager_or_admin());

-- hijos: mismo local vía plato
drop policy if exists "servicio pasos select" on public.servicio_plato_pasos;
create policy "servicio pasos select"
on public.servicio_plato_pasos for select to authenticated
using (
  exists (select 1 from public.servicio_platos p where p.id = plato_id and p.local_id = public.current_local_id())
);

drop policy if exists "servicio pasos write manager" on public.servicio_plato_pasos;
create policy "servicio pasos write manager"
on public.servicio_plato_pasos for all to authenticated
using (
  exists (select 1 from public.servicio_platos p where p.id = plato_id and p.local_id = public.current_local_id())
  and public.staff_is_manager_or_admin()
)
with check (
  exists (select 1 from public.servicio_platos p where p.id = plato_id and p.local_id = public.current_local_id())
  and public.staff_is_manager_or_admin()
);

drop policy if exists "servicio ing select" on public.servicio_plato_ingredientes;
create policy "servicio ing select"
on public.servicio_plato_ingredientes for select to authenticated
using (
  exists (select 1 from public.servicio_platos p where p.id = plato_id and p.local_id = public.current_local_id())
);

drop policy if exists "servicio ing write manager" on public.servicio_plato_ingredientes;
create policy "servicio ing write manager"
on public.servicio_plato_ingredientes for all to authenticated
using (
  exists (select 1 from public.servicio_platos p where p.id = plato_id and p.local_id = public.current_local_id())
  and public.staff_is_manager_or_admin()
)
with check (
  exists (select 1 from public.servicio_platos p where p.id = plato_id and p.local_id = public.current_local_id())
  and public.staff_is_manager_or_admin()
);

drop policy if exists "servicio alerg select" on public.servicio_plato_alergenos;
create policy "servicio alerg select"
on public.servicio_plato_alergenos for select to authenticated
using (
  exists (select 1 from public.servicio_platos p where p.id = plato_id and p.local_id = public.current_local_id())
);

drop policy if exists "servicio alerg write manager" on public.servicio_plato_alergenos;
create policy "servicio alerg write manager"
on public.servicio_plato_alergenos for all to authenticated
using (
  exists (select 1 from public.servicio_platos p where p.id = plato_id and p.local_id = public.current_local_id())
  and public.staff_is_manager_or_admin()
)
with check (
  exists (select 1 from public.servicio_platos p where p.id = plato_id and p.local_id = public.current_local_id())
  and public.staff_is_manager_or_admin()
);

-- plan día
drop policy if exists "servicio plan select" on public.servicio_plan_dia;
create policy "servicio plan select"
on public.servicio_plan_dia for select to authenticated
using (local_id = public.current_local_id());

drop policy if exists "servicio plan write manager" on public.servicio_plan_dia;
create policy "servicio plan write manager"
on public.servicio_plan_dia for all to authenticated
using (local_id = public.current_local_id() and public.staff_is_manager_or_admin())
with check (local_id = public.current_local_id() and public.staff_is_manager_or_admin());

-- producción: lectura local; alta/baja/edición texto solo manager; marcar hecho cualquier usuario del local
drop policy if exists "servicio prod select" on public.servicio_produccion;
create policy "servicio prod select"
on public.servicio_produccion for select to authenticated
using (local_id = public.current_local_id());

drop policy if exists "servicio prod insert manager" on public.servicio_produccion;
create policy "servicio prod insert manager"
on public.servicio_produccion for insert to authenticated
with check (local_id = public.current_local_id() and public.staff_is_manager_or_admin());

drop policy if exists "servicio prod delete manager" on public.servicio_produccion;
create policy "servicio prod delete manager"
on public.servicio_produccion for delete to authenticated
using (local_id = public.current_local_id() and public.staff_is_manager_or_admin());

drop policy if exists "servicio prod update manager" on public.servicio_produccion;
create policy "servicio prod update manager"
on public.servicio_produccion for update to authenticated
using (local_id = public.current_local_id() and public.staff_is_manager_or_admin())
with check (local_id = public.current_local_id() and public.staff_is_manager_or_admin());

drop policy if exists "servicio prod update checklist local" on public.servicio_produccion;
create policy "servicio prod update checklist local"
on public.servicio_produccion for update to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

-- ---------------------------------------------------------------------------
-- 3) Storage (público lectura; escritura solo manager)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'servicio-media',
  'servicio-media',
  true,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "servicio media public read" on storage.objects;
create policy "servicio media public read"
on storage.objects for select to anon, authenticated
using (bucket_id = 'servicio-media');

drop policy if exists "servicio media insert auth manager" on storage.objects;
create policy "servicio media insert auth manager"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'servicio-media'
  and (storage.foldername (name))[1] = public.current_local_id ()::text
  and public.staff_is_manager_or_admin()
);

drop policy if exists "servicio media update auth manager" on storage.objects;
create policy "servicio media update auth manager"
on storage.objects for update to authenticated
using (
  bucket_id = 'servicio-media'
  and (storage.foldername (name))[1] = public.current_local_id ()::text
  and public.staff_is_manager_or_admin()
)
with check (
  bucket_id = 'servicio-media'
  and (storage.foldername (name))[1] = public.current_local_id ()::text
  and public.staff_is_manager_or_admin()
);

drop policy if exists "servicio media delete auth manager" on storage.objects;
create policy "servicio media delete auth manager"
on storage.objects for delete to authenticated
using (
  bucket_id = 'servicio-media'
  and (storage.foldername (name))[1] = public.current_local_id ()::text
  and public.staff_is_manager_or_admin()
);

comment on table public.servicio_platos is 'Catálogo de platos del módulo Servicio por local.';
comment on table public.servicio_plan_dia is 'Asignación de platos al servicio de un día concreto.';
comment on table public.servicio_produccion is 'Tareas de mise en place / producción del día.';
