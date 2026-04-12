-- Añade quién realizó el registro (texto libre, una vez por sesión en la app).
-- Ejecutar en Supabase → SQL Editor si la tabla appcc_oil_events ya existía sin esta columna.

alter table public.appcc_oil_events
  add column if not exists operator_name text not null default '';
