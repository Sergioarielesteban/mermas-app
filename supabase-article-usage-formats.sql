-- Formatos operativos por Articulo Master para Escandallos.
-- Idempotente. Ejecutar despues de:
-- - supabase-multiorg-foundation.sql
-- - supabase-escandallos-migration-flex-usage-units.sql

create table if not exists public.article_usage_formats (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.purchase_articles(id) on delete cascade,
  organization_id uuid,
  name text not null,
  usage_unit text not null,
  pieces_per_purchase_unit numeric(14,4),
  weight_per_piece numeric(14,4),
  weight_unit text,
  cost_per_usage_unit numeric(14,6) not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint article_usage_formats_name_check check (char_length(trim(name)) between 1 and 120),
  constraint article_usage_formats_usage_unit_check check (char_length(trim(usage_unit)) between 1 and 48),
  constraint article_usage_formats_pieces_check check (pieces_per_purchase_unit is null or pieces_per_purchase_unit > 0),
  constraint article_usage_formats_weight_check check (weight_per_piece is null or weight_per_piece > 0),
  constraint article_usage_formats_weight_unit_check check (
    weight_unit is null or char_length(trim(weight_unit)) between 1 and 48
  ),
  constraint article_usage_formats_cost_check check (cost_per_usage_unit >= 0)
);

alter table public.article_usage_formats
  add column if not exists organization_id uuid;

alter table public.article_usage_formats
  add column if not exists updated_at timestamptz not null default now();

alter table public.escandallo_recipe_lines
  add column if not exists article_id uuid references public.purchase_articles(id) on delete set null;

alter table public.escandallo_recipe_lines
  add column if not exists usage_format_id uuid references public.article_usage_formats(id) on delete set null;

alter table public.escandallo_recipe_lines
  add column if not exists unit_cost numeric(14,6);

alter table public.escandallo_recipe_lines
  add column if not exists total_cost numeric(14,6);

create index if not exists idx_article_usage_formats_article_id
  on public.article_usage_formats(article_id);

create index if not exists idx_article_usage_formats_organization_id
  on public.article_usage_formats(organization_id);

create unique index if not exists idx_article_usage_formats_one_default
  on public.article_usage_formats(article_id)
  where is_default;

create unique index if not exists idx_article_usage_formats_name
  on public.article_usage_formats(article_id, lower(trim(name)));

create index if not exists idx_escandallo_lines_article_id
  on public.escandallo_recipe_lines(article_id);

create index if not exists idx_escandallo_lines_usage_format_id
  on public.escandallo_recipe_lines(usage_format_id);

create or replace function public.set_article_usage_format_organization_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select pa.organization_id
    into v_org
  from public.purchase_articles pa
  where pa.id = new.article_id;

  if v_org is null then
    v_org := public.current_organization_id();
  end if;

  if new.organization_id is null then
    new.organization_id := v_org;
  elsif v_org is not null and new.organization_id <> v_org then
    raise exception 'El formato no pertenece a la misma organizacion que el articulo';
  end if;

  return new;
end $$;

drop trigger if exists trg_article_usage_formats_org on public.article_usage_formats;
create trigger trg_article_usage_formats_org
before insert or update of article_id, organization_id on public.article_usage_formats
for each row execute procedure public.set_article_usage_format_organization_id();

drop trigger if exists trg_article_usage_formats_updated_at on public.article_usage_formats;
create trigger trg_article_usage_formats_updated_at
before update on public.article_usage_formats
for each row execute procedure public.set_updated_at();

update public.article_usage_formats f
set organization_id = pa.organization_id
from public.purchase_articles pa
where f.organization_id is null
  and f.article_id = pa.id
  and pa.organization_id is not null;

do $$
begin
  -- Backfill tecnico: no debe recalcular APPCC/alergenos porque solo completa article_id.
  if exists (
    select 1
    from pg_trigger
    where tgname = 'trg_appcc_recalc_on_recipe_line_change'
      and tgrelid = 'public.escandallo_recipe_lines'::regclass
  ) then
    alter table public.escandallo_recipe_lines disable trigger trg_appcc_recalc_on_recipe_line_change;
  end if;

  update public.escandallo_recipe_lines l
  set article_id = p.article_id
  from public.pedido_supplier_products p
  where l.article_id is null
    and l.raw_supplier_product_id = p.id
    and p.article_id is not null;

  if exists (
    select 1
    from pg_trigger
    where tgname = 'trg_appcc_recalc_on_recipe_line_change'
      and tgrelid = 'public.escandallo_recipe_lines'::regclass
  ) then
    alter table public.escandallo_recipe_lines enable trigger trg_appcc_recalc_on_recipe_line_change;
  end if;
exception
  when others then
    if exists (
      select 1
      from pg_trigger
      where tgname = 'trg_appcc_recalc_on_recipe_line_change'
        and tgrelid = 'public.escandallo_recipe_lines'::regclass
    ) then
      alter table public.escandallo_recipe_lines enable trigger trg_appcc_recalc_on_recipe_line_change;
    end if;
    raise;
end $$;

alter table public.article_usage_formats enable row level security;

drop policy if exists "article_usage_formats select same organization" on public.article_usage_formats;
create policy "article_usage_formats select same organization"
on public.article_usage_formats
for select
to authenticated
using (
  organization_id = public.current_organization_id()
);

drop policy if exists "article_usage_formats insert same organization" on public.article_usage_formats;
create policy "article_usage_formats insert same organization"
on public.article_usage_formats
for insert
to authenticated
with check (
  organization_id = public.current_organization_id()
  and exists (
    select 1
    from public.purchase_articles pa
    where pa.id = article_id
      and pa.organization_id = public.current_organization_id()
  )
);

drop policy if exists "article_usage_formats update same organization" on public.article_usage_formats;
create policy "article_usage_formats update same organization"
on public.article_usage_formats
for update
to authenticated
using (
  organization_id = public.current_organization_id()
)
with check (
  organization_id = public.current_organization_id()
  and exists (
    select 1
    from public.purchase_articles pa
    where pa.id = article_id
      and pa.organization_id = public.current_organization_id()
  )
);

drop policy if exists "article_usage_formats delete same organization" on public.article_usage_formats;
create policy "article_usage_formats delete same organization"
on public.article_usage_formats
for delete
to authenticated
using (
  organization_id = public.current_organization_id()
);

comment on table public.article_usage_formats is
  'Formatos operativos de uso en cocina para valorar un mismo articulo master en escandallos sin duplicarlo.';

comment on column public.escandallo_recipe_lines.usage_format_id is
  'Formato operativo seleccionado para lineas raw. Si es null, se mantiene el calculo legacy por unidad.';
