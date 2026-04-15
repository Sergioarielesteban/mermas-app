-- Demo: 200 registros en marzo 2026 + 100 en abril 2026, repartidos en días al azar.
-- Reparto servicios: ~30 % comida, ~70 % cena.
-- Usa trabajadores y productos activos ya existentes del local (los nombres que creaste).
--
-- Cómo usar (Supabase → SQL Editor):
-- 1) Obtén tu local_id, por ejemplo:
--    select id, code, name from public.locals;
-- 2) Sustituye el UUID en v_local abajo.
-- 3) Ejecuta todo el script.
--
-- Opcional: borra antes los demos anteriores del mismo local (mismo texto de nota).
-- Si no quieres borrar, comenta el bloque DELETE.

begin;

-- ▼▼▼ Pega aquí el UUID de tu local ▼▼▼
do $$
declare
  v_local uuid := '00000000-0000-0000-0000-000000000000';
  v_n_workers int;
  i int;
  v_meal_date date;
  v_service text;
  v_wid uuid;
  v_wname text;
  v_pid uuid;
  v_pname text;
  v_ppl numeric(8,2);
  v_unit numeric(10,2);
  v_total numeric(12,2);
begin
  if v_local = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Edita v_local en el script y pon el uuid real de public.locals.';
  end if;

  select count(*)::int into v_n_workers
  from public.staff_meal_workers
  where local_id = v_local and is_active;

  if v_n_workers < 1 then
    raise exception 'No hay trabajadores activos en staff_meal_workers para este local. Crea fichas primero en la app.';
  end if;

  delete from public.staff_meal_records
  where local_id = v_local and notes = 'Demo · datos de prueba';

  -- Marzo 2026: 31 días (índice 0..30)
  for i in 1..200 loop
    v_meal_date := date '2026-03-01' + (floor(random() * 31))::int;
    v_service := case when random() < 0.3 then 'comida' else 'cena' end;

    select w.id, w.name into v_wid, v_wname
    from public.staff_meal_workers w
    where w.local_id = v_local and w.is_active
    order by random()
    limit 1;

    v_pid := null;
    v_pname := null;
    select p.id, p.name into v_pid, v_pname
    from public.products p
    where p.local_id = v_local and p.is_active
    order by random()
    limit 1;

    v_ppl := (floor(random() * 3) + 1)::numeric;
    v_unit := round((1.20 + random() * 7.80)::numeric, 2);
    v_total := round(v_ppl * v_unit, 2);

    insert into public.staff_meal_records (
      local_id,
      service,
      meal_date,
      people_count,
      unit_cost_eur,
      total_cost_eur,
      notes,
      worker_id,
      worker_name_snapshot,
      source_product_id,
      source_product_name
    ) values (
      v_local,
      v_service,
      v_meal_date,
      v_ppl,
      v_unit,
      v_total,
      'Demo · datos de prueba',
      v_wid,
      v_wname,
      v_pid,
      v_pname
    );
  end loop;

  -- Abril 2026: 30 días (índice 0..29)
  for i in 1..100 loop
    v_meal_date := date '2026-04-01' + (floor(random() * 30))::int;
    v_service := case when random() < 0.3 then 'comida' else 'cena' end;

    select w.id, w.name into v_wid, v_wname
    from public.staff_meal_workers w
    where w.local_id = v_local and w.is_active
    order by random()
    limit 1;

    v_pid := null;
    v_pname := null;
    select p.id, p.name into v_pid, v_pname
    from public.products p
    where p.local_id = v_local and p.is_active
    order by random()
    limit 1;

    v_ppl := (floor(random() * 3) + 1)::numeric;
    v_unit := round((1.20 + random() * 7.80)::numeric, 2);
    v_total := round(v_ppl * v_unit, 2);

    insert into public.staff_meal_records (
      local_id,
      service,
      meal_date,
      people_count,
      unit_cost_eur,
      total_cost_eur,
      notes,
      worker_id,
      worker_name_snapshot,
      source_product_id,
      source_product_name
    ) values (
      v_local,
      v_service,
      v_meal_date,
      v_ppl,
      v_unit,
      v_total,
      'Demo · datos de prueba',
      v_wid,
      v_wname,
      v_pid,
      v_pname
    );
  end loop;

  raise notice 'Listo: 200 (mar 2026) + 100 (abr 2026) para local %. Borra con DELETE ... notes = Demo · datos de prueba', v_local;
end $$;

commit;
