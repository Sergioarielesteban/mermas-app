-- Migración: permitir litros opcionales en eventos tipo «filtrado»
-- Ejecutar en Supabase → SQL Editor si la tabla ya existía con
-- appcc_oil_events_filtrado_liters_chk (filtrado solo con liters_used null).

alter table public.appcc_oil_events
  drop constraint if exists appcc_oil_events_filtrado_liters_chk;

alter table public.appcc_oil_events
  drop constraint if exists appcc_oil_events_liters_nonneg_chk;

alter table public.appcc_oil_events
  add constraint appcc_oil_events_liters_nonneg_chk
  check (liters_used is null or liters_used >= 0);
