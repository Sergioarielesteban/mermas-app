-- 15 productos para SERHS, S.L. (catálogo pedido_supplier_products)
-- Ejecutar en Supabase SQL Editor.
--
-- Ajusta solo si tu local o proveedor SERHS tienen otro UUID:
--   local_id    = tu public.locals.id
--   supplier_id = fila SERHS en pedido_suppliers para ese local
--
-- Unidades: CAJA → caja | BARRIL → ud (1 ud = 1 barril; precio = €/barril)
-- IVA catálogo: 0 (ajusta en app/proveedores si usáis otro %)

begin;

-- Mataró / ejemplo del proyecto (cámbialo si aplica)
with const as (
  select
    '74cdaba5-b714-47e9-811d-8de14d531a20'::uuid as local_id,
    '4057278a-9c4c-439a-945f-9852e73f0e4e'::uuid as supplier_id
),
rows (name, unit, price_per_unit) as (
  values
    ('FREE DAMM BARRIL 20L.', 'ud', 53.86::numeric),
    ('FREE DAMM LEMON C/24', 'caja', 12.88::numeric),
    ('FREE DAMM TOSTADA 1/3 LATA', 'caja', 12.88::numeric),
    ('AGUA VERI 1/2 C/24', 'caja', 5.33::numeric),
    ('CACAOLAT ORIGINAL C/24', 'caja', 23.95::numeric),
    ('DAMM LEMON BARRIL 30', 'ud', 63.08::numeric),
    ('TURIA BARRIL 30L.', 'ud', 62.20::numeric),
    ('VOLL DAMM 1/3 LATA', 'caja', 17.36::numeric),
    ('ESTRELLA DAMM 1/3 LATA', 'caja', 14.65::numeric),
    ('DAURA DAMM 1/3 C/24', 'caja', 24.49::numeric),
    ('AK DAMM 1/3', 'caja', 27.39::numeric),
    ('LECHE AVENA LEVATINA 1L C/6', 'caja', 8.51::numeric),
    ('LECHE ENTERA LETONA 1,5L C/6', 'caja', 9.58::numeric),
    ('LECHE SOJA LEVATINA 1L. C/6', 'caja', 8.72::numeric),
    ('LECHE SIN LACTOSA SEMIDESNATADA C/6 LETONA', 'caja', 8.36::numeric)
)
insert into public.pedido_supplier_products (
  local_id,
  supplier_id,
  name,
  unit,
  price_per_unit,
  vat_rate,
  units_per_pack,
  is_active,
  par_stock
)
select
  c.local_id,
  c.supplier_id,
  r.name,
  r.unit,
  round(r.price_per_unit, 2),
  0::numeric,
  1::numeric,
  true,
  0::numeric
from const c
cross join rows r
where not exists (
  select 1
  from public.pedido_supplier_products p
  where p.local_id = c.local_id
    and p.supplier_id = c.supplier_id
    and trim(p.name) = trim(r.name)
);

commit;

-- Comprobar (debería sumar 15 filas con esos nombres bajo SERHS en el local):
-- select count(*) from public.pedido_supplier_products p
-- join public.pedido_suppliers s on s.id = p.supplier_id
-- where p.local_id = '74cdaba5-b714-47e9-811d-8de14d531a20'
--   and s.name = 'SERHS, S.L.';
