-- =============================================================================
-- Cocina central: recetas internas de producción (independientes de escandallos)
-- Requiere: public.locals, public.profiles, public.purchase_articles, public.central_preparations,
--           public.production_orders, public.set_updated_at()
-- No modifica tablas de escandallos.
-- =============================================================================

-- 1) Recetas internas (solo visibilidad en flujo de cocina central)
-- ---------------------------------------------------------------------------
create table if not exists public.production_recipes (
  id uuid primary key default gen_random_uuid(),
  local_central_id uuid not null references public.locals(id) on delete cascade,
  name text not null,
  final_unit text not null,
  base_yield_quantity numeric(14,4) not null check (base_yield_quantity > 0),
  base_yield_unit text not null,
  default_expiry_days integer check (default_expiry_days is null or default_expiry_days >= 0),
  is_active boolean not null default true,
  restricted_visibility boolean not null default true,
  output_preparation_id uuid references public.central_preparations(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_recipes_name_nonempty check (char_length(trim(name)) > 0)
);

create index if not exists idx_production_recipes_local
  on public.production_recipes (local_central_id, is_active, lower(trim(name)));

create unique index if not exists uq_production_recipes_local_name
  on public.production_recipes (local_central_id, lower(trim(name)));

drop trigger if exists trg_production_recipes_u on public.production_recipes;
create trigger trg_production_recipes_u
before update on public.production_recipes
for each row execute procedure public.set_updated_at();

comment on table public.production_recipes is
  'Fórmulas de producción internas de cocina central; no se exponen a escandallos/carta.';

-- 2) Líneas: ingredientes desde Artículos Máster (purchase_articles)
-- ---------------------------------------------------------------------------
create table if not exists public.production_recipe_lines (
  id uuid primary key default gen_random_uuid(),
  production_recipe_id uuid not null references public.production_recipes(id) on delete cascade,
  article_id uuid not null references public.purchase_articles(id) on delete restrict,
  ingredient_name_snapshot text not null,
  quantity numeric(14,4) not null check (quantity > 0),
  unit text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_production_recipe_lines_recipe
  on public.production_recipe_lines (production_recipe_id, sort_order, created_at);

-- 3) Enlace elaboración de salida (central_preparations) a receta interna
-- ---------------------------------------------------------------------------
alter table public.central_preparations
  add column if not exists production_recipe_id uuid references public.production_recipes(id) on delete set null;

alter table public.central_preparations
  add column if not exists purchase_article_id uuid references public.purchase_articles(id) on delete set null;

comment on column public.central_preparations.production_recipe_id is
  'Salida de producción: una elaboración por receta interna (1:1 con production_recipes).';
comment on column public.central_preparations.purchase_article_id is
  'Slot de ingrediente vinculado a un artículo máster (sin escandallo).';

create unique index if not exists uq_cc_prep_salida_receta_interna
  on public.central_preparations (local_central_id, production_recipe_id)
  where production_recipe_id is not null;

create unique index if not exists uq_cc_prep_ingrediente_articulo
  on public.central_preparations (local_central_id, purchase_article_id)
  where purchase_article_id is not null;

-- 4) Órdenes de producción: enlace a receta interna
-- ---------------------------------------------------------------------------
alter table public.production_orders
  add column if not exists production_recipe_id uuid references public.production_recipes(id) on delete set null;

create index if not exists idx_production_orders_production_recipe
  on public.production_orders (production_recipe_id)
  where production_recipe_id is not null;

comment on column public.production_orders.production_recipe_id is
  'Receta interna (NO escandallo) desde la que se generó la orden.';

-- 5) Líneas de orden: artículo y línea de receta interna
-- ---------------------------------------------------------------------------
alter table public.production_order_lines
  add column if not exists article_id uuid references public.purchase_articles(id) on delete set null;

alter table public.production_order_lines
  add column if not exists production_recipe_line_id uuid references public.production_recipe_lines(id) on delete set null;

create index if not exists idx_production_order_lines_article
  on public.production_order_lines (article_id)
  where article_id is not null;

-- 6) RLS
-- ---------------------------------------------------------------------------
alter table public.production_recipes enable row level security;
alter table public.production_recipe_lines enable row level security;

drop policy if exists cc_production_recipes_rw on public.production_recipes;
create policy cc_production_recipes_rw on public.production_recipes
for all to authenticated
using (
  local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
)
with check (
  local_central_id = public.current_local_id()
  and public.profile_local_is_central()
  and public.profile_can_access_cocina_central_module()
);

drop policy if exists cc_production_recipe_lines_rw on public.production_recipe_lines;
create policy cc_production_recipe_lines_rw on public.production_recipe_lines
for all to authenticated
using (
  exists (
    select 1
    from public.production_recipes r
    where r.id = production_recipe_lines.production_recipe_id
      and r.local_central_id = public.current_local_id()
      and public.profile_local_is_central()
      and public.profile_can_access_cocina_central_module()
  )
)
with check (
  exists (
    select 1
    from public.production_recipes r
    where r.id = production_recipe_lines.production_recipe_id
      and r.local_central_id = public.current_local_id()
      and public.profile_local_is_central()
      and public.profile_can_access_cocina_central_module()
  )
);

-- Asegurar que purchase_articles y central_preparations used in FKs permiten al usuario del mismo local
-- (RLS existente en purchase_articles: mismo local; central_preparations ya tiene política cc)
