-- APPCC · Carta y alérgenos (híbrido automático + revisión humana)
-- Ejecutar en Supabase SQL Editor
-- Requiere: public.locals, public.current_local_id(), public.set_updated_at()

-- -----------------------------------------------------------------------------
-- 1) Catálogo maestro (global, no por local)
-- -----------------------------------------------------------------------------
create table if not exists public.allergens_master (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  short_description text not null default '',
  icon text not null default '●',
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create index if not exists idx_allergens_master_order on public.allergens_master(display_order);

drop trigger if exists trg_allergens_master_updated_at on public.allergens_master;
create trigger trg_allergens_master_updated_at
before update on public.allergens_master
for each row execute procedure public.set_updated_at();

insert into public.allergens_master (code, name, short_description, icon, display_order, is_active)
values
  ('gluten', 'Gluten', 'Cereales con gluten', '🌾', 10, true),
  ('crustaceos', 'Crustáceos', 'Crustáceos y derivados', '🦐', 20, true),
  ('huevos', 'Huevos', 'Huevos y productos a base de huevo', '🥚', 30, true),
  ('pescado', 'Pescado', 'Pescado y derivados', '🐟', 40, true),
  ('cacahuetes', 'Cacahuetes', 'Cacahuetes y derivados', '🥜', 50, true),
  ('soja', 'Soja', 'Soja y derivados', '🫘', 60, true),
  ('leche', 'Leche', 'Leche y derivados (incl. lactosa)', '🥛', 70, true),
  ('frutos_cascara', 'Frutos de cáscara', 'Almendra, avellana, nuez, etc.', '🌰', 80, true),
  ('apio', 'Apio', 'Apio y derivados', '🥬', 90, true),
  ('mostaza', 'Mostaza', 'Mostaza y derivados', '🟡', 100, true),
  ('sesamo', 'Sésamo', 'Semillas de sésamo y derivados', '⚪', 110, true),
  ('sulfitos', 'Sulfitos', 'Dióxido de azufre y sulfitos', '🧪', 120, true),
  ('altramuces', 'Altramuces', 'Altramuces y derivados', '🫘', 130, true),
  ('moluscos', 'Moluscos', 'Moluscos y derivados', '🦪', 140, true)
on conflict (code) do update
set
  name = excluded.name,
  short_description = excluded.short_description,
  icon = excluded.icon,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

-- -----------------------------------------------------------------------------
-- 2) Alérgenos por producto (catálogo de proveedor)
-- -----------------------------------------------------------------------------
create table if not exists public.product_allergens (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  product_id uuid not null references public.pedido_supplier_products(id) on delete cascade,
  allergen_id uuid not null references public.allergens_master(id) on delete restrict,
  presence_type text not null check (presence_type in ('contains', 'traces', 'may_contain')),
  notes text not null default '',
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (local_id, product_id, allergen_id)
);

create index if not exists idx_product_allergens_local_product on public.product_allergens(local_id, product_id);
create index if not exists idx_product_allergens_allergen on public.product_allergens(allergen_id);

drop trigger if exists trg_product_allergens_updated_at on public.product_allergens;
create trigger trg_product_allergens_updated_at
before update on public.product_allergens
for each row execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3) Estado de revisión por plato (reutiliza escandallo_recipes)
-- -----------------------------------------------------------------------------
alter table public.escandallo_recipes
  add column if not exists allergens_review_status text not null default 'incomplete'
  check (allergens_review_status in ('reviewed', 'pending_review', 'stale', 'incomplete'));

alter table public.escandallo_recipes add column if not exists allergens_reviewed_at timestamptz;
alter table public.escandallo_recipes add column if not exists allergens_reviewed_by uuid references auth.users(id);
alter table public.escandallo_recipes add column if not exists allergens_force_reviewed boolean not null default false;
alter table public.escandallo_recipes add column if not exists allergens_last_calculated_at timestamptz;

create index if not exists idx_escandallo_recipes_allergen_status
  on public.escandallo_recipes(local_id, allergens_review_status, is_sub_recipe);

-- -----------------------------------------------------------------------------
-- 4) Resultado por receta/plato + trazabilidad por origen
-- -----------------------------------------------------------------------------
create table if not exists public.recipe_allergens (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  recipe_id uuid not null references public.escandallo_recipes(id) on delete cascade,
  allergen_id uuid not null references public.allergens_master(id) on delete restrict,
  presence_type text not null default 'contains' check (presence_type in ('contains', 'traces', 'may_contain')),
  source_type text not null check (source_type in ('automatic', 'manual')),
  status text not null default 'active' check (status in ('active', 'excluded', 'pending_review', 'confirmed')),
  exclusion_reason text,
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (local_id, recipe_id, allergen_id)
);

