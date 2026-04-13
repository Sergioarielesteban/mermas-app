-- =============================================================================
-- Leads desde la web pública (landing Chef-One)
-- =============================================================================
-- La app guarda filas vía API con SUPABASE_SERVICE_ROLE_KEY (sin exponer al cliente).
-- Ejecutar en Supabase SQL Editor.
-- =============================================================================

create table if not exists public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text,
  email text not null,
  phone text,
  restaurant_name text,
  message text,
  source text not null default 'chef-one-landing'
);

create index if not exists idx_marketing_leads_created_at on public.marketing_leads (created_at desc);

alter table public.marketing_leads enable row level security;

-- Sin políticas para anon/authenticated: solo el service role (API server) inserta/consulta.

comment on table public.marketing_leads is 'Solicitudes de contacto desde la landing; escritura vía service role.';
