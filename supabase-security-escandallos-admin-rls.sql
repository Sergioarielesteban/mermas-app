-- Escandallos: lectura/escritura solo administradores (además de aislamiento por local).
-- Ejecutar en Supabase SQL Editor (idempotente con supabase-security-finanzas-admin-rls.sql).

create or replace function public.profile_is_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.is_active = true
      and lower(trim(p.role)) = 'admin'
  );
$$;

grant execute on function public.profile_is_admin() to authenticated;

drop policy if exists "escandallo_monthly_sales same local read" on public.escandallo_monthly_sales;
create policy "escandallo_monthly_sales same local read"
on public.escandallo_monthly_sales
for select
to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin());

drop policy if exists "escandallo_monthly_sales same local write" on public.escandallo_monthly_sales;
create policy "escandallo_monthly_sales same local write"
on public.escandallo_monthly_sales
for all
to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin())
with check (local_id = public.current_local_id() and public.profile_is_admin());

drop policy if exists "escandallo_recipes same local read" on public.escandallo_recipes;
create policy "escandallo_recipes same local read"
on public.escandallo_recipes
for select
to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin());

drop policy if exists "escandallo_recipes same local write" on public.escandallo_recipes;
create policy "escandallo_recipes same local write"
on public.escandallo_recipes
for all
to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin())
with check (local_id = public.current_local_id() and public.profile_is_admin());

drop policy if exists "escandallo_processed same local read" on public.escandallo_processed_products;
create policy "escandallo_processed same local read"
on public.escandallo_processed_products
for select
to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin());

drop policy if exists "escandallo_processed same local write" on public.escandallo_processed_products;
create policy "escandallo_processed same local write"
on public.escandallo_processed_products
for all
to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin())
with check (local_id = public.current_local_id() and public.profile_is_admin());

drop policy if exists "escandallo_lines same local read" on public.escandallo_recipe_lines;
create policy "escandallo_lines same local read"
on public.escandallo_recipe_lines
for select
to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin());

drop policy if exists "escandallo_lines same local write" on public.escandallo_recipe_lines;
create policy "escandallo_lines same local write"
on public.escandallo_recipe_lines
for all
to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin())
with check (local_id = public.current_local_id() and public.profile_is_admin());
