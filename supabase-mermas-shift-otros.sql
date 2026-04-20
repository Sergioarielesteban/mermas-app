-- Mermas: turno y etiqueta opcional + motivo "otros-motivos"
-- Ejecutar en Supabase SQL editor cuando despliegues estos cambios.

alter table public.mermas drop constraint if exists mermas_motive_key_check;

alter table public.mermas add constraint mermas_motive_key_check check (
  motive_key in (
    'se-quemo',
    'mal-estado',
    'cliente-cambio',
    'error-cocina',
    'sobras-marcaje',
    'cancelado',
    'otros-motivos'
  )
);

alter table public.mermas add column if not exists shift text;

alter table public.mermas drop constraint if exists mermas_shift_check;

alter table public.mermas add constraint mermas_shift_check check (
  shift is null or shift in ('manana', 'tarde')
);

alter table public.mermas add column if not exists optional_user_label text;

comment on column public.mermas.shift is 'Opcional: mañana / tarde (dato local, no obligatorio).';
comment on column public.mermas.optional_user_label is 'Opcional: quién registra o nota libre para análisis.';
