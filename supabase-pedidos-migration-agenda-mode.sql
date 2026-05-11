-- Modo de aparición en «Agenda de hoy»: corte obligatorio vs solo checklist de revisión.
-- Ejecutar en Supabase SQL Editor.

alter table public.pedido_supplier_order_schedules
  add column if not exists agenda_mode text;

update public.pedido_supplier_order_schedules
set agenda_mode = 'mandatory'
where agenda_mode is null;

alter table public.pedido_supplier_order_schedules
  alter column agenda_mode set default 'mandatory';

alter table public.pedido_supplier_order_schedules
  alter column agenda_mode set not null;

alter table public.pedido_supplier_order_schedules
  drop constraint if exists pedido_supplier_order_schedules_agenda_mode_check;

alter table public.pedido_supplier_order_schedules
  add constraint pedido_supplier_order_schedules_agenda_mode_check
  check (agenda_mode in ('mandatory', 'review'));

comment on column public.pedido_supplier_order_schedules.agenda_mode is
  'mandatory: bloque «Pedidos obligatorios» con hora límite. review: solo «Revisar proveedores» (sin corte).';
