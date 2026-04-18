-- Terminal fichaje (tablet): resuelve empleado por PIN en el local actual.
-- Solo admin/manager autenticados (tablet con sesión de encargado).
-- Ejecutar en Supabase SQL Editor después de supabase-staff-attendance-schema.sql
--
-- Si en un intento anterior el editor creó tablas accidentales (p. ej. v_id), bórralas:
--   drop table if exists public.v_id cascade;

create or replace function public.staff_kiosk_resolve_by_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local uuid;
  v_pin text;
  v_count int;
  v_result jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not public.staff_is_manager_or_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_local := public.current_local_id();
  if v_local is null then
    return jsonb_build_object('ok', false, 'error', 'no_local');
  end if;

  v_pin := trim(coalesce(p_pin, ''));
  if length(v_pin) < 4 then
    return jsonb_build_object('ok', false, 'error', 'invalid_pin');
  end if;

  -- Usar := (subconsulta) para evitar que el editor interprete SELECT...INTO como SQL estándar.
  v_count := (
    select count(*)::int
    from public.staff_employees e
    where e.local_id = v_local
      and e.active = true
      and e.pin_fichaje is not null
      and trim(e.pin_fichaje) = v_pin
  );

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_match');
  end if;

  if v_count > 1 then
    return jsonb_build_object('ok', false, 'error', 'ambiguous');
  end if;

  -- Sin SELECT...INTO (el editor de Supabase lo confunde con "crear tabla v_id").
  v_result := (
    select jsonb_build_object(
      'ok', true,
      'employee_id', e.id,
      'first_name', e.first_name,
      'last_name', coalesce(e.last_name, ''),
      'alias', e.alias
    )
    from public.staff_employees e
    where e.local_id = v_local
      and e.active = true
      and e.pin_fichaje is not null
      and trim(e.pin_fichaje) = v_pin
    limit 1
  );

  if v_result is null then
    return jsonb_build_object('ok', false, 'error', 'no_match');
  end if;

  return v_result;
end;
$$;

revoke all on function public.staff_kiosk_resolve_by_pin(text) from public;
grant execute on function public.staff_kiosk_resolve_by_pin(text) to authenticated;