create index if not exists idx_recipe_allergens_recipe on public.recipe_allergens(local_id, recipe_id);
create index if not exists idx_recipe_allergens_status on public.recipe_allergens(local_id, status);

drop trigger if exists trg_recipe_allergens_updated_at on public.recipe_allergens;
create trigger trg_recipe_allergens_updated_at
before update on public.recipe_allergens
for each row execute procedure public.set_updated_at();

create table if not exists public.recipe_allergen_sources (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  recipe_id uuid not null references public.escandallo_recipes(id) on delete cascade,
  allergen_id uuid not null references public.allergens_master(id) on delete cascade,
  source_line_id uuid references public.escandallo_recipe_lines(id) on delete cascade,
  source_kind text not null check (source_kind in ('raw', 'processed', 'subrecipe')),
  source_label text not null,
  source_product_id uuid,
  source_recipe_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_recipe_allergen_sources_recipe
  on public.recipe_allergen_sources(local_id, recipe_id, allergen_id);

create table if not exists public.recipe_allergen_review_log (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  recipe_id uuid not null references public.escandallo_recipes(id) on delete cascade,
  action text not null check (action in ('recalculated', 'confirmed', 'forced_confirm', 'manual_add', 'manual_exclude', 'manual_restore')),
  note text not null default '',
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_recipe_allergen_review_log_recipe
  on public.recipe_allergen_review_log(local_id, recipe_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 5) Funciones de cálculo
-- -----------------------------------------------------------------------------
create or replace function public.appcc_recipe_missing_allergen_products_count(p_recipe_id uuid)
returns integer
language sql
stable
as $$
  with raw_products as (
    select distinct l.raw_supplier_product_id as product_id
    from public.escandallo_recipe_lines l
    where l.recipe_id = p_recipe_id
      and l.source_type = 'raw'
      and l.raw_supplier_product_id is not null
    union
    select distinct pp.source_supplier_product_id as product_id
    from public.escandallo_recipe_lines l
    join public.escandallo_processed_products pp on pp.id = l.processed_product_id
    where l.recipe_id = p_recipe_id
      and l.source_type = 'processed'
      and l.processed_product_id is not null
  )
  select count(*)
  from raw_products rp
  where not exists (
    select 1
    from public.product_allergens pa
    where pa.product_id = rp.product_id
  );
$$;

create or replace function public.appcc_refresh_recipe_allergens(p_recipe_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local_id uuid;
  v_prev_status text;
  v_missing integer;
  v_new_status text;
begin
  select r.local_id, r.allergens_review_status
  into v_local_id, v_prev_status
  from public.escandallo_recipes r
  where r.id = p_recipe_id;

  if v_local_id is null then
    return;
  end if;

  if auth.uid() is null or v_local_id is distinct from public.current_local_id() then
    raise exception 'No autorizado para operar alérgenos de esta receta';
  end if;

  delete from public.recipe_allergen_sources s
  where s.recipe_id = p_recipe_id
    and s.local_id = v_local_id;

  delete from public.recipe_allergens ra
  where ra.recipe_id = p_recipe_id
    and ra.local_id = v_local_id
    and ra.source_type = 'automatic';

  -- Crudos directos
  insert into public.recipe_allergens (local_id, recipe_id, allergen_id, presence_type, source_type, status)
  select distinct
    v_local_id,
    p_recipe_id,
    pa.allergen_id,
    pa.presence_type,
    'automatic',
    'pending_review'
  from public.escandallo_recipe_lines l
  join public.product_allergens pa
    on pa.product_id = l.raw_supplier_product_id
   and pa.local_id = v_local_id
  where l.recipe_id = p_recipe_id
    and l.source_type = 'raw'
    and l.raw_supplier_product_id is not null
  on conflict (local_id, recipe_id, allergen_id) do update
  set
    source_type = 'automatic',
    presence_type = excluded.presence_type,
    status = 'pending_review',
    exclusion_reason = null,
    confirmed_by = null,
    confirmed_at = null,
    updated_at = now();

  insert into public.recipe_allergen_sources (
    local_id,
    recipe_id,
    allergen_id,
    source_line_id,
    source_kind,
    source_label,
    source_product_id
  )
  select distinct
    v_local_id,
    p_recipe_id,
    pa.allergen_id,
    l.id,
    'raw',
    l.label,
    l.raw_supplier_product_id
  from public.escandallo_recipe_lines l
  join public.product_allergens pa
    on pa.product_id = l.raw_supplier_product_id
   and pa.local_id = v_local_id
  where l.recipe_id = p_recipe_id
    and l.source_type = 'raw'
    and l.raw_supplier_product_id is not null;

  -- Elaborados internos (heredan del crudo origen)
  insert into public.recipe_allergens (local_id, recipe_id, allergen_id, presence_type, source_type, status)
  select distinct
    v_local_id,
    p_recipe_id,
    pa.allergen_id,
    pa.presence_type,
    'automatic',
    'pending_review'
  from public.escandallo_recipe_lines l
  join public.escandallo_processed_products pp on pp.id = l.processed_product_id
  join public.product_allergens pa
    on pa.product_id = pp.source_supplier_product_id
   and pa.local_id = v_local_id
  where l.recipe_id = p_recipe_id
    and l.source_type = 'processed'
    and l.processed_product_id is not null
  on conflict (local_id, recipe_id, allergen_id) do update
  set
    source_type = 'automatic',
    presence_type = excluded.presence_type,
    status = 'pending_review',
    exclusion_reason = null,
    confirmed_by = null,
    confirmed_at = null,
    updated_at = now();

  insert into public.recipe_allergen_sources (
    local_id,
    recipe_id,
    allergen_id,
    source_line_id,
    source_kind,
    source_label,
    source_product_id
  )
  select distinct
    v_local_id,
    p_recipe_id,
    pa.allergen_id,
    l.id,
    'processed',
    l.label,
    pp.source_supplier_product_id
  from public.escandallo_recipe_lines l
  join public.escandallo_processed_products pp on pp.id = l.processed_product_id
  join public.product_allergens pa
    on pa.product_id = pp.source_supplier_product_id
   and pa.local_id = v_local_id
  where l.recipe_id = p_recipe_id
    and l.source_type = 'processed'
    and l.processed_product_id is not null;

  -- Sub-receta: hereda alérgenos activos/confirmados de la sub-receta
  insert into public.recipe_allergens (local_id, recipe_id, allergen_id, presence_type, source_type, status)
  select distinct
    v_local_id,
    p_recipe_id,
    sra.allergen_id,
    sra.presence_type,
    'automatic',
    'pending_review'
  from public.escandallo_recipe_lines l
  join public.recipe_allergens sra
    on sra.recipe_id = l.sub_recipe_id
   and sra.local_id = v_local_id
   and sra.status in ('active', 'confirmed', 'pending_review')
  where l.recipe_id = p_recipe_id
    and l.source_type = 'subrecipe'
    and l.sub_recipe_id is not null
  on conflict (local_id, recipe_id, allergen_id) do update
  set
    source_type = 'automatic',
    presence_type = excluded.presence_type,
    status = 'pending_review',
    exclusion_reason = null,
    confirmed_by = null,
    confirmed_at = null,
    updated_at = now();

  insert into public.recipe_allergen_sources (
    local_id,
    recipe_id,
    allergen_id,
    source_line_id,
    source_kind,
    source_label,
    source_recipe_id
  )
  select distinct
    v_local_id,
    p_recipe_id,
    sra.allergen_id,
    l.id,
    'subrecipe',
    l.label,
    l.sub_recipe_id
  from public.escandallo_recipe_lines l
  join public.recipe_allergens sra
    on sra.recipe_id = l.sub_recipe_id
   and sra.local_id = v_local_id
   and sra.status in ('active', 'confirmed', 'pending_review')
  where l.recipe_id = p_recipe_id
    and l.source_type = 'subrecipe'
    and l.sub_recipe_id is not null;

  v_missing := public.appcc_recipe_missing_allergen_products_count(p_recipe_id);
  if v_missing > 0 then
    v_new_status := 'incomplete';
  else
    v_new_status := case when v_prev_status = 'reviewed' then 'stale' else 'pending_review' end;
  end if;

  update public.escandallo_recipes
  set
    allergens_review_status = v_new_status,
    allergens_last_calculated_at = now(),
    allergens_force_reviewed = false
  where id = p_recipe_id;

  insert into public.recipe_allergen_review_log (local_id, recipe_id, action, note, actor_id)
  values (v_local_id, p_recipe_id, 'recalculated', 'Recalculo automático por cambios en ingredientes/productos', auth.uid());
end;
$$;

create or replace function public.appcc_refresh_recipes_by_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  for rec in (
    select distinct l.recipe_id
    from public.escandallo_recipe_lines l
    where l.source_type = 'raw'
      and l.raw_supplier_product_id = p_product_id
    union
    select distinct l.recipe_id
    from public.escandallo_recipe_lines l
    join public.escandallo_processed_products pp on pp.id = l.processed_product_id
    where l.source_type = 'processed'
      and pp.source_supplier_product_id = p_product_id
  ) loop
    perform public.appcc_refresh_recipe_allergens(rec.recipe_id);
  end loop;
end;
$$;

create or replace function public.appcc_confirm_recipe_allergens(p_recipe_id uuid, p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local_id uuid;
  v_missing integer;
  v_action text;
begin
  select local_id into v_local_id from public.escandallo_recipes where id = p_recipe_id;
  if v_local_id is null then
    raise exception 'Receta no encontrada';
  end if;

  if auth.uid() is null or v_local_id is distinct from public.current_local_id() then
    raise exception 'No autorizado para operar alérgenos de esta receta';
  end if;

  v_missing := public.appcc_recipe_missing_allergen_products_count(p_recipe_id);
  if v_missing > 0 and p_force is false then
    raise exception 'La receta tiene ingredientes sin ficha de alérgenos';
  end if;

  update public.recipe_allergens
  set
    status = case when status = 'excluded' then 'excluded' else 'confirmed' end,
    confirmed_by = auth.uid(),
    confirmed_at = now(),
    exclusion_reason = case when status = 'excluded' then exclusion_reason else null end,
    updated_at = now()
  where recipe_id = p_recipe_id
    and local_id = v_local_id;

  update public.escandallo_recipes
  set
    allergens_review_status = 'reviewed',
    allergens_reviewed_at = now(),
    allergens_reviewed_by = auth.uid(),
    allergens_force_reviewed = p_force,
    allergens_last_calculated_at = now()
  where id = p_recipe_id;

  v_action := case when p_force then 'forced_confirm' else 'confirmed' end;
  insert into public.recipe_allergen_review_log (local_id, recipe_id, action, note, actor_id)
  values (
    v_local_id,
    p_recipe_id,
    v_action,
    case when p_force then 'Confirmación forzada con ingredientes incompletos' else 'Confirmación de revisión de alérgenos' end,
    auth.uid()
  );
end;
$$;

create or replace function public.appcc_mark_recipe_allergen_manual(
  p_recipe_id uuid,
  p_allergen_id uuid,
  p_presence_type text default 'contains'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local_id uuid;
begin
  select local_id into v_local_id from public.escandallo_recipes where id = p_recipe_id;
  if v_local_id is null then
    raise exception 'Receta no encontrada';
  end if;

  if auth.uid() is null or v_local_id is distinct from public.current_local_id() then
    raise exception 'No autorizado para operar alérgenos de esta receta';
  end if;

  insert into public.recipe_allergens (
    local_id,
    recipe_id,
    allergen_id,
    presence_type,
    source_type,
    status,
    exclusion_reason,
    confirmed_by,
    confirmed_at
  ) values (
    v_local_id,
    p_recipe_id,
    p_allergen_id,
    coalesce(p_presence_type, 'contains'),
    'manual',
    'pending_review',
    null,
    null,
    null
  )
  on conflict (local_id, recipe_id, allergen_id) do update
  set
    source_type = 'manual',
    presence_type = coalesce(p_presence_type, 'contains'),
    status = 'pending_review',
    exclusion_reason = null,
    confirmed_by = null,
    confirmed_at = null,
    updated_at = now();

  update public.escandallo_recipes
  set allergens_review_status = 'pending_review'
  where id = p_recipe_id
    and allergens_review_status <> 'incomplete';

  insert into public.recipe_allergen_review_log (local_id, recipe_id, action, note, actor_id)
  values (v_local_id, p_recipe_id, 'manual_add', 'Alta manual de alérgeno', auth.uid());
end;
$$;

create or replace function public.appcc_exclude_recipe_allergen(
  p_recipe_id uuid,
  p_allergen_id uuid,
  p_reason text default ''
)
returns void
language plpgsql
security definer

set search_path = public
as $$
declare
  v_local_id uuid;
begin
  select local_id into v_local_id from public.escandallo_recipes where id = p_recipe_id;
  if v_local_id is null then
    raise exception 'Receta no encontrada';
  end if;

  if auth.uid() is null or v_local_id is distinct from public.current_local_id() then
    raise exception 'No autorizado para operar alérgenos de esta receta';
  end if;

  insert into public.recipe_allergens (
    local_id,
    recipe_id,
    allergen_id,
    presence_type,
    source_type,
    status,
    exclusion_reason
  ) values (
    v_local_id,
    p_recipe_id,
    p_allergen_id,
    'contains',
    'manual',
    'excluded',
    nullif(btrim(coalesce(p_reason, '')), '')
  )
  on conflict (local_id, recipe_id, allergen_id) do update
  set
    status = 'excluded',
    exclusion_reason = nullif(btrim(coalesce(p_reason, '')), ''),
    confirmed_by = null,
    confirmed_at = null,
    updated_at = now();

  update public.escandallo_recipes
  set allergens_review_status = 'pending_review'
  where id = p_recipe_id
    and allergens_review_status <> 'incomplete';

  insert into public.recipe_allergen_review_log (local_id, recipe_id, action, note, actor_id)
  values (
    v_local_id,
    p_recipe_id,
    'manual_exclude',
    case when nullif(btrim(coalesce(p_reason, '')), '') is null then 'Exclusión manual de alérgeno' else p_reason end,
    auth.uid()
  );
end;
$$;

create or replace function public.appcc_restore_recipe_allergen(p_recipe_id uuid, p_allergen_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local_id uuid;
begin
  select local_id into v_local_id from public.escandallo_recipes where id = p_recipe_id;
  if v_local_id is null then
    raise exception 'Receta no encontrada';
  end if;

  if auth.uid() is null or v_local_id is distinct from public.current_local_id() then
    raise exception 'No autorizado para operar alérgenos de esta receta';
  end if;

  update public.recipe_allergens
  set
    status = 'pending_review',
    exclusion_reason = null,
    confirmed_by = null,
    confirmed_at = null,
    updated_at = now()
  where recipe_id = p_recipe_id
    and allergen_id = p_allergen_id
    and local_id = v_local_id;

  update public.escandallo_recipes
  set allergens_review_status = 'pending_review'
  where id = p_recipe_id
    and allergens_review_status <> 'incomplete';

  insert into public.recipe_allergen_review_log (local_id, recipe_id, action, note, actor_id)
  values (v_local_id, p_recipe_id, 'manual_restore', 'Restauración de alérgeno excluido', auth.uid());
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) Triggers de recalculo automático
-- -----------------------------------------------------------------------------
create or replace function public.appcc_recalc_recipe_from_line_trigger()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.appcc_refresh_recipe_allergens(old.recipe_id);
    return old;
  end if;
  perform public.appcc_refresh_recipe_allergens(new.recipe_id);
  return new;
end;
$$;

drop trigger if exists trg_appcc_recalc_on_recipe_line_change on public.escandallo_recipe_lines;
create trigger trg_appcc_recalc_on_recipe_line_change
after insert or update or delete on public.escandallo_recipe_lines
for each row execute function public.appcc_recalc_recipe_from_line_trigger();

create or replace function public.appcc_recalc_recipe_from_product_trigger()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.appcc_refresh_recipes_by_product(old.product_id);
    return old;
  end if;
  perform public.appcc_refresh_recipes_by_product(new.product_id);
  return new;
end;
$$;

drop trigger if exists trg_appcc_recalc_on_product_allergen_change on public.product_allergens;
create trigger trg_appcc_recalc_on_product_allergen_change
after insert or update or delete on public.product_allergens
for each row execute function public.appcc_recalc_recipe_from_product_trigger();

-- -----------------------------------------------------------------------------
-- 7) RLS
-- -----------------------------------------------------------------------------
alter table public.allergens_master enable row level security;
alter table public.product_allergens enable row level security;
alter table public.recipe_allergens enable row level security;
alter table public.recipe_allergen_sources enable row level security;
alter table public.recipe_allergen_review_log enable row level security;

drop policy if exists "allergens master read all authenticated" on public.allergens_master;
create policy "allergens master read all authenticated"
on public.allergens_master
for select
to authenticated
using (true);

drop policy if exists "product allergens same local read" on public.product_allergens;
create policy "product allergens same local read"
on public.product_allergens
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "product allergens same local write" on public.product_allergens;
create policy "product allergens same local write"
on public.product_allergens
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

drop policy if exists "recipe allergens same local read" on public.recipe_allergens;
create policy "recipe allergens same local read"
on public.recipe_allergens
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "recipe allergens same local write" on public.recipe_allergens;
create policy "recipe allergens same local write"
on public.recipe_allergens
for all
to authenticated
using (local_id = public.current_local_id())
with check (local_id = public.current_local_id());

drop policy if exists "recipe allergen sources same local read" on public.recipe_allergen_sources;
create policy "recipe allergen sources same local read"
on public.recipe_allergen_sources
for select
to authenticated
using (local_id = public.current_local_id());

drop policy if exists "recipe allergen review log same local read" on public.recipe_allergen_review_log;
create policy "recipe allergen review log same local read"
on public.recipe_allergen_review_log
for select
to authenticated
using (local_id = public.current_local_id());
