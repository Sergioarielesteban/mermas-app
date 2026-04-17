create table if not exists public.mermas_snapshots (
  email text primary key,
  products jsonb not null default '[]'::jsonb,
  -- Legado: la app ya no sincroniza mermas por email (solo catálogo). Mantener columna por compatibilidad.
  mermas jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.mermas_snapshots enable row level security;

drop policy if exists "service_role_only" on public.mermas_snapshots;
create policy "service_role_only"
on public.mermas_snapshots
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
