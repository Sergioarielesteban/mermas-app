-- Seguridad: finanzas sensibles solo rol admin (además de aislamiento por local).
-- Requiere: supabase-multilocal-schema.sql, supabase-finanzas-phase1.sql, supabase-finanzas-phase2-aggregates.sql
-- Ejecutar en Supabase SQL Editor tras revisar en entorno de prueba.

-- -----------------------------------------------------------------------------
-- 1) Helper: solo administradores de aplicación (profiles.role = admin)
-- -----------------------------------------------------------------------------
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

comment on function public.profile_is_admin() is
  'True si el usuario autenticado tiene perfil activo con role admin.';

grant execute on function public.profile_is_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- 2) RPC agregados finanzas: mismo local + admin (afecta a todas las finanzas_agg_*)
-- -----------------------------------------------------------------------------
create or replace function public.finanzas_require_same_local(p_local_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
begin
  if p_local_id is null then
    raise exception 'finanzas: local_id requerido';
  end if;
  if p_local_id is distinct from public.current_local_id() then
    raise exception 'finanzas: local_id no coincide con el perfil autenticado';
  end if;
  if not public.profile_is_admin() then
    raise exception 'finanzas: se requiere rol admin';
  end if;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- 3) RLS tablas fase 1: ventas, costes personal agregados, gastos fijos, impuestos
-- -----------------------------------------------------------------------------
drop policy if exists "sales_daily same local read" on public.sales_daily;
create policy "sales_daily same local read"
on public.sales_daily
for select
to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin());

drop policy if exists "sales_daily same local write" on public.sales_daily;
create policy "sales_daily same local write"
on public.sales_daily
for all
to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin())
with check (local_id = public.current_local_id() and public.profile_is_admin());

drop policy if exists "staff_costs_period same local read" on public.staff_costs_period;
create policy "staff_costs_period same local read"
on public.staff_costs_period
for select
to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin());

drop policy if exists "staff_costs_period same local write" on public.staff_costs_period;
create policy "staff_costs_period same local write"
on public.staff_costs_period
for all
to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin())
with check (local_id = public.current_local_id() and public.profile_is_admin());

drop policy if exists "fixed_expenses same local read" on public.fixed_expenses;
create policy "fixed_expenses same local read"
on public.fixed_expenses
for select
to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin());

drop policy if exists "fixed_expenses same local write" on public.fixed_expenses;
create policy "fixed_expenses same local write"
on public.fixed_expenses
for all
to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin())
with check (local_id = public.current_local_id() and public.profile_is_admin());

drop policy if exists "tax_entries same local read" on public.tax_entries;
create policy "tax_entries same local read"
on public.tax_entries
for select
to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin());

drop policy if exists "tax_entries same local write" on public.tax_entries;
create policy "tax_entries same local write"
on public.tax_entries
for all
to authenticated
using (local_id = public.current_local_id() and public.profile_is_admin())
with check (local_id = public.current_local_id() and public.profile_is_admin());
