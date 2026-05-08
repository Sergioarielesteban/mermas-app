-- Días de reparto por proveedor (0=dom … 6=sáb, mismo criterio que Date.getDay() en JS).
-- Vacío {} = en pedidos se asume cobertura de 7 días para escalar el PAR semanal.

alter table public.pedido_suppliers
  add column if not exists delivery_cycle_weekdays smallint[] not null default '{}';

comment on column public.pedido_suppliers.delivery_cycle_weekdays is
  'Días de entrega habituales (0=dom..6=sáb). Vacío = referencia semanal 7 días en sugerencias de pedido.';
