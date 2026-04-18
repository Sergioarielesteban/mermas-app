-- Finanzas — Fase 2: RPC de agregación por local y rango (mínimo egress)
-- Requiere: multilocal (current_local_id), staff_meal_records, mermas, sales_daily,
--   delivery_notes, staff_costs_period, fixed_expenses, tax_entries (fase 1 + comida + albaranes).
-- Ejecutar en Supabase SQL Editor tras las migraciones de esas tablas.

-- -----------------------------------------------------------------------------
-- Helpers: comprobación de tenant
-- -----------------------------------------------------------------------------
create or replace function public.finanzas_require_same_local(p_local_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_local_id is null then
    raise exception 'finanzas: local_id requerido';
  end if;
  if p_local_id is distinct from public.current_local_id() then
    raise exception 'finanzas: local_id no coincide con el perfil autenticado';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Comida de personal: SUM por día, excluye anulados (voided_at)
-- -----------------------------------------------------------------------------
create or replace function public.finanzas_agg_staff_meal(
  p_local_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_total numeric(14, 2);
  v_by_date jsonb;
begin
  perform public.finanzas_require_same_local(p_local_id);
  if p_from > p_to then
    raise exception 'finanzas: rango de fechas inválido';
  end if;

  select coalesce(sum(x.amt), 0)::numeric(14, 2)
  into v_total
  from (
    select sum(r.total_cost_eur)::numeric(14, 2) as amt
    from public.staff_meal_records r
    where r.local_id = p_local_id
      and r.meal_date between p_from and p_to
      and r.voided_at is null
    group by r.meal_date
  ) x;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', d.meal_date::text,
        'amount_eur', d.amt
      )
      order by d.meal_date
    ),
    '[]'::jsonb
  )
  into v_by_date
  from (
    select r.meal_date, sum(r.total_cost_eur)::numeric(14, 2) as amt
    from public.staff_meal_records r
    where r.local_id = p_local_id
      and r.meal_date between p_from and p_to
      and r.voided_at is null
    group by r.meal_date
  ) d;

  return jsonb_build_object(
    'total_cost_eur', v_total,
    'by_date', v_by_date
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Mermas: cost_eur por día (occurred_at UTC → fecha)
-- -----------------------------------------------------------------------------
create or replace function public.finanzas_agg_mermas(
  p_local_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_total numeric(14, 2);
  v_by_date jsonb;
begin
  perform public.finanzas_require_same_local(p_local_id);
  if p_from > p_to then
    raise exception 'finanzas: rango de fechas inválido';
  end if;

  select coalesce(sum(m.cost_eur), 0)::numeric(14, 2)
  into v_total
  from public.mermas m
  where m.local_id = p_local_id
    and (m.occurred_at at time zone 'UTC')::date between p_from and p_to;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', d.day::text,
        'amount_eur', d.amt
      )
      order by d.day
    ),
    '[]'::jsonb
  )
  into v_by_date
  from (
    select (m.occurred_at at time zone 'UTC')::date as day,
           sum(m.cost_eur)::numeric(14, 2) as amt
    from public.mermas m
    where m.local_id = p_local_id
      and (m.occurred_at at time zone 'UTC')::date between p_from and p_to
    group by 1
  ) d;

  return jsonb_build_object(
    'total_cost_eur', v_total,
    'by_date', v_by_date
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Ventas (sales_daily)
-- -----------------------------------------------------------------------------
create or replace function public.finanzas_agg_sales_daily(
  p_local_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_net numeric(14, 2);
  v_tax numeric(14, 2);
  v_tickets bigint;
  v_by_date jsonb;
begin
  perform public.finanzas_require_same_local(p_local_id);
  if p_from > p_to then
    raise exception 'finanzas: rango de fechas inválido';
  end if;

  select
    coalesce(sum(s.net_sales_eur), 0)::numeric(14, 2),
    coalesce(sum(s.tax_collected_eur), 0)::numeric(14, 2),
    coalesce(sum(s.tickets_count), 0)::bigint
  into v_net, v_tax, v_tickets
  from public.sales_daily s
  where s.local_id = p_local_id
    and s.date between p_from and p_to;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', s.date::text,
        'net_sales_eur', coalesce(s.net_sales_eur, 0)::numeric(14, 2),
        'tax_collected_eur', coalesce(s.tax_collected_eur, 0)::numeric(14, 2),
        'tickets_count', coalesce(s.tickets_count, 0)
      )
      order by s.date
    ),
    '[]'::jsonb
  )
  into v_by_date
  from public.sales_daily s
  where s.local_id = p_local_id
    and s.date between p_from and p_to;

  return jsonb_build_object(
    'total_net_sales_eur', v_net,
    'total_tax_collected_eur', v_tax,
    'total_tickets_count', v_tickets,
    'by_date', v_by_date
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Compras reconocidas: albaranes validados, imputación = delivery_date o fecha UTC de created_at
-- -----------------------------------------------------------------------------
create or replace function public.finanzas_agg_validated_delivery_notes(
  p_local_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_net numeric(14, 2);
  v_tax numeric(14, 2);
  v_gross numeric(14, 2);
  v_notes bigint;
  v_by_date jsonb;
begin
  perform public.finanzas_require_same_local(p_local_id);
  if p_from > p_to then
    raise exception 'finanzas: rango de fechas inválido';
  end if;

  with base as (
    select
      n.id,
      coalesce(n.delivery_date, (n.created_at at time zone 'UTC')::date) as impute_day,
      round(
        coalesce(
          n.subtotal,
          coalesce(n.total_amount, 0) - coalesce(n.tax_amount, 0)
        )::numeric,
        2
      ) as net_amt,
      round(coalesce(n.tax_amount, 0)::numeric, 2) as tax_amt,
      round(coalesce(n.total_amount, coalesce(n.subtotal, 0) + coalesce(n.tax_amount, 0))::numeric, 2) as gross_amt
    from public.delivery_notes n
    where n.local_id = p_local_id
      and n.status = 'validated'
  ),
  filtered as (
    select * from base
    where impute_day between p_from and p_to
  )
  select
    coalesce(sum(f.net_amt), 0)::numeric(14, 2),
    coalesce(sum(f.tax_amt), 0)::numeric(14, 2),
    coalesce(sum(f.gross_amt), 0)::numeric(14, 2),
    count(*)::bigint
  into v_net, v_tax, v_gross, v_notes
  from filtered f;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', agg.impute_day::text,
        'net_eur', agg.sum_net,
        'tax_eur', agg.sum_tax,
        'gross_eur', agg.sum_gross,
        'note_count', agg.cnt
      )
      order by agg.impute_day
    ),
    '[]'::jsonb
  )
  into v_by_date
  from (
    select
      f.impute_day,
      sum(f.net_amt)::numeric(14, 2) as sum_net,
      sum(f.tax_amt)::numeric(14, 2) as sum_tax,
      sum(f.gross_amt)::numeric(14, 2) as sum_gross,
      count(*)::bigint as cnt
    from (
      select
        coalesce(n.delivery_date, (n.created_at at time zone 'UTC')::date) as impute_day,
        round(
          coalesce(
            n.subtotal,
            coalesce(n.total_amount, 0) - coalesce(n.tax_amount, 0)
          )::numeric,
          2
        ) as net_amt,
        round(coalesce(n.tax_amount, 0)::numeric, 2) as tax_amt,
        round(coalesce(n.total_amount, coalesce(n.subtotal, 0) + coalesce(n.tax_amount, 0))::numeric, 2) as gross_amt
      from public.delivery_notes n
      where n.local_id = p_local_id
        and n.status = 'validated'
    ) f
    where f.impute_day between p_from and p_to
    group by f.impute_day
  ) agg;

  return jsonb_build_object(
    'total_net_eur', v_net,
    'total_tax_eur', v_tax,
    'total_gross_eur', v_gross,
    'validated_note_count', v_notes,
    'by_date', v_by_date
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Coste de personal (ventanas que solapan el rango; importe = total_staff_cost_eur completo)
-- -----------------------------------------------------------------------------
create or replace function public.finanzas_agg_staff_costs_period(
  p_local_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_total numeric(14, 2);
  v_periods jsonb;
  v_cnt int;
begin
  perform public.finanzas_require_same_local(p_local_id);
  if p_from > p_to then
    raise exception 'finanzas: rango de fechas inválido';
  end if;

  select
    coalesce(sum(s.total_staff_cost_eur), 0)::numeric(14, 2),
    count(*)::int
  into v_total, v_cnt
  from public.staff_costs_period s
  where s.local_id = p_local_id
    and s.period_start <= p_to
    and s.period_end >= p_from;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id::text,
        'period_type', s.period_type,
        'period_start', s.period_start::text,
        'period_end', s.period_end::text,
        'total_staff_cost_eur', coalesce(s.total_staff_cost_eur, 0)::numeric(14, 2)
      )
      order by s.period_start, s.period_end
    ),
    '[]'::jsonb
  )
  into v_periods
  from public.staff_costs_period s
  where s.local_id = p_local_id
    and s.period_start <= p_to
    and s.period_end >= p_from;

  return jsonb_build_object(
    'total_staff_cost_eur', v_total,
    'overlapping_period_count', v_cnt,
    'periods', v_periods
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Gastos fijos: one-off que cortan el rango + suma nominal de recurrentes activos (sin prorrateo)
-- -----------------------------------------------------------------------------
create or replace function public.finanzas_agg_fixed_expenses(
  p_local_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_one_off numeric(14, 2);
  v_recurring numeric(14, 2);
begin
  perform public.finanzas_require_same_local(p_local_id);
  if p_from > p_to then
    raise exception 'finanzas: rango de fechas inválido';
  end if;

  select coalesce(sum(f.amount_eur), 0)::numeric(14, 2)
  into v_one_off
  from public.fixed_expenses f
  where f.local_id = p_local_id
    and f.active = true
    and f.frequency = 'one_off'
    and f.period_start is not null
    and f.period_start <= p_to
    and (f.period_end is null or f.period_end >= p_from);

  select coalesce(sum(f.amount_eur), 0)::numeric(14, 2)
  into v_recurring
  from public.fixed_expenses f
  where f.local_id = p_local_id
    and f.active = true
    and f.frequency <> 'one_off';

  return jsonb_build_object(
    'one_off_in_range_eur', v_one_off,
    'recurring_nominal_eur', v_recurring,
    'note',
    'recurring_nominal_eur es la suma de importes configurados (mensual/trimestral/anual) sin prorrateo al rango; usar en fases posteriores para KPIs.'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Impuestos (tax_entries)
-- -----------------------------------------------------------------------------
create or replace function public.finanzas_agg_tax_entries(
  p_local_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_total numeric(14, 2);
  v_by_type jsonb;
  v_by_date jsonb;
begin
  perform public.finanzas_require_same_local(p_local_id);
  if p_from > p_to then
    raise exception 'finanzas: rango de fechas inválido';
  end if;

  select coalesce(sum(t.amount_eur), 0)::numeric(14, 2)
  into v_total
  from public.tax_entries t
  where t.local_id = p_local_id
    and t.date between p_from and p_to;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tax_type', x.tax_type,
        'amount_eur', x.amt
      )
      order by x.tax_type
    ),
    '[]'::jsonb
  )
  into v_by_type
  from (
    select t.tax_type, sum(t.amount_eur)::numeric(14, 2) as amt
    from public.tax_entries t
    where t.local_id = p_local_id
      and t.date between p_from and p_to
    group by t.tax_type
  ) x;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', d.dt::text,
        'amount_eur', d.amt
      )
      order by d.dt
    ),
    '[]'::jsonb
  )
  into v_by_date
  from (
    select t.date as dt, sum(t.amount_eur)::numeric(14, 2) as amt
    from public.tax_entries t
    where t.local_id = p_local_id
      and t.date between p_from and p_to
    group by t.date
  ) d;

  return jsonb_build_object(
    'total_amount_eur', v_total,
    'by_tax_type', v_by_type,
    'by_date', v_by_date
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
grant execute on function public.finanzas_require_same_local(uuid) to authenticated;

grant execute on function public.finanzas_agg_staff_meal(uuid, date, date) to authenticated;
grant execute on function public.finanzas_agg_mermas(uuid, date, date) to authenticated;
grant execute on function public.finanzas_agg_sales_daily(uuid, date, date) to authenticated;
grant execute on function public.finanzas_agg_validated_delivery_notes(uuid, date, date) to authenticated;
grant execute on function public.finanzas_agg_staff_costs_period(uuid, date, date) to authenticated;
grant execute on function public.finanzas_agg_fixed_expenses(uuid, date, date) to authenticated;
grant execute on function public.finanzas_agg_tax_entries(uuid, date, date) to authenticated;

comment on function public.finanzas_agg_staff_meal is
  'Agregado comida personal: total_cost_eur y serie diaria; excluye voided_at.';
comment on function public.finanzas_agg_validated_delivery_notes is
  'Gasto albaranes validados por fecha de imputación (delivery_date o created_at UTC).';
comment on function public.finanzas_agg_fixed_expenses is
  'Gastos fijos: one-off en ventana + suma nominal recurrentes; ver campo note.';
